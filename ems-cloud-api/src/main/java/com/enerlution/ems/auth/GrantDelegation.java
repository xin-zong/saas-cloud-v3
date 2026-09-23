package com.enerlution.ems.auth;

import com.enerlution.ems.common.BusinessException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Bounded delegation shared by role edits and individual grant/member workflows. */
public final class GrantDelegation {
  private final JdbcTemplate db;
  private final GrantAuthorization access;

  public GrantDelegation(JdbcTemplate db, GrantAuthorization access) {
    this.db = db;
    this.access = access;
  }

  public void requireMemberScope(long user, String managementPermission) {
    var rows =
        db.queryForList(
            "SELECT management_organization_id,organization_id FROM app_user WHERE id=?", user);
    if (rows.isEmpty()) throw new BusinessException(404, "成员不存在");
    for (String key : List.of("management_organization_id", "organization_id")) {
      Object org = rows.getFirst().get(key);
      if (org == null) {
        if (key.equals("management_organization_id")) deny();
      } else access.requireOrganizationPermission(((Number) org).longValue(), managementPermission);
    }
  }

  /** Checks mutable scope even for expired, disabled, and future retained grants. */
  public void requireScope(
      long owner, long member, Collection<Long> stations, String managementPermission) {
    requireOrganizationScope(owner, member, stations, managementPermission);
    for (long station : stations) {
      if (!Boolean.TRUE.equals(
          db.queryForObject(
              """
SELECT EXISTS(SELECT 1 FROM active_member_grant g JOIN member_grant_station gs ON gs.grant_id=g.id
  WHERE g.user_id=? AND gs.station_id=?)
""",
              Boolean.class,
              access.userId(),
              station))) deny();
    }
  }

  /** Organization metadata visibility; grants no station business or mutation capability. */
  public void requireOrganizationScope(
      long owner, long member, Collection<Long> stations, String managementPermission) {
    access.requireOrganizationPermission(owner, managementPermission);
    requireMemberScope(member, managementPermission);
    for (long station : stations) {
      var rows = db.queryForList("SELECT organization_id FROM station WHERE id=?", station);
      if (rows.isEmpty() || rows.getFirst().get("organization_id") == null) deny();
      long organization = ((Number) rows.getFirst().get("organization_id")).longValue();
      access.requireOrganizationPermission(organization, managementPermission);
    }
  }

  public boolean configurable(long organization, String code) {
    var entry = PermissionCatalog.find(code);
    if (entry == null || !entry.available()) return false;
    if (entry.scope().equals("organization")) return covers(organization, null, code, null, false);
    return Boolean.TRUE.equals(
        db.queryForObject(
            """
WITH RECURSIVE branch(id) AS (SELECT id FROM organization WHERE id=?
  UNION SELECT o.id FROM organization o JOIN branch b ON o.parent_id=b.id),
source_branch(grant_id,organization_id) AS (
  SELECT g.id,r.organization_id FROM active_member_grant g JOIN app_role r ON r.id=g.role_id
  WHERE g.user_id=? AND r.organization_id IS NOT NULL
  UNION SELECT b.grant_id,o.id FROM source_branch b JOIN organization o ON o.parent_id=b.organization_id
)
SELECT EXISTS(SELECT 1 FROM active_member_grant g JOIN role_permission rp ON rp.role_id=g.role_id
  JOIN member_grant_station gs ON gs.grant_id=g.id JOIN station s ON s.id=gs.station_id
  JOIN branch b ON b.id=s.organization_id WHERE g.user_id=? AND rp.permission_code=?
    AND (?<>'customer.manage' OR EXISTS(SELECT 1 FROM source_branch source
      WHERE source.grant_id=g.id AND source.organization_id=s.organization_id)))
""",
            Boolean.class,
            organization,
            access.userId(),
            access.userId(),
            code,
            code));
  }

