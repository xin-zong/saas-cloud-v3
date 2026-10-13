package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoleTemplateService {
  private final JdbcTemplate db;
  private final TenantSupport s;

  public RoleTemplateService(JdbcTemplate db, TenantSupport s) {
    this.db = db;
    this.s = s;
  }

  public record Selection(
      @NotBlank String code, @NotBlank @Pattern(regexp = "web|app") String client) {}

  public record Edit(
      @NotBlank @Size(max = 120) String name,
      @NotNull @Size(max = 200) List<@jakarta.validation.Valid Selection> permissions) {}

  public List<Map<String, Object>> list() {
    s.platform("role.template.manage");
    var rows = db.queryForList("SELECT * FROM role_template ORDER BY id");
    for (var row : rows)
      row.put(
          "permissions",
          db.queryForList(
              "SELECT permission_code code,client FROM role_template_permission WHERE template_id=? ORDER BY client,permission_code",
              row.get("id")));
    return rows;
  }

  @Transactional
  public long create(Edit b) {
    s.platform("role.template.manage");
    s.lock();
    new DelegationPolicy(db, s.auth).globalTemplate(null, b.permissions());
    Long id =
        db.queryForObject(
            "INSERT INTO role_template(name) VALUES(?) RETURNING id", Long.class, b.name().trim());
    permissions(id, b.permissions());
    changed("role.template.created", id);
    return id;
  }

  @Transactional
  public void edit(long id, Edit b) {
    s.platform("role.template.manage");
    s.lock();
    exists(id);
    new DelegationPolicy(db, s.auth).globalTemplate(id, b.permissions());
    db.update("UPDATE role_template SET name=?,updated_at=now() WHERE id=?", b.name().trim(), id);
    permissions(id, b.permissions());
    changed("role.template.updated", id);
  }

  @Transactional
  public void enabled(long id, boolean enabled, boolean confirmed) {
    s.platform("role.template.manage");
    if (!confirmed) throw new BusinessException(409, "请确认预制角色变更对已有员工的影响");
    s.lock();
    exists(id);
    if (enabled)
      new DelegationPolicy(db, s.auth)
          .globalTemplate(
              id,
              db
                  .queryForList(
                      "SELECT permission_code,client FROM role_template_permission WHERE template_id=?",
                      id)
                  .stream()
                  .map(
                      r ->
                          new Selection(
                              (String) r.get("permission_code"), (String) r.get("client")))
                  .toList());
    db.update("UPDATE role_template SET enabled=?,updated_at=now() WHERE id=?", enabled, id);
    changed("role.template.status", id);
  }

  public Map<String, Object> impact(long id) {
    s.platform("role.template.manage");
    exists(id);
    return Map.of(
        "referencingMembers",
        db.queryForObject(
            "SELECT count(DISTINCT user_id) FROM member_grant WHERE template_id=?",
            Long.class,
            id));
  }

  private void permissions(long id, List<Selection> selections) {
    db.update("DELETE FROM role_template_permission WHERE template_id=?", id);
    for (var p : new LinkedHashSet<>(selections)) {
      if (!Boolean.TRUE.equals(
          db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM permission WHERE code=? AND implemented)",
              Boolean.class,
              p.code()))) throw new BusinessException(400, "权限尚未实现");
      db.update("INSERT INTO role_template_permission VALUES(?,?,?)", id, p.code(), p.client());
    }
  }

  private void exists(long id) {
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM role_template WHERE id=?)", Boolean.class, id)))
      throw new BusinessException(404, "预制角色不存在");
  }

  private void changed(String action, long id) {
    s.audit(s.auth.context().tenantId(), action, "template=" + id);
    s.events.changed();
  }
}
