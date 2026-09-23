package com.enerlution.ems.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.util.HashSet;
import java.util.Set;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.stereotype.Component;

@Component
public class DatabaseGuard implements BeanPostProcessor {
  private static final String DATABASE = "ems_cloud_v2_proto";
  // Routing, startup options, service files, credentials and socket factories are deliberately
  // absent.
  private static final Set<String> SAFE_OPTIONS =
      Set.of(
          "sslmode",
          "ssl",
          "sslrootcert",
          "sslcert",
          "sslkey",
          "connectTimeout",
          "socketTimeout",
          "tcpKeepAlive",
          "ApplicationName");

  @Override
  public Object postProcessAfterInitialization(Object bean, String name) {
    if (!(bean instanceof DataSource)) return bean;
    if (!(bean instanceof HikariDataSource source)) throw invalid();
    validateUrl(source.getJdbcUrl());
    if (!"public".equals(source.getSchema())
        || source.getConnectionInitSql() != null
        || source.getDataSource() != null
        || source.getDataSourceClassName() != null
        || source.getDataSourceJNDI() != null
        || (source.getCatalog() != null && !DATABASE.equals(source.getCatalog()))
        || (source.getDriverClassName() != null
            && !"org.postgresql.Driver".equals(source.getDriverClassName()))) throw invalid();
    for (Object key : source.getDataSourceProperties().keySet()) {
      if (!(key instanceof String) || !SAFE_OPTIONS.contains(key)) throw invalid();
    }
    return bean;
  }

  private static void validateUrl(String url) {
    try {
      if (url == null || !url.startsWith("jdbc:postgresql://")) throw invalid();
      URI uri = URI.create(url.substring("jdbc:".length()));
      if (!"postgresql".equals(uri.getScheme())
          || uri.getHost() == null
          || uri.getUserInfo() != null
          || uri.getPort() < 1
          || uri.getPort() > 65535
          || uri.getFragment() != null
          || !("/" + DATABASE).equals(uri.getRawPath())) throw invalid();
      if (uri.getRawQuery() != null) {
        Set<String> seen = new HashSet<>();
        for (String option : uri.getRawQuery().split("&", -1)) {
          int equals = option.indexOf('=');
          if (equals < 1) throw invalid();
          String key = option.substring(0, equals);
          if (!SAFE_OPTIONS.contains(key) || !seen.add(key)) throw invalid();
        }
      }
    } catch (IllegalArgumentException ex) {
      throw invalid();
    }
  }

  private static IllegalStateException invalid() {
    // Do not echo a URL: it might contain credentials or unexpected sensitive parameters.
    return new IllegalStateException(
        "Datasource must target ems_cloud_v2_proto on PostgreSQL with schema public and no routing"
            + " overrides");
  }
}
