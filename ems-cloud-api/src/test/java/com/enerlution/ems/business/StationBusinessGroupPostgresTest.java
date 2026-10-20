package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.tenant.TenantContext;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** All schemas, fixtures and writes are rolled back in the isolated database. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationBusinessGroupPostgresTest {
 JdbcTemplate db;DataSourceTransactionManager manager;TransactionStatus outer;AccessControl access;
 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  String schema="business_group_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("""
   CREATE TABLE tenant(id bigint PRIMARY KEY,kind text);
   CREATE TABLE company_profile(tenant_id bigint PRIMARY KEY REFERENCES tenant(id),name text);
   CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id),name text,archived_at timestamptz);
   CREATE TABLE saas_effective_station_permission(user_id bigint,station_id bigint,permission_code text,client text);
   INSERT INTO tenant VALUES(11,'enterprise'),(22,'enterprise');
   INSERT INTO company_profile VALUES(11,'Own company'),(22,'Other company');
   INSERT INTO station VALUES(101,11,'Visible station',null),(102,22,'Other station',null),(103,11,'Denied station',null);
   INSERT INTO saas_effective_station_permission VALUES(7,101,'asset.read','web'),(7,102,'asset.read','web');
   """);
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V66__station_business_group_tree.sql")));
  db.execute("""
   INSERT INTO station_business_group_dataset(tenant_id,dataset_id,dataset_version,source,evidence_ref) VALUES(11,'fixture',1,'local-config','test'),(22,'fixture',1,'local-config','test');
   INSERT INTO station_business_group(tenant_id,dataset_id,dataset_version,id,name,kind) VALUES(11,'fixture',1,'own','Own group','group'),(22,'fixture',1,'other','Other group','group');
   INSERT INTO station_business_group_station VALUES(11,'fixture',1,'own',101),(22,'fixture',1,'other',102);
   """);
  db.execute("SET CONSTRAINTS ALL IMMEDIATE");db.execute("SET CONSTRAINTS ALL DEFERRED");
  access=mock(AccessControl.class);when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));when(access.client()).thenReturn("web");
 }
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 @Test void realSqlIntersectStationCapabilityAndTenantWithoutGrantingFromGroups(){
  var result=new StationBusinessGroupService(new DomainSupport(db,access)).tree();
  assertEquals("11",result.tenantId());assertEquals(List.of("101"),result.nodes().getFirst().stationIds());assertTrue(result.toString().contains("Visible station"));assertFalse(result.toString().contains("Other station"));assertFalse(result.toString().contains("Denied station"));assertFalse(result.toString().contains("Other group"));
  db.update("DELETE FROM saas_effective_station_permission WHERE user_id=7 AND station_id=101");assertTrue(new StationBusinessGroupService(new DomainSupport(db,access)).tree().nodes().isEmpty());
 }
 @Test void databaseRejectsCrossTenantParentsAssignmentsAndDeferredCycles(){
  reject(()->{db.execute("INSERT INTO station_business_group_station VALUES(11,'fixture',1,'own',102)");});
  reject(()->{db.execute("INSERT INTO station_business_group(tenant_id,dataset_id,dataset_version,id,parent_id,name,kind) VALUES(11,'fixture',1,'child','other','Wrong parent','group')");db.execute("SET CONSTRAINTS ALL IMMEDIATE");});
  reject(()->{db.execute("INSERT INTO station_business_group(tenant_id,dataset_id,dataset_version,id,parent_id,name,kind) VALUES(11,'fixture',1,'a','b','Cycle A','group'),(11,'fixture',1,'b','a','Cycle B','group')");db.execute("SET CONSTRAINTS ALL IMMEDIATE");});
 }
 private void reject(Runnable action){var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));try{assertThrows(org.springframework.dao.DataAccessException.class,action::run);}finally{manager.rollback(nested);}}
 @Test void scopeUsesOnlyCurrentTenantVisibleTreeNodes(){
  var service=new StationBusinessGroupService(new DomainSupport(db,access));
  assertNull(service.stationScope(null));assertEquals(List.of(101L),service.stationScope("group:own"));
  assertEquals(404,assertThrows(com.enerlution.ems.common.BusinessException.class,()->service.stationScope("group:other")).status());
  when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",true));
  db.execute("INSERT INTO station_business_group(tenant_id,dataset_id,dataset_version,id,name,kind) VALUES(11,'fixture',1,'empty','Verified empty','group')");
  assertEquals(List.of(),service.stationScope("group:empty"));
 }
}
