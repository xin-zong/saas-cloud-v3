package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Private manual jobs. Only explicitly mapped current metadata can produce an artifact. */
@Service
public class RegularReportJobService {
 private final DomainSupport s;private final Clock clock;private final ObjectMapper json=new ObjectMapper();
 private record Owner(long tenant,long user){}
 public record Request(String category,String type,UUID templateId,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long templateVersion,String name,String scope,@JsonDeserialize(contentUsing=TariffTemplateService.StrictVersion.class) List<Long> stationIds,String from,String to,String language,@JsonDeserialize(contentUsing=TariffTemplateService.StrictText.class) List<String> fields){@JsonAnySetter public void unknown(String key,Object value){TariffTemplateService.rejectUnknown();}}
 public record Job(String id,String category,String name,String type,String templateId,String templateName,String createType,List<Long> stationIds,String from,String to,String language,String status,int progress,String errorCode,String errorMessage,String createdAt,String completedAt,List<String> columns,List<List<String>> rows,List<String> notes,long version){}
 public record Page(List<Job> items,long total){}
 public record Artifact(String name,byte[] bytes){}
 record Range(LocalDate from,LocalDate to){}
 private static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
 static final Set<String> INFO_FIELDS=Set.of("Site Name","Administrative Area","Address","Solar Capacity","Storage Installed Power","Storage Installed Capacity","System Type","Site type","Azimuth","Tilt Angle","On-grid Date","Tag","stationID","Device Info","Device SN","Device Name","Device Type");
 private static final Map<String,String> ZH=Map.ofEntries(Map.entry("Site Name","场站名称"),Map.entry("Administrative Area","行政区域"),Map.entry("Address","地址"),Map.entry("Solar Capacity","光伏容量(kW)"),Map.entry("Storage Installed Power","储能装机功率(kW)"),Map.entry("Storage Installed Capacity","储能装机容量(kWh)"),Map.entry("System Type","系统类型"),Map.entry("Site type","场站类型"),Map.entry("Azimuth","方位角"),Map.entry("Tilt Angle","倾角"),Map.entry("On-grid Date","并网日期"),Map.entry("Tag","场站标签"),Map.entry("stationID","场站ID"),Map.entry("Device SN","设备SN"),Map.entry("Device Name","设备名称"),Map.entry("Device Type","设备类型"));
 private static final String HEADER="id,category,name,report_type,template_id,template_name,create_type,station_ids,from_date,to_date,language,status,progress,error_code,error_message,created_at,completed_at,columns,preview_rows,notes,version";
 public RegularReportJobService(DomainSupport s,Clock clock){this.s=s;this.clock=clock;}
 private Owner owner(){s.access.requirePermission("report.export");var c=s.access.context();return new Owner(c.tenantId(),c.actorId());}
 static String name(String value){if(value==null||value.strip().isEmpty()||value.strip().codePointCount(0,value.strip().length())>200)throw bad("报表名称须为1—200个字符");return value.strip();}
 static List<String> unsupported(List<String> fields){return fields.stream().filter(f->!INFO_FIELDS.contains(f)).toList();}
 static Range range(String type,String from,String to,Clock clock){try{
  LocalDate start,end;
  switch(Objects.toString(type,"")){
   case "daily","total"->{start=LocalDate.parse(from);end=LocalDate.parse(to);}
   case "monthly"->{start=YearMonth.parse(from).atDay(1);end=YearMonth.parse(to).atEndOfMonth();}
   case "yearly"->{if(!from.matches("[0-9]{4}")||!to.matches("[0-9]{4}"))throw bad("年份无效");start=LocalDate.of(Integer.parseInt(from),1,1);end=LocalDate.of(Integer.parseInt(to),12,31);}
   case "production-day"->{start=LocalDate.parse(from);end=LocalDate.parse(to);long days=java.time.temporal.ChronoUnit.DAYS.between(start,LocalDate.now(clock.withZone(ZONE)));if(!start.equals(end)||days<1||days>=30)throw bad("生产日报只能选择昨天至前29天内的单日");}
   default->throw bad("未知报告类型");
  }
  if(start.getYear()<1||end.isBefore(start)||end.isAfter(start.plusYears(10)))throw bad("请选择10年内有效报告周期");return new Range(start,end);
 }catch(BusinessException ex){throw ex;}catch(Exception ex){throw bad("报告日期格式无效");}}
 private List<Long> allowed(Owner o,boolean activeOnly){var ids=new HashSet<>(s.access.stationIds("report.export"));return s.db.queryForList("SELECT id FROM station WHERE tenant_id=?"+(activeOnly?" AND archived_at IS NULL":"")+" ORDER BY id",Long.class,o.tenant()).stream().filter(ids::contains).filter(id->s.access.hasStationPermission(o.user(),id,"asset.read")).toList();}
 private void scope(Owner o,List<Long> ids){owner();for(Long id:ids){s.access.requireStationPermission(id,"report.export");s.access.requireStationPermission(id,"asset.read");Long tenant=s.db.queryForObject("SELECT tenant_id FROM station WHERE id=?",Long.class,id);if(tenant==null||tenant!=o.tenant())throw new BusinessException(403,"报告场站不属于当前企业");}}
 private void activeScope(Owner o,List<Long> ids){scope(o,ids);for(long id:ids){var row=s.one("SELECT archived_at FROM station WHERE id=? AND tenant_id=? FOR SHARE",id,o.tenant());if(row.get("archived_at")!=null)throw new BusinessException(410,"归档场站不可用于新报告生成");}}
 public Job create(Request r){Owner o=owner();if(r==null)throw bad("缺少报告请求");String name=name(r.name());if(!Set.of("regular","production").contains(Objects.toString(r.category(),"")))throw bad("未知报告类别");if(r.category().equals("production")!=Objects.equals(r.type(),"production-day"))throw bad("报告类别与类型不匹配");Range period=range(r.type(),r.from(),r.to(),clock);if(!Set.of("zh","en","tc","pt","es","fr","de","it").contains(Objects.toString(r.language(),"")))throw bad("未知导出语言");
  if(!Set.of("all","specific").contains(Objects.toString(r.scope(),""))||r.stationIds()==null)throw bad("场站范围无效");
  if(r.scope().equals("all")&&!r.stationIds().isEmpty())throw bad("全体场站请求不可附加场站ID");
  List<Long> ids=r.scope().equals("all")?allowed(o,true):new ArrayList<>(r.stationIds());
  if(ids.isEmpty()||ids.size()>200||ids.stream().anyMatch(id->id==null||id<1)||new HashSet<>(ids).size()!=ids.size())throw bad("请选择1—200个有效场站");
  if(r.category().equals("production")&&(!r.scope().equals("specific")||ids.size()!=1))throw bad("当前生产日报只接入单场站对象，业务组生成器尚未接入");scope(o,ids);
  return tx(()->{
   s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"regular-report:"+o.tenant()+":"+o.user());
   String templateName="生产运行日报";Object snapshot;
   if(r.category().equals("regular")){
    if(r.templateId()==null||r.templateVersion()==null||r.templateVersion()<1)throw bad("请选择有效模板与版本");
    var source=s.one("SELECT name,report_type,payload,version FROM regular_report_config WHERE id=? AND tenant_id=? AND user_id=? AND category='template' FOR SHARE",r.templateId(),o.tenant(),o.user());
    if(((Number)source.get("version")).longValue()!=r.templateVersion()||!r.type().equals(source.get("report_type")))throw new BusinessException(409,"模板版本或类型已变化，请刷新后重试");
    RegularReportConfigService.validateTemplate(r.type(),"request",r.fields());templateName=source.get("name").toString();snapshot=Map.of("templateId",r.templateId().toString(),"version",r.templateVersion(),"name",templateName,"type",r.type(),"fields",r.fields());
   }else{if(r.templateId()!=null||r.templateVersion()!=null||r.fields()==null||!r.fields().isEmpty())throw bad("生产日报不接受常规模板参数");snapshot=Map.of("type","production-day","fields",List.of());}
   activeScope(o,ids);UUID id=UUID.randomUUID();s.db.update("INSERT INTO regular_report_job(id,tenant_id,user_id,category,name,report_type,template_id,template_name,template_snapshot,station_ids,from_date,to_date,language,status) VALUES(?,?,?,?,?,?,?,?,?::jsonb,?::bigint[],?,?,?,'queued')",id,o.tenant(),o.user(),r.category(),name,r.type(),r.templateId(),templateName,encode(snapshot),ids.toArray(Long[]::new),period.from(),period.to(),r.language());
   if(r.category().equals("production"))fail(id,"GENERATOR_NOT_CONFIGURED","生产运行日报计算与XLSX版式尚未接入；请求已记录，不会生成替代报告。");
   else if(!Set.of("zh","en").contains(r.language()))fail(id,"LANGUAGE_NOT_SUPPORTED","当前档案导出仅接入简体中文与English；该语言请求已记录为失败。");
   else if(!unsupported(r.fields()).isEmpty())fail(id,"UNSUPPORTED_FIELDS","尚未接入所选字段的数据来源或计算："+String.join("、",unsupported(r.fields())));
   else generate(o,id,r,ids,period);
   scope(o,ids);s.audit("regular-report.job.create",Map.of("jobId",id.toString(),"category",r.category(),"stationIds",ids));return job(read(o,id,false));
  });
 }
 private void fail(UUID id,String code,String message){s.db.update("UPDATE regular_report_job SET status='failed',error_code=?,error_message=?,completed_at=now() WHERE id=?",code,message,id);}
 private void generate(Owner o,UUID id,Request r,List<Long> ids,Range period){
  s.db.update("UPDATE regular_report_job SET status='running' WHERE id=?",id);
  var fields=r.fields().stream().filter(f->!f.equals("Device Info")).toList();var rows=new ArrayList<List<String>>();boolean english=r.language().equals("en");String missing=english?"Not provided":"未提供";
  for(long station:ids){
   activeScope(o,List.of(station));var info=s.one("SELECT s.id,s.name,s.address,s.asset_type,s.rated_power_kw,s.capacity_kwh,p.country,p.province,p.city,p.solar_capacity_kw,p.grid_connection_date,p.details->>'siteType' AS site_type,p.details->>'moduleAzimuth' AS azimuth,p.details->>'moduleTilt' AS tilt FROM station s LEFT JOIN station_profile p ON p.station_id=s.id WHERE s.id=? AND s.tenant_id=? AND s.archived_at IS NULL",station,o.tenant());
   var values=stationValues(info,missing);
   if(fields.contains("Tag")){var tags=s.db.queryForList("SELECT t.name FROM station_tag t JOIN station_tag_link l ON l.tag_id=t.id AND l.tenant_id=t.tenant_id WHERE l.station_id=? AND l.tenant_id=? ORDER BY t.name",String.class,station,o.tenant());values.put("Tag",tags.isEmpty()?missing:String.join(" / ",tags));}
   if(r.fields().contains("Device Info")){
    var devices=s.db.queryForList("SELECT d.serial_number,d.name,m.category,p.source_type FROM device d LEFT JOIN device_model m ON m.id=d.model_id LEFT JOIN device_reference_profile p ON p.device_id=d.id WHERE d.station_id=? AND d.archived_at IS NULL ORDER BY d.id LIMIT 20001",station);
    if(devices.isEmpty()){var empty=new HashMap<>(values);for(String field:List.of("Device SN","Device Name","Device Type"))empty.put(field,english?"No device records":"无设备记录");rows.add(fields.stream().map(f->empty.getOrDefault(f,missing)).toList());}
    for(var device:devices){var current=new HashMap<>(values);current.put("Device SN",text(device.get("serial_number"),missing));current.put("Device Name",text(device.get("name"),missing));current.put("Device Type",deviceType((String)device.get("source_type"),(String)device.get("category"),english,missing));rows.add(fields.stream().map(f->current.getOrDefault(f,missing)).toList());if(rows.size()>20000){fail(id,"EXPORT_LIMIT","档案行数超过20000行上限，请缩小场站范围。");return;}}
   }else rows.add(fields.stream().map(f->values.getOrDefault(f,missing)).toList());
  }
  var columns=fields.stream().map(f->english?f:ZH.getOrDefault(f,f)).toList();List<String> notes=english?List.of("Current station/device metadata only. This workbook does not contain historical energy totals, telemetry, or production KPIs.","Requested period: "+period.from()+" to "+period.to()+". It does not change the as-of time of current metadata.","Generated at: "+Instant.now(clock),"Missing source values are marked Not provided; no missing value is replaced with zero."):List.of("本文件仅导出当前场站/设备档案，不包含历史发电量、遥测、生产运行指标或期间聚合。","请求周期："+period.from()+" 至 "+period.to()+"；当前档案不冒充该周期的历史快照。","生成时间："+Instant.now(clock),"源值缺失标记为“未提供”，不填零或估算值。");
  byte[] artifact;try{artifact=ReportXlsx.write(columns,rows,notes);}catch(RuntimeException ex){fail(id,"ARTIFACT_ERROR","XLSX序列化失败，请缩小字段或场站范围后重试。");return;}if(artifact.length>8388608){fail(id,"EXPORT_LIMIT","XLSX超过8MiB上限，请缩小场站范围。");return;}scope(o,ids);
  s.db.update("UPDATE regular_report_job SET status='completed',progress=100,columns=?::jsonb,preview_rows=?::jsonb,notes=?::jsonb,artifact=?,completed_at=now() WHERE id=?",encode(columns),encode(rows.subList(0,Math.min(200,rows.size()))),encode(notes),artifact,id);
 }
 static String deviceType(String source,String category,boolean english,String missing){if((source==null||source.isBlank())&&(category==null||category.isBlank()))return missing;String code=DeviceDetailRules.type(source,category);if(code.equals("other"))return text(source,text(category,missing));return switch(code){case "inverter"->english?"Inverter":"逆变器";case "cabinet"->english?"Energy storage cabinet":"储能机柜";case "pcs"->"PCS";case "battery-cluster"->english?"Battery cluster":"电池簇";case "battery-stack"->english?"Battery stack":"电池堆";case "air-conditioner"->english?"Air conditioner":"空调";case "meter"->english?"Smart meter":"智能电表";case "logger"->english?"Logger":"采集器";case "ems"->"EMS";default->missing;};}
 static Map<String,String> stationValues(Map<String,Object> row,String missing){var out=new HashMap<String,String>();out.put("Site Name",text(row.get("name"),missing));out.put("stationID",text(row.get("id"),missing));out.put("Address",text(row.get("address"),missing));var area=new ArrayList<String>();for(String key:List.of("country","province","city"))if(row.get(key)!=null&&!row.get(key).toString().isBlank())area.add(row.get(key).toString());out.put("Administrative Area",area.isEmpty()?missing:String.join(" / ",area));out.put("Solar Capacity",text(row.get("solar_capacity_kw"),missing));boolean storage=Set.of("BESS","Hybrid").contains(Objects.toString(row.get("asset_type"),""));out.put("Storage Installed Power",storage?text(row.get("rated_power_kw"),missing):missing);out.put("Storage Installed Capacity",storage?text(row.get("capacity_kwh"),missing):missing);out.put("System Type",text(row.get("asset_type"),missing));out.put("Site type",text(row.get("site_type"),missing));out.put("Azimuth",text(row.get("azimuth"),missing));out.put("Tilt Angle",text(row.get("tilt"),missing));out.put("On-grid Date",text(row.get("grid_connection_date"),missing));return out;}
 private static String text(Object value,String missing){return value==null||value.toString().isBlank()?missing:value.toString();}
 public Map<String,Object> capabilities(){owner();return Map.of("currentMetadataFields",INFO_FIELDS.stream().sorted().toList(),"languages",List.of("zh","en"),"productionAvailable",false);}
 public Page list(String category,int limit,int offset,String template,String type,LocalDate from,LocalDate to,String createType){Owner o=owner();if(!Set.of("regular","production").contains(Objects.toString(category,"")))throw bad("未知记录类别");if(limit<1||limit>100||offset<0||offset>100000)throw bad("分页范围无效");var ids=allowed(o,false).toArray(Long[]::new);var where=new StringBuilder(" WHERE tenant_id=? AND user_id=? AND category=? AND deleted_at IS NULL AND station_ids <@ ?::bigint[]");var args=new ArrayList<Object>(List.of(o.tenant(),o.user(),category,ids));
  if(template!=null&&!template.isBlank()){UUID id;try{id=UUID.fromString(template);}catch(Exception ex){throw bad("模板筛选无效");}where.append(" AND template_id=?");args.add(id);}
  if(type!=null&&!type.isBlank()){if(!RegularReportConfigService.FIELDS.containsKey(type)&&!type.equals("production-day"))throw bad("类型筛选无效");where.append(" AND report_type=?");args.add(type);}
  if(from!=null&&to!=null&&to.isBefore(from))throw bad("创建日期范围无效");
  if(from!=null){where.append(" AND created_at>=?");args.add(java.sql.Timestamp.from(from.atStartOfDay(ZONE).toInstant()));}
  if(to!=null){where.append(" AND created_at<?");args.add(java.sql.Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant()));}
  if(createType!=null&&!createType.isBlank()){if(!Set.of("M","A").contains(createType))throw bad("创建方式筛选无效");where.append(" AND create_type=?");args.add(createType);}
  Long total=s.db.queryForObject("SELECT count(*) FROM regular_report_job"+where,Long.class,args.toArray());args.add(limit);args.add(offset);
  var rows=s.db.queryForList("SELECT "+HEADER+" FROM regular_report_job"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",args.toArray());return new Page(rows.stream().map(this::job).toList(),total==null?0:total);
 }
 public Job query(UUID id){Owner o=owner();return tx(()->{var row=read(o,id,true);scope(o,ids(row));return job(row);});}
 public Artifact download(UUID id){Owner o=owner();return tx(()->{var row=read(o,id,true);scope(o,ids(row));if(!row.get("status").equals("completed"))throw new BusinessException(409,"报告未成功生成，无法下载");byte[] data=s.db.queryForObject("SELECT artifact FROM regular_report_job WHERE id=? AND tenant_id=? AND user_id=? AND deleted_at IS NULL",byte[].class,id,o.tenant(),o.user());scope(o,ids(row));if(data==null||data.length==0)throw new BusinessException(409,"报告文件不可用");s.audit("regular-report.job.download",Map.of("jobId",id.toString()));return new Artifact(safeFilename(row.get("name").toString()),data);});}
 public void delete(UUID id,Long version){Owner o=owner();if(version==null||version<1)throw bad("缺少有效记录版本");tx(()->{var row=s.one("SELECT "+HEADER+" FROM regular_report_job WHERE id=? AND tenant_id=? AND user_id=? AND deleted_at IS NULL FOR UPDATE",id,o.tenant(),o.user());scope(o,ids(row));if(((Number)row.get("version")).longValue()!=version)throw new BusinessException(409,"报告记录已变化");s.db.update("UPDATE regular_report_job SET deleted_at=now(),version=version+1 WHERE id=?",id);s.audit("regular-report.job.delete",Map.of("jobId",id.toString()));return null;});}
 static String safeFilename(String name){String value=name.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]","_").strip();return (value.isEmpty()?"report":value)+".xlsx";}
 private Map<String,Object> read(Owner o,UUID id,boolean lock){return s.one("SELECT "+HEADER+" FROM regular_report_job WHERE id=? AND tenant_id=? AND user_id=? AND deleted_at IS NULL"+(lock?" FOR SHARE":""),id,o.tenant(),o.user());}
 private List<Long> ids(Map<String,Object> row){try{Object value=row.get("station_ids");Object[] array=value instanceof java.sql.Array sql?(Object[])sql.getArray():(Object[])value;return Arrays.stream(array).map(v->((Number)v).longValue()).toList();}catch(Exception ex){throw new BusinessException(503,"报告场站范围不可用");}}
 @SuppressWarnings("unchecked") private Job job(Map<String,Object> row){return new Job(row.get("id").toString(),row.get("category").toString(),row.get("name").toString(),row.get("report_type").toString(),text(row.get("template_id"),null),row.get("template_name").toString(),row.get("create_type").toString(),ids(row),row.get("from_date").toString(),row.get("to_date").toString(),row.get("language").toString(),row.get("status").toString(),((Number)row.get("progress")).intValue(),text(row.get("error_code"),null),text(row.get("error_message"),null),timestamp(row.get("created_at")),timestamp(row.get("completed_at")),(List<String>)(List<?>)decode(row.get("columns")),(List<List<String>>)(List<?>)decode(row.get("preview_rows")),(List<String>)(List<?>)decode(row.get("notes")),((Number)row.get("version")).longValue());}
 private static String timestamp(Object value){if(value instanceof java.sql.Timestamp time)return time.toInstant().toString();if(value instanceof java.time.OffsetDateTime time)return time.toInstant().toString();return text(value,null);}
 private List<?> decode(Object value){try{return json.readValue(value.toString(),List.class);}catch(Exception ex){throw new BusinessException(503,"报告记录内容不可用");}}
 private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception ex){throw bad("报告请求无法序列化");}}
 private <T>T tx(Supplier<T> action){return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource()))).execute(status->action.get());}
 private static BusinessException bad(String message){return new BusinessException(400,message);}
}


