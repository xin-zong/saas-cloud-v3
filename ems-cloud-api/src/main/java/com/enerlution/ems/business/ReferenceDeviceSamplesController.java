package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import java.time.Instant;
import java.time.Duration;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.web.bind.annotation.*;

/** Read-only, explicitly historical reference observations, separate from live EMS telemetry. */
@RestController
@RequestMapping("/api/stations/{station}/devices/{device}/reference-samples")
public class ReferenceDeviceSamplesController {
  private final DomainSupport s;
  public ReferenceDeviceSamplesController(DomainSupport s){this.s=s;}
  private void authorize(long station,long device){
    s.access.requireStationPermission(station,"asset.read");
    s.access.requireStationPermission(station,"telemetry.read");
    s.one("SELECT id FROM device WHERE id=? AND station_id=?",device,station);
  }
  @GetMapping
  public ApiResponse<?> latest(@PathVariable long station,@PathVariable long device){
    authorize(station,device);
    var items=s.db.queryForList("""
      SELECT p.id,p.name,p.unit,p.source_host,x.source_at,x.captured_at,x.value::text AS value,
        x.raw_value,x.quality,x.source_url
      FROM reference_device_point p LEFT JOIN LATERAL (
        SELECT * FROM reference_device_sample a WHERE a.point_id=p.id
        ORDER BY a.source_at DESC,a.captured_at DESC,a.id DESC LIMIT 1
      ) x ON true WHERE p.device_id=? ORDER BY p.id
      """,device);
    authorize(station,device);
    return ApiResponse.ok(Map.of("items",items,"source","reference_capture"));
  }
  @GetMapping("/history")
  public ApiResponse<?> history(@PathVariable long station,@PathVariable long device,
      @RequestParam long pointId,@RequestParam Instant from,@RequestParam Instant to){
    authorize(station,device);
    if(!to.isAfter(from)||Duration.between(from,to).compareTo(Duration.ofDays(366))>0)
      throw new BusinessException(400,"请选择366天以内的有效时间范围");
    s.one("SELECT id FROM reference_device_point WHERE id=? AND device_id=?",pointId,device);
    var items=s.db.queryForList("""
      SELECT DISTINCT ON (source_at) source_at,captured_at,value::text AS value,raw_value,quality
      FROM reference_device_sample WHERE point_id=? AND source_at>=? AND source_at<?
      ORDER BY source_at,captured_at DESC,id DESC LIMIT 10001
      """,pointId,Timestamp.from(from),Timestamp.from(to));
    if(items.size()>10000)throw new BusinessException(400,"采样过多，请缩小时间范围");
    authorize(station,device);
    return ApiResponse.ok(Map.of("items",items,"source","reference_capture","interpolated",false));
  }
}
