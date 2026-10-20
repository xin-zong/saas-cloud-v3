package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CompanyApplicationService {
  private final JdbcTemplate db;
  private final TenantSupport s;
  private final EmailChallengeService email;
  private final ActivationService activation;
  private final MailDeliveryService mail;
  private final SecretCodec secrets;
  private final BCryptPasswordEncoder encoder;

  public CompanyApplicationService(
      JdbcTemplate db,
      TenantSupport s,
      EmailChallengeService email,
      ActivationService activation,
      MailDeliveryService mail,
      SecretCodec secrets,
      BCryptPasswordEncoder encoder) {
    this.db = db;
    this.s = s;
    this.email = email;
    this.activation = activation;
    this.mail = mail;
    this.secrets = secrets;
    this.encoder = encoder;
  }

  public record Approve(
      @NotEmpty @Size(max = 20) List<@Min(1) Long> packageIds,
      @Size(max = 4) List<String> companyTypes,
      @Size(max = 4) List<String> businessScopes,
      @Pattern(regexp = "lt100|100to1000|1000to10000|gt10000") String systemScale,
      @Size(max = 20) List<@Min(1) Long> tagIds) {}

  @Transactional
  public Map<String, Object> submit(
      CompanyForm f, String address, String context, String language) {
    address = email.requireContext(context, address);
    s.lock();
    address = email.requireContext(context, address);
    validateCodes(f.companyTypes(), "company_type", "企业类型");
    validateCodes(f.businessScopes(), "business_scope", "业务范围");
    if (Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_user WHERE lower(btrim(account))=?) OR EXISTS(SELECT 1"
                + " FROM company_application WHERE email=? AND status IN ('pending','approved'))",
            Boolean.class,
            address,
            address))) throw new BusinessException(409, "该邮箱已有账号或正在处理的申请");
    String number =
        "APP-"
            + LocalDate.now(ZoneOffset.UTC).toString().replace("-", "")
            + "-"
            + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
    Long id =
        db.queryForObject(
            "INSERT INTO"
                + " company_application(number,email,name,country,province,city,address,latitude,longitude,system_scale,postcode,service_description,registration_no,tax_id_ciphertext,contact_name,phone,website,language)"
                + " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
            Long.class,
            number,
            address,
            f.name().trim(),
            f.country(),
            f.province(),
            f.city(),
            f.address(),
            f.latitude(),
            f.longitude(),
            f.systemScale(),
            f.postcode(),
            f.serviceDescription(),
            f.registrationNo(),
            f.taxId() == null ? null : secrets.encrypt(f.taxId()),
            f.contactName(),
            f.phone(),
            f.website(),
            "zh-CN".equals(language) ? "zh-CN" : "en");
    for (String type : new LinkedHashSet<>(f.companyTypes()))
      db.update("INSERT INTO application_company_type VALUES(?,?)", id, type);
    for (String scope : new LinkedHashSet<>(f.businessScopes()))
      db.update("INSERT INTO application_business_scope VALUES(?,?)", id, scope);
    db.update("INSERT INTO application_event(application_id,action) VALUES(?,'submitted')", id);
    for (String reviewer :
        db.queryForList(
            "SELECT DISTINCT u.account FROM app_user u JOIN saas_effective_tenant_permission p ON"
                + " p.user_id=u.id JOIN tenant t ON t.id=u.tenant_id WHERE t.kind='platform' AND"
                + " p.permission_code='company.application.review'",
            String.class))
      mail.enqueue(
          "application:" + id + ":" + SecureTokens.hash(reviewer),
          reviewer,
          language,
          "application-submitted",
          Map.of("number", number));
    return Map.of("id", id, "number", number, "status", "pending");
  }

  public List<Map<String, Object>> progress(String address, String context) {
    address = email.requireContext(context, address);
    var rows =
        db.queryForList(
            """
            SELECT a.id,a.number,a.name,a.status,a.submitted_at,COALESCE(t.enabled,false) tenant_enabled,
              u.status account_status,
              ac.id IS NOT NULL activation_present,
              ac.expires_at>now() activation_valid,
              ac.consumed_at IS NOT NULL activation_consumed,
              ac.revoked_at IS NOT NULL activation_revoked,
              am.status activation_mail_status,rm.status rejection_mail_status
            FROM company_application a
            LEFT JOIN tenant t ON t.id=a.tenant_id
            LEFT JOIN app_user u ON a.status='approved' AND u.tenant_id=a.tenant_id
              AND u.account=a.email AND EXISTS(SELECT 1 FROM tenant_administrator ta WHERE ta.tenant_id=a.tenant_id AND ta.user_id=u.id)
            LEFT JOIN LATERAL(SELECT x.id,x.expires_at,x.consumed_at,x.revoked_at FROM account_activation x
              WHERE x.user_id=u.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) ac ON true
            LEFT JOIN LATERAL(SELECT x.status FROM mail_delivery x
              WHERE x.event_key LIKE 'activation:'||u.id||':%' ORDER BY x.id DESC LIMIT 1) am ON true
            LEFT JOIN LATERAL(SELECT x.status FROM mail_delivery x
              WHERE x.event_key='rejected:'||a.id ORDER BY x.id DESC LIMIT 1) rm ON true
            WHERE a.email=? ORDER BY a.submitted_at DESC,a.id DESC
            """,
            address);
    List<Map<String, Object>> result = new ArrayList<>();
    for (var row : rows) {
      var item = new LinkedHashMap<String, Object>();
      for (String field : List.of("id", "number", "name", "status", "submitted_at"))
        item.put(field, row.get(field));
      item.put("events", events(((Number) row.get("id")).longValue()));
      String status = String.valueOf(row.get("status")),
          account = "not_created",
          activationState = "not_created",
          mailState = "not_queued",
          next = "await_review";
      if ("rejected".equals(status)) {
        mailState = mailStatus(row.get("rejection_mail_status"));
        next = "reapply";
      }
      if ("approved".equals(status)) {
        account =
            Set.of("invited", "active", "disabled", "deleted")
                    .contains(String.valueOf(row.get("account_status")))
                ? String.valueOf(row.get("account_status"))
                : "unavailable";
        activationState =
            !Boolean.TRUE.equals(row.get("activation_present"))
                ? "unavailable"
                : Boolean.TRUE.equals(row.get("activation_consumed"))
                    ? "consumed"
                    : Boolean.TRUE.equals(row.get("activation_revoked"))
                        ? "revoked"
                        : Boolean.TRUE.equals(row.get("activation_valid")) ? "pending" : "expired";
        mailState = mailStatus(row.get("activation_mail_status"));
        next = "contact_administrator";
        if ("active".equals(account) && Boolean.TRUE.equals(row.get("tenant_enabled")))
          next = "sign_in";
        else if ("invited".equals(account)
            && Boolean.TRUE.equals(row.get("tenant_enabled"))
            && "pending".equals(activationState)) {
          if ("sent".equals(mailState)) next = "check_activation_email";
          else if ("pending".equals(mailState)) next = "wait_for_email";
        }
      }
      item.put("accountStatus", account);
      item.put("activationStatus", activationState);
      item.put("mailStatus", mailState);
      item.put("nextAction", next);
      result.add(item);
    }
    email.requireContext(context, address);
    return result;
  }

  private static String mailStatus(Object state) {
    String status = String.valueOf(state);
    return "sending".equals(status)
        ? "pending"
        : Set.of("pending", "sent", "failed", "cancelled").contains(status) ? status : "not_queued";
  }

  public Map<String, Object> list(
      String query,
      String status,
      String type,
      Long tag,
      String address,
      OffsetDateTime from,
      OffsetDateTime until,
      int limit,
      int offset) {
    s.platform("company.application.read");
    List<Object> args = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE 1=1");
    if (query != null && !query.isBlank()) {
      where.append(
          " AND (a.name ILIKE ? OR a.email ILIKE ? OR a.contact_name ILIKE ? OR a.number ILIKE ?)");
      for (int i = 0; i < 4; i++) args.add("%" + query.trim() + "%");
    }
    if (address != null && !address.isBlank()) {
      where.append(" AND concat_ws(' ',a.country,a.province,a.city,a.address) ILIKE ?");
      args.add("%" + address.trim() + "%");
    }
    if (status != null && !status.isBlank()) {
      if (!Set.of("pending", "approved", "rejected").contains(status))
        throw new BusinessException(400, "申请状态无效");
      where.append(" AND a.status=?");
      args.add(status);
    }
    if (type != null && !type.isBlank()) {
      where.append(
          " AND EXISTS(SELECT 1 FROM application_company_type x WHERE x.application_id=a.id AND"
              + " x.type_code=?)");
      args.add(type);
    }
    if (tag != null) {
      where.append(
          " AND EXISTS(SELECT 1 FROM application_company_tag x WHERE x.application_id=a.id AND"
              + " x.tag_id=?)");
      args.add(tag);
    }
    if (from != null) {
      where.append(" AND a.submitted_at>=?");
      args.add(from);
    }
    if (until != null) {
      where.append(" AND a.submitted_at<?");
      args.add(until);
    }
    Long count =
        db.queryForObject(
            "SELECT count(*) FROM company_application a" + where, Long.class, args.toArray());
    args.add(Math.max(1, Math.min(limit, 100)));
    args.add(Math.max(0, offset));
    var rows =
        db.queryForList(
            "SELECT"
                + " a.id,a.number,a.name,a.email,a.contact_name,a.status,a.country,a.province,a.city,a.address,a.submitted_at,(SELECT"
                + " u.display_name FROM application_event e JOIN app_user u ON u.id=e.actor_id"
                + " WHERE e.application_id=a.id AND e.action IN ('approved','rejected') ORDER BY"
                + " e.id DESC LIMIT 1) reviewer FROM company_application a"
                + where
                + " ORDER BY a.submitted_at DESC,a.id DESC LIMIT ? OFFSET ?",
            args.toArray());
    for (var row : rows) {
      long id = ((Number) row.get("id")).longValue();
      row.put(
          "companyTypes",
          db.queryForList(
              "SELECT type_code FROM application_company_type WHERE application_id=? ORDER BY"
                  + " type_code",
              String.class,
              id));
      row.put(
          "tags",
          db.queryForList(
              "SELECT t.id,t.name FROM application_company_tag x JOIN company_tag t ON"
                  + " t.id=x.tag_id WHERE x.application_id=? ORDER BY t.id",
              id));
    }
    return Map.of("items", rows, "total", count);
  }

  public Map<String, Object> detail(long id) {
    s.platform("company.application.read");
    var row = get(id, false);
    Object tax = row.remove("tax_id_ciphertext");
    row.put("taxId", tax == null ? "" : secrets.decrypt(tax.toString()));
    row.put(
        "companyTypes",
        db.queryForList(
            "SELECT type_code FROM application_company_type WHERE application_id=?",
            String.class,
            id));
    row.put(
        "businessScopes",
        db.queryForList(
            "SELECT scope_code FROM application_business_scope WHERE application_id=?",
            String.class,
            id));
    row.put(
        "tags",
        db.queryForList(
            "SELECT t.id,t.name FROM application_company_tag x JOIN company_tag t ON t.id=x.tag_id"
                + " WHERE x.application_id=?",
            id));
    row.put("events", events(id));
    return row;
  }

  @Transactional
  public Map<String, Object> approve(long id, Approve body) {
    s.platform("company.application.review");
    mail.requireAvailable();
    s.lock();
    s.platform("company.application.review");
    var row = get(id, true);
    pending(row);
    List<Long> packages = TenantSupport.ids(body.packageIds(), true);
    s.packagesExist(packages);
    List<Long> tags = TenantSupport.ids(body.tagIds(), false);
    if (Boolean.TRUE.equals(
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM app_user WHERE lower(btrim(account))=?)",
            Boolean.class,
            row.get("email")))) throw new BusinessException(409, "该申请邮箱已属于一个账号，请核对后处理");
    if (!tags.isEmpty()
        && !Objects.equals(
            db.queryForObject(
                "SELECT count(*) FROM company_tag WHERE id IN ("
                    + TenantSupport.placeholders(tags.size())
                    + ")",
                Long.class,
                tags.toArray()),
            (long) tags.size())) throw new BusinessException(400, "请选择有效的企业标签");
    if (body.companyTypes() != null && !body.companyTypes().isEmpty())
      validateCodes(body.companyTypes(), "company_type", "企业类型");
    if (body.businessScopes() != null && !body.businessScopes().isEmpty())
      validateCodes(body.businessScopes(), "business_scope", "业务范围");
    s.platform("company.application.review");
    if (body.companyTypes() != null && !body.companyTypes().isEmpty()) {
      db.update("DELETE FROM application_company_type WHERE application_id=?", id);
      for (String type : new LinkedHashSet<>(body.companyTypes()))
        db.update("INSERT INTO application_company_type VALUES(?,?)", id, type);
    }
    if (body.businessScopes() != null && !body.businessScopes().isEmpty()) {
      db.update("DELETE FROM application_business_scope WHERE application_id=?", id);
      for (String scope : new LinkedHashSet<>(body.businessScopes()))
        db.update("INSERT INTO application_business_scope VALUES(?,?)", id, scope);
    }
    if (body.systemScale() != null)
      db.update("UPDATE company_application SET system_scale=? WHERE id=?", body.systemScale(), id);
    Long tenant =
        db.queryForObject("INSERT INTO tenant(kind) VALUES('enterprise') RETURNING id", Long.class);
    db.update(
        "INSERT INTO"
            + " company_profile(tenant_id,name,country,province,city,address,latitude,longitude,system_scale,postcode,service_description,registration_no,tax_id_ciphertext,contact_name,phone,website)"
            + " SELECT"
            + " ?,name,country,province,city,address,latitude,longitude,system_scale,postcode,service_description,registration_no,tax_id_ciphertext,contact_name,phone,website"
            + " FROM company_application WHERE id=?",
        tenant,
        id);
    db.update(
        "INSERT INTO tenant_company_type SELECT ?,type_code FROM application_company_type WHERE"
            + " application_id=?",
        tenant,
        id);
    db.update(
        "INSERT INTO tenant_business_scope SELECT ?,scope_code FROM application_business_scope"
            + " WHERE application_id=?",
        tenant,
        id);
    for (long pack : packages) db.update("INSERT INTO tenant_package VALUES(?,?)", tenant, pack);
    for (long tag : tags) {
      db.update("INSERT INTO application_company_tag VALUES(?,?)", id, tag);
      db.update("INSERT INTO tenant_company_tag VALUES(?,?)", tenant, tag);
    }
    Long user;
    try {
      user =
          db.queryForObject(
              "INSERT INTO app_user(account,display_name,password_hash,tenant_id,status)"
                  + " VALUES(?,?,?,?,'invited') RETURNING id",
              Long.class,
              row.get("email"),
              row.get("contact_name"),
              encoder.encode(SecureTokens.create()),
              tenant);
    } catch (DuplicateKeyException conflict) {
      throw new BusinessException(409, "账号创建发生冲突，请刷新后核对申请邮箱");
    }
    db.update("INSERT INTO tenant_administrator VALUES(?,?)", tenant, user);
    String token = activation.issue(user);
    mail.enqueue(
        "activation:" + user + ":" + UUID.randomUUID(),
        (String) row.get("email"),
        "zh-CN".equals(row.get("language")) ? "zh-CN" : "en",
        "activation",
        Map.of("url", mail.activationUrl(token)));
    db.update(
        "UPDATE company_application SET status='approved',tenant_id=? WHERE id=?", tenant, id);
    db.update(
        "INSERT INTO application_event(application_id,actor_id,action) VALUES(?,?,'approved')",
        id,
        s.auth.userId());
    s.audit(tenant, "company.application.approved", "application=" + id);
    s.events.changed();
    return Map.of("tenantId", tenant, "status", "approved", "mailStatus", "pending");
  }

  @Transactional
  public void reject(long id, String reason) {
    if (reason == null || reason.isBlank() || reason.length() > 2000)
      throw new BusinessException(400, "请填写拒绝原因（最多 2000 字）");
    s.platform("company.application.review");
    s.lock();
    s.platform("company.application.review");
    var row = get(id, true);
    pending(row);
    db.update("UPDATE company_application SET status='rejected' WHERE id=?", id);
    db.update(
        "INSERT INTO application_event(application_id,actor_id,action,reason)"
            + " VALUES(?,?,'rejected',?)",
        id,
        s.auth.userId(),
        reason.trim());
    mail.enqueue(
        "rejected:" + id,
        (String) row.get("email"),
        "zh-CN".equals(row.get("language")) ? "zh-CN" : "en",
        "rejected",
        Map.of("reason", reason.trim()));
  }

  private void validateCodes(List<String> values, String table, String label) {
    if (values == null
        || values.isEmpty()
        || values.size() > 4
        || values.stream().anyMatch(v -> v == null || v.isBlank() || v.length() > 30))
      throw new BusinessException(400, "请选择有效的" + label);
    var distinct = new LinkedHashSet<>(values);
    var known =
        db.queryForList(
            "SELECT code FROM "
                + table
                + " WHERE code IN ("
                + TenantSupport.placeholders(distinct.size())
                + ")",
            String.class,
            distinct.toArray());
    if (known.size() != distinct.size()) throw new BusinessException(400, "请选择有效的" + label);
  }

  private Map<String, Object> get(long id, boolean lock) {
    var rows =
        db.queryForList(
            "SELECT * FROM company_application WHERE id=?" + (lock ? " FOR UPDATE" : ""), id);
    if (rows.isEmpty()) throw new BusinessException(404, "企业申请不存在");
    return rows.getFirst();
  }

  private void pending(Map<String, Object> row) {
    if (!"pending".equals(row.get("status"))) throw new BusinessException(409, "该申请已被处理，请刷新列表");
  }

  private List<Map<String, Object>> events(long id) {
    return db.queryForList(
        "SELECT e.id,e.action,e.reason,e.occurred_at,u.display_name actor FROM application_event e"
            + " LEFT JOIN app_user u ON u.id=e.actor_id WHERE e.application_id=? ORDER BY e.id",
        id);
  }
}
