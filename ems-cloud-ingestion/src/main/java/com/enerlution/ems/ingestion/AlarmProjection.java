package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.WireMessage;
import java.sql.*;

/** Event history and normalized refresh demand share the reliable package transaction. */
public final class AlarmProjection {
 public boolean current(javax.sql.DataSource source,IngressEnvelope envelope) {
  final WireMessage m;
  try {
   m=new com.enerlution.ems.protocol.WireDecoder().decode(envelope.sourceTopic(),envelope.rawBody().getBytes(java.nio.charset.StandardCharsets.UTF_8));
   if(!m.type().equals("alarm_current")||!m.emsId().equals(envelope.emsId())||!m.canonicalHash().equals(envelope.canonicalHash())||!m.channel().equals(envelope.channel())||!m.type().equals(envelope.type()))return true;
  }catch(RuntimeException invalid){return true;}
  for(int attempt=0;attempt<3;attempt++)try(var c=source.getConnection()) {
   c.setAutoCommit(false);
   try {
    ReliableMessageStore.lock(c,m.emsId().toString());long period;
    try(var q=c.prepareStatement("SELECT b.id FROM connection_state s JOIN ems_binding_period b USING(ems_uuid) WHERE s.ems_uuid=?::uuid AND s.connection_id=?::uuid AND s.fencing_token=? AND s.lease_until>clock_timestamp() AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) AND ? >=b.valid_from AND (b.valid_to IS NULL OR ?<b.valid_to) FOR UPDATE OF s")) {
     q.setString(1,m.emsId().toString());q.setString(2,m.body().get("connectionId").asText());q.setBigDecimal(3,new java.math.BigDecimal(envelope.fencingToken()));q.setTimestamp(4,Timestamp.from(envelope.receivedAt()));q.setTimestamp(5,Timestamp.from(envelope.receivedAt()));try(var r=q.executeQuery()){if(!r.next()){c.rollback();return true;}period=r.getLong(1);}
    }
    // Unknown is not a new empty list, and cannot counterfeit an observed snapshot.
    if(m.body().get("alarms").isNull()){c.commit();return true;}
    int cabinet=m.body().get("c").intValue();
    try(var q=c.prepareStatement("SELECT 1 FROM alarm_current_snapshot WHERE ems_uuid=?::uuid AND cabinet_no=? AND binding_period_id=? AND connection_id=?::uuid AND seq>=?")) {
     q.setString(1,m.emsId().toString());q.setInt(2,cabinet);q.setLong(3,period);q.setString(4,m.body().get("connectionId").asText());q.setBigDecimal(5,m.body().get("seq").decimalValue());try(var r=q.executeQuery()){if(r.next()){c.commit();return true;}}
    }
    try(var q=c.prepareStatement("DELETE FROM alarm_current_snapshot WHERE ems_uuid=?::uuid AND cabinet_no=?")){q.setString(1,m.emsId().toString());q.setInt(2,cabinet);q.executeUpdate();}
    try(var q=c.prepareStatement("INSERT INTO alarm_current_snapshot(ems_uuid,cabinet_no,binding_period_id,connection_id,seq,known,observed_at) VALUES(?::uuid,?,?,?::uuid,?,true,?)")){q.setString(1,m.emsId().toString());q.setInt(2,cabinet);q.setLong(3,period);q.setString(4,m.body().get("connectionId").asText());q.setBigDecimal(5,m.body().get("seq").decimalValue());q.setTimestamp(6,Timestamp.from(envelope.receivedAt()));q.executeUpdate();}
    for(var alarm:m.body().get("alarms")) {
     identity(c,m.emsId().toString(),alarm.get("alarmId").asText());
     try(var q=c.prepareStatement("INSERT INTO alarm_current_member(ems_uuid,cabinet_no,connection_id,seq,alarm_id) VALUES(?::uuid,?,?::uuid,?,?::uuid)")){q.setString(1,m.emsId().toString());q.setInt(2,cabinet);q.setString(3,m.body().get("connectionId").asText());q.setBigDecimal(4,m.body().get("seq").decimalValue());q.setString(5,alarm.get("alarmId").asText());q.executeUpdate();}
    }
    c.commit();return true;
   }catch(SQLException e){c.rollback();throw e;}
  }catch(SQLException e){if(attempt<2&&("40001".equals(e.getSQLState())||"40P01".equals(e.getSQLState())))continue;return false;}
  return false;
 }
 void event(Connection c,long messageId,long period,WireMessage m) throws SQLException {
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
