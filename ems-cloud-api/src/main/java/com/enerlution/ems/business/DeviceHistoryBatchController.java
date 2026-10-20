package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

/** Bounded stored-history reads; native telemetry retains its existing history endpoint. */
@RestController
@RequestMapping("/api/stations/{station}/devices/{device}")
public class DeviceHistoryBatchController {
 private final DomainSupport s;
 private final StoredDeviceTelemetryService stored;
 public DeviceHistoryBatchController(DomainSupport s,StoredDeviceTelemetryService stored,ObjectMapper json){this.s=s;this.stored=stored;}
 private void authorize(long station,long device,List<Long> points){
  s.access.requireStationPermission(station,"asset.read");
  s.access.requireStationPermission(station,"telemetry.read");
  // Both current device station and immutable binding station must match, before AND after loading.
  var owned=s.db.queryForList("""
   SELECT mp.id FROM measurement_point mp JOIN device d ON d.id=mp.device_id
   JOIN station st ON st.id=d.station_id
   JOIN stored_device_point_binding b ON b.measurement_point_id=mp.id AND b.station_id=d.station_id
   JOIN reference_device_point rp ON rp.id=b.reference_point_id AND rp.device_id=d.id
   WHERE d.id=? AND d.station_id=? AND b.station_id=? AND d.archived_at IS NULL AND st.archived_at IS NULL
   """+" AND mp.id IN ("+EmsTelemetryQueries.ids(points)+")",device,station,station);
  var ids=new HashSet<Long>();for(var row:owned)ids.add(((Number)row.get("id")).longValue());
  if(ids.size()!=points.size()||!ids.containsAll(points))throw new BusinessException(404,"测点不属于所选设备或原站点");
 }
 @GetMapping("/history-batch") public ApiResponse<?> history(@PathVariable long station,@PathVariable long device,
   @RequestParam List<Long> pointIds,@RequestParam OffsetDateTime from,@RequestParam OffsetDateTime to,
   @RequestParam(defaultValue="15") int minutes,@RequestParam(defaultValue="last") String aggregation){
  StoredHistoryBatch.validate(pointIds,from,to,minutes,aggregation);
  authorize(station,device,pointIds);
  var metadata=stored.directory(station,pointIds);
  if(metadata.size()!=pointIds.size()||metadata.stream().anyMatch(m->((Number)m.get("device_id")).longValue()!=device))throw new BusinessException(409,"测点归属已变化");
  var result=StoredHistoryBatch.read(stored,pointIds,metadata,from,to,minutes,aggregation);
  authorize(station,device,pointIds);
  return ApiResponse.ok(result);
 }
}
