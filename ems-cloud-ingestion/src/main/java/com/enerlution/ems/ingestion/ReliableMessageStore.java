package com.enerlution.ems.ingestion;

import javax.sql.DataSource;
import com.enerlution.ems.protocol.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.sql.*;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;

/** PostgreSQL is the reliable business acceptance boundary. */
public final class ReliableMessageStore {
 public enum Outcome { SAVED, DUPLICATE, REJECTED, BUSY }
 private final DataSource source;
 private final TransportDiagnostics diagnostics;
 public ReliableMessageStore(DataSource source) {this(source,new TransportDiagnostics());}
 public ReliableMessageStore(DataSource source,TransportDiagnostics diagnostics) {this.source=source;this.diagnostics=diagnostics;}
 public Outcome accept(IngressEnvelope envelope) {
  final WireMessage message;
  try {
   message=decode(envelope);
   if(envelope.lane()!=IngressEnvelope.Lane.RELIABLE)throw new IllegalArgumentException("Not a reliable object");
   sourceTime(message.body(),message.type());
  }catch(ProtocolException|IllegalArgumentException|ArithmeticException e){return Outcome.REJECTED;}
  for(int attempt=0;attempt<3;attempt++)try(var c=source.getConnection()) {
   c.setAutoCommit(false);
   try {
    lock(c,message.emsId().toString());
    var period=authority(c,envelope);
    var existing=existing(c,message);
    if(existing!=null) {
     if(!existing.hash.equals(message.canonicalHash()))throw new Rejected();
     AckOutbox.enqueue(c,existing.id,message);c.commit();return Outcome.DUPLICATE;
    }
    requireSourceRange(message,period);
    if(message.type().equals("important_history"))checkParts(c,message);
    long id=insert(c,period.id,message,envelope);
    if(message.type().equals("important_history"))new HistoryIdentityStore().save(c,id,message);
    if(message.type().equals("alarm_event"))new AlarmProjection().event(c,id,period.id,message);
    AckOutbox.enqueue(c,id,message);c.commit();return Outcome.SAVED;
   }catch(SourceOutsideBinding e){diagnostics.record(TransportDiagnostics.Signal.ADMISSION_REJECTION);c.rollback();return Outcome.REJECTED;}
   catch(Rejected|IllegalArgumentException|ArithmeticException e){c.rollback();return Outcome.REJECTED;}
   catch(SQLException e){c.rollback();throw e;}
  }catch(SQLException e){
   if(attempt<2&&("40001".equals(e.getSQLState())||"40P01".equals(e.getSQLState())))continue;
   if("22003".equals(e.getSQLState())||"22008".equals(e.getSQLState())||"23514".equals(e.getSQLState()))return Outcome.REJECTED;
   return Outcome.BUSY;
  }
  return Outcome.BUSY;
 }
 static WireMessage decode(IngressEnvelope e) {
  if(e==null||e.rawBody()==null||e.rawBody().length()>131072||e.receivedAt()==null||e.fencingToken()==null||e.fencingToken().signum()<0)throw new IllegalArgumentException("Invalid ingress envelope");
  var w=new WireDecoder().decode(e.sourceTopic(),e.rawBody().getBytes(StandardCharsets.UTF_8));
  if(!w.emsId().equals(e.emsId())||!w.channel().equals(e.channel())||!w.type().equals(e.type())||!w.canonicalHash().equals(e.canonicalHash()))throw new IllegalArgumentException("Ingress envelope mismatch");
  return w;
 }
 public Outcome acceptCurrent(IngressEnvelope envelope){return new AlarmProjection().current(source,envelope)?Outcome.SAVED:Outcome.BUSY;}
 static void lock(Connection c,String ems) throws SQLException {
  try(var q=c.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?::text,78291029))")){q.setQueryTimeout(5);q.setString(1,ems);q.execute();}
 }
 private record Binding(long id,Instant from,Instant to) {}
 private Binding authority(Connection c,IngressEnvelope e) throws SQLException {
  try(var q=c.prepareStatement("SELECT b.id,b.valid_from,b.valid_to FROM connection_state s JOIN ems_binding_period b USING(ems_uuid) WHERE s.ems_uuid=?::uuid AND s.fencing_token=? AND s.lease_until>clock_timestamp() AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) AND ? >=b.valid_from AND (b.valid_to IS NULL OR ?<b.valid_to) FOR UPDATE OF s")){
   q.setQueryTimeout(5);q.setString(1,e.emsId().toString());q.setBigDecimal(2,new BigDecimal(e.fencingToken()));q.setTimestamp(3,Timestamp.from(e.receivedAt()));q.setTimestamp(4,Timestamp.from(e.receivedAt()));try(var r=q.executeQuery()){if(!r.next())throw new Rejected();var to=r.getTimestamp(3);return new Binding(r.getLong(1),r.getTimestamp(2).toInstant(),to==null?null:to.toInstant());}
  }
 }
 private static void requireSourceRange(WireMessage m,Binding period) {
  var b=m.body();
  // History ts is only a compression anchor. Authorization follows actual ts+offset samples.
  if(!m.type().equals("important_history"))within(sourceTime(b,m.type()),period);
  if(m.type().equals("important_history"))for(var row:b.get("data"))within(Instant.ofEpochMilli(b.get("ts").bigIntegerValue().add(row.get(0).bigIntegerValue()).longValueExact()),period);
  if(m.type().equals("alarm_data"))within(Instant.ofEpochMilli(b.get("start").bigIntegerValue().add(b.get("step").bigIntegerValue().multiply(java.math.BigInteger.valueOf(b.get("data").size()-1L))).longValueExact()),period);
 }
 private static void within(Instant time,Binding period){if(time.isBefore(period.from)||(period.to!=null&&!time.isBefore(period.to)))throw new SourceOutsideBinding();}
 private static final class SourceOutsideBinding extends RuntimeException {}
 private record Existing(long id,String hash) {}
 private Existing existing(Connection c,WireMessage m) throws SQLException {
  String predicate=switch(m.type()){case "alarm_event"->"alarm_id=?::uuid AND seq=?";case "alarm_data"->"alarm_id=?::uuid";default->"task_id=?::uuid AND part=?";};
  try(var q=c.prepareStatement("SELECT id,content_hash FROM reliable_message WHERE ems_uuid=?::uuid AND type=? AND "+predicate)) {
   q.setString(1,m.emsId().toString());q.setString(2,m.type());q.setString(3,m.body().path(m.type().equals("important_history")?"taskId":"alarmId").asText());
   if(!m.type().equals("alarm_data"))q.setBigDecimal(4,m.body().path(m.type().equals("important_history")?"part":"seq").decimalValue());
   try(var r=q.executeQuery()){return r.next()?new Existing(r.getLong(1),r.getString(2)):null;}
  }
 }
 private void checkParts(Connection c,WireMessage m) throws SQLException {
  try(var q=c.prepareStatement("SELECT 1 FROM reliable_message WHERE ems_uuid=?::uuid AND task_id=?::uuid AND parts<>?")){q.setString(1,m.emsId().toString());q.setString(2,m.body().path("taskId").asText());q.setBigDecimal(3,m.body().get("parts").decimalValue());try(var r=q.executeQuery()){if(r.next())throw new Rejected();}}
 }
 private long insert(Connection c,long period,WireMessage m,IngressEnvelope e) throws SQLException {
  var b=m.body();try(var q=c.prepareStatement("INSERT INTO reliable_message(ems_uuid,binding_period_id,type,alarm_id,seq,task_id,part,parts,source_at,received_at,raw_payload,content_hash,status) VALUES(?::uuid,?,?,?::uuid,?,?::uuid,?,?,?,?,?,?,'saved') RETURNING id")) {
   q.setString(1,m.emsId().toString());q.setLong(2,period);q.setString(3,m.type());q.setString(4,b.has("alarmId")?b.get("alarmId").textValue():null);number(q,5,b.get("seq"));q.setString(6,b.has("taskId")?b.get("taskId").textValue():null);number(q,7,b.get("part"));number(q,8,b.get("parts"));q.setTimestamp(9,Timestamp.from(sourceTime(b,m.type())));q.setTimestamp(10,Timestamp.from(e.receivedAt()));q.setBytes(11,e.rawBody().getBytes(StandardCharsets.UTF_8));q.setString(12,m.canonicalHash());try(var r=q.executeQuery()){r.next();return r.getLong(1);}
  }
 }
 private static void number(PreparedStatement q,int index,JsonNode n) throws SQLException {if(n==null)q.setNull(index,Types.NUMERIC);else q.setBigDecimal(index,n.decimalValue());}
 static Instant sourceTime(JsonNode b,String type){return Instant.ofEpochMilli(b.get(type.equals("alarm_data")?"start":"ts").bigIntegerValue().longValueExact());}
 static final class Rejected extends RuntimeException {}
}
