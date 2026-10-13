package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MenuManagementService {
  private final JdbcTemplate db;
  private final TenantSupport s;

  public MenuManagementService(JdbcTemplate db, TenantSupport s) {
    this.db = db;
    this.s = s;
  }

  public record Edit(
      Long parentId,
      @NotBlank @Pattern(regexp = "web|app") String client,
      @NotBlank @Pattern(regexp = "directory|page|action") String kind,
      @NotBlank @Size(max = 120) String nameKey,
      @Size(max = 120) String routePath,
      @Size(max = 100) String permissionCode,
      @Pattern(regexp = "platform|enterprise|both") String applicableSide,
      @Min(0) int sortOrder,
      @Size(max = 2000) String remarks) {}

  public List<Map<String, Object>> list() {
    s.platform("menu.manage");
    return db.queryForList(
        "SELECT m.*,p.name permission_name, (NOT EXISTS(SELECT 1 FROM menu c WHERE c.parent_id=m.id) AND NOT EXISTS(SELECT 1 FROM permission_package_menu x WHERE x.menu_id=m.id) AND NOT EXISTS(SELECT 1 FROM role_permission r WHERE r.permission_code=m.permission_code AND r.client=m.client) AND NOT EXISTS(SELECT 1 FROM role_template_permission r WHERE r.permission_code=m.permission_code AND r.client=m.client)) can_delete FROM menu m LEFT JOIN permission p ON p.code=m.permission_code ORDER BY m.client,m.sort_order,m.id");
  }

  public Map<String, Object> options() {
    s.platform("menu.manage");
    return Map.of(
        "routes",
        db.queryForList("SELECT code FROM tenant_route ORDER BY code", String.class),
        "permissions",
        db.queryForList(
            "SELECT code,name,resource_scope,operation_kind FROM permission WHERE implemented ORDER BY code"));
  }

  public Map<String, Object> configurationOptions() {
    if (!s.auth.context().kind().equals("platform")
        || !(s.auth.hasPermission("menu.manage")
            || s.auth.hasPermission("package.manage")
            || s.auth.hasPermission("role.template.manage")))
      throw new BusinessException(403, "Permission denied");
    return Map.of(
        "routes",
        db.queryForList("SELECT code FROM tenant_route ORDER BY code", String.class),
        "permissions",
        db.queryForList(
            "SELECT code,name,resource_scope,operation_kind FROM permission WHERE implemented ORDER BY code"),
        "menus",
        db.queryForList(
            "SELECT m.*,p.name permission_name FROM saas_enabled_menu m LEFT JOIN permission p ON p.code=m.permission_code ORDER BY m.client,m.sort_order,m.id"),
        "allMenus",
        db.queryForList(
            "SELECT m.*,p.name permission_name FROM menu m LEFT JOIN permission p ON p.code=m.permission_code ORDER BY m.client,m.sort_order,m.id"),
        "templates",
        db.queryForList("SELECT id,name,enabled FROM role_template ORDER BY id"));
  }

  @Transactional
  public long create(Edit b) {
    s.platform("menu.manage");
    s.lock();
    validate(b);
    Long id =
        db.queryForObject(
            "INSERT INTO menu(parent_id,client,kind,name_key,route_path,permission_code,applicable_side,sort_order,remarks) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id",
            Long.class,
            b.parentId(),
            b.client(),
            b.kind(),
            b.nameKey().trim(),
            b.routePath(),
            b.permissionCode(),
            b.applicableSide(),
            b.sortOrder(),
            b.remarks());
    changed("menu.created", id);
    return id;
  }

  @Transactional
  public void edit(long id, Edit b) {
    s.platform("menu.manage");
    s.lock();
    exists(id);
    validate(b);
    db.update(
        "UPDATE menu SET parent_id=?,client=?,kind=?,name_key=?,route_path=?,permission_code=?,applicable_side=?,sort_order=?,remarks=? WHERE id=?",
        b.parentId(),
        b.client(),
        b.kind(),
        b.nameKey().trim(),
        b.routePath(),
        b.permissionCode(),
        b.applicableSide(),
        b.sortOrder(),
        b.remarks(),
        id);
    changed("menu.updated", id);
  }

  @Transactional
  public void delete(long id) {
    s.platform("menu.manage");
    s.lock();
    exists(id);
    Boolean referenced =
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM menu m WHERE m.id=? AND (EXISTS(SELECT 1 FROM menu c WHERE c.parent_id=m.id) OR EXISTS(SELECT 1 FROM permission_package_menu x WHERE x.menu_id=m.id) OR EXISTS(SELECT 1 FROM role_permission r WHERE r.permission_code=m.permission_code AND r.client=m.client) OR EXISTS(SELECT 1 FROM role_template_permission r WHERE r.permission_code=m.permission_code AND r.client=m.client)))",
            Boolean.class,
            id);
    if (Boolean.TRUE.equals(referenced))
      throw new BusinessException(409, "菜单存在子菜单、权限包或角色引用，请先处理关联或选择停用");
    db.update("DELETE FROM menu WHERE id=?", id);
    changed("menu.deleted", id);
  }

  @Transactional
  public void enabled(long id, boolean enabled, boolean confirmed) {
    s.platform("menu.manage");
    s.lock();
    exists(id);
    if (!confirmed) throw new BusinessException(409, "请确认菜单变更对引用角色和企业的影响");
    db.update("UPDATE menu SET enabled=? WHERE id=?", enabled, id);
    changed("menu.status", id);
  }

  public Map<String, Object> impact(long id) {
    s.platform("menu.manage");
    exists(id);
    Long companies =
        db.queryForObject(
            "SELECT count(DISTINCT tp.tenant_id) FROM tenant_package tp JOIN permission_package_menu pm ON pm.package_id=tp.package_id WHERE pm.menu_id=(WITH RECURSIVE a AS(SELECT id,parent_id FROM menu WHERE id=? UNION ALL SELECT m.id,m.parent_id FROM menu m JOIN a ON m.id=a.parent_id) SELECT id FROM a WHERE parent_id IS NULL)",
            Long.class,
            id);
    return Map.of("referencingCompanies", companies);
  }

  @Transactional
  public void order(List<Long> input) {
    s.platform("menu.manage");
    s.lock();
    List<Long> ids = TenantSupport.ids(input, true);
    var rows =
        db.queryForList(
            "SELECT id,parent_id,client FROM menu WHERE id IN ("
                + TenantSupport.placeholders(ids.size())
                + ")",
            ids.toArray());
    if (rows.size() != ids.size()) throw new BusinessException(400, "菜单不存在");
    var first = rows.getFirst();
    if (rows.stream()
        .anyMatch(
            r ->
                !Objects.equals(r.get("parent_id"), first.get("parent_id"))
                    || !Objects.equals(r.get("client"), first.get("client"))))
      throw new BusinessException(400, "仅可对同级菜单排序");
    for (int i = 0; i < ids.size(); i++)
      db.update("UPDATE menu SET sort_order=? WHERE id=?", i, ids.get(i));
    changed("menu.ordered", ids.getFirst());
  }

  private void validate(Edit b) {
    if (b.parentId() != null
        && Boolean.TRUE.equals(
            db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM menu WHERE id=? AND kind='action')",
                Boolean.class,
                b.parentId()))) throw new BusinessException(400, "按钮只能作为叶子节点");
    if ("page".equals(b.kind())
        && !Boolean.TRUE.equals(
            db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM tenant_route WHERE code=?)",
                Boolean.class,
                b.routePath()))) throw new BusinessException(400, "页面路由尚未实现");
    if (!"directory".equals(b.kind())
        && !Boolean.TRUE.equals(
            db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM permission WHERE code=? AND implemented)",
                Boolean.class,
                b.permissionCode()))) throw new BusinessException(400, "操作权限尚未实现");
  }

  private void exists(long id) {
    if (!Boolean.TRUE.equals(
        db.queryForObject("SELECT EXISTS(SELECT 1 FROM menu WHERE id=?)", Boolean.class, id)))
      throw new BusinessException(404, "菜单不存在");
  }

  private void changed(String action, long id) {
    s.audit(s.auth.context().tenantId(), action, "menu=" + id);
    s.events.changed();
  }
}
