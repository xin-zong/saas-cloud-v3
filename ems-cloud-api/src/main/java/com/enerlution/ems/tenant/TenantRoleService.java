package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantRoleService {
  private final TenantSupport s;
  private final DelegationPolicy delegation;

  public TenantRoleService(TenantSupport s, DelegationPolicy delegation) {
    this.s = s;
    this.delegation = delegation;
  }

  public record Edit(
      @NotBlank @Size(max = 120) String name,
      @Size(max = 2000) String description,
      @NotNull @Valid @Size(max = 200) List<RoleTemplateService.Selection> permissions) {}

  public Map<String, Object> options() {
    long tenant = own();
    var actor = s.auth.context();
    var rows =
        s.db.queryForList(
            actor.kind().equals("enterprise")
                ? "SELECT m.* FROM menu m JOIN saas_tenant_menu tm ON tm.menu_id=m.id WHERE tm.tenant_id=? ORDER BY m.client,m.sort_order,m.id"
                : "SELECT m.* FROM saas_enabled_menu m WHERE m.side IN ('platform','both') AND ?::bigint IS NOT NULL ORDER BY m.client,m.sort_order,m.id",
            tenant);
    for (var row : rows) {
      String code = (String) row.get("permission_code");
      row.put(
          "configurable",
          code == null
              || actor.administrator()
              || Boolean.TRUE.equals(
                  s.db.queryForObject(
                      "SELECT EXISTS(SELECT 1 FROM saas_member_capability WHERE user_id=? AND permission_code=? AND client=?)",
                      Boolean.class,
                      actor.actorId(),
                      code,
                      row.get("client"))));
    }
    return Map.of("menus", rows);
  }

  public List<Map<String, Object>> list() {
    long tenant = own();
    var rows =
        s.db.queryForList(
            "SELECT id,name,description,enabled,(SELECT count(DISTINCT user_id) FROM member_grant WHERE role_id=r.id) member_count FROM app_role r WHERE tenant_id=? ORDER BY id",
            tenant);
    for (var row : rows) {
      row.put("source", "custom");
      row.put("readonly", false);
      var configured =
          s.db.queryForList(
              "SELECT permission_code code,client FROM role_permission WHERE role_id=? ORDER BY client,permission_code",
              row.get("id"));
      var visible =
          configured.stream()
              .filter(
                  p ->
                      delegation.inPackage(
                          tenant, (String) p.get("code"), (String) p.get("client")))
              .toList();
      row.put("permissions", visible);
      row.put("unavailablePermissionCount", configured.size() - visible.size());
    }
    if (s.auth.context().kind().equals("enterprise"))
      for (var template :
          s.db.queryForList(
              "SELECT DISTINCT r.id,r.name,r.enabled FROM role_template r JOIN permission_package_template pt ON pt.template_id=r.id JOIN permission_package p ON p.id=pt.package_id AND p.enabled JOIN tenant_package tp ON tp.package_id=p.id WHERE tp.tenant_id=? ORDER BY r.id",
              tenant)) {
        template.put("source", "template");
        template.put("readonly", true);
        template.put(
            "permissions",
            s
                .db
                .queryForList(
                    "SELECT permission_code code,client FROM role_template_permission WHERE template_id=? ORDER BY client,permission_code",
                    template.get("id"))
                .stream()
                .filter(
                    p ->
                        delegation.inPackage(
                            tenant, (String) p.get("code"), (String) p.get("client")))
                .toList());
        rows.add(template);
      }
    rows.addFirst(
        new HashMap<>(
            Map.of(
                "id",
                "administrator",
                "name",
                "Super Admin",
                "source",
                "system",
                "readonly",
                true,
                "enabled",
                true,
                "permissions",
                List.of())));
    return rows;
  }

  @Transactional
  public long create(Edit b) {
    long tenant = own();
    s.lock();
    delegation.checkSelections(tenant, b.permissions(), null);
    Long id =
        s.db.queryForObject(
            "INSERT INTO app_role(code,name,description,tenant_id) VALUES(?,?,?,?) RETURNING id",
            Long.class,
            "tenant_" + UUID.randomUUID().toString().replace("-", ""),
            b.name().trim(),
            b.description(),
            tenant);
    writePermissions(id, b.permissions(), tenant);
    s.audit(tenant, "role.created", "role=" + id);
    s.events.changed();
    return id;
  }

  @Transactional
  public void edit(long id, Edit b) {
    long tenant = own();
    s.lock();
    exists(id, tenant);
    delegation.checkSelections(tenant, b.permissions(), id);
    s.db.update(
        "UPDATE app_role SET name=?,description=? WHERE id=?",
        b.name().trim(),
        b.description(),
        id);
    writePermissions(id, b.permissions(), tenant);
    s.audit(tenant, "role.updated", "role=" + id);
    s.events.changed();
  }

  @Transactional
  public void enabled(long id, boolean enabled, boolean confirmed) {
    long tenant = own();
    s.lock();
    exists(id, tenant);
    if (!confirmed) throw new BusinessException(409, "请确认角色变更对已有员工的影响");
    if (enabled) {
      var desired =
          s
              .db
              .queryForList(
                  "SELECT permission_code,client FROM role_permission WHERE role_id=?", id)
              .stream()
              .filter(
                  r ->
                      delegation.inPackage(
                          tenant, (String) r.get("permission_code"), (String) r.get("client")))
              .map(
                  r ->
                      new RoleTemplateService.Selection(
                          (String) r.get("permission_code"), (String) r.get("client")))
              .toList();
      delegation.checkSelections(tenant, desired, id);
    }
    s.db.update("UPDATE app_role SET enabled=? WHERE id=?", enabled, id);
    s.audit(tenant, "role.status", "role=" + id);
    s.events.changed();
  }

  @Transactional
  public void delete(long id) {
    long tenant = own();
    s.lock();
    exists(id, tenant);
    if (Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM member_grant WHERE role_id=?)", Boolean.class, id)))
      throw new BusinessException(409, "角色仍被员工引用，请先撤销授权");
    s.db.update("DELETE FROM app_role WHERE id=?", id);
    s.audit(tenant, "role.deleted", "role=" + id);
    s.events.changed();
  }

  private void writePermissions(
      long id, List<RoleTemplateService.Selection> permissions, long tenant) {
    // Preserve previously configured but currently unavailable package permissions.
    for (var old :
        s.db.queryForList("SELECT permission_code,client FROM role_permission WHERE role_id=?", id))
      if (delegation.inPackage(
          tenant, (String) old.get("permission_code"), (String) old.get("client")))
        s.db.update(
            "DELETE FROM role_permission WHERE role_id=? AND permission_code=? AND client=?",
            id,
            old.get("permission_code"),
            old.get("client"));
    for (var p : new LinkedHashSet<>(permissions))
      s.db.update(
          "INSERT INTO role_permission(role_id,permission_code,client) VALUES(?,?,?) ON CONFLICT DO NOTHING",
          id,
          p.code(),
          p.client());
  }

  private long own() {
    s.auth.requirePermission("company.role.manage");
    return s.auth.context().tenantId();
  }

  private void exists(long id, long tenant) {
    if (!Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_role WHERE id=? AND tenant_id=?)",
            Boolean.class,
            id,
            tenant))) throw new BusinessException(404, "自定义角色不存在；预制角色由平台维护");
  }
}
