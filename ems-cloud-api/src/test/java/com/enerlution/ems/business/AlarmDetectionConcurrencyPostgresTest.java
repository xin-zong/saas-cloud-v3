package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;

/** The two workers use independent real connections; cleanup is restricted to this named fixture. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class AlarmDetectionConcurrencyPostgresTest {
 @Test void concurrentWorkersAndRestartCreateExactlyOneOccurrence() throws Exception {
  var ds=new DriverManagerDataSource(Objects.requireNonNull(System.getenv("EMS_TOYINGZHEN_DB_URL")),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));
  var db=new JdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);var json=new ObjectMapper();
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  long station=0,device=0,rule=0;String key="[engine concurrency]"+UUID.randomUUID();
  var pool=Executors.newSingleThreadExecutor();var release=new CountDownLatch(1);var entered=new CountDownLatch(1);
  try {
   station=db.queryForObject("INSERT INTO station(code,name,manager_id,tenant_id,rated_power_kw,capacity_kwh) VALUES(?,?,2,2,10,20) RETURNING id",Long.class,key,key);
   device=db.queryForObject("INSERT INTO device(station_id,code,name,serial_number) VALUES(?,?,?,?) RETURNING id",Long.class,station,key,key,key);
   long bucket=Instant.now().minusSeconds(180).toEpochMilli()/60000*60000;
   var condition=new AlarmRules.Condition(List.of(new AlarmRules.Field("power","kW","INSTANT","DEVICE")),"self",1,"gt",BigDecimal.TEN,null,null,true,false,false);
   var created=OffsetDateTime.ofInstant(Instant.ofEpochMilli(bucket-60000),ZoneOffset.UTC);
   rule=db.queryForObject("INSERT INTO alarm_rule_config(station_id,name,object_type,device_id,severity,conditions,effective_start,effective_end,recovery_duration,notification,created_by,updated_by,created_at,updated_at) VALUES(?,?,'DEVICE',?,'warning',?::jsonb,0,1440,0,'{}',2,2,?,?) RETURNING id",Long.class,station,key,device,json.writeValueAsString(List.of(condition)),created,created);
   var reader=mock(AlarmSampleReader.class);when(reader.read(anyMap(),anyList(),anyLong(),any())).thenAnswer(call->{entered.countDown();assertTrue(release.await(15,TimeUnit.SECONDS));return new AlarmSampleReader.Frame(List.of(new BigDecimal("12")),List.of(Map.of("sourceTime",bucket+30000,"value","12")),"mapping-one",null);});
   long id=rule;Instant now=Instant.ofEpochMilli(bucket+70000);
   var first=pool.submit(()->new AlarmDetectionEngine(db,reader,json,manager,true).evaluateRule(id,now));
   assertTrue(entered.await(15,TimeUnit.SECONDS));
   new AlarmDetectionEngine(db,reader,json,manager,true).evaluateRule(id,now);
   release.countDown();first.get(15,TimeUnit.SECONDS);
   new AlarmDetectionEngine(db,reader,json,manager,true).evaluateRule(id,now);
   assertEquals(1,db.queryForObject("select count(*) from alarm_rule_occurrence where rule_id=?",Integer.class,rule));
   assertEquals(1,db.queryForObject("select count(*) from alarm_detection_event where rule_id=?",Integer.class,rule));
   verify(reader,times(1)).read(anyMap(),anyList(),anyLong(),any());
  } finally {
   release.countDown();pool.shutdown();assertTrue(pool.awaitTermination(20,TimeUnit.SECONDS));
   if(station!=0){
    assertEquals(key,db.queryForObject("select code from station where id=?",String.class,station));
    db.update("delete from alarm_action_event where alarm_id in(select alarm_id from alarm_rule_occurrence where rule_id=?)",rule);
    db.update("delete from alarm_detection_event where rule_id=?",rule);
    var alarmIds=db.queryForList("select alarm_id from alarm_rule_occurrence where rule_id=?",Long.class,rule);
    db.update("delete from alarm_rule_occurrence where rule_id=?",rule);
    for(long alarm:alarmIds)db.update("delete from alarm where id=? and device_id=?",alarm,device);
    db.update("delete from audit_event where action like 'alarm.engine.%' and detail::jsonb->>'ruleId'=?",Long.toString(rule));
    db.update("delete from alarm_rule_execution where rule_id=?",rule);db.update("delete from alarm_rule_config where id=? and station_id=?",rule,station);
    db.update("delete from device where id=? and station_id=?",device,station);db.update("delete from station where id=? and code=?",station,key);
   }
  }
 }
}
