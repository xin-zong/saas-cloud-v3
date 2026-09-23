package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.business.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.nio.file.*;
import java.sql.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** Opt-in real PostgreSQL regression; every object and fixture is rolled back. */
@EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = "ems_permission_tests")
class GrantAuthorizationPostgresTest {
  Connection connection;
  JdbcTemplate db;
  AccessControl access;

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
    String v1 =
        Files.readString(Path.of("src/main/resources/db/migration/V1__identity_assets.sql"));
    db.execute(v1.replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V6__member_grant_schema.sql")));
    Path v8 = Path.of("src/main/resources/db/migration/V8__effective_grant_permissions.sql");
    if (Files.exists(v8)) db.execute(Files.readString(v8));
    db.execute(
        """
CREATE TABLE operating_plan(id bigint,station_id bigint);
CREATE TABLE plan_period(plan_id bigint,power_kw numeric);
CREATE TABLE market_service(id bigint,starts_at timestamptz,ends_at timestamptz,status text);
CREATE TABLE market_allocation(service_id bigint,station_id bigint,capacity_kw numeric);
INSERT INTO organization(id,name) VALUES(1,'Root');
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id)
  VALUES(7,'actor','Actor','unused',1,1);
INSERT INTO permission(code,name) VALUES('asset.read','read'),('asset.edit','edit'),('report.export','export'),('revenue.read','revenue'),('organization.manage','org');
INSERT INTO app_role(id,code,name,organization_id) VALUES(11,'editor','Editor',1),(12,'reader','Reader',1);
INSERT INTO role_permission VALUES(11,'asset.edit'),(11,'asset.read'),(12,'asset.read');
INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES
  (101,'a','A',1,10,10),(102,'b','B',1,10,10);
INSERT INTO user_role VALUES(7,11),(7,12);
INSERT INTO user_station VALUES(7,101),(7,102);
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(21,7,11,now()-interval '1 day'),(22,7,12,now()-interval '1 day');
INSERT INTO member_grant_station VALUES(21,101),(22,102);
""");
    SessionTokens session = mock(SessionTokens.class);
    when(session.userId()).thenReturn(7L);
    access = new AccessControl(db, session);
  }

  @AfterEach
  void cleanup() throws Exception {
    if (connection != null) {
      connection.rollback();
      connection.close();
    }
  }

  @Test
  void stationOptionsExposeOnlyIdentityForExactCapabilityWithoutAssetRead() throws Exception {
    db.update("INSERT INTO permission(code,name) VALUES('workorder.read','orders'),('workorder.create','create')");
    db.update("DELETE FROM role_permission");
    db.update("INSERT INTO role_permission VALUES(11,'workorder.create'),(12,'workorder.read')");
    AssetController assets = new AssetController(new DomainSupport(db, access));
    // Reflection lets the RED test compile before the endpoint is introduced.
    var options = AssetController.class.getMethod("stationOptions", String.class);
    var response = (com.enerlution.ems.common.ApiResponse<?>) options.invoke(assets, "workorder.create");
    var rows = (List<?>) response.data();
    assertEquals(1, rows.size());
    assertEquals(Map.of("id", 101L, "name", "A"), rows.getFirst());
    assertEquals(List.of(Map.of("id", 102L, "name", "B")), assets.stationOptions("workorder.read").data());
    assertTrue(((List<?>) assets.stations(100, 0).data()).isEmpty());
    assertEquals(403, assertThrows(BusinessException.class, () -> assets.station(101)).status());
    for (String code : Arrays.asList(null, "", "unknown", "organization.manage", "firmware.upgrade")) {
      var failure = assertThrows(java.lang.reflect.InvocationTargetException.class, () -> options.invoke(assets, code));
      assertEquals(400, ((BusinessException) failure.getCause()).status(), String.valueOf(code));
    }
    var denied = assertThrows(java.lang.reflect.InvocationTargetException.class, () -> options.invoke(assets, "asset.read"));
    assertEquals(403, ((BusinessException) denied.getCause()).status());
    db.update("DELETE FROM member_grant WHERE id=21");
    var revoked = assertThrows(java.lang.reflect.InvocationTargetException.class, () -> options.invoke(assets, "workorder.create"));
    assertEquals(403, ((BusinessException) revoked.getCause()).status());
  }

