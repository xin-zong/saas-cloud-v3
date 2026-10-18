package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class ReferenceLifecyclePostgresTest {
 JdbcTemplate db; AccessControl access; ReferenceLifecycleService service; TenantGrantService grants; DataSourceTransactionManager manager; TransactionStatus outer;
 @BeforeEach void setup() throws Exception {
  var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("SELECT current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("SELECT current_user",String.class));
  String schema="lifecycle_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema+",public");
  for(String table:List.of("station","station_profile","device","device_reference_profile","audit_event","station_audit_event","app_user"))db.execute("CREATE TABLE "+table+" (LIKE public."+table+" INCLUDING ALL)");
  db.execute("ALTER TABLE station ALTER COLUMN id RESTART WITH 900000000; ALTER TABLE device ALTER COLUMN id RESTART WITH 900000000");
  db.execute("ALTER TABLE station DROP COLUMN IF EXISTS lifecycle_version, DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS replica_visible; ALTER TABLE device DROP COLUMN IF EXISTS lifecycle_version, DROP COLUMN IF EXISTS archived_at"); db.execute(Files.readString(Path.of("src/main/resources/db/migration/V48__reference_asset_lifecycle.sql")));
  db.update("INSERT INTO app_user(id,account,display_name,password_hash,tenant_id,status) VALUES(900000000,'lifecycle-test@example.invalid','Test','unused',11,'active')");
  access=mock(AccessControl.class);when(access.userId()).thenReturn(900000000L);when(access.context()).thenReturn(new TenantContext(900000000L,11L,"enterprise",true));when(access.hasPermission("asset.edit")).thenReturn(true);
  grants=mock(TenantGrantService.class);service=new ReferenceLifecycleService(new DomainSupport(db,access),grants);
 }
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 Map<String,Object> station(){return new LinkedHashMap<>(Map.of("name","Lifecycle test","address","Test address","region","Test","timezone","Asia/Shanghai","longitude",120,"latitude",30,"systems",List.of("PV"),"siteType","commercial"));}
 @Test void persistenceVersionsArchiveAndNoFakeImport(){
  var created=service.createStation(station());long id=Long.parseLong(created.get("id").toString());assertEquals(0L,created.get("version"));assertNull(created.get("ratedPowerKw"));
  assertEquals(0,db.queryForObject("SELECT count(*) FROM station_reference_import WHERE station_id=?",Integer.class,id));
  var body=station();body.put("expectedVersion",0);body.put("name","Changed");assertEquals("Changed",service.updateStation(id,body).get("name"));
  assertEquals(409,assertThrows(BusinessException.class,()->service.updateStation(id,body)).status());
  service.archiveStation(id,Map.of("expectedVersion",1));assertEquals(410,assertThrows(BusinessException.class,()->service.station(id)).status());
  assertEquals(3,db.queryForObject("SELECT count(*) FROM station_audit_event WHERE station_id=?",Integer.class,id));
 }
 @Test void deviceMovesOnlyWithinTenantAndRetainsIdentity(){
  long a=Long.parseLong(service.createStation(station()).get("id").toString()),b=Long.parseLong(service.createStation(station()).get("id").toString());
  var body=new LinkedHashMap<String,Object>(Map.of("stationId",Long.toString(a),"name","Meter","serial","lifecycle-"+UUID.randomUUID(),"type","meter"));
  var d=service.createDevice(body);long id=Long.parseLong(d.get("id").toString());assertEquals("meter",d.get("type"));
  assertEquals(Long.toString(b),service.assignDevice(id,Map.of("expectedVersion",0,"stationId",Long.toString(b))).get("stationId"));
  db.update("UPDATE station SET tenant_id=22 WHERE id=?",a);
  assertEquals(403,assertThrows(BusinessException.class,()->service.assignDevice(id,Map.of("expectedVersion",1,"stationId",Long.toString(a)))).status());
  service.archiveDevice(id,Map.of("expectedVersion",1));assertEquals(410,assertThrows(BusinessException.class,()->service.device(id)).status());
 }
 @Test void deniedCreateAndInvalidFieldsDoNotPersist(){
  when(access.context()).thenReturn(new TenantContext(900000000L,11L,"enterprise",false));assertEquals(403,assertThrows(BusinessException.class,()->service.createStation(station())).status());
  when(access.context()).thenReturn(new TenantContext(900000000L,11L,"enterprise",true));var invalid=station();invalid.put("timezone","not-a-zone");assertEquals(400,assertThrows(BusinessException.class,()->service.createStation(invalid)).status());assertEquals(0,db.queryForObject("SELECT count(*) FROM station",Integer.class));
 }
 @Test void assignmentDelegatesToExistingGrantPolicyAndDoesNotChangeTenant(){
  long id=Long.parseLong(service.createStation(station()).get("id").toString());
  when(grants.create(any())).thenReturn(77L);
  service.assignStation(id,Map.of("expectedVersion",0,"userId","900000000","roleId","42"));
  verify(grants).create(argThat(g->g.userId()==900000000L&&g.roleId()==42L&&g.templateId()==null&&g.stationIds().equals(List.of(id))));
  assertEquals(11L,db.queryForObject("SELECT tenant_id FROM station WHERE id=?",Long.class,id));
  when(grants.create(any())).thenThrow(new BusinessException(403,"delegation denied"));
  assertEquals(403,assertThrows(BusinessException.class,()->service.assignStation(id,Map.of("expectedVersion",1,"userId","900000000","roleId","43"))).status());
  assertEquals(1L,service.station(id).get("version"));
 }
 @Test void deviceEditConflictsAndDeniedStationCannotWrite(){
  long station=Long.parseLong(service.createStation(station()).get("id").toString());
  var body=new LinkedHashMap<String,Object>(Map.of("stationId",Long.toString(station),"name","PCS","serial","lifecycle-"+UUID.randomUUID(),"type","pcs"));
  long id=Long.parseLong(service.createDevice(body).get("id").toString());body.put("name","Updated PCS");body.put("expectedVersion",0);body.put("ratedPowerKw",12);
  assertEquals("Updated PCS",service.updateDevice(id,body).get("name"));assertEquals(409,assertThrows(BusinessException.class,()->service.updateDevice(id,body)).status());
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(station,"asset.edit");
  assertEquals(403,assertThrows(BusinessException.class,()->service.archiveDevice(id,Map.of("expectedVersion",1))).status());assertEquals(1L,service.device(id).get("version"));
 } @Test void localDevicesAppearWithoutImportProvenanceAndArchivedDevicesDisappear(){
  long station=Long.parseLong(service.createStation(station()).get("id").toString());
  long id=Long.parseLong(service.createDevice(new LinkedHashMap<>(Map.of("stationId",Long.toString(station),"name","Local meter","serial","local-"+UUID.randomUUID(),"type","meter"))).get("id").toString());
  db.execute("CREATE VIEW saas_effective_station_permission AS SELECT 900000000::bigint AS user_id,'web'::text AS client,id AS station_id,'asset.read'::text AS permission_code FROM station");
  when(access.client()).thenReturn("web");when(access.stationIds("asset.read")).thenReturn(List.of(station));
  var directory=new ReferenceDeviceListService(new DomainSupport(db,access),mock(StoredDeviceTelemetryService.class));
  assertEquals(1,((List<?>)directory.list(station,false).get("items")).size());assertEquals(0,db.queryForObject("SELECT count(*) FROM device_reference_import WHERE device_id=?",Integer.class,id));
  service.archiveDevice(id,Map.of("expectedVersion",0));assertTrue(((List<?>)directory.list(station,false).get("items")).isEmpty());
 }}
