package com.enerlution.ems.business;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class MemberController {
  private final DomainSupport s;
  private final BCryptPasswordEncoder encoder;
  private final GovernanceGuard governance;
  private final GrantDelegation delegation;

  public MemberController(DomainSupport s, BCryptPasswordEncoder encoder) {
    this.s = s;
    this.encoder = encoder;
    governance = new GovernanceGuard(s.db);
    delegation = new GrantDelegation(s.db, s.access);
  }

  public record Create(
      @NotBlank @Size(max = 120) String account,
      @NotBlank @Size(max = 120) String name,
      @NotBlank @Size(min = 12, max = 72) String password,
      @Email @Size(max = 254) String email,
      @Positive Long organizationId,
      @Positive Long managementOrganizationId,
      JsonNode roleIds,
      JsonNode stationIds) {}

  @PostMapping("/members")
  @Transactional
  public ApiResponse<?> create(@Valid @RequestBody Create n) {
    governance.lock();
    if (n.roleIds() != null || n.stationIds() != null)
      throw new BusinessException(410, "旧版成员与权限批量创建已停用，请使用独立成员和授权流程");
    Long owner =
        n.managementOrganizationId() != null ? n.managementOrganizationId() : n.organizationId();
    if (owner == null) throw new BusinessException(400, "未分配组织的成员必须明确选择管理组织");
    s.access.requireOrganizationPermission(owner, "member.manage.profile");
    if (n.organizationId() != null)
      s.access.requireOrganizationPermission(n.organizationId(), "member.manage.profile");
    long id =
        s.db.queryForObject(
            "INSERT INTO"
                + " app_user(account,display_name,password_hash,email,organization_id,management_organization_id)"
                + " VALUES(?,?,?,?,?,?) RETURNING id",
            Long.class,
            n.account().trim().toLowerCase(Locale.ROOT),
            n.name().trim(),
            encoder.encode(n.password()),
            email(n.email()),
            n.organizationId(),
            owner);
    s.audit("member.create", "user=" + id);
    return ApiResponse.ok(Map.of("id", id));
  }

  public record Edit(
      @NotBlank @Size(max = 120) String name,
      boolean enabled,
      @Email @Size(max = 254) String email,
      JsonNode organizationId) {}

  @PutMapping("/members/{id}")
  @Transactional
  public ApiResponse<?> edit(@PathVariable long id, @Valid @RequestBody Edit n) {
    governance.lock();
    s.access.requirePermission("member.manage.profile");
    delegation.requireMemberScope(id, "member.manage.profile");
    if (n.organizationId() != null) throw new BusinessException(400, "请使用独立的组织成员移动流程");
    if (id == s.access.userId() && !n.enabled()) throw new BusinessException(409, "不能停用自己");
    var before = governance.snapshot();
    s.db.update(
        "UPDATE app_user SET display_name=?,email=?,enabled=? WHERE id=?",
        n.name().trim(),
        email(n.email()),
        n.enabled(),
        id);
    governance.preserve(before);
    s.audit("member.edit", "user=" + id);
    return ApiResponse.ok(null);
  }

  @PutMapping("/members/{id}/organization")
  @Transactional
  public ApiResponse<?> organization(@PathVariable long id, @RequestBody JsonNode input) {
    governance.lock();
    if (!input.isObject()
        || !input.has("organizationId")
        || (!input.get("organizationId").isNull()
            && (!input.get("organizationId").canConvertToLong()
                || !input.get("organizationId").isIntegralNumber()
                || input.get("organizationId").asLong() <= 0)))
      throw new BusinessException(400, "必须明确指定所属组织，null 表示移出组织");
    Long target =
        input.get("organizationId").isNull() ? null : input.get("organizationId").asLong();
    delegation.requireMemberScope(id, "organization.manage");
    if (target != null) s.access.requireOrganizationPermission(target, "organization.manage");
    var member = s.one("SELECT organization_id FROM app_user WHERE id=? FOR UPDATE", id);
    if (id == s.access.userId() && !Objects.equals(target, member.get("organization_id")))
      throw new BusinessException(409, "不能移动自己的组织");
    var before = governance.snapshot();
    s.db.update("UPDATE app_user SET organization_id=? WHERE id=?", target, id);
    // Administrative ownership and role owners deliberately remain fixed.
    s.db.update(
        """
WITH RECURSIVE branch(root,id) AS (
  SELECT id,id FROM organization UNION SELECT b.root,o.id FROM branch b JOIN organization o ON o.parent_id=b.id
) UPDATE organization o SET lead_user_id=NULL WHERE o.lead_user_id=? AND NOT EXISTS(
  SELECT 1 FROM branch b JOIN app_user u ON u.organization_id=b.id WHERE b.root=o.id AND u.id=?)
  AND EXISTS(SELECT 1 FROM branch b WHERE b.root=o.id AND b.id=?::bigint)
""",
        id,
        id,
        member.get("organization_id"));
    governance.preserve(before);
    s.audit("member.organization", "user=" + id + ",organization=" + target);
    return ApiResponse.ok(null);
  }

  @DeleteMapping("/members/{id}")
  @Transactional
  public ApiResponse<?> delete(@PathVariable long id) {
    governance.lock();
    delegation.requireMemberScope(id, "member.manage.profile");
    if (id == s.access.userId()) throw new BusinessException(409, "不能删除自己");
    if (new MemberReferences(s.db).exists(id))
      throw new BusinessException(409, "成员存在业务或授权历史引用，请停用成员以保留记录");
    var before = governance.snapshot();
    s.db.update("DELETE FROM app_user WHERE id=?", id);
    governance.preserve(before);
    s.audit("member.delete", "user=" + id);
    return ApiResponse.ok(null);
  }

  private String email(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  public record Grants(List<Long> roleIds, List<Long> stationIds) {}

  @PutMapping("/members/{id}/grants")
  public ApiResponse<?> updateGrants(@PathVariable long id, @Valid @RequestBody Grants n) {
    s.access.userId();
    throw new BusinessException(410, "旧版角色与站点笛卡尔积授权已停用，请使用逐条成员授权流程");
  }
}
