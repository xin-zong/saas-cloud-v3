package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** Test samples exist only inside a rolled-back transaction; no fabricated business records survive. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StoredAlarmPostgresTest {
 JdbcTemplate db;DataSourceTransactionManager manager;TransactionStatus outer;
 long station,device,rule,point,reference,bucket;AlarmDetectionEngine engine;AlarmSampleReader reader;EmsTelemetryQueries nativeReader;
 final ObjectMapper json=new ObjectMapper();
 @BeforeEach void setup() throws Exception {
  var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(ds);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  var key="stored-test-"+UUID.randomUUID();bucket=Instant.now().minusSeconds(900).toEpochMilli()/60000*60000;
  station=db.queryForObject("INSERT INTO station(code,name,manager_id,tenant_id,rated_power_kw,capacity_kwh) VALUES(?,?,2,2,10,20) RETURNING id",Long.class,key,key);
  device=db.queryForObject("INSERT INTO device(station_id,code,name,serial_number) VALUES(?,?,?,?) RETURNING id",Long.class,station,key,key,key);
  db.update("INSERT INTO measurement_kind(code,name,unit) VALUES(?,?,'kW')",key,"测试功率");
  point=db.queryForObject("INSERT INTO measurement_point(device_id,kind_code,code) VALUES(?,?,?) RETURNING id",Long.class,device,key,key);
  reference=db.queryForObject("INSERT INTO reference_device_point(device_id,name,unit,source_host) VALUES(?,'测试功率','kW','ess-cloud-login.qudeox.com') RETURNING id",Long.class,device);
  db.update("INSERT INTO stored_device_point_binding(measurement_point_id,reference_point_id,station_id,semantic_key) VALUES(?,?,?,'pcsPower')",point,reference,station);
  var condition=new AlarmRules.Condition(List.of(new AlarmRules.Field(key,"kW","INSTANT","DEVICE")),"self",1,"gt",BigDecimal.TEN,null,null,true,false,false);
  rule=db.queryForObject("INSERT INTO alarm_rule_config(station_id,name,object_type,device_id,severity,conditions,effective_start,effective_end,recovery_duration,notification,created_by,updated_by,created_at,updated_at) VALUES(?,?,'DEVICE',?,'warning',?::jsonb,0,1440,0,'{}',2,2,?,?) RETURNING id",Long.class,station,key,device,json.writeValueAsString(List.of(condition)),at(bucket-60000),at(bucket-60000));
  nativeReader=mock(EmsTelemetryQueries.class);reader=new AlarmSampleReader(db,nativeReader);reader.stored=new StoredDeviceTelemetryService(db,json);
  engine=new AlarmDetectionEngine(db,reader,json,manager,true);
 }
 OffsetDateTime at(long ms){return OffsetDateTime.ofInstant(Instant.ofEpochMilli(ms),ZoneOffset.UTC);}
 void sample(int minute,String value,String quality){
  long source=bucket+minute*60000+30000;
  db.update("INSERT INTO reference_device_sample(point_id,source_at,captured_at,value,raw_value,quality,source_url,evidence_sha256) VALUES(?,?,?,?,?,?,?,?)",reference,at(source),at(source+1000),value==null?null:new BigDecimal(value),value==null?"--":value,quality,"https://ess-cloud-login.qudeox.com/test-only-rollback","0".repeat(64));
 }
 void tick(int minute){engine.evaluateRule(rule,Instant.ofEpochMilli(bucket+minute*60000+70000));}
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 @Test void sameEnginePersistsTriggerRecoveryAndHandlingEvidenceFromCanonicalPgPoints(){
  sample(0,"12","observed");tick(0);
  long alarm=db.queryForObject("select alarm_id from alarm_rule_occurrence where rule_id=?",Long.class,rule);
  assertEquals(1,db.queryForObject("select count(*) from alarm_action_event where alarm_id=? and action='trigger'",Integer.class,alarm));
  sample(1,null,"missing");tick(1);
  assertNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
  sample(2,"1","observed");tick(2);
  assertNotNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
  assertEquals(1,db.queryForObject("select count(*) from alarm_action_event where alarm_id=? and action='recover'",Integer.class,alarm));
  assertEquals("stored_device",db.queryForObject("select trigger_evidence->0->>'source' from alarm_rule_occurrence where alarm_id=?",String.class,alarm));
  assertEquals("1",db.queryForObject("select recovery_evidence->0->>'value' from alarm_rule_occurrence where alarm_id=?",String.class,alarm));
  tick(2);assertEquals(2,db.queryForObject("select count(*) from alarm_action_event where alarm_id=?",Integer.class,alarm));verifyNoInteractions(nativeReader);
 }
 @Test void oldActualTimeCannotBecomeCurrentAlarmOrRecovery(){
  sample(0,"12","observed");engine.evaluateRule(rule,Instant.now());
  assertEquals(0,db.queryForObject("select count(*) from alarm_rule_occurrence where rule_id=?",Integer.class,rule));
  assertEquals("unknown",db.queryForObject("select status from alarm_rule_execution where rule_id=?",String.class,rule));
 }
}
