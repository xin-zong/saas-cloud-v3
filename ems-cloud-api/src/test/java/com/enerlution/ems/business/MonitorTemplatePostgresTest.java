package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
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

/** Dedicated database guard precedes schema DDL; fixtures never resolve into public. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS", matches="true")
class MonitorTemplatePostgresTest {
  JdbcTemplate db; AccessControl access; DomainSupport support; MonitorTemplateService templates;
  DataSourceTransactionManager manager; TransactionStatus outer;
  @BeforeEach void setup() throws Exception {
    var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
    manager=new DataSourceTransactionManager(ds); manager.setNestedTransactionAllowed(true);
    outer=manager.getTransaction(new DefaultTransactionDefinition()); db=new JdbcTemplate(ds);
    assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
    String schema="monitor_template_test_"+UUID.randomUUID().toString().replace("-","");
    db.execute("CREATE SCHEMA "+schema); db.execute("SET LOCAL search_path TO "+schema);
    db.execute("""
      CREATE TABLE tenant(id bigint PRIMARY KEY);
      CREATE TABLE app_user(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint REFERENCES app_user(id),target_tenant_id bigint REFERENCES tenant(id),action text,detail text);
      INSERT INTO tenant VALUES(11),(22);
      INSERT INTO app_user VALUES(7,11),(8,11),(9,22);
      """);
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V27__monitor_templates.sql")));
    access=mock(AccessControl.class); actor(7,11);
    support=new DomainSupport(db,access); templates=new MonitorTemplateService(support);
  }
  static String required(String name) { return Objects.requireNonNull(System.getenv(name),name+" must be explicitly configured"); }
  @AfterEach void cleanup() { if(outer!=null) manager.rollback(outer); }
  void actor(long user,long tenant) {
    when(access.context()).thenReturn(new TenantContext(user,tenant,"enterprise",false));
    when(access.userId()).thenReturn(user);
  }
  void failure(int status,Runnable call) {
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try { assertEquals(status,assertThrows(BusinessException.class,call::run).status()); }
    finally { manager.rollback(savepoint); }
  }
  MonitorTemplateService.Template create(String name) { return templates.create(new MonitorTemplateService.TemplateRequest(name,List.of("运行健康"),null)); }
  @Test void emptyGetHasNoWritesAndCrudSurvivesServiceReconstruction() {
    assertTrue(templates.list().items().isEmpty()); assertNull(templates.list().selectedId());
    assertEquals(0,db.queryForObject("SELECT count(*) FROM monitor_template_selection",Integer.class));
    assertEquals(0,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
    var first=create("  Solar  "); assertEquals("Solar",first.name()); assertEquals(1,first.version());
    assertEquals(first,new MonitorTemplateService(support).list().items().getFirst());
    failure(409,()->create("solar"));
    var edited=templates.update(first.id(),new MonitorTemplateService.TemplateRequest("Roof",List.of("收益概览"),1L));
    assertEquals(2,edited.version()); assertEquals(List.of("收益概览"),edited.cards());
    failure(409,()->templates.update(first.id(),new MonitorTemplateService.TemplateRequest("Stale",List.of("运行健康"),1L)));
    failure(409,()->templates.delete(first.id(),1L));
    assertEquals(edited,templates.list().items().getFirst());
    templates.delete(first.id(),2L); assertTrue(templates.list().items().isEmpty());
    assertEquals(3,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
  }
  @Test void pinsSelectionAndSelectedDeletionAreDurableAndOrdered() {
    var first=create("A"); var second=create("B");
    var pinned=templates.pin(first.id(),new MonitorTemplateService.PinRequest(true,1L));
    assertTrue(pinned.pinned()); assertEquals(2,pinned.version());
    assertEquals(first.id(),templates.list().items().getFirst().id());
    failure(409,()->templates.pin(first.id(),new MonitorTemplateService.PinRequest(false,1L)));
    assertEquals(first.id(),templates.select(new MonitorTemplateService.SelectionRequest(first.id())).selectedId());
    assertEquals(first.id(),new MonitorTemplateService(support).list().selectedId());
    templates.delete(first.id(),2L); assertNull(templates.list().selectedId());
    templates.select(new MonitorTemplateService.SelectionRequest(second.id()));
    templates.select(new MonitorTemplateService.SelectionRequest(null));
    assertNull(templates.list().selectedId());
  }
  @Test void personalAndTenantOwnershipApplyToEveryReadAndMutationWithoutGrantingCardPermissions() {
    var own=create("Same name");
    actor(8,11); assertTrue(templates.list().items().isEmpty());
    var other=create("Same name");
    failure(404,()->templates.select(new MonitorTemplateService.SelectionRequest(own.id())));
    failure(404,()->templates.update(own.id(),new MonitorTemplateService.TemplateRequest("Hijack",List.of("运行健康"),1L)));
    failure(404,()->templates.pin(own.id(),new MonitorTemplateService.PinRequest(true,1L)));
    failure(404,()->templates.delete(own.id(),1L));
    assertEquals(other,templates.list().items().getFirst()); assertNull(templates.list().selectedId());
    actor(7,22); assertTrue(templates.list().items().isEmpty());
    failure(404,()->templates.select(new MonitorTemplateService.SelectionRequest(own.id())));
    actor(7,11); assertEquals(own,templates.list().items().getFirst());
    // Losing data capabilities does not destroy presentation preferences or grant access to data.
    doThrow(new BusinessException(403,"revoked")).when(access).requirePermission(anyString());
    assertEquals(own,templates.list().items().getFirst());
    verify(access,never()).requirePermission(anyString());
  }
  @Test void failedAuditRollsBackTemplateAndSelectionMutations() {
    var first=create("A"); templates.select(new MonitorTemplateService.SelectionRequest(first.id()));
    db.execute("ALTER TABLE audit_event ADD CONSTRAINT reject_mutation CHECK(action NOT IN ('monitor.template.update','monitor.template.delete','monitor.template.select')) NOT VALID");
    rollbackFailure(()->templates.update(first.id(),new MonitorTemplateService.TemplateRequest("Changed",List.of("收益概览"),1L)));
    rollbackFailure(()->templates.delete(first.id(),1L));
    rollbackFailure(()->templates.select(new MonitorTemplateService.SelectionRequest(null)));
    assertEquals(first,templates.list().items().getFirst()); assertEquals(first.id(),templates.list().selectedId());
  }
  void rollbackFailure(Runnable call) {
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try {
      assertThrows(org.springframework.dao.DataIntegrityViolationException.class,call::run);
      // Assert the service transaction marked rollback BEFORE fixture cleanup restores the rows.
      assertTrue(outer.isRollbackOnly(),"service must mark its participating transaction for rollback");
    }
    finally { manager.rollback(savepoint); }
  }
}
