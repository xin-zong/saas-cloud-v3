package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
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

  public MemberController(DomainSupport s, BCryptPasswordEncoder encoder) {
    this.s = s;
  }

  public record Create(
      @NotBlank String account,
      @NotBlank String name,
      @NotBlank String password,
      List<Long> roleIds,
      List<Long> stationIds,
      Long organizationId) {}

  @PostMapping("/members")
  public ApiResponse<?> create(@Valid @RequestBody Create n) {
    s.access.userId();
    throw new BusinessException(410, "旧版成员与权限批量创建已停用，请使用独立成员和授权流程");
  }

  public record Edit(
      @NotBlank @Size(max = 120) String name, boolean enabled, Long organizationId) {}

  @PutMapping("/members/{id}")
  @Transactional
  public ApiResponse<?> edit(@PathVariable long id, @Valid @RequestBody Edit n) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    var member =
        s.one(
            "SELECT organization_id,management_organization_id FROM app_user WHERE id=? FOR UPDATE",
            id);
    Object owner = member.get("management_organization_id");
    if (owner == null) throw new BusinessException(403, "成员未分配管理组织");
    s.access.requireOrganizationPermission(((Number) owner).longValue(), "member.manage.profile");
    Object org = member.get("organization_id");
    if (org != null)
      s.access.requireOrganizationPermission(((Number) org).longValue(), "member.manage.profile");
    if (n.organizationId() != null && !Objects.equals(n.organizationId(), org))
      throw new BusinessException(400, "请使用独立的组织成员移动流程");
    if (id == s.access.userId() && !n.enabled()) throw new BusinessException(409, "不能停用自己");
    s.db.update(
        "UPDATE app_user SET display_name=?,enabled=? WHERE id=?", n.name(), n.enabled(), id);
    s.audit("member.edit", "user=" + id);
    return ApiResponse.ok(null);
  }

  public record Grants(List<Long> roleIds, List<Long> stationIds) {}

  @PutMapping("/members/{id}/grants")
  public ApiResponse<?> updateGrants(@PathVariable long id, @Valid @RequestBody Grants n) {
    s.access.userId();
    throw new BusinessException(410, "旧版角色与站点笛卡尔积授权已停用，请使用逐条成员授权流程");
  }
}
