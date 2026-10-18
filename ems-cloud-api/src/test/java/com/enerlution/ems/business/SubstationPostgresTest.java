package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.math.BigDecimal;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class SubstationPostgresTest {
 JdbcTemplate db; AccessControl access; SubstationService service; StationTelemetryService telemetry;
 DataSourceTransactionManager manager; TransactionStatus outer;
 @BeforeEach void setup() throws Exception {
  var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  String schema="substation_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("""
   CREATE TABLE tenant(id bigint PRIMARY KEY);
   CREATE TABLE app_user(id bigint PRIMARY KEY,tenant_id bigint);
   CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint,asset_type text,rated_power_kw numeric,capacity_kwh numeric);
   CREATE TABLE station_profile(station_id bigint PRIMARY KEY,solar_capacity_kw numeric);
   CREATE TABLE device(id bigint PRIMARY KEY,station_id bigint REFERENCES station(id),name text,code text);
   CREATE TABLE measurement_point(id bigint PRIMARY KEY,device_id bigint REFERENCES device(id));
   CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint,target_tenant_id bigint,action text,detail text);
   INSERT INTO tenant VALUES(11),(22);
   INSERT INTO app_user VALUES(7,11);
   INSERT INTO station VALUES(101,11,'Hybrid',100,200),(102,22,'PV',100,100);
   INSERT INTO station_profile VALUES(101,50),(102,null);
   INSERT INTO device VALUES(19,101,'Solar meter','s19'),(20,101,'Storage meter','s20'),(30,102,'Foreign','s30');
   INSERT INTO measurement_point VALUES(190,19),(191,19),(200,20),(300,30);
   """);
  db.execute("ALTER TABLE device ADD COLUMN archived_at timestamptz"); db.execute("ALTER TABLE app_user ADD COLUMN display_name text");
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V44__station_operation_logs.sql")));
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V43__substations.sql")));
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V50__substation_archive.sql")));
  access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
  telemetry=mock(StationTelemetryService.class);service=new SubstationService(new DomainSupport(db,access),telemetry);
 }
 static String required(String name){return Objects.requireNonNull(System.getenv(name),name+" required");}
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 SubstationService.Request request(String name,String capacity,Long version){return new SubstationService.Request(name,List.of("pv"),new BigDecimal(capacity),null,null,null,null,null,null,null,null,null,version);}
 UUID id(Map<String,Object> child){return UUID.fromString(child.get("id").toString());}
 void failure(int status,Runnable action){
  var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
  try{assertEquals(status,assertThrows(BusinessException.class,action::run).status());}finally{manager.rollback(nested);}
 }
 @Test void createPersistBeforeBindingCapacityAndOptimisticVersionAreIndependentPerChild(){
  var a=service.create(101,request("A","40",null));var b=service.create(101,request("B","40",null));
  assertEquals("pending_devices",a.get("state"));assertEquals(List.of(),a.get("deviceIds"));assertEquals(2,service.list(101).size());
  failure(400,()->service.create(101,request("Large","51",null)));failure(409,()->service.create(101,request("a","1",null)));
  var changed=service.update(101,id(a),request("Updated","50",1L));assertEquals(2L,changed.get("version"));
  failure(409,()->service.update(101,id(a),request("Stale","1",1L)));assertEquals("B",service.detail(101,id(b)).get("name"));
  service.create(102,request("Unknown limit","500",null));assertNull(service.capabilities(102).get("solarCapacityKw"));
 }
 @Test void replaceIsAtomicExclusiveAndNeverMovesCanonicalStation(){
  var a=service.create(101,request("A","10",null));var b=service.create(101,request("B","10",null));
  var bound=service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("19"),1L));
  assertEquals("ready",bound.get("state"));assertEquals(List.of("19"),bound.get("deviceIds"));assertEquals(2L,bound.get("version"));
  failure(409,()->service.replaceDevices(101,id(b),new SubstationService.BindRequest(List.of("20","19"),1L)));
  failure(403,()->service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("20","30"),2L)));
  assertEquals(List.of(19L),db.queryForList("SELECT device_id FROM substation_device",Long.class));assertEquals(101L,db.queryForObject("SELECT station_id FROM device WHERE id=19",Long.class));
  var empty=service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of(),2L));assertEquals("pending_devices",empty.get("state"));assertEquals(3L,empty.get("version"));
  assertEquals(List.of(),empty.get("deviceIds"));
  service.replaceDevices(101,id(b),new SubstationService.BindRequest(List.of("19","20"),1L));assertEquals(2L,service.detail(101,id(b)).get("deviceCount"));
 }
 @Test void databaseGuardsRejectCrossParentAndCanonicalMove(){
  var a=service.create(101,request("A","10",null));
  var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
  try{assertThrows(DataIntegrityViolationException.class,()->db.update("INSERT INTO substation_device(device_id,station_id,substation_id,created_by) VALUES(30,101,?,7)",id(a)));}finally{manager.rollback(nested);}
  service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("19"),1L));
  nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
  try{assertThrows(DataIntegrityViolationException.class,()->db.update("UPDATE device SET station_id=102 WHERE id=19"));}finally{manager.rollback(nested);}
 }
 @Test void emptyTelemetryCannotLeakParentAndLinkedTelemetryRechecksPermissionsAndMembership(){
  var a=service.create(101,request("A","10",null));assertEquals(List.of(),service.telemetry(101,id(a)).get("items"));verifyNoInteractions(telemetry);
  service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("19"),1L));
  when(telemetry.snapshot(101,List.of(190L,191L),false)).thenReturn(Map.of("items",List.of(Map.of("pointId","190","value",0))));
  assertEquals(1,((List<?>)service.telemetry(101,id(a)).get("items")).size());verify(telemetry).snapshot(101,List.of(190L,191L),false);
  when(telemetry.snapshot(101,List.of(190L,191L),false)).thenAnswer(inv->{service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("20"),2L));return Map.of("items",List.of());});
  assertEquals(409,assertThrows(BusinessException.class,()->service.telemetry(101,id(a))).status());
  doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"asset.read");
  assertThrows(BusinessException.class,()->service.detail(101,id(a)));assertThrows(BusinessException.class,()->service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of(),3L)));
 }
 @Test void auditFailureRollsBackMembershipAndVersion(){
  var a=service.create(101,request("A","10",null));service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("19"),1L));
  db.execute("ALTER TABLE audit_event ADD CONSTRAINT reject_next CHECK(action <> 'substation.devices-replace') NOT VALID");
  var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
  try{assertThrows(DataIntegrityViolationException.class,()->service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("20"),2L)));}finally{manager.rollback(nested);}
  assertEquals(List.of(19L),db.queryForList("SELECT device_id FROM substation_device",Long.class));assertEquals(2L,service.detail(101,id(a)).get("version"));
 }
 @Test void telemetryDenialAppliesEvenToEmptyChildAndRevocationDuringRead(){
  var a=service.create(101,request("A","10",null));
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"telemetry.read");
  assertEquals(403,assertThrows(BusinessException.class,()->service.telemetry(101,id(a))).status());verifyNoInteractions(telemetry);
  doNothing().when(access).requireStationPermission(101,"telemetry.read");
  service.replaceDevices(101,id(a),new SubstationService.BindRequest(List.of("19"),1L));
  when(telemetry.snapshot(101,List.of(190L,191L),false)).thenAnswer(inv->{doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"telemetry.read");return Map.of("items",List.of());});
  assertEquals(403,assertThrows(BusinessException.class,()->service.telemetry(101,id(a))).status());
 }
 @Test void archivePreservesHistoryReleasesDevicesAndRejectsStaleOrForeignRequests(){
  var child=service.create(101,request("Archive","10",null));
  service.replaceDevices(101,id(child),new SubstationService.BindRequest(List.of("19"),1L));
  failure(409,()->service.archive(101,id(child),new SubstationService.DeleteRequest(1L)));
  failure(404,()->service.archive(102,id(child),new SubstationService.DeleteRequest(2L)));
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.edit");
  failure(403,()->service.archive(101,id(child),new SubstationService.DeleteRequest(2L)));
  doNothing().when(access).requireStationPermission(101,"asset.edit");
  service.archive(101,id(child),new SubstationService.DeleteRequest(2L));
  assertTrue(service.list(101).isEmpty());
  failure(404,()->service.detail(101,id(child)));
  failure(404,()->service.replaceDevices(101,id(child),new SubstationService.BindRequest(List.of("20"),3L)));
  assertEquals(List.of(19L),db.queryForList("SELECT device_id FROM substation_device_history WHERE substation_id=?",Long.class,id(child)));
  assertEquals(0,db.queryForObject("SELECT count(*) FROM substation_device",Integer.class));
  assertEquals(2,db.queryForObject("SELECT count(*) FROM measurement_point WHERE device_id=19",Integer.class));
  var replacement=service.create(101,request("Archive","10",null));
  service.replaceDevices(101,id(replacement),new SubstationService.BindRequest(List.of("19"),1L));
  assertEquals(1,db.queryForObject("SELECT count(*) FROM audit_event WHERE action='substation.archive'",Integer.class));
 }
 @Test void archiveAuditFailureRollsBackArchiveAndMembership(){
  var child=service.create(101,request("Rollback","10",null));
  service.replaceDevices(101,id(child),new SubstationService.BindRequest(List.of("19"),1L));
  db.execute("ALTER TABLE audit_event ADD CONSTRAINT reject_archive CHECK(action <> 'substation.archive') NOT VALID");
  var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
  try{assertThrows(DataIntegrityViolationException.class,()->service.archive(101,id(child),new SubstationService.DeleteRequest(2L)));}finally{manager.rollback(nested);}
  assertEquals(2L,service.detail(101,id(child)).get("version"));
  assertEquals(List.of("19"),service.detail(101,id(child)).get("deviceIds"));
  assertEquals(0,db.queryForObject("SELECT count(*) FROM substation_device_history",Integer.class));
 }
 @Test void archivedDevicesAreNotCandidatesOrNewBindingsAndExistingLinksSurviveReplacement(){
  var child=service.create(101,request("Archived boundary","10",null));
  service.replaceDevices(101,id(child),new SubstationService.BindRequest(List.of("19"),1L));
  db.update("UPDATE device SET archived_at=now() WHERE id IN (19,20)");
  assertTrue(service.devices(101).isEmpty());
  failure(409,()->service.replaceDevices(101,id(child),new SubstationService.BindRequest(List.of("20"),2L)));
  service.replaceDevices(101,id(child),new SubstationService.BindRequest(List.of(),2L));
  assertEquals(List.of(19L),db.queryForList("SELECT device_id FROM substation_device WHERE substation_id=?",Long.class,id(child)));
 }}
