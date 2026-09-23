package com.enerlution.ems.business;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/**
 * Individual grants. Every mutation rechecks the whole retained grant under the governance lock.
 */
@RestController
@RequestMapping("/api")
public class MemberGrantController {
  private static final String MANAGE = "member.grant.manage";
  private static final String READ = "organization.member.read";
  private static final Set<String> TERMS = Set.of("permanent", "30d", "90d", "1y");
  private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private final DomainSupport s;
  private final GrantDelegation delegation;
  private final GovernanceGuard governance;

  public MemberGrantController(DomainSupport s) {
    this.s = s;
    delegation = new GrantDelegation(s.db, s.access);
    governance = new GovernanceGuard(s.db);
  }

  public record Write(
      @NotNull @Positive Long roleId,
      @NotNull @Size(max = 2000) List<@NotNull @Positive Long> stationIds,
      @NotBlank String term) {}

  public record MemberGrant(
      long id,
      Long roleId,
      String roleName,
      List<Long> stationIds,
      String validFrom,
      String validUntil,
      String source,
      String status,
      String term,
      boolean canEdit,
      boolean canRevoke,
      boolean canExpand,
      boolean scopeRestricted,
      boolean periodChangeRequired,
      String reason,
      List<String> permissionCodes,
      List<PermissionCatalog.Entry> rolePermissions,
      List<GrantStation> stations) {}

  public record GrantStation(long id, String name) {}

  public record StationOption(long id, String name, boolean selectable, String reason) {}

  public record GrantOptions(
      long roleId,
      Long grantId,
      String term,
      String validFrom,
      String validUntil,
      boolean stationSelectionRequired,
      boolean canSaveWithoutStations,
      boolean canExpand,
      String reason,
      List<StationOption> stations) {}

  private record Period(Instant from, Instant until) {}

  @GetMapping("/members/{memberId}/grants")
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public ApiResponse<List<MemberGrant>> list(@PathVariable long memberId) {
    s.access.userId();
    boolean manager = memberScope(memberId, MANAGE);
    if (!manager) delegation.requireMemberScope(memberId, READ);
    Instant now = now();
    return ApiResponse.ok(
        s
            .db
            .queryForList("SELECT * FROM member_grant WHERE user_id=? ORDER BY id", memberId)
            .stream()
            .map(row -> dto(row, now, manager))
            .toList());
  }

  @PostMapping("/members/{memberId}/grants")
  @Transactional
  public ApiResponse<MemberGrant> create(
      @PathVariable long memberId, @Valid @RequestBody Write input) {
    governance.lock();
    s.access.requirePermission("member.grant.manage");
    writableMember(memberId);
    var role = role(input.roleId());
    Period period = period(input.term(), null, now());
    validate(memberId, role, input.stationIds(), period, null);
    var before = governance.snapshot();
    long id =
        s.db.queryForObject(
            "INSERT INTO member_grant(user_id,role_id,valid_from,valid_until,granted_by)"
                + " VALUES(?,?,?,?,?) RETURNING id",
            Long.class,
            memberId,
            input.roleId(),
            timestamp(period.from()),
            timestamp(period.until()),
            s.access.userId());
    insertStations(id, input.stationIds());
    governance.preserve(before);
    var result = dto(grant(memberId, id), now(), true);
    audit("member.grant.create", memberId, null, result);
    return ApiResponse.ok(result);
  }

  @PutMapping("/members/{memberId}/grants/{grantId}")
  @Transactional
  public ApiResponse<MemberGrant> edit(
      @PathVariable long memberId, @PathVariable long grantId, @Valid @RequestBody Write input) {
    governance.lock();
    writableMember(memberId);
    var old = grant(memberId, grantId);
    requireWholeScope(old, MANAGE);
    var role = role(input.roleId());
    Period period = period(input.term(), old, now());
    validate(memberId, role, input.stationIds(), period, old);
    var previous = dto(old, now(), true);
    var before = governance.snapshot();
    // Preserve the original issuer, including unknown historical issuers; audit records this
    // editor.
    s.db.update(
        "UPDATE member_grant SET role_id=?,valid_from=?,valid_until=? WHERE id=? AND user_id=?",
        input.roleId(),
        timestamp(period.from()),
        timestamp(period.until()),
        grantId,
        memberId);
    s.db.update("DELETE FROM member_grant_station WHERE grant_id=?", grantId);
    insertStations(grantId, input.stationIds());
    governance.preserve(before);
    var result = dto(grant(memberId, grantId), now(), true);
    audit("member.grant.edit", memberId, previous, result);
    return ApiResponse.ok(result);
  }

