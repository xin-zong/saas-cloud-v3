package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantGrantService {
  private final TenantSupport s;
  private final DelegationPolicy policy;

  public TenantGrantService(TenantSupport s, DelegationPolicy policy) {
    this.s = s;
    this.policy = policy;
  }

  public record Grant(
      @Min(1) long userId,
      Long roleId,
      Long templateId,
      @NotNull @Size(max = 200) List<@Min(1) Long> stationIds,
      OffsetDateTime validFrom,
      OffsetDateTime validUntil) {}

  public List<Map<String, Object>> list(long user) {
    long tenant = own();
    requireUser(user, tenant);
    var rows =
        s.db.queryForList(
            "SELECT g.id,g.user_id,g.role_id,g.template_id,g.valid_from,g.valid_until,g.granted_by,coalesce(r.name,t.name) role_name,CASE WHEN g.template_id IS NULL THEN 'custom' ELSE 'template' END source FROM member_grant g LEFT JOIN app_role r ON r.id=g.role_id LEFT JOIN role_template t ON t.id=g.template_id WHERE g.user_id=? ORDER BY g.id",
            user);
    for (var row : rows)
      row.put(
          "stationIds",
          s.db.queryForList(
              "SELECT station_id FROM member_grant_station WHERE grant_id=? ORDER BY station_id",
              Long.class,
              row.get("id")));
    return rows;
  }

  public Map<String, Object> options() {
    long tenant = own();
    var roles =
        s.db.queryForList(
            "SELECT id,name,'custom' source FROM app_role WHERE tenant_id=? AND enabled ORDER BY id",
            tenant);
    if (s.auth.context().kind().equals("enterprise"))
      roles.addAll(
          s.db.queryForList(
              "SELECT DISTINCT r.id,r.name,'template' source FROM role_template r JOIN permission_package_template pt ON pt.template_id=r.id JOIN permission_package p ON p.id=pt.package_id AND p.enabled JOIN tenant_package tp ON tp.package_id=p.id WHERE tp.tenant_id=? AND r.enabled ORDER BY r.id",
              tenant));
    var sites =
        s.db.queryForList(
            "SELECT DISTINCT s.id,s.name,s.code FROM station s JOIN saas_effective_station_permission p ON p.station_id=s.id WHERE p.user_id=? AND p.client=? AND s.tenant_id=? ORDER BY s.id",
            s.auth.userId(),
            s.auth.client(),
            tenant);
    return Map.of("roles", roles, "stations", sites);
  }

  public Map<String, Object> members(String query, String status, int limit, int offset) {
    long tenant = own();
    String search = query == null ? "" : "%" + query.trim() + "%";
    if (status != null
        && !status.isBlank()
        && !Set.of("active", "invited", "disabled").contains(status))
      throw new BusinessException(400, "员工状态无效");
    String where =
        " WHERE u.tenant_id=? AND u.status<>'deleted' AND (?='' OR u.account ILIKE ? OR u.display_name ILIKE ?) AND (?='' OR u.status=?)";
    Object[] args = {
      tenant, search, search, search, status == null ? "" : status, status == null ? "" : status
    };
    Long total = s.db.queryForObject("SELECT count(*) FROM app_user u" + where, Long.class, args);
    var list = new ArrayList<Object>(Arrays.asList(args));
    list.add(Math.max(1, Math.min(100, limit)));
    list.add(Math.max(0, offset));
    var rows =
        s.db.queryForList(
            "SELECT u.id,u.account,u.display_name,u.status,EXISTS(SELECT 1 FROM tenant_administrator a WHERE a.user_id=u.id) administrator FROM app_user u"
                + where
                + " ORDER BY u.id LIMIT ? OFFSET ?",
            list.toArray());
    return Map.of("items", rows, "total", total);
  }

  @Transactional
  public long create(Grant b) {
    long tenant = own();
    s.lock();
    var from =
        b.validFrom() == null
            ? s.db.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class)
            : b.validFrom();
    var sites = TenantSupport.ids(b.stationIds(), false);
    policy.assignment(tenant, b.userId(), b.roleId(), b.templateId(), sites, from, b.validUntil());
    Long id =
        s.db.queryForObject(
            "INSERT INTO member_grant(user_id,role_id,template_id,valid_from,valid_until,granted_by) VALUES(?,?,?,?,?,?) RETURNING id",
            Long.class,
            b.userId(),
            b.roleId(),
            b.templateId(),
            from,
            b.validUntil(),
            s.auth.userId());
    for (long site : sites) s.db.update("INSERT INTO member_grant_station VALUES(?,?)", id, site);
    s.audit(tenant, "member.grant.created", "grant=" + id);
    s.events.changed();
    return id;
  }

  @Transactional
  public void edit(long id, Grant b) {
    long tenant = own();
    s.lock();
    var current = find(id, tenant);
    if (((Number) current.get("user_id")).longValue() != b.userId())
      throw new BusinessException(400, "不能修改授权所属员工");
    var from =
        b.validFrom() == null
            ? s.db.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class)
            : b.validFrom();
    var sites = TenantSupport.ids(b.stationIds(), false);
    policy.assignment(tenant, b.userId(), b.roleId(), b.templateId(), sites, from, b.validUntil());
    s.db.update("DELETE FROM member_grant_station WHERE grant_id=?", id);
    s.db.update(
        "UPDATE member_grant SET role_id=?,template_id=?,valid_from=?,valid_until=? WHERE id=?",
        b.roleId(),
        b.templateId(),
        from,
        b.validUntil(),
        id);
    for (long site : sites) s.db.update("INSERT INTO member_grant_station VALUES(?,?)", id, site);
    s.audit(tenant, "member.grant.updated", "grant=" + id);
    s.events.changed();
  }

  @Transactional
  public void revoke(long id) {
    long tenant = own();
    s.lock();
    find(id, tenant);
    s.db.update("DELETE FROM member_grant WHERE id=?", id);
    s.audit(tenant, "member.grant.revoked", "grant=" + id);
    s.events.changed();
  }

  private long own() {
    s.auth.requirePermission("company.grant.manage");
    return s.auth.context().tenantId();
  }

  private void requireUser(long user, long tenant) {
    if (!Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_user WHERE id=? AND tenant_id=? AND status<>'deleted')",
            Boolean.class,
            user,
            tenant))) throw new BusinessException(404, "员工不存在");
  }

  private Map<String, Object> find(long id, long tenant) {
    var rows =
        s.db.queryForList(
            "SELECT g.user_id FROM member_grant g JOIN app_user u ON u.id=g.user_id WHERE g.id=? AND u.tenant_id=? FOR UPDATE OF g",
            id,
            tenant);
    if (rows.isEmpty()) throw new BusinessException(404, "授权不存在");
    return rows.getFirst();
  }
}
