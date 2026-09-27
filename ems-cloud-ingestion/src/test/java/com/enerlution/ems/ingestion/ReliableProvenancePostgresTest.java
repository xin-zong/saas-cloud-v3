package com.enerlution.ems.ingestion;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
class ReliableProvenancePostgresTest {
 ReliableStorePostgresTest f;
 @BeforeEach void setup()throws Exception{f=new ReliableStorePostgresTest();f.setup();}
 @Test void stationMoveRejectsNewOldSourceAndCrossBoundaryPackagesButReacksSavedOriginal()throws Exception {
  long oldSource=Instant.now().minusSeconds(30).toEpochMilli();
  String saved=historyRaw(ReliableStorePostgresTest.TASK,oldSource,"[[0,0,7]]");
  assertEquals(ReliableMessageStore.Outcome.SAVED,f.store.accept(f.envelope("important",saved)));
  long originalPeriod;try(var c=f.source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT binding_period_id FROM reliable_message WHERE ems_uuid='"+ReliableStorePostgresTest.EMS+"'")){r.next();originalPeriod=r.getLong(1);}
  Instant boundary=Instant.now();
  try(var c=f.source.getConnection();var s=c.createStatement()){c.setAutoCommit(false);ReliableMessageStore.lock(c,ReliableStorePostgresTest.EMS.toString());s.executeUpdate("INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh) VALUES(99998,'task5-move','Task5 move',1,1) ON CONFLICT(id) DO NOTHING");try(var q=c.prepareStatement("UPDATE ems_binding_period SET valid_to=? WHERE ems_uuid=?::uuid AND valid_to IS NULL")){q.setTimestamp(1,java.sql.Timestamp.from(boundary));q.setString(2,ReliableStorePostgresTest.EMS.toString());q.executeUpdate();}s.executeUpdate("UPDATE device SET station_id=99998 WHERE id IN(SELECT device_id FROM ems_gateway WHERE ems_uuid='"+ReliableStorePostgresTest.EMS+"')");try(var q=c.prepareStatement("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES(?::uuid,99998,?)")){q.setString(1,ReliableStorePostgresTest.EMS.toString());q.setTimestamp(2,java.sql.Timestamp.from(boundary));q.executeUpdate();}c.commit();}
  assertEquals(ReliableMessageStore.Outcome.DUPLICATE,f.store.accept(f.envelope("important",saved)));
  var old=f.envelope("important",historyRaw("dff19b22-9ac1-4e49-8942-92f672c20794",oldSource,"[[0,0,7]]"));
  var crossing=f.envelope("important",historyRaw("33333333-3333-4333-8333-333333333333",oldSource,"[[0,0,7],[60000,0,8]]"));
  var oldEvent=f.envelope("alarm",f.event("1","1").rawBody().replace("1789353000000",Long.toString(oldSource)));
  assertAll(()->assertEquals(ReliableMessageStore.Outcome.REJECTED,f.store.accept(old)),()->assertEquals(ReliableMessageStore.Outcome.REJECTED,f.store.accept(crossing)),()->assertEquals(ReliableMessageStore.Outcome.REJECTED,f.store.accept(oldEvent)));
  assertEquals(1,f.count("reliable_message"));assertEquals(1,f.count("history_sample_identity"));assertEquals(0,f.count("ems_alarm_event"));
  try(var c=f.source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT binding_period_id FROM reliable_message WHERE ems_uuid='"+ReliableStorePostgresTest.EMS+"'")){r.next();assertEquals(originalPeriod,r.getLong(1));}
 }
 @Test void sourceBeforeFirstRegistrationIsUnknownAndRejected()throws Exception {
  var diagnostics=new TransportDiagnostics();var store=new ReliableMessageStore(f.source,diagnostics);
  assertEquals(ReliableMessageStore.Outcome.REJECTED,store.accept(f.envelope("important",historyRaw(ReliableStorePostgresTest.TASK,Instant.parse("2026-08-31T23:59:59Z").toEpochMilli(),"[[0,0,7]]"))));assertEquals(0,f.count("reliable_message"));assertEquals(0,f.count("outbox"));assertEquals(1,diagnostics.count(TransportDiagnostics.Signal.ADMISSION_REJECTION));
 }
 @Test void alarmDataLastActualSampleMustAlsoFitReceiptPeriod()throws Exception {
  long start=Instant.now().toEpochMilli();
  try(var c=f.source.getConnection();var q=c.prepareStatement("UPDATE ems_binding_period SET valid_to=? WHERE ems_uuid=?::uuid AND valid_to IS NULL")){q.setTimestamp(1,java.sql.Timestamp.from(Instant.ofEpochMilli(start+60000)));q.setString(2,ReliableStorePostgresTest.EMS.toString());q.executeUpdate();}
  String raw="{\"v\":1,\"type\":\"alarm_data\",\"sv\":null,\"alarmId\":\"0c0731b8-9a62-4abc-bd32-10f5eb5e8917\",\"start\":"+start+",\"step\":1000,\"points\":[[1,\"pcs\",1]],\"data\":["+String.join(",",java.util.Collections.nCopies(101,"[7]"))+"]}";
  assertEquals(ReliableMessageStore.Outcome.REJECTED,f.store.accept(f.envelope("alarm",raw)));assertEquals(0,f.count("reliable_message"));assertEquals(0,f.count("outbox"));
 }
 @Test void compressionAnchorBeforeBindingIsAllowedWhenEveryActualSampleIsInside()throws Exception {
  String raw=historyRaw(ReliableStorePostgresTest.TASK,Instant.parse("2026-08-31T23:59:59Z").toEpochMilli(),"[[2000,0,7]]");
  assertEquals(ReliableMessageStore.Outcome.SAVED,f.store.accept(f.envelope("important",raw)));
  try(var c=f.source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT r.source_at,h.archived_at FROM reliable_message r JOIN history_sample_identity h ON h.reliable_message_id=r.id WHERE r.ems_uuid='"+ReliableStorePostgresTest.EMS+"'")){assertTrue(r.next());assertEquals(Instant.parse("2026-08-31T23:59:59Z"),r.getTimestamp(1).toInstant());assertEquals(Instant.parse("2026-09-01T00:00:01Z"),r.getTimestamp(2).toInstant());}
 }
 static String historyRaw(String task,long ts,String rows){return ReliableLiveCheck.raw(task,rows).replace("1789353000000",Long.toString(ts));}
}