  /**
   * Validate only added capabilities over the target's remaining/future interval, under the lock.
   */
  public void requireDelegation(
      long owner,
      long member,
      Collection<Long> stations,
      Collection<String> codes,
      Instant validUntil,
      String managementPermission) {
    requireScope(owner, member, stations, managementPermission);
    Instant now = db.queryForObject("SELECT statement_timestamp()", Timestamp.class).toInstant();
    if (validUntil != null && !validUntil.isAfter(now)) return;
    var memberRow =
        db.queryForMap(
            "SELECT management_organization_id,organization_id FROM app_user WHERE id=?", member);
    Set<Long> managed = new HashSet<>();
    managed.add(owner);
    for (var org : memberRow.values()) if (org != null) managed.add(((Number) org).longValue());
    for (long station : stations)
      managed.add(
          db.queryForObject("SELECT organization_id FROM station WHERE id=?", Long.class, station));
    for (long org : managed) if (!covers(org, null, managementPermission, validUntil, true)) deny();
    for (String code : codes) {
      var entry = PermissionCatalog.find(code);
      if (entry == null || !entry.available())
        throw new BusinessException(400, "权限未知或暂不可用: " + code);
      if (entry.scope().equals("station")) {
        for (long station : stations) if (!covers(owner, station, code, validUntil, true)) deny();
      } else {
        for (long org : descendants(owner)) if (!covers(org, null, code, validUntil, true)) deny();
      }
    }
  }

  public List<Long> descendants(long owner) {
    return db.queryForList(
        """
        WITH RECURSIVE branch(id) AS (SELECT id FROM organization WHERE id=?
          UNION SELECT o.id FROM organization o JOIN branch b ON o.parent_id=b.id)
        SELECT id FROM branch ORDER BY id
        """,
        Long.class,
        owner);
  }

  /** Validate an added hierarchy scope against authority BEFORE the edge is changed. */
  public void requireAddedOrganizationScope(
      long organization,
      Collection<String> codes,
      Instant validUntil,
      String managementPermission) {
    access.requireOrganizationPermission(organization, managementPermission);
    Instant now = db.queryForObject("SELECT statement_timestamp()", Timestamp.class).toInstant();
    if (validUntil != null && !validUntil.isAfter(now)) return;
    if (!covers(organization, null, managementPermission, validUntil, true)) deny();
    for (String code : codes) {
      var entry = PermissionCatalog.find(code);
      if (entry != null
          && entry.available()
          && entry.scope().equals("organization")
          && !covers(organization, null, code, validUntil, true)) deny();
    }
  }

  private boolean covers(
      long organization, Long station, String code, Instant until, boolean boundExpiry) {
    return Boolean.TRUE.equals(
        db.queryForObject(
            """
WITH RECURSIVE branch(grant_id,organization_id) AS (
  SELECT g.id,r.organization_id FROM active_member_grant g JOIN app_role r ON r.id=g.role_id
  WHERE g.user_id=? AND r.organization_id IS NOT NULL
  UNION SELECT b.grant_id,o.id FROM branch b JOIN organization o ON o.parent_id=b.organization_id
) SELECT EXISTS(SELECT 1 FROM active_member_grant g JOIN role_permission rp ON rp.role_id=g.role_id
  WHERE g.user_id=? AND rp.permission_code=?
    AND (NOT ? OR g.valid_until IS NULL OR (?::timestamptz IS NOT NULL AND g.valid_until>=?::timestamptz))
    AND ((?::bigint IS NULL AND EXISTS(SELECT 1 FROM branch b WHERE b.grant_id=g.id AND b.organization_id=?))
      OR (?::bigint IS NOT NULL AND EXISTS(SELECT 1 FROM member_grant_station gs JOIN station s ON s.id=gs.station_id
        WHERE gs.grant_id=g.id AND gs.station_id=?
          AND (?<>'customer.manage' OR EXISTS(SELECT 1 FROM branch b
            WHERE b.grant_id=g.id AND b.organization_id=s.organization_id))))))
""",
            Boolean.class,
            access.userId(),
            access.userId(),
            code,
            boundExpiry,
            until == null ? null : Timestamp.from(until),
            until == null ? null : Timestamp.from(until),
            station,
            organization,
            station,
            station,
            code));
  }

  private static void deny() {
    throw new BusinessException(403, "超出可管理或可委派的组织、站点、权限或有效期范围");
  }
}
