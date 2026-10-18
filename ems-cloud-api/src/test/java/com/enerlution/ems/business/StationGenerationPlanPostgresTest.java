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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** Dedicated target only; fixture schema and every mutation roll back together. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationGenerationPlanPostgresTest {
  JdbcTemplate db; AccessControl access; DomainSupport support; StationGenerationPlanService plans;
  DataSourceTransactionManager manager; TransactionStatus outer;
  final Clock clock = Clock.fixed(Instant.parse("2026-12-31T16:00:00Z"),ZoneOffset.UTC);
  @BeforeEach void setup() throws Exception {
    var ds = new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
    manager = new DataSourceTransactionManager(ds); manager.setNestedTransactionAllowed(true);
    outer = manager.getTransaction(new DefaultTransactionDefinition()); db = new JdbcTemplate(ds);
    assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
    String schema = "generation_plan_test_"+UUID.randomUUID().toString().replace("-","");
    db.execute("CREATE SCHEMA "+schema); db.execute("SET LOCAL search_path TO "+schema);
    db.execute("""
      CREATE TABLE tenant(id bigint PRIMARY KEY);
      CREATE TABLE app_user(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint REFERENCES app_user(id),target_tenant_id bigint REFERENCES tenant(id),action text,detail text);
      INSERT INTO tenant VALUES(11),(22);
      INSERT INTO app_user VALUES(7,11);
      INSERT INTO station VALUES(101,11),(102,22);
      """);
    db.execute("ALTER TABLE app_user ADD COLUMN display_name text");
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V44__station_operation_logs.sql")));
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V28__station_generation_plans.sql")));
    access = mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    support = new DomainSupport(db,access); plans = new StationGenerationPlanService(support,clock);
  }
  static String required(String name) { return Objects.requireNonNull(System.getenv(name),name+" must be configured explicitly"); }
  @AfterEach void cleanup() { if(outer != null) manager.rollback(outer); }
  void failure(int expected,Runnable action) {
    var savepoint = manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try { assertEquals(expected,assertThrows(BusinessException.class,action::run).status()); }
    finally { manager.rollback(savepoint); }
  }
  StationGenerationPlanService.Plan create(long station,int year) {
    return plans.create(station,new StationGenerationPlanService.CreateRequest(year,StationGenerationPlanServiceTest.months()));
  }
  @Test void crudIsExactVersionedDurableAndDoesNotWriteOnRead() {
    assertTrue(plans.list(101,null).isEmpty());
    assertEquals(0,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
    var first = create(101,2027);
    assertEquals("101",first.stationId()); assertEquals(1,first.version());
    assertEquals(12,first.months().size()); assertEquals("1.00",first.months().getFirst().plannedKwh());
    assertNull(first.months().getFirst().excellentKwh());
    assertEquals(List.of(first),new StationGenerationPlanService(support,clock).list(101,2027));
    assertTrue(plans.list(101,2026).isEmpty());
    failure(409,()->create(101,2027));
    var edited = new ArrayList<>(first.months());
    edited.set(0,new StationGenerationPlanService.Month(1,"99999999.99","0.01"));
    var updated = plans.update(101,first.id(),new StationGenerationPlanService.UpdateRequest(edited,1L));
    assertEquals(2,updated.version()); assertEquals("99999999.99",updated.months().getFirst().plannedKwh());
    assertEquals("0.01",updated.months().getFirst().excellentKwh());
    failure(409,()->plans.update(101,first.id(),new StationGenerationPlanService.UpdateRequest(edited,1L)));
    failure(409,()->plans.delete(101,first.id(),1L));
    plans.delete(101,first.id(),2L);
    assertTrue(plans.list(101,null).isEmpty());
    assertEquals(0,db.queryForObject("SELECT count(*) FROM station_generation_plan_month",Integer.class));
    assertEquals(3,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
    assertEquals(11L,db.queryForObject("SELECT DISTINCT target_tenant_id FROM audit_event",Long.class));
  }
  @Test void oldYearsRemainReadableAndEditableAndAreNeverChangedByUpdate() {
    var first = create(101,2007);
    var futureClock = Clock.fixed(Instant.parse("2060-01-01T00:00:00Z"),ZoneOffset.UTC);
    var future = new StationGenerationPlanService(support,futureClock);
    assertEquals(List.of(first),future.list(101,2007));
    assertEquals(2007,future.update(101,first.id(),new StationGenerationPlanService.UpdateRequest(first.months(),1L)).year());
    failure(400,()->future.create(101,new StationGenerationPlanService.CreateRequest(2007,first.months())));
  }
  @Test void stationScopeIsRecheckedAndIdsCannotMoveAcrossStations() {
    var first = create(101,2027);
    failure(404,()->plans.update(102,first.id(),new StationGenerationPlanService.UpdateRequest(first.months(),1L)));
    failure(404,()->plans.delete(102,first.id(),1L));
    doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"asset.read");
    failure(403,()->plans.list(101,null));
    failure(403,()->plans.update(101,first.id(),new StationGenerationPlanService.UpdateRequest(first.months(),1L)));
    failure(403,()->plans.delete(101,first.id(),1L));
    assertEquals(1,db.queryForObject("SELECT count(*) FROM station_generation_plan",Integer.class));
  }
  @ParameterizedTest @ValueSource(strings={"create","update","delete"})
  void auditFailureMakesEveryMutationRollbackOnlyBeforeTestCleanup(String operation) {
    var first = create(101,2027);
    var failingSupport = new DomainSupport(db,access) {
      @Override public void auditStation(String action,long station,Object detail) { throw new BusinessException(503,"audit unavailable"); }
    };
    var failing = new StationGenerationPlanService(failingSupport,clock);
    assertFalse(outer.isRollbackOnly());
    var savepoint = manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try {
      Runnable action = switch(operation) {
        case "create" -> () -> failing.create(101,new StationGenerationPlanService.CreateRequest(2028,first.months()));
        case "update" -> () -> failing.update(101,first.id(),new StationGenerationPlanService.UpdateRequest(first.months(),1L));
        case "delete" -> () -> failing.delete(101,first.id(),1L);
        default -> throw new AssertionError(operation);
      };
      assertEquals(503,assertThrows(BusinessException.class,action::run).status());
      assertTrue(outer.isRollbackOnly(),"Service must roll back mutations when audit fails");
    } finally { manager.rollback(savepoint); }
    assertEquals(List.of(first),plans.list(101,null));
    assertEquals(12,db.queryForObject("SELECT count(*) FROM station_generation_plan_month",Integer.class));
  }
}
