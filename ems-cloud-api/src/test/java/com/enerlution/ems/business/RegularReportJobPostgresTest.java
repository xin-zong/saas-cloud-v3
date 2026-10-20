package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
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
class RegularReportJobPostgresTest {
 JdbcTemplate db;AccessControl access;RegularReportJobService service;DataSourceTransactionManager manager;TransactionStatus outer;
 final UUID template=UUID.randomUUID();
 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("SELECT current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("SELECT current_user",String.class));
  String schema="regular_report_job_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("""
   CREATE TABLE tenant(id bigint PRIMARY KEY);
   CREATE TABLE app_user(id bigint PRIMARY KEY);
   CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id),name text,address text,asset_type text,rated_power_kw numeric,capacity_kwh numeric,archived_at timestamptz);
   CREATE TABLE station_profile(station_id bigint PRIMARY KEY,country text,province text,city text,solar_capacity_kw numeric,grid_connection_date date,details jsonb DEFAULT '{}');
   CREATE TABLE device_model(id bigint PRIMARY KEY,category text);
   CREATE TABLE device(id bigint PRIMARY KEY,station_id bigint,model_id bigint,serial_number text,name text,archived_at timestamptz);
   CREATE TABLE device_reference_profile(device_id bigint PRIMARY KEY,source_type text);
   CREATE TABLE audit_event(actor_id bigint,target_tenant_id bigint,action text,detail text);
   INSERT INTO tenant VALUES(11),(22);INSERT INTO app_user VALUES(7),(9);
   INSERT INTO station VALUES(101,11,'Example station','Address','BESS',50,100,NULL);
   INSERT INTO device_model VALUES(1,'PCS');INSERT INTO device_reference_profile VALUES(1,'PCS');
   INSERT INTO device VALUES(1,101,NULL,'ACTIVE-SN','Active device',NULL),(2,101,1,'ARCHIVED-SN','Archived device',now());
   """);
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V53__regular_report_configuration.sql")));
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V58__regular_report_jobs.sql")));
  db.update("INSERT INTO regular_report_config(id,tenant_id,user_id,category,name,report_type,payload) VALUES(?,11,7,'template','Info','daily','{}')",template);
  access=mock(AccessControl.class);actor(7,11);when(access.stationIds("report.export")).thenReturn(List.of(101L));when(access.hasStationPermission(7,101,"asset.read")).thenReturn(true);service=new RegularReportJobService(new DomainSupport(db,access),Clock.systemUTC());
 }
 static String required(String name){return Objects.requireNonNull(System.getenv(name),name+" must be set");}
 void actor(long user,long tenant){when(access.context()).thenReturn(new TenantContext(user,tenant,"enterprise",false));when(access.userId()).thenReturn(user);}
 RegularReportJobService.Request request(List<String> fields){return new RegularReportJobService.Request("regular","daily",template,1L,"Example report","specific",List.of(101L),"2026-10-01","2026-10-19","en",fields);}
 void failure(int status,Runnable call){var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));try{assertEquals(status,assertThrows(BusinessException.class,call::run).status());}finally{manager.rollback(nested);}}
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 @Test void currentDeviceExportExcludesArchivedRowsAndProducesDownloadableWorkbook(){var job=service.create(request(List.of("Site Name","Device Info","Device SN","Device Name","Device Type")));assertEquals("completed",job.status());assertEquals(1,job.rows().size());assertTrue(job.rows().getFirst().contains("ACTIVE-SN"));assertTrue(job.rows().getFirst().contains("PCS"));assertFalse(job.rows().stream().flatMap(List::stream).anyMatch("ARCHIVED-SN"::equals));byte[] artifact=service.download(UUID.fromString(job.id())).bytes();assertEquals('P',(char)artifact[0]);assertEquals('K',(char)artifact[1]);}
 @Test void archivedStationCannotCreateNewReportsButHistoricalFilesRemainAuthorized(){var job=service.create(request(List.of("Site Name")));db.update("UPDATE station SET archived_at=now() WHERE id=101");failure(410,()->service.create(request(List.of("Site Name"))));assertTrue(service.download(UUID.fromString(job.id())).bytes().length>0);assertEquals(1,service.list("regular",50,0,null,null,null,null,null).total());}
 @Test void unknownMetricsPersistAsFailedWithoutArtifactAndDeletedRecordsCannotBeRetrieved(){var job=service.create(request(List.of("Site Name","Production")));assertEquals("failed",job.status());assertEquals("UNSUPPORTED_FIELDS",job.errorCode());assertNull(db.queryForObject("SELECT artifact FROM regular_report_job WHERE id=?::uuid",byte[].class,job.id()));assertEquals(1,service.list("regular",50,0,null,null,null,null,null).total());failure(409,()->service.download(UUID.fromString(job.id())));service.delete(UUID.fromString(job.id()),job.version());failure(404,()->service.query(UUID.fromString(job.id())));assertEquals(0,service.list("regular",50,0,null,null,null,null,null).total());}
 @Test void revokedStationOrChangedActorCannotDownloadPreviouslyCreatedArtifact(){var job=service.create(request(List.of("Site Name")));UUID id=UUID.fromString(job.id());doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.read");failure(403,()->service.download(id));actor(9,22);failure(404,()->service.query(id));}
}
