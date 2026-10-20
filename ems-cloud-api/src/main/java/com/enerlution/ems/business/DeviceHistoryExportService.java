package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.stereotype.Service;
@Service
public class DeviceHistoryExportService {
 private final DomainSupport s;
 public DeviceHistoryExportService(DomainSupport s){this.s=s;}
 public record Request(String date,int days,String timezone,String scope,List<Long> pointIds){}
 public record File(String name,byte[] bytes){}
 record Range(Instant from,Instant until,ZoneId zone,String sheet){}
 static Range range(String date,int days,String timezone){
  try{
   if(date==null||!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||(days!=1&&days!=5))throw new IllegalArgumentException();
   var end=LocalDate.parse(date);var zone=ZoneId.of(timezone);var start=end.minusDays(days-1);
   if(end.isAfter(LocalDate.now(zone))||start.getYear()<1970)throw new IllegalArgumentException();
   return new Range(start.atStartOfDay(zone).toInstant(),end.plusDays(1).atStartOfDay(zone).toInstant(),zone,days==1?date:start+"~"+date);
  }catch(RuntimeException e){throw new BusinessException(400,"请选择有效日期、时区及1天或5天范围");}
 }
 private Map<String,Object> authorize(long station,long device){
  for(String permission:List.of("asset.read","telemetry.read","report.export"))s.access.requireStationPermission(station,permission);
  return s.one("""
   SELECT d.serial_number,coalesce(child.name,st.name) AS station_name,r.source_type,n.parent_serial_number
   FROM device d JOIN station st ON st.id=d.station_id
   LEFT JOIN device_reference_profile r ON r.device_id=d.id
   LEFT JOIN substation_device membership ON membership.device_id=d.id AND membership.station_id=d.station_id
   LEFT JOIN substation child ON child.id=membership.substation_id AND child.station_id=d.station_id AND child.archived_at IS NULL
   LEFT JOIN station_reference_connection_node n ON n.station_id=d.station_id AND n.serial_number=d.serial_number
   WHERE d.id=? AND d.station_id=? AND d.archived_at IS NULL AND st.archived_at IS NULL
   """,device,station);
 }
 public File export(long station,long device,Request request){
  var archive=authorize(station,device);if(request==null)throw new BusinessException(400,"缺少导出参数");
  var period=range(request.date,request.days,request.timezone);
  if(!Set.of("all","selected").contains(Objects.toString(request.scope,"")))throw new BusinessException(400,"导出范围无效");
  var points=s.db.queryForList("""
   SELECT b.measurement_point_id AS id,r.id AS reference_id,r.name,r.unit
   FROM reference_device_point r JOIN stored_device_point_binding b ON b.reference_point_id=r.id
   JOIN measurement_point p ON p.id=b.measurement_point_id AND p.device_id=r.device_id
   WHERE r.device_id=? AND b.station_id=? ORDER BY b.measurement_point_id
   """,device,station);
  if("selected".equals(request.scope)){
   var selected=request.pointIds;var owned=new HashSet<Long>();for(var p:points)owned.add(((Number)p.get("id")).longValue());
   if(selected==null||selected.isEmpty()||selected.size()>2000||new HashSet<>(selected).size()!=selected.size()||!owned.containsAll(selected))throw new BusinessException(400,"请选择本设备可导出的参数");
   points=points.stream().filter(p->selected.contains(((Number)p.get("id")).longValue())).toList();
  }
  if(points.isEmpty())throw new BusinessException(409,"该设备尚未接通原始历史导出");
  if(points.size()>2000)throw new BusinessException(413,"导出参数过多，请分批选择");
  String ids=String.join(",",points.stream().map(p->((Number)p.get("reference_id")).longValue()+"").toList());
  var samples=s.db.queryForList("""
   SELECT DISTINCT ON (a.source_at,a.point_id) a.point_id,a.source_at,a.value,a.raw_value,a.quality,
   EXISTS(SELECT 1 FROM reference_device_sample x WHERE x.point_id=a.point_id AND x.source_at=a.source_at
    AND (x.quality,x.value,CASE WHEN x.quality='text' THEN x.raw_value END) IS DISTINCT FROM
        (a.quality,a.value,CASE WHEN a.quality='text' THEN a.raw_value END)) AS conflict
   FROM reference_device_sample a WHERE a.point_id IN (
   """+ids+") AND a.source_at>=? AND a.source_at<? ORDER BY a.source_at,a.point_id,a.captured_at DESC,a.id DESC LIMIT 2000001",Timestamp.from(period.from),Timestamp.from(period.until));
  if(samples.size()>2000000)throw new BusinessException(413,"原始采样过多，请选择更少参数或导出当日数据");
  if(samples.isEmpty())throw new BusinessException(409,"所选时段暂无原始历史数据");
  var header=new ArrayList<>(List.of("设备类型","SN","所属父设备","所属子场站","时间"));
  for(var p:points)header.add(Objects.toString(p.get("name"),"").replaceFirst("^详情 · ","")+(Objects.toString(p.get("unit"),"").isEmpty()?"":"("+p.get("unit")+")"));
  var positions=new HashMap<Long,Integer>();for(int i=0;i<points.size();i++)positions.put(((Number)points.get(i).get("reference_id")).longValue(),i+5);
  var rows=new ArrayList<List<String>>();rows.add(header);Instant previous=null;List<String> current=null;
  var format=DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss").withZone(period.zone);
  for(var sample:samples){
   var time=((Timestamp)sample.get("source_at")).toInstant();
   if(!time.equals(previous)){
    if((long)(rows.size()+1)*header.size()>6000000)throw new BusinessException(413,"导出表格过大，请选择更少参数或导出当日数据");
    current=new ArrayList<>(Collections.nCopies(header.size(),"--"));
    String type=switch(DeviceDetailRules.type(Objects.toString(archive.get("source_type"),""),"")){case "inverter"->"逆变器";case "battery-cluster","battery-stack"->"电池";case "meter"->"电表";case "pcs"->"PCS";default->Objects.toString(archive.get("source_type"),"--");};
    current.set(0,type);current.set(1,Objects.toString(archive.get("serial_number"),"--"));
    current.set(2,Objects.toString(archive.get("parent_serial_number"),"--"));current.set(3,Objects.toString(archive.get("station_name"),"--"));current.set(4,format.format(time));
    rows.add(current);previous=time;
   }
   String value=Boolean.TRUE.equals(sample.get("conflict"))?"--":"observed".equals(sample.get("quality"))?Objects.toString(sample.get("value"),"--"):"text".equals(sample.get("quality"))?Objects.toString(sample.get("raw_value"),"--"):"--";
   current.set(positions.get(((Number)sample.get("point_id")).longValue()),value);
  }
  authorize(station,device);
  byte[] bytes=DeviceHistoryWorkbook.write(period.sheet,rows);
  authorize(station,device);
  return new File("设备历史_"+Objects.toString(archive.get("serial_number"),device+"").replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]","_")+"_"+period.sheet+".xlsx",bytes);
 }
}