  @Test
  void editorAtAReaderAtBMayEditOnlyA() {
    AssetController controller = new AssetController(new DomainSupport(db, access));
    var edit =
        new AssetController.Edit("Changed", BigDecimal.TEN, BigDecimal.TEN, null, null, null, null);
    assertDoesNotThrow(() -> controller.edit(101, edit));
    assertEquals(
        403, assertThrows(BusinessException.class, () -> controller.edit(102, edit)).status());
    assertEquals("B", db.queryForObject("select name from station where id=102", String.class));
  }

  @Test
  void retainedSessionRechecksExpiryRevocationRoleEditsAndDisabledAccount() {
    assertDoesNotThrow(() -> access.requireStationPermission(101, "asset.edit"));
    db.update("UPDATE member_grant SET valid_until=statement_timestamp() WHERE id=21");
    assertEquals(
        403,
        assertThrows(
                BusinessException.class, () -> access.requireStationPermission(101, "asset.edit"))
            .status());
    db.update(
        "UPDATE member_grant SET valid_until=NULL,valid_from=statement_timestamp()+interval '1"
            + " hour' WHERE id=21");
    assertEquals(
        403,
        assertThrows(
                BusinessException.class, () -> access.requireStationPermission(101, "asset.edit"))
            .status());
    db.update("UPDATE member_grant SET valid_from=statement_timestamp() WHERE id=21");
    assertDoesNotThrow(() -> access.requireStationPermission(101, "asset.edit"));
    db.update("DELETE FROM role_permission WHERE role_id=11 AND permission_code='asset.edit'");
    assertEquals(
        403,
        assertThrows(
                BusinessException.class, () -> access.requireStationPermission(101, "asset.edit"))
            .status());
    db.update("INSERT INTO role_permission VALUES(11,'asset.edit')");
    db.update("DELETE FROM member_grant WHERE id=21");
    assertEquals(
        403,
        assertThrows(
                BusinessException.class, () -> access.requireStationPermission(101, "asset.edit"))
            .status());
    db.update("UPDATE app_user SET enabled=false WHERE id=7");
    assertEquals(
        401,
        assertThrows(
                BusinessException.class, () -> access.requireStationPermission(102, "asset.read"))
            .status());
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM effective_station_permission WHERE user_id=7", Integer.class));
  }

  @Test
  void listsDetailsAndExportsUseTheRequestedPermissionAtTheSameStation() {
    db.update("DELETE FROM role_permission WHERE role_id=12");
    db.update("INSERT INTO role_permission VALUES(12,'report.export')");
    assertEquals(List.of(101L), access.stationIds("asset.read"));
    assertEquals(List.of(102L), access.stationIds("report.export"));
    AssetController assets = new AssetController(new DomainSupport(db, access));
    List<?> rows = (List<?>) assets.stations(100, 0).data();
    assertEquals(1, rows.size());
    assertEquals(101L, ((Number) ((Map<?, ?>) rows.getFirst()).get("id")).longValue());
    assertEquals(403, assertThrows(BusinessException.class, () -> assets.station(102)).status());
    ReportController reports = new ReportController(new DomainSupport(db, access));
    LocalDate date = LocalDate.now();
    // Export at B cannot borrow asset.read at A; A cannot borrow export at B.
    assertEquals(
        403,
        assertThrows(BusinessException.class, () -> reports.report(102, "health", date, date))
            .status());
    assertEquals(
        403,
        assertThrows(BusinessException.class, () -> reports.report(101, "health", date, date))
            .status());
    db.update("INSERT INTO role_permission VALUES(11,'report.export')");
    assertEquals(200, reports.report(101, "health", date, date).getStatusCode().value());
  }

