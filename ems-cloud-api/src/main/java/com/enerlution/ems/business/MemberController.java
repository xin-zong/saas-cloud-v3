package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class MemberController {
  private final DomainSupport s;
  private final BCryptPasswordEncoder encoder;

  public MemberController(DomainSupport s, BCryptPasswordEncoder encoder) {
    this.s = s;
    this.encoder = encoder;
  }

  public record Create(
      @NotBlank @Size(max = 120) String account,
      @NotBlank @Size(max = 120) String name,
      @NotBlank @Size(min = 12, max = 72) String password,
      @NotNull @Size(min = 1, max = 10) List<@NotNull Long> roleIds,
      @NotNull @Size(max = 200) List<@NotNull Long> stationIds,
      Long organizationId) {}

  @PostMapping("/members")
  @Transactional
  public ApiResponse<?> create(@Valid @RequestBody Create n) {
    s.access.requirePermission("member.manage");
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    long org = n.organizationId() == null ? organization() : n.organizationId();
    requireBranch(org);
    if (n.password().getBytes(StandardCharsets.UTF_8).length > 72)
      throw new BusinessException(400, "密码字节长度超过限制");
    grants(n.roleIds(), n.stationIds());
    Long id =
        s.db.queryForObject(
            "INSERT INTO app_user(account,display_name,password_hash,organization_id)"
                + " VALUES(?,?,?,?) RETURNING id",
            Long.class,
            n.account().trim().toLowerCase(Locale.ROOT),
            n.name(),
            encoder.encode(n.password()),
            org);
    assign(id, n.roleIds(), n.stationIds());
    s.audit("member.create", "user=" + id);
    return ApiResponse.ok(Map.of("id", id));
  }

  public record Edit(
      @NotBlank @Size(max = 120) String name, boolean enabled, Long organizationId) {}

  @PutMapping("/members/{id}")
  @Transactional
  public ApiResponse<?> edit(@PathVariable long id, @Valid @RequestBody Edit n) {
    s.access.requirePermission("member.manage");
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    long currentOrg = member(id);
    if (id == s.access.userId() && !n.enabled()) throw new BusinessException(409, "不能停用自己");
    long nextOrg = n.organizationId() == null ? currentOrg : n.organizationId();
    requireBranch(nextOrg);
    if (id == s.access.userId() && nextOrg != currentOrg)
      throw new BusinessException(409, "不能通过成员管理移动自己的组织");
    s.db.update(
        "UPDATE app_user SET display_name=?,enabled=?,organization_id=? WHERE id=?",
        n.name(),
        n.enabled(),
        nextOrg,
        id);
    s.audit("member.edit", "user=" + id);
    return ApiResponse.ok(null);
  }

  public record Grants(
      @NotNull @Size(min = 1, max = 10) List<@NotNull Long> roleIds,
      @NotNull @Size(max = 200) List<@NotNull Long> stationIds) {}

  @PutMapping("/members/{id}/grants")
  @Transactional
  public ApiResponse<?> updateGrants(@PathVariable long id, @Valid @RequestBody Grants n) {
    s.access.requirePermission("member.manage");
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    member(id);
    if (id == s.access.userId()) throw new BusinessException(409, "不能通过成员管理修改自己的授权");
    Boolean hiddenStations =
        s.db.queryForObject(
            """
SELECT EXISTS(SELECT 1 FROM user_station target WHERE target.user_id=? AND NOT EXISTS(
  SELECT 1 FROM user_station mine WHERE mine.user_id=? AND mine.station_id=target.station_id))
""",
            Boolean.class,
            id,
            s.access.userId());
    if (Boolean.TRUE.equals(hiddenStations)) throw new BusinessException(403, "成员包含管理范围外的站点授权");
    grants(n.roleIds(), n.stationIds());
    s.db.update("DELETE FROM user_role WHERE user_id=?", id);
    s.db.update("DELETE FROM user_station WHERE user_id=?", id);
    assign(id, n.roleIds(), n.stationIds());
    s.audit("member.grants", "user=" + id);
    return ApiResponse.ok(null);
  }

  private long organization() {
    Object id =
        s.one("SELECT organization_id FROM app_user WHERE id=?", s.access.userId())
            .get("organization_id");
    if (id == null) throw new BusinessException(403, "当前账号未分配管理组织");
    return ((Number) id).longValue();
  }

  private long member(long id) {
    var member = s.one("SELECT organization_id FROM app_user WHERE id=? FOR UPDATE", id);
    if (member.get("organization_id") == null) throw new BusinessException(403, "成员不属于当前管理组织");
    long org = s.number(member, "organization_id");
    requireBranch(org);
    return org;
  }

  private void requireBranch(long id) {
    Boolean allowed =
        s.db.queryForObject(
            """
            WITH RECURSIVE branch AS (
              SELECT id FROM organization WHERE id=?
              UNION ALL SELECT o.id FROM organization o JOIN branch b ON o.parent_id=b.id
            ) SELECT EXISTS(SELECT 1 FROM branch WHERE id=?)
            """,
            Boolean.class,
            organization(),
            id);
    if (!Boolean.TRUE.equals(allowed)) throw new BusinessException(403, "组织不属于当前管理范围");
  }

  private void grants(List<Long> roles, List<Long> stations) {
    for (long station : new HashSet<>(stations)) s.access.requireStation(station);
    for (long role : new HashSet<>(roles)) {
      if (!Boolean.TRUE.equals(
          s.db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM user_role WHERE user_id=? AND role_id=?)",
              Boolean.class,
              s.access.userId(),
              role))) throw new BusinessException(403, "不能授予自己没有的角色");
      var permissions =
          s.db.queryForList(
              "SELECT permission_code FROM role_permission WHERE role_id=?", String.class, role);
      permissions.forEach(s.access::requirePermission);
    }
  }

  private void assign(long user, List<Long> roles, List<Long> stations) {
    for (long role : new HashSet<>(roles))
      s.db.update("INSERT INTO user_role VALUES(?,?)", user, role);
    for (long station : new HashSet<>(stations))
      s.db.update("INSERT INTO user_station VALUES(?,?)", user, station);
  }
}
