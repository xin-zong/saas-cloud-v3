package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import com.enerlution.ems.tenant.TenantQueryScope;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** Real isolated PG; new fixtures and all feature writes are rolled back after each test. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class MonitorDeviceAlarmPostgresTest {
 JdbcTemplate db; AccessControl access; DomainSupport s;
 DataSourceTransactionManager manager;TransactionStatus outer;long station,device,point,alarm;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(ds);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));
  assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  assertTrue(db.queryForObject("select exists(select 1 from schema_migration where version=36)",Boolean.class),"Apply reviewed migrations first");
  assertTrue(db.queryForObject("select exists(select 1 from saas_active_user where user_id=2 and tenant_id=2 and administrator)",Boolean.class));
  String key="MDA-"+UUID.randomUUID();
  station=db.queryForObject("INSERT INTO station(code,name,manager_id,rated_power_kw,capacity_kwh,asset_type,tenant_id) VALUES(?,?,2,10,20,'BESS',2) RETURNING id",Long.class,key,"[isolated transaction] "+key);
  device=db.queryForObject("INSERT INTO device(station_id,code,name,serial_number) VALUES(?,?,?,?) RETURNING id",Long.class,station,key,"Battery Cluster",key);
  db.update("INSERT INTO device_reference_profile(device_id,source_type,category) VALUES(?,'Battery Cluster','BMS')",device);
  db.update("INSERT INTO measurement_kind(code,name,unit) VALUES(?,?,'kW')",key,key);
  point=db.queryForObject("INSERT INTO measurement_point(device_id,kind_code,code) VALUES(?,?,?) RETURNING id",Long.class,device,key,key);
  alarm=db.queryForObject("INSERT INTO alarm(device_id,code,title,severity,occurred_at) VALUES(?,?,?,'warning',now()-interval '1 hour') RETURNING id",Long.class,device,key,key);
  access=mock(AccessControl.class);when(access.userId()).thenReturn(2L);
  when(access.context()).thenReturn(new TenantContext(2,2,"enterprise",true));
  when(access.stationPermissionTable()).thenReturn(TenantQueryScope.stationPermissions("web"));
  when(access.stationIds("asset.read")).thenReturn(List.of(station));
  s=new DomainSupport(db,access);
 }
 static String required(String key){return Objects.requireNonNull(System.getenv(key),key);}
 @AfterEach void rollback(){if(outer!=null)manager.rollback(outer);}
 void failure(int status,Runnable run){assertEquals(status,assertThrows(BusinessException.class,run::run).status());}
 @SuppressWarnings("unchecked") Map<String,Object> data(Object response){return (Map<String,Object>)((com.enerlution.ems.common.ApiResponse<?>)response).data();}
 @Test void deviceConfigurationPersistsAcrossReadersWithVersionAndEventAudit(){
  var controller=new DeviceDetailController(s,new ObjectMapper(),mock(StationTelemetryService.class));
  var values=Map.of("loopNum",new BigDecimal("2000"),"theorySoh",new BigDecimal("98.25"));
  var saved=data(controller.configure(station,device,new DeviceDetailController.Configuration(0,List.of(point),values)));
  assertEquals(1,((Number)saved.get("version")).intValue());
  var fresh=new DeviceDetailController(s,new ObjectMapper(),mock(StationTelemetryService.class));
  var detail=data(fresh.detail(station,device));
  assertEquals("battery-cluster",detail.get("type"));
  var configuration=(Map<?,?>)detail.get("configuration");
  assertEquals(List.of(point),configuration.get("selectedPointIds"));
  assertEquals(new BigDecimal("98.25"),((Map<?,?>)configuration.get("theoryValues")).get("theorySoh"));
  assertEquals(1,db.queryForObject("select count(*) from device_detail_configuration_event where device_id=?",Integer.class,device));
  failure(409,()->controller.configure(station,device,new DeviceDetailController.Configuration(0,List.of(point),values)));
  failure(400,()->controller.configure(station,device,new DeviceDetailController.Configuration(1,List.of(Long.MAX_VALUE),values)));
  assertEquals(1,db.queryForObject("select count(*) from device_detail_configuration_event where device_id=?",Integer.class,device));
 }
 @Test void personalLayoutVersionIsolationAndTemplateCascadeUseRealConstraints(){
  var service=new MonitorLayoutService(s,new ObjectMapper());var widgets=List.of(new MonitorLayoutService.Widget("站点运营概况",0,0,6,3));
  var before=service.get(null);
  var next=service.save(null,new MonitorLayoutService.Request(widgets,before.version()));
  assertEquals(before.version()+1,next.version());
  assertEquals(widgets,new MonitorLayoutService(s,new ObjectMapper()).get(null).widgets());
  failure(409,()->service.save(null,new MonitorLayoutService.Request(widgets,before.version())));
  var templates=new MonitorTemplateService(s);
  var template=templates.create(new MonitorTemplateService.TemplateRequest("MDA-"+UUID.randomUUID(),List.of("站点运营概况"),null));
  service.save(template.id(),new MonitorLayoutService.Request(widgets,0L));
  assertEquals(1,service.get(template.id()).version());
  db.update("delete from monitor_template where id=?",template.id());
  assertEquals(0,db.queryForObject("select count(*) from monitor_layout where template_id=?",Integer.class,template.id()));
 }
 @Test void readAcknowledgementCloseAndSoftDeleteRemainDistinctAndAudited(){
  var service=new AlarmWorkspaceService(s);
  assertEquals(false,service.detail(alarm).get("read_flag"));
  service.read(List.of(alarm,alarm));
  var afterRead=service.detail(alarm);
  assertEquals(true,afterRead.get("read_flag"));assertNull(afterRead.get("acknowledged_at"));
  assertEquals(1,((Number)afterRead.get("version")).intValue());
  service.action(alarm,"acknowledge",1,"PG acceptance acknowledgement");
  assertNotNull(service.detail(alarm).get("acknowledged_at"));
  failure(409,()->service.action(alarm,"close",1,"stale version"));
  service.action(alarm,"close",2,"PG acceptance manual close");
  var closed=service.detail(alarm);
  assertEquals("closed",closed.get("lifecycle"));assertNull(closed.get("recovered_at"));
  assertNotNull(closed.get("closed_at"));
  var history=service.list(station,"history",null,null,null,null,null,null,null,20,0);
  assertEquals(1,((Number)history.get("total")).intValue());
  service.action(alarm,"delete",3,"PG acceptance archive");
  failure(404,()->service.detail(alarm));
  assertEquals(3,db.queryForObject("select count(*) from alarm_action_event where alarm_id=?",Integer.class,alarm));
  assertEquals(1,db.queryForObject("select count(*) from alarm_read_receipt where alarm_id=?",Integer.class,alarm));
 }
 @Test void ruleCrudRevisionAndEnableArePersistentWithoutClaimingDetection(){
  var service=new AlarmRuleService(s);
  var condition=new AlarmRules.Condition(List.of(new AlarmRules.Field("power","kW","INSTANT","DEVICE")),"self",1,"gt",new BigDecimal("20"),null,null,true,false,false);
  var notification=new AlarmRuleService.Notification(false,1,List.of(),List.of(),false);
  var draft=new AlarmRuleService.Draft(station,"PG acceptance","DEVICE",device,"warning",List.of(condition),0,1440,60,"Inspect local data",notification,0);
  var created=service.create(draft);long id=((Number)created.get("id")).longValue();
  assertEquals("unavailable",created.get("evaluationStatus"));
  assertEquals(1,((List<?>)new AlarmRuleService(s).detail(id).get("conditions")).size());
  var disabled=service.toggle(id,1,false);assertEquals(false,disabled.get("enabled"));
  failure(409,()->service.toggle(id,1,true));
  assertEquals(2,service.history(id).size());
  service.delete(id,2);failure(404,()->service.detail(id));
  assertEquals(3,db.queryForObject("select count(*) from alarm_rule_revision where rule_id=?",Integer.class,id));
 }
}
