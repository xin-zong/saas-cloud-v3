package com.enerlution.ems.ingestion;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
class AlarmBusinessPostgresTest {
  Connection c;Statement s;
  final String ems="11111111-1111-4111-8111-111111111111",alarm="22222222-2222-4222-8222-222222222222";
  @BeforeEach void setup()throws Exception {
    c=DriverManager.getConnection(System.getenv("EMS_TEST_DB_URL"),System.getenv("EMS_TEST_DB_USER"),System.getenv("EMS_TEST_DB_PASSWORD"));
    c.setAutoCommit(false);s=c.createStatement();
    try(var r=s.executeQuery("select current_database(),current_user")){assertTrue(r.next());assertEquals("ems_cloud_v2_proto",r.getString(1));assertEquals("ems_ingestion_test",r.getString(2));}
    s.execute("SET LOCAL search_path TO ems_ingestion_tests,public");s.execute("SELECT pg_advisory_xact_lock(78291028)");
    try(var r=s.executeQuery("SELECT count(*) FROM information_schema.tables WHERE table_schema='ems_ingestion_tests'")){assertTrue(r.next());assertEquals(0,r.getInt(1));}
    for(int v=1;v<=15;v++) {
      final String prefix="V"+v+"__";
      try(var paths=Files.list(Path.of("../ems-cloud-api/src/main/resources/db/migration"))) {
        s.execute(Files.readString(paths.filter(p->p.getFileName().toString().startsWith(prefix)).findFirst().orElseThrow()).replace("CREATE EXTENSION IF NOT EXISTS btree_gist;",""));
      }
    }
    s.execute("INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh) VALUES(101,'a','A',1,1),(102,'b','B',1,1)");
    s.execute("INSERT INTO device(id,station_id,code,name) VALUES(101,101,'ems','EMS'),(103,101,'pcs','PCS'),(104,101,'pcs2','PCS2')");
    s.execute("INSERT INTO ems_gateway VALUES('"+ems+"',101)");
    s.execute("INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from) VALUES(101,'"+ems+"',101,'2026-01-01')");
    s.execute("INSERT INTO ems_alarm_identity(ems_uuid,alarm_id) VALUES('"+ems+"','"+alarm+"')");
    s.execute("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(103,101,'cabinet',1,'pcs',7,103,'2026-01-01')");
  }
  @AfterEach void cleanup()throws Exception{if(c!=null){c.rollback();c.close();}}
  void event(int seq,String level,String state)throws Exception {
    String raw="{\"alarmId\":\""+alarm+"\",\"seq\":"+seq+",\"sv\":1,\"device\":{\"c\":1,\"type\":\"pcs\",\"id\":null},\"code\":\"050001\",\"level\":"+level+",\"state\":\""+state+"\"}";
    try(var q=c.prepareStatement("INSERT INTO reliable_message(ems_uuid,binding_period_id,type,alarm_id,seq,source_at,received_at,raw_payload,content_hash,status) VALUES(?::uuid,101,'alarm_event',?::uuid,?,'2026-09-01',clock_timestamp(),?,repeat('a',64),'saved') RETURNING id")) {
      q.setString(1,ems);q.setString(2,alarm);q.setInt(3,seq);q.setBytes(4,raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));try(var r=q.executeQuery()){r.next();s.execute("INSERT INTO ems_alarm_event VALUES('"+ems+"','"+alarm+"',"+seq+","+r.getLong(1)+")");}
    }
  }
  @Test void knownMappedAlarmProjectsOnceAndOriginSurvivesAssetMove()throws Exception {
    event(1,"2","active");assertEquals(1,AlarmProjection.projectBusiness(c,ems));
    assertEquals(1,scalar("SELECT count(*) FROM alarm"));
    assertEquals(103,scalar("SELECT business_device_binding_id FROM ems_alarm_identity"));
    assertEquals("critical",text("SELECT severity FROM alarm"));
    assertEquals(0,AlarmProjection.projectBusiness(c,ems));
    s.execute("UPDATE device_binding SET valid_to=clock_timestamp() WHERE id=103");
    s.execute("UPDATE device SET station_id=102 WHERE id=103");
    assertEquals(101,scalar("SELECT station_id FROM ems_alarm_business_origin"));
    var sp=c.setSavepoint();assertThrows(SQLException.class,()->s.execute("UPDATE alarm SET device_id=104"));c.rollback(sp);
    sp=c.setSavepoint();assertThrows(SQLException.class,()->s.execute("UPDATE ems_alarm_identity SET business_alarm_id=NULL,business_device_binding_id=NULL"));c.rollback(sp);
    sp=c.setSavepoint();assertThrows(SQLException.class,()->s.execute("DELETE FROM ems_alarm_identity"));c.rollback(sp);
  }
  @Test void unknownLevelAndAmbiguousNullLocationRemainUnresolvedThenRecover()throws Exception {
    event(1,"null","active");assertEquals(0,AlarmProjection.projectBusiness(c,ems));assertEquals(0,scalar("SELECT count(*) FROM alarm"));
    event(2,"1","active");
    s.execute("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(104,101,'cabinet',1,'pcs',8,104,'2026-01-01')");
    assertEquals(0,AlarmProjection.projectBusiness(c,ems));assertEquals(0,scalar("SELECT count(*) FROM alarm"));
    s.execute("DELETE FROM device_binding WHERE id=104");
    assertEquals(1,AlarmProjection.projectBusiness(c,ems));assertEquals("warning",text("SELECT severity FROM alarm"));
    event(3,"1","recovered");AlarmProjection.projectBusiness(c,ems);assertNotNull(text("SELECT recovered_at FROM alarm"));
    assertEquals(0,scalar("SELECT count(*) FROM outbox"));
  }
  @Test void currentOnlyKnownSnapshotCanProjectButLastKnownCannotConfirmActive()throws Exception {
    String record="{\"alarmId\":\""+alarm+"\",\"seq\":1,\"sv\":1,\"device\":{\"c\":1,\"type\":\"pcs\",\"id\":null},\"code\":\"050001\",\"level\":3,\"state\":\"active\",\"ts\":1788220800000}";
    s.execute("INSERT INTO alarm_current_snapshot(ems_uuid,cabinet_no,connection_id,seq,known,observed_at,binding_period_id,content_hash) VALUES('"+ems+"',1,'33333333-3333-4333-8333-333333333333',1,false,clock_timestamp(),101,repeat('a',64))");
    s.execute("INSERT INTO alarm_current_member VALUES('"+ems+"',1,'33333333-3333-4333-8333-333333333333',1,'"+alarm+"','"+record+"')");
    assertEquals(0,AlarmProjection.projectBusiness(c,ems));
    s.execute("UPDATE alarm_current_snapshot SET known=true");
    assertEquals(1,AlarmProjection.projectBusiness(c,ems));assertEquals(1,scalar("SELECT count(*) FROM alarm"));
  }
  long scalar(String sql)throws Exception{try(var r=s.executeQuery(sql)){r.next();return r.getLong(1);}}
  String text(String sql)throws Exception{try(var r=s.executeQuery(sql)){r.next();return r.getString(1);}}
}
