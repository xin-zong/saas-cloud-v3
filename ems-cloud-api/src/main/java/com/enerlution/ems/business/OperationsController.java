package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class OperationsController {
  private final DomainSupport s;

  public OperationsController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/stations/{id}/plans")
  public ApiResponse<?> plans(@PathVariable long id, @RequestParam LocalDate date) {
    s.access.requirePermission("strategy.read");
    s.access.requireStation(id);
    var rows =
        s.db.queryForList(
            "SELECT * FROM operating_plan WHERE station_id=? AND service_date=? ORDER BY version"
                + " DESC",
            id,
            date);
    for (var row : rows)
      row.put(
          "periods",
          s.db.queryForList(
              "SELECT * FROM plan_period WHERE plan_id=? ORDER BY start_minute", row.get("id")));
    return ApiResponse.ok(rows);
  }

  public record Plan(
      @Positive long stationId,
      @NotNull LocalDate date,
      @Pattern(regexp = "dayAhead|intraday") @NotNull String kind,
      @NotNull List<BusinessRules.Period> periods) {}

  @PostMapping("/plans")
  @Transactional
  public ApiResponse<?> createPlan(@Valid @RequestBody Plan n) {
    s.access.requirePermission("strategy.manage");
    s.access.requireStation(n.stationId());
    var station = s.one("SELECT rated_power_kw FROM station WHERE id=? FOR UPDATE", n.stationId());
    BusinessRules.periods(n.periods(), (BigDecimal) station.get("rated_power_kw"));
    Integer version =
        s.db.queryForObject(
            "SELECT coalesce(max(version),0)+1 FROM operating_plan WHERE station_id=? AND"
                + " service_date=?",
            Integer.class,
            n.stationId(),
            n.date());
    Long id =
        s.db.queryForObject(
            "INSERT INTO operating_plan(station_id,service_date,version,kind,created_by)"
                + " VALUES(?,?,?,?,?) RETURNING id",
            Long.class,
            n.stationId(),
            n.date(),
            version,
            n.kind(),
            s.access.userId());
    for (var p : n.periods())
      s.db.update(
          "INSERT INTO plan_period(plan_id,start_minute,end_minute,mode,power_kw)"
              + " VALUES(?,?,?,?,?)",
          id,
          p.startMinute(),
          p.endMinute(),
          p.mode(),
          p.powerKw());
    s.audit("plan.create", "plan=" + id);
    return ApiResponse.ok(Map.of("id", id, "version", version));
  }

  @PostMapping("/plans/{id}/submit")
  @Transactional
  public ApiResponse<?> submit(@PathVariable long id) {
    s.access.requirePermission("strategy.manage");
    var plan = s.one("SELECT * FROM operating_plan WHERE id=? FOR UPDATE", id);
    s.access.requireStation(s.number(plan, "station_id"));
    if (!plan.get("status").equals("draft")) throw new BusinessException(409, "只有草稿可提交");
    s.db.update("UPDATE operating_plan SET status='submitted' WHERE id=?", id);
    Long approval =
        s.db.queryForObject(
            "INSERT INTO approval(title,submitter_id,plan_id) VALUES(?,?,?) RETURNING id",
            Long.class,
            "计划审批 #" + id,
            s.access.userId(),
            id);
    s.audit("plan.submit", "plan=" + id);
    return ApiResponse.ok(Map.of("approvalId", approval));
  }

  @GetMapping("/approvals")
  public ApiResponse<?> approvals(
      @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
    long user = s.access.userId();
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT a.*,coalesce(p.station_id,w.station_id) AS station_id,st.name AS station_name,"
                + " submitter.display_name AS requester_name,reviewer.display_name AS decider_name"
                + " FROM approval a LEFT JOIN operating_plan p ON p.id=a.plan_id LEFT JOIN"
                + " work_order w ON w.id=a.work_order_id JOIN station st ON"
                + " st.id=coalesce(p.station_id,w.station_id) JOIN app_user submitter ON"
                + " submitter.id=a.submitter_id LEFT JOIN app_user reviewer ON"
                + " reviewer.id=a.reviewer_id WHERE (a.submitter_id=? OR EXISTS(SELECT 1 FROM"
                + " user_role ur JOIN role_permission rp ON rp.role_id=ur.role_id WHERE"
                + " ur.user_id=? AND rp.permission_code='approval.review')) AND EXISTS(SELECT 1"
                + " FROM user_station us WHERE us.user_id=? AND"
                + " us.station_id=coalesce(p.station_id,w.station_id)) ORDER BY a.id DESC LIMIT"
                + " ? OFFSET ?",
            user,
            user,
            user,
            s.limit(limit),
            s.offset(offset)));
  }

  public record Decision(
      @Pattern(regexp = "approved|rejected") @NotNull String decision,
      @NotBlank @Size(max = 4000) String note) {}

  @PostMapping("/approvals/{id}/decision")
  @Transactional
  public ApiResponse<?> decision(@PathVariable long id, @Valid @RequestBody Decision n) {
    s.access.requirePermission("approval.review");
    var a = s.one("SELECT * FROM approval WHERE id=? FOR UPDATE", id);
    if (!a.get("status").equals("pending")) throw new BusinessException(409, "审批已经结束");
    if (s.number(a, "submitter_id") == s.access.userId())
      throw new BusinessException(403, "不能审批自己的申请");
    Map<String, Object> target =
        a.get("plan_id") != null
            ? s.one("SELECT * FROM operating_plan WHERE id=? FOR UPDATE", a.get("plan_id"))
            : s.one("SELECT * FROM work_order WHERE id=? FOR UPDATE", a.get("work_order_id"));
    s.access.requireStation(s.number(target, "station_id"));
    if (a.get("plan_id") != null) {
      if (!target.get("status").equals("submitted")) throw new BusinessException(409, "计划状态已变化");
      s.db.update("UPDATE operating_plan SET status=? WHERE id=?", n.decision(), a.get("plan_id"));
    }
    s.db.update(
        "UPDATE approval SET status=?,reviewer_id=?,reviewed_at=now(),note=? WHERE id=?",
        n.decision(),
        s.access.userId(),
        n.note(),
        id);
    s.audit("approval." + n.decision(), "approval=" + id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/stations/{id}/tariffs")
  public ApiResponse<?> tariffs(@PathVariable long id) {
    s.access.requirePermission("tariff.manage");
    s.access.requireStation(id);
    var rows =
        s.db.queryForList(
            "SELECT st.*,t.name,t.currency FROM station_tariff st JOIN tariff t ON"
                + " t.id=st.tariff_id WHERE st.station_id=? ORDER BY st.valid_from DESC",
            id);
    for (var row : rows)
      row.put(
          "periods",
          s.db.queryForList(
              "SELECT * FROM tariff_period WHERE tariff_id=? ORDER BY start_minute",
              row.get("tariff_id")));
    return ApiResponse.ok(rows);
  }

  public record TariffPeriod(
      @Min(0) int startMinute,
      @Max(1440) int endMinute,
      @Pattern(regexp = "peak|flat|valley|superPeak") @NotNull String band,
      @NotNull BigDecimal pricePerKwh) {}

  public record Tariff(
      @Positive long stationId,
      @NotBlank @Size(max = 120) String name,
      @Pattern(regexp = "[A-Z]{3}") @NotNull String currency,
      @NotNull LocalDate validFrom,
      @NotNull LocalDate validUntil,
      @Size(min = 1, max = 96) @NotNull List<@NotNull @Valid TariffPeriod> periods) {}

  @PostMapping("/tariffs")
  @Transactional
  public ApiResponse<?> tariff(@Valid @RequestBody Tariff n) {
    s.access.requirePermission("tariff.manage");
    s.access.requireStation(n.stationId());
    if (!n.validUntil().isAfter(n.validFrom())) throw new BusinessException(400, "有效期无效");
    int end = 0;
    for (var p :
        n.periods().stream().sorted(Comparator.comparingInt(TariffPeriod::startMinute)).toList()) {
      if (p.startMinute() != end || p.endMinute() <= p.startMinute())
        throw new BusinessException(400, "电价时段应无重叠且覆盖全天");
      end = p.endMinute();
    }
    if (end != 1440) throw new BusinessException(400, "电价时段应覆盖全天");
    Long id =
        s.db.queryForObject(
            "INSERT INTO tariff(name,currency) VALUES(?,?) RETURNING id",
            Long.class,
            n.name(),
            n.currency());
    for (var p : n.periods())
      s.db.update(
          "INSERT INTO tariff_period(tariff_id,start_minute,end_minute,band,price_per_kwh)"
              + " VALUES(?,?,?,?,?)",
          id,
          p.startMinute(),
          p.endMinute(),
          p.band(),
          p.pricePerKwh());
    s.db.update(
        "INSERT INTO station_tariff(station_id,tariff_id,valid_from,valid_until) VALUES(?,?,?,?)",
        n.stationId(),
        id,
        n.validFrom(),
        n.validUntil());
    s.audit("tariff.create", "tariff=" + id);
    return ApiResponse.ok(Map.of("id", id));
  }
}
