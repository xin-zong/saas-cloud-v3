package com.enerlution.ems.business;

import com.enerlution.ems.auth.PermissionCatalog;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class AssetController {
  private final DomainSupport s;

  public AssetController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/stations")
  public ApiResponse<?> stations(
      @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT s.* FROM station s JOIN effective_station_permission us ON us.station_id=s.id"
                + " WHERE us.user_id=? AND us.permission_code='asset.read' ORDER BY s.id LIMIT ?"
                + " OFFSET ?",
            s.access.userId(),
            s.limit(limit),
            s.offset(offset)));
  }

  @GetMapping("/stations/{id}")
  public ApiResponse<?> station(@PathVariable long id) {
    s.access.requireStationPermission(id, "asset.read");
    return ApiResponse.ok(s.one("SELECT * FROM station WHERE id=?", id));
  }

  /**
   * Identity context for independent station capabilities; never exposes technical asset fields.
   */
  @GetMapping("/stations/options")
  public ApiResponse<?> stationOptions(@RequestParam(required = false) String permission) {
    var entry = permission == null ? null : PermissionCatalog.find(permission);
    if (entry == null || !entry.available() || !"station".equals(entry.scope()))
      throw new BusinessException(400, "请选择可用的站点权限");
    s.access.requirePermission(permission);
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT st.id,st.name FROM station st JOIN effective_station_permission p ON"
                + " p.station_id=st.id WHERE p.user_id=? AND p.permission_code=? ORDER BY st.id",
            s.access.userId(),
            permission));
  }

  public record Edit(
      @NotBlank @Size(max = 160) String name,
      @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal ratedPowerKw,
      @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal capacityKwh,
      @Size(max = 80) String region,
      @Size(max = 300) String address,
      @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
      @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
      JsonNode customerId) {
    public Edit(
        String name,
        BigDecimal ratedPowerKw,
        BigDecimal capacityKwh,
        String region,
        String address,
        BigDecimal longitude,
        BigDecimal latitude) {
      this(name, ratedPowerKw, capacityKwh, region, address, longitude, latitude, null);
    }
  }

  @PutMapping("/stations/{id}")
  @Transactional
  public ApiResponse<?> edit(@PathVariable long id, @Valid @RequestBody Edit e) {
    s.db.execute("SELECT pg_advisory_xact_lock(78291001)");
    s.access.requireStationPermission(id, "asset.edit");
    s.access.requireStationPermission(id, "asset.read");
    s.one("SELECT id FROM station WHERE id=? FOR UPDATE", id);
    if (Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM plan_period p JOIN operating_plan op ON op.id=p.plan_id"
                + " WHERE op.station_id=? AND p.power_kw>?)",
            Boolean.class,
            id,
            e.ratedPowerKw()))) throw new BusinessException(409, "额定功率低于既有计划功率");
    var commitments =
        s.db.query(
            "SELECT m.starts_at,m.ends_at,a.capacity_kw FROM market_allocation a JOIN"
                + " market_service m ON m.id=a.service_id WHERE a.station_id=? AND"
                + " m.status NOT IN ('cancelled','withdrawn') AND m.ends_at>now()",
            (rs, index) ->
                new BusinessRules.CapacityWindow(
                    rs.getTimestamp("starts_at").toInstant(),
                    rs.getTimestamp("ends_at").toInstant(),
                    rs.getBigDecimal("capacity_kw")),
            id);
    if (BusinessRules.peakCapacity(commitments).compareTo(e.ratedPowerKw()) > 0)
      throw new BusinessException(409, "额定功率低于已有市场承诺");
    if (e.customerId() != null) new CustomerWorkflows(s).assign(id, e.customerId());
    s.db.update(
        "UPDATE station SET"
            + " name=?,rated_power_kw=?,capacity_kwh=?,region=?,address=?,longitude=?,latitude=?"
            + " WHERE id=?",
        e.name(),
        e.ratedPowerKw(),
        e.capacityKwh(),
        e.region(),
        e.address(),
        e.longitude(),
        e.latitude(),
        id);
    s.audit("station.edit", "station=" + id);
    return ApiResponse.ok(s.one("SELECT * FROM station WHERE id=?", id));
  }

  @GetMapping("/stations/{id}/devices")
  public ApiResponse<?> devices(@PathVariable long id) {
    s.access.requireStationPermission(id, "asset.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT d.*,m.name AS model_name,m.category,o.observed_at,CASE WHEN o.observed_at>now()"
                + " THEN NULL WHEN o.observed_at<now()-interval '15 minutes' THEN 'offline' ELSE"
                + " o.communication_status END AS communication_status,CASE WHEN o.observed_at"
                + " BETWEEN now()-interval '24 hours' AND now() THEN o.health_score ELSE NULL END"
                + " AS health_score,o.firmware_version FROM device d LEFT JOIN device_model m ON"
                + " m.id=d.model_id LEFT JOIN device_observation o ON o.device_id=d.id WHERE"
                + " d.station_id=? ORDER BY d.id",
            id));
  }

  @GetMapping("/stations/{id}/points")
  public ApiResponse<?> points(@PathVariable long id) {
    s.access.requireStationPermission(id, "telemetry.read");
    var points=s.db.queryForList(
            "SELECT p.*,k.name,k.unit,d.name AS device_name FROM measurement_point p JOIN device d ON d.id=p.device_id"
                + " JOIN measurement_kind k ON k.code=p.kind_code WHERE d.station_id=? ORDER BY"
                + " p.id",
            id);
    var definitions=s.db.queryForList("""
      SELECT pb.measurement_point_id,pd.source_id,pd.namespace,pd.value_type,pd.aggregation,d.role AS subsystem
      FROM point_binding pb JOIN device_binding d ON d.id=pb.device_binding_id
      JOIN ems_binding_period p ON p.id=d.binding_period_id JOIN point_definition pd ON pd.id=pb.definition_id
      WHERE p.station_id=? AND p.valid_to IS NULL AND d.valid_to IS NULL AND pb.valid_to IS NULL
        AND greatest(p.valid_from,d.valid_from,pb.valid_from)<=clock_timestamp()
      """,id);
    for(var point:points) {
      var matches=definitions.stream().filter(d->Objects.equals(d.get("measurement_point_id"),point.get("id"))).toList();
      point.put("source",matches.isEmpty()?"legacy":"ems");
      if(matches.size()==1){var d=matches.getFirst();point.put("sourceId",d.get("source_id"));point.put("namespace",d.get("namespace"));point.put("subsystem",d.get("subsystem"));point.put("valueType",d.get("value_type"));point.put("aggregation",d.get("aggregation"));point.put("supportedAggregations",StationTelemetryService.aggregations(d.get("value_type"),d.get("aggregation")));}
      else {point.put("supportedAggregations",matches.isEmpty()?List.of("avg"):List.of());point.put("mappingStatus",matches.isEmpty()?"unmapped":"ambiguous");}
    }
    return ApiResponse.ok(points);
  }

  @GetMapping("/stations/{id}/topology")
  public ApiResponse<?> topology(@PathVariable long id) {
    s.access.requireStationPermission(id, "asset.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT t.* FROM topology_connection t JOIN device a ON a.id=t.source_device_id JOIN"
                + " device b ON b.id=t.target_device_id WHERE a.station_id=? AND b.station_id=?",
            id,
            id));
  }
}
