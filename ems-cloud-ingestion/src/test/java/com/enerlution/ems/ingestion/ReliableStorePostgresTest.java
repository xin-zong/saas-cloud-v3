package com.enerlution.ems.ingestion;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.postgresql.ds.PGSimpleDataSource;
import java.time.*;
import java.math.BigInteger;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

/** Requires root's isolated, migrated fixtures; never creates or resets business relations. */
@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
class ReliableStorePostgresTest {
 static final UUID EMS=UUID.fromString("755facdc-9bdf-43d0-9412-c94f860a01ec");
 static final String TASK="47d99f91-74e4-4738-aaab-17fc1550978c";
 PGSimpleDataSource source; ReliableMessageStore store; BigInteger fence;
 @BeforeEach void setup() throws Exception {
  source=new PGSimpleDataSource();source.setURL(System.getenv("EMS_TEST_DB_URL"));source.setUser(System.getenv("EMS_TEST_DB_USER"));source.setPassword(System.getenv("EMS_TEST_DB_PASSWORD"));source.setCurrentSchema("ems_ingestion_tests,public");
  try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT current_database(),current_user")) {assertTrue(r.next());assertEquals("ems_cloud_v2_proto",r.getString(1));assertEquals("ems_ingestion_test",r.getString(2));}
  try(var c=source.getConnection();var s=c.createStatement()) {for(String table:new String[]{"outbox","query_request","ems_alarm_event","alarm_current_member","alarm_current_snapshot","history_sample_identity","reliable_message","ems_alarm_identity"})s.executeUpdate("DELETE FROM "+table+" WHERE ems_uuid='"+EMS+"'");s.executeUpdate("DELETE FROM alarm_refresh_demand WHERE binding_period_id IN(SELECT id FROM ems_binding_period WHERE ems_uuid='"+EMS+"')");}
  // Recreate only this guarded test EMS's fixture period, so move tests cannot affect later cases.
  try(var c=source.getConnection();var s=c.createStatement()){c.setAutoCommit(false);ReliableMessageStore.lock(c,EMS.toString());s.executeUpdate("UPDATE ems_binding_period SET valid_to=clock_timestamp() WHERE ems_uuid='"+EMS+"' AND valid_to IS NULL");s.executeUpdate("DELETE FROM ems_binding_period WHERE ems_uuid='"+EMS+"'");s.executeUpdate("UPDATE device SET station_id=991 WHERE id IN(SELECT device_id FROM ems_gateway WHERE ems_uuid='"+EMS+"')");s.executeUpdate("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES('"+EMS+"',991,'2026-09-01T00:00:00Z')");c.commit();}
  fence=new GatewayLease(source,"task5-pg-check",120).acquire(EMS).orElseThrow();store=new ReliableMessageStore(source);
 }
 @Test void savesWholePackageAndDuplicateRearmsAckWithoutDuplicatingFacts() throws Exception {
  var e=history(TASK,"[[1,0,1.0000000000000000000000000001],[2,0,null]]");
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(e));
  assertEquals(ReliableMessageStore.Outcome.DUPLICATE,store.accept(e));
  assertEquals(1,count("reliable_message"));assertEquals(2,count("history_sample_identity"));assertEquals(1,count("outbox"));
 }
 @Test void crossTaskConflictRollsBackEveryNewSampleAndAck() throws Exception {
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(history(TASK,"[[1,0,7]]")));
  assertEquals(ReliableMessageStore.Outcome.REJECTED,store.accept(history("dff19b22-9ac1-4e49-8942-92f672c20794","[[2,0,8],[1,0,9]]")));
  assertEquals(1,count("history_sample_identity"));assertEquals(1,count("reliable_message"));assertEquals(1,count("outbox"));
 }
 @Test void differentPartsOfSameTaskMustAgreeOnFrozenTotal()throws Exception {
  var first=history(TASK,"[[1,0,7]]");assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(envelope("important",first.rawBody().replace("\"parts\":1","\"parts\":2"))));
  var next=history(TASK,"[[2,0,8]]");String raw=next.rawBody().replace("\"part\":1","\"part\":2");
  assertEquals(ReliableMessageStore.Outcome.REJECTED,store.accept(envelope("important",raw.replace("\"parts\":1","\"parts\":3"))));assertEquals(1,count("reliable_message"));assertEquals(1,count("history_sample_identity"));
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(envelope("important",raw.replace("\"parts\":1","\"parts\":2"))));assertEquals(2,count("reliable_message"));assertEquals(2,count("history_sample_identity"));
 }
 @Test void wordsRemainExactAndEqualCrossTaskSamplesDeduplicate() throws Exception {
  var e=history(TASK,"[[1,0,[65535,0,12,42]]]");
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(e));
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(history("dff19b22-9ac1-4e49-8942-92f672c20794","[[1,0,[65535,0,12,42]]]")));
  assertEquals(ReliableMessageStore.Outcome.REJECTED,store.accept(history("33333333-3333-4333-8333-333333333333","[[2,0,7],[1,0,[65535,0,12,43]]]")));
  assertEquals(1,count("history_sample_identity"));assertEquals(2,count("reliable_message"));
 }
 @Test void firstEmsAlarmCreatesDemandWithoutInventingSnapshot() throws Exception {
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(event("1","null")));
  assertEquals(1,count("ems_alarm_event"));assertEquals(0,count("alarm_current_snapshot"));assertEquals(1,pending());
 }
 @Test void nullCurrentListPreservesKnownMembersAndEventDuringRequestPreservesDemand() throws Exception {
  var projection=new AlarmProjection();
  assertTrue(projection.current(source,current("1","[{\"sv\":null,\"alarmId\":\"0c0731b8-9a62-4abc-bd32-10f5eb5e8917\",\"seq\":1,\"device\":{\"c\":1,\"type\":\"bms\",\"id\":null},\"code\":\"020101\",\"level\":2,\"state\":\"active\",\"ts\":1789353000000}]")));
  assertTrue(projection.current(source,current("2","null")));assertEquals(1,count("alarm_current_member"));
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(event("1","1")));assertEquals(1,pending());
  // Task7's request creation and pending consumption must be one transaction; simulate durable request.
  try(var c=source.getConnection();var s=c.createStatement()){c.setAutoCommit(false);ReliableMessageStore.lock(c,EMS.toString());s.executeUpdate("INSERT INTO query_request(id,ems_uuid,binding_period_id,connection_id,operation,params,created_at,expires_at,status) SELECT 'dff19b22-9ac1-4e49-8942-92f672c20794','"+EMS+"',id,'47d99f91-74e4-4738-aaab-17fc1550978c','alarm.current.get','{\"c\":1}',clock_timestamp(),clock_timestamp()+interval '1 minute','pending' FROM ems_binding_period WHERE ems_uuid='"+EMS+"' AND valid_to IS NULL");s.executeUpdate("UPDATE alarm_refresh_demand SET pending=false WHERE binding_period_id IN(SELECT id FROM ems_binding_period WHERE ems_uuid='"+EMS+"')");c.commit();}
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(event("2","1")));
  try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE query_request SET status='succeeded',result='{}' WHERE id='dff19b22-9ac1-4e49-8942-92f672c20794'");}
  assertEquals(1,pending());
 }
 @Test void staleFenceAndSameObjectDifferentValueNeverCreateFacts() throws Exception {
  var e=history(TASK,"[[1,0,7]]");var stale=new IngressEnvelope(e.emsId(),e.channel(),e.type(),e.canonicalHash(),e.rawBody(),e.sourceTopic(),e.receivedAt(),e.ingressEpoch(),e.sequence(),fence.subtract(BigInteger.ONE));
  assertEquals(ReliableMessageStore.Outcome.REJECTED,store.accept(stale));assertEquals(0,count("outbox"));
  assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(e));assertEquals(ReliableMessageStore.Outcome.REJECTED,store.accept(history(TASK,"[[1,0,8]]")));assertEquals(1,count("history_sample_identity"));
 }
 @Test void committedAckRetriesAfterPublisherFailureAndDuplicateRearmsSentRow() throws Exception {
  var e=history(TASK,"[[1,0,7]]");assertEquals(ReliableMessageStore.Outcome.SAVED,store.accept(e));
  var fail=new AckOutbox(source,(topic,bytes)->{throw new java.io.IOException("injected");});assertTrue(fail.publishNext());
  try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+EMS+"'");}
  var sent=new java.util.ArrayList<String>();var recovered=new AckOutbox(source,(topic,bytes)->{try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM reliable_message WHERE ems_uuid='"+EMS+"'")){r.next();assertEquals(1,r.getLong(1),"Publisher sees only committed facts");}sent.add(topic);});
  assertTrue(recovered.publishNext());assertEquals(1,sent.size());assertFalse(recovered.publishNext());assertEquals(ReliableMessageStore.Outcome.DUPLICATE,store.accept(e));assertTrue(recovered.publishNext());assertEquals(2,sent.size());assertEquals(1,count("reliable_message"));
 }
 long pending() throws Exception {try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM alarm_refresh_demand d JOIN ems_binding_period p ON p.id=d.binding_period_id WHERE p.ems_uuid='"+EMS+"' AND pending")){r.next();return r.getLong(1);}}
 IngressEnvelope event(String seq,String cabinet){return envelope("alarm","{\"v\":1,\"type\":\"alarm_event\",\"sv\":null,\"alarmId\":\"0c0731b8-9a62-4abc-bd32-10f5eb5e8917\",\"seq\":"+seq+",\"device\":{\"c\":"+cabinet+",\"type\":\"bms\",\"id\":null},\"code\":\"020101\",\"level\":2,\"state\":\"active\",\"ts\":1789353000000}");}
 IngressEnvelope current(String seq,String alarms)throws Exception{try(var c=source.getConnection();var q=c.prepareStatement("UPDATE connection_state SET connection_id='47d99f91-74e4-4738-aaab-17fc1550978c',ingress_generation=?::uuid WHERE ems_uuid=?::uuid")){q.setString(1,UUID.randomUUID().toString());q.setString(2,EMS.toString());q.executeUpdate();}return envelope("alarm","{\"v\":1,\"type\":\"alarm_current\",\"connectionId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"c\":1,\"seq\":"+seq+",\"alarms\":"+alarms+"}");}
 IngressEnvelope envelope(String channel,String raw){String topic="ems/v1/"+EMS+"/up/"+channel;var wire=new com.enerlution.ems.protocol.WireDecoder().decode(topic,raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));return new IngressEnvelope(EMS,channel,wire.type(),wire.canonicalHash(),raw,topic,Instant.now(),UUID.randomUUID(),BigInteger.ONE,fence);}
 long count(String relation) throws Exception {try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM "+relation+" WHERE ems_uuid='"+EMS+"'")){r.next();return r.getLong(1);}}
 IngressEnvelope history(String task,String rows) {String raw="{\"v\":1,\"type\":\"important_history\",\"taskId\":\""+task+"\",\"c\":1,\"part\":1,\"parts\":1,\"ts\":1789353000000,\"p\":[20062],\"data\":"+rows+"}";String topic="ems/v1/"+EMS+"/up/important";var wire=new com.enerlution.ems.protocol.WireDecoder().decode(topic,raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));return new IngressEnvelope(EMS,"important",wire.type(),wire.canonicalHash(),raw,topic,Instant.now(),UUID.randomUUID(),BigInteger.ONE,fence);}
}
