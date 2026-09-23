package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class RevenueController {
  private final DomainSupport s;

  public RevenueController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/stations/{id}/settlements")
  public ApiResponse<?> settlements(
      @PathVariable long id,
      @RequestParam LocalDate from,
      @RequestParam LocalDate to,
      @RequestParam(defaultValue = "100") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    s.access.requireStationPermission(id, "revenue.read");
    if (to.isBefore(from) || from.plusYears(2).isBefore(to))
      throw new BusinessException(400, "查询范围应在两年内");
    var rows =
        s.db.queryForList(
            "SELECT r.*,c.code AS contract_code,c.currency FROM settlement_record r JOIN contract c"
                + " ON c.id=r.contract_id WHERE r.station_id=? AND r.recognition_date BETWEEN ? AND"
                + " ? AND r.recognition_date<=? ORDER BY r.recognition_date DESC,r.id DESC LIMIT"
                + " ? OFFSET ?",
            id,
            from,
            to,
            LocalDate.now(ZoneId.of("Asia/Shanghai")),
            s.limit(limit),
            s.offset(offset));
    for (var row : rows) {
      row.put(
          "lines",
          s.db.queryForList(
              "SELECT category,amount FROM settlement_line WHERE record_id=? ORDER BY category",
              row.get("id")));
      row.put(
          "payments",
          s.db.queryForList(
              "SELECT reference,amount,paid_on FROM settlement_payment WHERE record_id=? AND"
                  + " paid_on<=? ORDER BY paid_on",
              row.get("id"),
              to.isBefore(LocalDate.now(ZoneId.of("Asia/Shanghai")))
                  ? to
                  : LocalDate.now(ZoneId.of("Asia/Shanghai"))));
      row.put(
          "reviews",
          s.db.queryForList(
              "SELECT author_id,note,created_at FROM settlement_review WHERE record_id=? ORDER BY"
                  + " id",
              row.get("id")));
    }
    return ApiResponse.ok(rows);
  }

  public record Review(@NotBlank @Size(max = 4000) String note) {}

  @PostMapping("/settlements/{id}/reviews")
  @Transactional
  public ApiResponse<?> review(@PathVariable long id, @Valid @RequestBody Review n) {
    var r = s.one("SELECT station_id FROM settlement_record WHERE id=?", id);
    s.access.requireStationPermission(s.number(r, "station_id"), "revenue.review");
    s.db.update(
        "INSERT INTO settlement_review(record_id,author_id,note) VALUES(?,?,?)",
        id,
        s.access.userId(),
        n.note());
    s.audit("settlement.review", "record=" + id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/stations/{id}/market-services")
  public ApiResponse<?> market(
      @PathVariable long id,
      @RequestParam(defaultValue = "100") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    s.access.requireStationPermission(id, "market.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT m.*,a.capacity_kw,a.estimated_revenue,ma.name AS area_name FROM market_service"
                + " m JOIN market_allocation a ON a.service_id=m.id JOIN market_area ma ON"
                + " ma.id=m.area_id WHERE a.station_id=? ORDER BY starts_at DESC,m.id DESC LIMIT ?"
                + " OFFSET ?",
            id,
            s.limit(limit),
            s.offset(offset)));
  }

  @GetMapping("/stations/{id}/qualifications")
  public ApiResponse<?> qualifications(@PathVariable long id) {
    s.access.requireStationPermission(id, "market.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT q.*,a.name AS area_name FROM market_qualification q JOIN market_area a ON"
                + " a.id=q.area_id WHERE q.station_id=? ORDER BY q.id",
            id));
  }
}
