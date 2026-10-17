package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class AlarmDetectionPostgresTest {
 JdbcTemplate db;DataSourceTransactionManager manager;TransactionStatus outer;
 AlarmSampleReader reader;ObjectMapper json=new ObjectMapper();long station,device,rule;
 long bucket=Instant.now().minusSeconds(900).toEpochMilli()/60000*60000;
 AtomicReference<BigDecimal> value=new AtomicReference<>(new BigDecimal("12"));
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource(Objects.requireNonNull(System.getenv("EMS_TOYINGZHEN_DB_URL")),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(ds);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  assertTrue(db.queryForObject("select exists(select 1 from schema_migration where version=37)",Boolean.class));
  String key="[engine transaction]"+UUID.randomUUID();
  station=db.queryForObject("INSERT INTO station(code,name,manager_id,tenant_id,rated_power_kw,capacity_kwh) VALUES(?,?,2,2,10,20) RETURNING id",Long.class,key,key);
  device=db.queryForObject("INSERT INTO device(station_id,code,name,serial_number) VALUES(?,?,?,?) RETURNING id",Long.class,station,key,key,key);
  var condition=new AlarmRules.Condition(List.of(new AlarmRules.Field("power","kW","INSTANT","DEVICE")),"self",3,"gt",BigDecimal.TEN,null,null,true,false,false);
  try{rule=db.queryForObject("INSERT INTO alarm_rule_config(station_id,name,object_type,device_id,severity,conditions,effective_start,effective_end,recovery_duration,notification,created_by,updated_by,created_at,updated_at) VALUES(?,?,'DEVICE',?,'warning',?::jsonb,0,1440,60,'{}',2,2,?,?) RETURNING id",Long.class,station,key,device,json.writeValueAsString(List.of(condition)),time(bucket-60000),time(bucket-60000));}catch(Exception ex){throw new IllegalStateException(ex);}
  reader=mock(AlarmSampleReader.class);
  when(reader.read(anyMap(),anyList(),anyLong(),any())).thenAnswer(call->{long b=call.getArgument(2);BigDecimal v=value.get();return v==null?new AlarmSampleReader.Frame(List.of(),List.of(),"","缺样"):new AlarmSampleReader.Frame(List.of(v),List.of(Map.of("pointId","29","bindingPeriodId","3","sourceTime",b+30000,"value",v.toString(),"quality","valid","sourceTimeKind","source")),"mapping-one",null);});
 }
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 OffsetDateTime time(long ms){return OffsetDateTime.ofInstant(Instant.ofEpochMilli(ms),ZoneOffset.UTC);}
 AlarmDetectionEngine engine(){return new AlarmDetectionEngine(db,reader,json,manager,true);}
 void tick(int minute){engine().evaluateRule(rule,Instant.ofEpochMilli(bucket+minute*60000+70000));}
 long count(){return db.queryForObject("select count(*) from alarm_rule_occurrence where rule_id=?",Long.class,rule);}
 long active(){return db.queryForObject("select alarm_id from alarm_rule_occurrence where rule_id=? and ended_at is null",Long.class,rule);}
 void onePeriod(){db.update("update alarm_rule_config set conditions=jsonb_set(conditions,'{0,period}','1') where id=?",rule);}
 @Test void consecutiveRealFramesPersistAcrossWorkersAndRecoverWithSystemEvidence(){
  tick(0);tick(1);assertEquals(0,count());tick(2);assertEquals(1,count());long alarm=active();
  tick(2);assertEquals(1,count());verify(reader,times(3)).read(anyMap(),anyList(),anyLong(),any());
  assertEquals("rule",db.queryForObject("select source from alarm where id=?",String.class,alarm));
  assertNull(db.queryForObject("select acknowledged_at from alarm where id=?",OffsetDateTime.class,alarm));
  value.set(BigDecimal.ONE);tick(3);assertNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
  tick(4);assertNotNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
  assertEquals(2,db.queryForObject("select count(*) from alarm_action_event where alarm_id=? and actor_id is null and actor_type='engine'",Integer.class,alarm));
  assertEquals(5,db.queryForObject("select count(*) from alarm_detection_event where rule_id=?",Integer.class,rule));
  assertTrue(db.queryForObject("select recovery_evidence is not null and jsonb_array_length(trigger_evidence)>0 from alarm_rule_occurrence where alarm_id=?",Boolean.class,alarm));
 }
 @Test void missingMinuteBreaksBothTriggerAndRecoveryContinuity(){
  onePeriod();tick(0);long alarm=active();value.set(BigDecimal.ONE);tick(1);value.set(null);tick(2);value.set(BigDecimal.ONE);tick(3);
  assertNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));tick(4);
  assertNotNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
 }
 @Test void recoveryDurationUsesActualSourceTimesInsteadOfBucketStarts(){
  onePeriod();tick(0);long alarm=active();value.set(BigDecimal.ONE);
  when(reader.read(anyMap(),anyList(),anyLong(),any())).thenAnswer(call->{long b=call.getArgument(2);long offset=b==bucket+60000?59000:1000;return new AlarmSampleReader.Frame(List.of(BigDecimal.ONE),List.of(Map.of("sourceTime",b+offset,"value","1")),"mapping-one",null);});
  tick(1);tick(2);
  assertNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm),"adjacent bucket samples only two seconds apart cannot satisfy 60 seconds");
  tick(3);assertNotNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
 }
 @Test void manualCloseDoesNotRetriggerUntilNormalAndOriginSurvivesDeviceMove(){
  onePeriod();tick(0);long old=active();db.update("update alarm set closed_at=now(),closed_by=2,version=version+1 where id=?",old);
  tick(1);assertEquals(1,count());value.set(BigDecimal.ONE);tick(2);value.set(new BigDecimal("12"));tick(3);assertEquals(2,count());
  String key="[move target]"+UUID.randomUUID();
  long target=db.queryForObject("INSERT INTO station(code,name,manager_id,tenant_id,rated_power_kw,capacity_kwh) VALUES(?,?,2,2,10,20) RETURNING id",Long.class,key,key);
  db.update("update device set station_id=? where id=?",target,device);
  assertEquals(station,db.queryForObject("select station_id from alarm_business_origin where alarm_id=?",Long.class,old));
 }
 @Test void ruleRevisionCannotRecoverOldOccurrenceUsingNewThresholds(){
  onePeriod();tick(0);long alarm=active();db.update("update alarm_rule_config set version=version+1 where id=?",rule);value.set(BigDecimal.ONE);tick(1);tick(2);
  assertNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
  assertEquals("unknown",db.queryForObject("select status from alarm_rule_execution where rule_id=?",String.class,rule));
 }
 @Test void revokedUpdaterCannotReadSamplesOrCreateAlerts(){
  db.update("update alarm_rule_config set updated_by=(select id from app_user where account='viewer@prototype.local') where id=?",rule);tick(0);
  verifyNoInteractions(reader);assertEquals(0,count());
 }
 @Test void permissionOrVersionChangedDuringSamplingIsRecheckedBeforeWrite(){
  onePeriod();when(reader.read(anyMap(),anyList(),anyLong(),any())).thenAnswer(call->{db.update("update alarm_rule_config set version=version+1 where id=?",rule);return new AlarmSampleReader.Frame(List.of(new BigDecimal("12")),List.of(),"mapping-one",null);});
  tick(0);assertEquals(0,count());
 }
 @Test void disabledEngineDoesNotTouchDatabase(){
  var isolated=mock(JdbcTemplate.class);var off=new AlarmDetectionEngine(isolated,reader,json,manager,false);off.runOnce();verifyNoInteractions(isolated,reader);
 }
 @Test void actualBindingSqlReturnsWaitingWithoutFakeSamples(){
  var raw=mock(EmsTelemetryQueries.class);
  var result=new AlarmSampleReader(db,raw).read(db.queryForMap("select * from alarm_rule_config where id=?",rule),engine().conditions(db.queryForMap("select * from alarm_rule_config where id=?",rule)),bucket,Instant.ofEpochMilli(bucket+70000));
  assertNotNull(result.reason());verifyNoInteractions(raw);
 }
 @Test void systemActionsAreVisibleButRawEvidenceStillRequiresTelemetryRead(){
  onePeriod();tick(0);long alarm=active();
  var access=mock(com.enerlution.ems.auth.AccessControl.class);when(access.userId()).thenReturn(2L);
  var workspace=new AlarmWorkspaceService(new DomainSupport(db,access));var detail=workspace.detail(alarm);
  assertEquals(List.of(),detail.get("samples"));assertTrue(detail.get("sampleStatus").toString().contains("没有采样读取权限"));
  assertTrue(((List<?>)detail.get("events")).toString().contains("系统检测"));
  when(access.hasStationPermission(2L,station,"telemetry.read")).thenReturn(true);
  assertEquals(1,((List<?>)workspace.detail(alarm).get("samples")).size());
 }
 @Test void manuallyClosingAlarmEndsOccurrenceEvenAfterRuleDeletion(){
  onePeriod();tick(0);long alarm=active();db.update("update alarm_rule_config set deleted_at=now(),version=version+1 where id=?",rule);
  var access=mock(com.enerlution.ems.auth.AccessControl.class);when(access.userId()).thenReturn(2L);
  new AlarmWorkspaceService(new DomainSupport(db,access)).action(alarm,"close",1,"人工关闭已删除规则的告警");
  assertNotNull(db.queryForObject("select ended_at from alarm_rule_occurrence where alarm_id=?",OffsetDateTime.class,alarm));
  assertNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
 }
 @Test void realPostgresAndReadOnlyHttpSamplingTriggerAndRecover() throws Exception {
  onePeriod();db.update("update alarm_rule_config set recovery_duration=0 where id=?",rule);
  String kind="engine-"+UUID.randomUUID();UUID gateway=UUID.randomUUID();
  db.update("insert into measurement_kind(code,name,unit) values(?,?,'kW')",kind,kind);
  long point=db.queryForObject("insert into measurement_point(device_id,kind_code,code) values(?,?,'power') returning id",Long.class,device,kind);
  db.update("insert into ems_gateway(ems_uuid,device_id) values(?,?)",gateway,device);
  long period=db.queryForObject("insert into ems_binding_period(ems_uuid,station_id,valid_from) values(?,?,?) returning id",Long.class,gateway,station,time(bucket-60000));
  long binding=db.queryForObject("insert into device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) values(?,'cabinet',1,'pcs',1,?,?) returning id",Long.class,period,device,time(bucket-60000));
  long definition=db.queryForObject("insert into point_definition(catalog_version,namespace,source_id,value_type,aggregation) values(?,'cabinet',20024,'number','average') returning id",Long.class,kind);
  db.update("insert into point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) values(?,?,?,?)",binding,definition,point,time(bucket-60000));
  var frameBucket=new java.util.concurrent.atomic.AtomicLong(bucket);
  var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/",exchange->{try{
   String sql=new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
   assertTrue(sql.startsWith("SELECT "));assertTrue(sql.contains("point_id="+point));assertTrue(sql.contains("binding_period_id IN ("+period+")"));
   var row=Map.of("point_id",point,"binding_period_id",period,"source_type","ems","source_time_kind","source","source_at_ms",frameBucket.get()+30000,"received_at_ms",frameBucket.get()+31000,"quality","valid","value_kind","number","number_exact",value.get().toString());
   byte[] bytes=json.writeValueAsBytes(Map.of("data",List.of(row)));exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
  }finally{exchange.close();}});
  server.start();
  try{
   var raw=new EmsTelemetryQueries(json,"http://127.0.0.1:"+server.getAddress().getPort(),"fixture","fixture");
   var worker=new AlarmDetectionEngine(db,new AlarmSampleReader(db,raw),json,manager,true);
   worker.evaluateRule(rule,Instant.ofEpochMilli(bucket+70000));long alarm=active();assertEquals(1,count());
   value.set(BigDecimal.ONE);frameBucket.set(bucket+60000);worker.evaluateRule(rule,Instant.ofEpochMilli(bucket+130000));
   assertNotNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
   assertEquals("power",db.queryForObject("select trigger_evidence->0->>'fieldCode' from alarm_rule_occurrence where alarm_id=?",String.class,alarm));
  }finally{server.stop(0);}
 }
 @Test void zeroDurationNormalFrameRecoversEvenWhenConditionTimestampsDiffer() throws Exception {
  onePeriod();
  var one=engine().conditions(db.queryForMap("select * from alarm_rule_config where id=?",rule)).getFirst();
  var two=new AlarmRules.Condition(List.of(new AlarmRules.Field("other","kW","INSTANT","DEVICE")),"self",1,"gt",BigDecimal.TEN,null,null,true,false,false);
  db.update("update alarm_rule_config set recovery_duration=0,conditions=?::jsonb where id=?",json.writeValueAsString(List.of(one,two)),rule);
  when(reader.read(anyMap(),anyList(),anyLong(),any())).thenAnswer(call->{long b=call.getArgument(2);return new AlarmSampleReader.Frame(List.of(value.get(),value.get()),List.of(Map.of("sourceTime",b+1000),Map.of("sourceTime",b+59000)),"mapping-one",null);});
  tick(0);long alarm=active();value.set(BigDecimal.ONE);tick(1);
  assertNotNull(db.queryForObject("select recovered_at from alarm where id=?",OffsetDateTime.class,alarm));
 }
}
