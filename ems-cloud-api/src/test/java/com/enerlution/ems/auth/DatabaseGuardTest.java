package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;

import com.enerlution.ems.config.DatabaseGuard;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class DatabaseGuardTest {
  @Test
  void branchDefaultsRejectProductionDatabase() {
    var guard = new DatabaseGuard();
    assertDoesNotThrow(
        () ->
            guard.postProcessAfterInitialization(
                source("jdbc:postgresql://localhost:15435/ems_cloud_saas_toyingzhen"),
                "dataSource"));
    assertThrows(
        IllegalStateException.class,
        () ->
            guard.postProcessAfterInitialization(
                source("jdbc:postgresql://localhost:15435/ems_cloud_saas_v3"), "dataSource"));
    assertThrows(
        IllegalStateException.class,
        () ->
            guard.postProcessAfterInitialization(
                source("jdbc:postgresql://localhost:15435/ems_cloud_v2_proto"), "dataSource"));
  }

  @Test
  void toyingzhenDatabaseRequiresMatchingUrlAndRejectsProductionUrl() {
    var guard = new DatabaseGuard("ems_cloud_saas_toyingzhen");
    assertDoesNotThrow(
        () ->
            guard.postProcessAfterInitialization(
                source("jdbc:postgresql://localhost:15434/ems_cloud_saas_toyingzhen"),
                "dataSource"));
    assertThrows(
        IllegalStateException.class,
        () ->
            guard.postProcessAfterInitialization(
                source("jdbc:postgresql://localhost:15434/ems_cloud_saas_v3"), "dataSource"));
  }

  @Test
  void cleanAcceptanceDatabaseRequiresExplicitMatchingConfiguration() {
    var clean = source("jdbc:postgresql://localhost:15434/ems_cloud_saas_final_test");
    assertDoesNotThrow(
        () ->
            new DatabaseGuard("ems_cloud_saas_final_test")
                .postProcessAfterInitialization(clean, "dataSource"));
    assertThrows(
        IllegalStateException.class,
        () ->
            new DatabaseGuard("ems_cloud_saas_refactor_test")
                .postProcessAfterInitialization(clean, "dataSource"));
  }

  @Test
  void isolatedSaasDatabaseRequiresExplicitMatchingConfiguration() {
    var test = source("jdbc:postgresql://localhost:15434/ems_cloud_saas_refactor_test");
    assertThrows(IllegalStateException.class, () -> check(test));
    assertDoesNotThrow(
        () ->
            new DatabaseGuard("ems_cloud_saas_refactor_test")
                .postProcessAfterInitialization(test, "dataSource"));
    assertThrows(IllegalStateException.class, () -> new DatabaseGuard("chuneng_cloud_v2_test"));
    assertThrows(
        IllegalStateException.class,
        () ->
            new DatabaseGuard("ems_cloud_saas_refactor_test")
                .postProcessAfterInitialization(
                    source("jdbc:postgresql://localhost:15434/ems_cloud_v2_proto"), "dataSource"));
  }

  private HikariDataSource source(String url) {
    HikariDataSource source = new HikariDataSource();
    source.setJdbcUrl(url);
    source.setSchema("public");
    source.setUsername("ems_toyingzhen_owner");
    return source;
  }

  private void check(HikariDataSource source) {
    new DatabaseGuard("ems_cloud_v2_proto").postProcessAfterInitialization(source, "dataSource");
  }

  @Test
  void acceptsLocalAndTunnelUrlsWithSafeQueryOptions() {
    assertDoesNotThrow(() -> check(source("jdbc:postgresql://127.0.0.1:15432/ems_cloud_v2_proto")));
    assertDoesNotThrow(
        () ->
            check(
                source(
                    "jdbc:postgresql://db.internal:5432/ems_cloud_v2_proto?sslmode=require&connectTimeout=10")));
  }

  @Test
  void rejectsOldDatabaseAndEncodedDatabaseTricks() {
    for (String url :
        new String[] {
          "jdbc:postgresql://127.0.0.1:5432/ems_cloud",
          "jdbc:postgresql://127.0.0.1:5432/ems_cloud_v2_proto/old",
          "jdbc:postgresql://127.0.0.1:5432/%65ms_cloud_v2_proto",
          "jdbc:postgresql:ems_cloud_v2_proto"
        }) assertThrows(IllegalStateException.class, () -> check(source(url)), url);
  }

  @Test
  void rejectsSchemaAndDatabaseRoutingQueryOverrides() {
    for (String query :
        new String[] {
          "currentSchema=legacy",
          "currentSchema=public",
          "options=-csearch_path%3Dlegacy",
          "PGDBNAME=legacy",
          "databaseName=legacy",
          "%63urrentSchema=legacy",
          "service=old"
        })
      assertThrows(
          IllegalStateException.class,
          () -> check(source("jdbc:postgresql://localhost:5432/ems_cloud_v2_proto?" + query)),
          query);
  }

  @Test
  void validatesEffectiveHikariUrlEvenWhenItOverridesSpringDatasourceUrl() {
    HikariDataSource source = source("jdbc:postgresql://localhost:5432/ems_cloud_v2_proto");
    source.setJdbcUrl("jdbc:postgresql://localhost:5432/old_database");
    assertThrows(IllegalStateException.class, () -> check(source));
  }

  @Test
  void rejectsHikariSchemaPropertiesAndInitSqlOverrides() {
    HikariDataSource schema = source("jdbc:postgresql://localhost:5432/ems_cloud_v2_proto");
    schema.setSchema("legacy");
    assertThrows(IllegalStateException.class, () -> check(schema));
    HikariDataSource properties = source("jdbc:postgresql://localhost:5432/ems_cloud_v2_proto");
    properties.addDataSourceProperty("currentSchema", "legacy");
    assertThrows(IllegalStateException.class, () -> check(properties));
    HikariDataSource init = source("jdbc:postgresql://localhost:5432/ems_cloud_v2_proto");
    init.setConnectionInitSql("set search_path=legacy");
    assertThrows(IllegalStateException.class, () -> check(init));
  }

  @Test
  void springPropertyOverridesCannotBypassStartupValidation() {
    ApplicationContextRunner runner =
        new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class))
            .withUserConfiguration(DatabaseGuard.class)
            .withPropertyValues(
                "spring.datasource.url=jdbc:postgresql://127.0.0.1:15435/ems_cloud_saas_toyingzhen",
                "spring.datasource.username=ems_toyingzhen_owner",
                "spring.datasource.password=unused",
                "spring.datasource.hikari.schema=public");
    runner = runner.withPropertyValues("ems.database-name=ems_cloud_saas_toyingzhen");
    runner.run(context -> assertNull(context.getStartupFailure()));
    runner
        .withPropertyValues(
            "spring.datasource.hikari.jdbc-url=jdbc:postgresql://127.0.0.1:15432/old_database")
        .run(context -> assertNotNull(context.getStartupFailure()));
    runner
        .withPropertyValues("spring.datasource.hikari.data-source-properties.currentSchema=legacy")
        .run(context -> assertNotNull(context.getStartupFailure()));
  }

  @Test
  void runtimeDatabasePropertyCannotOptBranchBackIntoOriginalDatabases() {
    for (String name : new String[]{"ems_cloud_saas_v3", "ems_cloud_v2_proto", "ems_cloud_saas_final_test"}) {
      var environment = new org.springframework.mock.env.MockEnvironment().withProperty("ems.database-name", name);
      assertThrows(IllegalStateException.class, () -> new DatabaseGuard(environment));
    }
  }

  @Test
  void isolatedDatabaseRejectsAnyOtherEffectiveDatasourceRole() {
    var dataSource = source("jdbc:postgresql://127.0.0.1:15435/ems_cloud_saas_toyingzhen");
    dataSource.setUsername("legacy_runtime");
    assertThrows(IllegalStateException.class, () -> new DatabaseGuard().postProcessAfterInitialization(dataSource, "dataSource"));
  }
}
