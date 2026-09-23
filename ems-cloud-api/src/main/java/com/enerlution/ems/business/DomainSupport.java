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
        "INSERT INTO audit_event(actor_id,action,detail) VALUES(?,?,?)",
        access.userId(),
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

  public int limit(int value) {
    if (value < 1 || value > 200) throw new BusinessException(400, "每页数量应为 1–200");
    return value;
  }

  public int offset(int value) {
    if (value < 0 || value > 100000) throw new BusinessException(400, "分页位置无效");
    return value;
  }
}
