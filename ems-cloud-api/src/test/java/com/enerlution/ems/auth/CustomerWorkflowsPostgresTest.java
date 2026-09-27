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
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = "ems_permission_tests")
class CustomerWorkflowsPostgresTest {
  Connection connection;
  JdbcTemplate db;
  MockMvc mvc;
  final ObjectMapper json = new ObjectMapper();
  String lastMessage;

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
          "V2__maintenance_operations.sql",
          "V3__market_settlement_permissions.sql",
          "V6__member_grant_schema.sql",
          "V8__effective_grant_permissions.sql"
        })
      db.execute(
          Files.readString(Path.of("src/main/resources/db/migration/" + migration))
              .replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
    var migration = Path.of("src/main/resources/db/migration/V10__customer_profiles.sql");
    db.execute(Files.readString(migration));
    for (var p : PermissionCatalog.entries())
      db.update("INSERT INTO permission VALUES(?,?) ON CONFLICT DO NOTHING", p.code(), p.name());
    db.execute(
        """
INSERT INTO organization(id,name) VALUES(101,'Root'),(104,'Outside');
INSERT INTO organization(id,name,parent_id) VALUES(102,'Child',101),(103,'Sibling',101);
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id)
 VALUES(107,'actor','Actor','unused',101,101);
INSERT INTO app_role(id,code,name,organization_id) VALUES(111,'governor','Governor',101);
INSERT INTO role_permission VALUES(111,'customer.read'),(111,'customer.manage'),(111,'asset.read'),(111,'asset.edit');
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(121,107,111,now()-interval '1 day');
INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh)
 VALUES(201,'one','One',102,100,200),(202,'two','Two',103,100,200),(203,'outside','Outside',104,100,200);
INSERT INTO member_grant_station VALUES(121,201),(121,202);
""");
    identity(107);
  }

  void identity(long user) {
    SessionTokens tokens = mock(SessionTokens.class);
    when(tokens.userId()).thenReturn(user);
    var s = new DomainSupport(db, new AccessControl(db, tokens));
    mvc =
        MockMvcBuilders.standaloneSetup(
                new AssetController(s), new PlatformController(s), new SettingsController(s))
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
    assertEquals(
        status,
        actual,
        result.getResponse().getContentAsString() + " / " + result.getResolvedException());
    if (actual != 404)
      lastMessage = json.readTree(result.getResponse().getContentAsString()).path("msg").asText();
    return actual == 404
        ? json.nullNode()
        : json.readTree(result.getResponse().getContentAsString()).path("data");
  }

  @Test
  void createsStandaloneCustomerAndPersistsProfile() throws Exception {
    var created =
        request(
            "POST",
            "/api/platform/customers",
            """
            {"name":" Acme \","organizationId":101,"entity":" Acme Ltd ","contact":"a@example.com"}
            """,
            200);
    var rows = request("GET", "/api/platform/customers", null, 200);
    assertEquals(1, rows.size());
    assertEquals(created.path("id"), rows.get(0).path("id"));
    assertEquals("Acme", rows.get(0).path("name").asText());
    assertEquals("Acme Ltd", rows.get(0).path("entity").asText());
    assertEquals(0, rows.get(0).path("station_count").asInt());
    assertTrue(rows.get(0).path("can_edit").asBoolean());
  }

  long create(String name, long org) throws Exception {
    return request(
            "POST",
            "/api/platform/customers",
            "{\"name\":\"" + name + "\",\"organizationId\":" + org + "}",
            200)
        .path("id")
        .asLong();
  }

  String stationBody(String extra) {
    return "{\"name\":\"One\",\"ratedPowerKw\":100,\"capacityKwh\":200" + extra + "}";
  }

  @Test
  void omissionPreservesAndExplicitNullClearsProfileAndBinding() throws Exception {
    long id = create("Acme", 101);
    request(
        "PUT",
        "/api/platform/customers/" + id,
        "{\"entity\":\"Entity\",\"contact\":\"Contact\"}",
        200);
    request("PUT", "/api/platform/customers/" + id, "{\"name\":\"Renamed\"}", 200);
    var row = request("GET", "/api/platform/customers", null, 200).get(0);
    assertEquals("Entity", row.path("entity").asText());
    assertEquals("Contact", row.path("contact").asText());
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":" + id), 200);
    request("PUT", "/api/stations/201", stationBody(""), 200);
    assertEquals(id, request("GET", "/api/stations/201", null, 200).path("customer_id").asLong());
    assertEquals(
        1,
        request("GET", "/api/platform/customers", null, 200).get(0).path("station_count").asInt());
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":null"), 200);
    assertTrue(request("GET", "/api/stations/201", null, 200).path("customer_id").isNull());
    request("PUT", "/api/platform/customers/" + id, "{\"entity\":null,\"contact\":\"  \"}", 200);
    row = request("GET", "/api/platform/customers", null, 200).get(0);
    assertTrue(row.path("entity").isNull());
    assertTrue(row.path("contact").isNull());
    assertEquals(
        3,
        db.queryForObject(
            "SELECT count(*) FROM audit_event WHERE action='customer.edit'", Integer.class));
    assertEquals(
        2,
        db.queryForObject(
            "SELECT count(*) FROM audit_event WHERE action='station.customer'", Integer.class));
  }

  @Test
  void invalidDuplicatesAndCrossOrganizationAreRejected() throws Exception {
    long id = create("Acme", 102);
    request("POST", "/api/platform/customers", "{\"name\":\" Acme \",\"organizationId\":101}", 409);
    request("POST", "/api/platform/customers", "{\"name\":\" \",\"organizationId\":101}", 400);
    request("POST", "/api/platform/customers", "{\"name\":\"No\",\"organizationId\":104}", 403);
    request("POST", "/api/platform/customers", "{\"name\":\"No\"}", 400);
    request("PUT", "/api/platform/customers/" + id, "{\"name\":null}", 400);
    request("PUT", "/api/platform/customers/" + id, "{\"organizationId\":103}", 400);
    request("PUT", "/api/stations/202", stationBody(",\"customerId\":" + id), 403);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":1.5"), 400);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":999"), 403);
    assertTrue(request("GET", "/api/stations/201", null, 200).path("customer_id").isNull());
  }

  @Test
  void partialScopeCannotReassignOrUnlinkOldCustomerOrAssignNewCustomer() throws Exception {
    long old = create("Old", 101), next = create("Next", 101);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":" + old), 200);
    request("PUT", "/api/stations/202", stationBody(",\"customerId\":" + old), 200);
    db.update("DELETE FROM member_grant_station WHERE station_id=202");
    assertFalse(
        request("GET", "/api/platform/customers/options?stationId=201", null, 200)
            .path("can_assign")
            .asBoolean());
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":null"), 403);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":" + next), 403);
    request("PUT", "/api/platform/customers/" + old, "{\"name\":\"Blocked\"}", 403);
    db.update("UPDATE station SET customer_id=? WHERE id=202", next);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":" + next), 403);
    assertEquals(old, request("GET", "/api/stations/201", null, 200).path("customer_id").asLong());
  }

  @Test
  void organizationBranchesAndPermissionsBoundStandaloneCustomersAndOptions() throws Exception {
    long root = create("Root owner", 101),
        child = create("Child owner", 102),
        sibling = create("Sibling owner", 103);
    db.update("UPDATE app_role SET organization_id=102 WHERE id=111");
    var rows = request("GET", "/api/platform/customers", null, 200);
    assertEquals(1, rows.size());
    assertEquals(child, rows.get(0).path("id").asLong());
    assertEquals(
        1,
        request("GET", "/api/platform/customers/create-options", null, 200)
            .path("organizations")
            .size());
    request("PUT", "/api/platform/customers/" + root, "{\"name\":\"Blocked\"}", 403);
    request("PUT", "/api/stations/202", stationBody(",\"customerId\":" + child), 403);
    db.update("DELETE FROM role_permission WHERE permission_code IN ('asset.read','asset.edit')");
    assertEquals(1, request("GET", "/api/platform/customers", null, 200).size());
    request("GET", "/api/stations/201", null, 403);
    request("GET", "/api/platform/customers/options?stationId=201", null, 403);
    db.update("DELETE FROM member_grant_station");
    request("GET", "/api/platform/customers", null, 403);
    request(
        "POST", "/api/platform/customers", "{\"name\":\"Blocked\",\"organizationId\":102}", 403);
  }

  @Test
  void readonlyAssetEditorCannotChangeHiddenAssociationButOmissionStillWorks() throws Exception {
    long id = create("Customer", 101);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":" + id), 200);
    db.update(
        "DELETE FROM role_permission WHERE permission_code IN ('customer.read','customer.manage')");
    var options = request("GET", "/api/platform/customers/options?stationId=201", null, 200);
    assertFalse(options.path("can_assign").asBoolean());
    assertEquals(0, options.path("customers").size());
    assertTrue(options.path("current_customer").isNull());
    assertTrue(options.path("current_customer_restricted").asBoolean());
    request("PUT", "/api/stations/201", stationBody(""), 200);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":null"), 403);
    assertEquals(id, request("GET", "/api/stations/201", null, 200).path("customer_id").asLong());
  }

  @Test
  void databaseRejectsInvalidProfilesAndOwnershipChanges() throws Exception {
    long id = create("Child", 102);
    request("PUT", "/api/stations/201", stationBody(",\"customerId\":" + id), 200);
    for (String sql :
        new String[] {
          "UPDATE customer SET name=' ' WHERE id=" + id,
          "UPDATE customer SET entity=' ' WHERE id=" + id,
          "UPDATE customer SET contact=' padded ' WHERE id=" + id,
          "UPDATE customer SET organization_id=NULL WHERE id=" + id,
          "UPDATE customer SET organization_id=999 WHERE id=" + id,
          "UPDATE station SET organization_id=103 WHERE id=201",
          "UPDATE station SET customer_id=" + id + " WHERE id=202"
        }) {
      var savepoint = connection.setSavepoint();
      assertThrows(
          org.springframework.dao.DataIntegrityViolationException.class, () -> db.update(sql), sql);
      connection.rollback(savepoint);
    }
    db.update("INSERT INTO organization(id,name,parent_id) VALUES(105,'Grandchild',102)");
    db.update("UPDATE station SET organization_id=105 WHERE id=201");
    var savepoint = connection.setSavepoint();
    assertThrows(
        org.springframework.dao.DataIntegrityViolationException.class,
        () -> db.update("UPDATE organization SET parent_id=103 WHERE id=105"));
    connection.rollback(savepoint);
    assertEquals(
        102L, db.queryForObject("SELECT parent_id FROM organization WHERE id=105", Long.class));
  }

  @Test
  void dormantAndExpiredGrantsCannotWidenCustomerOrganizationScope() throws Exception {
    create("Local", 101);
    db.execute(
        """
INSERT INTO customer(id,name,organization_id) VALUES(900,'Hidden',104);
INSERT INTO app_role(id,code,name,organization_id) VALUES(112,'dormant','Dormant',104);
INSERT INTO role_permission VALUES(112,'customer.read'),(112,'customer.manage');
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(122,107,112,now()-interval '1 day');
""");
    assertEquals(1, request("GET", "/api/platform/customers", null, 200).size());
    assertEquals(
        3,
        request("GET", "/api/platform/customers/create-options", null, 200)
            .path("organizations")
            .size());
    request(
        "POST", "/api/platform/customers", "{\"name\":\"Blocked\",\"organizationId\":104}", 403);
    db.update("UPDATE member_grant SET valid_until=now()-interval '1 hour' WHERE id=121");
    request("GET", "/api/platform/customers", null, 403);
    request("GET", "/api/platform/customers/create-options", null, 403);
  }

  @Test
  void profileValidationAndManageOnlyCapabilityRemainSeparateFromDirectoryRead() throws Exception {
    long id = create("Valid", 101);
    for (String body :
        new String[] {
          "{\"name\":123}",
          "{\"entity\":true}",
          "{\"contact\":[]}",
          "{\"entity\":\"" + "x".repeat(161) + "\"}",
          "{\"contact\":\"" + "x".repeat(255) + "\"}",
          "{\"name\":\"" + "x".repeat(161) + "\"}"
        }) request("PUT", "/api/platform/customers/" + id, body, 400);
    db.update("DELETE FROM role_permission WHERE permission_code='customer.read'");
    create("Manage only", 102);
    request("GET", "/api/platform/customers", null, 403);
    var options = request("GET", "/api/platform/customers/options?stationId=201", null, 200);
    assertTrue(options.path("can_assign").asBoolean());
    assertEquals(2, options.path("customers").size());
    var audit =
        json.readTree(
            db.queryForObject(
                "SELECT detail FROM audit_event WHERE action='customer.create' ORDER BY id LIMIT 1",
                String.class));
    assertEquals(id, audit.path("customerId").asLong());
    assertEquals("Valid", audit.path("after").path("name").asText());
    assertEquals(
        107L,
        db.queryForObject("SELECT actor_id FROM audit_event ORDER BY id LIMIT 1", Long.class));
  }
}
