package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Verified presentation configuration only. Deliberately has no report engine or scheduler. */
@Service
public class RegularReportConfigService {
 private final DomainSupport s;
 private final ObjectMapper json = new ObjectMapper();
 public RegularReportConfigService(DomainSupport s){this.s=s;}
 public record TemplateDraft(String name,String type,List<String> fields,@com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StationGenerationPlanService.StrictVersion.class) Long version){}
 public record TaskDraft(String name,String type,String templateId,@com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StationGenerationPlanService.StrictVersion.class) Long templateVersion,String scope,List<Long> stationIds,Integer range,Integer frequency,String time,@com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StationGenerationPlanService.StrictVersion.class) Long version){}
 public record Config(String id,String category,String name,String type,Object payload,long version){}
 private record Owner(long tenant,long user){}
 private Owner owner(){s.access.requirePermission("report.export");var c=s.access.context();return new Owner(c.tenantId(),c.actorId());}
 private static BusinessException bad(String message){return new BusinessException(400,message);}
 static String name(String value){if(value==null || value.strip().isEmpty() || value.strip().codePointCount(0,value.strip().length())>50)throw bad("名称须为1—50个字符");return value.strip();}
 public static final Map<String,List<String>> FIELDS = new LinkedHashMap<>();
 static {
 FIELDS.put("daily",List.of("Site Name","Administrative Area","Address","Solar Capacity","Storage Installed Power","Storage Installed Capacity","System Type","Site type","Azimuth","Tilt Angle","On-grid Date","Creation Date","Tag","stationID","Belong To Group","Name of sub-site","Sub-site Capacity","Device Info","Device SN","Device Name","Device Type","Logger SN","Actual Connected String Capacity","Ratio","Meter Location","Meter Data Classification","Production","Consumption","Grid Feed-in","Energy Purchased","Charge","Discharge","Battery Charged","Battery Discharged","MPPT Production","Irradiation","Weather","Full Load Hours","PR","Sub-site Production","Sub-site Peak Hours","Inverter Production","Inverter Peak Hours","Meter Positive Total Energy","Meter Positive Sharp Energy","Meter Positive Peak Energy","Meter Positive Ordinary Energy","Meter Positive Valley Energy","Meter Positive Deep Valley Energy","Meter Negative Total Energy","Meter Negative Sharp Energy","Meter Negative Peak Energy","Meter Negative Ordinary Energy","Meter Negative Valley Energy","Meter Negative Deep Valley Energy","Module Production","Microinverter Production"));
 FIELDS.put("monthly",List.of("Site Name","Administrative Area","Address","Solar Capacity","Storage Installed Power","Storage Installed Capacity","System Type","Site type","Azimuth","Tilt Angle","On-grid Date","Creation Date","Tag","Name of sub-site","Sub-site Capacity","Production","Consumption","Grid Feed-in","Energy Purchased","Charge","Discharge","Battery Charged","Battery Discharged","MPPT Production","Irradiation","Full Load Hours","PR","Sub-site Production","Sub-site Peak Hours"));
 FIELDS.put("yearly",List.of("Site Name","Administrative Area","Address","Solar Capacity","Storage Installed Power","Storage Installed Capacity","System Type","Site type","Azimuth","Tilt Angle","On-grid Date","Creation Date","Tag","Name of sub-site","Sub-site Capacity","Production","Consumption","Grid Feed-in","Energy Purchased","Charge","Discharge","Battery Charged","Battery Discharged","MPPT Production","Irradiation","Full Load Hours","PR","Sub-site Production","Sub-site Peak Hours"));
 FIELDS.put("total",List.of("Site Name","Administrative Area","Address","Solar Capacity","Storage Installed Power","Storage Installed Capacity","System Type","Site type","Azimuth","Tilt Angle","On-grid Date","Creation Date","Tag","stationID","Belong To Group","Device Info","Device SN","Device Name","Device Type","Meter Magnification (current ratio)","Meter Location","Logger SN","Meter Total Positive Total Energy","Meter Positive Deep Valley Energy","Meter Total Negative Total Energy","Meter Negative Deep Valley Energy"));
 }
 static void validateTemplate(String type,String name,List<String> fields){
  name(name);var allowed=FIELDS.get(type);
  if(allowed==null || fields==null || !fields.contains("Site Name") || new HashSet<>(fields).size()!=fields.size() || !allowed.containsAll(fields))throw bad("报表类型或模板字段无效，请保留场站名称");
  if(fields.contains("Device Info") && !fields.contains("Device SN"))throw bad("设备信息必须保留设备SN");
  if(!fields.contains("Device Info") && fields.stream().anyMatch(field->DEVICE_FIELDS.contains(field)||field.matches("^(Inverter |Meter |Module |Microinverter ).*")))throw bad("设备字段需要启用设备信息");
 }
 private static final Set<String> DEVICE_FIELDS=Set.of("Device SN","Device Name","Device Type","Logger SN","Actual Connected String Capacity","Ratio","Meter Location","Meter Data Classification","Meter Magnification (current ratio)");
 static void validateTask(String type,int range,int frequency,String time){
  if(!Set.of("daily","monthly").contains(Objects.toString(type,"")) || !Set.of(0,1,2,3,6,12).contains(range) || (type.equals("monthly") && range==0))throw bad("未核验的任务类型或数据范围");
  if(frequency==0 && "DAY".equals(time))return;
  if(frequency==1 && Set.of("FIRST","MID","LAST").contains(Objects.toString(time,"")))return;
  throw bad("未核验的生成频率与时间组合");
 }
 public Map<String,List<String>> catalog(){owner();return FIELDS;}
 private static String category(String category){if(!Set.of("template","task").contains(category))throw bad("未知配置类型");return category;}
 public List<Config> list(String category){var o=owner();return rows(o,category(category));}
 private List<Config> rows(Owner o,String category){return s.db.query("SELECT id,category,name,report_type,payload,version FROM regular_report_config WHERE tenant_id=? AND user_id=? AND category=? ORDER BY lower(name),id",(rs,n)->{Object payload;try{payload=json.readValue(rs.getString("payload"),Object.class);}catch(Exception e){throw new IllegalStateException(e);}return new Config(rs.getString("id"),rs.getString("category"),rs.getString("name"),rs.getString("report_type"),payload,rs.getLong("version"));},o.tenant(),o.user(),category);}
 private Config find(Owner o,String category,String id){return rows(o,category).stream().filter(row->row.id().equals(id)).findFirst().orElseThrow(()->new BusinessException(404,"配置不存在"));}
 public Config saveTemplate(String id,TemplateDraft draft){if(draft==null)throw bad("缺少模板内容");validateTemplate(draft.type(),draft.name(),draft.fields());var o=owner();return write(o,()->{
  if(id==null && rows(o,"template").size()>=10)throw new BusinessException(409,"最多创建10个自定义报表模板");
  return persist(o,"template",id,name(draft.name()),draft.type(),draft,draft.version());
 });}
 public Config saveTask(String id,TaskDraft draft){if(draft==null)throw bad("缺少任务内容");name(draft.name());if(draft.range()==null || draft.frequency()==null)throw bad("缺少任务数据范围或生成频率");validateTask(draft.type(),draft.range(),draft.frequency(),draft.time());var o=owner();return write(o,()->{
  var template=find(o,"template",draft.templateId());
  if(!template.type().equals(draft.type()) || draft.templateVersion()==null || template.version()!=draft.templateVersion())throw new BusinessException(409,"模板类型或版本已变化，请刷新后重试");
  if(!Set.of("all","specific").contains(Objects.toString(draft.scope(),"")) || draft.stationIds()==null || draft.stationIds().size()>200 || new HashSet<>(draft.stationIds()).size()!=draft.stationIds().size())throw bad("场站范围无效");
  if(draft.scope().equals("all") && !draft.stationIds().isEmpty() || draft.scope().equals("specific") && draft.stationIds().isEmpty())throw bad("请选择有效场站范围");
  for(Long station:draft.stationIds()){if(station==null || station<1)throw bad("场站无效");s.access.requireStationPermission(station,"report.export");Long tenant=s.db.queryForObject("SELECT tenant_id FROM station WHERE id=?",Long.class,station);if(tenant==null || tenant!=o.tenant())throw new BusinessException(403,"场站不属于当前租户");}
  return persist(o,"task",id,name(draft.name()),draft.type(),draft,draft.version());
 });}
 private Config persist(Owner o,String category,String id,String name,String type,Object payload,Long version){
  String encoded;try{encoded=json.writeValueAsString(payload);}catch(Exception e){throw bad("配置无法序列化");}
  if(id==null){id=UUID.randomUUID().toString();s.db.update("INSERT INTO regular_report_config(id,tenant_id,user_id,category,name,report_type,payload) VALUES(?::uuid,?,?,?,?,?,?::jsonb)",id,o.tenant(),o.user(),category,name,type,encoded);}
  else {var current=find(o,category,id);if(version==null || version!=current.version())throw new BusinessException(409,"配置已变化，请刷新后重试");if(category.equals("template") && referenced(o,id))throw new BusinessException(409,"模板已被任务引用，请先删除任务配置");s.db.update("UPDATE regular_report_config SET name=?,report_type=?,payload=?::jsonb,version=version+1 WHERE tenant_id=? AND user_id=? AND category=? AND id=?::uuid AND version=?",name,type,encoded,o.tenant(),o.user(),category,id,version);}
  s.audit("regular-report."+category+".save",Map.of("configId",id,"execution","not-configured"));return find(o,category,id);
 }
 private boolean referenced(Owner o,String id){return Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM regular_report_config WHERE tenant_id=? AND user_id=? AND category='task' AND payload->>'templateId'=?)",Boolean.class,o.tenant(),o.user(),id));}
 public void delete(String category,String id,Long version){category(category);var o=owner();write(o,()->{var current=find(o,category,id);if(version==null || version!=current.version())throw new BusinessException(409,"配置已变化，请刷新后重试");if(category.equals("template") && referenced(o,id))throw new BusinessException(409,"模板已被任务引用，请先删除任务配置");s.db.update("DELETE FROM regular_report_config WHERE tenant_id=? AND user_id=? AND category=? AND id=?::uuid AND version=?",o.tenant(),o.user(),category,id,version);s.audit("regular-report."+category+".delete",Map.of("configId",id));return null;});}
 private <T>T write(Owner o,Supplier<T> action){try{return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource()))).execute(status->{s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"regular-report:"+o.tenant()+":"+o.user());owner();return action.get();});}catch(org.springframework.dao.DuplicateKeyException e){throw new BusinessException(409,"名称已存在");}}
}


