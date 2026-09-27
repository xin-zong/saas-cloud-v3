package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.WireMessage;
import java.sql.*;

/** Event history and normalized refresh demand share the reliable package transaction. */
public final class AlarmProjection {
 public boolean current(javax.sql.DataSource source,IngressEnvelope envelope) {
  final WireMessage m;
  try {m=ReliableMessageStore.decode(envelope);if(!m.type().equals("alarm_current"))return true;}
  catch(RuntimeException invalid){return true;}
  return StateTransaction.run(source,envelope.emsId().toString(),c->{
   Long period=StateTransaction.admission(c,envelope,true);
   if(period!=null)storeCurrent(c,period,envelope,m);
  });
 }
 static boolean storeCurrent(Connection c,long period,IngressEnvelope envelope,WireMessage m)throws Exception {
  var n=m.body();String ems=m.emsId().toString(),connection=n.path("connectionId").asText();int cabinet=n.path("c").intValue();
  var identities=new java.util.HashSet<String>();
  if(!n.path("alarms").isNull())for(var alarm:n.path("alarms"))
   if(!identities.add(alarm.path("alarmId").asText()))return false;
  try(var q=c.prepareStatement("SELECT 1 FROM connection_state WHERE ems_uuid=?::uuid AND connection_id=?::uuid")) {
   q.setString(1,ems);q.setString(2,connection);try(var r=q.executeQuery()){if(!r.next())return false;}
  }
  var preserved=new java.util.ArrayList<com.fasterxml.jackson.databind.JsonNode>();
  try(var q=c.prepareStatement("SELECT binding_period_id,connection_id,seq,content_hash FROM alarm_current_snapshot WHERE ems_uuid=?::uuid AND cabinet_no=?")) {
   q.setString(1,ems);q.setInt(2,cabinet);try(var r=q.executeQuery()){if(r.next()) {
    if(r.getLong(1)==period && r.getString(2).equals(connection)) {
     int order=n.path("seq").decimalValue().compareTo(r.getBigDecimal(3));
     if(order<0)return false;
     if(order==0)return m.canonicalHash().equals(r.getString(4));
    }
    if(r.getLong(1)==period && n.path("alarms").isNull()) {
     try(var members=c.prepareStatement("SELECT record::text FROM alarm_current_member WHERE ems_uuid=?::uuid AND cabinet_no=?")) {
      members.setString(1,ems);members.setInt(2,cabinet);try(var rows=members.executeQuery()){while(rows.next())preserved.add(new com.fasterxml.jackson.databind.ObjectMapper().readTree(rows.getString(1)));}
     }
    }
   }}
  }
  try(var q=c.prepareStatement("DELETE FROM alarm_current_snapshot WHERE ems_uuid=?::uuid AND cabinet_no=?")){q.setString(1,ems);q.setInt(2,cabinet);q.executeUpdate();}
  try(var q=c.prepareStatement("INSERT INTO alarm_current_snapshot(ems_uuid,cabinet_no,binding_period_id,connection_id,seq,known,observed_at,content_hash) VALUES(?::uuid,?,?,?::uuid,?,?,?,?)")) {
   q.setString(1,ems);q.setInt(2,cabinet);q.setLong(3,period);q.setString(4,connection);q.setBigDecimal(5,n.path("seq").decimalValue());q.setBoolean(6,!n.path("alarms").isNull());q.setTimestamp(7,Timestamp.from(envelope.receivedAt()));q.setString(8,m.canonicalHash());q.executeUpdate();
  }
  if(!n.path("alarms").isNull())n.path("alarms").forEach(preserved::add);
  for(var alarm:preserved) {
   identity(c,ems,alarm.path("alarmId").asText());
   try(var q=c.prepareStatement("INSERT INTO alarm_current_member(ems_uuid,cabinet_no,connection_id,seq,alarm_id,record) VALUES(?::uuid,?,?::uuid,?,?::uuid,?::jsonb)")) {
    q.setString(1,ems);q.setInt(2,cabinet);q.setString(3,connection);q.setBigDecimal(4,n.path("seq").decimalValue());q.setString(5,alarm.path("alarmId").asText());q.setString(6,alarm.toString());q.executeUpdate();
   }
  }
  return true;
 } void event(Connection c,long messageId,long period,WireMessage m) throws SQLException {
  var alarm=m.body().get("alarmId").asText();identity(c,m.emsId().toString(),alarm);
  try(var q=c.prepareStatement("INSERT INTO ems_alarm_event(ems_uuid,alarm_id,seq,reliable_message_id) VALUES(?::uuid,?::uuid,?,?)")){q.setString(1,m.emsId().toString());q.setString(2,alarm);q.setBigDecimal(3,m.body().get("seq").decimalValue());q.setLong(4,messageId);q.executeUpdate();}
  requireRefresh(c,period,m.body().path("device").get("c").isNull()?null:m.body().path("device").get("c").intValue());
 }
 static void identity(Connection c,String ems,String alarm) throws SQLException {try(var q=c.prepareStatement("INSERT INTO ems_alarm_identity(ems_uuid,alarm_id) VALUES(?::uuid,?::uuid) ON CONFLICT DO NOTHING")){q.setString(1,ems);q.setString(2,alarm);q.executeUpdate();}}
 /** Called under the EMS advisory transaction lock. Query completion must never clear this demand. */
 static void requireRefresh(Connection c,long period,Integer cabinet) throws SQLException {
  try(var q=c.prepareStatement("INSERT INTO alarm_refresh_demand(binding_period_id,cabinet_no,pending) VALUES(?,?,true) ON CONFLICT(binding_period_id,cabinet_no) DO UPDATE SET pending=true")){q.setLong(1,period);if(cabinet==null)q.setNull(2,Types.SMALLINT);else q.setInt(2,cabinet);q.executeUpdate();}
 }
}
