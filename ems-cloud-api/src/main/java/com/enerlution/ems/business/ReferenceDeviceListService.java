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
  private final StationBusinessGroupService businessGroups;
  public ReferenceDeviceListService(DomainSupport s,StoredDeviceTelemetryService stored){this(s,stored,new StationBusinessGroupService(s));}
  @org.springframework.beans.factory.annotation.Autowired
  public ReferenceDeviceListService(DomainSupport s,StoredDeviceTelemetryService stored,StationBusinessGroupService businessGroups){this.s=s;this.stored=stored;this.businessGroups=businessGroups;}
  static final Set<String> TYPES=Set.of("inverter","cabinet","pcs","battery-cluster","battery-stack","air-conditioner","meter","logger","ems","environment","mppt","liquid-cooler");
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
  static Map<String,Object> recordedStatus(Map<String,Object> row,boolean allowed,Instant now){
    Object raw=row.get("status_at");Instant at=raw instanceof java.sql.Timestamp t?t.toInstant():raw instanceof java.time.OffsetDateTime t?t.toInstant():raw instanceof Instant t?t:null;
    String status=Objects.toString(row.get("recorded_communication_status"),"");
    var result=new LinkedHashMap<String,Object>();
    boolean valid=allowed&&at!=null&&!at.isAfter(now)&&Set.of("online","offline","unknown").contains(status);
    result.put("recordedStatus",valid?status:"unknown");result.put("statusAt",valid?at.toString():null);return result;
  }
  public Map<String,Object> list(Long stationId,boolean export){return list(stationId,export,null);}
  public Map<String,Object> list(Long stationId,boolean export,List<Long> deviceIds){return list(stationId,export,deviceIds,null);}
  public Map<String,Object> list(Long stationId,boolean export,List<Long> deviceIds,String businessGroupId){
    var groupScope=businessGroups.stationScope(businessGroupId);
    var queryArgs=new ArrayList<Object>();queryArgs.add(s.access.userId());queryArgs.add(s.access.client());queryArgs.add(stationId);queryArgs.add(stationId);
    String groupFilter="";if(groupScope!=null){if(groupScope.isEmpty())groupFilter=" AND FALSE";else{groupFilter=" AND d.station_id IN ("+String.join(",",Collections.nCopies(groupScope.size(),"?"))+")";queryArgs.addAll(groupScope);}}
    if(deviceIds!=null&&(deviceIds.isEmpty()||deviceIds.size()>2000||deviceIds.stream().anyMatch(id->id==null||id<=0)))throw new BusinessException(400,"设备选择无效");
    if(deviceIds!=null){
      groupFilter+=" AND d.id IN ("+String.join(",",Collections.nCopies(deviceIds.size(),"?"))+")";
      queryArgs.addAll(deviceIds);
    }
    var scope=s.access.stationScopes(List.of("asset.read","alarm.read","telemetry.read","report.export"));
    var asset=new HashSet<>(scope.get("asset.read"));
    if(stationId!=null&&!asset.contains(stationId))throw new BusinessException(403,"无权查看该场站设备");
    var alarms=new HashSet<>(scope.get("alarm.read"));
    var telemetry=new HashSet<>(scope.get("telemetry.read"));
    var exportScope=new HashSet<>(scope.get("report.export"));
    var raw=s.db.queryForList("""
      SELECT d.id,d.station_id,st.name AS station_name,d.name,d.serial_number,r.source_type,coalesce(r.category,m.category) AS category,
        coalesce(nullif(trim(m.name),''),nullif(trim(r.model),'')) AS model,
        coalesce(nullif(trim(m.manufacturer),''),nullif(trim(r.manufacturer),'')) AS manufacturer,r.rated_power_kw,r.capacity_kwh,
        parent.name AS parent_name,parent.serial_number AS parent_serial,child.id AS substation_id,child.name AS child_station_name,
        o.communication_status AS recorded_communication_status,o.observed_at AS status_at,
        CASE WHEN o.observed_at<=now() AND o.observed_at>=now()-interval '90 seconds' THEN o.communication_status END AS communication_status
      FROM device d LEFT JOIN device_reference_import i ON i.device_id=d.id
      LEFT JOIN station_reference_import si ON si.station_id=d.station_id
      JOIN station st ON st.id=d.station_id
      LEFT JOIN device_reference_profile r ON r.device_id=d.id
      LEFT JOIN device_model m ON m.id=d.model_id
      LEFT JOIN LATERAL(SELECT p.name,p.serial_number FROM device p WHERE p.station_id=d.station_id
        AND p.serial_number=i.provenance->'device'->'raw'->>'parentSerialNumber' ORDER BY p.id LIMIT 1) parent ON true
      LEFT JOIN device_observation o ON o.device_id=d.id
      LEFT JOIN substation_device membership ON membership.device_id=d.id AND membership.station_id=d.station_id
      LEFT JOIN substation child ON child.id=membership.substation_id AND child.station_id=d.station_id AND child.archived_at IS NULL
      WHERE d.archived_at IS NULL AND st.archived_at IS NULL AND (si.station_id IS NOT NULL OR st.replica_visible) AND EXISTS(SELECT 1 FROM saas_effective_station_permission p WHERE p.user_id=? AND p.client=? AND p.station_id=d.station_id AND p.permission_code='asset.read')
        AND (?::bigint IS NULL OR d.station_id=?) """+groupFilter+" ORDER BY d.id LIMIT 2001",queryArgs.toArray());
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
    var stationDevices=new LinkedHashMap<Long,List<Long>>();
    for(var row:raw)stationDevices.computeIfAbsent(((Number)row.get("station_id")).longValue(),k->new ArrayList<>()).add(((Number)row.get("id")).longValue());
    for(long id:stations.keySet())if(telemetry.contains(id))for(var p:stored.latestForDevices(id,stationDevices.get(id)))
      points.computeIfAbsent(p.get("deviceId").toString(),k->new ArrayList<>()).add(point(p));
    // Batch current ownership and live device alarms after telemetry loading.
    var current=new HashMap<String,Map<String,Object>>();
    if(!raw.isEmpty()){
      var args=new ArrayList<Object>();args.add(s.access.userId());args.add(s.access.client());
      args.add(s.access.userId());args.add(s.access.client());
      for(var r:raw)args.add(r.get("id"));
      String ids=String.join(",",Collections.nCopies(raw.size(),"?"));
      for(var r:s.db.queryForList("""
        SELECT d.id,d.station_id,
          EXISTS(SELECT 1 FROM saas_effective_station_permission p WHERE p.user_id=? AND p.client=?
            AND p.station_id=d.station_id AND p.permission_code='alarm.read') AS alarm_allowed,
          COUNT(a.id) AS active_alarm_count
        FROM device d JOIN station st ON st.id=d.station_id
        LEFT JOIN (alarm a LEFT JOIN alarm_business_origin origin ON origin.alarm_id=a.id)
          ON a.device_id=d.id AND COALESCE(origin.station_id,d.station_id)=d.station_id
          AND a.source='device' AND a.deleted_at IS NULL AND a.occurred_at<=now()
          AND a.closed_at IS NULL AND (a.recovered_at IS NULL OR a.recovered_at>now())
        WHERE d.archived_at IS NULL AND st.archived_at IS NULL
          AND EXISTS(SELECT 1 FROM saas_effective_station_permission p WHERE p.user_id=? AND p.client=?
            AND p.station_id=d.station_id AND p.permission_code='asset.read')
          AND d.id IN (%s) GROUP BY d.id,d.station_id
        """.formatted(ids),args.toArray()))current.put(r.get("id").toString(),r);
    }
    // Recheck independent permissions after all loading.
    var currentScope=s.access.stationScopes(List.of("asset.read","alarm.read","telemetry.read","report.export"));
    alarms.retainAll(currentScope.get("alarm.read"));
    asset.retainAll(currentScope.get("asset.read"));telemetry.retainAll(currentScope.get("telemetry.read"));exportScope.retainAll(currentScope.get("report.export"));
    if(export)for(long id:stations.keySet())s.access.requireStationPermission(id,"report.export");
    var items=new ArrayList<Map<String,Object>>();
    for(var r:raw){
      long station=((Number)r.get("station_id")).longValue();if(!asset.contains(station))continue;
      String type=DeviceDetailRules.type(Objects.toString(r.get("source_type"),""),Objects.toString(r.get("category"),""));if(!TYPES.contains(type))continue;
      String id=r.get("id").toString();
      var latest=current.get(id);
      if(latest==null||((Number)latest.get("station_id")).longValue()!=station)continue;
      boolean canRead=telemetry.contains(station);
      boolean alarmAllowed=alarms.contains(station)&&Boolean.TRUE.equals(latest.get("alarm_allowed"));
      long activeAlarmCount=((Number)latest.get("active_alarm_count")).longValue();
      var sample=canRead?points.getOrDefault(id,List.of()):List.<Map<String,Object>>of();
      var fields=new LinkedHashMap<String,Object>();
      for(var pair:List.of(new String[]{"model","model"},new String[]{"manufacturer","manufacturer"},new String[]{"ratedPowerKw","rated_power_kw"},new String[]{"capacityKwh","capacity_kwh"},new String[]{"parentName","parent_name"},new String[]{"parentSerial","parent_serial"},new String[]{"childStationName","child_station_name"}))fields.put(pair[0],r.get(pair[1]));
      fields.put("substationId",r.get("substation_id")==null?null:r.get("substation_id").toString());
      var row=new LinkedHashMap<String,Object>();row.put("id",id);row.put("stationId",Long.toString(station));row.put("stationName",r.get("station_name"));row.put("name",r.get("name"));row.put("serial",r.get("serial_number"));row.put("type",type);
      row.put("status",canRead&&Set.of("online","offline").contains(Objects.toString(r.get("communication_status"),""))?r.get("communication_status"):"unknown");
      row.putAll(recordedStatus(r,canRead,Instant.now()));
      row.put("alarmAllowed",alarmAllowed);row.put("activeAlarmCount",alarmAllowed?activeAlarmCount:null);row.put("hasAlarm",alarmAllowed?activeAlarmCount>0:null);
      row.put("fields",fields);row.put("points",sample);row.put("telemetryAllowed",canRead);row.put("exportAllowed",exportScope.contains(station));
      row.put("updatedAt",sample.stream().map(p->p.get("sourceAt")).filter(Objects::nonNull).map(Object::toString).max(String::compareTo).orElse(null));
      row.put("stale",sample.isEmpty()||sample.stream().anyMatch(p->Boolean.TRUE.equals(p.get("stale"))));items.add(row);
    }
    return Map.of("items",items,"stations",stations.entrySet().stream().filter(e->asset.contains(e.getKey())).map(e->Map.of("id",e.getKey().toString(),"name",e.getValue())).toList());
  }
}

