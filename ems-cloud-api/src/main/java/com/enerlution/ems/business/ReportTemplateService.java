package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Private report presentation preferences; the report readers retain all existing data checks. */
@Service
public class ReportTemplateService {
  private final DomainSupport s;
  public record Field(String code,String label,String group,boolean locked,List<String> linkRef) {}
  public record TimeType(String code,String label) {}
  public record Catalogue(int schemaVersion,List<TimeType> timeTypes,List<Field> fields) {}
  public record Template(String id,String name,String kind,String timeType,String origin,List<String> fields,int schemaVersion,long version) {}
  public record Snapshot(String id,String name,String kind,String timeType,List<String> fields,int schemaVersion,long version) {}
  public record CreateRequest(String name,String kind,String timeType,List<String> fields) {}
  public record UpdateRequest(String name,String timeType,List<String> fields,
      @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StationGenerationPlanService.StrictVersion.class) Long expectedVersion) {}
  public record CloneRequest(String name,
      @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StationGenerationPlanService.StrictVersion.class) Long expectedVersion) {}
  private record Owner(long tenant,long user) {}
  private record SectionSpec(String code,String title,List<AnalysisJobService.Column> columns) {}
  private record SummarySpec(String code,String label) {}
  private static final List<TimeType> TIMES=List.of(new TimeType("day","日"),new TimeType("month","月"),new TimeType("year","年"),new TimeType("range","日期范围"));
  private static final Set<String> KINDS=Set.of("operations","revenue","health");
  private static final List<Field> META=List.of(new Field("meta.stationId","站点ID","报告信息",true,List.of()),
      new Field("meta.from","开始时间（含）","报告信息",true,List.of()),new Field("meta.to","结束时间（不含）","报告信息",true,List.of()),
      new Field("meta.generatedAt","生成时间","报告信息",true,List.of()));
  public ReportTemplateService(DomainSupport s) { this.s=s; }
  static String normalizeName(String name) {
    if(name==null)throw invalid("模板名称不能为空");String value=name.strip();
    if(value.isEmpty() || value.codePointCount(0,value.length())>50)throw invalid("模板名称应为1–50个字符");
    return value;
  }
  static String timeType(String type) {
    if(TIMES.stream().noneMatch(t->t.code().equals(type)))throw invalid("未知模板周期");return type;
  }
  private static String kind(String kind) { if(!KINDS.contains(Objects.toString(kind,"")))throw invalid("未知报告类型");return kind; }
  private static SectionSpec section(String code,String title,String... pairs) {
    var columns=new ArrayList<AnalysisJobService.Column>();
    for(int i=0;i<pairs.length;i+=2)columns.add(new AnalysisJobService.Column(pairs[i],pairs[i+1]));
    return new SectionSpec(code,title,List.copyOf(columns));
  }
  // V1 is intentionally a closed catalogue of existing generated columns, not a remote schema.
  private static SectionSpec received() { return section("received","已接收遥测事实与测点覆盖（按源时间，各组测点数不相加）","source","来源","quality","质量","records","事实记录数","points","有记录测点数"); }
  private static List<SectionSpec> sections(String kind) {
    return switch(kind(kind)) {
      case "operations" -> List.of(
        section("plans","运营计划（按上海业务日期）","service_date","日期","version","版本","status","状态","start_minute","开始分钟","end_minute","结束分钟","mode","模式","power_kw","功率kW"),
        section("diagnostics","接入诊断统计（按接收时间）","reason","原因","retained_samples","留存样本数","last_received_at","最后接收时间"),received());
      case "revenue" -> List.of(
        section("records","结算记录（仅 settled 计入确认金额）","record_id","记录ID","reference","编号","recognition_date","确认日期","currency","币种","status","状态","statement_amount","账单金额","estimated_amount","估算金额","meter_complete","计量完整","calculation_complete","计算完整"),
        section("lines","结算项目","record_id","记录ID","reference","编号","currency","币种","status","状态","category","项目","amount","金额"));
      default -> List.of(
        section("devices","当前设备测点目录（旧观测缺少原始站点依据，不纳入历史报告）","device_id","设备ID","code","编号","name","设备","catalog_points","目录测点数"),
        section("communication","EMS 最新通信证据（不代表历史可用率）","ems_id","EMS","binding_period_id","绑定ID","last_fresh_heartbeat","最后心跳","reachable","生成时可达"),
        section("alarms","具有原始站点依据的 EMS 告警","alarm_id","告警ID","code","编码","title","告警","severity","级别","occurred_at","发生时间","recovered_at","恢复时间"),received());
    };
  }
  private static List<SummarySpec> summaries(String kind) {
    return switch(kind(kind)) {
      case "operations" -> List.of(new SummarySpec("planPeriods","运营计划时段"),new SummarySpec("energy","日电量"));
      case "revenue" -> List.of(new SummarySpec("confirmedAmount","已确认结算金额"),new SummarySpec("recordCount","结算记录"));
      default -> List.of(new SummarySpec("healthScore","健康评分"),new SummarySpec("availability","可用率"),new SummarySpec("alarms","区间告警"));
    };
  }
  static Catalogue catalogue(String kind) {
    kind(kind);var fields=new ArrayList<Field>(META);
    for(var summary:summaries(kind))fields.add(new Field("summary."+summary.code(),summary.label(),"报告摘要",false,List.of()));
    for(var section:sections(kind))for(var column:section.columns()) {
      String code="section."+section.code()+"."+column.key();
      boolean monetary=kind.equals("revenue") && Set.of("statement_amount","estimated_amount","amount").contains(column.key());
      fields.add(new Field(code,column.label(),section.title(),false,monetary?List.of("section."+section.code()+".currency"):List.of()));
    }
    return new Catalogue(1,TIMES,List.copyOf(fields));
  }
  static List<String> normalizeFields(String kind,List<String> fields) {
    var catalogue=catalogue(kind);var allowed=catalogue.fields().stream().map(Field::code).toList();
    if(fields==null || fields.size()>allowed.size() || fields.stream().anyMatch(f->f==null || !allowed.contains(f)) || new HashSet<>(fields).size()!=fields.size())
      throw invalid("报告字段无效或重复");
    var chosen=new HashSet<>(fields);
    for(var field:catalogue.fields())if((field.locked() && !chosen.contains(field.code())) || (chosen.contains(field.code()) && !chosen.containsAll(field.linkRef())))
      throw invalid("请保留必选字段及关联字段");
    return allowed.stream().filter(chosen::contains).toList();
  }
  static List<Template> systems() {
    var result=new ArrayList<Template>();
    for(String kind:List.of("operations","revenue","health"))for(var period:TIMES) {
      String label=switch(kind){case "operations"->"运营报告";case "revenue"->"收益报告";default->"设备健康报告";};
      String id=UUID.nameUUIDFromBytes(("ems-report-template-v1:"+kind+":"+period.code()).getBytes(StandardCharsets.UTF_8)).toString();
      result.add(new Template(id,label+" · "+period.label(),kind,period.code(),"system",catalogue(kind).fields().stream().map(Field::code).toList(),1,1));
    }
    return List.copyOf(result);
  }
  public Catalogue fields(String kind) { s.access.context();return catalogue(kind); }
  public List<Template> list(String kind,String timeType) {
    if(kind!=null)kind(kind);if(timeType!=null)timeType(timeType);Owner o=owner();
    var result=new ArrayList<>(systems().stream().filter(t->(kind==null || t.kind().equals(kind)) && (timeType==null || t.timeType().equals(timeType))).toList());
    var customs=s.db.query("SELECT * FROM report_template WHERE tenant_id=? AND user_id=? ORDER BY lower(name),id",this::row,o.tenant(),o.user());
    result.addAll(customs.stream().filter(t->(kind==null || t.kind().equals(kind)) && (timeType==null || t.timeType().equals(timeType))).toList());
    return List.copyOf(result);
  }
  public Template create(CreateRequest request) {
    if(request==null)throw invalid("缺少模板内容");
    String name=normalizeName(request.name()),kind=kind(request.kind()),period=timeType(request.timeType());var fields=normalizeFields(kind,request.fields());Owner o=owner();
    return write(o,()->insert(o,name,kind,period,fields,"create"));
  }
  public Template update(String id,UpdateRequest request) {
    if(request==null)throw invalid("缺少模板内容");String name=normalizeName(request.name()),period=timeType(request.timeType());long version=expectedVersion(request.expectedVersion());Owner o=owner();
    return write(o,()->{
      Template current=custom(o,id);checkVersion(current,version);var fields=normalizeFields(current.kind(),request.fields());
      s.db.update("UPDATE report_template SET name=?,time_type=?,fields=?::text[],version=version+1 WHERE id=? AND tenant_id=? AND user_id=? AND version=?",name,period,fields.toArray(String[]::new),uuid(id),o.tenant(),o.user(),version);
      audit("update",id);return custom(o,id);
    });
  }
  public void delete(String id,Long expectedVersion) {
    long version=expectedVersion(expectedVersion);Owner o=owner();
    write(o,()->{checkVersion(custom(o,id),version);s.db.update("DELETE FROM report_template WHERE id=? AND tenant_id=? AND user_id=? AND version=?",uuid(id),o.tenant(),o.user(),version);audit("delete",id);return null;});
  }
  public Template clone(String id,CloneRequest request) {
    if(request==null)throw invalid("缺少另存内容");String name=normalizeName(request.name());long version=expectedVersion(request.expectedVersion());Owner o=owner();
    return write(o,()->{Template source=resolve(o,id);checkVersion(source,version);return insert(o,name,source.kind(),source.timeType(),source.fields(),"clone");});
  }
  private Template insert(Owner o,String name,String kind,String period,List<String> fields,String operation) {
    long count=s.db.queryForObject("SELECT count(*) FROM report_template WHERE tenant_id=? AND user_id=?",Long.class,o.tenant(),o.user());
    if(count>=10)throw new BusinessException(409,"最多保存10个私人报表模板");
    UUID id=UUID.randomUUID();
    s.db.update("INSERT INTO report_template(id,tenant_id,user_id,name,kind,time_type,fields) VALUES(?,?,?,?,?,?,?::text[])",id,o.tenant(),o.user(),name,kind,period,fields.toArray(String[]::new));
    audit(operation,id.toString());return custom(o,id.toString());
  }
  private Template row(java.sql.ResultSet rs,int index) throws SQLException {
    var array=rs.getArray("fields");try{return new Template(rs.getObject("id",UUID.class).toString(),rs.getString("name"),rs.getString("kind"),rs.getString("time_type"),"custom",List.of((String[])array.getArray()),rs.getInt("schema_version"),rs.getLong("version"));}finally{array.free();}
  }
  private Template custom(Owner o,String id) {
    if(systems().stream().anyMatch(t->t.id().equals(id)))throw new BusinessException(409,"系统模板只读，请另存为私人模板");
    var rows=s.db.query("SELECT * FROM report_template WHERE tenant_id=? AND user_id=? AND id=?",this::row,o.tenant(),o.user(),uuid(id));
    if(rows.isEmpty())throw new BusinessException(404,"模板不存在");return rows.getFirst();
  }
  private Template resolve(Owner o,String id) { return systems().stream().filter(t->t.id().equals(id)).findFirst().orElseGet(()->custom(o,id)); }
  private Owner owner(){var context=s.access.context();return new Owner(context.tenantId(),context.actorId());}
  private static UUID uuid(String id){try{return UUID.fromString(id);}catch(Exception e){throw invalid("模板ID无效");}}
  private static long expectedVersion(Long version){if(version==null || version<1)throw invalid("缺少有效模板版本");return version;}
  private static void checkVersion(Template t,long version){if(t.version()!=version)throw new BusinessException(409,"模板已变化，请刷新后重试");}
  private void lock(Owner o){s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"report-template:"+o.tenant()+":"+o.user());}
  private <T>T write(Owner o,Supplier<T> action){try{return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource()))).execute(status->{lock(o);return action.get();});}catch(DuplicateKeyException ex){throw new BusinessException(409,"模板名称已存在");}}
  private void audit(String operation,String id){s.audit("report-template."+operation,Map.of("templateId",id));}
  /** Must run in the job insertion transaction, keeping version validation and snapshot atomic. */
  Snapshot snapshotForJob(String id,Long version,String kind) {
    Owner o=owner();lock(o);Template source=resolve(o,id);checkVersion(source,expectedVersion(version));
    if(!source.kind().equals(kind))throw invalid("模板与报告类型不匹配");
    return new Snapshot(source.id(),source.name(),source.kind(),source.timeType(),source.fields(),source.schemaVersion(),source.version());
  }
  static Snapshot readSnapshot(Object value,ObjectMapper json) {
    if(value==null)return null;
    try {
      Snapshot snapshot=json.readValue(value.toString(),Snapshot.class);
      if(snapshot.schemaVersion()!=1)throw new IllegalArgumentException();
      normalizeFields(snapshot.kind(),snapshot.fields());timeType(snapshot.timeType());return snapshot;
    }catch(Exception e){throw new BusinessException(503,"报告模板快照暂不可用");}
  }
  static AnalysisJobService.Content filter(Snapshot snapshot,AnalysisJobService.Content content,long station,String from,String to,String generatedAt) {
    var chosen=new HashSet<>(normalizeFields(snapshot.kind(),snapshot.fields()));
    var summary=content.summary().stream().filter(item->summaries(snapshot.kind()).stream().anyMatch(def->def.label().equals(item.label()) && chosen.contains("summary."+def.code()))).toList();
    var sections=new ArrayList<AnalysisJobService.Section>();
    sections.add(new AnalysisJobService.Section("报告信息",META.stream().map(f->new AnalysisJobService.Column(f.code().substring(5),f.label())).toList(),
        List.of(Map.of("stationId",Long.toString(station),"from",from,"to",to,"generatedAt",generatedAt))));
    for(var original:content.sections()) {
      var spec=sections(snapshot.kind()).stream().filter(def->def.title().equals(original.title())).findFirst();
      if(spec.isEmpty())continue;
      var columns=original.columns().stream().filter(column->chosen.contains("section."+spec.get().code()+"."+column.key())).toList();
      if(columns.isEmpty())continue;
      var rows=new ArrayList<Map<String,Object>>();
      for(var originalRow:original.rows()) {var row=new LinkedHashMap<String,Object>();for(var column:columns)row.put(column.key(),originalRow.get(column.key()));rows.add(row);}
      sections.add(new AnalysisJobService.Section(original.title(),columns,List.copyOf(rows)));
    }
    return new AnalysisJobService.Content(summary,List.copyOf(sections));
  }
  static List<AnalysisJobService.Section> csvSections(AnalysisJobService.Content content) {
    var sections=new ArrayList<AnalysisJobService.Section>();
    if(!content.summary().isEmpty()) {
      var rows=new ArrayList<Map<String,Object>>();for(var summary:content.summary()) {var row=new LinkedHashMap<String,Object>();row.put("label",summary.label());row.put("value",summary.value());row.put("unit",summary.unit());rows.add(row);}
      sections.add(new AnalysisJobService.Section("报告摘要",List.of(new AnalysisJobService.Column("label","指标"),new AnalysisJobService.Column("value","值"),new AnalysisJobService.Column("unit","单位")),rows));
    }
    sections.addAll(content.sections());return sections;
  }
  private static BusinessException invalid(String message){return new BusinessException(400,message);}
}
