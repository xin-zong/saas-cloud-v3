package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.util.*;
import org.springframework.web.bind.annotation.*;

/** Reads the persisted engineering design; it does not deploy or control an EMS. */
@RestController
@RequestMapping("/api/stations")
public class StationDesignController {
  private final DomainSupport s;
  public StationDesignController(DomainSupport s){this.s=s;}
  private static String text(Object v){return v==null?"":v.toString();}
  @GetMapping("/{id}/provision-design")
  public ApiResponse<?> design(@PathVariable long id) {
    s.access.requireStationPermission(id,"asset.read");
    var station=s.one("SELECT s.*,d.template,d.operating_mode,d.monitoring_scope FROM station s JOIN station_design d ON d.station_id=s.id WHERE s.id=?",id);
    var nodes=s.db.queryForList("SELECT n.*,d.code,d.name,g.code AS grid_code FROM station_design_node n JOIN device d ON d.id=n.device_id LEFT JOIN device g ON g.id=n.grid_device_id WHERE d.station_id=? ORDER BY d.id",id);
    var ports=s.db.queryForList("SELECT p.*,d.code AS device_code,host(p.host) AS ip FROM station_design_port p JOIN device d ON d.id=p.device_id WHERE d.station_id=? ORDER BY d.id,p.code",id);
    var links=s.db.queryForList("SELECT a.code AS source,b.code AS target,c.from_port,c.to_port FROM station_design_communication c JOIN device a ON a.id=c.from_device_id JOIN device b ON b.id=c.to_device_id WHERE a.station_id=? AND b.station_id=?",id,id);
    var edges=s.db.queryForList("SELECT a.code AS source,b.code AS target,e.kind FROM station_design_electrical e JOIN device a ON a.id=e.source_device_id JOIN device b ON b.id=e.target_device_id WHERE a.station_id=? AND b.station_id=? ORDER BY a.code,b.code",id,id);
    var devices=new ArrayList<Map<String,Object>>();
    for(var node:nodes){
      var d=new LinkedHashMap<String,Object>();String code=text(node.get("code"));
      d.put("id",code);d.put("code",code);d.put("type",node.get("node_type"));d.put("name",node.get("name"));
      d.put("x",node.get("x"));d.put("y",node.get("y"));d.put("rating",text(node.get("rating")));d.put("unit",text(node.get("rating_unit")));d.put("voltage",text(node.get("voltage")));d.put("meteringRole",text(node.get("metering_role")));d.put("gridId",text(node.get("grid_code")));
      String voltage=text(node.get("voltage"));
      d.put("voltage",voltage.isEmpty()?"":voltage.split(" ")[0]);d.put("voltageUnit",voltage.contains("kV")?"kV":"V");
      for(String field:List.of("protocol","interface","ip","port","address","bus","baud","parity","bits"))d.put(field,"");
      var ps=new ArrayList<Map<String,Object>>();
      for(var port:ports)if(Objects.equals(port.get("device_id"),node.get("device_id"))){
        var p=new LinkedHashMap<String,Object>();p.put("id",port.get("code"));p.put("interface",port.get("interface"));p.put("protocol",port.get("protocol"));p.put("role",port.get("role"));p.put("ip",text(port.get("ip")));p.put("port",text(port.get("tcp_port")));p.put("address",text(port.get("address")));p.put("version","");
        p.put("targets",links.stream().filter(l->(code.equals(l.get("source"))&&Objects.equals(port.get("code"),l.get("from_port")))||(code.equals(l.get("target"))&&Objects.equals(port.get("code"),l.get("to_port")))).map(l->code.equals(l.get("source"))?l.get("target")+"/"+l.get("to_port"):l.get("source")+"/"+l.get("from_port")).toList());ps.add(p);
      }
      d.put("ports",ps);devices.add(d);
    }
    var out=new LinkedHashMap<String,Object>();out.put("schema",1);out.put("version",1);out.put("stationId",Long.toString(id));
    for(String field:List.of("name","code","region","address","template"))out.put(field,text(station.get(field)));
    out.put("organization",text(station.get("organization_id")));out.put("type","光储协同");out.put("timezone","Asia/Shanghai (UTC+08:00)");out.put("imageUrl","");out.put("ratedPower",text(station.get("rated_power_kw")));out.put("storageCapacity",text(station.get("capacity_kwh")));out.put("buses",List.of());out.put("devices",devices);
    out.put("connections",edges.stream().map(e->Map.of("id",e.get("source")+"-"+e.get("target"),"from",e.get("source"),"to",e.get("target"),"kind",e.get("kind"))).toList());
    s.access.requireStationPermission(id,"asset.read");return ApiResponse.ok(out);
  }
}
