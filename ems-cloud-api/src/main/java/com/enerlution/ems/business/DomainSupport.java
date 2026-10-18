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
    atomicAudit(() -> {
    Long tenant =
        db.queryForObject("SELECT tenant_id FROM station WHERE id=?", Long.class, station);
    if (tenant == null) throw new BusinessException(404, "站点不存在");
    long event = auditTenant(action, tenant, detail);
    linkStation(event, station, false);
    });
  }

  public void auditStations(String action, List<Long> stations, Object detail) {
    atomicAudit(() -> {
    Map<Long,List<Long>> tenants = new LinkedHashMap<>();
    Set<Long> unique = new LinkedHashSet<>(stations);
    for (long station : unique) {
      Long tenant =
          db.queryForObject("SELECT tenant_id FROM station WHERE id=?", Long.class, station);
      if (tenant == null) throw new BusinessException(404, "站点不存在");
      tenants.computeIfAbsent(tenant, ignored -> new ArrayList<>()).add(station);
    }
    tenants.forEach((tenant, ids) -> {
      long event = auditTenant(action, tenant, detail);
      for (long station : ids) linkStation(event, station, unique.size()>1);
    });
    });
  }

  // Do not annotate this class: its public db/access fields are deliberately used
  // by callers, so a class-based Spring proxy would expose uninitialized fields.
  private void atomicAudit(Runnable work) {
    new org.springframework.transaction.support.TransactionTemplate(
        new org.springframework.jdbc.datasource.DataSourceTransactionManager(
            Objects.requireNonNull(db.getDataSource())))
        .executeWithoutResult(status -> work.run());
  }

  private void linkStation(long event, long station, boolean shared) {
    db.update("INSERT INTO station_audit_event(event_id,station_id,shared_detail,channel,actor_name) SELECT ?,?,?,?,display_name FROM app_user WHERE id=?",
        event, station, shared, "application", access.userId());
  }

  private long auditTenant(String action, long tenant, Object detail) {
    String text;
    try {
      text =
          detail instanceof String value
              ? value
              : new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(detail);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Cannot serialize audit event", e);
    }
    return db.queryForObject(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?) RETURNING id",
        Long.class,
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
