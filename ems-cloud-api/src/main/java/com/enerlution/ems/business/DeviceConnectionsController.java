package com.enerlution.ems.business;
import com.enerlution.ems.common.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;
/** Authorized station connection tree, backed only by saved explicit topology/inventory edges. */
@RestController
@RequestMapping("/api/stations/{station}/devices/{device}/connections")
public class DeviceConnectionsController {
 private final DomainSupport s;
 public DeviceConnectionsController(DomainSupport s){this.s=s;}
 @GetMapping public ApiResponse<?> read(@PathVariable long station,@PathVariable long device){
  s.access.requireStationPermission(station,"asset.read");
  s.one("SELECT d.id FROM device d JOIN station st ON st.id=d.station_id WHERE d.station_id=? AND d.id=? AND d.archived_at IS NULL AND st.archived_at IS NULL",station,device);
  var nodes=new ArrayList<Map<String,Object>>(s.db.queryForList("""
   SELECT d.id,d.name,d.serial_number AS serial,coalesce(profile.source_type,'') AS source_type,coalesce(model.category,profile.category,'OTHER') AS category,
    CASE WHEN o.observed_at IS NULL OR o.observed_at>now() THEN 'unknown'
     WHEN o.observed_at<now()-interval '15 minutes' THEN 'offline'
     WHEN o.communication_status='online' THEN 'online' WHEN o.communication_status='offline' THEN 'offline' ELSE 'unknown' END AS status,
    o.observed_at AS "updatedAt"
   FROM device d LEFT JOIN device_observation o ON o.device_id=d.id
   LEFT JOIN device_reference_profile profile ON profile.device_id=d.id LEFT JOIN device_model model ON model.id=d.model_id
   WHERE d.station_id=? AND d.archived_at IS NULL ORDER BY d.id LIMIT 2001
   """,station));
  if(nodes.size()>2000)throw new BusinessException(400,"连接设备过多，请缩小场站范围");
  for(var node:nodes)node.put("type",DeviceDetailRules.type(Objects.toString(node.get("source_type"),""),Objects.toString(node.get("category"),"")));
  var edges=new ArrayList<Map<String,Object>>(s.db.queryForList("""
   SELECT DISTINCT t.source_device_id AS "parentId",t.target_device_id AS "childId" FROM topology_connection t
   JOIN device parent ON parent.id=t.source_device_id JOIN device child ON child.id=t.target_device_id
   WHERE parent.station_id=? AND child.station_id=? AND parent.archived_at IS NULL AND child.archived_at IS NULL
   UNION
   SELECT DISTINCT parent.id,child.id FROM device_reference_import r JOIN device child ON child.id=r.device_id
   JOIN device parent ON parent.serial_number=r.provenance->'device'->'raw'->>'parentSerialNumber'
   WHERE parent.station_id=? AND child.station_id=? AND parent.archived_at IS NULL AND child.archived_at IS NULL AND parent.id<>child.id
   """,station,station,station,station));
  s.one("SELECT d.id FROM device d JOIN station st ON st.id=d.station_id WHERE d.station_id=? AND d.id=? AND d.archived_at IS NULL AND st.archived_at IS NULL",station,device);
  s.access.requireStationPermission(station,"asset.read");
  var captured=s.db.queryForList("""
   SELECT n.id,n.serial_number AS serial,n.source_type,n.parent_serial_number,n.sort_order,n.observed_status,n.observed_at,n.captured_at,
    EXISTS(SELECT 1 FROM device known WHERE known.serial_number=n.serial_number AND (known.archived_at IS NOT NULL OR known.station_id<>n.station_id)) AS unavailable
   FROM station_reference_connection_node n WHERE n.station_id=? ORDER BY n.sort_order LIMIT 2001
   """,station);
  if(captured.size()>2000)throw new BusinessException(400,"连接设备过多，请缩小场站范围");
  ReferenceConnectionTree.merge(nodes,edges,captured);
  s.one("SELECT d.id FROM device d JOIN station st ON st.id=d.station_id WHERE d.station_id=? AND d.id=? AND d.archived_at IS NULL AND st.archived_at IS NULL",station,device);
  s.access.requireStationPermission(station,"asset.read");
  boolean telemetry=s.access.hasStationPermission(s.access.userId(),station,"telemetry.read");
  if(!telemetry)for(var node:nodes){node.put("status","unknown");node.put("updatedAt",null);node.put("observedStatus",null);node.put("observedAt",null);node.put("capturedAt",null);}
  return ApiResponse.ok(Map.of("nodes",nodes,"edges",edges));
 }
}




