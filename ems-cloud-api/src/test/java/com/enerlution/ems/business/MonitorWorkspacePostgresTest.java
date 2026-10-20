package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.DefaultTransactionDefinition;

@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class MonitorWorkspacePostgresTest {
 JdbcTemplate db;DataSourceTransactionManager manager;TransactionStatus transaction;AccessControl access;MonitorWorkspaceService service;long a,b;String prefix;DomainSupport domain;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(ds);transaction=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  prefix="MON-"+UUID.randomUUID();
  a=db.queryForObject("INSERT INTO station(code,name,manager_id,rated_power_kw,capacity_kwh,asset_type,tenant_id,region) VALUES(?,?,2,10,20,'Hybrid',2,'East') RETURNING id",Long.class,prefix+"a",prefix+"a");
  b=db.queryForObject("INSERT INTO station(code,name,manager_id,rated_power_kw,capacity_kwh,asset_type,tenant_id,region) VALUES(?,?,2,30,60,'BESS',2,'West') RETURNING id",Long.class,prefix+"b",prefix+"b");
  db.update("INSERT INTO station_profile(station_id,solar_capacity_kw,commissioned_on,details) VALUES(?,100,current_date,'{\"siteType\":\"commercial\"}')",a);
  db.update("INSERT INTO monitor_station_capture(station_id,captured_at,source_updated_at,communication,charge_status,metrics,source_host,source_fingerprint) VALUES(?,now(),now()-interval '1 day','online','charging','{\"pvPower\":0,\"pvTotal\":12,\"storageTotalCharged\":100,\"storageTotalDischarged\":80}','ess-cloud-login.qudeox.com',repeat('a',64))",a);
  db.update("INSERT INTO monitor_station_capture(station_id,captured_at,source_updated_at,communication,metrics,source_host,source_fingerprint) VALUES(?,now(),now()-interval '1 day','offline','{\"storageTotalCharged\":200}','ess-cloud-login.qudeox.com',repeat('b',64))",b);
  access=mock(AccessControl.class);ScopeTestSupport.useStationIdStubs(access);when(access.userId()).thenReturn(2L);when(access.client()).thenReturn("web");when(access.context()).thenReturn(new TenantContext(2,2,"enterprise",true));when(access.hasStationPermission(eq(2L),anyLong(),anyString(),eq("web"))).thenReturn(true);
  for(String code:List.of("asset.read","telemetry.read","alarm.read"))when(access.stationIds(code)).thenReturn(List.of(a,b));
  domain=new DomainSupport(db,access);service=create();
 }
 MonitorWorkspaceService create(){var telemetry=mock(StationTelemetryService.class);when(telemetry.monitorSnapshot(anyLong())).thenReturn(Map.of("items",List.of()));return new MonitorWorkspaceService(domain,new ObjectMapper(),telemetry);}
 @AfterEach void rollback(){if(transaction!=null)manager.rollback(transaction);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> items(Map<String,Object> data){return (List<Map<String,Object>>)data.get("items");}
 Map<String,String> query(){return Map.of("search",prefix,"sourceMode","capture");}
 @Test void filtersSortAndExportApplyBeforePaginationWithoutTurningMissingIntoZero(){
  var response=service.workspace(Map.of("search",prefix,"sourceMode","capture","limit","1","sort","pvPower","direction","DESC"),false);
  assertEquals(2,response.get("total"));assertEquals(Long.toString(a),items(response).getFirst().get("id"));assertEquals(1,items(response).size());
  var summary=(Map<?,?>)response.get("summary");assertEquals(2,summary.get("total"));
  assertEquals(1,items(service.workspace(Map.of("search",prefix,"chargeStatus","charging","minCapacity","0","maxCapacity","100"),false)).size());
  assertEquals(0,items(service.workspace(Map.of("search",prefix,"minCapacity","101"),false)).size());
  assertEquals(2,items(service.workspace(Map.of("search",prefix,"limit","1"),true)).size());verify(access).requireStationPermission(a,"report.export");verify(access).requireStationPermission(b,"report.export");
 }
 @Test void preferencesRoundTripRejectStaleSaveAndFilterRevokedWatchEntries(){
  db.update("DELETE FROM monitor_user_workspace WHERE user_id=2 AND tenant_id=2 AND client='web'");
  var value=service.savePreferences(new MonitorWorkspaceService.SavePreference(Map.of("fieldView","storage","refreshMinutes",3),List.of(Long.toString(a)),0L));assertEquals(1,value.version());
  assertEquals(value,create().preferences());
  assertEquals(409,assertThrows(BusinessException.class,()->service.savePreferences(new MonitorWorkspaceService.SavePreference(Map.of(),List.of(),0L))).status());
  when(access.stationIds("asset.read")).thenReturn(List.of(b));assertEquals(List.of(),service.preferences().watchedStationIds());
 }
 @Test void capturesStayHiddenWithoutTelemetryAndCurrentViewCannotUseOldCapturedEnergy(){
  when(access.stationIds("telemetry.read")).thenReturn(List.of(b));
  var first=items(service.workspace(Map.of("stationId",Long.toString(a)),false)).getFirst();assertEquals(null,first.get("capturedAt"));assertFalse(((Map<?,?>)first.get("metrics")).containsKey("pvTotal"));assertEquals("unknown",first.get("communication"));
  when(access.stationIds("telemetry.read")).thenReturn(List.of(a,b));
  var current=items(service.workspace(Map.of("stationId",Long.toString(a),"sourceMode","current"),false)).getFirst();assertFalse(((Map<?,?>)current.get("metrics")).containsKey("pvTotal"));assertEquals("unknown",current.get("communication"));assertEquals("current",current.get("source"));
 }
 @Test void stationTagsAndTenantBoundaryAreEnforcedByTheReadQuery(){
  var id=UUID.randomUUID();db.update("INSERT INTO station_tag(id,tenant_id,created_by,name) VALUES(?,2,2,?)",id,prefix);db.update("INSERT INTO station_tag_link(station_id,tag_id,tenant_id,created_by) VALUES(?,?,2,2)",a,id);
  assertEquals(List.of(Long.toString(a)),items(service.workspace(Map.of("search",prefix,"tagId",id.toString()),false)).stream().map(r->r.get("id")).toList());
  long tenant=db.queryForObject("INSERT INTO tenant(id,kind) SELECT max(id)+100,'enterprise' FROM tenant RETURNING id",Long.class);
  long foreign=db.queryForObject("INSERT INTO station(code,name,rated_power_kw,capacity_kwh,asset_type,tenant_id) VALUES(?,?,1,1,'BESS',?) RETURNING id",Long.class,prefix+"x",prefix+"x",tenant);
  assertEquals(0,service.workspace(Map.of("stationId",Long.toString(foreign)),false).get("total"));
 }
 @Test void telemetryReadCannotReturnRowsAfterStationScopeIsRevoked(){
  var revoked=new java.util.concurrent.atomic.AtomicBoolean(false);
  when(access.stationIds("asset.read")).thenAnswer(invocation->revoked.get()?List.of():List.of(a,b));
  when(access.stationIds("telemetry.read")).thenReturn(List.of(a,b));when(access.stationIds("alarm.read")).thenReturn(List.of(a,b));
  var telemetry=mock(StationTelemetryService.class);when(telemetry.monitorSnapshot(anyLong())).thenAnswer(invocation->{revoked.set(true);return Map.of("items",List.of());});
  var reader=new MonitorWorkspaceService(domain,new ObjectMapper(),telemetry);
  assertEquals(403,assertThrows(BusinessException.class,()->reader.workspace(Map.of("sourceMode","current","stationId",Long.toString(a)),false)).status());
 }
 Map<String,Object> sample(long point,Object value,long time,boolean stale){
  var row=new HashMap<String,Object>();row.put("namespace","cabinet");row.put("sourceId",point);row.put("value",value);row.put("sourceTime",time);row.put("quality","valid");if(stale)row.put("staleReason","expired");return row;
 }
 @Test void liveValuesKeepCatalogUnitsAndSortBeforePaginationAndExport(){
  var telemetry=mock(StationTelemetryService.class);long now=System.currentTimeMillis();
  var counts=Map.of("cabinet:20107",1L,"cabinet:20018",1L);
  when(telemetry.monitorSnapshot(eq(a))).thenReturn(Map.of("mappingCounts",counts,"items",List.of(sample(20107,BigDecimal.ZERO,now-1000,false),sample(20018,20,now-1000,false))));
  when(telemetry.monitorSnapshot(eq(b))).thenReturn(Map.of("mappingCounts",counts,"items",List.of(sample(20107,new BigDecimal("125.5"),now,false),sample(20018,80,now,false))));
  var reader=new MonitorWorkspaceService(domain,new ObjectMapper(),telemetry);
  for(String key:List.of("pvPower","storageSoc","updatedAt")){
   var result=items(reader.workspace(Map.of("search",prefix,"sourceMode","current","sort",key,"direction","DESC","limit","1"),false));
   assertEquals(Long.toString(b),result.getFirst().get("id"),key+" must sort the complete filtered set before paging");
   assertEquals(new BigDecimal("125.5"),((Map<?,?>)result.getFirst().get("metrics")).get("pvPower"));
  }
  var exported=items(reader.workspace(Map.of("search",prefix,"sourceMode","current","sort","pvPower","direction","DESC","limit","1"),true));
  assertEquals(List.of(Long.toString(b),Long.toString(a)),exported.stream().map(r->r.get("id")).toList());assertEquals(BigDecimal.ZERO,((Map<?,?>)exported.get(1).get("metrics")).get("pvPower"));
 }
 @Test void ambiguousCabinetMappingCannotBecomeStationPowerWhenOneValueIsStale(){
  var telemetry=mock(StationTelemetryService.class);long now=System.currentTimeMillis();
  when(telemetry.monitorSnapshot(eq(a))).thenReturn(Map.of("mappingCounts",Map.of("cabinet:20107",2L),"items",List.of(sample(20107,125,now,false),sample(20107,40,now-900000,true))));
  var reader=new MonitorWorkspaceService(domain,new ObjectMapper(),telemetry);
  var row=items(reader.workspace(Map.of("stationId",Long.toString(a),"sourceMode","current"),false)).getFirst();
  assertFalse(((Map<?,?>)row.get("metrics")).containsKey("pvPower"));assertNull(row.get("updatedAt"));
  when(telemetry.monitorSnapshot(eq(a))).thenReturn(Map.of("mappingCounts",Map.of("cabinet:20107",2L),"items",List.of(sample(20107,125,now,false))));
  assertFalse(((Map<?,?>)items(reader.workspace(Map.of("stationId",Long.toString(a),"sourceMode","current"),false)).getFirst().get("metrics")).containsKey("pvPower"));
 }
 @Test void replicaIncludesExplicitLocalSitesWithoutPretendingTheyWereImportedAndHidesArchives(){
  db.update("UPDATE station SET replica_visible=true WHERE id=?",a);
  var params=Map.of("search",prefix,"scope","replica");var rows=items(service.workspace(params,false));assertEquals(1,rows.size());assertEquals(Long.toString(a),rows.getFirst().get("id"));assertEquals(false,rows.getFirst().get("imported"));
  db.update("UPDATE station SET archived_at=now() WHERE id=?",a);assertTrue(items(service.workspace(params,false)).isEmpty());
 } @Test void businessGroupScopeAppliesBeforeSummaryFacetsPaginationAndExport(){
  var groups=mock(StationBusinessGroupService.class);
  when(groups.stationScope("group:a")).thenReturn(List.of(a));when(groups.stationScope("group:empty")).thenReturn(List.of());
  var telemetry=mock(StationTelemetryService.class);
  var scoped=new MonitorWorkspaceService(domain,new ObjectMapper(),telemetry,groups);
  var response=scoped.workspace(Map.of("search",prefix,"businessGroupId","group:a","limit","1"),false);
  assertEquals(1,response.get("total"));assertEquals(Long.toString(a),items(response).getFirst().get("id"));
  assertEquals(1,((Map<?,?>)response.get("summary")).get("total"));
  assertEquals(0,scoped.workspace(Map.of("businessGroupId","group:empty"),false).get("total"));
  var exported=scoped.workspace(Map.of("search",prefix,"businessGroupId","group:a"),true);
  assertEquals(1,items(exported).size());verify(access).requireStationPermission(a,"report.export");
  verify(access,never()).requireStationPermission(b,"report.export");
 }
}


