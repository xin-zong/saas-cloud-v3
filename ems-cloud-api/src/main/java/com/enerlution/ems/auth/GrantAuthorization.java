package com.enerlution.ems.auth;

import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Current database state is read on every call; sessions retain identity only. */
public class GrantAuthorization {
  protected final JdbcTemplate jdbc;
  private final SessionTokens sessions;

  public GrantAuthorization(JdbcTemplate jdbc, SessionTokens sessions) {
    this.jdbc = jdbc;
    this.sessions = sessions;
  }

  public long userId() {
    long id = sessions.userId();
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from app_user where id=? and enabled)", Boolean.class, id))) {
      sessions.logout();
      throw new BusinessException(401, "Authentication required");
    }
    return id;
  }

  /** Union is for menu/entry visibility; resource handlers must use a scoped check. */
  public boolean hasPermission(String permission) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from effective_permission where user_id=? and"
                + " permission_code=?)",
            Boolean.class,
            userId(),
            permission));
  }

  public void requirePermission(String permission) {
    if (!hasPermission(permission)) throw new BusinessException(403, "Permission denied");
  }

  public void requireStationPermission(long stationId, String permission) {
    if (!hasStationPermission(userId(), stationId, permission))
      throw new BusinessException(403, "Station permission denied");
  }

  /** Validates another account's capability when selecting an assignee. */
  public boolean hasStationPermission(long userId, long stationId, String permission) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from effective_station_permission where user_id=? and"
                + " station_id=? and permission_code=?)",
            Boolean.class,
            userId,
            stationId,
            permission));
  }

  public List<Long> stationIds(String permission) {
    return jdbc.queryForList(
        "select station_id from effective_station_permission where user_id=? and permission_code=?"
            + " order by station_id",
        Long.class,
        userId(),
        permission);
  }

  public void requireOrganizationPermission(long organizationId, String permission) {
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from effective_organization_permission where user_id=? and"
                + " organization_id=? and permission_code=?)",
            Boolean.class,
            userId(),
            organizationId,
            permission))) throw new BusinessException(403, "Organization permission denied");
  }

  public List<Long> organizationIds(String permission) {
    return jdbc.queryForList(
        "select organization_id from effective_organization_permission where user_id=? and"
            + " permission_code=? order by organization_id",
        Long.class,
        userId(),
        permission);
  }

  public List<String> permissions() {
    return permissions(userId());
  }

  List<String> permissions(long user) {
    return jdbc
        .queryForList(
            "select permission_code from effective_permission where user_id=? order by"
                + " permission_code",
            String.class,
            user)
        .stream()
        .filter(PermissionCatalog::available)
        .toList();
  }

  public Map<String, List<String>> stationPermissions() {
    return capabilities(userId(), false);
  }

  public Map<String, List<String>> organizationPermissions() {
    return capabilities(userId(), true);
  }

  Map<String, List<String>> capabilities(long user, boolean organization) {
    String column = organization ? "organization_id" : "station_id";
    String view =
        organization ? "effective_organization_permission" : "effective_station_permission";
    Map<String, List<String>> result = new LinkedHashMap<>();
    for (var row :
        jdbc.queryForList(
            "select "
                + column
                + ",permission_code from "
                + view
                + " where user_id=? order by "
                + column
                + ",permission_code",
            user)) {
      String code = (String) row.get("permission_code");
      if (PermissionCatalog.available(code))
        result.computeIfAbsent(row.get(column).toString(), unused -> new ArrayList<>()).add(code);
    }
    return result;
  }
}
