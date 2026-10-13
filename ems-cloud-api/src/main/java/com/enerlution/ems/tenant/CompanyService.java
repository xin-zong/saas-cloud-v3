package com.enerlution.ems.tenant;

import com.enerlution.ems.auth.SessionTokens;
import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CompanyService {
  private final TenantSupport s;
  private final SecretCodec codec;
  private final SessionTokens sessions;
  private final ActivationService activation;
  private final MailDeliveryService mail;

  public CompanyService(
      TenantSupport s,
      SecretCodec codec,
      SessionTokens sessions,
      ActivationService activation,
      MailDeliveryService mail) {
    this.s = s;
    this.codec = codec;
    this.sessions = sessions;
    this.activation = activation;
    this.mail = mail;
  }

  @Transactional
  public void reinviteAdministrator(long id, String language) {
    s.platform("company.manage");
    s.lock();
    require(id);
    mail.requireAvailable();
    var row =
        s.db.queryForMap(
            "SELECT u.id,u.account,u.status,t.enabled FROM tenant_administrator a JOIN app_user u ON u.id=a.user_id JOIN tenant t ON t.id=a.tenant_id WHERE a.tenant_id=? FOR UPDATE OF u",
            id);
    if (!Boolean.TRUE.equals(row.get("enabled"))) throw new BusinessException(409, "请先启用企业");
    if (!"invited".equals(row.get("status")))
      throw new BusinessException(409, "只可重发未激活管理员的邀请，不能重置已激活密码");
    long user = ((Number) row.get("id")).longValue();
    mail.cancelActivationMails(user);
    String token = activation.issue(user);
    mail.enqueue(
        "activation:" + user + ":" + UUID.randomUUID(),
        (String) row.get("account"),
        language,
        "activation",
        Map.of("url", mail.activationUrl(token)));
    s.audit(id, "company.administrator.reinvited", "user=" + user);
  }

  public Map<String, Object> own() {
    return detail(s.ownEnterprise("company.profile.read"), false);
  }

  public Map<String, Object> options() {
    if (!s.auth.context().kind().equals("platform")
        || !(s.auth.hasPermission("company.read")
            || s.auth.hasPermission("company.application.read")
            || s.auth.hasPermission("company.application.review")))
      throw new BusinessException(403, "Permission denied");
    return Map.of(
        "packages",
        s.db.queryForList("SELECT id,name,enabled FROM permission_package ORDER BY id"),
        "tags",
        s.db.queryForList("SELECT * FROM company_tag ORDER BY id"));
  }

  public Map<String, Object> list(
      String query, String type, Boolean enabled, Long tag, String address, int limit, int offset) {
    s.platform("company.read");
    String where = " WHERE t.kind='enterprise'";
    var args = new ArrayList<Object>();
    if (query != null && !query.isBlank()) {
      where +=
          " AND (c.name ILIKE ? OR u.account ILIKE ? OR c.contact_name ILIKE ? OR t.id::text=?)";
      for (int i = 0; i < 3; i++) args.add("%" + query.trim() + "%");
      args.add(query.trim().replaceFirst("^ENT-0*", ""));
    }
    if (address != null && !address.isBlank()) {
      where += " AND concat_ws(' ',c.country,c.province,c.city,c.address) ILIKE ?";
      args.add("%" + address.trim() + "%");
    }
    if (type != null && !type.isBlank()) {
      where +=
          " AND EXISTS(SELECT 1 FROM tenant_company_type x WHERE x.tenant_id=t.id AND x.type_code=?)";
      args.add(type);
    }
    if (enabled != null) {
      where += " AND t.enabled=?";
      args.add(enabled);
    }
    if (tag != null) {
      where +=
          " AND EXISTS(SELECT 1 FROM tenant_company_tag x WHERE x.tenant_id=t.id AND x.tag_id=?)";
      args.add(tag);
    }
    String join =
        " FROM tenant t JOIN company_profile c ON c.tenant_id=t.id JOIN tenant_administrator a ON a.tenant_id=t.id JOIN app_user u ON u.id=a.user_id";
    Long total = s.db.queryForObject("SELECT count(*)" + join + where, Long.class, args.toArray());
    args.add(Math.min(100, Math.max(1, limit)));
    args.add(Math.max(0, offset));
    var rows =
        s.db.queryForList(
            "SELECT t.id,t.enabled,t.created_at,c.updated_at,c.name,c.country,c.province,c.city,c.address,c.contact_name,c.phone,u.account email"
                + join
                + where
                + " ORDER BY t.id LIMIT ? OFFSET ?",
            args.toArray());
    for (var row : rows) associations(row, ((Number) row.get("id")).longValue());
    return Map.of("items", rows, "total", total);
  }

  public Map<String, Object> platformDetail(long id) {
    s.platform("company.read");
    return detail(id, true);
  }

  public List<Map<String, Object>> stations(long id, String query) {
    s.platform("company.read");
    require(id);
    s.auth.requirePermission("asset.read");
    return s.db.queryForList(
        "SELECT st.id,st.code,st.name,st.address,st.capacity_kwh,u.display_name manager FROM station st LEFT JOIN app_user u ON u.id=st.manager_id WHERE st.tenant_id=? AND st.name ILIKE ? AND EXISTS(SELECT 1 FROM "
            + TenantQueryScope.stationPermissions(s.auth.client())
            + " cap WHERE cap.user_id=? AND cap.station_id=st.id AND cap.permission_code='asset.read') ORDER BY st.id",
        id,
        "%" + (query == null ? "" : query.trim()) + "%",
        s.auth.userId());
  }

  public List<Map<String, Object>> employees(long id) {
    s.platform("company.read");
    require(id);
    return s.db.queryForList(
        "SELECT id,display_name,account,status,remarks FROM app_user WHERE tenant_id=? AND status<>'deleted' ORDER BY id",
        id);
  }

  private Map<String, Object> detail(long id, boolean platform) {
    var rows =
        s.db.queryForList(
            "SELECT c.*,t.enabled,t.created_at,u.account email,u.status administrator_status FROM company_profile c JOIN tenant t ON t.id=c.tenant_id JOIN tenant_administrator a ON a.tenant_id=t.id JOIN app_user u ON u.id=a.user_id WHERE t.id=?",
            id);
    if (rows.isEmpty()) throw new BusinessException(404, "企业不存在");
    var row = rows.getFirst();
    Object tax = row.remove("tax_id_ciphertext");
    row.put("taxId", tax == null ? "" : codec.decrypt(tax.toString()));
    associations(row, id);
    return row;
  }

  private void associations(Map<String, Object> row, long id) {
    row.put(
        "companyTypes",
        s.db.queryForList(
            "SELECT type_code FROM tenant_company_type WHERE tenant_id=? ORDER BY type_code",
            String.class,
            id));
    row.put(
        "businessScopes",
        s.db.queryForList(
            "SELECT scope_code FROM tenant_business_scope WHERE tenant_id=? ORDER BY scope_code",
            String.class,
            id));
    row.put(
        "packages",
        s.db.queryForList(
            "SELECT p.id,p.name,p.enabled FROM tenant_package tp JOIN permission_package p ON p.id=tp.package_id WHERE tp.tenant_id=? ORDER BY p.id",
            id));
    row.put(
        "tags",
        s.db.queryForList(
            "SELECT t.id,t.name FROM tenant_company_tag x JOIN company_tag t ON t.id=x.tag_id WHERE x.tenant_id=? ORDER BY t.id",
            id));
  }

  @Transactional
  public void editOwn(CompanyForm b) {
    long id = s.ownEnterprise("company.profile.manage");
    edit(id, b);
  }

  @Transactional
  public void editPlatform(long id, CompanyForm b) {
    s.platform("company.manage");
    edit(id, b);
  }

  private void edit(long id, CompanyForm b) {
    s.lock();
    require(id);
    var registered =
        s.db.queryForMap(
            "SELECT country,province,city,address FROM company_profile WHERE tenant_id=?", id);
    if (!Objects.equals(registered.get("country"), b.country())
        || !Objects.equals(registered.get("province"), b.province())
        || !Objects.equals(registered.get("city"), b.city())
        || !Objects.equals(registered.get("address"), b.address()))
      throw new BusinessException(400, "注册地址只读，请勿通过资料编辑修改");
    var types =
        new HashSet<>(
            s.db.queryForList(
                "SELECT type_code FROM tenant_company_type WHERE tenant_id=?", String.class, id));
    if (!types.equals(new HashSet<>(b.companyTypes())))
      throw new BusinessException(400, "企业类型请通过平台企业配置修改");
    s.db.update(
        "UPDATE company_profile SET name=?,system_scale=?,postcode=?,service_description=?,registration_no=?,tax_id_ciphertext=?,contact_name=?,phone=?,website=?,updated_at=now() WHERE tenant_id=?",
        b.name().trim(),
        b.systemScale(),
        b.postcode(),
        b.serviceDescription(),
        b.registrationNo(),
        b.taxId() == null ? null : codec.encrypt(b.taxId()),
        b.contactName(),
        b.phone(),
        b.website(),
        id);
    s.db.update("DELETE FROM tenant_business_scope WHERE tenant_id=?", id);
    for (String scope : new LinkedHashSet<>(b.businessScopes()))
      s.db.update("INSERT INTO tenant_business_scope VALUES(?,?)", id, scope);
    s.audit(id, "company.profile.updated", "tenant=" + id);
    s.events.changed();
  }

  @Transactional
  public void types(long id, List<String> types) {
    s.platform("company.manage");
    s.lock();
    require(id);
    var selected = new LinkedHashSet<>(types);
    if (selected.isEmpty()) throw new BusinessException(400, "请至少选择一种企业类型");
    s.db.update("DELETE FROM tenant_company_type WHERE tenant_id=?", id);
    for (String type : selected)
      s.db.update("INSERT INTO tenant_company_type VALUES(?,?)", id, type);
    s.db.update("UPDATE company_profile SET updated_at=now() WHERE tenant_id=?", id);
    s.audit(id, "company.types.updated", "types=" + selected);
    s.events.changed();
  }

  @Transactional
  public void packages(long id, List<Long> selected, boolean confirmed) {
    s.platform("company.manage");
    s.lock();
    require(id);
    if (!confirmed) throw new BusinessException(409, "请确认权限包变更对企业所有员工的影响");
    var ids = TenantSupport.ids(selected, true);
    if (!Objects.equals(
        s.db.queryForObject(
            "SELECT count(*) FROM permission_package p WHERE (p.enabled OR EXISTS(SELECT 1 FROM tenant_package old WHERE old.tenant_id="
                + id
                + " AND old.package_id=p.id)) AND p.id IN ("
                + TenantSupport.placeholders(ids.size())
                + ")",
            Long.class,
            ids.toArray()),
        (long) ids.size())) throw new BusinessException(400, "只能选择启用权限包或保留企业已分配的停用包");
    for (long pack : ids)
      s.db.update("INSERT INTO tenant_package VALUES(?,?) ON CONFLICT DO NOTHING", id, pack);
    s.db.update(
        "DELETE FROM tenant_package WHERE tenant_id=? AND package_id NOT IN ("
            + TenantSupport.placeholders(ids.size())
            + ")",
        combine(id, ids));
    s.audit(id, "company.packages.updated", "packages=" + ids);
    s.events.changed();
  }

  @Transactional
  public void status(long id, boolean enabled, boolean confirmed) {
    s.platform("company.manage");
    s.lock();
    require(id);
    if (!confirmed) throw new BusinessException(409, "请确认企业状态变更对所有员工会话的影响");
    s.audit(id, "company.status", "enabled=" + enabled);
    s.db.update("UPDATE tenant SET enabled=? WHERE id=?", enabled, id);
    if (!enabled)
      for (long user :
          s.db.queryForList("SELECT id FROM app_user WHERE tenant_id=?", Long.class, id))
        sessions.revokeAll(user);
    s.events.changed();
  }

  @Transactional
  public void tags(long id, List<Long> tags) {
    s.platform("company.manage");
    s.lock();
    require(id);
    var ids = TenantSupport.ids(tags, false);
    s.db.update("DELETE FROM tenant_company_tag WHERE tenant_id=?", id);
    for (long tag : ids) s.db.update("INSERT INTO tenant_company_tag VALUES(?,?)", id, tag);
    s.audit(id, "company.tags.updated", "tags=" + ids);
  }

  public List<Map<String, Object>> tags() {
    s.platform("company.read");
    return s.db.queryForList("SELECT * FROM company_tag ORDER BY id");
  }

  @Transactional
  public long createTag(String name) {
    s.platform("company.manage");
    s.lock();
    return Objects.requireNonNull(
        s.db.queryForObject(
            "INSERT INTO company_tag(name) VALUES(?) RETURNING id", Long.class, name.trim()));
  }

  @Transactional
  public void editTag(long id, String name) {
    s.platform("company.manage");
    s.lock();
    if (s.db.update("UPDATE company_tag SET name=? WHERE id=?", name.trim(), id) != 1)
      throw new BusinessException(404, "标签不存在");
  }

  public Map<String, Object> tagImpact(long id) {
    s.platform("company.read");
    return Map.of(
        "companies",
        s.db.queryForObject(
            "SELECT count(*) FROM tenant_company_tag WHERE tag_id=?", Long.class, id),
        "applications",
        s.db.queryForObject(
            "SELECT count(*) FROM application_company_tag WHERE tag_id=?", Long.class, id));
  }

  @Transactional
  public void deleteTag(long id, boolean confirmed) {
    s.platform("company.manage");
    s.lock();
    if (!confirmed) throw new BusinessException(409, "删除标签将移除全部关联，请确认");
    s.db.update("DELETE FROM application_company_tag WHERE tag_id=?", id);
    s.db.update("DELETE FROM company_tag WHERE id=?", id);
    s.audit(s.auth.context().tenantId(), "company.tag.deleted", "tag=" + id);
  }

  private void require(long id) {
    if (!Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM company_profile WHERE tenant_id=?)", Boolean.class, id)))
      throw new BusinessException(404, "企业不存在");
  }

  private Object[] combine(long id, List<Long> selected) {
    var args = new ArrayList<Object>();
    args.add(id);
    args.addAll(selected);
    return args.toArray();
  }
}