  @DeleteMapping("/members/{memberId}/grants/{grantId}")
  @Transactional
  public ApiResponse<Void> revoke(@PathVariable long memberId, @PathVariable long grantId) {
    governance.lock();
    writableMember(memberId);
    var row = grant(memberId, grantId);
    requireWholeScope(row, MANAGE);
    var previous = dto(row, now(), true);
    var before = governance.snapshot();
    s.db.update("DELETE FROM member_grant WHERE id=? AND user_id=?", grantId, memberId);
    governance.preserve(before);
    audit("member.grant.revoke", memberId, previous, null);
    return ApiResponse.ok(null);
  }

  @GetMapping("/members/{memberId}/grant-options")
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public ApiResponse<GrantOptions> options(
      @PathVariable long memberId,
      @RequestParam long roleId,
      @RequestParam String term,
      @RequestParam(required = false) Long grantId) {
    writableMember(memberId);
    Map<String, Object> old = grantId == null ? null : grant(memberId, grantId);
    if (old != null) requireWholeScope(old, MANAGE);
    var role = role(roleId);
    long owner = owner(role);
    delegation.requireScope(owner, memberId, List.of(), MANAGE);
    Period preview = period(term, old, now());
    List<String> codes = codes(roleId);
    boolean required = stationRequired(codes);
    String emptyReason = validationReason(memberId, role, List.of(), preview, old);
    List<StationOption> stations = new ArrayList<>();
    // Candidate visibility uses existing explicit selections and the shared scope service,
    // independent of asset.read. Full code/resource/expiry checks use the same validator as save.
    for (var station :
        s.db.queryForList(
            "SELECT DISTINCT st.id,st.name FROM station st JOIN member_grant_station gs ON"
                + " gs.station_id=st.id JOIN active_member_grant g ON g.id=gs.grant_id WHERE"
                + " g.user_id=? ORDER BY st.id",
            s.access.userId())) {
      long id = s.number(station, "id");
      try {
        delegation.requireScope(owner, memberId, List.of(id), MANAGE);
      } catch (BusinessException e) {
        if (e.status() == 403) continue;
        throw e;
      }
      String reason = validationReason(memberId, role, List.of(id), preview, old);
      stations.add(new StationOption(id, (String) station.get("name"), reason == null, reason));
    }
    return ApiResponse.ok(
        new GrantOptions(
            roleId,
            grantId,
            term,
            text(preview.from()),
            text(preview.until()),
            required,
            emptyReason == null,
            available(codes),
            required ? null : emptyReason,
            stations));
  }

  private String validationReason(
      long member,
      Map<String, Object> role,
      List<Long> stations,
      Period period,
      Map<String, Object> old) {
    try {
      validate(member, role, stations, period, old);
      return null;
    } catch (BusinessException e) {
      if (e.status() != 400 && e.status() != 403) throw e;
      return e.getMessage();
    }
  }

