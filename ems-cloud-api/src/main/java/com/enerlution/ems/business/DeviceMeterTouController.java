package com.enerlution.ems.business;
import com.enerlution.ems.common.*;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;
import org.springframework.web.bind.annotation.*;
/** Read-only local mock interval energy. No hardware calls or inferred counter differences. */
@RestController
@RequestMapping("/api/stations/{station}/devices/{device}/meter-tou")
public class DeviceMeterTouController {
 private final DomainSupport s;
 public DeviceMeterTouController(DomainSupport s){this.s=s;}
 @GetMapping public ApiResponse<?> read(@PathVariable long station,@PathVariable long device,@RequestParam String month,@RequestParam(defaultValue="positive") String direction,@RequestParam(defaultValue="false") boolean exporting){
  s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");
  if(exporting)s.access.requireStationPermission(station,"report.export");
  YearMonth selected;
  try{if(!month.matches("\\d{4}-\\d{2}"))throw new DateTimeParseException("month",month,0);selected=YearMonth.parse(month);if(selected.getYear()<2000||selected.getYear()>2100)throw new DateTimeParseException("year",month,0);}catch(DateTimeParseException e){throw new BusinessException(400,"请选择有效月份");}
  if(!Set.of("positive","negative").contains(direction))throw new BusinessException(400,"电能方向无效");
  var archive=s.one("""
   SELECT d.id,coalesce(r.source_type,'') AS source_type,coalesce(m.category,r.category,'OTHER') AS category,
    coalesce(nullif(p.timezone,''),'UTC') AS timezone
   FROM device d JOIN station st ON st.id=d.station_id LEFT JOIN device_reference_profile r ON r.device_id=d.id
   LEFT JOIN device_model m ON m.id=d.model_id LEFT JOIN station_profile p ON p.station_id=d.station_id
   WHERE d.id=? AND d.station_id=? AND d.archived_at IS NULL AND st.archived_at IS NULL
   """,device,station);
  if(!"meter".equals(DeviceDetailRules.type(Objects.toString(archive.get("source_type"),""),Objects.toString(archive.get("category"),""))))throw new BusinessException(400,"仅电表支持分时电能");
  String timezone=Objects.toString(archive.get("timezone"),"UTC");
  try{ZoneId.of(timezone);}catch(DateTimeException e){throw new BusinessException(400,"场站时区无效");}
  var items=s.db.queryForList("""
   SELECT local_date AS date,interval_index AS interval,energy_kwh::text AS value,quality,source_time AS "sourceTime",
    dataset_id AS "datasetId",dataset_version AS "datasetVersion",mocked
   FROM device_meter_tou WHERE device_id=? AND local_date>=? AND local_date<? AND timezone=? AND direction=? AND active
    AND EXISTS(SELECT 1 FROM device owned WHERE owned.id=device_meter_tou.device_id AND owned.station_id=? AND owned.archived_at IS NULL)
   ORDER BY local_date,interval_index
   """,device,java.sql.Date.valueOf(selected.atDay(1)),java.sql.Date.valueOf(selected.plusMonths(1).atDay(1)),timezone,direction,station);
  s.one("SELECT id FROM device WHERE id=? AND station_id=? AND archived_at IS NULL",device,station);
  s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");
  if(exporting)s.access.requireStationPermission(station,"report.export");
  return ApiResponse.ok(Map.of("items",items,"month",month,"direction",direction,"timezone",timezone,"unit","kWh","source","mock_dataset","intervalMinutes",15,"mocked",true));
 }
}
