package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PermissionPackageService {
  private final JdbcTemplate db;
  private final TenantSupport s;

  public PermissionPackageService(JdbcTemplate db, TenantSupport s) {
    this.db = db;
    this.s = s;
  }

  public record Edit(
      @NotBlank @Size(max = 120) String name,
      @Size(max = 2000) String remarks,
      @NotEmpty @Size(max = 4) List<String> companyTypes,
      @NotEmpty @Size(max = 100) List<@Min(1) Long> menuIds,
      @Size(max = 100) List<@Min(1) Long> templateIds) {}

  public List<Map<String, Object>> list(String query, String type) {
    s.platform("package.manage");
    var rows =
        db.queryForList(
            "SELECT p.*,(SELECT count(*) FROM tenant_package tp WHERE tp.package_id=p.id) company_count FROM permission_package p WHERE (?='' OR p.name ILIKE ?) AND (?='' OR EXISTS(SELECT 1 FROM permission_package_company_type x WHERE x.package_id=p.id AND x.type_code=?)) ORDER BY p.id",
            query == null ? "" : query,
            "%" + (query == null ? "" : query) + "%",
            type == null ? "" : type,
            type == null ? "" : type);
    for (var row : rows) relations(row);
    return rows;
  }

  @Transactional
  public long create(Edit body) {
    s.platform("package.manage");
    s.lock();
    Long id =
        db.queryForObject(
            "INSERT INTO permission_package(name,remarks) VALUES(?,?) RETURNING id",
            Long.class,
            body.name().trim(),
            body.remarks());
    replace(id, body);
    changed("package.created", id);
    return id;
  }

  @Transactional
  public void edit(long id, Edit body) {
    s.platform("package.manage");
    s.lock();
    exists(id);
    db.update(
        "UPDATE permission_package SET name=?,remarks=?,updated_at=now() WHERE id=?",
        body.name().trim(),
        body.remarks(),
        id);
    replace(id, body);
    changed("package.updated", id);
  }

  @Transactional
  public void enabled(long id, boolean enabled, boolean confirmed) {
    s.platform("package.manage");
    if (!confirmed) throw new BusinessException(409, "请确认权限包变更对已分配企业的影响");
    s.lock();
    exists(id);
    db.update("UPDATE permission_package SET enabled=?,updated_at=now() WHERE id=?", enabled, id);
    changed("package.status", id);
  }

  public Map<String, Object> impact(long id) {
    s.platform("package.manage");
    exists(id);
    return Map.of(
        "referencingCompanies",
        db.queryForObject(
            "SELECT count(*) FROM tenant_package WHERE package_id=?", Long.class, id));
  }

  private void replace(long id, Edit b) {
    List<Long> menus = TenantSupport.ids(b.menuIds(), true),
        templates = TenantSupport.ids(b.templateIds(), false);
    if (!Objects.equals(
        db.queryForObject(
            "SELECT count(*) FROM menu WHERE parent_id IS NULL AND applicable_side IN ('enterprise','both') AND (enabled OR EXISTS(SELECT 1 FROM permission_package_menu old WHERE old.package_id="
                + id
                + " AND old.menu_id=menu.id)) AND id IN ("
                + TenantSupport.placeholders(menus.size())
                + ")",
            Long.class,
            menus.toArray()),
        (long) menus.size())) throw new BusinessException(400, "权限包只能选择已启用的企业端一级菜单");
    if (!templates.isEmpty()
        && !Objects.equals(
            db.queryForObject(
                "SELECT count(*) FROM role_template WHERE (enabled OR EXISTS(SELECT 1 FROM permission_package_template old WHERE old.package_id="
                    + id
                    + " AND old.template_id=role_template.id)) AND id IN ("
                    + TenantSupport.placeholders(templates.size())
                    + ")",
                Long.class,
                templates.toArray()),
            (long) templates.size())) throw new BusinessException(400, "预制角色不存在或未启用");
    db.update("DELETE FROM permission_package_menu WHERE package_id=?", id);
    db.update("DELETE FROM permission_package_template WHERE package_id=?", id);
    db.update("DELETE FROM permission_package_company_type WHERE package_id=?", id);
    for (long menu : menus) db.update("INSERT INTO permission_package_menu VALUES(?,?)", id, menu);
    for (long template : templates)
      db.update("INSERT INTO permission_package_template VALUES(?,?)", id, template);
    for (String type : new LinkedHashSet<>(b.companyTypes()))
      db.update("INSERT INTO permission_package_company_type VALUES(?,?)", id, type);
  }

  private void relations(Map<String, Object> row) {
    long id = ((Number) row.get("id")).longValue();
    row.put(
        "menuIds",
        db.queryForList(
            "SELECT menu_id FROM permission_package_menu WHERE package_id=? ORDER BY menu_id",
            Long.class,
            id));
    row.put(
        "templateIds",
        db.queryForList(
            "SELECT template_id FROM permission_package_template WHERE package_id=? ORDER BY template_id",
            Long.class,
            id));
    row.put(
        "companyTypes",
        db.queryForList(
            "SELECT type_code FROM permission_package_company_type WHERE package_id=? ORDER BY type_code",
            String.class,
            id));
  }

  private void exists(long id) {
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM permission_package WHERE id=?)", Boolean.class, id)))
      throw new BusinessException(404, "权限包不存在");
  }

  private void changed(String action, long id) {
    s.audit(s.auth.context().tenantId(), action, "package=" + id);
    s.events.changed();
  }
}
