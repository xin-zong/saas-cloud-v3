package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;

/** Replica device directory. Reads the existing canonical point adapter; never invents live values. */
@Service
public class ReferenceDeviceListService {
  private final DomainSupport s;
  private final StoredDeviceTelemetryService stored;
  public ReferenceDeviceListService(DomainSupport s,StoredDeviceTelemetryService stored){this.s=s;this.stored=stored;}
  static final Set<String> TYPES=Set.of("inverter","cabinet","pcs","battery-cluster","battery-stack","air-conditioner","meter","logger","ems");
  static final Set<String> COLUMNS=Set.of("name","status","stationName","configuration","architecture","stringDispersion","pvPower","pvTrend","pvDaily","fullPowerHours","pvTotal","normalization","stringCapacity","chargeStatus","batteryCurrent","batteryPower","acPower","dcPower","soc","soh","cellVoltageRange","cellVoltageAverage","cellVoltageMax","cellVoltageMin","cellTemperatureRange","cellTemperatureAverage","cellTemperatureMax","cellTemperatureMin","application","installation","parent","updatedAt");
  static void validateColumns(Object value){
    if(!(value instanceof Map<?,?> map)||map.size()>TYPES.size())throw new BusinessException(400,"设备列配置无效");
    for(var e:map.entrySet())if(!TYPES.contains(e.getKey())||!(e.getValue() instanceof List<?> list)||list.size()>COLUMNS.size()||new HashSet<>(list).size()!=list.size()||list.stream().anyMatch(c->!COLUMNS.contains(c)))throw new BusinessException(400,"设备列配置无效");
  }
  static Map<String,Object> point(Map<String,Object> row){
    var out=new LinkedHashMap<String,Object>();
    String reason=Objects.toString(row.get("staleReason"),"");
    boolean valid="valid".equals(row.get("quality"))&&!Boolean.TRUE.equals(row.get("conflict"))&&!reason.startsWith("future_");
    Object value=valid?row.get("value"):null;
    out.put("name",row.get("name"));out.put("unit",row.get("unit"));out.put("value",value);
    out.put("text",value instanceof String?value:null);out.put("quality",valid?"valid":"invalid");
    out.put("sourceAt",row.get("sourceTime") instanceof Number n?Instant.ofEpochMilli(n.longValue()).toString():null);
    out.put("stale",!reason.isEmpty());return out;
  }
  public Map<String,Object> list(Long stationId,boolean export){return list(stationId,export,null);}
  public Map<String,Object> list(Long stationId,boolean export,List<Long> deviceIds){
    if(deviceIds!=null&&(deviceIds.isEmpty()||deviceIds.size()>2000||deviceIds.stream().anyMatch(id->id==null||id<=0)))throw new BusinessException(400,"设备选择无效");
    var asset=new HashSet<>(s.access.stationIds("asset.read"));
    if(stationId!=null&&!asset.contains(stationId))throw new BusinessException(403,"无权查看该场站设备");
    var telemetry=new HashSet<>(s.access.stationIds("telemetry.read"));
    var exportScope=new HashSet<>(s.access.stationIds("report.export"));
    var raw=s.db.queryForList("""
      SELECT d.id,d.station_id,st.name AS station_name,d.name,d.serial_number,r.source_type,r.category,
        r.model,r.manufacturer,r.rated_power_kw,r.capacity_kwh,
        parent.name AS parent_name,parent.serial_number AS parent_serial,
        CASE WHEN o.observed_at<=now() AND o.observed_at>=now()-interval '90 seconds' THEN o.communication_status END AS communication_status
      FROM device d JOIN device_reference_import i ON i.device_id=d.id
      JOIN station_reference_import si ON si.station_id=d.station_id
      JOIN station st ON st.id=d.station_id
      LEFT JOIN device_reference_profile r ON r.device_id=d.id
      LEFT JOIN LATERAL(SELECT p.name,p.serial_number FROM device p WHERE p.station_id=d.station_id
        AND p.serial_number=i.provenance->'device'->'raw'->>'parentSerialNumber' ORDER BY p.id LIMIT 1) parent ON true
      LEFT JOIN device_observation o ON o.device_id=d.id
      WHERE EXISTS(SELECT 1 FROM saas_effective_station_permission p WHERE p.user_id=? AND p.client=? AND p.station_id=d.station_id AND p.permission_code='asset.read')
        AND (?::bigint IS NULL OR d.station_id=?) ORDER BY d.id LIMIT 2001
      """,s.access.userId(),s.access.client(),stationId,stationId);
    if(raw.size()>2000)throw new BusinessException(413,"设备过多，请选择场站缩小范围");
    if(deviceIds!=null){
      var requested=new HashSet<>(deviceIds);
      raw=raw.stream().filter(r->requested.contains(((Number)r.get("id")).longValue())&&asset.contains(((Number)r.get("station_id")).longValue())).toList();
      if(raw.size()!=requested.size())throw new BusinessException(403,"设备选择超出可访问范围");
    }
    var stations=new LinkedHashMap<Long,String>();
    for(var row:raw){long id=((Number)row.get("station_id")).longValue();if(asset.contains(id))stations.put(id,Objects.toString(row.get("station_name"),""));}
    if(export)for(long id:stations.keySet())s.access.requireStationPermission(id,"report.export");
    var points=new HashMap<String,List<Map<String,Object>>>();
    for(long id:stations.keySet())if(telemetry.contains(id))for(var p:stored.latest(id,List.of()))
      points.computeIfAbsent(p.get("deviceId").toString(),k->new ArrayList<>()).add(point(p));
    // Recheck permissions after loading telemetry so revocation cannot expose values.
    asset.retainAll(s.access.stationIds("asset.read"));telemetry.retainAll(s.access.stationIds("telemetry.read"));exportScope.retainAll(s.access.stationIds("report.export"));
    if(export)for(long id:stations.keySet())s.access.requireStationPermission(id,"report.export");
    var items=new ArrayList<Map<String,Object>>();
    for(var r:raw){
      long station=((Number)r.get("station_id")).longValue();if(!asset.contains(station))continue;
      String type=DeviceDetailRules.type(Objects.toString(r.get("source_type"),""),Objects.toString(r.get("category"),""));if(!TYPES.contains(type))continue;
      String id=r.get("id").toString();boolean canRead=telemetry.contains(station);
      var sample=canRead?points.getOrDefault(id,List.of()):List.<Map<String,Object>>of();
      var fields=new LinkedHashMap<String,Object>();
      for(var pair:List.of(new String[]{"model","model"},new String[]{"manufacturer","manufacturer"},new String[]{"ratedPowerKw","rated_power_kw"},new String[]{"capacityKwh","capacity_kwh"},new String[]{"parentName","parent_name"},new String[]{"parentSerial","parent_serial"}))fields.put(pair[0],r.get(pair[1]));
      var row=new LinkedHashMap<String,Object>();row.put("id",id);row.put("stationId",Long.toString(station));row.put("stationName",r.get("station_name"));row.put("name",r.get("name"));row.put("serial",r.get("serial_number"));row.put("type",type);
      row.put("status",canRead&&Set.of("online","offline").contains(Objects.toString(r.get("communication_status"),""))?r.get("communication_status"):"unknown");
      row.put("fields",fields);row.put("points",sample);row.put("telemetryAllowed",canRead);row.put("exportAllowed",exportScope.contains(station));
      row.put("updatedAt",sample.stream().map(p->p.get("sourceAt")).filter(Objects::nonNull).map(Object::toString).max(String::compareTo).orElse(null));
      row.put("stale",sample.isEmpty()||sample.stream().anyMatch(p->Boolean.TRUE.equals(p.get("stale"))));items.add(row);
    }
    return Map.of("items",items,"stations",stations.entrySet().stream().filter(e->asset.contains(e.getKey())).map(e->Map.of("id",e.getKey().toString(),"name",e.getValue())).toList());
  }
}
