package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ReportController {
  private final DomainSupport s;

  public ReportController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/stations/{id}/reports/{kind}")
  public ResponseEntity<String> report(
      @PathVariable long id,
      @PathVariable String kind,
      @RequestParam LocalDate from,
      @RequestParam LocalDate to) {
    s.access.requireStationPermission(id, "report.export");
    if (to.isBefore(from) || to.isAfter(from.plusYears(1)))
      throw new BusinessException(400, "报告日期范围无效");
    List<Map<String, Object>> rows;
    if (kind.equals("revenue")) {
      s.access.requireStationPermission(id, "revenue.read");
      rows =
          s.db.queryForList(
              "SELECT r.reference,r.recognition_date,c.currency,r.status,l.category,l.amount FROM"
                  + " settlement_record r JOIN contract c ON c.id=r.contract_id LEFT JOIN"
                  + " settlement_line l ON l.record_id=r.id WHERE r.station_id=? AND"
                  + " r.recognition_date BETWEEN ? AND ? AND r.recognition_date<=? ORDER BY"
                  + " r.recognition_date,r.id,l.category",
              id,
              from,
              to,
              LocalDate.now(ZoneId.of("Asia/Shanghai")));
    } else if (kind.equals("health")) {
      s.access.requireStationPermission(id, "asset.read");
      rows =
          s.db.queryForList(
              "SELECT d.code,d.name,o.observed_at,o.communication_status,o.health_score FROM device"
                  + " d LEFT JOIN device_observation o ON o.device_id=d.id WHERE d.station_id=? AND"
                  + " o.observed_at>=?::date::timestamp AT TIME ZONE 'Asia/Shanghai' AND"
                  + " o.observed_at<(?::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai' AND"
                  + " o.observed_at<=now() ORDER BY d.id",
              id,
              from,
              to);
    } else if (kind.equals("operations")) {
      s.access.requireStationPermission(id, "strategy.read");
      rows =
          s.db.queryForList(
              "SELECT"
                  + " s.code,s.name,p.service_date,p.version,p.status,t.start_minute,t.end_minute,t.mode,t.power_kw"
                  + " FROM station s JOIN operating_plan p ON p.station_id=s.id JOIN plan_period t"
                  + " ON t.plan_id=p.id WHERE s.id=? AND p.service_date BETWEEN ? AND ? ORDER BY"
                  + " p.service_date,p.version,t.start_minute",
              id,
              from,
              to);
    } else throw new BusinessException(404, "未知报告类型");
    StringBuilder csv = new StringBuilder("\ufeff");
    if (rows.isEmpty()) csv.append("无记录\r\n");
    else {
      csv.append(String.join(",", rows.getFirst().keySet())).append("\r\n");
      for (var row : rows) {
        csv.append(String.join(",", row.values().stream().map(ReportController::cell).toList()))
            .append("\r\n");
      }
    }
    s.audit("report.export", "station=" + id + ",kind=" + kind + ",from=" + from + ",to=" + to);
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            "attachment; filename=report-" + id + "-" + kind + ".csv")
        .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
        .body(csv.toString());
  }

  static String cell(Object value) {
    String text = value == null ? "" : value.toString();
    if (!text.isEmpty() && "=+@-\t\r\n".indexOf(text.charAt(0)) >= 0) text = "'" + text;
    return "\"" + text.replace("\"", "\"\"") + "\"";
  }
}