  private void validate(
      long member,
      Map<String, Object> role,
      List<Long> stations,
      Period period,
      Map<String, Object> old) {
    if (stations == null
        || stations.stream().anyMatch(id -> id == null || id <= 0)
        || new HashSet<>(stations).size() != stations.size())
      throw new BusinessException(400, "站点不能为空值或重复");
    long roleId = s.number(role, "id"), owner = owner(role);
    List<String> codes = codes(roleId);
    if (stationRequired(codes) && stations.isEmpty())
      throw new BusinessException(400, "站点范围权限至少需要选择一个站点");
    delegation.requireScope(owner, member, stations, MANAGE);
    boolean narrowing =
        old != null
            && roleId == s.number(old, "role_id")
            && stations(s.number(old, "id")).containsAll(stations)
            && !period.from().isBefore(instant(old, "valid_from"))
            && noLater(period.until(), instant(old, "valid_until"));
    if (!narrowing) {
      if (!available(codes))
        throw new BusinessException(400, "该角色含未知或暂不可用权限，仅可缩小已有授权；请更新角色或选择可分配角色");
      delegation.requireDelegation(owner, member, stations, codes, period.until(), MANAGE);
    }
  }

  private boolean noLater(Instant next, Instant old) {
    return old == null || (next != null && !next.isAfter(old));
  }

  private void writableMember(long member) {
    long actor = s.access.userId();
    delegation.requireMemberScope(member, MANAGE);
    if (member == actor) throw new BusinessException(403, "不能修改自己的授权，请由其他有权限的管理员操作");
  }

  private boolean memberScope(long member, String permission) {
    try {
      delegation.requireMemberScope(member, permission);
      return true;
    } catch (BusinessException e) {
      if (e.status() != 403) throw e;
      return false;
    }
  }

  private void requireWholeScope(Map<String, Object> grant, String permission) {
    delegation.requireScope(
        owner(role(s.number(grant, "role_id"))),
        s.number(grant, "user_id"),
        stations(s.number(grant, "id")),
        permission);
  }

  private boolean wholeScope(Map<String, Object> grant, String permission) {
    try {
      requireWholeScope(grant, permission);
      return true;
    } catch (BusinessException e) {
      if (e.status() != 403) throw e;
      return false;
    }
  }

  private boolean visibleScope(Map<String, Object> grant, String permission) {
    try {
      delegation.requireOrganizationScope(
          owner(role(s.number(grant, "role_id"))),
          s.number(grant, "user_id"),
          stations(s.number(grant, "id")),
          permission);
      return true;
    } catch (BusinessException e) {
      if (e.status() != 403) throw e;
      return false;
    }
  }

  private MemberGrant dto(Map<String, Object> grant, Instant now, boolean memberManager) {
    long id = s.number(grant, "id");
    boolean manageable = memberManager && wholeScope(grant, MANAGE);
    boolean visible =
        manageable || (memberManager && visibleScope(grant, MANAGE)) || visibleScope(grant, READ);
    if (!visible)
      return new MemberGrant(
          id,
          null,
          null,
          List.of(),
          null,
          null,
          null,
          "restricted",
          null,
          false,
          false,
          false,
          true,
          false,
          "含当前范围外的授权，详情不可见且不能编辑或撤销",
          List.of(),
          List.of(),
          List.of());
    long roleId = s.number(grant, "role_id");
    var role = role(roleId);
    List<String> codes = codes(roleId);
    var descriptors =
        codes.stream()
            .map(PermissionCatalog::find)
            .filter(Objects::nonNull)
            .map(
                entry ->
                    new PermissionCatalog.Entry(
                        entry.code(),
                        entry.name(),
                        entry.module(),
                        entry.scope(),
                        entry.available(),
                        entry.origin(),
                        entry.available() ? null : entry.reason()))
            .toList();
    Instant from = instant(grant, "valid_from"), until = instant(grant, "valid_until");
    boolean enabled =
        Boolean.TRUE.equals(
            s.db.queryForObject(
                "SELECT enabled FROM app_user WHERE id=?",
                Boolean.class,
                s.number(grant, "user_id")));
    String status =
        until != null && !until.isAfter(now)
            ? "expired"
            : !enabled ? "disabled" : from.isAfter(now) ? "scheduled" : "active";
    String term = term(new Period(from, until));
    boolean writable = manageable && s.number(grant, "user_id") != s.access.userId();
    boolean assignable = available(codes);
    String reason =
        !writable
            ? "当前授权只读"
            : !assignable
                ? "角色含暂不可用权限，只能保留或缩小已有授权"
                : term.equals("custom") ? "自定义历史期限；须明确选择新期限后保存" : null;
    return new MemberGrant(
        id,
        roleId,
        (String) role.get("name"),
        stations(id),
        text(from),
        text(until),
        grant.get("granted_by") == null ? "历史迁移" : "直接授权",
        status,
        term,
        writable,
        writable,
        writable && assignable,
        false,
        term.equals("custom"),
        reason,
        codes,
        descriptors,
        s.db.query(
            "SELECT st.id,st.name FROM member_grant_station gs JOIN station st ON"
                + " st.id=gs.station_id WHERE gs.grant_id=? ORDER BY st.id",
            (rs, row) -> new GrantStation(rs.getLong("id"), rs.getString("name")),
            id));
  }

