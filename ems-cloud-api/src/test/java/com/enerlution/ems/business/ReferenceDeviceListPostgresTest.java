package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class ReferenceDeviceListPostgresTest {
 JdbcTemplate db;AccessControl access;ReferenceDeviceListService service;DataSourceTransactionManager manager;TransactionStatus tx;List<Long> stations;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);var def=new DefaultTransactionDefinition();def.setReadOnly(true);tx=manager.getTransaction(def);db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  long actor=db.queryForObject("select min(user_id) from saas_effective_station_permission p join station_reference_import r on r.station_id=p.station_id where p.permission_code='asset.read' and p.client='web'",Long.class);
  stations=db.queryForList("select distinct p.station_id from saas_effective_station_permission p join station_reference_import r on r.station_id=p.station_id where p.user_id=? and p.permission_code='asset.read' and p.client='web'",Long.class,actor);
  access=mock(AccessControl.class);ScopeTestSupport.useStationIdStubs(access);when(access.userId()).thenReturn(actor);when(access.client()).thenReturn("web");for(String p:List.of("asset.read","telemetry.read","report.export"))when(access.stationIds(p)).thenReturn(stations);
  service=new ReferenceDeviceListService(new DomainSupport(db,access),new StoredDeviceTelemetryService(db,new ObjectMapper()));
 }
 @AfterEach void cleanup(){if(tx!=null)manager.rollback(tx);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> rows(Map<String,Object> data){return (List<Map<String,Object>>)data.get("items");}
 @Test void realDirectoryIsScopedAndTelemetryCanBeRedacted(){
  var all=rows(service.list(null,false));assertFalse(all.isEmpty());assertTrue(all.stream().allMatch(r->stations.contains(Long.valueOf(r.get("stationId").toString()))));assertTrue(all.stream().anyMatch(r->!((List<?>)r.get("points")).isEmpty()));
  when(access.stationIds("telemetry.read")).thenReturn(List.of());var redacted=rows(service.list(null,false));assertEquals(all.size(),redacted.size());assertTrue(redacted.stream().allMatch(r->((List<?>)r.get("points")).isEmpty()&&r.get("updatedAt")==null&&r.get("status").equals("unknown")));
 }
 @Test void foreignStationAndUnauthorizedExportFailClosed(){
  assertEquals(403,assertThrows(BusinessException.class,()->service.list(Long.MAX_VALUE,false)).status());
  long station=stations.getFirst();doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(station,"report.export");assertEquals(403,assertThrows(BusinessException.class,()->service.list(station,true)).status());
 }
 @Test void filteredExportChecksOnlySelectedStations(){
  var all=rows(service.list(null,false));var selected=all.getFirst();long sid=Long.parseLong(selected.get("stationId").toString());long did=Long.parseLong(selected.get("id").toString());
  for(long other:stations)if(other!=sid)doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(other,"report.export");
  assertEquals(1,rows(service.list(null,true,List.of(did))).size());
  verify(access,atLeastOnce()).requireStationPermission(sid,"report.export");
  assertEquals(403,assertThrows(BusinessException.class,()->service.list(null,true,List.of(Long.MAX_VALUE))).status());
 }

 @Test void businessGroupScopeFiltersDatabaseRowsBeforeDirectoryAndExport(){
  var groups=mock(StationBusinessGroupService.class);long selected=stations.getFirst();
  when(groups.stationScope("group:one")).thenReturn(List.of(selected));when(groups.stationScope("group:empty")).thenReturn(List.of());
  var scoped=new ReferenceDeviceListService(new DomainSupport(db,access),new StoredDeviceTelemetryService(db,new ObjectMapper()),groups);
  assertTrue(rows(scoped.list(null,false,null,"group:empty")).isEmpty());
  var filtered=rows(scoped.list(null,false,null,"group:one"));
  assertTrue(filtered.stream().allMatch(r->r.get("stationId").equals(Long.toString(selected))));
  var exported=rows(scoped.list(null,true,null,"group:one"));assertEquals(filtered.size(),exported.size());
  when(access.stationIds("telemetry.read")).thenReturn(List.of());
  assertTrue(rows(scoped.list(null,false,null,"group:one")).stream().allMatch(r->r.get("recordedStatus").equals("unknown")&&r.get("statusAt")==null));
 }
}

