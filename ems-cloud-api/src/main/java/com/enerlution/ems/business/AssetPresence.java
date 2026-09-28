package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.web.bind.annotation.*;

/** Communication evidence only; never implies running, healthy, or that sibling devices are online. */
@RestController
@RequestMapping("/api/stations")
public class AssetPresence {
  private final DomainSupport s;
  private final EmsTelemetryQueries telemetry;
  public AssetPresence(DomainSupport s,EmsTelemetryQueries telemetry){this.s=s;this.telemetry=telemetry;}

  @GetMapping("/{id}/presence")
  public ApiResponse<?> presence(@PathVariable long id) {
    s.access.requireStationPermission(id,"asset.read");
    var result=snapshot(id);
    s.access.requireStationPermission(id,"asset.read");
    return ApiResponse.ok(result);
  }
  Map<String,Object> snapshot(long id) {
    var gateways=s.db.queryForList("""
      SELECT p.id,g.device_id,c.reachable,c.last_fresh_heartbeat
      FROM ems_binding_period p JOIN ems_gateway g USING(ems_uuid)
      LEFT JOIN ems_connection_read c USING(ems_uuid)
      WHERE p.station_id=? AND p.valid_to IS NULL AND p.valid_from<=clock_timestamp()
      """,id);
    var result=new LinkedHashMap<String,Object>();
    result.put("stationId",Long.toString(id));
    result.put("status",gateways.stream().anyMatch(g->Boolean.TRUE.equals(g.get("reachable")))?"online":
      gateways.stream().anyMatch(g->g.get("last_fresh_heartbeat")!=null)?"offline":null);
    var devices=new LinkedHashMap<Long,Map<String,Object>>();
    for(var g:gateways) devices.put(((Number)g.get("device_id")).longValue(),device(g.get("device_id"),
      Boolean.TRUE.equals(g.get("reachable"))?"online":g.get("last_fresh_heartbeat")==null?null:"offline",instant(g.get("last_fresh_heartbeat"))));
    var mappings=s.db.queryForList("""
      SELECT d.device_id,d.binding_period_id,pb.measurement_point_id,
        greatest(p.valid_from,d.valid_from,pb.valid_from) AS valid_from,c.reachable
      FROM device_binding d JOIN ems_binding_period p ON p.id=d.binding_period_id
      JOIN point_binding pb ON pb.device_binding_id=d.id
      JOIN device a ON a.id=d.device_id AND a.station_id=p.station_id
      LEFT JOIN ems_connection_read c ON c.ems_uuid=p.ems_uuid
      WHERE p.station_id=? AND p.valid_to IS NULL AND d.valid_to IS NULL AND pb.valid_to IS NULL
        AND greatest(p.valid_from,d.valid_from,pb.valid_from)<=clock_timestamp() AND d.role<>'ems'
      """,id);
    var periods=gateways.stream().map(g->((Number)g.get("id")).longValue()).toList();
    var points=mappings.stream().map(m->((Number)m.get("measurement_point_id")).longValue()).distinct().toList();
    var observations=new HashMap<String,Map<String,Object>>();
    for(int offset=0;offset<points.size();offset+=2000)
      for(var row:telemetry.latest(periods,points.subList(offset,Math.min(offset+2000,points.size())))) observations.put(row.get("pointId").toString(),row);
    Instant now=Instant.now();
    for(var m:mappings) {
      long deviceId=((Number)m.get("device_id")).longValue();
      var row=observations.get(m.get("measurement_point_id").toString());
      Instant received=null,source=null;
      if(row!=null && Objects.equals(row.get("bindingPeriodId"),m.get("binding_period_id").toString())) {
        received=millis(row.get("receivedAt"));
        if(received!=null && received.isBefore(instant(m.get("valid_from")))) received=null;
        if("valid".equals(row.get("quality"))) source=millis(row.get("sourceTime"));
      }
      String status=classify(Boolean.TRUE.equals(m.get("reachable")),received,source,now);
      var candidate=device(deviceId,status,received);
      var previous=devices.get(deviceId);
      if(previous==null || rank(status)>rank((String)previous.get("status"))) devices.put(deviceId,candidate);
    }
    result.put("devices",devices.values());
    return result;
  }
  static String classify(boolean reachable,Instant received,Instant source,Instant now) {
    if(!reachable)return "offline";
    if(received==null||received.isAfter(now))return null;
    if(received.isBefore(now.minusSeconds(90)))return "offline";
    if(source==null||source.isAfter(now))return null;
    return source.isBefore(now.minusSeconds(90))?"offline":"online";
  }
  private static int rank(String status){return "online".equals(status)?2:"offline".equals(status)?1:0;}
  private static Map<String,Object> device(Object id,String status,Instant at){var row=new LinkedHashMap<String,Object>();row.put("id",id.toString());row.put("status",status);row.put("observedAt",at==null?null:at.toString());return row;}
  private static Instant millis(Object value){return value instanceof Number n?Instant.ofEpochMilli(n.longValue()):null;}
  private static Instant instant(Object value){return value instanceof Timestamp t?t.toInstant():value instanceof java.time.OffsetDateTime t?t.toInstant():null;}
}
