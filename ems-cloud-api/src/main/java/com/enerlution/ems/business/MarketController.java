package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class MarketController {
  private final DomainSupport s;

  public MarketController(DomainSupport s) {
    this.s = s;
  }

  public record Draft(
      @Positive long stationId,
      @Positive long areaId,
      @NotBlank @Size(max = 100) String eventCode,
      @NotBlank @Size(max = 160) String name,
      @NotNull @Pattern(regexp = "response|arbitrage|reserve|vpp") String kind,
      @NotNull OffsetDateTime startsAt,
      @NotNull OffsetDateTime endsAt,
      @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal capacityKw) {}

  @PostMapping("/market-drafts")
  @Transactional
  public ApiResponse<?> draft(@Valid @RequestBody Draft n) {
    s.access.requireStationPermission(n.stationId(), "market.manage");
    if (!n.endsAt().isAfter(n.startsAt())
        || Duration.between(n.startsAt(), n.endsAt()).compareTo(Duration.ofDays(1)) > 0)
      throw new BusinessException(400, "服务时段无效");
    var station = s.one("SELECT rated_power_kw FROM station WHERE id=? FOR UPDATE", n.stationId());
    if (n.capacityKw().compareTo((BigDecimal) station.get("rated_power_kw")) > 0)
      throw new BusinessException(400, "承诺容量超过电站额定功率");
    if (!Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM market_qualification WHERE station_id=? AND area_id=? AND"
                + " kind=? AND status='valid' AND valid_until>=?)",
            Boolean.class,
            n.stationId(),
            n.areaId(),
            n.kind(),
            n.endsAt().atZoneSameInstant(ZoneId.of("Asia/Shanghai")).toLocalDate())))
      throw new BusinessException(409, "缺少服务期内有效资格");
    var windows =
        s.db.query(
            "SELECT greatest(m.starts_at,?) AS start,least(m.ends_at,?) AS finish,a.capacity_kw"
                + " FROM market_allocation a JOIN market_service m ON m.id=a.service_id WHERE"
                + " a.station_id=? AND m.status NOT IN ('cancelled','withdrawn') AND m.starts_at<?"
                + " AND m.ends_at>?",
            (rs, index) ->
                new BusinessRules.CapacityWindow(
                    rs.getTimestamp("start").toInstant(),
                    rs.getTimestamp("finish").toInstant(),
                    rs.getBigDecimal("capacity_kw")),
            n.startsAt(),
            n.endsAt(),
            n.stationId(),
            n.endsAt(),
            n.startsAt());
    windows.add(
        new BusinessRules.CapacityWindow(
            n.startsAt().toInstant(), n.endsAt().toInstant(), n.capacityKw()));
    if (BusinessRules.peakCapacity(windows).compareTo((BigDecimal) station.get("rated_power_kw"))
        > 0) throw new BusinessException(409, "重叠服务容量超过额定功率");
    Long id =
        s.db.queryForObject(
            "INSERT INTO market_service(area_id,event_code,name,kind,starts_at,ends_at)"
                + " VALUES(?,?,?,?,?,?) RETURNING id",
            Long.class,
            n.areaId(),
            n.eventCode(),
            n.name(),
            n.kind(),
            n.startsAt(),
            n.endsAt());
    s.db.update(
        "INSERT INTO market_allocation(service_id,station_id,capacity_kw) VALUES(?,?,?)",
        id,
        n.stationId(),
        n.capacityKw());
    s.audit("market.draft", "service=" + id);
    return ApiResponse.ok(Map.of("id", id, "status", "draft", "externalSubmission", false));
  }

  @PostMapping("/market-drafts/{id}/cancel")
  @Transactional
  public ApiResponse<?> cancel(@PathVariable long id) {
    s.access.requirePermission("market.manage");
    var service = s.one("SELECT status FROM market_service WHERE id=? FOR UPDATE", id);
    var stations =
        s.db.queryForList(
            "SELECT station_id FROM market_allocation WHERE service_id=?", Long.class, id);
    if (stations.isEmpty()) throw new BusinessException(404, "服务无关联站点");
    stations.forEach(station -> s.access.requireStationPermission(station, "market.manage"));
    if (!service.get("status").equals("draft")) throw new BusinessException(409, "仅可取消内部草稿");
    s.db.update("UPDATE market_service SET status='withdrawn' WHERE id=?", id);
    s.audit("market.cancel", "service=" + id);
    return ApiResponse.ok(null);
  }
}
