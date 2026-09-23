package com.enerlution.ems.auth;

import com.enerlution.ems.common.BusinessException;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Call lock, snapshot, mutate, preserve in ONE transaction for every governance write. */
public final class GovernanceGuard {
  public static final long LOCK_ID = 78291001L;
  private final JdbcTemplate db;

  public GovernanceGuard(JdbcTemplate db) {
    this.db = db;
  }

  public void lock() {
    db.execute("SELECT pg_advisory_xact_lock(78291001)");
  }

  /** Latest guaranteed complete governance horizon, per organization; infinity stays infinity. */
  public Map<Long, Instant> snapshot() {
    Map<Long, Instant> result = new LinkedHashMap<>();
    db.query(
        """
WITH RECURSIVE branch(user_id,organization_id,permission_code,valid_until) AS (
  SELECT g.user_id,r.organization_id,rp.permission_code,coalesce(g.valid_until,'infinity'::timestamptz)
  FROM active_member_grant g JOIN app_role r ON r.id=g.role_id
  JOIN role_permission rp ON rp.role_id=r.id
  WHERE r.organization_id IS NOT NULL AND rp.permission_code IN ('role.manage','member.grant.manage')
  UNION SELECT b.user_id,o.id,b.permission_code,b.valid_until FROM branch b
    JOIN organization o ON o.parent_id=b.organization_id
), capability AS (
  SELECT user_id,organization_id,permission_code,max(valid_until) AS until
  FROM branch GROUP BY user_id,organization_id,permission_code
), governor AS (
  SELECT user_id,organization_id,min(until) AS until FROM capability
  GROUP BY user_id,organization_id HAVING count(*)=2
) SELECT organization_id,max(until) AS until FROM governor GROUP BY organization_id
""",
        rs -> {
          result.put(rs.getLong("organization_id"), rs.getTimestamp("until").toInstant());
        });
    return Map.copyOf(result);
  }

  public void preserve(Map<Long, Instant> before) {
    Map<Long, Instant> after = snapshot();
    for (var scope : before.entrySet()) {
      Instant remaining = after.get(scope.getKey());
      if (remaining == null || remaining.isBefore(scope.getValue()))
        throw new BusinessException(409, "不能移除或缩短管理范围内最后一个完整治理入口");
    }
  }
}
