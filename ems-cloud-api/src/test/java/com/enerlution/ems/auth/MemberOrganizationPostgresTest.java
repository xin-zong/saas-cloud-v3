package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.business.*;
import com.enerlution.ems.common.ApiExceptionHandler;
import com.fasterxml.jackson.databind.*;
import java.nio.file.*;
import java.sql.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Real authorization and SQL; all schema and fixture changes roll back. */
@EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = "ems_permission_tests")
class MemberOrganizationPostgresTest {
  Connection connection;
  JdbcTemplate db;
  MockMvc mvc;
  final ObjectMapper json = new ObjectMapper();
  String lastMessage;

  @Test
  void auditCapturesDisableAndRelationshipChangesWithoutCredentials() throws Exception {
    request("PUT", "/api/members/108", "{\"name\":\"Target\",\"enabled\":false,\"email\":null}", 200);
    var edit = json.readTree(db.queryForObject("SELECT detail FROM audit_event WHERE action='member.edit'", String.class));
    assertTrue(edit.path("before").path("enabled").asBoolean());
    assertFalse(edit.path("after").path("enabled").asBoolean(true));
    request("PUT", "/api/members/108/organization", "{\"organizationId\":103}", 200);
    var move = json.readTree(db.queryForObject("SELECT detail FROM audit_event WHERE action='member.organization'", String.class));
    assertEquals(102, move.path("before").path("organization_id").asLong());
    assertEquals(103, move.path("after").path("organization_id").asLong());
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Moved\",\"parentId\":103}", 200);
    var org = json.readTree(db.queryForObject("SELECT detail FROM audit_event WHERE action='organization.edit'", String.class));
    assertEquals(101, org.path("before").path("parent_id").asLong());
    assertEquals(103, org.path("after").path("parent_id").asLong());
    for (String detail : db.queryForList("SELECT detail FROM audit_event", String.class)) {
      assertFalse(detail.contains("password"));
      assertFalse(detail.contains("unused"));
      assertFalse(detail.contains("totp"));
    }
    assertEquals(3, db.queryForObject("SELECT count(*) FROM audit_event WHERE actor_id=107", Integer.class));
  }

  @Test
  void reparentCannotRemoveLastCompleteGovernanceHorizon() throws Exception {
    db.update(
        "INSERT INTO app_role(id,code,name,organization_id)"
            + " VALUES(118,'destination','Destination',104)");
    db.update(
        "INSERT INTO role_permission"
            + " VALUES(118,'organization.manage'),(118,'member.grant.manage')");
    db.update("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES(107,118,now())");
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":104}", 409);
    assertTrue(lastMessage.contains("最后一个完整治理入口"), lastMessage);
    assertEquals(
        101L, db.queryForObject("SELECT parent_id FROM organization WHERE id=102", Long.class));
  }

  @Test
  void membershipMoveLeavesPreexistingInvalidLeadUntouched() throws Exception {
    db.update("UPDATE organization SET lead_user_id=108 WHERE id IN (102,104)");
    request("PUT", "/api/members/108/organization", "{\"organizationId\":103}", 200);
    assertNull(db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
    assertEquals(
        108L, db.queryForObject("SELECT lead_user_id FROM organization WHERE id=104", Long.class));
  }

  @Test
  void renameDoesNotClearUnrelatedInvalidLead() throws Exception {
    db.update("UPDATE organization SET lead_user_id=108 WHERE id=104");
    request(
        "PUT",
        "/api/platform/organizations/102",
        "{\"name\":\"Renamed child\",\"parentId\":101}",
        200);
    assertEquals(
        108L, db.queryForObject("SELECT lead_user_id FROM organization WHERE id=104", Long.class));
  }

  @Test
  void reparentClearsOnlyFormerAncestorLead() throws Exception {
    db.update("INSERT INTO organization(id,name,parent_id) VALUES(106,'Grandchild',102)");
    db.update("UPDATE app_user SET organization_id=106 WHERE id=108");
    db.update("UPDATE organization SET lead_user_id=108 WHERE id IN (102,104)");
    request(
        "PUT",
        "/api/platform/organizations/106",
        "{\"name\":\"Grandchild\",\"parentId\":103}",
        200);
    assertNull(db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
    assertEquals(
        108L, db.queryForObject("SELECT lead_user_id FROM organization WHERE id=104", Long.class));
    request(
        "PUT",
        "/api/platform/organizations/106",
        "{\"name\":\"Grandchild\",\"parentId\":102}",
        200);
    db.update("UPDATE organization SET lead_user_id=109 WHERE id=102");
    request(
        "PUT",
        "/api/platform/organizations/106",
        "{\"name\":\"Grandchild\",\"parentId\":103}",
        200);
    assertEquals(
        109L, db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
  }

  @Test
  void compatibilityDirectoryUsesSameScopedLeadProjection() throws Exception {
    db.update("UPDATE organization SET lead_user_id=108 WHERE id=101");
    db.update("UPDATE organization SET lead_user_id=109 WHERE id=102");
    // Both owner and membership must be visible; either alone is insufficient.
    db.update("UPDATE app_user SET organization_id=102 WHERE id=109");
    for (String path : new String[] {"/api/platform/organizations", "/api/organizations"}) {
      var rows = request("GET", path, null, 200);
      assertEquals(3, rows.size(), path);
      assertEquals(101, rows.get(0).path("id").asLong());
      assertEquals("Root", rows.get(0).path("name").asText());
      assertTrue(rows.get(1).path("lead_user_id").isNull(), path);
      assertTrue(rows.get(1).path("lead_name").isNull(), path);
      assertTrue(rows.get(1).path("lead_restricted").asBoolean(), path);
      assertEquals(108, rows.get(0).path("lead_user_id").asLong(), path);
      assertEquals("Target", rows.get(0).path("lead_name").asText(), path);
      assertFalse(rows.get(0).path("lead_restricted").asBoolean(), path);
      assertEquals(101, rows.get(1).path("parent_id").asLong(), path);
    }
    db.update("UPDATE app_user SET management_organization_id=102,organization_id=104 WHERE id=109");
    for (String path : new String[] {"/api/platform/organizations", "/api/organizations"}) {
      var child = request("GET", path, null, 200).get(1);
      assertTrue(child.path("lead_user_id").isNull(), path);
      assertTrue(child.path("lead_restricted").asBoolean(), path);
    }
  }

  @Test
  void directoryMarksNestedManagementRootAndRedactsUnmanageableLead() throws Exception {
    db.update(
        "INSERT INTO app_role(id,code,name,organization_id) VALUES(118,'nested','Nested',102)");
    db.update("INSERT INTO role_permission VALUES(118,'organization.manage')");
    db.update("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES(107,118,now())");
    db.update("UPDATE organization SET lead_user_id=109 WHERE id=102");
    var rows = request("GET", "/api/platform/organizations?purpose=organizations", null, 200);
    var child = rows.get(1);
    assertTrue(child.has("can_reparent"));
    assertFalse(child.path("can_reparent").asBoolean());
    assertTrue(rows.get(2).path("can_reparent").asBoolean());
    assertTrue(child.path("lead_user_id").isNull());
    assertTrue(child.path("lead_name").isNull());
    assertTrue(child.path("lead_restricted").asBoolean());
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Name only\"}", 200);
    assertEquals(
        109L, db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
    request(
        "PUT",
        "/api/platform/organizations/102",
        "{\"name\":\"Name only\",\"leadUserId\":null}",
        200);
    assertNull(db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
  }

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
            Integer.class));
    for (String migration :
        new String[] {
          "V1__identity_assets.sql",
          "V6__member_grant_schema.sql",
          "V8__effective_grant_permissions.sql"
        })
      db.execute(
          Files.readString(Path.of("src/main/resources/db/migration/" + migration))
              .replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
    for (var p : PermissionCatalog.entries())
      db.update("INSERT INTO permission VALUES(?,?) ON CONFLICT DO NOTHING", p.code(), p.name());
    db.execute(
        """
INSERT INTO organization(id,name) VALUES(101,'Root'),(104,'Outside');
INSERT INTO organization(id,name,parent_id) VALUES(102,'Child',101),(103,'Sibling',101),(105,'External child',104);
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id,email)
  VALUES(107,'actor','Actor','unused',101,101,'actor@example.com'),(108,'target','Target','unused',102,102,'target@example.com'),
  (109,'orphan','Orphan','unused',NULL,104,NULL),(110,'unassigned','Unassigned','unused',NULL,102,NULL);
INSERT INTO app_role(id,code,name,organization_id) VALUES(111,'governor','Governor',101),(112,'reader','Reader',102);
INSERT INTO role_permission VALUES(111,'role.manage'),(111,'member.grant.manage'),(111,'member.manage.profile'),(111,'organization.manage'),(111,'organization.member.read'),(112,'asset.read');
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(121,107,111,now()-interval '1 day'),(122,108,112,now()-interval '1 day');
""");
    identity(107);
  }

  void identity(long user) {
    SessionTokens tokens = mock(SessionTokens.class);
    when(tokens.userId()).thenReturn(user);
    var s = new DomainSupport(db, new AccessControl(db, tokens));
    mvc =
        MockMvcBuilders.standaloneSetup(
                new MemberController(s, new BCryptPasswordEncoder()),
                new PlatformController(s),
                new SettingsController(s))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();
  }

  @AfterEach
  void cleanup() throws Exception {
    if (connection != null) {
      connection.rollback();
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
    if (actual != 404)
      lastMessage = json.readTree(result.getResponse().getContentAsString()).path("msg").asText();
    return actual == 404
        ? json.nullNode()
        : json.readTree(result.getResponse().getContentAsString()).path("data");
  }

  @Test
  void createsProfileWithoutGrantsAndRequiresExplicitOwnerForUnassigned() throws Exception {
    String base =
        "\"account\":\"new.member\",\"name\":\"New"
            + " member\",\"password\":\"long-password-123\",\"email\":\"new@example.com\"";
    request("POST", "/api/members", "{" + base + ",\"organizationId\":null}", 400);
    request(
        "POST",
        "/api/members",
        "{" + base + ",\"organizationId\":null,\"managementOrganizationId\":104}",
        403);
    long id =
        request(
                "POST",
                "/api/members",
                "{" + base + ",\"organizationId\":null,\"managementOrganizationId\":102}",
                200)
            .path("id")
            .asLong();
    assertNull(
        db.queryForObject("SELECT organization_id FROM app_user WHERE id=?", Long.class, id));
    assertEquals(
        102L,
        db.queryForObject(
            "SELECT management_organization_id FROM app_user WHERE id=?", Long.class, id));
    assertEquals(
        "new@example.com",
        db.queryForObject("SELECT email FROM app_user WHERE id=?", String.class, id));
    assertEquals(
        0,
        db.queryForObject("SELECT count(*) FROM member_grant WHERE user_id=?", Integer.class, id));
    assertTrue(
        new BCryptPasswordEncoder()
            .matches(
                "long-password-123",
                db.queryForObject(
                    "SELECT password_hash FROM app_user WHERE id=?", String.class, id)));
    request(
        "PUT",
        "/api/members/" + id,
        "{\"name\":\"Updated\",\"email\":\"updated@example.com\",\"enabled\":false}",
        200);
    assertEquals(
        "updated@example.com",
        db.queryForObject("SELECT email FROM app_user WHERE id=?", String.class, id));
  }

  @Test
  void membershipMovesKeepOwnerAndGrantAndClearIllegalLead() throws Exception {
    db.update("UPDATE organization SET lead_user_id=108 WHERE id=102");
    request("PUT", "/api/members/108/organization", "{\"organizationId\":103}", 200);
    assertEquals(
        102L,
        db.queryForObject(
            "SELECT management_organization_id FROM app_user WHERE id=108", Long.class));
    assertNull(db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
    request("PUT", "/api/members/108/organization", "{\"organizationId\":null}", 200);
    assertEquals(
        1,
        db.queryForObject(
            "SELECT count(*) FROM member_grant WHERE user_id=108 AND role_id=112", Integer.class));
    request("PUT", "/api/members/108/organization", "{\"organizationId\":104}", 403);
    request("PUT", "/api/members/109/organization", "{\"organizationId\":102}", 403);
    request("PUT", "/api/members/107/organization", "{\"organizationId\":102}", 409);
    request("PUT", "/api/members/108/organization", "{}", 400);
  }

  @Test
  void leadValidationAndNewOrganizationTemplates() throws Exception {
    request(
        "PUT",
        "/api/platform/organizations/102",
        "{\"name\":\"Child\",\"parentId\":101,\"leadUserId\":108}",
        200);
    assertEquals(
        108L, db.queryForObject("SELECT lead_user_id FROM organization WHERE id=102", Long.class));
    request(
        "PUT",
        "/api/platform/organizations/102",
        "{\"name\":\"Child\",\"parentId\":101,\"leadUserId\":109}",
        400);
    long id =
        request(
                "POST",
                "/api/platform/organizations",
                "{\"name\":\"New child\",\"parentId\":102}",
                200)
            .path("id")
            .asLong();
    assertEquals(
        8,
        db.queryForObject(
            "SELECT count(*) FROM app_role WHERE organization_id=?", Integer.class, id));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM member_grant g JOIN app_role r ON r.id=g.role_id WHERE"
                + " r.organization_id=?",
            Integer.class,
            id));
    var codes =
        db.queryForList(
            "SELECT permission_code FROM role_permission rp JOIN app_role r ON r.id=rp.role_id"
                + " WHERE r.organization_id=?",
            String.class,
            id);
    assertFalse(codes.isEmpty());
    for (String code : codes) assertTrue(PermissionCatalog.available(code));
  }

  @Test
  void granularDirectoriesExposeOnlyPurposeFieldsWithinBothScopes() throws Exception {
    db.update(
        "DELETE FROM role_permission WHERE role_id=111 AND permission_code NOT IN"
            + " ('member.manage.profile','organization.manage')");
    var members = request("GET", "/api/members?purpose=profiles", null, 200);
    assertEquals(3, members.size());
    assertTrue(members.get(0).has("email"));
    var choices = request("GET", "/api/members?purpose=organizations", null, 200);
    assertEquals(3, choices.size());
    assertFalse(choices.get(0).has("email"));
    assertEquals(
        3, request("GET", "/api/platform/organizations?purpose=organizations", null, 200).size());
    request("GET", "/api/members", null, 403);
    request("PUT", "/api/members/110/organization", "{\"organizationId\":103}", 200);
    assertEquals(
        102L,
        db.queryForObject(
            "SELECT management_organization_id FROM app_user WHERE id=110", Long.class));
  }

  @Test
  void deletionPreservesActiveAndRevokedGrantHistoryAndOtherReferences() throws Exception {
    request("DELETE", "/api/members/108", null, 409);
    db.update("DELETE FROM member_grant WHERE user_id=108");
    db.update(
        "INSERT INTO audit_event(actor_id,action,detail) VALUES(107,'legacy','not"
            + " json'),(107,'member.grant.revoke','{\"memberId\":108,\"before\":{}}')");
    request("DELETE", "/api/members/108", null, 409);
    db.update(
        "INSERT INTO audit_event(actor_id,action,detail)"
            + " VALUES(107,'member.grant.revoke','{\"memberId\":1100}')");
    request("DELETE", "/api/members/110", null, 200);
    assertEquals(1, db.queryForObject("SELECT count(*) FROM app_user WHERE id=108", Integer.class));
    request("DELETE", "/api/members/107", null, 409);
  }

  @Test
  void disableCannotRemoveLastGovernorAndProfileCannotMoveMembership() throws Exception {
    request("PUT", "/api/members/107", "{\"name\":\"Actor\",\"enabled\":false}", 409);
    db.update(
        "INSERT INTO"
            + " app_user(id,account,display_name,password_hash,organization_id,management_organization_id)"
            + " VALUES(115,'second','Second','unused',101,101)");
    db.update(
        "INSERT INTO app_role(id,code,name,organization_id) VALUES(116,'profile','Profile',101)");
    db.update("INSERT INTO role_permission VALUES(116,'member.manage.profile')");
    db.update("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES(115,116,now())");
    identity(115);
    request("PUT", "/api/members/107", "{\"name\":\"Actor\",\"enabled\":false}", 409);
    request(
        "PUT",
        "/api/members/108",
        "{\"name\":\"Target\",\"enabled\":true,\"organizationId\":103}",
        400);
    assertEquals(
        102L, db.queryForObject("SELECT organization_id FROM app_user WHERE id=108", Long.class));
  }

  @Test
  void organizationMovesProtectRootCyclesGovernanceAndUnmanagedGrants() throws Exception {
    request("PUT", "/api/platform/organizations/101", "{\"name\":\"Root\",\"parentId\":102}", 409);
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":102}", 400);
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":104}", 403);
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":103}", 200);
    db.update("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES(109,112,now())");
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":101}", 403);
  }

  @Test
  void receivingAncestorGrantCannotSilentlyBroadenToMovedBranch() throws Exception {
    db.update(
        "INSERT INTO app_role(id,code,name,organization_id)"
            + " VALUES(117,'receiving','Receiving',103)");
    db.update("INSERT INTO role_permission VALUES(117,'organization.member.read')");
    db.update("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES(109,117,now())");
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":103}", 403);
    assertEquals(
        101L, db.queryForObject("SELECT parent_id FROM organization WHERE id=102", Long.class));
  }

  @Test
  void reparentCannotUseItsOwnNewScopeToAuthorizeGovernanceExpansion() throws Exception {
    db.update(
        "DELETE FROM role_permission WHERE role_id=111 AND permission_code IN"
            + " ('role.manage','member.grant.manage')");
    db.update(
        "INSERT INTO app_role(id,code,name,organization_id)"
            + " VALUES(117,'receiving','Receiving',103)");
    db.update("INSERT INTO role_permission VALUES(117,'role.manage'),(117,'member.grant.manage')");
    db.update("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES(107,117,now())");
    request("PUT", "/api/platform/organizations/102", "{\"name\":\"Child\",\"parentId\":103}", 403);
    assertEquals(
        101L, db.queryForObject("SELECT parent_id FROM organization WHERE id=102", Long.class));
  }
}
