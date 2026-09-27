package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.sql.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** Migration rehearsals only inside the explicitly empty rollback test schema. */
@EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = "ems_permission_tests")
class CustomerMigrationPostgresTest {
  Connection connection;
  JdbcTemplate db;

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
        "ems_cloud_v2_proto", db.queryForObject("SELECT current_database()", String.class));
    db.execute("SET LOCAL search_path TO ems_permission_tests");
    assertEquals(
        "ems_permission_tests", db.queryForObject("SELECT current_schema()", String.class));
    assertEquals(
        0,
        db.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE"
                + " table_schema='ems_permission_tests'",
            Integer.class));
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V1__identity_assets.sql"))
            .replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
    db.execute("INSERT INTO organization(id,name) VALUES(1,'One'),(2,'Two')");
  }

  @AfterEach
  void cleanup() throws Exception {
    if (connection != null) {
      connection.rollback();
      connection.close();
    }
  }

  void migrate() throws Exception {
    db.execute(
        Files.readString(Path.of("src/main/resources/db/migration/V10__customer_profiles.sql")));
  }

  @Test
  void emptyDatabaseMigratesWithoutInventedCustomerOrOwner() throws Exception {
    migrate();
    assertEquals(0, db.queryForObject("SELECT count(*) FROM customer", Integer.class));
    assertThrows(
        DataIntegrityViolationException.class,
        () -> db.update("INSERT INTO customer(name) VALUES('No owner')"));
  }

  @Test
  void existingSameOrganizationStationsProvideUnambiguousOwner() throws Exception {
    db.execute(
        """
INSERT INTO customer(id,name) VALUES(1,'Legacy');
INSERT INTO station(code,name,customer_id,organization_id,rated_power_kw,capacity_kwh)
 VALUES('a','A',1,2,10,20),('b','B',1,2,10,20);
""");
    migrate();
    assertEquals(
        2L, db.queryForObject("SELECT organization_id FROM customer WHERE id=1", Long.class));
    assertNull(db.queryForObject("SELECT entity FROM customer WHERE id=1", String.class));
  }

  @Test
  void unlinkedLegacyCustomerRequiresExplicitReconciliation() {
    db.execute("INSERT INTO customer(id,name) VALUES(1,'Legacy')");
    assertThrows(DataIntegrityViolationException.class, this::migrate);
  }

  @Test
  void mixedOrMissingStationOrganizationsCannotGuessCustomerOwnership() throws Exception {
    db.execute(
        """
INSERT INTO customer(id,name) VALUES(1,'Legacy');
INSERT INTO station(code,name,customer_id,organization_id,rated_power_kw,capacity_kwh)
 VALUES('a','A',1,1,10,20),('b','B',1,2,10,20);
""");
    var before = connection.setSavepoint();
    assertThrows(DataIntegrityViolationException.class, this::migrate);
    connection.rollback(before);
    db.update("UPDATE station SET organization_id=NULL WHERE code='b'");
    assertThrows(DataIntegrityViolationException.class, this::migrate);
  }

  @Test
  void whitespaceOnlyAndEdgeWhitespaceProfilesAreRejected() throws Exception {
    migrate();
    db.update("INSERT INTO customer(id,name,organization_id) VALUES(1,'Valid',1)");
    for (String assignment :
        new String[] {
          "name=chr(9)", "entity=chr(10)", "contact=chr(13)",
          "name=chr(9)||'Padded'", "entity='Padded'||chr(10)", "contact=chr(9)||'Contact'||chr(9)"
        }) {
      var savepoint = connection.setSavepoint();
      assertThrows(
          DataIntegrityViolationException.class,
          () -> db.update("UPDATE customer SET " + assignment + " WHERE id=1"),
          assignment);
      connection.rollback(savepoint);
    }
  }
}
