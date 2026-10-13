package com.enerlution.ems.tenant;

import com.enerlution.ems.auth.TenantAuthorization;
import com.enerlution.ems.common.BusinessException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DelegationPolicy {
  private final JdbcTemplate db;
  private final TenantAuthorization auth;

  public DelegationPolicy(JdbcTemplate db, TenantAuthorization auth) {
    this.db = db;
    this.auth = auth;
  }

  public boolean inPackage(long tenant, String code, String client) {
    var actor = auth.context();
    if (actor.tenantId() != tenant) throw new BusinessException(403, "Tenant permission denied");
    String sql =
        actor.kind().equals("enterprise")
            ? "SELECT EXISTS(SELECT 1 FROM saas_tenant_menu WHERE tenant_id=? AND permission_code=? AND client=?)"
            : "SELECT EXISTS(SELECT 1 FROM saas_enabled_menu WHERE side IN ('platform','both') AND permission_code=? AND client=?)";
    return Boolean.TRUE.equals(
        actor.kind().equals("enterprise")
            ? db.queryForObject(sql, Boolean.class, tenant, code, client)
            : db.queryForObject(sql, Boolean.class, code, client));
  }

  public void globalTemplate(Long template, List<RoleTemplateService.Selection> desired) {
    var actor = auth.context();
    if (!actor.kind().equals("platform"))
      throw new BusinessException(403, "Platform permission required");
    for (var p : desired) {
      boolean enterprise =
          Boolean.TRUE.equals(
              db.queryForObject(
                  "SELECT EXISTS(SELECT 1 FROM saas_enabled_menu m JOIN permission p ON p.code=m.permission_code AND p.implemented WHERE m.side IN ('enterprise','both') AND m.permission_code=? AND m.client=?)",
                  Boolean.class,
                  p.code(),
                  p.client()));
      boolean preserved =
          template != null
              && Boolean.TRUE.equals(
                  db.queryForObject(
                      "SELECT EXISTS(SELECT 1 FROM role_template_permission WHERE template_id=? AND permission_code=? AND client=?)",
                      Boolean.class,
                      template,
                      p.code(),
                      p.client()));
      if (!enterprise && !preserved) throw new BusinessException(400, "预制角色只能配置已实现的企业端权限");
      if (!actor.administrator()
          && !Boolean.TRUE.equals(
              db.queryForObject(
                  "SELECT EXISTS(SELECT 1 FROM saas_member_capability WHERE user_id=? AND permission_code=? AND client=?)",
                  Boolean.class,
                  actor.actorId(),
                  p.code(),
                  p.client()))) throw new BusinessException(403, "预制角色权限超出自身可委派范围");
    }
    if (template == null || actor.administrator()) return;
    for (var grant :
        db.queryForList(
            "SELECT id,valid_from,valid_until FROM member_grant WHERE template_id=? AND (valid_until IS NULL OR valid_until>now())",
            template)) {
      OffsetDateTime from = offset(grant.get("valid_from")),
          now = OffsetDateTime.now(ZoneOffset.UTC);
      if (from.isBefore(now)) from = now;
      OffsetDateTime until = offset(grant.get("valid_until"));
      var sites =
          db.queryForList(
              "SELECT station_id FROM member_grant_station WHERE grant_id=?",
              Long.class,
              grant.get("id"));
      for (var p : desired) {
        extent(p, sites, from, until);
        if ("station"
            .equals(
                db.queryForObject(
                    "SELECT resource_scope FROM permission WHERE code=?",
                    String.class,
                    p.code()))) {
          extent(
              new RoleTemplateService.Selection("tenant.data.read", p.client()),
              List.of(),
              from,
              until);
          if ("write"
              .equals(
                  db.queryForObject(
                      "SELECT operation_kind FROM permission WHERE code=?",
                      String.class,
                      p.code())))
            extent(
                new RoleTemplateService.Selection("tenant.data.write", p.client()),
                List.of(),
                from,
                until);
        }
      }
    }
  }

  public void checkSelections(
      long tenant, List<RoleTemplateService.Selection> desired, Long roleId) {
    var actor = auth.context();
    if (actor.tenantId() != tenant) throw new BusinessException(403, "Tenant permission denied");
    for (var selection : desired) {
      if (!Boolean.TRUE.equals(
              db.queryForObject(
                  "SELECT EXISTS(SELECT 1 FROM permission WHERE code=? AND implemented)",
                  Boolean.class,
                  selection.code()))
          || !inPackage(tenant, selection.code(), selection.client()))
        throw new BusinessException(400, "权限不在当前套餐或菜单范围内");
      if (!actor.administrator()
          && !Boolean.TRUE.equals(
              db.queryForObject(
                  "SELECT EXISTS(SELECT 1 FROM saas_member_capability WHERE user_id=? AND permission_code=? AND client=?)",
                  Boolean.class,
                  actor.actorId(),
                  selection.code(),
                  selection.client()))) throw new BusinessException(403, "不能配置超出自身可委派范围的权限");
    }
    if (roleId != null && !actor.administrator())
      for (var grant :
          db.queryForList(
              "SELECT id,valid_from,valid_until FROM member_grant WHERE role_id=? AND (valid_until IS NULL OR valid_until>now())",
              roleId)) {
        var sites =
            db.queryForList(
                "SELECT station_id FROM member_grant_station WHERE grant_id=?",
                Long.class,
                grant.get("id"));
        OffsetDateTime starts = offset(grant.get("valid_from")),
            now = OffsetDateTime.now(java.time.ZoneOffset.UTC);
        if (starts.isBefore(now)) starts = now;
        OffsetDateTime ends = offset(grant.get("valid_until"));
        for (var selection : desired) extent(selection, sites, starts, ends);
      }
  }

  public void assignment(
      long tenant,
      long user,
      Long role,
      Long template,
      List<Long> stations,
      OffsetDateTime from,
      OffsetDateTime until) {
    var actor = auth.context();
    if (actor.tenantId() != tenant) throw new BusinessException(403, "Tenant permission denied");
    if ((role == null) == (template == null)) throw new BusinessException(400, "请选择一个角色或预制角色");
    if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_user WHERE id=? AND tenant_id=? AND status<>'deleted')",
            Boolean.class,
            user,
            tenant))) throw new BusinessException(404, "员工不存在");
    if (Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM tenant_administrator WHERE user_id=?)",
            Boolean.class,
            user))) throw new BusinessException(400, "系统管理员身份不可通过普通角色授权修改");
    if (until != null && !until.isAfter(from)) throw new BusinessException(400, "授权结束时间必须晚于开始时间");
    if (!stations.isEmpty()
        && !Objects.equals(
            db.queryForObject(
                "SELECT count(*) FROM station WHERE tenant_id=? AND id IN ("
                    + TenantSupport.placeholders(stations.size())
                    + ")",
                Long.class,
                concat(List.of(tenant), stations).toArray()),
            (long) stations.size())) throw new BusinessException(403, "站点不属于本企业");
    List<Map<String, Object>> permissions;
    if (role != null) {
      if (!Boolean.TRUE.equals(
          db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM app_role WHERE id=? AND tenant_id=? AND enabled)",
              Boolean.class,
              role,
              tenant))) throw new BusinessException(400, "角色不可分配");
      permissions =
          db.queryForList(
              "SELECT permission_code code,client FROM role_permission WHERE role_id=?", role);
    } else {
      if (!actor.kind().equals("enterprise")
          || !Boolean.TRUE.equals(
              db.queryForObject(
                  "SELECT EXISTS(SELECT 1 FROM tenant_package tp JOIN permission_package p ON p.id=tp.package_id AND p.enabled JOIN permission_package_template pt ON pt.package_id=p.id JOIN role_template r ON r.id=pt.template_id AND r.enabled WHERE tp.tenant_id=? AND r.id=?)",
                  Boolean.class,
                  tenant,
                  template))) throw new BusinessException(400, "预制角色不在当前套餐内");
      permissions =
          db.queryForList(
              "SELECT permission_code code,client FROM role_template_permission WHERE template_id=?",
              template);
    }
    if (!actor.administrator())
      for (var row : permissions) {
        var selection =
            new RoleTemplateService.Selection((String) row.get("code"), (String) row.get("client"));
        if (inPackage(tenant, selection.code(), selection.client()))
          extent(selection, stations, from, until);
      }
  }

  private void extent(
      RoleTemplateService.Selection p,
      List<Long> sites,
      OffsetDateTime from,
      OffsetDateTime until) {
    var actor = auth.context();
    String scope =
        db.queryForObject(
            "SELECT resource_scope FROM permission WHERE code=?", String.class, p.code());
    String condition =
        " c.user_id=? AND c.permission_code=? AND c.client=? AND g.valid_from<=? AND (g.valid_until IS NULL OR (?::timestamptz IS NOT NULL AND g.valid_until>=?::timestamptz))";
    var arguments =
        new ArrayList<Object>(
            Arrays.asList(actor.actorId(), p.code(), p.client(), from, until, until));
    if (actor.kind().equals("enterprise") && "station".equals(scope) && !sites.isEmpty()) {
      var all = new ArrayList<Object>(sites);
      all.addAll(arguments);
      Long denied =
          db.queryForObject(
              "SELECT count(*) FROM station target WHERE target.id IN ("
                  + TenantSupport.placeholders(sites.size())
                  + ") AND NOT EXISTS(SELECT 1 FROM saas_member_capability c JOIN member_grant g ON g.id=c.grant_id JOIN member_grant_station gs ON gs.grant_id=g.id WHERE gs.station_id=target.id AND"
                  + condition
                  + ")",
              Long.class,
              all.toArray());
      if (denied == null || denied > 0) throw new BusinessException(403, "站点或授权期限超出可委派范围");
    } else if (!Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM saas_member_capability c JOIN member_grant g ON g.id=c.grant_id WHERE"
                + condition
                + ")",
            Boolean.class,
            arguments.toArray()))) throw new BusinessException(403, "角色或授权期限超出可委派范围");
  }

  private static OffsetDateTime offset(Object value) {
    return value == null
        ? null
        : value instanceof OffsetDateTime date
            ? date
            : ((java.sql.Timestamp) value).toInstant().atOffset(java.time.ZoneOffset.UTC);
  }

  private static List<Object> concat(List<?> a, List<?> b) {
    var out = new ArrayList<Object>(a);
    out.addAll(b);
    return out;
  }
}
