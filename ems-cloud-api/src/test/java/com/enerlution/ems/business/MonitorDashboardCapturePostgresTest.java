package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.DefaultTransactionDefinition;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class MonitorDashboardCapturePostgresTest {
 JdbcTemplate db;DataSourceTransactionManager manager;TransactionStatus transaction;
 @BeforeEach void start(){
  var source=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(source);transaction=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(source);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
 }
 @AfterEach void rollback(){if(transaction!=null)manager.rollback(transaction);}
 @Test void sourceTotalsRoundTripOnlyForCompleteScopeAndAlarmFieldsStayRestricted(){
  long a=db.queryForObject("insert into station(code,name,tenant_id,manager_id,rated_power_kw,capacity_kwh,asset_type) values(?,?,2,2,1,2,'BESS') returning id",Long.class,"DASH-"+UUID.randomUUID(),"Dashboard fixture A");
  long b=db.queryForObject("insert into station(code,name,tenant_id,manager_id,rated_power_kw,capacity_kwh,asset_type) values(?,?,2,2,1,2,'BESS') returning id",Long.class,"DASH-"+UUID.randomUUID(),"Dashboard fixture B");
  long id=db.queryForObject("insert into monitor_dashboard_capture(source_host,captured_at,source_updated_at,payload,source_fingerprint) values('ess-cloud-login.qudeox.com',clock_timestamp(),now()-interval '1 hour','{\"summary\":{\"alarmSites\":1,\"totals\":{\"storageEfficiency\":{\"value\":100}}},\"cards\":{}}',repeat('c',64)) returning id",Long.class);
  db.update("insert into monitor_dashboard_capture_station values(?,?),(?,?)",id,a,id,b);
  db.update("update monitor_dashboard_capture set payload=jsonb_set(payload,'{cards}','{\"pvPeak7\":{\"verified\":true,\"trend\":{\"points\":[{\"date\":\"2026-10-11\",\"values\":{\"metric\":0}},{\"date\":\"2026-10-12\",\"values\":{\"metric\":null}}]}}}') where id=?",id);
  var rows=List.<Map<String,Object>>of(Map.of("id",Long.toString(a),"telemetryAllowed",true,"alarmAllowed",true),Map.of("id",Long.toString(b),"telemetryAllowed",true,"alarmAllowed",true));
  var domain=new DomainSupport(db,mock(AccessControl.class));var json=new ObjectMapper();var query=MonitorWorkspaceRules.query(Map.of("scope","imported"));
  var found=MonitorDashboardCapture.read(domain,json,rows,query);assertNotNull(found);assertEquals("ess-cloud-login.qudeox.com",found.get("sourceHost"));
  var points=json.valueToTree(found).path("cards").path("pvPeak7").path("trend").path("points");assertEquals(0,points.get(0).path("values").path("metric").asInt());assertTrue(points.get(1).path("values").path("metric").isNull());
  var summary=(Map<?,?>)found.get("summary");assertEquals(1,summary.get("alarmSites"));assertEquals(100,((Map<?,?>)((Map<?,?>)summary.get("totals")).get("storageEfficiency")).get("value"));
  assertNull(MonitorDashboardCapture.read(domain,json,rows.subList(0,1),query));
  assertNull(MonitorDashboardCapture.read(domain,json,rows,MonitorWorkspaceRules.query(Map.of("scope","imported","sourceMode","current"))));
  var hidden=MonitorDashboardCapture.read(domain,json,List.of(rows.getFirst(),Map.of("id",Long.toString(b),"telemetryAllowed",true,"alarmAllowed",false)),query);assertNull(((Map<?,?>)hidden.get("summary")).get("alarmSites"));
 }
}
