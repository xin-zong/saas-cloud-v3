package com.enerlution.ems.ingestion;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
class ReliableFaultPostgresTest {
 ReliableStorePostgresTest f;
 @BeforeEach void setup()throws Exception{f=new ReliableStorePostgresTest();f.setup();}
 @Test void databaseFailureDuringAckInsertionRollsBackWholePackage()throws Exception {
  try(var c=f.source.getConnection();var s=c.createStatement()){s.execute("CREATE FUNCTION task5_fail_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected before commit'; END $$");s.execute("CREATE TRIGGER task5_fail_ack BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION task5_fail_ack()");}
  try {assertEquals(ReliableMessageStore.Outcome.BUSY,f.store.accept(f.history(ReliableStorePostgresTest.TASK,"[[1,0,7]]")));assertEquals(0,f.count("reliable_message"));assertEquals(0,f.count("history_sample_identity"));assertEquals(0,f.count("outbox"));}
  finally{try(var c=f.source.getConnection();var s=c.createStatement()){s.execute("DROP TRIGGER task5_fail_ack ON outbox");s.execute("DROP FUNCTION task5_fail_ack()");}}
 }
 @Test void oldSenderFailureCannotOverwriteDuplicateRearmAndNewClaim()throws Exception {
  var e=f.history(ReliableStorePostgresTest.TASK,"[[1,0,7]]");assertEquals(ReliableMessageStore.Outcome.SAVED,f.store.accept(e));
  var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
  var old=new AckOutbox(f.source,(topic,bytes)->{entered.countDown();if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError("release");throw new java.io.IOException("old sender failure");});
  var executor=Executors.newSingleThreadExecutor();
  try {
   var future=executor.submit(old::publishNext);assertTrue(entered.await(5,TimeUnit.SECONDS));
   assertEquals(ReliableMessageStore.Outcome.DUPLICATE,f.store.accept(e));
   var newer=new AckOutbox(f.source,(topic,bytes)->{});assertTrue(newer.publishNext());
   release.countDown();assertTrue(future.get(5,TimeUnit.SECONDS));assertFalse(newer.publishNext(),"Old failure cannot requeue a newer completed claim");assertEquals(1,f.count("reliable_message"));
  }finally{release.countDown();executor.shutdownNow();}
 }
 @Test void expiredSendingClaimIsRecoveredByFreshProcess()throws Exception {
  assertEquals(ReliableMessageStore.Outcome.SAVED,f.store.accept(f.history(ReliableStorePostgresTest.TASK,"[[1,0,7]]")));
  try(var c=f.source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE outbox SET status='sending',lease_owner='dead-process',lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+ReliableStorePostgresTest.EMS+"'");}
  var published=new java.util.ArrayList<String>();assertTrue(new AckOutbox(f.source,(topic,bytes)->published.add(topic)).publishNext());assertEquals(1,published.size());assertEquals(1,f.count("reliable_message"));
 }
 @Test void snapshotCannotAcquireAnotherEmsBindingAndHistoryArraysForbidNestedValues()throws Exception {
  assertEquals(ReliableMessageStore.Outcome.SAVED,f.store.accept(f.history(ReliableStorePostgresTest.TASK,"[[1,0,[65535,0,12,42]]]")));
  try(var c=f.source.getConnection();var s=c.createStatement()) {
   c.setAutoCommit(false);
   try {
    s.executeUpdate("INSERT INTO device(id,station_id,code,name) SELECT 99999,station_id,'task5-other','Task5 other' FROM ems_binding_period WHERE ems_uuid='"+ReliableStorePostgresTest.EMS+"' AND valid_to IS NULL");
    s.executeUpdate("INSERT INTO ems_gateway(ems_uuid,device_id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',99999)");
    long other;try(var r=s.executeQuery("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',station_id,clock_timestamp()-interval '1 minute' FROM device WHERE id=99999 RETURNING id")){r.next();other=r.getLong(1);}
    var sp=c.setSavepoint();var invalid=assertThrows(SQLException.class,()->s.executeUpdate("INSERT INTO alarm_current_snapshot(ems_uuid,cabinet_no,binding_period_id,connection_id,seq,known,observed_at) VALUES('"+ReliableStorePostgresTest.EMS+"',1,"+other+",'47d99f91-74e4-4738-aaab-17fc1550978c',1,true,clock_timestamp())"));assertEquals("23503",invalid.getSQLState());c.rollback(sp);
    for(String value:java.util.List.of("{}","[[1]]","[{}]")){sp=c.setSavepoint();var violation=assertThrows(SQLException.class,()->s.executeUpdate("UPDATE history_sample_identity SET canonical_value='"+value+"'::jsonb WHERE ems_uuid='"+ReliableStorePostgresTest.EMS+"'"));assertEquals("23514",violation.getSQLState());c.rollback(sp);}
   }finally{c.rollback();}
  }
 }
}
