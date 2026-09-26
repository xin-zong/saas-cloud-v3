package com.enerlution.ems.business;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class RoleController {
  private final DomainSupport s;
  private final GovernanceGuard governance;
  private final GrantDelegation delegation;

  public RoleController(DomainSupport s) {
    this.s = s;
    governance = new GovernanceGuard(s.db);
    delegation = new GrantDelegation(s.db, s.access);
  }

  public record PermissionItem(
      String code,
      String name,
      String module,
      String scope,
      boolean available,
      String origin,
      boolean configurable,
      String reason) {}

  public record BusinessRole(
      long id,
      String code,
      String name,
      String description,
      long organizationId,
      List<String> permissionCodes,
      long memberCount,
      boolean canEdit,
      boolean canDelete,
      boolean canAssign,
      String reason) {}

  public record Create(
      @NotBlank @Size(max = 120) String name,
      @Size(max = 2000) String description,
      Long organizationId,
      JsonNode permissionCodes) {}

  public record Edit(
      @NotBlank @Size(max = 120) String name, @Size(max = 2000) String description) {}

  public record Permissions(@NotNull @Size(max = 100) List<@NotBlank String> permissionCodes) {}

  @GetMapping("/platform/permissions")
  public ApiResponse<List<PermissionItem>> permissions(
      @RequestParam(required = false) Long organizationId) {
    long org = selectedOrganization(organizationId, "catalog");
    boolean canManage = s.access.organizationIds("role.manage").contains(org);
    Set<String> configurableCodes = canManage ? delegation.configurableCodes(org) : Set.of();
    List<PermissionItem> result = new ArrayList<>();
    for (var entry : PermissionCatalog.entries()) {
      boolean configurable = configurableCodes.contains(entry.code());
      String reason = !entry.available() ? entry.reason() : configurable ? null : "超出当前组织的可配置权限范围";
      result.add(
          new PermissionItem(
              entry.code(),
              entry.name(),
              entry.module(),
              entry.scope(),
              entry.available(),
              entry.origin(),
              configurable,
              reason));
    }
    return ApiResponse.ok(result);
  }

  @GetMapping("/platform/roles")
  public ApiResponse<List<BusinessRole>> roles(
      @RequestParam(defaultValue = "manage") String purpose,
      @RequestParam(required = false) Long organizationId) {
    if (!Set.of("manage", "assign").contains(purpose))
      throw new BusinessException(400, "无效的角色目录用途");
    long org = selectedOrganization(organizationId, purpose);
    return ApiResponse.ok(
        new RoleDirectory(s).read(org, purpose, delegation.configurableCodes(org)));
  }

  @PostMapping("/platform/roles")
  @Transactional
  public ApiResponse<BusinessRole> create(@Valid @RequestBody Create input) {
    governance.lock();
    long org = selectedOrganization(input.organizationId(), "manage");
    if (input.permissionCodes() != null) throw new BusinessException(400, "新角色初始权限必须为空，请使用权限保存接口");
    String name = validName(input.name());
    uniqueName(org, name, null);
    Long id =
        s.db.queryForObject(
            "INSERT INTO app_role(code,name,description,organization_id) VALUES(?,?,?,?) RETURNING"
                + " id",
            Long.class,
            "role_" + UUID.randomUUID(),
            name,
            input.description(),
            org);
    audit("role.create", Map.of("id", id, "name", name, "organizationId", org));
    return ApiResponse.ok(dto(role(id), "manage"));
  }

  @PutMapping("/platform/roles/{id}")
  @Transactional
  public ApiResponse<BusinessRole> edit(@PathVariable long id, @Valid @RequestBody Edit input) {
    governance.lock();
    var row = managedRole(id);
    validateAffected(row, List.of());
    String name = validName(input.name());
    uniqueName(s.number(row, "organization_id"), name, id);
    s.db.update(
        "UPDATE app_role SET name=?,description=? WHERE id=?", name, input.description(), id);
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("id", id);
    detail.put("oldName", row.get("name"));
    detail.put("name", name);
    detail.put("oldDescription", row.get("description"));
    detail.put("description", input.description());
    audit("role.edit", detail);
    return ApiResponse.ok(dto(role(id), "manage"));
  }

  @DeleteMapping("/platform/roles/{id}")
  @Transactional
  public ApiResponse<Void> delete(@PathVariable long id) {
    governance.lock();
    var row = managedRole(id);
    if (referenceCount(id) > 0)
      throw new BusinessException(
          409, "角色仍被授权引用（含已到期授权），当前可见使用成员数：" + visibleMembers(id, "manage"));
    var before = governance.snapshot();
    s.db.update("DELETE FROM app_role WHERE id=?", id);
    governance.preserve(before);
    audit("role.delete", Map.of("id", id, "name", row.get("name")));
    return ApiResponse.ok(null);
  }

  @PutMapping("/platform/roles/{id}/permissions")
  @Transactional
  public ApiResponse<BusinessRole> replacePermissions(
      @PathVariable long id, @Valid @RequestBody Permissions input) {
    governance.lock();
    var row = role(id);
    if (row.get("organization_id") == null) throw new BusinessException(403, "历史无归属角色不可配置");
    long org = s.number(row, "organization_id");
    s.access.requireOrganizationPermission(org, "role.manage");
    Set<String> old = new TreeSet<>(permissionCodes(id));
    Set<String> desired = new TreeSet<>(input.permissionCodes());
    Set<String> added = new TreeSet<>(desired);
    added.removeAll(old);
    Set<String> removed = new TreeSet<>(old);
    removed.removeAll(desired);
    for (String code : desired) {
      var entry = PermissionCatalog.find(code);
      if (entry == null) throw new BusinessException(400, "未知权限代码: " + code);
      if (!entry.available() && !old.contains(code))
        throw new BusinessException(400, "权限暂不可用: " + code);
    }
    for (String code : added)
      if (!delegation.configurable(org, code))
        throw new BusinessException(403, "超出当前组织的可配置权限上限: " + code);
    validateAffected(row, added);
    var before = governance.snapshot();
    for (String code : removed)
      s.db.update("DELETE FROM role_permission WHERE role_id=? AND permission_code=?", id, code);
    for (String code : added)
      s.db.update("INSERT INTO role_permission(role_id,permission_code) VALUES(?,?)", id, code);
    governance.preserve(before);
    audit("role.permissions", Map.of("id", id, "added", added, "removed", removed));
    return ApiResponse.ok(dto(role(id), "manage"));
  }

  private void validateAffected(Map<String, Object> role, Collection<String> added) {
    long id = s.number(role, "id"), org = s.number(role, "organization_id");
    for (var grant :
        s.db.queryForList(
            "SELECT id,user_id,valid_until FROM member_grant WHERE role_id=? ORDER BY id", id)) {
      List<Long> stations =
          s.db.queryForList(
              "SELECT station_id FROM member_grant_station WHERE grant_id=? ORDER BY station_id",
              Long.class,
              s.number(grant, "id"));
      long member = s.number(grant, "user_id");
      delegation.requireScope(org, member, stations, "role.manage");
      if (!added.isEmpty()) {
        Timestamp until = (Timestamp) grant.get("valid_until");
        delegation.requireDelegation(
            org, member, stations, added, until == null ? null : until.toInstant(), "role.manage");
      }
    }
  }

  private Map<String, Object> managedRole(long id) {
    var row = role(id);
    if (row.get("organization_id") == null) throw new BusinessException(403, "历史无归属角色不可配置");
    s.access.requireOrganizationPermission(s.number(row, "organization_id"), "role.manage");
    return row;
  }

  private Map<String, Object> role(long id) {
    return s.one("SELECT * FROM app_role WHERE id=?", id);
  }

  private List<String> permissionCodes(long id) {
    return s.db.queryForList(
        "SELECT permission_code FROM role_permission WHERE role_id=? ORDER BY permission_code",
        String.class,
        id);
  }

  private long referenceCount(long id) {
    return s.db.queryForObject("SELECT count(*) FROM member_grant WHERE role_id=?", Long.class, id);
  }

  private long visibleMembers(long id, String purpose) {
    String permission = purpose.equals("assign") ? "member.grant.manage" : "role.manage";
    return s.db.queryForObject(
        """
SELECT count(DISTINCT u.id) FROM member_grant g JOIN app_user u ON u.id=g.user_id WHERE g.role_id=?
  AND EXISTS(SELECT 1 FROM effective_organization_permission p WHERE p.user_id=? AND p.permission_code=?
    AND p.organization_id=u.management_organization_id)
  AND (u.organization_id IS NULL OR EXISTS(SELECT 1 FROM effective_organization_permission p
    WHERE p.user_id=? AND p.permission_code=? AND p.organization_id=u.organization_id))
""",
        Long.class,
        id,
        s.access.userId(),
        permission,
        s.access.userId(),
        permission);
  }

  private BusinessRole dto(Map<String, Object> row, String purpose) {
    long id = s.number(row, "id"), org = s.number(row, "organization_id");
    List<String> codes = permissionCodes(id);
    boolean canEdit = s.access.organizationIds("role.manage").contains(org);
    if (canEdit)
      try {
        validateAffected(row, List.of());
      } catch (BusinessException e) {
        if (e.status() != 403) throw e;
        canEdit = false;
      }
    boolean canAssign =
        s.access.organizationIds("member.grant.manage").contains(org)
            && codes.stream().allMatch(code -> delegation.configurable(org, code));
    return new BusinessRole(
        id,
        (String) row.get("code"),
        (String) row.get("name"),
        (String) row.get("description"),
        org,
        codes,
        visibleMembers(id, purpose),
        canEdit,
        canEdit && referenceCount(id) == 0,
        canAssign,
        canAssign ? null : "超出可分配的角色权限范围；具体成员、站点和有效期需在授权保存时校验");
  }

  private long selectedOrganization(Long selected, String purpose) {
    var allowed = new TreeSet<Long>();
    if (!purpose.equals("assign")) allowed.addAll(s.access.organizationIds("role.manage"));
    if (!purpose.equals("manage")) allowed.addAll(s.access.organizationIds("member.grant.manage"));
    if (selected != null) {
      if (!allowed.contains(selected)) throw new BusinessException(403, "组织不在可管理范围内");
      return selected;
    }
    if (allowed.isEmpty()) throw new BusinessException(403, "当前账号未分配管理组织");
    Long owner =
        s.db.queryForObject(
            "SELECT management_organization_id FROM app_user WHERE id=?",
            Long.class,
            s.access.userId());
    return owner != null && allowed.contains(owner) ? owner : allowed.first();
  }

  private String validName(String name) {
    if (name == null || name.trim().isEmpty() || name.trim().length() > 120)
      throw new BusinessException(400, "角色名称不能为空且不能超过120字");
    return name.trim();
  }

  private void uniqueName(long org, String name, Long except) {
    if (Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_role WHERE organization_id=? AND btrim(name)=? AND"
                + " (?::bigint IS NULL OR id<>?))",
            Boolean.class,
            org,
            name,
            except,
            except))) throw new BusinessException(409, "组织内角色名称已存在");
  }

  private void audit(String action, Map<String, ?> detail) {
    try {
      s.audit(action, new ObjectMapper().writeValueAsString(detail));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }
}
