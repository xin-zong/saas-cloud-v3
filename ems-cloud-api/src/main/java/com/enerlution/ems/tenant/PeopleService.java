package com.enerlution.ems.tenant;

import com.enerlution.ems.auth.SessionTokens;
import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PeopleService {
  private final TenantSupport s;
  private final ActivationService activation;
  private final MailDeliveryService mail;
  private final SessionTokens sessions;
  private final BCryptPasswordEncoder encoder;

  public PeopleService(
      TenantSupport s,
      ActivationService activation,
      MailDeliveryService mail,
      SessionTokens sessions,
      BCryptPasswordEncoder encoder) {
    this.s = s;
    this.activation = activation;
    this.mail = mail;
    this.sessions = sessions;
    this.encoder = encoder;
  }

  public record Invite(
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(max = 120) String name,
      @Size(max = 2000) String remarks,
      @Pattern(regexp = "en|zh-CN") String language) {}

  public record Edit(@NotBlank @Size(max = 120) String name, @Size(max = 2000) String remarks) {}

  private long own(String permission) {
    s.auth.requirePermission(permission);
    return s.auth.context().tenantId();
  }

  public Map<String, Object> list(String query, String status, String role, int limit, int offset) {
    long tenant = own("company.people.read");
    List<Object> args = new ArrayList<>(List.of(tenant));
    String where = " WHERE u.tenant_id=? AND u.status<>'deleted'";
    if (query != null && !query.isBlank()) {
      where += " AND (u.account ILIKE ? OR u.display_name ILIKE ?)";
      args.add("%" + query.trim() + "%");
      args.add("%" + query.trim() + "%");
    }
    if (status != null && !status.isBlank()) {
      if (!Set.of("invited", "active", "disabled").contains(status))
        throw new BusinessException(400, "员工状态无效");
      where += " AND u.status=?";
      args.add(status);
    }
    if (role != null && !role.isBlank()) {
      if ("administrator".equals(role))
        where += " AND EXISTS(SELECT 1 FROM tenant_administrator a WHERE a.user_id=u.id)";
      else {
        where +=
            " AND EXISTS(SELECT 1 FROM member_grant g LEFT JOIN app_role r ON r.id=g.role_id LEFT JOIN role_template t ON t.id=g.template_id WHERE g.user_id=u.id AND coalesce(r.name,t.name)=?)";
        args.add(role);
      }
    }
    Long total =
        s.db.queryForObject("SELECT count(*) FROM app_user u" + where, Long.class, args.toArray());
    args.add(Math.min(100, Math.max(1, limit)));
    args.add(Math.max(0, offset));
    var rows =
        s.db.queryForList(
            "SELECT u.id,u.account,u.display_name,u.status,u.remarks,u.created_at,u.updated_at,EXISTS(SELECT 1 FROM tenant_administrator a WHERE a.user_id=u.id) administrator FROM app_user u"
                + where
                + " ORDER BY u.id LIMIT ? OFFSET ?",
            args.toArray());
    for (var row : rows) {
      long id = ((Number) row.get("id")).longValue();
      row.put(
          "roles",
          s.db.queryForList(
              "SELECT g.id,coalesce(r.name,t.name) name,CASE WHEN g.template_id IS NULL THEN 'custom' ELSE 'template' END source,g.valid_from,g.valid_until FROM member_grant g LEFT JOIN app_role r ON r.id=g.role_id LEFT JOIN role_template t ON t.id=g.template_id WHERE g.user_id=? ORDER BY g.id",
              id));
      row.put(
          "managedStations",
          s.db.queryForList(
              "SELECT id,name FROM station WHERE manager_id=? AND tenant_id=?", id, tenant));
    }
    return Map.of("items", rows, "total", total);
  }

  public List<String> roleOptions() {
    long tenant = own("company.people.read");
    return s.db.queryForList(
        "SELECT name FROM app_role WHERE tenant_id=? UNION SELECT rt.name FROM tenant_package tp JOIN permission_package_template pt ON pt.package_id=tp.package_id JOIN role_template rt ON rt.id=pt.template_id WHERE tp.tenant_id=? ORDER BY name",
        String.class,
        tenant,
        tenant);
  }

  public Map<String, Object> detail(long id) {
    long tenant = own("company.people.read");
    var row = find(id, tenant);
    row.put(
        "managedStations",
        s.db.queryForList(
            "SELECT id,name FROM station WHERE manager_id=? AND tenant_id=?", id, tenant));
    row.put(
        "mailStatus",
        s.db.queryForList(
            "SELECT status,attempts,last_error,sent_at FROM mail_delivery WHERE event_key LIKE ? ORDER BY id DESC LIMIT 1",
            "activation:" + id + ":%"));
    return row;
  }

  @Transactional
  public Map<String, Object> invite(Invite b) {
    long tenant = own("company.people.manage");
    s.lock();
    mail.requireAvailable();
    String email = EmailChallengeService.normalize(b.email());
    if (Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_user WHERE lower(btrim(account))=?)",
            Boolean.class,
            email))) throw new BusinessException(409, "邮箱已属于一个账号，不能重复邀请或跨企业添加");
    Long id =
        s.db.queryForObject(
            "INSERT INTO app_user(account,display_name,password_hash,tenant_id,status,remarks,created_at,updated_at) VALUES(?,?,?,?,'invited',?,now(),now()) RETURNING id",
            Long.class,
            email,
            b.name().trim(),
            encoder.encode(SecureTokens.create()),
            tenant,
            b.remarks());
    send(id, email, b.language());
    s.audit(tenant, "member.invited", "user=" + id);
    s.events.changed();
    return Map.of("id", id, "status", "invited", "mailStatus", "pending");
  }

  @Transactional
  public void edit(long id, Edit b) {
    long tenant = own("company.people.manage");
    s.lock();
    find(id, tenant);
    s.db.update(
        "UPDATE app_user SET display_name=?,remarks=?,updated_at=now() WHERE id=?",
        b.name().trim(),
        b.remarks(),
        id);
    s.audit(tenant, "member.updated", "user=" + id);
    s.events.changed();
  }

  @Transactional
  public void reinvite(long id, String language) {
    long tenant = own("company.people.manage");
    s.lock();
    var row = find(id, tenant);
    if (!"invited".equals(row.get("status"))) throw new BusinessException(409, "只可重发未激活账号的邀请");
    mail.requireAvailable();
    send(id, (String) row.get("account"), language);
    s.audit(tenant, "member.reinvited", "user=" + id);
  }

  private void send(long id, String email, String language) {
    mail.cancelActivationMails(id);
    String token = activation.issue(id);
    mail.enqueue(
        "activation:" + id + ":" + UUID.randomUUID(),
        email,
        language,
        "activation",
        Map.of("url", mail.activationUrl(token)));
  }

  public List<Map<String, Object>> transfers(long id) {
    long tenant = own("company.people.manage");
    find(id, tenant);
    var sites =
        s.db.queryForList(
            "SELECT id,name FROM station WHERE manager_id=? AND tenant_id=?", id, tenant);
    for (var site : sites) {
      long station = ((Number) site.get("id")).longValue();
      site.put(
          "candidates",
          s.db.queryForList(
              "SELECT DISTINCT u.id,u.display_name,u.account FROM app_user u JOIN saas_effective_station_permission p ON p.user_id=u.id WHERE u.tenant_id=? AND u.status='active' AND u.id<>? AND p.station_id=? AND p.permission_code='asset.edit' AND p.client=? ORDER BY u.id",
              tenant,
              id,
              station,
              s.auth.client()));
    }
    return sites;
  }

  @Transactional
  public void status(long id, String status, Long replacement) {
    if (!Set.of("active", "disabled").contains(status)) throw new BusinessException(400, "员工状态无效");
    change(id, status, replacement);
  }

  @Transactional
  public void delete(long id, Long replacement) {
    change(id, "deleted", replacement);
  }

  private void change(long id, String desired, Long replacement) {
    long tenant = own("company.people.manage");
    s.lock();
    var row = find(id, tenant);
    if (Boolean.TRUE.equals(row.get("administrator")))
      throw new BusinessException(409, "受保护管理员不能禁用或删除");
    if ("active".equals(desired) && "invited".equals(row.get("status")))
      throw new BusinessException(409, "账号必须通过激活链接自行设置密码");
    long actor = s.auth.userId();
    if (!"active".equals(desired)) transfer(id, tenant, replacement);
    // An invitation paused before activation returns to invited, never bypassing password setup.
    String next = desired;
    if ("active".equals(desired)
        && Boolean.TRUE.equals(
            s.db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM account_activation WHERE user_id=? AND consumed_at IS NULL) AND NOT EXISTS(SELECT 1 FROM account_activation WHERE user_id=? AND consumed_at IS NOT NULL)",
                Boolean.class,
                id,
                id))) next = "invited";
    if ("deleted".equals(desired)) {
      s.db.update("DELETE FROM member_grant WHERE user_id=?", id);
      s.db.update(
          "UPDATE account_activation SET revoked_at=now() WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",
          id);
      mail.cancelActivationMails(id);
    }
    s.db.update("UPDATE app_user SET status=?,updated_at=now() WHERE id=?", next, id);
    s.db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?)",
        actor,
        tenant,
        "member." + desired,
        "user=" + id);
    sessions.revokeAll(id);
    s.events.changed();
  }

  private void transfer(long user, long tenant, Long replacement) {
    var sites =
        s.db.queryForList(
            "SELECT id FROM station WHERE manager_id=? AND tenant_id=? FOR UPDATE",
            Long.class,
            user,
            tenant);
    if (sites.isEmpty()) return;
    long target =
        replacement == null
            ? s.db.queryForObject(
                "SELECT user_id FROM tenant_administrator WHERE tenant_id=?", Long.class, tenant)
            : replacement;
    if (target == user
        || !Boolean.TRUE.equals(
            s.db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM app_user WHERE id=? AND tenant_id=? AND status='active')",
                Boolean.class,
                target,
                tenant))) throw new BusinessException(400, "请选择本企业已激活的接收人");
    boolean protectedTarget =
        Boolean.TRUE.equals(
            s.db.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM tenant_administrator WHERE tenant_id=? AND user_id=?)",
                Boolean.class,
                tenant,
                target));
    for (long site : sites)
      if (!protectedTarget && !s.auth.hasStationPermission(target, site, "asset.edit"))
        throw new BusinessException(403, "接收人缺少负责站点的管理权限");
    s.db.update(
        "UPDATE station SET manager_id=? WHERE manager_id=? AND tenant_id=?", target, user, tenant);
  }

  private Map<String, Object> find(long id, long tenant) {
    var rows =
        s.db.queryForList(
            "SELECT u.id,u.account,u.display_name,u.status,u.remarks,u.created_at,u.updated_at,EXISTS(SELECT 1 FROM tenant_administrator a WHERE a.user_id=u.id) administrator FROM app_user u WHERE u.id=? AND u.tenant_id=? AND u.status<>'deleted'",
            id,
            tenant);
    if (rows.isEmpty()) throw new BusinessException(404, "员工不存在");
    return rows.getFirst();
  }
}
