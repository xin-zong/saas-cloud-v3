package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.business.*;
import java.sql.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** Explicitly enabled, read-only diagnostic against the development database. */
@EnabledIfEnvironmentVariable(named = "EMS_ROLE_DIAGNOSTIC_USER", matches = "[0-9]+")
class RoleDirectoryReadOnlyPostgresTest {
  @Test
  void directoryUsesBoundedDatabaseRoundTrips() throws Exception {
    try (var connection =
        DriverManager.getConnection(
            System.getenv("EMS_TEST_DB_URL"),
            System.getenv("EMS_TEST_DB_USER"),
            System.getenv("EMS_TEST_DB_PASSWORD"))) {
      connection.setReadOnly(true);
      connection.setAutoCommit(false);
      var db = spy(new JdbcTemplate(new SingleConnectionDataSource(connection, true)));
      assertEquals("on", db.queryForObject("SHOW transaction_read_only", String.class));
      assertEquals(
          "ems_cloud_v2_proto", db.queryForObject("select current_database()", String.class));
      var tokens = mock(SessionTokens.class);
      when(tokens.userId()).thenReturn(Long.parseLong(System.getenv("EMS_ROLE_DIAGNOSTIC_USER")));
      var access = new AccessControl(db, tokens);
      var controller = new RoleController(new DomainSupport(db, access));
      long org = access.organizationIds("role.manage").stream().sorted().findFirst().orElseThrow();
      clearInvocations(db);
      var roundTrips = new AtomicInteger();
      doAnswer(
              invocation -> {
                assertTrue(
                    roundTrips.incrementAndGet() <= 20,
                    "Role directory exceeded 20 SQL round trips");
                return invocation.callRealMethod();
              })
          .when(db)
          .query(
              any(PreparedStatementCreator.class),
              nullable(PreparedStatementSetter.class),
              any(ResultSetExtractor.class));
      long start = System.nanoTime();
      var roles = controller.roles("manage", org).data();
      long queries = roundTrips.get();
      System.out.printf(
          "Role directory: roles=%d, roundTrips=%d, seconds=%.2f%n",
          roles.size(), queries, (System.nanoTime() - start) / 1e9);
      assertFalse(roles.isEmpty());
      assertTrue(queries <= 20, "Role directory must use <=20 SQL round trips, was " + queries);
      roundTrips.set(0);
      start = System.nanoTime();
      var catalog = controller.permissions(org).data();
      assertEquals(PermissionCatalog.entries().size(), catalog.size());
      System.out.printf(
          "Permission catalog: roundTrips=%d, seconds=%.2f%n",
          roundTrips.get(), (System.nanoTime() - start) / 1e9);
    }
  }
}
