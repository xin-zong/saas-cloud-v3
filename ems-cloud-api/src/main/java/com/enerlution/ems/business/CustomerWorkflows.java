package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

/** Customer ownership supplements, rather than broadens, station-scoped capabilities. */
final class CustomerWorkflows {
  private final DomainSupport s;

  CustomerWorkflows(DomainSupport s) {
    this.s = s;
  }

  // Exclude grants without a station: these do not confer the existing customer capability.
  private static final String BRANCH =
      """
WITH RECURSIVE grant_branch(grant_id,organization_id) AS (
 SELECT g.id,r.organization_id FROM active_member_grant g JOIN app_role r ON r.id=g.role_id
 JOIN role_permission rp ON rp.role_id=r.id
 WHERE g.user_id=? AND rp.permission_code=? AND r.organization_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM member_grant_station gs WHERE gs.grant_id=g.id)
 UNION SELECT b.grant_id,o.id FROM grant_branch b JOIN organization o ON o.parent_id=b.organization_id
)
""";

  List<Map<String, Object>> organizations() {
    return s.db.queryForList(
        BRANCH
            + "SELECT DISTINCT o.id,o.name FROM organization o JOIN grant_branch b ON"
            + " b.organization_id=o.id ORDER BY o.name,o.id",
        s.access.userId(),
        "customer.manage");
  }

  boolean canManage(long id) {
    if (!s.access.hasPermission("customer.manage")) return false;
    return Boolean.TRUE.equals(
        s.db.queryForObject(
            BRANCH
                + """
SELECT EXISTS(SELECT 1 FROM customer c JOIN grant_branch b ON b.organization_id=c.organization_id WHERE c.id=?)
AND NOT EXISTS(SELECT 1 FROM station st WHERE st.customer_id=? AND NOT EXISTS(
 SELECT 1 FROM grant_branch b JOIN member_grant_station gs ON gs.grant_id=b.grant_id
 WHERE gs.station_id=st.id AND b.organization_id=st.organization_id))
""",
            Boolean.class,
            s.access.userId(),
            "customer.manage",
            id,
            id));
  }

  private boolean visible(long id) {
    if (!s.access.hasPermission("customer.read")) return false;
    return Boolean.TRUE.equals(
        s.db.queryForObject(
            BRANCH
                + """
SELECT EXISTS(SELECT 1 FROM customer c WHERE c.id=? AND (
 EXISTS(SELECT 1 FROM station st JOIN effective_station_permission p ON p.station_id=st.id
   WHERE st.customer_id=c.id AND p.user_id=? AND p.permission_code='customer.read')
 OR (NOT EXISTS(SELECT 1 FROM station st WHERE st.customer_id=c.id)
   AND EXISTS(SELECT 1 FROM grant_branch b WHERE b.organization_id=c.organization_id))))
""",
            Boolean.class,
            s.access.userId(),
            "customer.read",
            id,
            s.access.userId()));
  }

  private Set<Long> manageableIds(long user) {
    return new HashSet<>(
        s.db.queryForList(
            BRANCH
                + """
SELECT c.id FROM customer c
WHERE EXISTS(SELECT 1 FROM grant_branch b WHERE b.organization_id=c.organization_id)
AND NOT EXISTS(SELECT 1 FROM station st WHERE st.customer_id=c.id AND NOT EXISTS(
 SELECT 1 FROM grant_branch b JOIN member_grant_station gs ON gs.grant_id=b.grant_id
 WHERE gs.station_id=st.id AND b.organization_id=st.organization_id))
""",
            Long.class,
            user,
            "customer.manage"));
  }

  List<Map<String, Object>> list() {
    long user = s.access.userId();
    var result =
        s.db.queryForList(
            BRANCH
                + """
SELECT c.*,o.name AS organization_name FROM customer c JOIN organization o ON o.id=c.organization_id
WHERE EXISTS(SELECT 1 FROM station st JOIN effective_station_permission p ON p.station_id=st.id
 WHERE st.customer_id=c.id AND p.user_id=? AND p.permission_code='customer.read')
 OR (NOT EXISTS(SELECT 1 FROM station st WHERE st.customer_id=c.id)
 AND EXISTS(SELECT 1 FROM grant_branch b WHERE b.organization_id=c.organization_id))
ORDER BY c.name,c.id
""",
            user,
            "customer.read",
            user);
    var manageable = manageableIds(user);
    Map<Long, List<Map<String, Object>>> stationsByCustomer = new HashMap<>();
    for (var station :
        s.db.queryForList(
            """
SELECT st.customer_id,st.id,st.name,st.code FROM station st
JOIN effective_station_permission p ON p.station_id=st.id
WHERE st.customer_id IS NOT NULL AND p.user_id=? AND p.permission_code='customer.read' ORDER BY st.id
""",
            user)) {
      long customer = ((Number) station.remove("customer_id")).longValue();
      stationsByCustomer.computeIfAbsent(customer, unused -> new ArrayList<>()).add(station);
    }
    for (var customer : result) {
      long id = s.number(customer, "id");
      var stations = stationsByCustomer.getOrDefault(id, List.of());
      customer.put("stations", stations);
      customer.put("station_count", stations.size());
      customer.put("can_edit", manageable.contains(id));
    }
    return result;
  }

