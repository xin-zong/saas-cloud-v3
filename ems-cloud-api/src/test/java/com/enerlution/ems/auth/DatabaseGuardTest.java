package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;

import com.enerlution.ems.config.DatabaseGuard;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class DatabaseGuardTest {
  private HikariDataSource source(String url) {
    HikariDataSource source = new HikariDataSource();
    source.setJdbcUrl(url);
    source.setSchema("public");
    return source;
  }

  private void check(HikariDataSource source) {
    new DatabaseGuard().postProcessAfterInitialization(source, "dataSource");
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
                "spring.datasource.url=jdbc:postgresql://127.0.0.1:15432/ems_cloud_v2_proto",
                "spring.datasource.username=unused",
                "spring.datasource.password=unused",
                "spring.datasource.hikari.schema=public");
    runner.run(context -> assertNull(context.getStartupFailure()));
    runner
        .withPropertyValues(
            "spring.datasource.hikari.jdbc-url=jdbc:postgresql://127.0.0.1:15432/old_database")
        .run(context -> assertNotNull(context.getStartupFailure()));
    runner
        .withPropertyValues("spring.datasource.hikari.data-source-properties.currentSchema=legacy")
        .run(context -> assertNotNull(context.getStartupFailure()));
  }
}
