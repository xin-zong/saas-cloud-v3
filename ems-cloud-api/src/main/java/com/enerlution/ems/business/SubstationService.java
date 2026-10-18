package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Child membership and authorization are explicit local rules, not claims about reference backend behavior. */
@Service
public class SubstationService {
 private final DomainSupport s;
 private final StationTelemetryService telemetry;
 private static final ObjectMapper JSON=new ObjectMapper();
 public SubstationService(DomainSupport s,StationTelemetryService telemetry){this.s=s;this.telemetry=telemetry;}
 public record Request(String name,List<String> systems,BigDecimal solarCapacityKw,BigDecimal storagePowerKw,
   BigDecimal storageCapacityKwh,BigDecimal chargePowerKw,BigDecimal mpptCapacityKw,BigDecimal azimuth,
   BigDecimal tilt,BigDecimal voltageKv,String roofType,BigDecimal pavedArea,
   @JsonDeserialize(using=StationSpaceService.StrictVersion.class) Long expectedVersion) {}
 public record BindRequest(@JsonDeserialize(contentUsing=StationSpaceService.StrictDeviceId.class) List<String> deviceIds,
   @JsonDeserialize(using=StationSpaceService.StrictVersion.class) Long expectedVersion) {}
 static List<String> validateSystems(List<String> systems) {
  if(systems==null||systems.isEmpty()||systems.stream().anyMatch(v->v==null||!Set.of("pv","storage","charge","mppt").contains(v))
    ||new HashSet<>(systems).size()!=systems.size()||(!systems.contains("pv")&&!systems.contains("storage"))
    ||(systems.contains("mppt")&&!systems.contains("storage")))throw invalid("请选择光伏或储能系统；MPPT 需要储能系统");
  return List.copyOf(systems);
 }
 static BigDecimal capacity(BigDecimal value,BigDecimal parent,boolean required) {
  if(value==null){if(required)throw invalid("所选系统容量必填");return null;}
  // Explicit local numeric bounds; vendor regexp limits were not verified.
  if(value.signum()<0||value.stripTrailingZeros().scale()>3||value.compareTo(new BigDecimal("99999999999.999"))>0)throw invalid("数值须为非负数，最多三位小数");
  if(parent!=null&&value.compareTo(parent)>0)throw invalid("子场站容量不能超过父场站对应容量");
  return value;
 }
 private void read(long station){s.access.requireStationPermission(station,"asset.read");}
 private void edit(long station){read(station);s.access.requireStationPermission(station,"asset.edit");}
 public Map<String,Object> capabilities(long station){read(station);var result=parent(station);read(station);return result;}
 private Map<String,Object> parent(long station) {
  var row=s.one("SELECT s.asset_type,s.rated_power_kw,s.capacity_kwh,p.solar_capacity_kw FROM station s LEFT JOIN station_profile p ON p.station_id=s.id WHERE s.id=?",station);
  boolean storage=Set.of("BESS","Hybrid").contains(row.get("asset_type"));
  boolean pv=Set.of("PV","Hybrid").contains(row.get("asset_type"))||row.get("solar_capacity_kw")!=null;
  var result=new LinkedHashMap<String,Object>();var systems=new ArrayList<String>();if(pv)systems.add("pv");if(storage)systems.add("storage");
  result.put("systems",systems);result.put("solarCapacityKw",row.get("solar_capacity_kw"));
  result.put("storagePowerKw",storage?row.get("rated_power_kw"):null);result.put("storageCapacityKwh",storage?row.get("capacity_kwh"):null);
  result.put("chargePowerKw",null);result.put("mpptCapacityKw",null);
  result.put("capacityNotice","父站未知容量不作为零值；未知上限无法核验。充电和 MPPT 父站能力未登记，暂不可新增。");
  return result;
 }
 private Map<String,Object> validate(long station,Request r){
  if(r==null||r.name()==null||r.name().strip().isEmpty()||r.name().strip().codePointCount(0,r.name().strip().length())>50)throw invalid("子场站名称为 1–50 个字符");
  List<String> systems=validateSystems(r.systems());var parent=parent(station);
  if(!((List<?>)parent.get("systems")).containsAll(systems))throw invalid("父场站未登记所选系统能力");
  var result=new LinkedHashMap<String,Object>();result.put("systems",systems);
  result.put("solarCapacityKw",capacity(r.solarCapacityKw(),(BigDecimal)parent.get("solarCapacityKw"),systems.contains("pv")));
  result.put("storagePowerKw",capacity(r.storagePowerKw(),(BigDecimal)parent.get("storagePowerKw"),systems.contains("storage")));
  result.put("storageCapacityKwh",capacity(r.storageCapacityKwh(),(BigDecimal)parent.get("storageCapacityKwh"),systems.contains("storage")));
  result.put("chargePowerKw",capacity(r.chargePowerKw(),null,systems.contains("charge")));
  result.put("mpptCapacityKw",capacity(r.mpptCapacityKw(),null,systems.contains("mppt")));
  for(var entry:Map.of("pv",List.of("solarCapacityKw"),"storage",List.of("storagePowerKw","storageCapacityKwh"),"charge",List.of("chargePowerKw"),"mppt",List.of("mpptCapacityKw")).entrySet())
   if(!systems.contains(entry.getKey()))for(String key:entry.getValue())if(result.get(key)!=null)throw invalid("未选择的系统不能填写容量");
  result.put("azimuth",capacity(r.azimuth(),new BigDecimal("360"),false));result.put("tilt",capacity(r.tilt(),new BigDecimal("90"),false));
  result.put("voltageKv",capacity(r.voltageKv(),null,false));result.put("pavedArea",capacity(r.pavedArea(),null,false));
  if(r.roofType()!=null&&r.roofType().length()>80)throw invalid("屋顶类型最多80字符");result.put("roofType",r.roofType());return result;
 }
 private static final String SELECT="SELECT c.*,(SELECT count(*) FROM substation_device l WHERE l.substation_id=c.id) AS device_count,(SELECT coalesce(json_agg(l.device_id::text ORDER BY l.device_id),'[]'::json) FROM substation_device l WHERE l.substation_id=c.id) AS device_ids FROM substation c";
 private Map<String,Object> output(Map<String,Object> row){
  try {
   Map<String,Object> out=JSON.readValue(row.get("configuration").toString(),LinkedHashMap.class);
   out.put("deviceIds",JSON.readValue(row.get("device_ids").toString(),List.class));out.put("id",row.get("id").toString());out.put("stationId",row.get("station_id").toString());out.put("name",row.get("name"));out.put("version",row.get("version"));
   long count=((Number)row.get("device_count")).longValue();out.put("deviceCount",count);out.put("state",count==0?"pending_devices":"ready");return out;
  }catch(java.io.IOException e){throw new IllegalStateException(e);}
 }
 public List<Map<String,Object>> list(long station){read(station);var result=s.db.queryForList(SELECT+" WHERE c.station_id=? ORDER BY lower(c.name),c.id",station).stream().map(this::output).toList();read(station);return result;}
 public Map<String,Object> detail(long station,UUID id){read(station);var result=one(station,id);read(station);return result;}
 private Map<String,Object> one(long station,UUID id){return output(s.one(SELECT+" WHERE c.station_id=? AND c.id=?",station,id));}
 private void version(long station,UUID id,Long expected){
  if(expected==null||expected<1)throw invalid("expectedVersion 必须为正整数");
  var row=s.one("SELECT version FROM substation WHERE station_id=? AND id=? FOR UPDATE",station,id);
  if(((Number)row.get("version")).longValue()!=expected)throw new BusinessException(409,"子场站已更新，请刷新重试");
 }
 public Map<String,Object> create(long station,Request request){edit(station);return write(station,()->{
  var config=validate(station,request);UUID id=UUID.randomUUID();
  s.db.update("INSERT INTO substation(id,station_id,name,configuration,created_by) VALUES(?,?,?,?::jsonb,?)",id,station,request.name().strip(),json(config),s.access.userId());
  audit(station,id,"create");return one(station,id);
 });}
 public Map<String,Object> update(long station,UUID id,Request request){edit(station);if(request==null)throw invalid("请求不能为空");return write(station,()->{
  version(station,id,request.expectedVersion());var config=validate(station,request);
  s.db.update("UPDATE substation SET name=?,configuration=?::jsonb,version=version+1,updated_at=clock_timestamp() WHERE station_id=? AND id=?",request.name().strip(),json(config),station,id);
  audit(station,id,"update");return one(station,id);
 });}
 public List<Map<String,Object>> devices(long station){read(station);var result=s.db.queryForList("SELECT d.id::text AS \"deviceId\",d.name,d.code,l.substation_id::text AS \"substationId\",c.name AS \"substationName\" FROM device d LEFT JOIN substation_device l ON l.device_id=d.id LEFT JOIN substation c ON c.id=l.substation_id WHERE d.station_id=? AND d.archived_at IS NULL ORDER BY d.id",station);read(station);return result;}
 public Map<String,Object> replaceDevices(long station,UUID id,BindRequest request){
  edit(station);if(request==null||request.deviceIds()==null||request.deviceIds().size()>200)throw invalid("设备清单最多200项");
  List<Long> ids=request.deviceIds().isEmpty()?List.of():StationSpaceService.normalizeDeviceIds(request.deviceIds());
  return write(station,()->{
   version(station,id,request.expectedVersion());
   for(long device:ids.stream().sorted().toList()){
    var row=s.one("SELECT station_id,archived_at FROM device WHERE id=? FOR UPDATE",device);
    if(((Number)row.get("station_id")).longValue()!=station)throw new BusinessException(403,"设备不属于父场站");
    var existing=s.db.queryForList("SELECT substation_id FROM substation_device WHERE device_id=?",UUID.class,device);
    if(row.get("archived_at")!=null&&(existing.isEmpty()||!existing.getFirst().equals(id)))throw new BusinessException(409,"已归档设备不能新增子场站关联");
    if(!existing.isEmpty()&&!existing.getFirst().equals(id))throw new BusinessException(409,"设备已关联其他子场站，请先解除关联");
   }
   // Archived associations remain historical records when the active selection is replaced.
   s.db.update("DELETE FROM substation_device l USING device d WHERE l.device_id=d.id AND l.station_id=? AND l.substation_id=? AND d.archived_at IS NULL",station,id);
   for(long device:ids)s.db.update("INSERT INTO substation_device(device_id,station_id,substation_id,created_by) VALUES(?,?,?,?) ON CONFLICT(device_id) DO NOTHING",device,station,id,s.access.userId());
   s.db.update("UPDATE substation SET version=version+1,updated_at=clock_timestamp() WHERE station_id=? AND id=?",station,id);
   audit(station,id,"devices-replace");return one(station,id);
  });
 }
 public Map<String,Object> telemetry(long station,UUID id){
  read(station);s.access.requireStationPermission(station,"telemetry.read");var before=one(station,id);var points=points(station,id);
  if(points.size()>2000)throw new BusinessException(413,"子场站测点超过2000，请缩小设备范围");
  // Empty selection means ALL points to the canonical reader, so never call it for an empty child.
  Map<String,Object> result=points.isEmpty()?new LinkedHashMap<>(Map.of("items",List.of(),"mappingCounts",Map.of(),"serverTime",System.currentTimeMillis(),"nativeTelemetryUnavailable",false)):telemetry.snapshot(station,points,false);
  read(station);s.access.requireStationPermission(station,"telemetry.read");var after=one(station,id);
  if(!before.get("version").equals(after.get("version"))||!points.equals(points(station,id)))throw new BusinessException(409,"子场站设备发生变化，请刷新重试");
  return result;
 }
 private List<Long> points(long station,UUID id){return s.db.queryForList("SELECT mp.id FROM measurement_point mp JOIN device d ON d.id=mp.device_id JOIN substation_device l ON l.device_id=d.id AND l.station_id=d.station_id WHERE l.station_id=? AND l.substation_id=? ORDER BY mp.id",Long.class,station,id);}
 private void audit(long station,UUID id,String action){s.auditStation("substation."+action,station,Map.of("substationId",id));}
 private <T>T write(long station,Supplier<T> operation){
  try{return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource()))).execute(status->{
   s.db.queryForObject("SELECT pg_advisory_xact_lock_shared(78291001)",Object.class);
   s.one("SELECT id FROM station WHERE id=? FOR UPDATE",station);
   s.db.queryForList("SELECT station_id FROM station_profile WHERE station_id=? FOR UPDATE",station);
   edit(station);return operation.get();
  });}catch(DuplicateKeyException e){throw new BusinessException(409,"子场站名称或设备关联已存在");}
 }
 private static String json(Object value){try{return JSON.writeValueAsString(value);}catch(java.io.IOException e){throw new IllegalStateException(e);}}
 private static BusinessException invalid(String message){return new BusinessException(400,message);}
}
