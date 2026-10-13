package com.enerlution.ems.tenant;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class TenantSupport {
  public final JdbcTemplate db;
  public final TenantAuthorization auth;
  public final CapabilityEvents events;

  public TenantSupport(JdbcTemplate db, TenantAuthorization auth, CapabilityEvents events) {
    this.db = db;
    this.auth = auth;
    this.events = events;
  }

  public void lock() {
    db.execute("SELECT pg_advisory_xact_lock(78291002)");
  }

  public void platform(String permission) {
    if (!auth.context().kind().equals("platform"))
      throw new BusinessException(403, "Platform permission required");
    auth.requirePermission(permission);
  }

  public void audit(long tenant, String action, String detail) {
    db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?)",
        auth.userId(),
        tenant,
        action,
        detail);
  }

  public static List<Long> ids(List<Long> values, boolean required) {
    if (values == null) values = List.of();
    if (values.size() > 200
        || values.stream().anyMatch(v -> v == null || v <= 0)
        || required && values.isEmpty()) throw new BusinessException(400, "请选择有效记录");
    return List.copyOf(new LinkedHashSet<>(values));
  }

  public static String placeholders(int count) {
    return String.join(",", Collections.nCopies(count, "?"));
  }

  public void packagesExist(List<Long> ids) {
    if (ids.isEmpty()
        || !Objects.equals(
            db.queryForObject(
                "SELECT count(*) FROM permission_package WHERE enabled AND id IN ("
                    + placeholders(ids.size())
                    + ")",
                Long.class,
                ids.toArray()),
            (long) ids.size())) throw new BusinessException(400, "请选择启用的权限包");
  }

  public long ownEnterprise(String permission) {
    var actor = auth.context();
    if (!actor.kind().equals("enterprise"))
      throw new BusinessException(403, "Enterprise account required");
    auth.requireTenantPermission(actor.tenantId(), permission);
    return actor.tenantId();
  }
}
