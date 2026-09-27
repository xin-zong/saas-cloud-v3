package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class TelemetryController {
  private final DomainSupport s;
  private final String database;
  private final EmsTelemetryQueries typed;

  public TelemetryController(
      DomainSupport s,
      ObjectMapper json,
      @Value("${ems.clickhouse.url}") String url,
      @Value("${ems.clickhouse.username}") String user,
      @Value("${ems.clickhouse.password}") String password,
      @Value("${EMS_CH_DATABASE:ems_cloud_v2_proto_telemetry}") String database,
      EmsTelemetryQueries typed) {
    this.s = s;
    this.database = database;
    this.typed=typed;
    if (!database.equals("ems_cloud_v2_proto_telemetry"))
      throw new IllegalArgumentException("Only new telemetry database is permitted");
  }

  @GetMapping("/points/{id}/history")
  public ApiResponse<?> history(
      @PathVariable long id,
      @RequestParam OffsetDateTime from,
      @RequestParam OffsetDateTime to,
      @RequestParam(defaultValue = "15") int minutes,
      @RequestParam(defaultValue = "legacy") String source,
      @RequestParam(defaultValue = "avg") String aggregation) {
    var point =
        s.one(
            "SELECT d.station_id FROM measurement_point p JOIN device d ON d.id=p.device_id WHERE"
                + " p.id=?",
            id);
    if (!Set.of(1, 5, 15, 30, 60).contains(minutes)
        || !to.isAfter(from)
        || Duration.between(from, to).compareTo(Duration.ofDays(31)) > 0)
      throw new BusinessException(400, "查询应为 31 天内有效时段，粒度为 1/5/15/30/60 分钟");
    long until = Math.min(to.toInstant().toEpochMilli(), Instant.now().toEpochMilli());
    if(source.equals("ems")) {
      if(!EmsTelemetryQueries.OPERATIONS.contains(aggregation))throw new BusinessException(400,"不支持的聚合方式");
      // A moved point is insufficient authority: filter saved fact periods by their original station.
      var periods=s.db.queryForList("""
        SELECT DISTINCT p.id FROM point_binding pb JOIN device_binding d ON d.id=pb.device_binding_id
        JOIN ems_binding_period p ON p.id=d.binding_period_id
        JOIN effective_station_permission a ON a.station_id=p.station_id
          AND a.user_id=? AND a.permission_code='telemetry.read'
        WHERE pb.measurement_point_id=? AND pb.valid_from<? AND (pb.valid_to IS NULL OR pb.valid_to>?)
        """,Long.class,s.access.userId(),id,to,from);
      if(periods.isEmpty()) {
        s.access.requireStationPermission(s.number(point,"station_id"),"telemetry.read");
        return ApiResponse.ok(List.of());
      }
      String semanticScope=" FROM point_binding pb JOIN point_definition d ON d.id=pb.definition_id JOIN device_binding b ON b.id=pb.device_binding_id WHERE pb.measurement_point_id=? AND b.binding_period_id IN ("+EmsTelemetryQueries.ids(periods)+")";
      if(Set.of("avg","min","max").contains(aggregation)&&!Boolean.TRUE.equals(s.db.queryForObject("SELECT bool_and(d.value_type='number' AND d.aggregation IN ('average','min','max'))"+semanticScope,Boolean.class,id)))
        throw new BusinessException(400,"该点的连续量聚合语义尚未确认，请使用 last");
      if(aggregation.equals("delta")&&!Boolean.TRUE.equals(s.db.queryForObject("SELECT bool_and(d.value_type='number' AND d.aggregation='delta')"+semanticScope,Boolean.class,id)))
        throw new BusinessException(400,"累计量的差值语义尚未确认");
      if(until<=from.toInstant().toEpochMilli())return ApiResponse.ok(List.of());
      return ApiResponse.ok(EmsTelemetryQueries.aggregate(typed.history(id,periods,from.toInstant().toEpochMilli(),until),aggregation,minutes));
    }
    if(!source.equals("legacy")||!aggregation.equals("avg"))throw new BusinessException(400,"旧历史仅支持显式 legacy/avg 来源");
    s.access.requireStationPermission(s.number(point,"station_id"),"telemetry.read");
    if (until <= from.toInstant().toEpochMilli()) return ApiResponse.ok(List.of());
    String sql =
        "SELECT toUnixTimestamp64Milli(toDateTime64(toStartOfInterval(sampled_at, INTERVAL "
            + minutes
            + " MINUTE),3,'UTC')) AS timestamp,avg(value) AS value,count() AS samples FROM "
            + database
            + ".measurement_sample FINAL WHERE point_id="
            + id
            + " AND sampled_at>=fromUnixTimestamp64Milli("
            + from.toInstant().toEpochMilli()
            + ") AND sampled_at<fromUnixTimestamp64Milli("
            + until
            + ") GROUP BY timestamp ORDER BY timestamp LIMIT 44640 FORMAT JSON";
    var rows=typed.query(sql.substring(0,sql.length()-" FORMAT JSON".length()));
    for(var row:rows)if(row instanceof com.fasterxml.jackson.databind.node.ObjectNode object) {
      object.put("source","legacy_measurement_sample");object.put("provenance","legacy_origin_unverified");
    }
    return ApiResponse.ok(rows);
  }

}
