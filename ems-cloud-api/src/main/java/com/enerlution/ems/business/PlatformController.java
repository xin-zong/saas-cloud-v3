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
    return ApiResponse.ok(
        new OrganizationWorkflows(s)
            .directory(
                permission,
                purpose == null || "organizations".equals(purpose),
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
    return ApiResponse.ok(new CustomerWorkflows(s).list());
  }

  @GetMapping("/platform/customers/create-options")
  public ApiResponse<?> customerCreateOptions() {
    s.access.requirePermission("customer.manage");
    return ApiResponse.ok(Map.of("organizations", new CustomerWorkflows(s).organizations()));
  }

  @GetMapping("/platform/customers/options")
  public ApiResponse<?> customerOptions(@RequestParam long stationId) {
    return ApiResponse.ok(new CustomerWorkflows(s).options(stationId));
  }

  @PostMapping("/platform/customers")
  @Transactional
  public ApiResponse<?> createCustomer(@RequestBody JsonNode input) {
    s.access.requirePermission("customer.manage");
    return ApiResponse.ok(new CustomerWorkflows(s).create(input));
  }

  @PutMapping("/platform/customers/{id}")
  @Transactional
  public ApiResponse<?> editCustomer(@PathVariable long id, @RequestBody JsonNode input) {
    s.access.requirePermission("customer.manage");
    return ApiResponse.ok(new CustomerWorkflows(s).edit(id, input));
  }

  public record CustomerInput(@NotBlank @Size(max = 160) String name) {}

  public ApiResponse<?> editCustomer(long id, CustomerInput input) {
    return editCustomer(id, new com.fasterxml.jackson.databind.ObjectMapper().valueToTree(input));
  }
}