  private Period period(String requested, Map<String, Object> old, Instant now) {
    if (!TERMS.contains(requested == null ? "" : requested))
      throw new BusinessException(400, "有效期必须为 permanent、30d、90d 或 1y；历史自定义期限需明确选择新期限");
    if (old != null) {
      Period saved = new Period(instant(old, "valid_from"), instant(old, "valid_until"));
      if (requested.equals(term(saved))) return saved;
    }
    return new Period(now, end(now, requested));
  }

  private Instant end(Instant from, String term) {
    return switch (term) {
      case "permanent" -> null;
      case "30d" -> from.plus(30, ChronoUnit.DAYS);
      case "90d" -> from.plus(90, ChronoUnit.DAYS);
      case "1y" -> from.atZone(ZONE).plusYears(1).toInstant();
      default -> throw new IllegalArgumentException("Unsupported term");
    };
  }

  private String term(Period period) {
    if (period.until() == null) return "permanent";
    for (String term : List.of("30d", "90d", "1y"))
      if (period.until().equals(end(period.from(), term))) return term;
    return "custom";
  }

  private boolean stationRequired(List<String> codes) {
    return codes.stream()
        .map(PermissionCatalog::find)
        .filter(Objects::nonNull)
        .anyMatch(entry -> entry.available() && entry.scope().equals("station"));
  }

  private boolean available(List<String> codes) {
    return codes.stream().allMatch(PermissionCatalog::available);
  }

  private long owner(Map<String, Object> role) {
    if (role.get("organization_id") == null) throw new BusinessException(403, "历史无归属角色不在可管理范围");
    return s.number(role, "organization_id");
  }

  private Map<String, Object> role(long id) {
    return s.one("SELECT * FROM app_role WHERE id=?", id);
  }

  private Map<String, Object> grant(long member, long id) {
    return s.one("SELECT * FROM member_grant WHERE id=? AND user_id=?", id, member);
  }

  private List<String> codes(long role) {
    return s.db.queryForList(
        "SELECT permission_code FROM role_permission WHERE role_id=? ORDER BY permission_code",
        String.class,
        role);
  }

  private List<Long> stations(long grant) {
    return s.db.queryForList(
        "SELECT station_id FROM member_grant_station WHERE grant_id=? ORDER BY station_id",
        Long.class,
        grant);
  }

  private void insertStations(long grant, List<Long> stations) {
    for (long station : stations)
      s.db.update(
          "INSERT INTO member_grant_station(grant_id,station_id) VALUES(?,?)", grant, station);
  }

  private Instant now() {
    return s.db.queryForObject("SELECT statement_timestamp()", Timestamp.class).toInstant();
  }

  private Instant instant(Map<String, Object> row, String field) {
    Timestamp timestamp = (Timestamp) row.get(field);
    return timestamp == null ? null : timestamp.toInstant();
  }

  private Timestamp timestamp(Instant instant) {
    return instant == null ? null : Timestamp.from(instant);
  }

  private String text(Instant instant) {
    return instant == null ? null : instant.toString();
  }

  private void audit(String action, long member, MemberGrant before, MemberGrant after) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("memberId", member);
    detail.put("before", before);
    detail.put("after", after);
    try {
      s.audit(action, new ObjectMapper().writeValueAsString(detail));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }
}
