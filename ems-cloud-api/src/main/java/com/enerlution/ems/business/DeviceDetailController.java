package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Device archives and local analysis settings. This controller never dispatches hardware commands. */
@RestController
@RequestMapping("/api/stations/{station}/devices/{device}")
public class DeviceDetailController {
  private final DomainSupport s;
  private final ObjectMapper json;
  private final StationTelemetryService telemetry;
  public DeviceDetailController(DomainSupport s,ObjectMapper json,StationTelemetryService telemetry) {
    this.s=s;this.json=json;this.telemetry=telemetry;
  }
  private Map<String,Object> device(long station,long device) {
    return s.one("""
      SELECT d.id,d.station_id,d.code,d.name,d.serial_number,
        coalesce(m.name,r.model) AS model,coalesce(m.manufacturer,r.manufacturer) AS manufacturer,
        coalesce(m.category,r.category,'OTHER') AS category,r.source_type,r.rated_power_kw,r.capacity_kwh,
        o.firmware_version,o.observed_at,
        CASE WHEN o.observed_at>now() THEN NULL WHEN o.observed_at<now()-interval '15 minutes' THEN 'offline' ELSE o.communication_status END AS communication_status
      FROM device d LEFT JOIN device_model m ON m.id=d.model_id
      LEFT JOIN device_reference_profile r ON r.device_id=d.id LEFT JOIN device_observation o ON o.device_id=d.id
      WHERE d.station_id=? AND d.id=?
      """,station,device);
  }
  private List<Map<String,Object>> points(long device) {
    return s.db.queryForList("SELECT p.id,p.code,p.kind_code,k.name,k.unit FROM measurement_point p JOIN measurement_kind k ON k.code=p.kind_code WHERE p.device_id=? ORDER BY p.id",device);
  }
  private Map<String,Object> configuration(long device) {
    var rows=s.db.queryForList("SELECT version,selected_point_ids::text,theory_values::text,updated_at FROM device_detail_configuration WHERE device_id=?",device);
    if(rows.isEmpty())return Map.of("version",0,"selectedPointIds",List.of(),"theoryValues",Map.of());
    var row=rows.getFirst();
    try {
      var value=new LinkedHashMap<String,Object>();
      value.put("version",row.get("version"));
      value.put("selectedPointIds",json.readValue(row.get("selected_point_ids").toString(),new TypeReference<List<Long>>(){}));
      value.put("theoryValues",json.readValue(row.get("theory_values").toString(),new TypeReference<Map<String,BigDecimal>>(){}));
      value.put("updatedAt",row.get("updated_at"));return value;
    } catch(Exception e){throw new IllegalStateException("Invalid saved device configuration",e);}
  }
  @GetMapping("/detail")
  public ApiResponse<?> detail(@PathVariable long station,@PathVariable long device) {
    s.access.requireStationPermission(station,"asset.read");
    var archive=device(station,device);
    String type=DeviceDetailRules.type(Objects.toString(archive.get("source_type"),""),Objects.toString(archive.get("category"),""));
    var result=new LinkedHashMap<String,Object>();result.put("archive",archive);result.put("type",type);
    result.put("points",points(device));result.put("configuration",configuration(device));
    result.put("theoryFields",DeviceDetailRules.theoryFields(type));
    // Only return peers in this same authorized station. Imported raw evidence is never exposed.
    result.put("connections",s.db.queryForList("""
      SELECT peer.id,peer.name,peer.code,peer.serial_number,
        CASE WHEN c.source_device_id=? THEN 'downstream' ELSE 'upstream' END AS direction,'topology' AS source
      FROM topology_connection c JOIN device peer ON peer.id=CASE WHEN c.source_device_id=? THEN c.target_device_id ELSE c.source_device_id END
      WHERE (c.source_device_id=? OR c.target_device_id=?) AND peer.station_id=?
      UNION ALL
      SELECT parent.id,parent.name,parent.code,parent.serial_number,'upstream','imported_inventory'
      FROM device_reference_import r JOIN device parent ON parent.serial_number=r.provenance->'device'->'raw'->>'parentSerialNumber'
      WHERE r.device_id=? AND parent.station_id=? AND parent.id<>?
        AND NOT EXISTS(SELECT 1 FROM topology_connection c WHERE c.source_device_id=parent.id AND c.target_device_id=?)
      UNION ALL
      SELECT child.id,child.name,child.code,child.serial_number,'downstream','imported_inventory'
      FROM device_reference_import r JOIN device child ON child.id=r.device_id
      JOIN device parent ON parent.serial_number=r.provenance->'device'->'raw'->>'parentSerialNumber'
      WHERE parent.id=? AND child.station_id=? AND parent.station_id=? AND child.id<>?
        AND NOT EXISTS(SELECT 1 FROM topology_connection c WHERE c.source_device_id=parent.id AND c.target_device_id=child.id)
      """,device,device,device,device,station,device,station,device,device,device,station,station,device));
    result.put("logs",s.db.queryForList("""
      SELECT e.id,e.version,e.occurred_at,e.actor_id,'本地设备配置保存' AS action,'已保存' AS result
      FROM device_detail_configuration_event e WHERE e.device_id=? AND e.station_id=? ORDER BY e.occurred_at DESC,e.id DESC LIMIT 100
      """,device,station));
    result.put("firmwareRecords",s.db.queryForList("SELECT id,target_version,status,updated_at FROM firmware_task WHERE device_id=? ORDER BY updated_at DESC LIMIT 100",device));
    s.access.requireStationPermission(station,"asset.read");
    return ApiResponse.ok(result);
  }
  @GetMapping("/realtime")
  public ApiResponse<?> realtime(@PathVariable long station,@PathVariable long device) {
    s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");
    device(station,device);
    var ids=points(device).stream().map(r->s.number(r,"id")).toList();
    Object snapshot=ids.isEmpty()?Map.of("items",List.of()):telemetry.snapshot(station,ids,false);
    s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");
    return ApiResponse.ok(snapshot);
  }
  public record Configuration(@Min(0) long version,@NotNull @Size(max=12) List<@NotNull Long> selectedPointIds,@NotNull Map<String,BigDecimal> theoryValues) {}
  @PutMapping("/configuration")
  @Transactional
  public ApiResponse<?> configure(@PathVariable long station,@PathVariable long device,@Valid @RequestBody Configuration request) {
    s.access.requireStationPermission(station,"asset.edit");s.access.requireStationPermission(station,"asset.read");
    // Serialize configuration writers and resource movement using the existing device row.
    s.one("SELECT id FROM device WHERE station_id=? AND id=? FOR UPDATE",station,device);
    var archive=device(station,device);
    var owned=new HashSet<Long>();var units=new HashMap<Long,String>();
    for(var p:points(device)){owned.add(s.number(p,"id"));units.put(s.number(p,"id"),Objects.toString(p.get("unit"),""));}
    DeviceDetailRules.selection(request.selectedPointIds(),owned);
    DeviceDetailRules.units(request.selectedPointIds(),units);
    DeviceDetailRules.theory(DeviceDetailRules.type(Objects.toString(archive.get("source_type"),""),Objects.toString(archive.get("category"),"")),request.theoryValues());
    if(request.version()<0)throw new BusinessException(400,"配置版本无效");
    long version=((Number)configuration(device).get("version")).longValue();
    if(version!=request.version())throw new BusinessException(409,"配置已更新，请刷新后重试");
    String selected,values;
    try {selected=json.writeValueAsString(request.selectedPointIds());values=json.writeValueAsString(request.theoryValues());}
    catch(Exception e){throw new BusinessException(400,"配置内容无效");}
    s.db.update("""
      INSERT INTO device_detail_configuration(device_id,version,selected_point_ids,theory_values,updated_by)
      VALUES(?,?,?::jsonb,?::jsonb,?) ON CONFLICT(device_id) DO UPDATE SET version=excluded.version,
      selected_point_ids=excluded.selected_point_ids,theory_values=excluded.theory_values,updated_by=excluded.updated_by,updated_at=now()
      """,device,version+1,selected,values,s.access.userId());
    s.db.update("INSERT INTO device_detail_configuration_event(device_id,station_id,actor_id,version,selected_point_ids,theory_values) VALUES(?,?,?,?,?::jsonb,?::jsonb)",device,station,s.access.userId(),version+1,selected,values);
    s.auditStation("device.configuration.save",station,Map.of("deviceId",device,"version",version+1,"localOnly",true));
    return ApiResponse.ok(configuration(device));
  }
}
