package com.enerlution.ems.business;
import com.enerlution.ems.common.*;
import java.util.*;
import java.util.regex.Pattern;
import java.time.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
/** Pack ownership comes from captured parent edges and exact previously verified point identities. */
@RestController
@RequestMapping("/api/stations/{station}/reference-connections/{node}/battery-pack")
public class ReferenceBatteryPackController {
 private final DomainSupport s;
 private final StoredDeviceTelemetryService stored;
 @Autowired public ReferenceBatteryPackController(DomainSupport s,StoredDeviceTelemetryService stored){this.s=s;this.stored=stored;}
 ReferenceBatteryPackController(DomainSupport s){this(s,null);}
 static Map<String,Object> cell(String pack,String name,String unit){
  var m=Pattern.compile("电池包 "+Pattern.quote(pack)+" · (电压|温度) #([1-9][0-9]{0,5})").matcher(name);
  if(!m.matches()||!unit.equals(m.group(1).equals("电压")?"V":"℃"))return Map.of();
  return Map.of("kind",m.group(1).equals("电压")?"voltage":"temperature","index",Integer.parseInt(m.group(2)));
 }
 private Map<String,Object> identity(long station,long node){
  var rows=s.db.queryForList("""
   WITH RECURSIVE ancestry AS (
    SELECT n.*,ARRAY[n.id] AS path,false AS cycle FROM station_reference_connection_node n WHERE n.station_id=? AND n.id=?
    UNION ALL
    SELECT p.*,a.path||p.id,p.id=ANY(a.path) FROM ancestry a
     JOIN station_reference_connection_node p ON p.station_id=a.station_id AND p.serial_number=a.parent_serial_number
     WHERE NOT a.cycle
   )
   SELECT n.id,n.serial_number AS serial,n.source_type,n.parent_serial_number,d.id AS "parentDeviceId",
    cap.base_sn AS "baseSN",cap.cell_count AS "cellCount",cap.parent_sensor AS "parentSensor"
   FROM station_reference_connection_node n JOIN station st ON st.id=n.station_id AND st.archived_at IS NULL
   JOIN device d ON d.serial_number=n.parent_serial_number AND d.station_id=n.station_id AND d.archived_at IS NULL
   JOIN device_reference_import imp ON imp.device_id=d.id AND imp.station_source_id=n.source_station_id
   JOIN station_reference_import si ON si.station_id=n.station_id AND si.source_id=n.source_station_id AND si.source_host=imp.source_host
   JOIN station_reference_connection_node parent ON parent.station_id=n.station_id AND parent.serial_number=n.parent_serial_number AND parent.source_type='电池簇'
   LEFT JOIN reference_battery_pack_capture cap ON cap.connection_node_id=n.id AND cap.parent_device_id=d.id AND cap.parent_serial_number=n.parent_serial_number
   WHERE n.station_id=? AND n.id=? AND n.source_type='电池包'
    AND NOT EXISTS(SELECT 1 FROM ancestry a WHERE a.cycle OR EXISTS(SELECT 1 FROM device x WHERE x.serial_number=a.serial_number AND (x.archived_at IS NOT NULL OR x.station_id<>a.station_id)))
   """,station,node,station,node);
  if(rows.size()!=1)throw new BusinessException(404,"电池包身份尚未核验或设备已不可用");
  return new LinkedHashMap<>(rows.getFirst());
 }
 @GetMapping public ApiResponse<?> read(@PathVariable long station,@PathVariable long node){
  s.access.requireStationPermission(station,"asset.read");var archive=identity(station,node);
  long parent=s.number(archive,"parentDeviceId");String serial=archive.get("serial").toString();
  var points=new ArrayList<Map<String,Object>>();var observations=new ArrayList<Map<String,Object>>();
  boolean telemetry=s.access.hasStationPermission(s.access.userId(),station,"telemetry.read");
  var rows=s.db.queryForList("""
   SELECT b.measurement_point_id AS id,p.name,p.unit,p.id AS reference_id
   FROM reference_device_point p JOIN stored_device_point_binding b ON b.reference_point_id=p.id AND b.station_id=?
   JOIN measurement_point mp ON mp.id=b.measurement_point_id AND mp.device_id=p.device_id
   WHERE p.device_id=? AND p.source_host='ess-cloud-login.qudeox.com' ORDER BY p.id
   """,station,parent);
  for(var row:rows){
   var parsed=cell(serial,row.get("name").toString(),row.get("unit").toString());if(parsed.isEmpty())continue;
   var point=new LinkedHashMap<String,Object>(parsed);point.put("id",row.get("id"));point.put("name",row.get("name"));point.put("unit",row.get("unit"));points.add(point);
  }
  if(points.isEmpty())throw new BusinessException(404,"尚无已核验的电池包测点");
  if(telemetry){
   var selected=new LinkedHashMap<Long,Map<String,Object>>();
   for(var row:rows)if(!cell(serial,row.get("name").toString(),row.get("unit").toString()).isEmpty())selected.put(((Number)row.get("reference_id")).longValue(),row);
   var samples=s.db.queryForList("""
     SELECT sample.point_id AS reference_id,value,quality,source_at AS "sourceTime",captured_at AS "capturedAt",
      EXISTS(SELECT 1 FROM reference_device_sample other WHERE other.point_id=sample.point_id AND other.source_at=sample.source_at
       AND (other.quality,other.value,CASE WHEN other.quality='text' THEN other.raw_value END)
       IS DISTINCT FROM (sample.quality,sample.value,CASE WHEN sample.quality='text' THEN sample.raw_value END)) AS conflict
     FROM unnest(ARRAY[
     """+EmsTelemetryQueries.ids(selected.keySet())+"]::bigint[]) ids(point_id) JOIN LATERAL (SELECT * FROM reference_device_sample a WHERE a.point_id=ids.point_id AND a.source_at<=now() AND a.captured_at<=now() ORDER BY a.source_at DESC,a.captured_at DESC,a.id DESC LIMIT 1) sample ON true ORDER BY sample.point_id",new Object[0]);
   for(var value:samples){
    var row=selected.get(((Number)value.get("reference_id")).longValue());if(row==null)throw new BusinessException(409,"测点归属已变化");
    var sample=new LinkedHashMap<String,Object>(cell(serial,row.get("name").toString(),row.get("unit").toString()));sample.put("name",row.get("name"));sample.put("unit",row.get("unit"));sample.put("pointId",row.get("id"));sample.putAll(value);sample.remove("reference_id");
     if(Boolean.TRUE.equals(sample.get("conflict"))){sample.put("value",null);sample.put("quality","invalid");}
     observations.add(sample);
   }
  }
  Map<String,Object> energyGroup=null;
  if(telemetry){
   var energy=s.db.queryForList("""
    SELECT charge_kwh AS "chargeKwh",discharge_kwh AS "dischargeKwh",source_at AS "sourceTime",captured_at AS "capturedAt"
    FROM reference_battery_pack_capture WHERE connection_node_id=? AND parent_device_id=? AND base_sn=?
     AND parent_serial_number=? AND energy_group_present AND source_at<=now() AND captured_at<=now()
    """,node,parent,serial,archive.get("parent_serial_number"));
   if(energy.size()==1)energyGroup=new LinkedHashMap<>(energy.getFirst());
  }
  // Revalidate authorization and ownership after sample reads, including ancestor moves/archives.
  var checked=identity(station,node);if(!Objects.equals(checked.get("parentDeviceId"),archive.get("parentDeviceId"))||!Objects.equals(checked.get("serial"),serial))throw new BusinessException(404,"设备归属已变化");
  s.access.requireStationPermission(station,"asset.read");
  if(!s.access.hasStationPermission(s.access.userId(),station,"telemetry.read")){observations.clear();energyGroup=null;}
  archive.put("id","reference-connection:"+node);
  var result=new LinkedHashMap<String,Object>(Map.of("type","battery-pack","evidenceSource","reference-capture","archive",archive,"points",points,"observations",observations,"historyDeviceId",parent));
  result.put("energyGroup",energyGroup);return ApiResponse.ok(result);
 }
 private void authorizePoint(long station,long node,long point){
  s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");
  var pack=identity(station,node);
  var rows=s.db.queryForList("""
   SELECT p.name,p.unit FROM reference_device_point p
   JOIN stored_device_point_binding b ON b.reference_point_id=p.id AND b.station_id=?
   JOIN measurement_point mp ON mp.id=b.measurement_point_id AND mp.device_id=p.device_id
   WHERE b.measurement_point_id=? AND p.device_id=? AND p.source_host='ess-cloud-login.qudeox.com'
   """,station,point,pack.get("parentDeviceId"));
  if(rows.size()!=1||cell(pack.get("serial").toString(),rows.getFirst().get("name").toString(),rows.getFirst().get("unit").toString()).isEmpty())throw new BusinessException(404,"测点不属于所选电池包");
 }
 @GetMapping("/history") public ApiResponse<?> history(@PathVariable long station,@PathVariable long node,
   @RequestParam long pointId,@RequestParam OffsetDateTime from,@RequestParam OffsetDateTime to,
   @RequestParam(defaultValue="15") int minutes,@RequestParam(defaultValue="avg") String aggregation){
  authorizePoint(station,node,pointId);
  if(!Set.of(1,5,15,30,60).contains(minutes)||!to.isAfter(from)||Duration.between(from,to).compareTo(Duration.ofDays(31))>0||!Set.of("last","avg","min","max").contains(aggregation))throw new BusinessException(400,"历史时段或聚合方式无效");
  var metadata=stored.directory(station,List.of(pointId));
  if(metadata.size()!=1)throw new BusinessException(409,"测点归属已变化");
  if(!((List<?>)metadata.getFirst().get("supportedAggregations")).contains(aggregation))throw new BusinessException(400,"该测点不支持所选聚合方式");
  long until=Math.min(to.toInstant().toEpochMilli(),Instant.now().toEpochMilli());
  var result=until<=from.toInstant().toEpochMilli()?new ArrayList<Map<String,Object>>():EmsTelemetryQueries.aggregate(stored.historyRows(pointId,from.toInstant().toEpochMilli(),until),aggregation,minutes);
  for(var row:result){row.put("source","stored_device");row.put("sourceType","stored_device");}
  authorizePoint(station,node,pointId);
  return ApiResponse.ok(result);
 }
 private Map<String,Object> authorizePoints(long station,long node,List<Long> points){
  s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");
  var pack=identity(station,node);
  var rows=s.db.queryForList("""
   SELECT b.measurement_point_id AS id,p.name,p.unit FROM reference_device_point p
   JOIN stored_device_point_binding b ON b.reference_point_id=p.id AND b.station_id=?
   JOIN measurement_point mp ON mp.id=b.measurement_point_id AND mp.device_id=p.device_id
   JOIN device d ON d.id=mp.device_id AND d.station_id=b.station_id AND d.archived_at IS NULL
   WHERE p.device_id=? AND p.source_host='ess-cloud-login.qudeox.com'
   """+" AND b.measurement_point_id IN ("+EmsTelemetryQueries.ids(points)+")",station,pack.get("parentDeviceId"));
  var found=new HashSet<Long>();
  for(var row:rows){if(cell(pack.get("serial").toString(),row.get("name").toString(),row.get("unit").toString()).isEmpty())throw new BusinessException(404,"测点不属于所选电池包");found.add(((Number)row.get("id")).longValue());}
  if(found.size()!=points.size()||!found.containsAll(points))throw new BusinessException(404,"测点不属于所选电池包");
  return pack;
 }
 @GetMapping("/history-batch") public ApiResponse<?> historyBatch(@PathVariable long station,@PathVariable long node,
   @RequestParam List<Long> pointIds,@RequestParam OffsetDateTime from,@RequestParam OffsetDateTime to,
   @RequestParam(defaultValue="15") int minutes,@RequestParam(defaultValue="last") String aggregation){
  StoredHistoryBatch.validate(pointIds,from,to,minutes,aggregation);
  var before=authorizePoints(station,node,pointIds);
  var metadata=stored.directory(station,pointIds);
  if(metadata.size()!=pointIds.size()||metadata.stream().anyMatch(m->!Objects.equals(m.get("device_id"),before.get("parentDeviceId"))))throw new BusinessException(409,"测点归属已变化");
  var result=StoredHistoryBatch.read(stored,pointIds,metadata,from,to,minutes,aggregation);
  var after=authorizePoints(station,node,pointIds);
  if(!Objects.equals(before.get("parentDeviceId"),after.get("parentDeviceId"))||!Objects.equals(before.get("serial"),after.get("serial")))throw new BusinessException(409,"电池包归属已变化");
  return ApiResponse.ok(result);
 }
}
