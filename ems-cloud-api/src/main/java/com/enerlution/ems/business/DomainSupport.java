package com.enerlution.ems.business;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DomainSupport {
  public final JdbcTemplate db;
  public final AccessControl access;

  public DomainSupport(JdbcTemplate db, AccessControl access) {
    this.db = db;
    this.access = access;
  }

  public Map<String, Object> one(String sql, Object... args) {
    var rows = db.queryForList(sql, args);
    if (rows.isEmpty()) throw new BusinessException(404, "记录不存在");
    return rows.getFirst();
  }

  public long number(Map<String, Object> row, String key) {
    return ((Number) row.get(key)).longValue();
  }

  public void audit(String action, String detail) {
    db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?)",
        access.userId(),
        access.context().tenantId(),
        action,
        detail);
  }

  public void audit(String action, Map<String, ?> detail) {
    try {
      audit(action, new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(detail));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Cannot serialize audit event", e);
    }
  }

  public void auditStation(String action, long station, Object detail) {
    Long tenant =
        db.queryForObject("SELECT tenant_id FROM station WHERE id=?", Long.class, station);
    if (tenant == null) throw new BusinessException(404, "站点不存在");
    auditTenant(action, tenant, detail);
  }

  public void auditStations(String action, List<Long> stations, Object detail) {
    Set<Long> tenants = new LinkedHashSet<>();
    for (long station : stations) {
      Long tenant =
          db.queryForObject("SELECT tenant_id FROM station WHERE id=?", Long.class, station);
      if (tenant == null) throw new BusinessException(404, "站点不存在");
      tenants.add(tenant);
    }
    for (long tenant : tenants) auditTenant(action, tenant, detail);
  }

  private void auditTenant(String action, long tenant, Object detail) {
    String text;
    try {
      text =
          detail instanceof String value
              ? value
              : new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(detail);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Cannot serialize audit event", e);
    }
    db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?)",
        access.userId(),
        tenant,
        action,
        text);
  }

  public int limit(int value) {
    if (value < 1 || value > 200) throw new BusinessException(400, "每页数量应为 1–200");
    return value;
  }

  public int offset(int value) {
    if (value < 0 || value > 100000) throw new BusinessException(400, "分页位置无效");
    return value;
  }
}
