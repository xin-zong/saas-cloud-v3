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

  private long ownOrganization() {
    Object id =
        s.one("SELECT organization_id FROM app_user WHERE id=?", s.access.userId())
            .get("organization_id");
    if (id == null) throw new BusinessException(403, "当前账号未分配管理组织");
    return ((Number) id).longValue();
  }

  @GetMapping("/platform/organizations")
  public ApiResponse<?> organizations() {
    s.access.requirePermission("member.manage");
    return ApiResponse.ok(
        s.db.queryForList(
            """
WITH RECURSIVE branch AS (
  SELECT id,name,parent_id FROM organization WHERE id=?
  UNION ALL SELECT o.id,o.name,o.parent_id FROM organization o JOIN branch b ON o.parent_id=b.id
) SELECT id,name,parent_id FROM branch ORDER BY id
""",
            ownOrganization()));
  }

  public record OrganizationInput(@NotBlank @Size(max = 120) String name, Long parentId) {}

  @PostMapping("/platform/organizations")
  @Transactional
  public ApiResponse<?> createOrganization(@Valid @RequestBody OrganizationInput input) {
    s.access.requirePermission("member.manage");
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    long parent = input.parentId() == null ? ownOrganization() : input.parentId();
    requireBranch(parent);
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
    s.access.requirePermission("member.manage");
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    requireBranch(id);
    long parent = input.parentId() == null ? ownOrganization() : input.parentId();
    requireBranch(parent);
    if (id == ownOrganization() && parent != id) throw new BusinessException(403, "不能移动管理组织");
    if (id == ownOrganization())
      s.db.update("UPDATE organization SET name=? WHERE id=?", input.name().trim(), id);
    else
      s.db.update(
          "UPDATE organization SET name=?,parent_id=? WHERE id=?", input.name().trim(), parent, id);
    s.audit("organization.edit", "organization=" + id);
    return ApiResponse.ok(null);
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
            ownOrganization(),
            id);
    if (!Boolean.TRUE.equals(allowed)) throw new BusinessException(403, "组织不属于当前管理范围");
  }

  @GetMapping("/platform/member-grants")
  public ApiResponse<?> memberGrants() {
    s.access.requirePermission("member.manage");
    long org = ownOrganization();
    var result = new ArrayList<Map<String, Object>>();
    for (var row :
        s.db.queryForList(
            """
WITH RECURSIVE branch AS (
  SELECT id FROM organization WHERE id=?
  UNION ALL SELECT child.id FROM organization child JOIN branch parent ON child.parent_id=parent.id
) SELECT u.id FROM app_user u JOIN branch b ON b.id=u.organization_id ORDER BY u.id
""",
            org)) {
      long id = s.number(row, "id");
      result.add(
          Map.of(
              "member_id", id,
              "role_ids",
                  s.db.queryForList(
                      "SELECT role_id FROM user_role WHERE user_id=? ORDER BY role_id",
                      Long.class,
                      id),
              "station_count",
                  s.db.queryForObject(
                      "SELECT count(*) FROM user_station WHERE user_id=?", Long.class, id),
              "station_ids",
                  s.db.queryForList(
                      """
                      SELECT us.station_id FROM user_station us JOIN user_station mine
                        ON mine.station_id=us.station_id AND mine.user_id=?
                      WHERE us.user_id=? ORDER BY us.station_id
                      """,
                      Long.class,
                      s.access.userId(),
                      id)));
    }
    return ApiResponse.ok(result);
  }

  @GetMapping("/platform/role-permissions")
  public ApiResponse<?> rolePermissions() {
    s.access.requirePermission("member.manage");
    return ApiResponse.ok(
        s.db.queryForList(
            """
SELECT r.id AS role_id, p.code, p.name FROM app_role r
JOIN user_role mine ON mine.role_id=r.id AND mine.user_id=?
JOIN role_permission rp ON rp.role_id=r.id JOIN permission p ON p.code=rp.permission_code
ORDER BY r.id,p.code
""",
            s.access.userId()));
  }

  @GetMapping("/platform/customers")
  public ApiResponse<?> customers() {
    s.access.requirePermission("asset.read");
    return ApiResponse.ok(
        s.db.queryForList(
            """
SELECT c.id,c.name,COUNT(DISTINCT st.id) AS station_count,
  COUNT(DISTINCT st.id)=(SELECT COUNT(*) FROM station all_st WHERE all_st.customer_id=c.id)
    AND COUNT(DISTINCT st.id)=(SELECT COUNT(*) FROM station all_st WHERE all_st.customer_id=c.id
      AND all_st.organization_id IN (
        WITH RECURSIVE branch AS (
          SELECT organization_id AS id FROM app_user WHERE id=?
          UNION ALL SELECT child.id FROM organization child JOIN branch parent ON child.parent_id=parent.id
        ) SELECT id FROM branch)) AS can_edit FROM customer c
JOIN station st ON st.customer_id=c.id
JOIN user_station us ON us.station_id=st.id AND us.user_id=?
GROUP BY c.id,c.name ORDER BY c.name
""",
            s.access.userId(),
            s.access.userId()));
  }

  public record CustomerInput(@NotBlank @Size(max = 160) String name) {}

  @PutMapping("/platform/customers/{id}")
  @Transactional
  public ApiResponse<?> editCustomer(
      @PathVariable long id, @Valid @RequestBody CustomerInput input) {
    s.access.requirePermission("asset.edit");
    s.access.requirePermission("member.manage");
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    Boolean allowed =
        s.db.queryForObject(
            """
WITH RECURSIVE branch AS (
  SELECT organization_id AS id FROM app_user WHERE id=?
  UNION ALL SELECT child.id FROM organization child JOIN branch parent ON child.parent_id=parent.id
) SELECT EXISTS(SELECT 1 FROM station WHERE customer_id=?)
  AND NOT EXISTS(SELECT 1 FROM station st WHERE st.customer_id=? AND NOT EXISTS(
    SELECT 1 FROM user_station us JOIN branch b ON b.id=st.organization_id
    WHERE us.station_id=st.id AND us.user_id=?))
""",
            Boolean.class,
            s.access.userId(),
            id,
            id,
            s.access.userId());
    if (!Boolean.TRUE.equals(allowed)) throw new BusinessException(403, "客户不属于当前站点范围");
    s.db.update("UPDATE customer SET name=? WHERE id=?", input.name().trim(), id);
    s.audit("customer.edit", "customer=" + id);
    return ApiResponse.ok(null);
  }
}
