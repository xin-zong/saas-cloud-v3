package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationOperationLogPostgresTest {
 JdbcTemplate db; AccessControl access; DomainSupport support; StationOperationLogService logs;
 DataSourceTransactionManager manager; TransactionStatus outer;
 @BeforeEach void setup() throws Exception {
  var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
  manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));
  assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  String schema="station_log_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("""
   CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint);
   CREATE TABLE app_user(id bigint PRIMARY KEY,display_name text);
   CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint,target_tenant_id bigint,action text,detail text,occurred_at timestamptz DEFAULT now());
   INSERT INTO station VALUES(101,11),(102,11),(103,22);
   INSERT INTO app_user VALUES(7,'Acceptance actor');
   INSERT INTO audit_event(target_tenant_id,action,detail) VALUES(11,'station.edit','station=101'),(22,'station.edit','station=101'),(11,'other','station=102'),(11,'station.edit','station=101 extra');
   """);
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V44__station_operation_logs.sql")));
  access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);
  support=new DomainSupport(db,access);logs=new StationOperationLogService(support);
 }
 static String required(String name){return Objects.requireNonNull(System.getenv(name),name+" required");}
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 StationOperationLogService.Page list(long station,String content,int limit,int offset){return logs.list(station,content,null,null,null,null,null,limit,offset);}
 @Test void backfillRequiresExactActionPayloadAndTenantAndReadNeverWrites() {
  assertEquals(1,db.queryForObject("SELECT count(*) FROM station_audit_event",Integer.class));
  assertEquals(1,list(101,null,20,0).items().size());assertTrue(list(102,null,20,0).items().isEmpty());
  assertEquals(4,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
  assertNull(list(101,null,20,0).items().getFirst().get("actor"));
 }
 @Test void exactLinksSnapshotsFiltersPaginationAndMissingMetadata() {
  support.auditStation("substation.create",101,Map.of("name","100%_literal"));
  support.auditStation("substation.create",102,Map.of("name","other"));
  db.update("UPDATE app_user SET display_name='New name' WHERE id=7");
  var page=list(101,"%_",1,0);assertEquals(1,page.items().size());assertFalse(page.hasMore());
  var row=page.items().getFirst();assertEquals("Acceptance actor",row.get("actor"));assertNull(row.get("ip"));assertNull(row.get("actorGroup"));assertNull(row.get("location"));
  assertTrue(list(101,null,1,0).hasMore());assertEquals(1,list(101,null,1,1).items().size());
  assertEquals(1,logs.list(101,null,"Acceptance", "application",null,Instant.EPOCH,Instant.now().plusSeconds(60),20,0).items().size());
  assertTrue(logs.list(101,null,null,null,"1",null,null,20,0).items().isEmpty());
 }
 @Test void multiStationAuditDeduplicatesAndNeverExposesOrSearchesSharedDetails() {
  support.auditStations("batch.update",List.of(101L,101L,102L,103L),Map.of("privateOtherStation","secret"));
  assertEquals(3,db.queryForObject("SELECT count(*) FROM station_audit_event l JOIN audit_event a ON a.id=l.event_id WHERE a.action='batch.update'",Integer.class));
  assertEquals(2,db.queryForObject("SELECT count(*) FROM audit_event WHERE action='batch.update'",Integer.class));
  assertNull(list(101,"batch.update",20,0).items().getFirst().get("content"));
  assertTrue(list(101,"secret",20,0).items().isEmpty());
 }
 @Test void permissionRevocationAfterQueryDoesNotReturnRows() {
  doNothing().doThrow(new BusinessException(403,"revoked")).when(access).requireTenantPermission(11,"audit.read");
  assertEquals(403,assertThrows(BusinessException.class,()->list(101,null,20,0)).status());
 }
 @Test void targetTenantPermissionIsRequiredEvenWithStationReadScope() {
  doThrow(new BusinessException(403,"foreign tenant")).when(access).requireTenantPermission(22,"audit.read");
  assertEquals(403,assertThrows(BusinessException.class,()->list(103,null,20,0)).status());
  verify(access).requireStationPermission(103,"asset.read");
 }
 @Test void rollbackRemovesAuditAndLinkTogether() {
  var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
  support.auditStation("rollback.test",101,"value");manager.rollback(nested);
  assertTrue(list(101,"rollback.test",20,0).items().isEmpty());
  assertEquals(0,db.queryForObject("SELECT count(*) FROM audit_event WHERE action='rollback.test'",Integer.class));
 }
}
