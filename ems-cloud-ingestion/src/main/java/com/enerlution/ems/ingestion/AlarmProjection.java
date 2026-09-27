package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.WireMessage;
import java.sql.*;

/** Event history and normalized refresh demand share the reliable package transaction. */
public final class AlarmProjection {
 private String recoveryEms,recoveryAlarm;
 private long nextRecoveryNanos;
 /** One identity per 250 ms; cursor progress prevents unresolved sources starving mapped alarms. */
 boolean recoverBusiness(javax.sql.DataSource source) {
  long now=System.nanoTime();if(now<nextRecoveryNanos)return false;nextRecoveryNanos=now+250_000_000L;
  String ems,alarm;
  try(var c=source.getConnection();var q=c.prepareStatement("SELECT ems_uuid,alarm_id FROM ems_alarm_identity WHERE (?::uuid IS NULL OR (ems_uuid,alarm_id)>(?::uuid,?::uuid)) ORDER BY ems_uuid,alarm_id LIMIT 1")) {
   q.setQueryTimeout(5);q.setString(1,recoveryEms);q.setString(2,recoveryEms);q.setString(3,recoveryAlarm);
   try(var r=q.executeQuery()){if(!r.next()){recoveryEms=null;recoveryAlarm=null;return false;}ems=r.getString(1);alarm=r.getString(2);}
  }catch(Exception failure){StateTransaction.recordFailure(failure);return false;}
  boolean success=StateTransaction.run(source,ems,c->projectOne(c,ems,alarm));
  if(success){recoveryEms=ems;recoveryAlarm=alarm;}return success;
 }
 /** Test/administrative batch entry; production recovery advances a cursor per identity. */
 static int projectBusiness(Connection c,String ems)throws Exception {
  ReliableMessageStore.lock(c,ems);var ids=new java.util.ArrayList<String>();
  try(var q=c.prepareStatement("SELECT alarm_id FROM ems_alarm_identity WHERE ems_uuid=?::uuid ORDER BY alarm_id LIMIT 32")) {
   q.setString(1,ems);try(var r=q.executeQuery()){while(r.next())ids.add(r.getString(1));}
  }
  int created=0;for(String id:ids)if(projectOne(c,ems,id))created++;return created;
 }
 private record Evidence(long period,java.math.BigDecimal seq,String code,Integer level,String state,
    com.fasterxml.jackson.databind.JsonNode device,Timestamp source,String kind) {}
 private static Evidence evidence(ResultSet r)throws Exception {
  return new Evidence(r.getLong("binding_period_id"),r.getBigDecimal("seq"),r.getString("code"),
    (Integer)r.getObject("level"),r.getString("state"),new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.getString("device")),r.getTimestamp("source_at"),r.getString("evidence_kind"));
 }
 /** Caller holds EMS lock. Protocol ACK is deliberately absent from business handling. */
 static boolean projectOne(Connection c,String ems,String external)throws Exception {
  Long business,binding;String existingCode;
  try(var q=c.prepareStatement("SELECT i.business_alarm_id,i.business_device_binding_id,a.code FROM ems_alarm_identity i LEFT JOIN alarm a ON a.id=i.business_alarm_id WHERE i.ems_uuid=?::uuid AND i.alarm_id=?::uuid FOR UPDATE OF i")) {
   q.setString(1,ems);q.setString(2,external);try(var r=q.executeQuery()){if(!r.next())return false;business=(Long)r.getObject(1);binding=(Long)r.getObject(2);existingCode=r.getString(3);}
  }
  Evidence first;
  try(var q=c.prepareStatement("SELECT * FROM ems_alarm_evidence WHERE ems_uuid=?::uuid AND alarm_id=?::uuid AND evidence_kind IN ('event','current') ORDER BY CASE WHEN evidence_kind='event' THEN 0 ELSE 1 END,seq,received_at LIMIT 1")) {
   q.setString(1,ems);q.setString(2,external);try(var r=q.executeQuery()){if(!r.next())return false;first=evidence(r);}
  }
  long originalPeriod=first.period;
  if(binding!=null)try(var q=c.prepareStatement("SELECT binding_period_id FROM device_binding WHERE id=?")) {
   q.setLong(1,binding);try(var r=q.executeQuery()){if(!r.next())throw new SQLException("Business origin missing");originalPeriod=r.getLong(1);}
  }
  Evidence latest;
  try(var q=c.prepareStatement("SELECT * FROM ems_alarm_evidence WHERE ems_uuid=?::uuid AND alarm_id=?::uuid AND binding_period_id=? AND evidence_kind IN ('event','current') ORDER BY seq DESC,CASE WHEN evidence_kind='event' THEN 0 ELSE 1 END,received_at DESC LIMIT 1")) {
   q.setString(1,ems);q.setString(2,external);q.setLong(3,originalPeriod);try(var r=q.executeQuery()){if(!r.next())return false;latest=evidence(r);}
  }
  if(latest.level==null||latest.level<1||latest.level>3)return false;
  // Different code/physical position on the same alarm identity is unresolved evidence, not retargeting.
  if(first.period!=originalPeriod||!first.code.equals(latest.code)||!first.device.equals(latest.device)
    ||existingCode!=null&&!existingCode.equals(first.code))return false;
  var position=first.device;String type=position.path("type").asText();
  if(!java.util.Set.of("ems","emu","bms","bmu","pcs","dcdc","tms","meter").contains(type))return false;
  Integer cabinet=position.path("c").isNull()?null:position.path("c").intValue();
  String scope=cabinet!=null?"cabinet":type.equals("ems")?"ems":"public";
  var matches=new java.util.ArrayList<long[]>();
  try(var q=c.prepareStatement("""
   SELECT d.id,d.device_id FROM device_binding d JOIN ems_binding_period p ON p.id=d.binding_period_id
   WHERE d.binding_period_id=? AND p.ems_uuid=?::uuid AND d.scope=? AND d.role=?
     AND d.cabinet_no IS NOT DISTINCT FROM ?::smallint
     AND (?::numeric IS NULL OR d.local_no=?::numeric)
     AND d.valid_from<=? AND (d.valid_to IS NULL OR d.valid_to>?) ORDER BY d.id LIMIT 2
   """)) {
   q.setLong(1,originalPeriod);q.setString(2,ems);q.setString(3,scope);q.setString(4,type);
   if(cabinet==null)q.setNull(5,Types.SMALLINT);else q.setInt(5,cabinet);
   var local=position.path("id").isNull()?null:position.path("id").decimalValue();
   q.setBigDecimal(6,local);q.setBigDecimal(7,local);q.setTimestamp(8,first.source);q.setTimestamp(9,first.source);
   try(var r=q.executeQuery()){while(r.next())matches.add(new long[]{r.getLong(1),r.getLong(2)});}
  }
  if(matches.size()!=1||binding!=null&&binding!=matches.getFirst()[0])return false;
  String severity=latest.level==1?"warning":"critical";boolean created=false;
  if(business==null) {
   // An existing unrelated legacy row is never commandeered on the strength of matching time/code.
   try(var q=c.prepareStatement("INSERT INTO alarm(device_id,code,title,severity,occurred_at,recovered_at) VALUES(?,?,?,?,?,?) ON CONFLICT(device_id,code,occurred_at) DO NOTHING RETURNING id")) {
    q.setLong(1,matches.getFirst()[1]);q.setString(2,first.code);q.setString(3,"EMS 告警 "+first.code);q.setString(4,severity);q.setTimestamp(5,first.source);
    q.setTimestamp(6,latest.state.equals("cleared")&&!latest.source.before(first.source)?latest.source:null);
    try(var r=q.executeQuery()){if(!r.next())return false;business=r.getLong(1);}
   }
   try(var q=c.prepareStatement("UPDATE ems_alarm_identity SET business_alarm_id=?,business_device_binding_id=? WHERE ems_uuid=?::uuid AND alarm_id=?::uuid")) {
    q.setLong(1,business);q.setLong(2,matches.getFirst()[0]);q.setString(3,ems);q.setString(4,external);q.executeUpdate();
   }
   created=true;
  } else {
   // Sequence-selected events update business recovery, never a stale last-known snapshot or another period.
   try(var q=c.prepareStatement("UPDATE alarm SET severity=?,recovered_at=CASE WHEN ?='cleared' AND ?>=occurred_at THEN ? WHEN ?='active' THEN NULL ELSE recovered_at END WHERE id=?")) {
    q.setString(1,severity);q.setString(2,latest.state);q.setTimestamp(3,latest.source);q.setTimestamp(4,latest.source);q.setString(5,latest.state);q.setLong(6,business);q.executeUpdate();
   }
  }
  return created;
 }
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