  @Test
  void organizationScopeFollowsRoleOwnerAndNeverNullOwnerOrMovedMembership() {
    db.execute(
        "INSERT INTO organization(id,name,parent_id) VALUES(2,'Child',1),(3,'Sibling',NULL)");
    db.update("INSERT INTO role_permission VALUES(11,'organization.manage')");
    db.update("UPDATE app_user SET organization_id=3,management_organization_id=3 WHERE id=7");
    assertEquals(List.of(1L, 2L), access.organizationIds("organization.manage"));
    assertDoesNotThrow(() -> access.requireOrganizationPermission(2, "organization.manage"));
    assertEquals(
        403,
        assertThrows(
                BusinessException.class,
                () -> access.requireOrganizationPermission(3, "organization.manage"))
            .status());
    db.update("UPDATE app_role SET organization_id=NULL WHERE id=11");
    assertTrue(access.organizationIds("organization.manage").isEmpty());
    assertDoesNotThrow(() -> access.requireStationPermission(101, "asset.edit"));
  }

  @Test
  void everyAvailablePermissionHasScopedAllowAndDeny() throws Exception {
    var entries =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(Files.readString(Path.of("src/main/resources/permission-catalog.json")));
    db.execute("INSERT INTO organization(id,name) VALUES(3,'Outside')");
    for (var entry : entries) {
      if (!entry.path("available").asBoolean()) continue;
      String code = entry.path("code").asText();
      db.update("INSERT INTO permission(code,name) VALUES(?,?) ON CONFLICT DO NOTHING", code, code);
      db.update("INSERT INTO role_permission VALUES(11,?) ON CONFLICT DO NOTHING", code);
      if (entry.path("scope").asText().equals("station")) {
        assertDoesNotThrow(() -> access.requireStationPermission(101, code), code);
        db.update("DELETE FROM role_permission WHERE role_id=12 AND permission_code=?", code);
        assertEquals(
            403,
            assertThrows(
                    BusinessException.class, () -> access.requireStationPermission(102, code), code)
                .status());
      } else {
        assertDoesNotThrow(() -> access.requireOrganizationPermission(1, code), code);
        assertEquals(
            403,
            assertThrows(
                    BusinessException.class,
                    () -> access.requireOrganizationPermission(3, code),
                    code)
                .status());
      }
    }
  }

  @Test
  void customerSummariesAreIndependentAndManagementCannotCombineGrantBranches() {
    db.execute(
        """
INSERT INTO organization(id,name) VALUES(3,'Other');
INSERT INTO customer(id,name) VALUES(1,'Customer');
UPDATE station SET customer_id=1;
INSERT INTO permission VALUES('customer.read','customers'),('customer.manage','manage');
DELETE FROM role_permission;
INSERT INTO role_permission VALUES(11,'customer.read'),(11,'customer.manage'),(12,'customer.manage');
UPDATE app_role SET organization_id=3 WHERE id=12;
""");
    PlatformController platform = new PlatformController(new DomainSupport(db, access));
    List<?> rows = (List<?>) platform.customers().data();
    Map<?, ?> customer = (Map<?, ?>) rows.getFirst();
    assertEquals(1L, ((Number) customer.get("station_count")).longValue());
    assertEquals(false, customer.get("can_edit"));
    List<?> stations = (List<?>) customer.get("stations");
    assertEquals(Set.of("id", "name", "code"), ((Map<?, ?>) stations.getFirst()).keySet());
    assertEquals(
        403,
        assertThrows(
                BusinessException.class,
                () -> platform.editCustomer(1, new PlatformController.CustomerInput("Bad")))
            .status());
    // B is in organization 1; its managing grant is owned by organization 3: still denied.
    db.update("INSERT INTO member_grant_station VALUES(21,102)");
    assertDoesNotThrow(
        () -> platform.editCustomer(1, new PlatformController.CustomerInput("Good")));
  }

