package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.enerlution.ems.business.*;
import com.enerlution.ems.common.ApiExceptionHandler;
import com.fasterxml.jackson.databind.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Real SQL and authorization; isolated fixtures are rolled back or explicitly cleaned after
 * concurrency.
 */
@EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = "ems_permission_tests")
class RoleManagementPostgresTest {
  Connection connection;
  JdbcTemplate db;
  MockMvc mvc;
  boolean committedFixture;
  final ObjectMapper json = new ObjectMapper();

  @BeforeEach
  void setup() throws Exception {
    connection =
        DriverManager.getConnection(
            System.getenv("EMS_TEST_DB_URL"),
            System.getenv("EMS_TEST_DB_USER"),
            System.getenv("EMS_TEST_DB_PASSWORD"));
    connection.setAutoCommit(false);
    db = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
    assertEquals(
        "ems_cloud_v2_proto", db.queryForObject("select current_database()", String.class));
    db.execute("SET LOCAL search_path TO ems_permission_tests");
    assertEquals(
        "ems_permission_tests", db.queryForObject("select current_schema()", String.class));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE"
                + " table_schema='ems_permission_tests'",
            Integer.class),
        "Test schema must initially be empty");
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V1__identity_assets.sql"))
            .replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V6__member_grant_schema.sql")));
    db.execute(
        Files.readString(
            Path.of("src/main/resources/db/migration/V8__effective_grant_permissions.sql")));
    db.execute(
        """
INSERT INTO organization(id,name) VALUES(101,'Root'),(103,'Outside');
INSERT INTO organization(id,name,parent_id) VALUES(102,'Child',101);
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id)
  VALUES(107,'actor','Actor','unused',101,101),(108,'target','Target','unused',102,102);
INSERT INTO app_role(id,code,name,organization_id) VALUES(111,'governor','Governor',101),(112,'shared','Shared',102);
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(121,107,111,now()-interval '1 day'),(122,108,112,now()-interval '1 day');
INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES(131,'a','A',102,10,10),(132,'b','B',103,10,10);
INSERT INTO member_grant_station VALUES(121,131),(122,131);
""");
    for (var p :
        json.readTree(Files.readString(Path.of("src/main/resources/permission-catalog.json"))))
      db.update(
          "INSERT INTO permission VALUES(?,?) ON CONFLICT DO NOTHING",
          p.path("code").asText(),
          p.path("name").asText());
    db.execute(
        "INSERT INTO role_permission"
            + " VALUES(111,'role.manage'),(111,'member.grant.manage'),(111,'asset.read'),(111,'asset.edit'),(112,'asset.read')");
    identity(107);
  }

  void identity(long user) throws Exception {
    SessionTokens tokens = mock(SessionTokens.class);
    when(tokens.userId()).thenReturn(user);
    DomainSupport support = new DomainSupport(db, new AccessControl(db, tokens));
    var controllers = new ArrayList<Object>();
    controllers.add(new PlatformController(support));
    // Allows the first RED run to demonstrate missing endpoint behavior before implementation.
    try {
      controllers.add(
          Class.forName("com.enerlution.ems.business.RoleController")
              .getConstructor(DomainSupport.class)
              .newInstance(support));
    } catch (ClassNotFoundException missingFeature) {
    }
    mvc =
        MockMvcBuilders.standaloneSetup(controllers.toArray())
            .setControllerAdvice(new ApiExceptionHandler())
            .build();
  }

  @AfterEach
  void cleanup() throws Exception {
    if (connection == null) return;
    try {
      connection.rollback();
      if (committedFixture) {
        assertEquals(
            "ems_cloud_v2_proto", db.queryForObject("select current_database()", String.class));
        db.execute("SET LOCAL search_path TO ems_permission_tests");
        assertEquals(
            "ems_permission_tests", db.queryForObject("select current_schema()", String.class));
        db.execute(
            "DROP VIEW"
                + " ems_permission_tests.effective_permission,ems_permission_tests.effective_station_permission,ems_permission_tests.effective_organization_permission,ems_permission_tests.active_member_grant");
        db.execute(
            """
DROP TABLE ems_permission_tests.member_grant_station,ems_permission_tests.member_grant,
ems_permission_tests.role_permission,ems_permission_tests.user_role,ems_permission_tests.user_totp,
ems_permission_tests.user_station,ems_permission_tests.user_preference,ems_permission_tests.audit_event,
ems_permission_tests.topology_connection,ems_permission_tests.device_observation,
ems_permission_tests.measurement_point,ems_permission_tests.measurement_kind,ems_permission_tests.device,
ems_permission_tests.device_model,ems_permission_tests.station,ems_permission_tests.customer,
ems_permission_tests.app_role,ems_permission_tests.permission,ems_permission_tests.app_user,ems_permission_tests.organization
""");
        db.execute("DROP FUNCTION ems_permission_tests.check_organization_cycle()");
        connection.commit();
      }
    } finally {
      connection.close();
    }
  }

  JsonNode request(String method, String path, String body, int status) throws Exception {
    Savepoint savepoint = connection.setSavepoint();
    var result =
        mvc.perform(
                org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(
                        org.springframework.http.HttpMethod.valueOf(method), path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body == null ? "" : body))
            .andReturn();
    int actual = result.getResponse().getStatus();
    if (actual >= 400) connection.rollback(savepoint);
    assertEquals(status, actual, result.getResponse().getContentAsString());
    return actual == 404
        ? json.nullNode()
        : json.readTree(result.getResponse().getContentAsString()).path("data");
  }

  @Test
  void createsEmptyRoleAndUpdatesTrimmedNameWithAudit() throws Exception {
    var role =
        request(
            "POST",
            "/api/platform/roles",
            "{\"name\":\"  Analyst  \",\"description\":\"Read reports\",\"organizationId\":102}",
            200);
    assertEquals("Analyst", role.path("name").asText());
    assertTrue(role.path("permissionCodes").isEmpty());
    long id = role.path("id").asLong();
    request(
        "PUT",
        "/api/platform/roles/" + id,
        "{\"name\":\"Renamed\",\"description\":\"Changed\"}",
        200);
    assertEquals(
        "Renamed", db.queryForObject("select name from app_role where id=?", String.class, id));
    assertEquals(2, db.queryForObject("select count(*) from audit_event", Integer.class));
    request("POST", "/api/platform/roles", "{\"name\":\" Renamed \",\"organizationId\":102}", 409);
    request("POST", "/api/platform/roles", "{\"name\":\"   \"}", 400);
    request("DELETE", "/api/platform/roles/" + id, null, 200);
  }

  @Test
  void catalogAndDirectoriesUseAuthorizedDefaultAndSeparatePurposes() throws Exception {
    db.update("UPDATE app_role SET organization_id=102 WHERE id=111");
    var roles = request("GET", "/api/platform/roles", null, 200);
    assertEquals(2, roles.size());
    assertEquals(102, roles.get(0).path("organizationId").asLong());
    assertTrue(roles.get(1).path("canEdit").asBoolean());
    var orgs = request("GET", "/api/platform/organizations?purpose=roles", null, 200);
    assertEquals(1, orgs.size());
    var catalog = request("GET", "/api/platform/permissions", null, 200);
    assertTrue(catalog.findValuesAsText("code").contains("role.manage"));
    request("GET", "/api/platform/roles?organizationId=103", null, 403);
    db.update("DELETE FROM role_permission WHERE role_id=111 AND permission_code='role.manage'");
    request("GET", "/api/platform/roles?purpose=manage", null, 403);
    var assign = request("GET", "/api/platform/roles?purpose=assign", null, 200);
    assertFalse(assign.get(0).path("canEdit").asBoolean());
  }

  @Test
  void sharedRoleAdditionChecksDisabledFutureRecipientsAndStationScope() throws Exception {
    db.update("UPDATE app_user SET enabled=false,organization_id=103 WHERE id=108");
    db.update("UPDATE member_grant SET valid_from=now()+interval '1 day' WHERE id=122");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"asset.edit\"]}",
        403);
    db.update("UPDATE app_user SET organization_id=102 WHERE id=108");
    db.update("INSERT INTO member_grant_station VALUES(122,132)");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"asset.edit\"]}",
        403);
    assertEquals(
        List.of("asset.read"),
        db.queryForList(
            "select permission_code from role_permission where role_id=112", String.class));
  }

  @Test
  void finiteActorCannotExpandPermanentOrLongerFutureGrant() throws Exception {
    db.update("UPDATE member_grant SET valid_until=now()+interval '2 days' WHERE id=121");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"asset.edit\"]}",
        403);
    db.update(
        "UPDATE member_grant SET valid_from=now()+interval '1 day',valid_until=now()+interval '3"
            + " days' WHERE id=122");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"asset.edit\"]}",
        403);
    db.update("UPDATE member_grant SET valid_until=now()+interval '36 hours' WHERE id=122");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"asset.edit\"]}",
        200);
  }

  @Test
  void removalDoesNotRequireRemovedPermissionButPreservesLastGovernor() throws Exception {
    db.update("DELETE FROM role_permission WHERE role_id=111 AND permission_code='asset.read'");
    request("PUT", "/api/platform/roles/112/permissions", "{\"permissionCodes\":[]}", 200);
    request(
        "PUT",
        "/api/platform/roles/111/permissions",
        "{\"permissionCodes\":[\"role.manage\",\"asset.edit\"]}",
        409);
    assertEquals(
        1,
        db.queryForObject(
            "select count(*) from role_permission where role_id=111 and"
                + " permission_code='member.grant.manage'",
            Integer.class));
  }

  @Test
  void unknownAndUnavailableCodesRejectAtomicallyButExistingLegacyCanRemain() throws Exception {
    db.update("INSERT INTO role_permission VALUES(112,'member.manage')");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"member.manage\",\"asset.edit\"]}",
        200);
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"fake\"]}",
        400);
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"firmware.upgrade\"]}",
        400);
    assertEquals(
        List.of("asset.edit", "member.manage"),
        db.queryForList(
            "select permission_code from role_permission where role_id=112 order by"
                + " permission_code",
            String.class));
  }

  @Test
  void expiredRetainedReferencesPreventDeleteWithoutDisclosingOutsideMembers() throws Exception {
    db.update(
        "UPDATE member_grant SET valid_from=now()-interval '2 days',valid_until=now()-interval '1"
            + " day' WHERE id=122");
    db.update(
        "UPDATE app_user SET organization_id=103,management_organization_id=103 WHERE id=108");
    request("DELETE", "/api/platform/roles/112", null, 409);
    var roles = request("GET", "/api/platform/roles?organizationId=102", null, 200);
    assertEquals(0, roles.get(0).path("memberCount").asInt());
    assertFalse(roles.get(0).path("canDelete").asBoolean());
  }

  @Test
  void customerDelegationRejectsAuthoritySplitAcrossSourceBranches() throws Exception {
    customerDelegationFixture();
    request("PUT", "/api/platform/customers/141", "{\"name\":\"Denied\"}", 403);
    // Ordinary station permission semantics remain independent of the source role's owner.
    assertTrue(actorDelegation().configurable(102, "alarm.handle"));
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"alarm.handle\"]}",
        200);
    assertAll(
        () -> assertFalse(actorDelegation().configurable(102, "customer.manage")),
        () ->
            assertEquals(
                403,
                assertThrows(
                        com.enerlution.ems.common.BusinessException.class,
                        () ->
                            actorDelegation()
                                .requireDelegation(
                                    102,
                                    108,
                                    List.of(131L),
                                    List.of("customer.manage"),
                                    null,
                                    "role.manage"))
                    .status()),
        () ->
            request(
                "PUT",
                "/api/platform/roles/112/permissions",
                "{\"permissionCodes\":[\"asset.read\",\"alarm.handle\",\"customer.manage\"]}",
                403));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM role_permission WHERE role_id=112 AND"
                + " permission_code='customer.manage'",
            Integer.class));
    assertEquals(
        "Customer", db.queryForObject("SELECT name FROM customer WHERE id=141", String.class));
  }

  @Test
  void customerDelegationAllowsSameSourceBranchWhilePreservingSourceExpiry() throws Exception {
    customerDelegationFixture();
    db.update("UPDATE app_role SET organization_id=101 WHERE id=113");
    db.update("UPDATE member_grant SET valid_until=now()+interval '1 hour' WHERE id=123");
    assertTrue(actorDelegation().configurable(102, "customer.manage"));
    request("PUT", "/api/platform/customers/141", "{\"name\":\"Actor edited\"}", 200);
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"customer.manage\"]}",
        403);
    db.update("UPDATE member_grant SET valid_until=now()+interval '30 minutes' WHERE id=122");
    request(
        "PUT",
        "/api/platform/roles/112/permissions",
        "{\"permissionCodes\":[\"asset.read\",\"customer.manage\"]}",
        200);
    identity(108);
    request("PUT", "/api/platform/customers/141", "{\"name\":\"Recipient edited\"}", 200);
    assertEquals(
        "Recipient edited",
        db.queryForObject("SELECT name FROM customer WHERE id=141", String.class));
  }

  private void customerDelegationFixture() throws Exception {
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V10__customer_profiles.sql")));
    db.execute(
        """
INSERT INTO customer(id,name,organization_id) VALUES(141,'Customer',102);
UPDATE station SET customer_id=141 WHERE id=131;
INSERT INTO app_role(id,code,name,organization_id) VALUES(113,'customer-source','Customer source',103);
INSERT INTO role_permission VALUES(113,'customer.manage'),(113,'alarm.handle');
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(123,107,113,now()-interval '1 day');
INSERT INTO member_grant_station VALUES(123,131);
""");
  }

  private GrantDelegation actorDelegation() {
    SessionTokens tokens = mock(SessionTokens.class);
    when(tokens.userId()).thenReturn(107L);
    return new GrantDelegation(db, new AccessControl(db, tokens));
  }

  @Test
  void batchedDirectoryMatchesIndividualChecksAcrossRetainedGrantScopes() throws Exception {
    SessionTokens tokens = mock(SessionTokens.class);
    when(tokens.userId()).thenReturn(107L);
    var controller = new RoleController(new DomainSupport(db, new AccessControl(db, tokens)));
    var individual = RoleController.class.getDeclaredMethod("dto", Map.class, String.class);
    individual.setAccessible(true);
    customerDelegationFixture();
    db.execute("INSERT INTO role_permission VALUES(112,'customer.manage')");
    for (String change :
        List.of(
            "SELECT 1",
            "UPDATE member_grant SET valid_from=now()+interval '1 day' WHERE id=122",
            "UPDATE app_user SET enabled=false,organization_id=103 WHERE id=108",
            "UPDATE app_user SET organization_id=NULL WHERE id=108",
            "UPDATE app_user SET management_organization_id=NULL WHERE id=108",
            "UPDATE app_user SET management_organization_id=102 WHERE id=108",
            "INSERT INTO member_grant_station VALUES(122,132)",
            "UPDATE app_role SET organization_id=101 WHERE id=113",
            "DELETE FROM member_grant_station WHERE grant_id=122 AND station_id=132",
            "UPDATE member_grant SET valid_from=now()-interval '2 days',valid_until=now()-interval"
                + " '1 day' WHERE id=122")) {
      db.execute(change);
      for (String purpose : List.of("manage", "assign")) {
        var actual = controller.roles(purpose, 102L).data();
        var row = db.queryForMap("SELECT * FROM app_role WHERE id=112");
        assertEquals(
            List.of(individual.invoke(controller, row, purpose)), actual, change + " / " + purpose);
      }
      var catalog = controller.permissions(102L).data();
      for (var item : catalog)
        assertEquals(
            actorDelegation().configurable(102, item.code()), item.configurable(), item.code());
    }
  }

  @Test
  void migrationSeedsRoleManagementWithoutAssigningAnyExistingRole() throws Exception {
    db.update("DELETE FROM role_permission WHERE permission_code='role.manage'");
    db.update("DELETE FROM permission WHERE code='role.manage'");
    Path migration = Path.of("src/main/resources/db/migration/V9__role_management_permission.sql");
    if (Files.exists(migration)) db.execute(Files.readString(migration));
    assertEquals(
        1,
        db.queryForObject(
            "SELECT count(*) FROM permission WHERE code='role.manage'", Integer.class));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM role_permission WHERE permission_code='role.manage'",
            Integer.class));
  }

  @Test
  void concurrentAdministratorsCannotMutuallyRemoveCompleteGovernance() throws Exception {
    db.update("UPDATE app_role SET organization_id=101 WHERE id=112");
    db.execute(
        "INSERT INTO role_permission"
            + " VALUES(112,'role.manage'),(112,'member.grant.manage'),(112,'asset.edit')");
    connection.commit();
    committedFixture = true;
    db.execute("SET search_path TO ems_permission_tests");
    connection.commit();
    var firstMutated = new CountDownLatch(1);
    var releaseFirst = new CountDownLatch(1);
    var secondAttempt = new CountDownLatch(1);
    var secondPid = new AtomicInteger();
    var pool = Executors.newFixedThreadPool(2);
    try {
      Future<Integer> first =
          pool.submit(() -> concurrentEdit(107, 112, firstMutated, releaseFirst, null, null));
      assertTrue(
          firstMutated.await(30, TimeUnit.SECONDS),
          "First transaction must reach uncommitted mutation");
      Future<Integer> second =
          pool.submit(() -> concurrentEdit(108, 111, null, null, secondAttempt, secondPid));
      assertTrue(secondAttempt.await(10, TimeUnit.SECONDS));
      long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
      boolean waiting = false;
      while (System.nanoTime() < deadline && !waiting) {
        waiting =
            Boolean.TRUE.equals(
                db.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=? AND locktype='advisory' AND"
                        + " NOT granted)",
                    Boolean.class,
                    secondPid.get()));
        if (!waiting) Thread.sleep(20);
      }
      assertTrue(waiting, "Second transaction must block on the shared advisory lock");
      releaseFirst.countDown();
      assertEquals(200, first.get(30, TimeUnit.SECONDS));
      assertEquals(409, second.get(30, TimeUnit.SECONDS));
      assertEquals(
          List.of(111L),
          db.queryForList(
              "SELECT role_id FROM role_permission WHERE permission_code='member.grant.manage'"
                  + " ORDER BY role_id",
              Long.class));
      assertEquals(
          1,
          db.queryForObject(
              "SELECT count(*) FROM audit_event WHERE action='role.permissions'", Integer.class));
    } finally {
      releaseFirst.countDown();
      pool.shutdown();
      assertTrue(
          pool.awaitTermination(40, TimeUnit.SECONDS),
          "Workers must terminate before fixture cleanup");
    }
  }

  int concurrentEdit(
      long user,
      long role,
      CountDownLatch mutated,
      CountDownLatch release,
      CountDownLatch attempting,
      AtomicInteger pid)
      throws Exception {
    try (Connection other =
        DriverManager.getConnection(
            System.getenv("EMS_TEST_DB_URL"),
            System.getenv("EMS_TEST_DB_USER"),
            System.getenv("EMS_TEST_DB_PASSWORD"))) {
      var source = new SingleConnectionDataSource(other, true);
      var jdbc = new JdbcTemplate(source);
      assertEquals(
          "ems_cloud_v2_proto", jdbc.queryForObject("SELECT current_database()", String.class));
      jdbc.execute("SET search_path TO ems_permission_tests");
      assertEquals(
          "ems_permission_tests", jdbc.queryForObject("SELECT current_schema()", String.class));
      jdbc.execute("SET statement_timeout='30s'");
      SessionTokens tokens = mock(SessionTokens.class);
      when(tokens.userId()).thenReturn(user);
      RoleController target =
          new RoleController(new DomainSupport(jdbc, new AccessControl(jdbc, tokens)));
      var factory = new org.springframework.aop.framework.ProxyFactory(target);
      factory.setProxyTargetClass(true);
      factory.addAdvice(
          new org.springframework.transaction.interceptor.TransactionInterceptor(
              new org.springframework.jdbc.datasource.DataSourceTransactionManager(source),
              new org.springframework.transaction.annotation
                  .AnnotationTransactionAttributeSource()));
      RoleController controller = (RoleController) factory.getProxy();
      if (pid != null) pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
      if (attempting != null) attempting.countDown();
      var transaction =
          new org.springframework.transaction.support.TransactionTemplate(
              new org.springframework.jdbc.datasource.DataSourceTransactionManager(source));
      try {
        transaction.executeWithoutResult(
            status -> {
              controller.replacePermissions(
                  role,
                  new RoleController.Permissions(
                      List.of("role.manage", "asset.read", "asset.edit")));
              if (mutated != null) {
                mutated.countDown();
                try {
                  if (!release.await(30, TimeUnit.SECONDS))
                    throw new IllegalStateException("Missing release");
                } catch (InterruptedException e) {
                  Thread.currentThread().interrupt();
                  throw new IllegalStateException(e);
                }
              }
            });
        return 200;
      } catch (com.enerlution.ems.common.BusinessException e) {
        return e.status();
      }
    }
  }
}
