package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

/** Real committed fixtures are private to a verified random schema and removed after both sessions stop. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationSpaceConcurrencyPostgresTest {
  private static final String DATABASE="ems_cloud_saas_toyingzhen", ROLE="ems_toyingzhen_owner";
  private static final String SCHEMA_PATTERN="station_space_concurrency_[0-9a-f]{32}";
  private final String schema="station_space_concurrency_"+UUID.randomUUID().toString().replace("-","");
  private DriverManagerDataSource fixtureSource;
  private JdbcTemplate admin,db;
  private ExecutorService workers;
  private boolean schemaCreated;
  private StationSpaceService.Space first,second;

  @BeforeEach void setup() throws Exception {
    String url=required("EMS_TOYINGZHEN_DB_URL"),user=required("EMS_TOYINGZHEN_DB_USER"),password=required("EMS_TOYINGZHEN_DB_PASSWORD");
    var adminSource=new DriverManagerDataSource(url,user,password);
    var connectionOptions=new Properties();
    connectionOptions.setProperty("connectTimeout","5");
    connectionOptions.setProperty("socketTimeout","15");
    adminSource.setConnectionProperties(connectionOptions);
    admin=new JdbcTemplate(adminSource);admin.setQueryTimeout(10);
    // The guard precedes CREATE SCHEMA and all fixture/migration DDL.
    assertIdentity(admin);assertTrue(schema.matches(SCHEMA_PATTERN));
    admin.execute("CREATE SCHEMA "+schema);
    schemaCreated=true;
    fixtureSource=new DriverManagerDataSource(url,user,password);
    var properties=new Properties();properties.putAll(connectionOptions);
    properties.setProperty("currentSchema",schema);
    properties.setProperty("options","-c lock_timeout=8000 -c statement_timeout=12000 -c idle_in_transaction_session_timeout=15000");
    fixtureSource.setConnectionProperties(properties);
    db=new JdbcTemplate(fixtureSource);db.setQueryTimeout(10);
    assertIdentity(db);assertEquals(schema,db.queryForObject("SELECT current_schema()",String.class));
    // No outer rollback transaction: these committed fixtures must be visible to both real sessions.
    db.execute("""
      CREATE TABLE tenant(id bigint PRIMARY KEY);
      CREATE TABLE app_user(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE device(id bigint PRIMARY KEY,station_id bigint NOT NULL REFERENCES station(id),name text NOT NULL,code text NOT NULL);
      CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint REFERENCES app_user(id),target_tenant_id bigint REFERENCES tenant(id),action text,detail text);
      INSERT INTO tenant VALUES(11);
      INSERT INTO app_user VALUES(7,11);
      INSERT INTO station VALUES(101,11);
      INSERT INTO device VALUES(19,101,'Meter','meter-19');
      """);
    db.execute("ALTER TABLE app_user ADD COLUMN display_name text");
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V44__station_operation_logs.sql")));
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V29__station_spaces.sql")));
    var spaces=service(db);
    first=spaces.create(101,new StationSpaceService.CreateRequest(null,"A",10));
    second=spaces.create(101,new StationSpaceService.CreateRequest(null,"B",20));
  }

  private static String required(String name) {
    return Objects.requireNonNull(System.getenv(name),name+" must be explicitly configured");
  }
  private static void assertIdentity(JdbcTemplate jdbc) {
    assertEquals(DATABASE,jdbc.queryForObject("SELECT current_database()",String.class));
    assertEquals(ROLE,jdbc.queryForObject("SELECT current_user",String.class));
  }
  private static StationSpaceService service(JdbcTemplate jdbc) {
    var access=mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    // Existing rule/HTTP tests cover real permission decisions; concurrency fixes the scoped actor.
    return new StationSpaceService(new DomainSupport(jdbc,access));
  }

  private record Outcome(int backendPid,int status,StationSpaceService.Space space) {}

  private Callable<Outcome> contender(Function<StationSpaceService,StationSpaceService.Space> action,
      CountDownLatch ready,CountDownLatch start) {
    return ()->{
      var jdbc=new JdbcTemplate(fixtureSource);jdbc.setQueryTimeout(10);
      var transaction=new TransactionTemplate(new DataSourceTransactionManager(fixtureSource));
      transaction.setTimeout(20);
      var pid=new AtomicInteger();
      try {
        StationSpaceService.Space result=transaction.execute(status->{
          // The service joins this transaction and therefore uses this exact backend session.
          pid.set(Objects.requireNonNull(jdbc.queryForObject("SELECT pg_backend_pid()",Integer.class)));
          assertIdentity(jdbc);assertEquals(schema,jdbc.queryForObject("SELECT current_schema()",String.class));
          ready.countDown();
          try { assertTrue(start.await(10,TimeUnit.SECONDS),"Both real sessions must reach the start barrier"); }
          catch(InterruptedException e) { Thread.currentThread().interrupt();throw new AssertionError("Concurrent worker interrupted",e); }
          return action.apply(service(jdbc));
        });
        return new Outcome(pid.get(),200,Objects.requireNonNull(result));
      } catch(BusinessException e) {
        return new Outcome(pid.get(),e.status(),null);
      }
    };
  }

  private List<Outcome> race(Function<StationSpaceService,StationSpaceService.Space> a,
      Function<StationSpaceService,StationSpaceService.Space> b) throws Exception {
    var ready=new CountDownLatch(2);var start=new CountDownLatch(1);
    workers=Executors.newFixedThreadPool(2);
    var one=workers.submit(contender(a,ready,start));var two=workers.submit(contender(b,ready,start));
    try {
      assertTrue(ready.await(10,TimeUnit.SECONDS),"Both sessions must open before either mutation runs");
      start.countDown();
      long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
      var firstResult=one.get(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);
      var secondResult=two.get(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);
      var outcomes=List.of(firstResult,secondResult);
      assertNotEquals(outcomes.get(0).backendPid(),outcomes.get(1).backendPid(),"The contenders must use different PostgreSQL backend sessions");
      assertTrue(outcomes.stream().allMatch(outcome->outcome.backendPid()>0));
      assertEquals(List.of(200,409),outcomes.stream().map(Outcome::status).sorted().toList());
      return outcomes;
    } finally {
      start.countDown();one.cancel(true);two.cancel(true);
      stopWorkers();
    }
  }

  private void stopWorkers() throws InterruptedException {
    if(workers==null)return;
    workers.shutdown();
    if(!workers.awaitTermination(10,TimeUnit.SECONDS)) {
      workers.shutdownNow();
      assertTrue(workers.awaitTermination(20,TimeUnit.SECONDS),"Workers must terminate before private-schema cleanup");
    }
  }

  @AfterEach void cleanup() throws Exception {
    // Never DROP while either transaction/session could still be using the schema.
    stopWorkers();
    if(!schemaCreated)return;
    assertTrue(workers==null || workers.isTerminated());
    assertIdentity(admin);
    assertTrue(schema.matches(SCHEMA_PATTERN));
    assertEquals(ROLE,admin.queryForObject("SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname=?",String.class,schema));
    admin.execute("DROP SCHEMA "+schema+" CASCADE");
    schemaCreated=false;
  }

  @Test void opposingMovesAllowExactlyOneCommitAndNeverCreateACycle() throws Exception {
    race(spaces->spaces.move(101,first.id(),new StationSpaceService.MoveRequest(second.id(),1L)),
        spaces->spaces.move(101,second.id(),new StationSpaceService.MoveRequest(first.id(),1L)));
    assertEquals(1,db.queryForObject("SELECT count(*) FROM station_space WHERE parent_id IS NOT NULL",Integer.class));
    assertEquals(3L,db.queryForObject("SELECT sum(version) FROM station_space",Long.class));
    assertFalse(db.queryForObject("""
      WITH RECURSIVE paths AS (
        SELECT id,parent_id,ARRAY[id] AS visited,false AS cycle FROM station_space
        UNION ALL
        SELECT s.id,s.parent_id,p.visited || s.id,s.id=ANY(p.visited)
          FROM paths p JOIN station_space s ON s.id=p.parent_id WHERE NOT p.cycle
      ) SELECT exists(SELECT 1 FROM paths WHERE cycle)
      """,Boolean.class));
    assertEquals(1,db.queryForObject("SELECT count(*) FROM audit_event WHERE action='station-space.move'",Integer.class));
  }

  @Test void competingBindingsAssignOneDeviceOnceAndRequireExplicitUnbindForTheLoser() throws Exception {
    var outcomes=race(spaces->spaces.bind(101,first.id(),new StationSpaceService.BindRequest(List.of("19"),1L)),
        spaces->spaces.bind(101,second.id(),new StationSpaceService.BindRequest(List.of("19"),1L)));
    var winner=outcomes.stream().filter(outcome->outcome.status()==200).findFirst().orElseThrow().space();
    assertEquals(1,db.queryForObject("SELECT count(*) FROM station_space_device WHERE device_id=19",Integer.class));
    assertEquals(winner.id(),db.queryForObject("SELECT space_id FROM station_space_device WHERE device_id=19",UUID.class));
    assertEquals(1,winner.deviceCount());assertEquals(2,winner.version());
    assertEquals(3L,db.queryForObject("SELECT sum(version) FROM station_space",Long.class));
    assertEquals(1,db.queryForObject("SELECT count(*) FROM audit_event WHERE action='station-space.bind'",Integer.class));
  }

  @Test void concurrentRenamesWithTheSameExpectedVersionCannotBothCommit() throws Exception {
    var outcomes=race(spaces->spaces.rename(101,first.id(),new StationSpaceService.RenameRequest("First rename",1L)),
        spaces->spaces.rename(101,first.id(),new StationSpaceService.RenameRequest("Second rename",1L)));
    var winner=outcomes.stream().filter(outcome->outcome.status()==200).findFirst().orElseThrow().space();
    assertEquals(winner.name(),db.queryForObject("SELECT name FROM station_space WHERE id=?",String.class,first.id()));
    assertEquals(2L,db.queryForObject("SELECT version FROM station_space WHERE id=?",Long.class,first.id()));
    assertEquals(1,db.queryForObject("SELECT count(*) FROM audit_event WHERE action='station-space.rename'",Integer.class));
  }
}