  Map<String, Object> create(JsonNode input) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    s.access.requirePermission("customer.manage");
    fields(input, Set.of("name", "organizationId", "entity", "contact"));
    Long org = identifier(input.get("organizationId"));
    if (org == null) throw new BusinessException(400, "请选择客户所属组织");
    if (organizations().stream().noneMatch(o -> s.number(o, "id") == org)) denied();
    String name = text(input.get("name"), 160, true);
    String entity = text(input.get("entity"), 160, false),
        contact = text(input.get("contact"), 254, false);
    long id =
        s.db.queryForObject(
            "INSERT INTO customer(name,organization_id,entity,contact) VALUES(?,?,?,?) RETURNING"
                + " id",
            Long.class,
            name,
            org,
            entity,
            contact);
    var after = s.one("SELECT * FROM customer WHERE id=?", id);
    s.audit("customer.create", Map.of("customerId", id, "after", after));
    return after;
  }

  Map<String, Object> edit(long id, JsonNode input) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    s.access.requirePermission("customer.manage");
    if (!canManage(id)) denied();
    fields(input, Set.of("name", "entity", "contact"));
    var before = s.one("SELECT * FROM customer WHERE id=? FOR UPDATE", id);
    String name =
        input.has("name") ? text(input.get("name"), 160, true) : (String) before.get("name");
    String entity =
        input.has("entity") ? text(input.get("entity"), 160, false) : (String) before.get("entity");
    String contact =
        input.has("contact")
            ? text(input.get("contact"), 254, false)
            : (String) before.get("contact");
    s.db.update(
        "UPDATE customer SET name=?,entity=?,contact=? WHERE id=?", name, entity, contact, id);
    var after = s.one("SELECT * FROM customer WHERE id=?", id);
    s.audit("customer.edit", Map.of("customerId", id, "before", before, "after", after));
    return after;
  }

  private boolean managesStation(long id) {
    return Boolean.TRUE.equals(
        s.db.queryForObject(
            BRANCH
                + """
SELECT EXISTS(SELECT 1 FROM station st JOIN grant_branch b ON b.organization_id=st.organization_id
 JOIN member_grant_station gs ON gs.grant_id=b.grant_id AND gs.station_id=st.id WHERE st.id=?)
""",
            Boolean.class,
            s.access.userId(),
            "customer.manage",
            id));
  }

  private boolean containsStation(long customerId, long stationId) {
    return Boolean.TRUE.equals(
        s.db.queryForObject(
            """
WITH RECURSIVE branch(id) AS (
 SELECT organization_id FROM customer WHERE id=? UNION
 SELECT o.id FROM organization o JOIN branch b ON o.parent_id=b.id
) SELECT EXISTS(SELECT 1 FROM station st JOIN branch b ON b.id=st.organization_id WHERE st.id=?)
""",
            Boolean.class,
            customerId,
            stationId));
  }

  Map<String, Object> options(long stationId) {
    s.access.requireStationPermission(stationId, "asset.read");
    var station = s.one("SELECT customer_id FROM station WHERE id=?", stationId);
    Long current = (Long) station.get("customer_id");
    long user = s.access.userId();
    var manageable = manageableIds(user);
    boolean allowed =
        s.access.hasStationPermission(user, stationId, "asset.edit")
            && managesStation(stationId)
            && (current == null || manageable.contains(current));
    List<Map<String, Object>> choices = List.of();
    if (allowed)
      choices =
          s
              .db
              .queryForList(
                  """
WITH RECURSIVE ancestors(id,parent_id) AS (
 SELECT o.id,o.parent_id FROM organization o JOIN station st ON st.organization_id=o.id WHERE st.id=?
 UNION SELECT o.id,o.parent_id FROM organization o JOIN ancestors a ON o.id=a.parent_id
) SELECT c.id,c.name FROM customer c JOIN ancestors a ON a.id=c.organization_id ORDER BY c.name,c.id
""",
                  stationId)
              .stream()
              .filter(row -> manageable.contains(s.number(row, "id")))
              .toList();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("can_assign", allowed);
    result.put("customers", choices);
    boolean reveal = current != null && (visible(current) || manageable.contains(current));
    result.put(
        "current_customer",
        reveal ? s.one("SELECT id,name FROM customer WHERE id=?", current) : null);
    result.put("current_customer_restricted", current != null && !reveal);
    return result;
  }

  void assign(long stationId, JsonNode value) {
    s.access.requireStationPermission(stationId, "asset.read");
    s.access.requireStationPermission(stationId, "asset.edit");
    s.access.requirePermission("customer.manage");
    Long next = identifier(value);
    Long previous =
        (Long) s.one("SELECT customer_id FROM station WHERE id=?", stationId).get("customer_id");
    if (!managesStation(stationId)
        || (previous != null && !canManage(previous))
        || (next != null && (!canManage(next) || !containsStation(next, stationId)))) denied();
    if (Objects.equals(previous, next)) return;
    s.db.update("UPDATE station SET customer_id=? WHERE id=?", next, stationId);
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("stationId", stationId);
    detail.put("before", previous);
    detail.put("after", next);
    s.audit("station.customer", detail);
  }

  private static void fields(JsonNode input, Set<String> allowed) {
    if (input == null || !input.isObject()) throw new BusinessException(400, "无效客户信息");
    input
        .fieldNames()
        .forEachRemaining(
            key -> {
              if (!allowed.contains(key)) throw new BusinessException(400, "无效客户字段");
            });
  }

  private static String text(JsonNode value, int max, boolean required) {
    if (value != null && !value.isNull() && !value.isTextual())
      throw new BusinessException(400, "客户字段必须为文本");
    String result = value == null || value.isNull() ? null : value.textValue().trim();
    if (result != null && result.isEmpty()) result = null;
    if ((required && result == null) || (result != null && result.length() > max))
      throw new BusinessException(400, "客户字段为空或超出长度限制");
    return result;
  }

  private static Long identifier(JsonNode value) {
    if (value == null || value.isNull()) return null;
    if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() <= 0)
      throw new BusinessException(400, "无效编号");
    return value.longValue();
  }

  private static void denied() {
    throw new BusinessException(403, "客户不属于当前站点和管理组织范围");
  }
}
