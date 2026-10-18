package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationMetricPostgresTest {
 JdbcTemplate db; AccessControl access; StationMetricService service; DataSourceTransactionManager manager; TransactionStatus outer;
 @BeforeEach void setup() throws Exception {
  var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("SELECT current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("SELECT current_user",String.class));
  String schema="metric_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("""
   CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint);
   CREATE TABLE station_profile(station_id bigint PRIMARY KEY,timezone text);
   CREATE TABLE app_user(id bigint PRIMARY KEY,display_name text);
   CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint,target_tenant_id bigint,action text,detail text);
   CREATE TABLE station_audit_event(event_id bigint,station_id bigint,shared_detail boolean,channel text,actor_name text);
   CREATE TABLE device(id bigint PRIMARY KEY,station_id bigint);
   CREATE TABLE measurement_point(id bigint PRIMARY KEY,device_id bigint,code text);
   CREATE TABLE reference_device_point(id bigint PRIMARY KEY,device_id bigint,name text,unit text);
   CREATE TABLE stored_device_point_binding(measurement_point_id bigint,reference_point_id bigint,station_id bigint,semantic_key text);
   CREATE TABLE reference_device_sample(id bigint GENERATED ALWAYS AS IDENTITY,point_id bigint,source_at timestamptz,captured_at timestamptz,quality text,value numeric,raw_value text);
   CREATE INDEX sample_point_time ON reference_device_sample(point_id,source_at);
   INSERT INTO station VALUES(101,11),(102,22); INSERT INTO station_profile VALUES(101,'Asia/Shanghai'),(102,'Asia/Shanghai'); INSERT INTO app_user VALUES(7,'Test');
   INSERT INTO device VALUES(1,101),(2,102);
   INSERT INTO measurement_point VALUES(10,1,'pv'),(20,2,'pv');
   INSERT INTO reference_device_point VALUES(100,1,'发电功率','kW'),(200,2,'发电功率','kW');
   INSERT INTO stored_device_point_binding VALUES(10,100,101,'pvPower'),(20,200,102,'pvPower');
   """);
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V47__station_metric_energy.sql")));
  access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);service=new StationMetricService(new DomainSupport(db,access),new StoredDeviceTelemetryService(db,new ObjectMapper()));
 }
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 void failure(int status,Runnable action){var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));try{assertEquals(status,assertThrows(BusinessException.class,action::run).status());}finally{manager.rollback(nested);}}
 @Test void sourceSelectionNoneAmbiguityScopeVersionAndPermission(){
  assertEquals("resolved",service.source(101,"pvEnergy").status());
  failure(400,()->service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("STATIC","20",0L)));
  assertEquals("none",service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("STATIC",null,0L)).status());
  failure(409,()->service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("DYNAMIC",null,0L)));
  assertEquals("10",service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("STATIC","10",1L)).resolvedPointId());
  db.execute("INSERT INTO measurement_point VALUES(11,1,'pv2'); INSERT INTO reference_device_point VALUES(101,1,'发电功率2','kW'); INSERT INTO stored_device_point_binding VALUES(11,101,101,'pvPower')");
  assertEquals("ambiguous",service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("DYNAMIC",null,2L)).status());
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.edit");
  failure(403,()->service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("STATIC","10",3L)));
  assertEquals(3,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
 }
 @Test void offsetsReplaceRevokeWithoutManufacturingMissingEnergy(){
  var a=service.saveOffset(101,"pvEnergy","DAILY","2025-01-01",new StationMetricService.OffsetRequest("-2.00","校准",0L));assertEquals(1,a.version());
  failure(409,()->service.saveOffset(101,"pvEnergy","DAILY","2025-01-01",new StationMetricService.OffsetRequest("0","校准",0L)));
  service.saveOffset(101,"pvEnergy","TOTAL","1970-01-01",new StationMetricService.OffsetRequest("10","累计校准",0L));
  var job=service.recalculate(101,new StationMetricService.RecalculateRequest("2025-01-01","2025-01-01"));assertEquals("completed",job.status());
  var day=service.results(101,"2025-01-01","2025-01-01").days().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow();
  assertNull(day.rawValue());assertNull(day.correctedValue());assertEquals("-2.00",day.dailyOffset());
  var revoked=service.revokeOffset(101,"pvEnergy","DAILY","2025-01-01",new StationMetricService.RevokeRequest("撤销",1L));assertFalse(revoked.active());assertEquals(2,revoked.version());
  assertEquals(0,db.queryForObject("SELECT count(*) FROM station_metric_result WHERE metric_key='pvEnergy'",Integer.class));
 }
 @Test void completeMonthTotalsApplyDailyAndTotalOffsetsExactlyOnceAndKeepRawSamples(){
  db.execute("INSERT INTO reference_device_sample(point_id,source_at,captured_at,quality,value,raw_value) SELECT 100,t,t,'observed',1,'1' FROM generate_series('2025-02-01 00:00:00+08'::timestamptz,'2025-03-01 00:00:00+08'::timestamptz,interval '5 minutes') t");
  service.saveOffset(101,"pvEnergy","DAILY","2025-02-01",new StationMetricService.OffsetRequest("-2","日校准",0L));
  service.saveOffset(101,"pvEnergy","TOTAL","1970-01-01",new StationMetricService.OffsetRequest("10","累计校准",0L));
  service.recalculate(101,new StationMetricService.RecalculateRequest("2025-02-01","2025-02-28"));
  var result=service.results(101,"2025-02-01","2025-02-28");
  var month=result.months().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow();
  assertEquals("672.00",month.rawValue());assertEquals("670.00",month.correctedValue());assertEquals("680.00",month.calibratedTotal());assertEquals(28,month.completeDays());
  service.saveOffset(101,"pvEnergy","TOTAL","1970-01-01",new StationMetricService.OffsetRequest("20","累计替换",1L));
  var recalibrated=service.results(101,"2025-02-01","2025-02-28").months().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow();
  assertEquals("690.00",recalibrated.calibratedTotal());assertEquals(28,recalibrated.completeDays());
  var year=result.years().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow();assertNull(year.correctedValue());assertEquals(28,year.completeDays());
  assertEquals(8065,db.queryForObject("SELECT count(*) FROM reference_device_sample WHERE value=1",Integer.class));
  service.saveOffset(101,"pvEnergy","DAILY","2025-02-01",new StationMetricService.OffsetRequest("0","重置日偏移",1L));
  assertEquals(27,db.queryForObject("SELECT count(*) FROM station_metric_result WHERE metric_key='pvEnergy' AND period='DAY' AND status='complete'",Integer.class));
  assertEquals(27,service.results(101,"2025-02-01","2025-02-28").months().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow().completeDays());
  db.execute("INSERT INTO measurement_point VALUES(11,1,'pv2'); INSERT INTO reference_device_point VALUES(101,1,'发电功率2','kW'); INSERT INTO stored_device_point_binding VALUES(11,101,101,'pvPower')");
  assertEquals("ambiguous",service.source(101,"pvEnergy").status());
  var ambiguous=service.results(101,"2025-02-01","2025-02-28");
  assertTrue(ambiguous.days().stream().filter(r->r.metricKey().equals("pvEnergy")).allMatch(r->r.rawValue()==null));
  assertTrue(ambiguous.months().stream().filter(r->r.metricKey().equals("pvEnergy")).allMatch(r->r.rawValue()==null));
  assertTrue(ambiguous.years().stream().filter(r->r.metricKey().equals("pvEnergy")).allMatch(r->r.rawValue()==null));
  service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("STATIC",null,0L));assertEquals(0,db.queryForObject("SELECT count(*) FROM station_metric_result WHERE metric_key='pvEnergy'",Integer.class));
 }
 @Test void latestSourceValueIsRealAndOnlyVisibleWithTelemetryPermission(){
  db.execute("INSERT INTO reference_device_sample(point_id,source_at,captured_at,quality,value,raw_value) VALUES(100,'2025-02-01 00:00+08','2025-02-01 00:00+08','observed',12.25,'12.25')");
  var latest=service.source(101,"pvEnergy");assertEquals("12.25",latest.lastValue());assertNotNull(latest.sourceTime());
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"telemetry.read");
  var config=service.source(101,"pvEnergy");assertNull(config.lastValue());assertNull(config.sourceTime());assertEquals("resolved",config.status());
 }
 @Test void stationTimezoneAndDstDetermineIntegrationBoundariesAndOldZoneResultsAreNotReused(){
  db.update("UPDATE station_profile SET timezone='Europe/Madrid' WHERE station_id=101");
  db.execute("INSERT INTO reference_device_sample(point_id,source_at,captured_at,quality,value,raw_value) SELECT 100,t,t,'observed',1,'1' FROM generate_series('2025-03-30 00:00:00+01'::timestamptz,'2025-03-31 00:00:00+02'::timestamptz,interval '5 minutes') t");
  service.recalculate(101,new StationMetricService.RecalculateRequest("2025-03-30","2025-03-30"));
  var day=service.results(101,"2025-03-30","2025-03-30").days().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow();assertEquals("23.00",day.rawValue());
  db.update("UPDATE station_profile SET timezone='Asia/Shanghai' WHERE station_id=101");
  assertNull(service.results(101,"2025-03-30","2025-03-30").days().stream().filter(r->r.metricKey().equals("pvEnergy")).findFirst().orElseThrow().rawValue());
  db.update("UPDATE station_profile SET timezone='unknown' WHERE station_id=101");
  failure(400,()->service.recalculate(101,new StationMetricService.RecalculateRequest("2025-03-30","2025-03-30")));
 }
 @Test void revokedPermissionInsideLockPreventsWritesAndTelemetryReadIsRequired(){
  doNothing().doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"asset.edit");
  failure(403,()->service.saveSource(101,"pvEnergy",new StationMetricService.SourceRequest("STATIC","10",0L)));
  assertEquals(0,db.queryForObject("SELECT count(*) FROM station_metric_source",Integer.class));
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(102,"telemetry.read");
  failure(403,()->service.recalculate(102,new StationMetricService.RecalculateRequest("2025-01-01","2025-01-01")));
  assertThrows(BusinessException.class,()->service.results(102,"2025-01-01","2025-01-01"));
 }
}