  @Test
  void approvalReaderIsScopedWhileSubmitterSeesOnlyOwnHistory() {
    db.execute(
        """
CREATE TABLE work_order(id bigint,station_id bigint);
CREATE TABLE approval(id bigint,plan_id bigint,work_order_id bigint,submitter_id bigint,reviewer_id bigint);
INSERT INTO app_user(id,account,display_name,password_hash) VALUES(8,'other','Other','unused');
INSERT INTO operating_plan VALUES(1,101),(2,102);
INSERT INTO approval VALUES(1,1,NULL,7,NULL),(2,1,NULL,8,NULL),(3,2,NULL,8,NULL);
""");
    OperationsController operations = new OperationsController(new DomainSupport(db, access));
    assertEquals(1, ((List<?>) operations.approvals(100, 0).data()).size());
    db.update("INSERT INTO permission VALUES('tariff.manage','Tariff')");
    db.update("DELETE FROM role_permission WHERE role_id=11");
    db.update("INSERT INTO role_permission VALUES(11,'tariff.manage')");
    // Any current entitlement at A retains own history, never another submitter's records.
    List<?> ownRows = (List<?>) operations.approvals(100, 0).data();
    assertEquals(1, ownRows.size());
    assertEquals(1L, ((Number) ((Map<?, ?>) ownRows.getFirst()).get("id")).longValue());
    db.update("INSERT INTO role_permission VALUES(11,'approval.read')");
    List<?> rows = (List<?>) operations.approvals(100, 0).data();
    assertEquals(2, rows.size());
    assertTrue(
        rows.stream()
            .allMatch(r -> ((Number) ((Map<?, ?>) r).get("station_id")).longValue() == 101));
    db.update("DELETE FROM member_grant WHERE id=21");
    assertTrue(((List<?>) operations.approvals(100, 0).data()).isEmpty());
  }

  @Test
  void emptyGrantsAreNotStationWildcardsAndDuplicatesDoNotDuplicateRows() {
    db.execute(
        """
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(23,7,11,now()-interval '1 day');
INSERT INTO member_grant_station VALUES(23,101);
""");
    assertEquals(List.of(101L), access.stationIds("asset.edit"));
    db.update("DELETE FROM member_grant_station WHERE grant_id IN (21,23)");
    assertTrue(access.stationIds("asset.edit").isEmpty());
    db.update("INSERT INTO role_permission VALUES(11,'organization.manage')");
    assertEquals(List.of(1L), access.organizationIds("organization.manage"));
  }

  @Test
  void reviewerMappingNeverChangesFrozenRolesOrOrdinarySubmitters() throws Exception {
    db.execute(
        """
        INSERT INTO permission VALUES('approval.review','review');
        INSERT INTO app_role(id,code,name) VALUES(13,'frozen','Frozen');
        INSERT INTO role_permission VALUES(11,'approval.review'),(13,'approval.review');
        """);
    String v8 =
        Files.readString(
            Path.of("src/main/resources/db/migration/V8__effective_grant_permissions.sql"));
    db.execute(v8.substring(v8.indexOf("INSERT INTO permission")));
    assertTrue(access.hasStationPermission(7, 101, "approval.read"));
    assertFalse(access.hasStationPermission(7, 102, "approval.read"));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM role_permission WHERE role_id=13 AND"
                + " permission_code='approval.read'",
            Integer.class));
  }

  @Test
  void authMeReturnsEffectiveMapsAndPreservesExactWorkspaceLabels() {
    SessionTokens session = mock(SessionTokens.class);
    when(session.userId()).thenReturn(7L);
    AuthService auth =
        new AuthService(
            db,
            session,
            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4),
            new TotpService(""),
            java.time.Clock.systemUTC());
    db.execute(
        """
        INSERT INTO permission VALUES('device.health.read','future');
        INSERT INTO role_permission VALUES(11,'device.health.read'),(11,'organization.manage');
        """);
    for (String label : List.of("owner", "operator", "integrator")) {
      db.update("UPDATE app_role SET code=? WHERE id=11", label + "__o1__r11");
      var me = auth.me();
      assertEquals(label, me.role());
      assertEquals(List.of("asset.edit", "asset.read"), me.stationPermissions().get("101"));
      assertEquals(List.of("asset.read"), me.stationPermissions().get("102"));
      assertEquals(List.of("organization.manage"), me.organizationPermissions().get("1"));
      assertFalse(me.permissions().contains("device.health.read"));
    }
    assertNull(AuthService.workspaceRole("owner__o1__r11junk"));
    assertNull(AuthService.workspaceRole("owner_custom"));
    assertEquals("owner", AuthService.workspaceRole("owner__onull__r11"));
    db.update("DELETE FROM member_grant WHERE id=21");
    var next = auth.me();
    assertFalse(next.stationPermissions().containsKey("101"));
    assertTrue(next.organizationPermissions().isEmpty());
    db.update("UPDATE app_user SET enabled=false WHERE id=7");
    assertEquals(401, assertThrows(BusinessException.class, auth::me).status());
  }
}
