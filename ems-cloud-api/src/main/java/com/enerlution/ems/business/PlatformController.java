package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class PlatformController {
  private final DomainSupport s;

  public PlatformController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/platform/organizations")
  public ApiResponse<?> organizations() {
    s.access.requirePermission("organization.member.read");
    return ApiResponse.ok(
        s.db.queryForList(
            """
            SELECT o.id,o.name,o.parent_id FROM organization o
            JOIN effective_organization_permission p ON p.organization_id=o.id
            WHERE p.user_id=? AND p.permission_code='organization.member.read' ORDER BY o.id
            """,
            s.access.userId()));
  }

  public record OrganizationInput(@NotBlank @Size(max = 120) String name, Long parentId) {}

  private long defaultOrganization() {
    var ids = s.access.organizationIds("organization.manage");
    if (ids.isEmpty()) throw new BusinessException(403, "当前账号未分配管理组织");
    return ids.getFirst();
  }

  @PostMapping("/platform/organizations")
  @Transactional
  public ApiResponse<?> createOrganization(@Valid @RequestBody OrganizationInput input) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    long parent = input.parentId() == null ? defaultOrganization() : input.parentId();
    s.access.requireOrganizationPermission(parent, "organization.manage");
    Long id =
        s.db.queryForObject(
            "INSERT INTO organization(name,parent_id) VALUES(?,?) RETURNING id",
            Long.class,
            input.name().trim(),
            parent);
    s.audit("organization.create", "organization=" + id);
    return ApiResponse.ok(Map.of("id", id));
  }

  @PutMapping("/platform/organizations/{id}")
  @Transactional
  public ApiResponse<?> editOrganization(
      @PathVariable long id, @Valid @RequestBody OrganizationInput input) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    s.access.requireOrganizationPermission(id, "organization.manage");
    var existing = s.one("SELECT parent_id FROM organization WHERE id=? FOR UPDATE", id);
    Long parent = input.parentId() == null ? (Long) existing.get("parent_id") : input.parentId();
    if (parent != null && !Objects.equals(parent, existing.get("parent_id")))
      s.access.requireOrganizationPermission(parent, "organization.manage");
    s.db.update(
        "UPDATE organization SET name=?,parent_id=? WHERE id=?", input.name().trim(), parent, id);
    s.audit("organization.edit", "organization=" + id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/platform/member-grants")
  public ApiResponse<?> memberGrants() {
    s.access.requirePermission("organization.member.read");
    var result = new ArrayList<Map<String, Object>>();
    for (var row :
        s.db.queryForList(
            """
SELECT u.id FROM app_user u JOIN effective_organization_permission p
  ON p.organization_id=u.management_organization_id
WHERE p.user_id=? AND p.permission_code='organization.member.read'
  AND (u.organization_id IS NULL OR EXISTS(SELECT 1 FROM effective_organization_permission m
    WHERE m.user_id=p.user_id AND m.organization_id=u.organization_id
      AND m.permission_code='organization.member.read')) ORDER BY u.id
""",
            s.access.userId())) {
      long id = s.number(row, "id");
      result.add(
          Map.of(
              "member_id",
              id,
              "role_ids",
              s.db.queryForList(
                  "SELECT DISTINCT role_id FROM active_member_grant WHERE user_id=? ORDER BY"
                      + " role_id",
                  Long.class,
                  id),
              "station_count",
              s.db.queryForObject(
                  "SELECT count(DISTINCT gs.station_id) FROM active_member_grant g JOIN"
                      + " member_grant_station gs ON gs.grant_id=g.id WHERE g.user_id=?",
                  Long.class,
                  id),
              "station_ids",
              s.db.queryForList(
                  """
SELECT DISTINCT target.station_id FROM effective_station_permission target
JOIN effective_station_permission mine ON mine.station_id=target.station_id AND mine.user_id=?
WHERE target.user_id=? ORDER BY target.station_id
""",
                  Long.class,
                  s.access.userId(),
                  id)));
    }
    return ApiResponse.ok(result);
  }

  @GetMapping("/platform/role-permissions")
  public ApiResponse<?> rolePermissions() {
    s.access.requirePermission("organization.member.read");
    return ApiResponse.ok(
        s.db.queryForList(
            """
SELECT r.id AS role_id,p.code,p.name FROM app_role r JOIN effective_organization_permission scope
  ON scope.organization_id=r.organization_id AND scope.user_id=?
  AND scope.permission_code='organization.member.read'
JOIN role_permission rp ON rp.role_id=r.id JOIN permission p ON p.code=rp.permission_code
ORDER BY r.id,p.code
""",
            s.access.userId()));
  }

  @GetMapping("/platform/customers")
  public ApiResponse<?> customers() {
    s.access.requirePermission("customer.read");
    var customers =
        s.db.queryForList(
            """
SELECT c.id,c.name,count(st.id) AS station_count FROM customer c JOIN station st ON st.customer_id=c.id
JOIN effective_station_permission p ON p.station_id=st.id
WHERE p.user_id=? AND p.permission_code='customer.read' GROUP BY c.id,c.name ORDER BY c.name
""",
            s.access.userId());
    for (var customer : customers) {
      long id = s.number(customer, "id");
      customer.put("can_edit", canManageCustomer(id));
      customer.put(
          "stations",
          s.db.queryForList(
              """
SELECT st.id,st.name,st.code FROM station st JOIN effective_station_permission p ON p.station_id=st.id
WHERE st.customer_id=? AND p.user_id=? AND p.permission_code='customer.read' ORDER BY st.id
""",
              id,
              s.access.userId()));
    }
    return ApiResponse.ok(customers);
  }

  public record CustomerInput(@NotBlank @Size(max = 160) String name) {}

  @PutMapping("/platform/customers/{id}")
  @Transactional
  public ApiResponse<?> editCustomer(
      @PathVariable long id, @Valid @RequestBody CustomerInput input) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    s.access.requirePermission("customer.manage");
    if (!canManageCustomer(id)) throw new BusinessException(403, "客户不属于当前站点和管理组织范围");
    s.db.update("UPDATE customer SET name=? WHERE id=?", input.name().trim(), id);
    s.audit("customer.edit", "customer=" + id);
    return ApiResponse.ok(null);
  }

  private boolean canManageCustomer(long id) {
    return Boolean.TRUE.equals(
        s.db.queryForObject(
            """
WITH RECURSIVE grant_branch(grant_id,organization_id) AS (
  SELECT g.id,r.organization_id FROM active_member_grant g JOIN app_role r ON r.id=g.role_id
  JOIN role_permission rp ON rp.role_id=r.id
  WHERE g.user_id=? AND rp.permission_code='customer.manage' AND r.organization_id IS NOT NULL
  UNION SELECT b.grant_id,o.id FROM grant_branch b JOIN organization o ON o.parent_id=b.organization_id
) SELECT EXISTS(SELECT 1 FROM station WHERE customer_id=?) AND NOT EXISTS(
  SELECT 1 FROM station st WHERE st.customer_id=? AND NOT EXISTS(
    SELECT 1 FROM grant_branch b JOIN member_grant_station gs ON gs.grant_id=b.grant_id
    WHERE gs.station_id=st.id AND b.organization_id=st.organization_id))
""",
            Boolean.class,
            s.access.userId(),
            id,
            id));
  }
}
