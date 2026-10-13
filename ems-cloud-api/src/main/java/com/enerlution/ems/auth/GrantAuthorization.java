package com.enerlution.ems.auth;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Retained injection boundary; the only allow decisions come from tenant capabilities. */
public class GrantAuthorization extends TenantAuthorization {
  public GrantAuthorization(JdbcTemplate db, SessionTokens sessions) {
    super(db, sessions);
  }

  public String stationPermissionTable() {
    return com.enerlution.ems.tenant.TenantQueryScope.stationPermissions(client());
  }

  public Map<String, List<String>> stationCapabilityMap() {
    Map<String, List<String>> result = new LinkedHashMap<>();
    stationPermissions().forEach((id, codes) -> result.put(id.toString(), List.copyOf(codes)));
    return result;
  }
}
