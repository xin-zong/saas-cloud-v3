package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** New database only. All fixtures, schema DDL and service writes are rolled back. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS", matches="true")
class StationTagPostgresTest {
  JdbcTemplate db;
  AccessControl access;
  DomainSupport support;
  StationTagService tags;
  DataSourceTransactionManager manager;
  TransactionStatus outer;

  @BeforeEach void setup() throws Exception {
    var ds = new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"), required("EMS_TOYINGZHEN_DB_USER"), required("EMS_TOYINGZHEN_DB_PASSWORD"));
    manager = new DataSourceTransactionManager(ds);
    manager.setNestedTransactionAllowed(true);
    outer = manager.getTransaction(new DefaultTransactionDefinition());
    db = new JdbcTemplate(ds);
    // These assertions must precede every DDL statement, including CREATE SCHEMA.
    assertEquals("ems_cloud_saas_toyingzhen", db.queryForObject("select current_database()", String.class));
    assertEquals("ems_toyingzhen_owner", db.queryForObject("select current_user", String.class));
    String schema = "station_tag_test_" + UUID.randomUUID().toString().replace("-", "");
    db.execute("CREATE SCHEMA " + schema);
    db.execute("SET LOCAL search_path TO " + schema);
    db.execute("""
      CREATE TABLE tenant(id bigint PRIMARY KEY);
      CREATE TABLE app_user(id bigint PRIMARY KEY, tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE station(id bigint PRIMARY KEY, tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint REFERENCES app_user(id),target_tenant_id bigint REFERENCES tenant(id),action text,detail text);
      INSERT INTO tenant VALUES(11),(22);
      INSERT INTO app_user VALUES(7,11),(8,22);
      INSERT INTO station VALUES(101,11),(102,22);
      """);
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V26__station_tags.sql")));
    access = mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    support = new DomainSupport(db,access);
    tags = new StationTagService(support);
  }
  static String required(String name) { return Objects.requireNonNull(System.getenv(name),name+" must be configured explicitly"); }
  @AfterEach void cleanup() { if (outer != null) manager.rollback(outer); }
  // Expected failures use savepoints so PostgreSQL's aborted transaction never masks later assertions.
  void failure(int status, Runnable call) {
    var definition = new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED);
    var savepoint = manager.getTransaction(definition);
    try { assertEquals(status, assertThrows(BusinessException.class,call::run).status()); }
    finally { manager.rollback(savepoint); }
  }
  StationTagService.Tag create(String name) { return tags.create(new StationTagService.TagRequest(name,"Description",null)); }
  @Test void crudKeywordPaginationCaseInsensitiveUniquenessAndRestart() {
    var first=create("  Solar  ");
    assertEquals("Solar",first.name()); assertEquals(1,first.version());
    failure(409, () -> create("solar"));
    create("Storage");
    assertEquals(List.of(first),tags.list("oLa",20,0));
    assertEquals(1,tags.list(null,1,1).size());
    assertEquals(first,new StationTagService(support).list("solar",10,0).getFirst());
    var updated=tags.update(first.id(),new StationTagService.TagRequest("Roof","Changed",1L));
    assertEquals(2,updated.version()); assertEquals("Changed",updated.description());
    failure(409, () -> tags.update(first.id(),new StationTagService.TagRequest("Wrong","",1L)));
    failure(409, () -> tags.delete(first.id(),1L));
    tags.delete(first.id(),2L);
    assertTrue(tags.list("Roof",20,0).isEmpty());
    assertEquals(4,db.queryForObject("select count(*) from audit_event",Integer.class));
  }
  @Test void replacementDeduplicatesProtectsBoundTagsAndRejectsForeignOrMissingIdsWithoutPartialWrites() {
    var first=create("A"); var second=create("B");
    assertEquals(List.of(first),tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of(first.id(),first.id()))));
    failure(409, () -> tags.delete(first.id(),1L));
    failure(400, () -> tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of(second.id(),UUID.randomUUID()))));
    UUID foreign=UUID.randomUUID();
    db.update("INSERT INTO station_tag(id,tenant_id,created_by,name,description) VALUES(?,22,8,'Foreign','')",foreign);
    failure(403, () -> tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of(second.id(),foreign))));
    assertEquals(List.of(first),tags.stationTags(101));
    assertEquals(List.of(first),new StationTagService(support).stationTags(101));
    tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of()));
    tags.delete(first.id(),1L);
    assertTrue(tags.stationTags(101).isEmpty());
  }
  @Test void definitionAndStationIsolationAndRevokedPermissions() {
    var first=create("A");
    when(access.context()).thenReturn(new TenantContext(8,22,"platform",true));
    assertTrue(tags.list(null,20,0).isEmpty());
    failure(404, () -> tags.update(first.id(),new StationTagService.TagRequest("X","",1L)));
    failure(404, () -> tags.delete(first.id(),1L));
    failure(403, () -> tags.stationTags(101));
    failure(403, () -> tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of(first.id()))));
    doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(102,"asset.edit");
    failure(403, () -> tags.replaceStationTags(102,new StationTagService.BindingRequest(List.of())));
  }
  @Test void failedAuditRollsBackEntireReplacement() {
    var first=create("A"); var second=create("B");
    tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of(first.id())));
    // The service's transaction must roll back the delete and insert together with its audit.
    var failingSupport = new DomainSupport(db,access) {
      @Override public void audit(String action, Map<String,?> detail) { throw new BusinessException(503,"audit unavailable"); }
    };
    var savepoint = manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try {
      assertEquals(503, assertThrows(BusinessException.class, () ->
          new StationTagService(failingSupport).replaceStationTags(101,
              new StationTagService.BindingRequest(List.of(second.id())))).status());
      // Observe the service transaction's effect before our cleanup rolls back the savepoint.
      // Without its TransactionTemplate, this flag stays false despite the audit exception.
      assertTrue(outer.isRollbackOnly(), "Audit failure must mark the enclosing transaction for rollback");
    } finally {
      manager.rollback(savepoint);
    }
    assertEquals(List.of(first),tags.stationTags(101));
  }
}
