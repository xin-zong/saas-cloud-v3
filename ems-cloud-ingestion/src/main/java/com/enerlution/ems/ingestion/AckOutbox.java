package com.enerlution.ems.ingestion;
import com.enerlution.ems.protocol.WireMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import javax.sql.DataSource;
import java.sql.*;
import java.time.Duration;
import java.util.UUID;
import java.math.BigDecimal;

/** Durable single-item claim; crashed publishers are reclaimed after the database lease expires. */
public final class AckOutbox {
 @FunctionalInterface public interface Publisher {void publish(String topic,byte[] payload) throws Exception;}
 private final DataSource source; private final Publisher publisher; private final String owner=UUID.randomUUID().toString();
 public AckOutbox(DataSource source,Publisher publisher){this.source=source;this.publisher=publisher;}
 static String topic(WireMessage message){return "ems/v1/"+message.emsId()+"/down/ack";}
 static byte[] payload(WireMessage message,String error) {
  var node=new ObjectMapper().createObjectNode();node.put("v",1);node.put("type",message.type());
  if(message.type().equals("important_history")){node.set("taskId",message.body().get("taskId"));node.set("part",message.body().get("part"));}
  else if(message.type().equals("alarm_event")||message.type().equals("alarm_data")){node.set("alarmId",message.body().get("alarmId"));if(message.type().equals("alarm_event"))node.set("seq",message.body().get("seq"));else node.putNull("seq");}
  else throw new IllegalArgumentException("No business ACK for this type");
  if(error!=null){if(!error.equals("busy")&&!error.equals("rejected"))throw new IllegalArgumentException("Invalid ACK error");node.put("error",error);}
  try{return new ObjectMapper().writeValueAsBytes(node);}catch(Exception e){throw new IllegalStateException("ACK encoding failed",e);}
 }
 static void enqueue(Connection c,long messageId,WireMessage message) throws SQLException {
  // A later duplicate must request a fresh ACK even after the original row was sent.
  try(var q=c.prepareStatement("INSERT INTO outbox(ems_uuid,type,reliable_message_id,topic,payload) VALUES(?::uuid,'saved_ack',?,?,?) ON CONFLICT(reliable_message_id) DO UPDATE SET status='pending',next_attempt_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL,fencing_token=outbox.fencing_token+1")) {
   q.setString(1,message.emsId().toString());q.setLong(2,messageId);q.setString(3,topic(message));q.setBytes(4,payload(message,null));q.executeUpdate();
  }
 }
 public boolean publishNext() throws SQLException {
  long id;String topic;byte[] bytes;BigDecimal fence;
  try(var c=source.getConnection()) {
   c.setAutoCommit(false);
   try(var q=c.prepareStatement("WITH candidate AS (SELECT id FROM outbox WHERE type='saved_ack' AND next_attempt_at<=clock_timestamp() AND (status='pending' OR (status='sending' AND lease_until<=clock_timestamp())) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE outbox o SET status='sending',attempts=attempts+1,lease_owner=?,lease_until=clock_timestamp()+interval '30 seconds',fencing_token=fencing_token+1 FROM candidate WHERE o.id=candidate.id RETURNING o.id,o.topic,o.payload,o.fencing_token")) {
    q.setQueryTimeout(5);q.setString(1,owner);try(var r=q.executeQuery()){if(!r.next()){c.commit();return false;}id=r.getLong(1);topic=r.getString(2);bytes=r.getBytes(3);fence=r.getBigDecimal(4);}c.commit();
   }catch(SQLException e){c.rollback();throw e;}
  }
  boolean sent=false;try{publisher.publish(topic,bytes);sent=true;}catch(Exception failure){if(failure instanceof InterruptedException)Thread.currentThread().interrupt();}
  try(var c=source.getConnection();var q=c.prepareStatement("UPDATE outbox SET status=?,lease_owner=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(60,attempts)) WHERE id=? AND lease_owner=? AND fencing_token=?")) {
   q.setQueryTimeout(5);q.setString(1,sent?"sent":"pending");q.setLong(2,id);q.setString(3,owner);q.setBigDecimal(4,fence);q.executeUpdate();
  }
  return true;
 }
}
