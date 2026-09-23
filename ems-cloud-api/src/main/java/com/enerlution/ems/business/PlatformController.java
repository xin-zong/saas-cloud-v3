package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.JsonNode;
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
  public ApiResponse<?> organizations(@RequestParam(required = false) String purpose) {
    String permission;
    if (purpose == null) {
      s.access.requirePermission("organization.member.read");
      permission = "organization.member.read";
    } else if (purpose.equals("roles")) {
      permission = "role.manage";
      s.access.requirePermission(permission);
    } else if (purpose.equals("grants")) {
      permission = "member.grant.manage";
      s.access.requirePermission(permission);
    } else if (purpose.equals("profiles")) {
      permission = "member.manage.profile";
      s.access.requirePermission(permission);
    } else if (purpose.equals("organizations")) {
      permission = "organization.manage";
      s.access.requirePermission(permission);
    } else throw new BusinessException(400, "无效的组织目录用途");
    return ApiResponse.ok(new OrganizationWorkflows(s).directory(
        permission, purpose == null || "organizations".equals(purpose),
        "organizations".equals(purpose)));
  }

  public ApiResponse<?> organizations() {
    return organizations(null);
  }

  public record OrganizationInput(
      @NotBlank @Size(max = 120) String name, Long parentId, JsonNode leadUserId) {}

  @PostMapping("/platform/organizations")
  @Transactional
  public ApiResponse<?> createOrganization(@Valid @RequestBody OrganizationInput input) {
    return ApiResponse.ok(
        Map.of(
            "id",
            new OrganizationWorkflows(s)
                .create(input.name(), input.parentId(), leadValue(input.leadUserId()))));
  }

  @PutMapping("/platform/organizations/{id}")
  @Transactional
  public ApiResponse<?> editOrganization(
      @PathVariable long id, @Valid @RequestBody OrganizationInput input) {
    s.access.requirePermission("organization.manage");
    new OrganizationWorkflows(s)
        .edit(
            id,
            input.name(),
            input.parentId(),
            leadValue(input.leadUserId()),
            input.leadUserId() != null);
    return ApiResponse.ok(null);
  }

  private Long leadValue(JsonNode value) {
    if (value == null || value.isNull()) return null;
    if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() <= 0)
      throw new BusinessException(400, "负责人编号无效");
    return value.longValue();
  }

  @GetMapping("/platform/member-grants")
  public ApiResponse<?> memberGrants() {
    s.access.userId();
    throw new BusinessException(410, "聚合授权读取已停用，请使用逐条成员授权接口");
  }

  @GetMapping("/platform/role-permissions")
  public ApiResponse<?> rolePermissions() {
    s.access.userId();
    throw new BusinessException(410, "聚合角色权限读取已停用，请使用组织角色接口");
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
