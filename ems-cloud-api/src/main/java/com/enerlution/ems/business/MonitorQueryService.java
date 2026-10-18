package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;

/** Monitoring reads retain asset and telemetry capability boundaries, including original fact ownership. */
@Service
public class MonitorQueryService {
 @org.springframework.beans.factory.annotation.Autowired
 StoredDeviceTelemetryService stored;
 private static final long MAX_BUCKETS=50000,MAX_RESULT_BYTES=8L*1024*1024;
 private final DomainSupport s;
 private final TelemetryController telemetry;
 public MonitorQueryService(DomainSupport s,TelemetryController telemetry){this.s=s;this.telemetry=telemetry;}
 public List<Map<String,Object>> stations(String scene,String communication,String search) {
  if(!Set.of("all","PV","BESS","Hybrid","Wind","Diesel").contains(scene)
    ||!Set.of("all","online","offline","unknown").contains(communication)
    ||search==null||search.length()>160)throw new BusinessException(400,"监控筛选条件无效");
  long user=s.access.userId();
  var rows=s.db.queryForList("""
   SELECT st.id::text AS id,st.name,st.code,st.asset_type AS scene,st.region,st.rated_power_kw,
    st.capacity_kwh,sp.solar_capacity_kw,
    CASE WHEN EXISTS(SELECT 1 FROM ems_binding_period p JOIN ems_connection_read c USING(ems_uuid)
      WHERE p.station_id=st.id AND p.valid_to IS NULL AND p.valid_from<=clock_timestamp() AND c.reachable)
      THEN 'online' WHEN EXISTS(SELECT 1 FROM ems_binding_period p JOIN ems_connection_read c USING(ems_uuid)
      WHERE p.station_id=st.id AND p.valid_to IS NULL AND p.valid_from<=clock_timestamp() AND c.last_fresh_heartbeat IS NOT NULL)
      THEN 'offline' ELSE 'unknown' END AS communication,
    (SELECT count(*) FROM device d WHERE d.station_id=st.id) AS device_count
   FROM station st LEFT JOIN station_profile sp ON sp.station_id=st.id
   JOIN %s a ON a.station_id=st.id AND a.user_id=? AND a.permission_code='asset.read'
   WHERE (?='all' OR st.asset_type=?) AND (strpos(lower(st.name||' '||st.code||' '||coalesce(st.region,'')),lower(?))>0)
   ORDER BY st.id LIMIT 2001
   """.formatted(s.access.stationPermissionTable()),user,scene,scene,search.strip());
  if(rows.size()>2000)throw new BusinessException(413,"授权站点超过2000，请缩小场景或搜索范围");
  var result=rows.stream().filter(r->communication.equals("all")||communication.equals(r.get("communication"))).toList();
  for(var row:result)s.access.requireStationPermission(Long.parseLong(row.get("id").toString()),"asset.read");
  return result;
 }
 public Map<String,Object> history(List<Long> stations,String metric,OffsetDateTime from,OffsetDateTime to,int minutes,boolean export) {
  if(!Set.of("pvPower","storagePower").contains(metric)||from==null||to==null||!to.isAfter(from)
     ||Duration.between(from,to).compareTo(Duration.ofDays(31))>0||!Set.of(5,15,30,60).contains(minutes)
     ||stations==null||stations.size()>100||new HashSet<>(stations).size()!=stations.size()
     ||stations.stream().anyMatch(id->id==null||id<1))throw new BusinessException(400,"请选择最多100个站点、31天内时段及有效功率指标");
  long requestedBuckets=(Duration.between(from,to).toMillis()+minutes*60000L-1)/(minutes*60000L)+1;
  if(requestedBuckets*stations.size()>MAX_BUCKETS)throw new BusinessException(413,"监控结果超过50000个站点采样桶，请缩小站点/日期范围或增大粒度");
  var authorized=s.access.stationIds("asset.read");
  if(!authorized.containsAll(stations))throw new BusinessException(403,"监控站点权限已变化");
  for(long station:stations){s.access.requireStationPermission(station,"telemetry.read");if(export)s.access.requireStationPermission(station,"report.export");}
  long end=Math.min(to.toInstant().toEpochMilli(),Instant.now().toEpochMilli());
  long start=from.toInstant().toEpochMilli();
  var series=new ArrayList<Map<String,Object>>();var rank=new ArrayList<Map<String,Object>>();long estimatedBytes=4096;
  for(long station:stations) {
   // A station series requires one explicit source, never a sum of overlapping devices.
   var points=new ArrayList<>(s.db.queryForList("""
    SELECT DISTINCT mp.id FROM measurement_point mp JOIN device a ON a.id=mp.device_id
     JOIN measurement_kind k ON k.code=mp.kind_code JOIN point_binding pb ON pb.measurement_point_id=mp.id
     JOIN point_definition d ON d.id=pb.definition_id JOIN device_binding b ON b.id=pb.device_binding_id
     JOIN ems_binding_period p ON p.id=b.binding_period_id
    WHERE a.station_id=? AND p.station_id=? AND p.valid_to IS NULL AND b.valid_to IS NULL AND pb.valid_to IS NULL
     AND greatest(p.valid_from,b.valid_from,pb.valid_from)<=clock_timestamp()
     AND d.namespace='cabinet' AND d.source_id=? AND d.value_type='number' AND k.unit='kW'
    """,Long.class,station,station,metric.equals("pvPower")?20107L:20024L));
   if(stored!=null)points.addAll(storedPowerPoints(station,metric));
   List<?> samples=List.of();
   if(points.size()==1&&end>start) samples=(List<?>)telemetry.stationHistory(station,points.getFirst(),from,Instant.ofEpochMilli(end).atOffset(ZoneOffset.UTC),minutes,"last").data();
   BigDecimal total=BigDecimal.ZERO;int count=0;
   for(Object sample:samples) {
    var row=(Map<?,?>)sample;var value="valid".equals(row.get("quality"))&&!Boolean.TRUE.equals(row.get("conflict"))?decimal(row.get("value")):null;
    // All fields are fixed ASCII keys, numeric identities and bounded decimals. This
    // conservative envelope is greater than their JSON encoding, including ranking metadata.
    estimatedBytes+=512L+(value==null?0:value.toString().length());
    if(series.size()>=MAX_BUCKETS||estimatedBytes>MAX_RESULT_BYTES)throw new BusinessException(413,"监控结果超过8MiB，请缩小查询范围；未返回截断数据");
    var out=new LinkedHashMap<String,Object>();out.put("stationId",Long.toString(station));out.put("timestamp",row.get("timestamp"));out.put("value",value);out.put("unit","kW");out.put("samples",row.get("samples"));series.add(out);
    for(String field:List.of("source","sourceType","sourceTime","receivedAt","quality","conflict","staleReason"))out.put(field,row.get(field));
    if(value!=null){total=total.add(value);count++;}
   }
   var item=new LinkedHashMap<String,Object>();item.put("stationId",Long.toString(station));
   item.put("value",count==0?null:total.divide(BigDecimal.valueOf(count),java.math.MathContext.DECIMAL128));
   item.put("samples",count);item.put("reason",points.size()!=1?"unmapped_or_ambiguous":count==0?"no_valid_samples":null);rank.add(item);
  }
  // Recheck after the bounded telemetry reads; a moved fact retains TelemetryController's original scope checks.
  for(long station:stations){s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");if(export)s.access.requireStationPermission(station,"report.export");}
  var result=new LinkedHashMap<String,Object>();result.put("metric",metric);result.put("unit","kW");result.put("from",from);result.put("to",to);result.put("minutes",minutes);result.put("items",series);result.put("ranking",rank(rank,"DESC"));result.put("stationResults",rank);
  result.put("provenance","Canonical protocol or reviewed stored device point; last observation per bucket, invalid quality stays null; one verified parent battery stack may represent its child clusters; ambiguous sources are not summed; ranking is arithmetic mean of available power buckets, never energy");
  result.put("unavailable",List.of("PR: irradiation and weighting undefined","fullPowerHours: metering boundary undefined","generationCompletion: actual generation unavailable","storageEfficiency: charge/discharge energy unavailable","utilization: operating-duration algorithm undefined"));
  return result;
 }
 private List<Long> storedPowerPoints(long station,String metric) {
  var candidates=s.db.queryForList("""
   SELECT mp.id,mp.device_id,profile.source_type,
    (SELECT parent.id FROM device_reference_import ri
      JOIN device parent ON parent.serial_number=ri.provenance->'device'->'raw'->>'parentSerialNumber'
      WHERE ri.device_id=d.id AND parent.station_id=d.station_id AND parent.id<>d.id) AS parent_device_id
   FROM stored_device_point_binding b JOIN measurement_point mp ON mp.id=b.measurement_point_id
    JOIN reference_device_point rp ON rp.id=b.reference_point_id AND rp.device_id=mp.device_id
    JOIN device d ON d.id=mp.device_id AND d.station_id=b.station_id
    JOIN measurement_kind k ON k.code=mp.kind_code
    JOIN device_reference_profile profile ON profile.device_id=d.id
   WHERE b.station_id=? AND b.semantic_key=? AND k.unit='kW' AND rp.unit='kW'
   ORDER BY mp.id LIMIT 2001
   """,station,metric.equals("pvPower")?"pvPower":"batteryPower");
  if(candidates.size()>2000)throw new BusinessException(413,"站点功率映射超过2000，请缩小范围");
  if(metric.equals("storagePower")&&candidates.size()>1) {
   var stacks=candidates.stream().filter(r->"Battery Stack".equals(r.get("source_type"))).toList();
   if(stacks.size()==1) {
    var stack=stacks.getFirst();
    if(candidates.stream().allMatch(r->Objects.equals(r.get("id"),stack.get("id"))
        ||"Battery Cluster".equals(r.get("source_type"))&&Objects.equals(r.get("parent_device_id"),stack.get("device_id"))))
      return List.of(((Number)stack.get("id")).longValue());
   }
  }
  return candidates.stream().map(r->((Number)r.get("id")).longValue()).toList();
 }
 static BigDecimal decimal(Object value){try{return value==null?null:new BigDecimal(value.toString());}catch(NumberFormatException ex){return null;}}
 static List<Map<String,Object>> rank(List<Map<String,Object>> rows,String order) {
  if(!Set.of("ASC","DESC").contains(order))throw new BusinessException(400,"排序无效");
  Comparator<Map<String,Object>> comparator=Comparator.comparing(r->decimal(r.get("value")));
  if(order.equals("DESC"))comparator=comparator.reversed();
  return rows.stream().filter(r->decimal(r.get("value"))!=null).sorted(comparator.thenComparing(r->r.get("stationId").toString())).limit(100).toList();
 }
}
