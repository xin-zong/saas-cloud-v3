package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.sql.Date;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;

@Service
public class StationMetricService {
 private final DomainSupport s; private final StoredDeviceTelemetryService stored;
 static final String POLICY="本项目保守口径（非参考平台公式）：按站点资料时区的自然日（含夏令时），以已审定pvPower/loadPower非负功率梯形积分；必须精确覆盖日初和次日日初、相邻采样不超过5分钟且质量有效。只接入本地stored_device历史；原生EMS/ClickHouse暂未接入本计算器，不影响既有遥测功能。原始电量测点可能存在，但未审定边界或历史不足时不作替代。充放电、购售电、MPPT方向及天气/守恒公式尚未审定。日修正=原始积分+日偏移；自然月/年仅全日完整时合计，累计偏移仅在完整月/年calibratedTotal中加一次，不改变每日流量，不用于账单。保存来源使旧结果失效，日偏移变更须重算该日；累计偏移即时更新汇总校准展示。";
 record Definition(String key,String label,String unit,boolean energy,String semantic){}
 static final List<Definition> DEFINITIONS=List.of(new Definition("pvEnergy","发电量","kWh",true,"pvPower"),new Definition("loadEnergy","用电量","kWh",true,"loadPower"),new Definition("chargeEnergy","充电量","kWh",true,null),new Definition("dischargeEnergy","放电量","kWh",true,null),new Definition("gridExportEnergy","上网电量","kWh",true,null),new Definition("gridImportEnergy","购电量","kWh",true,null),new Definition("mpptEnergy","MPPT电量","kWh",true,null),new Definition("soc","SOC","%",false,"soc"),new Definition("soh","SOH","%",false,"soh"));
 public StationMetricService(DomainSupport s,StoredDeviceTelemetryService stored){this.s=s;this.stored=stored;}
 public record SourceRequest(String mode,String pointId,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){@JsonAnySetter public void unknown(String k,Object v){throw invalid("不支持的来源字段");}}
 public record OffsetRequest(String value,String reason,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){@JsonAnySetter public void unknown(String k,Object v){throw invalid("日期由记录路径确定，不接受额外字段");}}
 public record RevokeRequest(String reason,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){@JsonAnySetter public void unknown(String k,Object v){throw invalid("不支持的撤销字段");}}
 public record RecalculateRequest(String from,String to){@JsonAnySetter public void unknown(String k,Object v){throw invalid("不支持的重算字段");}}
 public record Candidate(String pointId,String deviceId,String name,String unit,String semanticKey){}
 public record Source(String metricKey,String label,String unit,boolean energy,String mode,String pointId,String resolvedPointId,long version,String status,List<Candidate> candidates,String lastValue,Long sourceTime,String quality){}
 public record Sources(List<Source> items,String calculationPolicy){}
 public record Offset(String metricKey,String kind,String date,String value,String reason,long version,boolean active){}
 public record Offsets(List<Offset> items){}
 public record Job(String id,String from,String to,String status,String createdAt,int missingDays){}
 public record Result(String metricKey,String period,String periodStart,String rawValue,String correctedValue,String dailyOffset,String totalOffset,String calibratedTotal,int completeDays,int expectedDays,String status,String missingReason,long sourceVersion,String jobId){}
 public record Results(List<Result> days,List<Result> months,List<Result> years,List<Job> jobs,String calculationPolicy){}
 static BusinessException invalid(String m){return new BusinessException(400,m);}
 private void readPermission(long station){s.access.requireStationPermission(station,"asset.read");}
 private void writePermission(long station){readPermission(station);s.access.requireStationPermission(station,"asset.edit");}
 private void telemetryPermission(long station){readPermission(station);s.access.requireStationPermission(station,"telemetry.read");}
 private ZoneId zone(long station){
  var rows=s.db.queryForList("SELECT timezone FROM station_profile WHERE station_id=?",String.class,station);
  try{if(rows.isEmpty()||rows.getFirst()==null)throw new DateTimeException("missing");return ZoneId.of(rows.getFirst());}
  catch(DateTimeException e){throw invalid("站点时区未配置或无法识别，请先核对站点资料");}
 }
 private <T>T locked(long station,Supplier<T> action){return TariffTemplateService.transaction(s,()->{
  s.db.queryForObject("SELECT pg_advisory_xact_lock_shared(78291001)",Object.class);
  s.one("SELECT id FROM station WHERE id=? FOR UPDATE",station);s.db.queryForList("SELECT station_id FROM station_profile WHERE station_id=? FOR UPDATE",station);return action.get();
 });}
 private static Definition definition(String key){return DEFINITIONS.stream().filter(d->d.key().equals(key)).findFirst().orElseThrow(()->invalid("未知指标"));}
 private static Definition supportedEnergy(String key){Definition d=definition(key);if(!d.energy()||d.semantic()==null)throw invalid("该指标计量方向/公式尚未审定，不支持校准");return d;}
 private static void version(Long v){if(v==null||v<0)throw invalid("缺少有效版本");}
 private static void reason(String value){if(value==null||value.isBlank()||value.length()>500)throw invalid("理由须为1–500个字符");}
 private List<Candidate> candidates(long station,Definition d){
  if(d.semantic()==null)return List.of();
  return s.db.query("""
   SELECT mp.id,mp.device_id,rp.name,rp.unit,b.semantic_key FROM stored_device_point_binding b
   JOIN measurement_point mp ON mp.id=b.measurement_point_id JOIN reference_device_point rp ON rp.id=b.reference_point_id AND rp.device_id=mp.device_id
   JOIN device dev ON dev.id=mp.device_id AND dev.station_id=b.station_id
   WHERE b.station_id=? AND b.semantic_key=? AND rp.unit IN (?,?,?)
   AND NOT EXISTS(SELECT 1 FROM reference_device_sample x WHERE x.point_id=rp.id AND x.quality='text')
   ORDER BY mp.id LIMIT 2001
   """,(rs,i)->new Candidate(rs.getString("id"),rs.getString("device_id"),rs.getString("name"),rs.getString("unit"),rs.getString("semantic_key")),station,d.semantic(),d.energy()?"kW":"%",d.energy()?"W":"%",d.energy()?"MW":"%");
 }
 private Source readSource(long station,String key,boolean includeLatest){
  Definition d=definition(key);var candidates=candidates(station,d);if(candidates.size()>2000)throw new BusinessException(413,"指标候选超过2000，请缩小资产范围");
  var rows=s.db.queryForList("SELECT mode,point_id,version FROM station_metric_source WHERE station_id=? AND metric_key=?",station,key);
  String mode=rows.isEmpty()?"DYNAMIC":rows.getFirst().get("mode").toString();
  String point=rows.isEmpty()?null:Objects.toString(rows.getFirst().get("point_id"),null);long version=rows.isEmpty()?0:((Number)rows.getFirst().get("version")).longValue();
  String resolved=null,status;
  if(d.semantic()==null)status="unsupported";
  else if(mode.equals("STATIC")){
   if(point==null)status="none";else if(candidates.stream().anyMatch(c->c.pointId().equals(point))){resolved=point;status="resolved";}else status="missing";
  }else if(candidates.size()==1){resolved=candidates.getFirst().pointId();status="resolved";}else status=candidates.isEmpty()?"missing":"ambiguous";
  String lastValue=null,quality=null;Long sourceTime=null;
  if(includeLatest&&resolved!=null){
   boolean permitted=true;try{telemetryPermission(station);}catch(BusinessException e){if(e.status()!=403)throw e;permitted=false;}
   if(permitted){var latest=stored.latest(station,List.of(Long.parseLong(resolved)));if(!latest.isEmpty()){
    var value=latest.getFirst();lastValue=Objects.toString(value.get("numberExact"),null);
    if(lastValue==null&&"number".equals(value.get("valueType")))lastValue=Objects.toString(value.get("value"),null);
    sourceTime=value.get("sourceTime") instanceof Number n?n.longValue():null;quality=Objects.toString(value.get("quality"),null);
   }telemetryPermission(station);}
  }
  return new Source(key,d.label(),d.unit(),d.energy(),mode,point,resolved,version,status,candidates,lastValue,sourceTime,quality);
 }
 public Source source(long station,String key){readPermission(station);Source result=readSource(station,key,true);readPermission(station);return result;}
 public Sources sources(long station){readPermission(station);var items=DEFINITIONS.stream().map(d->readSource(station,d.key(),true)).toList();readPermission(station);return new Sources(items,POLICY);}
 public Source saveSource(long station,String key,SourceRequest r){
  writePermission(station);Definition d=definition(key);if(d.semantic()==null)throw invalid("该指标来源语义尚未审定");
  if(r==null)throw invalid("缺少来源配置");version(r.expectedVersion());if(!Set.of("STATIC","DYNAMIC").contains(Objects.toString(r.mode(),"")))throw invalid("来源模式须为DYNAMIC或STATIC");
  if("DYNAMIC".equals(r.mode())&&r.pointId()!=null)throw invalid("自动来源不能指定测点");
  if(r.pointId()!=null&&!r.pointId().matches("[1-9][0-9]{0,18}"))throw invalid("无效测点ID");
  return locked(station,()->{
   writePermission(station);Source before=readSource(station,key,false);if(before.version()!=r.expectedVersion())throw new BusinessException(409,"指标来源已变化，请刷新");
   if(r.pointId()!=null&&before.candidates().stream().noneMatch(c->c.pointId().equals(r.pointId())))throw invalid("测点不属于本站、单位不匹配或语义未审定");
   Long point=r.pointId()==null?null:Long.valueOf(r.pointId());
   s.db.update("INSERT INTO station_metric_source(station_id,metric_key,mode,point_id,version) VALUES(?,?,?,?,?) ON CONFLICT(station_id,metric_key) DO UPDATE SET mode=excluded.mode,point_id=excluded.point_id,version=excluded.version,updated_at=now()",station,key,r.mode(),point,before.version()+1);
   invalidate(station,key);Source after=readSource(station,key,false);audit(station,"station-metric-source.save",before,after);return after;
  });
 }
 private void invalidate(long station,String key){s.db.update("DELETE FROM station_metric_result WHERE station_id=? AND metric_key=?",station,key);}
 private void audit(long station,String action,Object before,Object after){var detail=new LinkedHashMap<String,Object>();detail.put("before",before);detail.put("after",after);s.auditStation(action,station,detail);}
 private static LocalDate date(String input){try{if(input==null||!input.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new IllegalArgumentException();return LocalDate.parse(input);}catch(RuntimeException e){throw invalid("日期格式须为YYYY-MM-DD");}}
 private LocalDate offsetDate(long station,String kind,String input){LocalDate d=date(input);if("TOTAL".equals(kind)){if(!d.equals(LocalDate.of(1970,1,1)))throw invalid("累计偏移日期必须为1970-01-01");}else if("DAILY".equals(kind)){if(!d.isBefore(LocalDate.now(zone(station))))throw invalid("日偏移仅允许站点时区的过去日期");}else throw invalid("偏移类型须为DAILY或TOTAL");return d;}
 private Offset readOffset(long station,String key,String kind,LocalDate date){var items=s.db.query("SELECT * FROM station_energy_offset WHERE station_id=? AND metric_key=? AND kind=? AND offset_date=?",(rs,i)->new Offset(rs.getString("metric_key"),rs.getString("kind"),rs.getString("offset_date"),rs.getString("value"),rs.getString("reason"),rs.getLong("version"),rs.getBoolean("active")),station,key,kind,Date.valueOf(date));return items.isEmpty()?null:items.getFirst();}
 public Offsets offsets(long station,String key){readPermission(station);definition(key);var rows=s.db.query("SELECT * FROM station_energy_offset WHERE station_id=? AND metric_key=? ORDER BY kind,offset_date DESC LIMIT 5001",(rs,i)->new Offset(rs.getString("metric_key"),rs.getString("kind"),rs.getString("offset_date"),rs.getString("value"),rs.getString("reason"),rs.getLong("version"),rs.getBoolean("active")),station,key);if(rows.size()>5000)throw new BusinessException(413,"偏移记录超过查询上限");readPermission(station);return new Offsets(rows);}
 public Offset saveOffset(long station,String key,String kind,String input,OffsetRequest r){
  writePermission(station);supportedEnergy(key);LocalDate d=offsetDate(station,kind,input);if(r==null)throw invalid("缺少偏移配置");version(r.expectedVersion());reason(r.reason());BigDecimal amount=StationMetricCalculator.offset(r.value());
  return locked(station,()->{writePermission(station);offsetDate(station,kind,input);Offset before=readOffset(station,key,kind,d);long v=before==null?0:before.version();if(v!=r.expectedVersion())throw new BusinessException(409,"偏移记录已变化，请刷新");
   s.db.update("INSERT INTO station_energy_offset(station_id,metric_key,kind,offset_date,value,reason,version,active) VALUES(?,?,?,?,?,?,?,true) ON CONFLICT(station_id,metric_key,kind,offset_date) DO UPDATE SET value=excluded.value,reason=excluded.reason,version=excluded.version,active=true,updated_at=now()",station,key,kind,Date.valueOf(d),amount,r.reason().trim(),v+1);
   changedOffset(station,key,kind,d);Offset after=readOffset(station,key,kind,d);audit(station,"station-energy-offset.save",before,after);return after;
  });
 }
 public Offset revokeOffset(long station,String key,String kind,String input,RevokeRequest r){
  writePermission(station);supportedEnergy(key);LocalDate d=offsetDate(station,kind,input);if(r==null)throw invalid("缺少撤销理由/版本");version(r.expectedVersion());reason(r.reason());
  return locked(station,()->{writePermission(station);offsetDate(station,kind,input);Offset before=readOffset(station,key,kind,d);if(before==null)throw new BusinessException(404,"偏移不存在");if(before.version()!=r.expectedVersion()||!before.active())throw new BusinessException(409,"偏移已变化或已撤销");
   s.db.update("UPDATE station_energy_offset SET active=false,reason=?,version=version+1,updated_at=now() WHERE station_id=? AND metric_key=? AND kind=? AND offset_date=?",r.reason().trim(),station,key,kind,Date.valueOf(d));
   changedOffset(station,key,kind,d);Offset after=readOffset(station,key,kind,d);audit(station,"station-energy-offset.revoke",before,after);return after;
  });
 }
 private void changedOffset(long station,String key,String kind,LocalDate day){
  if(kind.equals("TOTAL")){BigDecimal amount=offset(station,key,"TOTAL",LocalDate.of(1970,1,1));s.db.update("UPDATE station_metric_result SET total_offset=?,calibrated_total=CASE WHEN period<>'DAY' AND status='complete' THEN corrected_value+? ELSE NULL END WHERE station_id=? AND metric_key=?",amount,amount,station,key);}
  else s.db.update("DELETE FROM station_metric_result WHERE station_id=? AND metric_key=? AND ((period='DAY' AND period_start=?) OR (period='MONTH' AND period_start=?) OR (period='YEAR' AND period_start=?))",station,key,Date.valueOf(day),Date.valueOf(day.withDayOfMonth(1)),Date.valueOf(day.withDayOfYear(1)));
 }
 private LocalDate[] range(long station,String from,String to){LocalDate a=date(from),b=date(to);if(b.isBefore(a)||ChronoUnit.DAYS.between(a,b)>30||!b.isBefore(LocalDate.now(zone(station))))throw invalid("范围须为站点时区过去日期，结束不早于开始，最多31天");return new LocalDate[]{a,b};}
 private BigDecimal offset(long station,String key,String kind,LocalDate date){Offset o=readOffset(station,key,kind,date);return o==null||!o.active()?new BigDecimal("0.00"):new BigDecimal(o.value());}
 private record OffsetKey(String metric,String kind,LocalDate date){}
 /** One bounded snapshot covers all calendar rollups touched by the requested range. */
 private Map<OffsetKey,BigDecimal> offsetSnapshot(long station,LocalDate from,LocalDate to){
  var out=new HashMap<OffsetKey,BigDecimal>();
  s.db.query("SELECT metric_key,kind,offset_date,value FROM station_energy_offset WHERE station_id=? AND active AND (kind='TOTAL' OR (offset_date>=? AND offset_date<?))",(org.springframework.jdbc.core.RowCallbackHandler)rs->out.put(new OffsetKey(rs.getString("metric_key"),rs.getString("kind"),rs.getDate("offset_date").toLocalDate()),rs.getBigDecimal("value")),station,Date.valueOf(from.withDayOfYear(1)),Date.valueOf(to.withDayOfYear(1).plusYears(1)));
  return out;
 }
 private static BigDecimal offset(Map<OffsetKey,BigDecimal> snapshot,String key,String kind,LocalDate day){return snapshot.getOrDefault(new OffsetKey(key,kind,day),new BigDecimal("0.00"));}
 private static String text(BigDecimal n){return n==null?null:n.setScale(2,java.math.RoundingMode.HALF_UP).toPlainString();}
 public Job recalculate(long station,RecalculateRequest r){
  writePermission(station);telemetryPermission(station);if(r==null)throw invalid("缺少重算范围");LocalDate[] range=range(station,r.from(),r.to());
  return locked(station,()->{writePermission(station);telemetryPermission(station);ZoneId zone=zone(station);range(station,r.from(),r.to());
   Long job=s.db.queryForObject("INSERT INTO station_metric_job(station_id,from_date,to_date,status) VALUES(?,?,?,'running') RETURNING id",Long.class,station,Date.valueOf(range[0]),Date.valueOf(range[1]));int missing=0;
   var offsets=offsetSnapshot(station,range[0],range[1]);
   for(Definition d:DEFINITIONS){if(!d.energy())continue;Source source=readSource(station,d.key(),false);var dailyResults=new ArrayList<Result>();
    for(LocalDate day=range[0];!day.isAfter(range[1]);day=day.plusDays(1)){
     var energy=new StationMetricCalculator.Energy(null,source.status().equals("unsupported")?"计量方向或公式尚未审定":"无唯一已审定来源（未选、无候选或歧义）");
     if(source.resolvedPointId()!=null){
      long start=day.atStartOfDay(zone).toInstant().toEpochMilli(),end=day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
      var rows=stored.historyRows(Long.parseLong(source.resolvedPointId()),start,end+1);var samples=new ArrayList<StationMetricCalculator.Sample>();
      rows.forEach(row->{String value=row.path("number_exact").asText(null);samples.add(new StationMetricCalculator.Sample(row.path("source_at_ms").asLong(),value==null?null:new BigDecimal(value),"valid".equals(row.path("quality").asText())&&"number".equals(row.path("value_kind").asText())));});
      String unit=source.candidates().stream().filter(c->c.pointId().equals(source.resolvedPointId())).findFirst().orElseThrow().unit();energy=StationMetricCalculator.integrate(samples,start,end,unit);
     }
     BigDecimal daily=offset(offsets,d.key(),"DAILY",day),total=offset(offsets,d.key(),"TOTAL",LocalDate.of(1970,1,1));boolean complete=energy.value()!=null;if(!complete)missing++;
     dailyResults.add(new Result(d.key(),"DAY",day.toString(),text(energy.value()),text(complete?energy.value().add(daily):null),text(daily),text(total),null,complete?1:0,1,complete?"complete":"missing",energy.reason(),source.version(),job.toString()));
    }
    persist(station,dailyResults,source,zone);
    var rollups=new ArrayList<Result>();
    for(LocalDate month=range[0].withDayOfMonth(1);!month.isAfter(range[1]);month=month.plusMonths(1))rollups.add(aggregate(station,source,"MONTH",month,job.toString(),zone,offsets));
    for(int year=range[0].getYear();year<=range[1].getYear();year++)rollups.add(aggregate(station,source,"YEAR",LocalDate.of(year,1,1),job.toString(),zone,offsets));
    persist(station,rollups,source,zone);
   }
   s.db.update("UPDATE station_metric_job SET status='completed',missing_days=? WHERE id=?",missing,job);Job result=jobs(station).stream().filter(j->j.id().equals(job.toString())).findFirst().orElseThrow();s.auditStation("station-metric.recalculate",station,result);telemetryPermission(station);writePermission(station);return result;
  });
 }
 private void persist(long station,List<Result> results,Source source,ZoneId zone){String point=source.resolvedPointId();
  var batch=results.stream().map(r->new Object[]{station,r.metricKey(),r.period(),Date.valueOf(r.periodStart()),r.rawValue(),r.correctedValue(),r.dailyOffset(),r.totalOffset(),r.calibratedTotal(),r.completeDays(),r.expectedDays(),r.status(),r.missingReason(),r.sourceVersion(),point==null?null:Long.valueOf(point),zone.getId(),Long.parseLong(r.jobId())}).toList();
  s.db.batchUpdate("""
  INSERT INTO station_metric_result(station_id,metric_key,period,period_start,raw_value,corrected_value,daily_offset,total_offset,calibrated_total,complete_days,expected_days,status,missing_reason,source_version,resolved_point_id,calculation_timezone,job_id)
  VALUES(?,?,?,?,?::numeric,?::numeric,?::numeric,?::numeric,?::numeric,?,?,?,?,?,?,?,?)
  ON CONFLICT(station_id,metric_key,period,period_start) DO UPDATE SET raw_value=excluded.raw_value,corrected_value=excluded.corrected_value,daily_offset=excluded.daily_offset,total_offset=excluded.total_offset,calibrated_total=excluded.calibrated_total,complete_days=excluded.complete_days,expected_days=excluded.expected_days,status=excluded.status,missing_reason=excluded.missing_reason,source_version=excluded.source_version,resolved_point_id=excluded.resolved_point_id,calculation_timezone=excluded.calculation_timezone,job_id=excluded.job_id
  """,batch);}
 private Result aggregate(long station,Source source,String period,LocalDate start,String job,ZoneId zone,Map<OffsetKey,BigDecimal> offsets){
  String key=source.metricKey();long version=source.version();
  LocalDate end=period.equals("MONTH")?start.plusMonths(1):start.plusYears(1);int expected=(int)ChronoUnit.DAYS.between(start,end);
  String point=source.resolvedPointId();
  var row=s.one("SELECT count(*) FILTER(WHERE status='complete') AS complete,sum(raw_value) AS raw,sum(corrected_value) AS corrected FROM station_metric_result WHERE station_id=? AND metric_key=? AND period='DAY' AND period_start>=? AND period_start<? AND source_version=? AND resolved_point_id IS NOT DISTINCT FROM ?::bigint AND calculation_timezone=?",station,key,Date.valueOf(start),Date.valueOf(end),version,point,zone.getId());
  int count=((Number)row.get("complete")).intValue();BigDecimal total=offset(offsets,key,"TOTAL",LocalDate.of(1970,1,1));boolean complete=count==expected;BigDecimal raw=complete?(BigDecimal)row.get("raw"):null,corrected=complete?(BigDecimal)row.get("corrected"):null;
  BigDecimal daily=offsets.entrySet().stream().filter(e->e.getKey().metric().equals(key)&&e.getKey().kind().equals("DAILY")&&!e.getKey().date().isBefore(start)&&e.getKey().date().isBefore(end)).map(Map.Entry::getValue).reduce(BigDecimal.ZERO,BigDecimal::add);
  return new Result(key,period,start.toString(),text(raw),text(corrected),text(daily),text(total),text(complete?corrected.add(total):null),count,expected,complete?"complete":"missing",complete?null:"自然期间完整日不足（"+count+"/"+expected+"）",version,job);
 }
 private List<Job> jobs(long station){return s.db.query("SELECT * FROM station_metric_job WHERE station_id=? ORDER BY id DESC LIMIT 50",(rs,i)->new Job(rs.getString("id"),rs.getString("from_date"),rs.getString("to_date"),rs.getString("status"),rs.getTimestamp("created_at").toInstant().toString(),rs.getInt("missing_days")),station);}
 private List<Result> persisted(long station,String key,String point,LocalDate a,LocalDate b,ZoneId zone){return s.db.query("SELECT * FROM station_metric_result WHERE station_id=? AND metric_key=? AND resolved_point_id IS NOT DISTINCT FROM ?::bigint AND calculation_timezone=? AND period_start>=? AND period_start<=? ORDER BY period_start,metric_key",(rs,i)->new Result(rs.getString("metric_key"),rs.getString("period"),rs.getString("period_start"),rs.getString("raw_value"),rs.getString("corrected_value"),rs.getString("daily_offset"),rs.getString("total_offset"),rs.getString("calibrated_total"),rs.getInt("complete_days"),rs.getInt("expected_days"),rs.getString("status"),rs.getString("missing_reason"),rs.getLong("source_version"),rs.getString("job_id")),station,key,point,zone.getId(),Date.valueOf(a),Date.valueOf(b));}
 public Results results(long station,String from,String to){telemetryPermission(station);LocalDate[] range=range(station,from,to);return locked(station,()->{
  telemetryPermission(station);ZoneId zone=zone(station);var offsets=offsetSnapshot(station,range[0],range[1]);var days=new ArrayList<Result>();var months=new ArrayList<Result>();var years=new ArrayList<Result>();
  for(Definition d:DEFINITIONS){if(!d.energy())continue;Source source=readSource(station,d.key(),false);var all=persisted(station,d.key(),source.resolvedPointId(),range[0].withDayOfYear(1),range[1],zone);
   for(LocalDate day=range[0];!day.isAfter(range[1]);day=day.plusDays(1)){String target=day.toString();var found=all.stream().filter(v->v.metricKey().equals(d.key())&&v.period().equals("DAY")&&v.periodStart().equals(target)&&v.sourceVersion()==source.version()).findFirst();
    days.add(found.orElseGet(()->new Result(d.key(),"DAY",target,null,null,text(offset(offsets,d.key(),"DAILY",LocalDate.parse(target))),text(offset(offsets,d.key(),"TOTAL",LocalDate.of(1970,1,1))),null,0,1,"missing","尚未计算或配置已变化，请重算",source.version(),null)));
   }
   for(LocalDate month=range[0].withDayOfMonth(1);!month.isAfter(range[1]);month=month.plusMonths(1)){String target=month.toString();String job=all.stream().filter(v->v.metricKey().equals(d.key())&&v.period().equals("MONTH")&&v.periodStart().equals(target)).map(Result::jobId).findFirst().orElse(null);months.add(aggregate(station,source,"MONTH",month,job,zone,offsets));}
   for(int year=range[0].getYear();year<=range[1].getYear();year++){LocalDate start=LocalDate.of(year,1,1);String job=all.stream().filter(v->v.metricKey().equals(d.key())&&v.period().equals("YEAR")&&v.periodStart().equals(start.toString())).map(Result::jobId).findFirst().orElse(null);years.add(aggregate(station,source,"YEAR",start,job,zone,offsets));}
  }
  telemetryPermission(station);return new Results(days,months,years,jobs(station),"当前站点时区："+zone.getId()+"。"+POLICY);
 });}
}
