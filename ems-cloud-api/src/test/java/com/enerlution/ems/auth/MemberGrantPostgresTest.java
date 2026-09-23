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
class MemberGrantPostgresTest {
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
    controllers.add(new SettingsController(support));
    controllers.add(
        new MemberController(
            support, new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()));
    // Allows the first RED run to demonstrate missing endpoint behavior before implementation.
    try {
      controllers.add(
          Class.forName("com.enerlution.ems.business.MemberGrantController")
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

  String input(long role, String stations, String term) {
    return "{\"roleId\":" + role + ",\"stationIds\":" + stations + ",\"term\":\"" + term + "\"}";
  }

  @Test
  void grantOnlyOperatorCanSelectOnlyManagedTargetsWithoutProfileDetails() throws Exception {
    db.update(
        "DELETE FROM role_permission WHERE role_id=111 AND permission_code<>'member.grant.manage'");
    db.update("UPDATE app_user SET email='private@example.invalid' WHERE id=108");
    var members = request("GET", "/api/members?purpose=grants", null, 200);
    assertEquals(2, members.size());
    assertTrue(members.findValuesAsText("email").isEmpty());
    assertTrue(members.findValuesAsText("display_name").contains("Target"));
    request("GET", "/api/members", null, 403);
    db.update("UPDATE app_user SET organization_id=103 WHERE id=108");
    assertEquals(1, request("GET", "/api/members?purpose=grants", null, 200).size());
    db.update(
        "UPDATE app_user SET organization_id=NULL,management_organization_id=103 WHERE id=108");
    assertEquals(1, request("GET", "/api/members?purpose=grants", null, 200).size());
  }

  @Test
  void independentCrudPreservesOtherGrantsAndAuditsActualIssuer() throws Exception {
    var grant = request("POST", "/api/members/108/grants", input(112, "[131]", "30d"), 200);
    long id = grant.path("id").asLong();
    assertEquals("30d", grant.path("term").asText());
    assertEquals("active", grant.path("status").asText());
    assertEquals("直接授权", grant.path("source").asText());
    assertEquals(
        107L, db.queryForObject("SELECT granted_by FROM member_grant WHERE id=?", Long.class, id));
    var edited = request("PUT", "/api/members/108/grants/" + id, input(112, "[131]", "30d"), 200);
    assertEquals(grant.path("validFrom"), edited.path("validFrom"));
    assertEquals(grant.path("validUntil"), edited.path("validUntil"));
    request("DELETE", "/api/members/108/grants/" + id, null, 200);
    request("DELETE", "/api/members/108/grants/" + id, null, 404);
    assertEquals(
        List.of(122L),
        db.queryForList("SELECT id FROM member_grant WHERE user_id=108", Long.class));
    var rows = request("GET", "/api/members/108/grants", null, 200);
    assertEquals("历史迁移", rows.get(0).path("source").asText());
    assertEquals(3, db.queryForObject("SELECT count(*) FROM audit_event", Integer.class));
    request("PUT", "/api/members/108/grants", "{\"roleIds\":[112],\"stationIds\":[131]}", 410);
  }

  @Test
  void validationRejectsEmptyDuplicateMissingRoleAndForeignGrant() throws Exception {
    request("POST", "/api/members/108/grants", input(112, "[]", "30d"), 400);
    request("POST", "/api/members/108/grants", input(112, "[131,131]", "30d"), 400);
    request("POST", "/api/members/108/grants", input(999, "[131]", "30d"), 404);
    request("POST", "/api/members/108/grants", input(112, "[132]", "30d"), 403);
    request("POST", "/api/members/108/grants", input(112, "[131]", "custom"), 400);
    request("DELETE", "/api/members/108/grants/121", null, 404);
    request("GET", "/api/members/108/grant-options?roleId=112&term=30d&grantId=121", null, 404);
    db.update("UPDATE app_user SET organization_id=103 WHERE id=108");
    request("POST", "/api/members/108/grants", input(112, "[131]", "30d"), 403);
    db.update(
        "UPDATE app_user SET organization_id=NULL,management_organization_id=103 WHERE id=108");
    request("GET", "/api/members/108/grants", null, 403);
    db.update("UPDATE app_user SET enabled=false WHERE id=107");
    request("POST", "/api/members/108/grants", input(112, "[131]", "30d"), 401);
  }

  @Test
  void optionsAndSaveUseSameBoundedDelegationWithoutAssetRead() throws Exception {
    db.update("DELETE FROM role_permission WHERE permission_code IN ('asset.read','asset.edit')");
    db.update(
        "INSERT INTO role_permission VALUES(111,'workorder.handle'),(112,'workorder.handle')");
    db.update(
        "UPDATE member_grant SET valid_until=statement_timestamp()+interval '40 days' WHERE"
            + " id=121");
    var options = request("GET", "/api/members/108/grant-options?roleId=112&term=30d", null, 200);
    assertTrue(options.path("stationSelectionRequired").asBoolean());
    assertEquals(1, options.path("stations").size());
    assertEquals(131, options.path("stations").get(0).path("id").asLong());
    assertTrue(options.path("stations").get(0).path("selectable").asBoolean());
    request("POST", "/api/members/108/grants", input(112, "[131]", "30d"), 200);
    request("POST", "/api/members/108/grants", input(112, "[131]", "90d"), 403);
    request("POST", "/api/members/108/grants", input(112, "[131]", "permanent"), 403);
    var denied = request("GET", "/api/members/108/grant-options?roleId=112&term=90d", null, 200);
    assertFalse(denied.path("stations").get(0).path("selectable").asBoolean());
    assertFalse(denied.path("stations").get(0).path("reason").asText().isBlank());
  }

  @Test
  void pureOrganizationRoleAllowsZeroStationsForZeroStationDelegator() throws Exception {
    db.update("DELETE FROM member_grant_station");
    db.update("DELETE FROM role_permission WHERE permission_code LIKE 'asset.%'");
    db.update("INSERT INTO role_permission VALUES(112,'member.grant.manage')");
    var options =
        request("GET", "/api/members/108/grant-options?roleId=112&term=permanent", null, 200);
    assertFalse(options.path("stationSelectionRequired").asBoolean());
    assertTrue(options.path("canSaveWithoutStations").asBoolean());
    var created = request("POST", "/api/members/108/grants", input(112, "[]", "permanent"), 200);
    assertTrue(created.path("stationIds").isEmpty());
    assertTrue(created.path("validUntil").isNull());
    SessionTokens target = mock(SessionTokens.class);
    when(target.userId()).thenReturn(108L);
    var access = new AccessControl(db, target);
    assertEquals(List.of(102L), access.organizationIds("member.grant.manage"));
    assertTrue(access.stationPermissions().isEmpty());
  }

  @Test
  void existingUnassignableRoleCanNarrowButCannotExpandOrRenew() throws Exception {
    db.update("INSERT INTO role_permission VALUES(112,'workorder.manage')");
    db.update(
        "UPDATE member_grant SET valid_until=statement_timestamp()+interval '5 days' WHERE id=121");
    var preserved =
        request("PUT", "/api/members/108/grants/122", input(112, "[131]", "permanent"), 200);
    assertTrue(preserved.path("validUntil").isNull());
    assertFalse(preserved.path("canExpand").asBoolean());
    request("POST", "/api/members/108/grants", input(112, "[131]", "30d"), 400);
    request("PUT", "/api/members/108/grants/122", input(112, "[131]", "30d"), 200);
    request("PUT", "/api/members/108/grants/122", input(112, "[131]", "90d"), 400);
    request("DELETE", "/api/members/108/grants/122", null, 200);
  }

  @Test
  void unchangedTermPreservesExpiryInOptionsAndExpiredEdits() throws Exception {
    db.update(
        "UPDATE member_grant SET valid_from=statement_timestamp()-interval '20"
            + " days',valid_until=statement_timestamp()+interval '10 days' WHERE id=122");
    db.update(
        "UPDATE member_grant SET valid_until=statement_timestamp()+interval '11 days' WHERE"
            + " id=121");
    var rows = request("GET", "/api/members/108/grants", null, 200);
    var options =
        request("GET", "/api/members/108/grant-options?roleId=112&term=30d&grantId=122", null, 200);
    assertEquals(rows.get(0).path("validUntil"), options.path("validUntil"));
    assertEquals(rows.get(0).path("validFrom"), options.path("validFrom"));
    assertTrue(options.path("stations").get(0).path("selectable").asBoolean());
    db.update(
        "UPDATE member_grant SET valid_from=statement_timestamp()-interval '30"
            + " days',valid_until=statement_timestamp() WHERE id=122");
    var expired = request("PUT", "/api/members/108/grants/122", input(112, "[131]", "30d"), 200);
    assertEquals("expired", expired.path("status").asText());
    request("PUT", "/api/members/108/grants/122", input(112, "[131]", "90d"), 403);
    request("DELETE", "/api/members/108/grants/122", null, 200);
  }

  @Test
  void customAndFuturePeriodsAreIntelligibleAndExplicitRestartRequired() throws Exception {
    db.update(
        "UPDATE member_grant SET valid_from=statement_timestamp()+interval '1"
            + " day',valid_until=statement_timestamp()+interval '8 days' WHERE id=122");
    var row = request("GET", "/api/members/108/grants", null, 200).get(0);
    assertEquals("custom", row.path("term").asText());
    assertEquals("scheduled", row.path("status").asText());
    request("PUT", "/api/members/108/grants/122", input(112, "[131]", "custom"), 400);
    var restarted = request("PUT", "/api/members/108/grants/122", input(112, "[131]", "1y"), 200);
    assertEquals("1y", restarted.path("term").asText());
    assertEquals("active", restarted.path("status").asText());
    db.update(
        "UPDATE member_grant SET valid_from='2024-02-28 18:00:00Z',valid_until='2025-02-27"
            + " 18:00:00Z' WHERE id=122");
    var leapYear = request("GET", "/api/members/108/grants", null, 200).get(0);
    assertEquals("1y", leapYear.path("term").asText());
  }

  @Test
  void partialGrantIsRedactedLockedAndCannotEraseHiddenStations() throws Exception {
    db.update("INSERT INTO member_grant_station VALUES(122,132)");
    var row = request("GET", "/api/members/108/grants", null, 200).get(0);
    assertTrue(row.path("scopeRestricted").asBoolean());
    assertTrue(row.path("stationIds").isEmpty());
    assertFalse(row.path("canEdit").asBoolean());
    assertFalse(row.path("canRevoke").asBoolean());
    request("PUT", "/api/members/108/grants/122", input(112, "[131]", "permanent"), 403);
    request("DELETE", "/api/members/108/grants/122", null, 403);
    assertEquals(
        2,
        db.queryForObject(
            "SELECT count(*) FROM member_grant_station WHERE grant_id=122", Integer.class));
  }

  @Test
  void organizationReaderWithoutStationSelectionsCanInspectButCannotWriteOrReadAssets()
      throws Exception {
    db.update("DELETE FROM member_grant_station WHERE grant_id=121");
    db.update("DELETE FROM role_permission WHERE role_id=111");
    db.update("INSERT INTO role_permission VALUES(111,'organization.member.read')");
    var row = request("GET", "/api/members/108/grants", null, 200).get(0);
    assertFalse(row.path("scopeRestricted").asBoolean());
    assertEquals("Shared", row.path("roleName").asText());
    assertEquals("A", row.path("stations").get(0).path("name").asText());
    assertFalse(row.path("canEdit").asBoolean());
    assertFalse(row.path("canRevoke").asBoolean());
    SessionTokens actor = mock(SessionTokens.class);
    when(actor.userId()).thenReturn(107L);
    var access = new AccessControl(db, actor);
    assertFalse(access.hasStationPermission(107L, 131L, "asset.read"));
    request("DELETE", "/api/members/108/grants/122", null, 403);
    db.update("INSERT INTO role_permission VALUES(111,'member.grant.manage')");
    db.update(
        "DELETE FROM role_permission WHERE role_id=111 AND"
            + " permission_code='organization.member.read'");
    var operator = request("GET", "/api/members/108/grants", null, 200).get(0);
    assertFalse(operator.path("scopeRestricted").asBoolean());
    assertFalse(operator.path("canRevoke").asBoolean());
    request("DELETE", "/api/members/108/grants/122", null, 403);
  }

  @Test
  void memberReaderCanInspectScopedRolePermissionsWithoutWriteAuthority() throws Exception {
    db.update(
        "DELETE FROM role_permission WHERE role_id=111 AND permission_code IN"
            + " ('role.manage','member.grant.manage')");
    db.update("INSERT INTO role_permission VALUES(111,'organization.member.read')");
    var row = request("GET", "/api/members/108/grants", null, 200).get(0);
    assertEquals("asset.read", row.path("permissionCodes").get(0).asText());
    assertEquals("asset.read", row.path("rolePermissions").get(0).path("code").asText());
    assertFalse(row.path("canEdit").asBoolean());
    request("POST", "/api/members/108/grants", input(112, "[131]", "30d"), 403);
  }

  @Test
  void otherAdministratorCannotRevokeLastCompleteGovernor() throws Exception {
    db.update("UPDATE app_role SET organization_id=101 WHERE id=112");
    db.update("INSERT INTO role_permission VALUES(112,'member.grant.manage')");
    db.update(
        "UPDATE app_user SET management_organization_id=101,organization_id=101 WHERE id=108");
    identity(108);
    request("DELETE", "/api/members/107/grants/121", null, 409);
    assertEquals(
        1, db.queryForObject("SELECT count(*) FROM member_grant WHERE id=121", Integer.class));
    assertEquals(0, db.queryForObject("SELECT count(*) FROM audit_event", Integer.class));
  }

  @Test
  void concurrentRevocationsSerializeAndRecheckExactGrant() throws Exception {
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
          pool.submit(() -> concurrentRevoke(firstMutated, releaseFirst, null, null));
      assertTrue(firstMutated.await(30, TimeUnit.SECONDS));
      Future<Integer> second =
          pool.submit(() -> concurrentRevoke(null, null, secondAttempt, secondPid));
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
      assertTrue(waiting, "Second endpoint writer must wait for shared governance lock");
      releaseFirst.countDown();
      assertEquals(200, first.get(30, TimeUnit.SECONDS));
      assertEquals(404, second.get(30, TimeUnit.SECONDS));
      assertEquals(
          List.of(121L), db.queryForList("SELECT id FROM member_grant ORDER BY id", Long.class));
      assertEquals(
          1,
          db.queryForObject(
              "SELECT count(*) FROM audit_event WHERE action='member.grant.revoke'",
              Integer.class));
    } finally {
      releaseFirst.countDown();
      pool.shutdown();
      assertTrue(
          pool.awaitTermination(40, TimeUnit.SECONDS), "Workers terminate before fixture cleanup");
    }
  }

  int concurrentRevoke(
      CountDownLatch mutated, CountDownLatch release, CountDownLatch attempting, AtomicInteger pid)
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
      when(tokens.userId()).thenReturn(107L);
      Object target =
          Class.forName("com.enerlution.ems.business.MemberGrantController")
              .getConstructor(DomainSupport.class)
              .newInstance(new DomainSupport(jdbc, new AccessControl(jdbc, tokens)));
      var factory = new org.springframework.aop.framework.ProxyFactory(target);
      factory.setProxyTargetClass(true);
      factory.addAdvice(
          new org.springframework.transaction.interceptor.TransactionInterceptor(
              new org.springframework.jdbc.datasource.DataSourceTransactionManager(source),
              new org.springframework.transaction.annotation
                  .AnnotationTransactionAttributeSource()));
      MockMvc endpoint =
          MockMvcBuilders.standaloneSetup(factory.getProxy())
              .setControllerAdvice(new ApiExceptionHandler())
              .build();
      if (pid != null) pid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
      if (attempting != null) attempting.countDown();
      var transaction =
          new org.springframework.transaction.support.TransactionTemplate(
              new org.springframework.jdbc.datasource.DataSourceTransactionManager(source));
      try {
        transaction.executeWithoutResult(
            status -> {
              try {
                int code =
                    endpoint
                        .perform(delete("/api/members/108/grants/122"))
                        .andReturn()
                        .getResponse()
                        .getStatus();
                if (code != 200)
                  throw new com.enerlution.ems.common.BusinessException(code, "revoke rejected");
                if (mutated != null) {
                  mutated.countDown();
                  if (!release.await(30, TimeUnit.SECONDS))
                    throw new IllegalStateException("Missing release");
                }
              } catch (com.enerlution.ems.common.BusinessException e) {
                throw e;
              } catch (Exception e) {
                throw new IllegalStateException(e);
              }
            });
        return 200;
      } catch (com.enerlution.ems.common.BusinessException e) {
        return e.status();
      }
    }
  }
}
