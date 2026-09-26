package com.enerlution.ems.business;

import java.util.*;

/** Batched directory projections. Write endpoints still recheck each affected grant under lock. */
final class RoleDirectory {
  private final DomainSupport s;

  RoleDirectory(DomainSupport s) {
    this.s = s;
  }

  List<RoleController.BusinessRole> read(long org, String purpose, Set<String> configurable) {
    long actor = s.access.userId();
    boolean canAssign = s.access.organizationIds("member.grant.manage").contains(org);
    Map<Long, List<String>> codesByRole = new HashMap<>();
    for (var row :
        s.db.queryForList(
            "SELECT rp.role_id,rp.permission_code FROM role_permission rp JOIN app_role r ON"
                + " r.id=rp.role_id WHERE r.organization_id=? ORDER BY"
                + " rp.role_id,rp.permission_code",
            org))
      codesByRole
          .computeIfAbsent(s.number(row, "role_id"), unused -> new ArrayList<>())
          .add((String) row.get("permission_code"));
    var rows =
        s.db.queryForList(
            """
WITH managed AS (
  SELECT organization_id FROM effective_organization_permission WHERE user_id=? AND permission_code='role.manage'
), visible AS (
  SELECT organization_id FROM effective_organization_permission WHERE user_id=? AND permission_code=?
), actor_stations AS (
  SELECT gs.station_id FROM active_member_grant g JOIN member_grant_station gs ON gs.grant_id=g.id WHERE g.user_id=?
)
SELECT r.*,
  (SELECT count(DISTINCT u.id) FROM member_grant g JOIN app_user u ON u.id=g.user_id
   WHERE g.role_id=r.id AND u.management_organization_id IN (SELECT organization_id FROM visible)
   AND (u.organization_id IS NULL OR u.organization_id IN (SELECT organization_id FROM visible))) AS member_count,
  NOT EXISTS(SELECT 1 FROM member_grant g WHERE g.role_id=r.id) AS unused,
  (r.organization_id IN (SELECT organization_id FROM managed) AND NOT EXISTS(
    SELECT 1 FROM member_grant g JOIN app_user u ON u.id=g.user_id WHERE g.role_id=r.id AND (
      u.management_organization_id IS NULL
      OR u.management_organization_id NOT IN (SELECT organization_id FROM managed)
      OR (u.organization_id IS NOT NULL AND u.organization_id NOT IN (SELECT organization_id FROM managed))
      OR EXISTS(SELECT 1 FROM member_grant_station gs JOIN station station ON station.id=gs.station_id
        WHERE gs.grant_id=g.id AND (station.organization_id IS NULL
          OR station.organization_id NOT IN (SELECT organization_id FROM managed)
          OR gs.station_id NOT IN (SELECT station_id FROM actor_stations)))
    ))) AS can_edit
FROM app_role r WHERE r.organization_id=? ORDER BY r.id
""",
            actor,
            actor,
            purpose.equals("assign") ? "member.grant.manage" : "role.manage",
            actor,
            org);
    return rows.stream()
        .map(
            row -> {
              long id = s.number(row, "id");
              var codes = codesByRole.getOrDefault(id, List.of());
              boolean editable = Boolean.TRUE.equals(row.get("can_edit"));
              boolean assignable = canAssign && configurable.containsAll(codes);
              return new RoleController.BusinessRole(
                  id,
                  (String) row.get("code"),
                  (String) row.get("name"),
                  (String) row.get("description"),
                  org,
                  codes,
                  s.number(row, "member_count"),
                  editable,
                  editable && Boolean.TRUE.equals(row.get("unused")),
                  assignable,
                  assignable ? null : "超出可分配的角色权限范围；具体成员、站点和有效期需在授权保存时校验");
            })
        .toList();
  }
}
