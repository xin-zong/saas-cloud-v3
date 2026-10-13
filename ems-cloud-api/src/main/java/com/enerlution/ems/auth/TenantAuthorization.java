package com.enerlution.ems.auth;

import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Database-authoritative tenant capabilities. Never caches an allow decision in a session. */
@Component
@org.springframework.context.annotation.Primary
public class TenantAuthorization {
  protected final JdbcTemplate db;
  protected final SessionTokens sessions;

  public TenantAuthorization(JdbcTemplate db, SessionTokens sessions) {
    this.db = db;
    this.sessions = sessions;
  }

  public String client() {
    return "app".equals(sessions.client()) ? "app" : "web";
  }

  public long userId() {
    long user = sessions.userId();
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "select exists(select 1 from saas_active_user where user_id=?)",
            Boolean.class,
            user))) {
      sessions.logout();
      throw new BusinessException(401, "账号或企业已停用，请联系企业管理员");
    }
    return user;
  }

  public TenantContext context() {
    long user = userId();
    var rows =
        db.queryForList(
            "select tenant_id,kind,administrator from saas_active_user where user_id=?", user);
    if (rows.isEmpty()) throw new BusinessException(401, "Authentication required");
    var row = rows.getFirst();
    return new TenantContext(
        user,
        ((Number) row.get("tenant_id")).longValue(),
        (String) row.get("kind"),
        (Boolean) row.get("administrator"));
  }

  public boolean hasPermission(String code) {
    return Boolean.TRUE.equals(
        db.queryForObject(
            "select exists(select 1 from saas_effective_permission where user_id=? and permission_code=? and client=?)",
            Boolean.class,
            userId(),
            code,
            client()));
  }

  public void requirePermission(String code) {
    if (!hasPermission(code)) throw new BusinessException(403, "Permission denied");
  }

  public boolean hasStationPermission(long user, long station, String code) {
    return hasStationPermission(user, station, code, client());
  }

  public boolean hasStationPermission(long user, long station, String code, String client) {
    if (!Set.of("web", "app").contains(client)) return false;
    return Boolean.TRUE.equals(
        db.queryForObject(
            "select exists(select 1 from saas_effective_station_permission where user_id=? and station_id=? and permission_code=? and client=?)",
            Boolean.class,
            user,
            station,
            code,
            client));
  }

  public void requireStationPermission(long station, String code) {
    if (!hasStationPermission(userId(), station, code))
      throw new BusinessException(403, "Station permission denied");
  }

  public List<Long> stationIds(String code) {
    return db.queryForList(
        "select station_id from saas_effective_station_permission where user_id=? and permission_code=? and client=? order by station_id",
        Long.class,
        userId(),
        code,
        client());
  }

  public void requireTenantPermission(long target, String code) {
    TenantContext actor = context();
    requirePermission(code);
    if (target == actor.tenantId()) return;
    if (!actor.kind().equals("platform"))
      throw new BusinessException(403, "Tenant permission denied");
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "select exists(select 1 from tenant where id=? and kind='enterprise' and enabled)",
            Boolean.class,
            target))) throw new BusinessException(403, "Tenant permission denied");
    requirePermission("tenant.data.read");
    String mode =
        db.queryForObject("select operation_kind from permission where code=?", String.class, code);
    if ("write".equals(mode)) requirePermission("tenant.data.write");
  }

  public List<String> permissions() {
    return db.queryForList(
        "select permission_code from saas_effective_permission where user_id=? and client=? order by permission_code",
        String.class,
        userId(),
        client());
  }

  public Map<Long, Set<String>> stationPermissions() {
    Map<Long, Set<String>> result = new LinkedHashMap<>();
    for (var row :
        db.queryForList(
            "select station_id,permission_code from saas_effective_station_permission where user_id=? and client=? order by station_id,permission_code",
            userId(),
            client()))
      result
          .computeIfAbsent(((Number) row.get("station_id")).longValue(), x -> new LinkedHashSet<>())
          .add((String) row.get("permission_code"));
    return result;
  }

  public CapabilitySnapshot snapshot(String requestedClient) {
    if (!client().equals(requestedClient))
      throw new BusinessException(400, "Client differs from authenticated session");
    TenantContext actor = context();
    Set<String> codes = new LinkedHashSet<>(permissions());
    List<Map<String, Object>> rows =
        db.queryForList(
            "select id,parent_id,client,kind,name_key,route_path,permission_code from saas_enabled_menu where client=? and side in (?, 'both') order by sort_order,id",
            client(),
            actor.kind());
    Map<Long, Map<String, Object>> nodes = new LinkedHashMap<>();
    rows.forEach(row -> nodes.put(((Number) row.get("id")).longValue(), row));
    Set<Long> visible = new HashSet<>();
    for (var row : rows)
      if (codes.contains(row.get("permission_code"))) {
        Long id = ((Number) row.get("id")).longValue();
        while (id != null && visible.add(id)) {
          var current = nodes.get(id);
          id =
              current == null || current.get("parent_id") == null
                  ? null
                  : ((Number) current.get("parent_id")).longValue();
        }
      }
    return new CapabilitySnapshot(
        actor, buildMenus(rows, visible, null), codes, stationPermissions());
  }

  private List<MenuNode> buildMenus(
      List<Map<String, Object>> rows, Set<Long> visible, Long parent) {
    List<MenuNode> result = new ArrayList<>();
    for (var row : rows) {
      long id = ((Number) row.get("id")).longValue();
      Long rowParent =
          row.get("parent_id") == null ? null : ((Number) row.get("parent_id")).longValue();
      if (visible.contains(id) && Objects.equals(parent, rowParent))
        result.add(
            new MenuNode(
                id,
                (String) row.get("client"),
                (String) row.get("kind"),
                (String) row.get("name_key"),
                (String) row.get("route_path"),
                (String) row.get("permission_code"),
                buildMenus(rows, visible, id)));
    }
    return result;
  }
}
