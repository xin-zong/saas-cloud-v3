package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.util.*;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class StationWiringDiagramService {
 private static final ObjectMapper JSON=new ObjectMapper();
 private final DomainSupport s; private final StationTelemetryService telemetry;
 public StationWiringDiagramService(DomainSupport s,StationTelemetryService telemetry){this.s=s;this.telemetry=telemetry;}
 public record Element(String id,String kind,double x,double y,double width,double height,double rotation,String text,String color,@JsonDeserialize(using=StationSpaceService.StrictInteger.class) int fontSize,String align,@JsonDeserialize(using=StationSpaceService.StrictDeviceId.class) String deviceId,@JsonDeserialize(using=StationSpaceService.StrictDeviceId.class) String pointId){}
 public record Edge(String id,String source,String target){}
 public record Graph(List<Element> elements,List<Edge> edges,@JsonInclude(JsonInclude.Include.NON_NULL) JsonNode editorDocument){
  public Graph(List<Element> elements,List<Edge> edges){this(elements,edges,null);}
 }
 public record Diagram(String stationId,long version,Graph graph){}
 public record SaveRequest(@JsonDeserialize(using=StationSpaceService.StrictVersion.class) Long expectedVersion,Graph graph){}
 public Diagram read(long station){s.access.requireStationPermission(station,"asset.read");var result=current(station);s.access.requireStationPermission(station,"asset.read");return result;}
 private Diagram current(long station){
  var rows=s.db.queryForList("SELECT graph::text AS graph,version FROM station_wiring_diagram WHERE station_id=?",station);
  if(rows.isEmpty())return new Diagram(Long.toString(station),0,null);
  try{return new Diagram(Long.toString(station),((Number)rows.getFirst().get("version")).longValue(),JSON.readValue(rows.getFirst().get("graph").toString(),Graph.class));}
  catch(java.io.IOException e){throw new IllegalStateException("Invalid persisted diagram",e);}
 }
 public List<Map<String,Object>> bindings(long station){
  s.access.requireStationPermission(station,"asset.read");
  var result=s.db.queryForList("SELECT d.id::text AS \"deviceId\",d.name AS \"deviceName\",mp.id::text AS \"pointId\",k.name AS \"pointName\",k.unit FROM device d LEFT JOIN measurement_point mp ON mp.device_id=d.id LEFT JOIN measurement_kind k ON k.code=mp.kind_code WHERE d.station_id=? ORDER BY d.id,mp.id LIMIT 10001",station);
  if(result.size()>10000)throw new BusinessException(413,"站点测点超过画布选择上限");
  s.access.requireStationPermission(station,"asset.read");return result;
 }
 public Map<String,Object> values(long station){
  s.access.requireStationPermission(station,"telemetry.read");var diagram=read(station);
  validateBindings(station,diagram.graph(),false);
  var ids=diagram.graph()==null?List.<Long>of():bindingElements(diagram.graph()).stream().map(Element::pointId).filter(Objects::nonNull).map(Long::valueOf).distinct().sorted().toList();
  var result=ids.isEmpty()?Map.<String,Object>of("items",List.of(),"serverTime",System.currentTimeMillis()):telemetry.snapshot(station,ids,false);
  s.access.requireStationPermission(station,"telemetry.read");var after=read(station);
  if(after.version()!=diagram.version())throw new BusinessException(409,"接线图已变化，请刷新");validateBindings(station,diagram.graph(),false);return result;
 }
 public Diagram save(long station,SaveRequest request){
  edit(station);if(request==null||request.expectedVersion()==null||request.expectedVersion()<0)throw invalid("版本无效");validate(request.graph());
  return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource()))).execute(status->{
   s.db.queryForObject("SELECT pg_advisory_xact_lock_shared(78291001)",Object.class);
   s.one("SELECT id FROM station WHERE id=? FOR UPDATE",station);edit(station);
   var existing=current(station);if(existing.version()!=request.expectedVersion())throw new BusinessException(409,"接线图已被更新，请重新读取后编辑");
   validateBindings(station,request.graph(),true);
   try{s.db.update("INSERT INTO station_wiring_diagram(station_id,graph,version,updated_by) VALUES(?,?::jsonb,1,?) ON CONFLICT(station_id) DO UPDATE SET graph=excluded.graph,version=station_wiring_diagram.version+1,updated_by=excluded.updated_by,updated_at=clock_timestamp()",station,JSON.writeValueAsString(request.graph()),s.access.userId());}
   catch(java.io.IOException e){throw new IllegalStateException(e);}
   s.auditStation("station-wiring-diagram.save",station,Map.of("version",existing.version()+1,"elements",request.graph().elements().size(),"edges",request.graph().edges().size()));return current(station);
  });
 }
 private void validateBindings(long station,Graph graph,boolean lock){
  if(graph==null)return;
  for(var e:bindingElements(graph))if(e.deviceId()!=null){
   var owned=s.db.queryForList("SELECT id FROM device WHERE id=? AND station_id=?"+(lock?" FOR SHARE":""),Long.class,id(e.deviceId()),station);
   if(owned.isEmpty())throw new BusinessException(403,"绑定设备不属于当前站点，请重新编辑接线图");
   if(e.pointId()!=null&&s.db.queryForList("SELECT id FROM measurement_point WHERE id=? AND device_id=?"+(lock?" FOR SHARE":""),Long.class,id(e.pointId()),id(e.deviceId())).isEmpty())throw new BusinessException(403,"绑定测点不属于所选设备，请重新编辑接线图");
  }
 }
 private void edit(long station){s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"asset.edit");}
 static void validate(Graph graph){
  if(graph==null||graph.elements()==null||graph.edges()==null||graph.elements().size()>500||graph.edges().size()>1000)throw invalid("画布最多500个元件、1000条连线");
  validateEditorDocument(graph.editorDocument());
  var ids=new HashSet<String>();
  for(var e:graph.elements()){
   if(e==null||!validKey(e.id())||!ids.add(e.id())||e.kind()==null||!Set.of("device","text","junction","breaker").contains(e.kind()))throw invalid("元件标识或类型无效");
   if(!bounded(e.x(),0,10000)||!bounded(e.y(),0,10000)||!bounded(e.width(),20,1000)||!bounded(e.height(),20,1000)||!bounded(e.rotation(),-360,360)||e.x()+e.width()>10000||e.y()+e.height()>10000)throw invalid("元件坐标、尺寸或旋转超出范围");
   if(e.text()==null||e.text().length()>200||e.color()==null||!e.color().matches("#[0-9a-fA-F]{6}")||e.fontSize()<12||e.fontSize()>99||e.align()==null||!Set.of("left","center","right").contains(e.align()))throw invalid("文字样式无效");
   if(e.pointId()!=null&&e.deviceId()==null)throw invalid("测点必须绑定设备");if(e.deviceId()!=null)id(e.deviceId());if(e.pointId()!=null)id(e.pointId());
  }
  var edges=new HashSet<String>();for(var e:graph.edges())if(e==null||!validKey(e.id())||!edges.add(e.id())||!ids.contains(e.source())||!ids.contains(e.target())||e.source().equals(e.target()))throw invalid("连线标识或端点无效");
 }
 private static List<Element> bindingElements(Graph graph){
  var result=new ArrayList<Element>(graph.elements());
  if(graph.editorDocument()!=null&&!graph.editorDocument().isNull()){
   validateEditorDocument(graph.editorDocument());
   for(var n:graph.editorDocument().get("nodes"))if(n.hasNonNull("deviceId"))result.add(new Element(n.get("id").asText(),"device",0,0,20,20,0,"","#000000",12,"left",n.get("deviceId").asText(),n.hasNonNull("pointId")?n.get("pointId").asText():null));
  }
  return result.stream().distinct().toList();
 }
 static void validateEditorDocument(JsonNode doc){
  if(doc==null||doc.isNull())return;
  try{if(JSON.writeValueAsBytes(doc).length>512*1024)throw invalid("编辑文档超过512KiB");}catch(java.io.IOException e){throw invalid("编辑文档无效");}
  if(!doc.isObject()||!doc.path("schema").isIntegralNumber()||!doc.path("schema").canConvertToInt()||doc.path("schema").intValue()!=1||!doc.path("nodes").isArray()||!doc.path("edges").isArray()||doc.path("nodes").size()>500||doc.path("edges").size()>1000)throw invalid("编辑文档结构或版本无效");
  metadataDepth(doc,0);
  var ids=new HashSet<String>();
  for(var n:doc.get("nodes")){
   if(!n.isObject()||!n.path("id").isTextual()||!validKey(n.path("id").asText())||!ids.add(n.path("id").asText())||!n.path("type").isTextual()||!Set.of("grid","meter","transformer","bus","breaker","pcs","battery","pv","load","ems","charger","gateway").contains(n.path("type").asText())||!n.path("name").isTextual()||n.path("name").asText().length()>200||!n.path("x").isNumber()||!n.path("y").isNumber()||!bounded(n.path("x").doubleValue(),0,10000)||!bounded(n.path("y").doubleValue(),0,10000))throw invalid("编辑元件无效");
   for(String key:List.of("deviceId","pointId"))if(n.hasNonNull(key)){if(!n.get(key).isTextual())throw invalid("绑定标识必须为字符串");id(n.get(key).asText());}
   if(n.hasNonNull("pointId")&&!n.hasNonNull("deviceId"))throw invalid("测点必须绑定设备");
  }
  var edges=new HashSet<String>();
  for(var e:doc.get("edges"))if(!e.isObject()||!e.path("id").isTextual()||!validKey(e.path("id").asText())||!edges.add(e.path("id").asText())||!e.path("from").isTextual()||!e.path("to").isTextual()||!ids.contains(e.path("from").asText())||!ids.contains(e.path("to").asText())||e.path("from").asText().equals(e.path("to").asText())||!Set.of("ac","dc").contains(e.path("kind").asText()))throw invalid("编辑连线无效");
 }
 private static void metadataDepth(JsonNode node,int depth){
  if(depth>30)throw invalid("编辑文档嵌套过深");
  if(node.isObject()){
   var fields=node.fields();while(fields.hasNext()){var field=fields.next();if(Set.of("__proto__","prototype","constructor","script","onload","onerror","srcdoc","innerHTML").contains(field.getKey()))throw invalid("编辑文档包含不支持的执行字段");metadataDepth(field.getValue(),depth+1);}
  }else if(node.isArray())for(var child:node)metadataDepth(child,depth+1);
 }
 private static boolean validKey(String value){return value!=null&&value.matches("[A-Za-z0-9_-]{1,80}");}
 private static boolean bounded(double n,double min,double max){return Double.isFinite(n)&&n>=min&&n<=max;}
 private static long id(String value){try{if(value==null||!value.matches("[1-9][0-9]{0,18}"))throw new NumberFormatException();return Long.parseLong(value);}catch(NumberFormatException e){throw invalid("绑定标识无效");}}
 private static BusinessException invalid(String message){return new BusinessException(400,message);}
}
