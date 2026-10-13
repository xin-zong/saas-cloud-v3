package com.enerlution.ems.tenant;

/**
 * Trusted SQL relation used by existing parameterized business queries. Client is never request
 * SQL.
 */
public final class TenantQueryScope {
  private TenantQueryScope() {}

  public static String stationPermissions(String client) {
    if (!java.util.Set.of("web", "app").contains(client))
      throw new IllegalArgumentException("Unknown session client");
    return "(SELECT DISTINCT user_id,station_id,permission_code FROM saas_effective_station_permission WHERE client='"
        + client
        + "')";
  }
}
