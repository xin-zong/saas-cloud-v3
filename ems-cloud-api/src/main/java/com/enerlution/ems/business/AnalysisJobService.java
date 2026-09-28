package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Bounded synchronous generation; durable requests survive the HTTP request and service restart. */
@Service
public class AnalysisJobService {
  private static final Set<String> KINDS=Set.of("operations","revenue","health","telemetry");
  private static final int MAX_ROWS=20000, MAX_FILE=16*1024*1024;
  private static final ZoneId BUSINESS_ZONE=ZoneId.of("Asia/Shanghai");
  private final DomainSupport s;
  private final ObjectMapper json;
  private final EmsTelemetryQueries telemetry;
  private final Semaphore slots=new Semaphore(3);
  public record JobRequest(String kind,String from,String to,
      @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StrictMinutes.class) Integer minutes,List<String> pointIds) {}
  public record Job(String id,String stationId,String kind,String from,String to,Integer minutes,String status,
      String createdAt,String completedAt,String error,List<String> pointIds) {}
  public record Summary(String label,String value,
      @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String unit) {}
  public record Column(String key,String label) {}
  public record Section(String title,List<Column> columns,List<Map<String,Object>> rows) {}
  public record Preview(Job job,List<Summary> summary,List<Section> sections) {}
  record Content(List<Summary> summary,List<Section> sections) {}
  record Window(String kind,OffsetDateTime from,OffsetDateTime to,Integer minutes,List<Long> points) {}
  public static final class StrictMinutes extends com.fasterxml.jackson.databind.deser.std.StdDeserializer<Integer> {
    public StrictMinutes() { super(Integer.class); }
    @Override public Integer deserialize(com.fasterxml.jackson.core.JsonParser parser,
        com.fasterxml.jackson.databind.DeserializationContext context) throws IOException {
      if(parser.currentToken()!=com.fasterxml.jackson.core.JsonToken.VALUE_NUMBER_INT)
        throw com.fasterxml.jackson.databind.JsonMappingException.from(parser,"minutes must be an integer");
      return parser.getIntValue();
    }
  }

  public AnalysisJobService(DomainSupport s,ObjectMapper json,EmsTelemetryQueries telemetry) {
    this.s=s; this.json=json; this.telemetry=telemetry;
  }
  @EventListener(ApplicationReadyEvent.class)
  public void recoverInterruptedJobs() {
    for(UUID id:s.db.queryForList("SELECT id FROM analysis_job WHERE status IN ('pending','running') ORDER BY created_at,id",UUID.class)) {
      try(var lock=new JobLock(id,false)) {
        if(lock.acquired) s.db.update("UPDATE analysis_job SET status='failed',completed_at=clock_timestamp(),error=? WHERE id=? AND status IN ('pending','running')",
            "服务重启中断任务，请重试",id);
      }
    }
  }
  /** A separate pooled session holds this lock across committed state transitions, without a long transaction. */
  private final class JobLock implements AutoCloseable {
    private final Connection connection;
    private final long key;
    private boolean acquired;
    JobLock(UUID id,boolean wait) {
      key=lockKey(id);
      Connection candidate=null;
      try {
        candidate=Objects.requireNonNull(s.db.getDataSource()).getConnection();
        if(!candidate.getAutoCommit()) candidate.setAutoCommit(true);
        try(var statement=candidate.prepareStatement(wait?"SELECT pg_advisory_lock(?)":"SELECT pg_try_advisory_lock(?)")) {
          statement.setLong(1,key);
          try(var result=statement.executeQuery()) { acquired=wait||(result.next()&&result.getBoolean(1)); }
        }
        connection=candidate;
      } catch(SQLException e) {
        discard(candidate);
        throw new BusinessException(503,"任务锁暂不可用");
      }
    }
    @Override public void close() {
      try {
        if(acquired) try(var statement=connection.prepareStatement("SELECT pg_advisory_unlock(?)")) {
          statement.setLong(1,key);
          try(var result=statement.executeQuery()) {
            if(!result.next()||!result.getBoolean(1)) throw new SQLException("job lock was not held");
          }
          acquired=false;
        }
        connection.close();
      } catch(SQLException e) {
        // Returning a still-locked physical session to the pool would strand future jobs.
        discard(connection);
        throw new BusinessException(503,"任务锁释放失败");
      }
    }
  }
  private static void discard(Connection connection) {
    if(connection==null) return;
    try { connection.abort(Runnable::run); } catch(SQLException ignored) {}
    try { connection.close(); } catch(SQLException ignored) {}
  }
  static long lockKey(UUID id) {
    try {
      byte[] key=MessageDigest.getInstance("SHA-256").digest(("ems-analysis-job/v1:"+id).getBytes(StandardCharsets.UTF_8));
      return ByteBuffer.wrap(key).getLong();
    } catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
  Window validate(JobRequest request) {
    if(request==null||!KINDS.contains(Objects.toString(request.kind(),""))) throw invalid("未知任务类型");
    OffsetDateTime from,to;
    try { from=OffsetDateTime.parse(request.from()); to=OffsetDateTime.parse(request.to()); }
    catch(Exception e) { throw invalid("时间必须为含时区偏移的 ISO 格式"); }
    int days=request.kind().equals("telemetry")?31:366;
    if(!to.toInstant().isAfter(from.toInstant())||Duration.between(from,to).compareTo(Duration.ofDays(days))>0)
      throw invalid("时间范围须为 "+days+" 天内的有效半开区间");
    Integer minutes=request.kind().equals("telemetry")?(request.minutes()==null?0:request.minutes()):null;
    if((minutes!=null&&!Set.of(0,1,5,15,30,60).contains(minutes))
        ||(!request.kind().equals("telemetry")&&request.minutes()!=null)) throw invalid("不支持的任务粒度");
    var points=new LinkedHashSet<Long>();
    if(request.pointIds()!=null) {
      if(request.pointIds().size()>200) throw invalid("最多选择 200 个测点");
      for(var point:request.pointIds()) {
        try {
          if(point==null||!point.matches("[1-9][0-9]{0,18}")) throw new NumberFormatException();
          points.add(Long.parseLong(point));
        } catch(NumberFormatException e) { throw invalid("测点 ID 无效"); }
      }
    }
    if(request.kind().equals("telemetry")&&points.isEmpty()) throw invalid("请至少选择一个测点");
    if(request.kind().equals("revenue")&&!points.isEmpty()) throw invalid("收益报告不接受测点选择");
    if(!points.isEmpty()&&Duration.between(from,to).compareTo(Duration.ofDays(31))>0)
      throw invalid("含选定测点的报告时间范围最多 31 天");
    return new Window(request.kind(),from,to,minutes,List.copyOf(points));
  }
  private static BusinessException invalid(String message) { return new BusinessException(400,message); }
  private void authorize(long station,String kind,boolean selectedPoints) {
    if(kind.equals("telemetry")) s.access.requireStationPermission(station,"telemetry.read");
    else {
      s.access.requireStationPermission(station,"report.export");
      s.access.requireStationPermission(station,switch(kind) {
        case "operations" -> "strategy.read"; case "revenue" -> "revenue.read"; default -> "asset.read";
      });
      if(kind.equals("operations")||kind.equals("health")||selectedPoints) s.access.requireStationPermission(station,"telemetry.read");
      if(kind.equals("health")) s.access.requireStationPermission(station,"alarm.read");
    }
  }
  private TransactionTemplate transaction() {
    return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource())));
  }
  public Job create(long station,JobRequest request) {
    Window window=validate(request); authorize(station,window.kind(),!window.points().isEmpty());
    for(long point:window.points()) pointMetadata(station,point,window);
    if(!slots.tryAcquire()) throw new BusinessException(429,"生成任务繁忙，请稍后重试");
    try {
      UUID id=UUID.randomUUID(); long actor=s.access.userId();
      try(var lock=new JobLock(id,true)) {
        transaction().executeWithoutResult(unused->{
          s.db.update("INSERT INTO analysis_job(id,station_id,created_by,kind,from_at,to_at,minutes) VALUES(?,?,?,?,?,?,?)",
              id,station,actor,window.kind(),window.from(),window.to(),window.minutes());
          int position=0;
          for(long point:window.points()) s.db.update("INSERT INTO analysis_job_point(job_id,point_id,position) VALUES(?,?,?)",id,point,position++);
        });
        return run(id,station,window);
      }
    } finally { slots.release(); }
  }
  public Job retry(UUID id) {
    var saved=stored(id); long station=s.number(saved,"station_id"); Window window=window(saved);
    authorize(station,window.kind(),!window.points().isEmpty());
    if(!"failed".equals(saved.get("status"))) throw new BusinessException(409,"只有失败任务可重试");
    for(long point:window.points()) pointMetadata(station,point,window);
    if(!slots.tryAcquire()) throw new BusinessException(429,"生成任务繁忙，请稍后重试");
    try(var lock=new JobLock(id,true)) {
      if(s.db.update("UPDATE analysis_job SET status='pending',completed_at=NULL,error=NULL WHERE id=? AND status='failed'",id)!=1)
        throw new BusinessException(409,"任务已在重试");
      return run(id,station,window);
    } finally { slots.release(); }
  }
  private Job run(UUID id,long station,Window window) {
    try {
      if(s.db.update("UPDATE analysis_job SET status='running' WHERE id=? AND status='pending'",id)!=1)
        throw new BusinessException(409,"任务状态已改变");
      authorize(station,window.kind(),!window.points().isEmpty());
      Content content=generate(station,window);
      if(content.sections().stream().mapToLong(section->section.rows().size()).sum()>MAX_ROWS)
        throw new BusinessException(413,"导出最多 20000 行，请缩小范围");
      authorize(station,window.kind(),!window.points().isEmpty());
      byte[] body=boundedJson(content), csv=csv(content.sections());
      if(body.length>MAX_FILE||csv.length>MAX_FILE) throw new BusinessException(413,"导出结果过大，请缩小范围");
      authorize(station,window.kind(),!window.points().isEmpty());
      UUID artifactId=UUID.randomUUID();
      transaction().executeWithoutResult(unused->{
        s.db.update("INSERT INTO analysis_job_artifact(id,job_id,json_sha256,csv_sha256,json_bytes,csv_bytes,json_content,csv_content) VALUES(?,?,?,?,?,?,?,?)",
            artifactId,id,hash(body),hash(csv),body.length,csv.length,body,csv);
        if(s.db.update("UPDATE analysis_job SET status='completed',completed_at=clock_timestamp(),artifact_id=? WHERE id=? AND status='running'",artifactId,id)!=1)
          throw new BusinessException(409,"任务状态已改变");
        s.audit("analysis.generate",Map.of("job",id.toString(),"station",station,"kind",window.kind()));
      });
    } catch(Exception e) {
      String error=e instanceof BusinessException b&&Set.of(400,413,503).contains(b.status())?b.getMessage():
          e instanceof BusinessException b&&Set.of(401,403).contains(b.status())?"授权或会话已失效，请重新验证权限":"任务生成失败，请重试或联系管理员";
      s.db.update("UPDATE analysis_job SET status='failed',completed_at=clock_timestamp(),error=?,artifact_id=NULL WHERE id=? AND status IN ('pending','running')",error,id);
      if(e instanceof BusinessException b&&Set.of(401,403).contains(b.status())) throw b;
    }
    var row=stored(id); authorize(station,window.kind(),!window.points().isEmpty()); return dto(row);
  }
  public List<Job> list(long station,String kind,int limit,int offset) {
    if(kind!=null&&!KINDS.contains(kind)) throw invalid("未知任务类型");
    long user=s.access.userId(); s.limit(limit); s.offset(offset);
    // Filter in SQL before pagination, so inaccessible report kinds cannot displace visible jobs.
    String allowed="""
      SELECT j.* FROM analysis_job j WHERE j.station_id=? AND EXISTS(
        SELECT 1 FROM effective_station_permission p WHERE p.user_id=? AND p.station_id=j.station_id
        AND p.permission_code=CASE j.kind WHEN 'telemetry' THEN 'telemetry.read' ELSE 'report.export' END)
      AND EXISTS(SELECT 1 FROM effective_station_permission p WHERE p.user_id=? AND p.station_id=j.station_id
        AND p.permission_code=CASE j.kind WHEN 'operations' THEN 'strategy.read' WHEN 'revenue' THEN 'revenue.read'
        WHEN 'health' THEN 'asset.read' ELSE 'telemetry.read' END)
      AND (j.kind NOT IN ('operations','health') OR EXISTS(SELECT 1 FROM effective_station_permission p
        WHERE p.user_id=? AND p.station_id=j.station_id AND p.permission_code=CASE j.kind WHEN 'health' THEN 'alarm.read' ELSE 'telemetry.read' END))
      AND ((j.kind NOT IN ('operations','health') AND NOT EXISTS(SELECT 1 FROM analysis_job_point jp WHERE jp.job_id=j.id)) OR EXISTS(
        SELECT 1 FROM effective_station_permission p WHERE p.user_id=? AND p.station_id=j.station_id AND p.permission_code='telemetry.read'))
      """;
    if(kind!=null) authorize(station,kind,false);
    else if(!s.access.hasStationPermission(user,station,"telemetry.read")&&!s.access.hasStationPermission(user,station,"report.export"))
      throw new BusinessException(403,"Station permission denied");
    var args=new ArrayList<Object>(List.of(station,user,user,user,user));
    if(kind!=null) { allowed+=" AND j.kind=?"; args.add(kind); }
    args.add(limit); args.add(offset);
    var rows=s.db.queryForList(allowed+" ORDER BY j.created_at DESC,j.id LIMIT ? OFFSET ?",args.toArray());
    var result=new ArrayList<Job>();
    for(var row:rows) { var job=dto(row); authorize(station,job.kind(),!job.pointIds().isEmpty()); result.add(job); }
    return result;
  }
  public Preview preview(UUID id) {
    var row=stored(id); var job=dto(row); authorize(Long.parseLong(job.stationId()),job.kind(),!job.pointIds().isEmpty());
    if(!job.status().equals("completed")) return new Preview(job,List.of(),List.of());
    byte[] bytes=readArtifact(row,"json");
    try {
      Content content=json.readValue(bytes,Content.class);
      authorize(Long.parseLong(job.stationId()),job.kind(),!job.pointIds().isEmpty());
      return new Preview(job,content.summary(),content.sections());
    } catch(IOException e) { throw new BusinessException(503,"报告文件暂不可用"); }
  }
  public byte[] download(UUID id) {
    var row=stored(id); var job=dto(row); long station=Long.parseLong(job.stationId());
    authorize(station,job.kind(),!job.pointIds().isEmpty());
    if(!job.status().equals("completed")) throw new BusinessException(409,"任务尚未完成");
    byte[] bytes=readArtifact(row,"csv"); authorize(station,job.kind(),!job.pointIds().isEmpty());
    s.audit("analysis.download",Map.of("job",id.toString(),"station",station)); return bytes;
  }
  private Map<String,Object> stored(UUID id) { return s.one("SELECT * FROM analysis_job WHERE id=?",id); }
  private List<Long> points(UUID id) { return s.db.queryForList("SELECT point_id FROM analysis_job_point WHERE job_id=? ORDER BY position",Long.class,id); }
  private Window window(Map<String,Object> row) { return new Window(row.get("kind").toString(),
      instant(row.get("from_at")).atOffset(ZoneOffset.UTC),instant(row.get("to_at")).atOffset(ZoneOffset.UTC),
      (Integer)row.get("minutes"),points((UUID)row.get("id"))); }
  private Job dto(Map<String,Object> row) { return new Job(row.get("id").toString(),row.get("station_id").toString(),row.get("kind").toString(),
      iso(row.get("from_at")),iso(row.get("to_at")),(Integer)row.get("minutes"),row.get("status").toString(),iso(row.get("created_at")),
      iso(row.get("completed_at")),(String)row.get("error"),points((UUID)row.get("id")).stream().map(Object::toString).toList()); }
  private static Instant instant(Object value) {
    if(value instanceof Timestamp t) return t.toInstant();
    if(value instanceof OffsetDateTime t) return t.toInstant();
    return Instant.parse(value.toString());
  }
  private static String iso(Object value) { return value==null?null:instant(value).toString(); }
  private byte[] readArtifact(Map<String,Object> job,String format) {
    if(!Set.of("json","csv").contains(format)) throw new IllegalArgumentException("unknown artifact format");
    var artifact=s.one("SELECT "+format+"_content AS content,"+format+"_bytes AS bytes,"+format+
        "_sha256 AS sha256 FROM analysis_job_artifact WHERE id=? AND job_id=?",job.get("artifact_id"),job.get("id"));
    byte[] bytes=(byte[])artifact.get("content");
    if(bytes==null||bytes.length<1||bytes.length>MAX_FILE||bytes.length!=((Number)artifact.get("bytes")).intValue()
        ||!hash(bytes).equals(artifact.get("sha256").toString())) throw new BusinessException(503,"报告文件暂不可用");
    return bytes;
  }
  private static String hash(byte[] bytes) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
  byte[] csv(List<Section> sections) {
    var bytes=new ByteArrayOutputStream(); var out=new SizeLimitedOutput(bytes,MAX_FILE);
    try {
      out.write("\ufeff".getBytes(StandardCharsets.UTF_8));
      for(var section:sections) {
        out.write((cell(section.title())+"\r\n").getBytes(StandardCharsets.UTF_8));
        out.write((String.join(",",section.columns().stream().map(c->cell(c.label())).toList())+"\r\n").getBytes(StandardCharsets.UTF_8));
        for(var row:section.rows()) out.write((String.join(",",section.columns().stream().map(c->cell(row.get(c.key()))).toList())+"\r\n").getBytes(StandardCharsets.UTF_8));
      }
      return bytes.toByteArray();
    } catch(IOException e) { throw new BusinessException(413,"导出结果过大，请缩小范围"); }
  }
  /** Counts UTF-8 output before retaining it; target null is a zero-allocation counting sink. */
  private static final class SizeLimitedOutput extends OutputStream {
    private final OutputStream target;
    private final long limit;
    private long count;
    SizeLimitedOutput(OutputStream target,long limit) { this.target=target; this.limit=limit; }
    private void reserve(int bytes) throws IOException {
      if(bytes>limit-count) throw new IOException("artifact size limit exceeded"); count+=bytes;
    }
    @Override public void write(int value) throws IOException { reserve(1); if(target!=null) target.write(value); }
    @Override public void write(byte[] bytes,int offset,int length) throws IOException {
      reserve(length); if(target!=null) target.write(bytes,offset,length);
    }
  }
  private byte[] boundedJson(Object value) {
    var bytes=new ByteArrayOutputStream();
    try { json.writeValue(new SizeLimitedOutput(bytes,MAX_FILE),value); return bytes.toByteArray(); }
    catch(IOException e) { throw new BusinessException(413,"导出结果过大，请缩小范围"); }
  }
  private final class EvidenceBudget {
    // Leave room for the enclosing columns/summary/section metadata.
    private long remaining=MAX_FILE-65536L;
    void retain(Map<String,Object> row) {
      var out=new SizeLimitedOutput(null,remaining);
      try { json.writeValue(out,row); remaining-=out.count+1; }
      catch(IOException e) { throw new BusinessException(413,"导出结果过大，请缩小范围或减少测点"); }
    }
  }
  private String cell(Object value) {
    String text;
    try { text=value==null?"":value instanceof Map<?,?>||value instanceof Collection<?>?json.writeValueAsString(value):value.toString(); }
    catch(IOException e) { throw new IllegalStateException(e); }
    String leading=text.stripLeading(); int at=0;
    while(at<leading.length()&&(Character.isWhitespace(leading.charAt(at))||Character.isSpaceChar(leading.charAt(at))
        ||Character.isISOControl(leading.charAt(at))||Character.getType(leading.charAt(at))==Character.FORMAT)) at++;
    if(at<leading.length()&&"=+@-".indexOf(leading.charAt(at))>=0
        && !(value instanceof Number || text.matches("-?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?"))) text="'"+text;
    return "\""+text.replace("\"","\"\"")+"\"";
  }
  private Map<String,Object> pointMetadata(long station,long point,Window window) {
    var rows=s.db.queryForList("""
      SELECT p.id,p.code,d.name AS device_name,k.name AS point_name,k.unit,d.station_id
      FROM measurement_point p JOIN device d ON d.id=p.device_id JOIN measurement_kind k ON k.code=p.kind_code
      WHERE p.id=? AND (d.station_id=? OR EXISTS(SELECT 1 FROM point_binding pb
        JOIN device_binding b ON b.id=pb.device_binding_id JOIN ems_binding_period bp ON bp.id=b.binding_period_id
        WHERE pb.measurement_point_id=p.id AND bp.station_id=? AND pb.valid_from<? AND (pb.valid_to IS NULL OR pb.valid_to>?)
          AND b.valid_from<? AND (b.valid_to IS NULL OR b.valid_to>?) AND bp.valid_from<? AND (bp.valid_to IS NULL OR bp.valid_to>?)))
      """,point,station,station,window.to(),window.from(),window.to(),window.from(),window.to(),window.from());
    if(rows.isEmpty()) throw invalid("所选测点不属于任务站点的授权时间范围");
    return rows.getFirst();
  }
  private List<Long> periods(long station,long point,Window window) {
    return s.db.queryForList("""
      SELECT DISTINCT bp.id FROM point_binding pb JOIN device_binding b ON b.id=pb.device_binding_id
      JOIN ems_binding_period bp ON bp.id=b.binding_period_id
      JOIN effective_station_permission a ON a.station_id=bp.station_id AND a.user_id=? AND a.permission_code='telemetry.read'
      WHERE pb.measurement_point_id=? AND bp.station_id=? AND pb.valid_from<? AND (pb.valid_to IS NULL OR pb.valid_to>?)
        AND b.valid_from<? AND (b.valid_to IS NULL OR b.valid_to>?) AND bp.valid_from<? AND (bp.valid_to IS NULL OR bp.valid_to>?)
      ORDER BY bp.id
      """,Long.class,s.access.userId(),point,station,window.to(),window.from(),window.to(),window.from(),window.to(),window.from());
  }
  private Content generate(long station,Window window) {
    return switch(window.kind()) {
      case "telemetry" -> telemetryReport(station,window);
      case "operations" -> operationsReport(station,window);
      case "revenue" -> revenueReport(station,window);
      default -> healthReport(station,window);
    };
  }
  private Content telemetryReport(long station,Window window) {
    var rows=new ArrayList<Map<String,Object>>(); long until=Math.min(window.to().toInstant().toEpochMilli(),Instant.now().toEpochMilli());
    var budget=new EvidenceBudget();
    long start=window.from().toInstant().toEpochMilli(); long deadline=System.nanoTime()+Duration.ofSeconds(45).toNanos();
    for(long point:window.points()) {
      authorize(station,window.kind(),true);
      if(System.nanoTime()>deadline) throw new BusinessException(413,"导出耗时超限，请缩小范围或减少测点");
      var metadata=pointMetadata(station,point,window); var periods=periods(station,point,window);
      var samples=new ArrayList<Map<String,Object>>();
      if(until>start&&!periods.isEmpty()) {
        var raw=telemetry.history(point,periods,start,until);
        if(window.minutes()==0) raw.forEach(r->samples.add(EmsTelemetryQueries.observation(r)));
        else {
          var aggregated=EmsTelemetryQueries.aggregate(raw,"last",window.minutes());
          for(var item:aggregated) {
            var dto=new LinkedHashMap<>(item); dto.put("pointId",Long.toString(point));
            var evidence=(List<?>)dto.get("evidence");
            if(evidence!=null&&!evidence.isEmpty()) {
              Map<?,?> last=(Map<?,?>)evidence.getLast();
              for(var e:evidence) { var sample=(Map<?,?>)e;
                if(Objects.equals(sample.get("sourceTime"),dto.get("sourceTime"))
                    &&Objects.equals(sample.get("receivedAt"),dto.get("receivedAt"))
                    &&Objects.equals(sample.get("sourceTimeKind"),dto.get("selectedSourceTimeKind"))) last=sample;
              }
              dto.put("valueType",last.get("valueType"));
              dto.put("source",last.get("source")); dto.put("sourceTimeKind",dto.get("selectedSourceTimeKind"));
            }
            samples.add(dto);
          }
        }
      }
      // Legacy observations have no immutable station origin; never export them under current ownership.
      if(rows.size()+samples.size()>MAX_ROWS) throw new BusinessException(413,"导出最多 20000 行，请缩小范围");
      for(var item:samples) {
        item.put("deviceName",metadata.get("device_name")); item.put("pointName",metadata.get("point_name"));
        item.put("unit",metadata.get("unit")); budget.retain(item); rows.add(item);
      }
    }
    var columns=columns("pointId","测点ID","deviceName","设备","pointName","测点","unit","单位","timestamp","聚合时间毫秒",
        "value","精确值","valueType","值类型","quality","质量","sourceTime","源时间毫秒","receivedAt","接收时间毫秒",
        "sourceTimeKind","时间来源","source","数据来源","bindingPeriodId","原始绑定","aggregation","聚合方式","conflict","冲突","evidence","原始证据");
    return new Content(List.of(new Summary("选中测点",Integer.toString(window.points().size()),null),new Summary("导出记录",Integer.toString(rows.size()),null)),
        List.of(new Section("EMS 遥测数据（无原始站点依据的旧数据不纳入导出）",columns,rows)));
  }
  private Content operationsReport(long station,Window window) {
    var plans=query("""
      SELECT p.service_date,p.version,p.status,t.start_minute,t.end_minute,t.mode,t.power_kw::text AS power_kw
      FROM operating_plan p JOIN plan_period t ON t.plan_id=p.id WHERE p.station_id=?
      AND (p.service_date::timestamp AT TIME ZONE 'Asia/Shanghai')>=?
      AND (p.service_date::timestamp AT TIME ZONE 'Asia/Shanghai')<? ORDER BY p.service_date,p.version,t.start_minute LIMIT 20001
      """,station,window.from(),window.to());
    var diagnostics=query("""
      SELECT e.reason,count(*)::text AS retained_samples,max(e.received_at) AS last_received_at
      FROM telemetry_diagnostic_evidence e JOIN ems_binding_period p ON p.id=e.binding_period_id
      WHERE p.station_id=? AND e.received_at>=? AND e.received_at<? GROUP BY e.reason ORDER BY e.reason LIMIT 20001
      """,station,window.from(),window.to());
    var sections=new ArrayList<Section>();
    sections.add(new Section("运营计划（按上海业务日期）",columns("service_date","日期","version","版本","status","状态","start_minute","开始分钟","end_minute","结束分钟","mode","模式","power_kw","功率kW"),plans));
    sections.add(new Section("接入诊断统计（按接收时间）",columns("reason","原因","retained_samples","留存样本数","last_received_at","最后接收时间"),diagnostics));
    sections.add(receivedStatistics(station,window));
    if(!window.points().isEmpty()) sections.addAll(telemetryReport(station,new Window("telemetry",window.from(),window.to(),15,window.points())).sections());
    return new Content(List.of(new Summary("运营计划时段",Integer.toString(plans.size()),null),new Summary("日电量",null,"kWh")),sections);
  }
  private Content revenueReport(long station,Window window) {
    var records=query("""
      SELECT r.id::text AS record_id,r.reference,r.recognition_date,c.currency,r.status,
      r.statement_amount::text AS statement_amount,r.estimated_amount::text AS estimated_amount,r.meter_complete,r.calculation_complete
      FROM settlement_record r JOIN contract c ON c.id=r.contract_id WHERE r.station_id=?
      AND (r.recognition_date::timestamp AT TIME ZONE 'Asia/Shanghai')>=?
      AND (r.recognition_date::timestamp AT TIME ZONE 'Asia/Shanghai')<? AND r.recognition_date<=?
      ORDER BY r.recognition_date,r.id LIMIT 20001
      """,station,window.from(),window.to(),LocalDate.now(BUSINESS_ZONE));
    var lines=query("""
      SELECT r.id::text AS record_id,r.reference,c.currency,r.status,l.category,l.amount::text AS amount
      FROM settlement_record r JOIN contract c ON c.id=r.contract_id JOIN settlement_line l ON l.record_id=r.id
      WHERE r.station_id=? AND (r.recognition_date::timestamp AT TIME ZONE 'Asia/Shanghai')>=?
      AND (r.recognition_date::timestamp AT TIME ZONE 'Asia/Shanghai')<? AND r.recognition_date<=?
      ORDER BY r.id,l.category LIMIT 20001
      """,station,window.from(),window.to(),LocalDate.now(BUSINESS_ZONE));
    var totals=new TreeMap<String,BigDecimal>();
    for(var record:records) if("settled".equals(record.get("status"))&&record.get("statement_amount")!=null)
      totals.merge(record.get("currency").toString(),new BigDecimal(record.get("statement_amount").toString()),BigDecimal::add);
    var summary=new ArrayList<Summary>();
    if(totals.isEmpty()) summary.add(new Summary("已确认结算金额",null,null));
    else totals.forEach((currency,amount)->summary.add(new Summary("已确认结算金额",amount.toPlainString(),currency)));
    summary.add(new Summary("结算记录",Integer.toString(records.size()),null));
    return new Content(summary,List.of(new Section("结算记录（仅 settled 计入确认金额）",
        columns("record_id","记录ID","reference","编号","recognition_date","确认日期","currency","币种","status","状态","statement_amount","账单金额","estimated_amount","估算金额","meter_complete","计量完整","calculation_complete","计算完整"),records),
        new Section("结算项目",columns("record_id","记录ID","reference","编号","currency","币种","status","状态","category","项目","amount","金额"),lines)));
  }
  private Content healthReport(long station,Window window) {
    var devices=query("""
      SELECT d.id::text AS device_id,d.code,d.name,
      (SELECT count(*)::text FROM measurement_point m WHERE m.device_id=d.id) AS catalog_points
      FROM device d
      WHERE d.station_id=? ORDER BY d.id LIMIT 20001
      """,station);
    var communication=query("""
      SELECT p.ems_uuid::text AS ems_id,p.id::text AS binding_period_id,c.last_fresh_heartbeat,
      CASE WHEN c.last_fresh_heartbeat>=? AND c.last_fresh_heartbeat<? THEN c.reachable ELSE NULL END AS reachable
      FROM ems_binding_period p LEFT JOIN ems_connection_read c ON c.ems_uuid=p.ems_uuid AND p.valid_to IS NULL
      WHERE p.station_id=? AND p.valid_from<? AND (p.valid_to IS NULL OR p.valid_to>?) ORDER BY p.id LIMIT 20001
      """,window.from(),window.to(),station,window.to(),window.from());
    var alarms=query("""
      SELECT a.id::text AS alarm_id,a.code,a.title,a.severity,a.occurred_at,a.recovered_at
      FROM alarm a JOIN ems_alarm_business_origin o ON o.alarm_id=a.id
      WHERE o.station_id=? AND a.occurred_at>=? AND a.occurred_at<? AND a.occurred_at<=clock_timestamp()
      ORDER BY a.occurred_at,a.id LIMIT 20001
      """,station,window.from(),window.to());
    var sections=new ArrayList<Section>();
    sections.add(new Section("当前设备测点目录（旧观测缺少原始站点依据，不纳入历史报告）",columns("device_id","设备ID","code","编号","name","设备","catalog_points","目录测点数"),devices));
    sections.add(new Section("EMS 最新通信证据（不代表历史可用率）",columns("ems_id","EMS","binding_period_id","绑定ID","last_fresh_heartbeat","最后心跳","reachable","生成时可达"),communication));
    sections.add(new Section("具有原始站点依据的 EMS 告警",columns("alarm_id","告警ID","code","编码","title","告警","severity","级别","occurred_at","发生时间","recovered_at","恢复时间"),alarms));
    sections.add(receivedStatistics(station,window));
    if(!window.points().isEmpty()) sections.addAll(telemetryReport(station,new Window("telemetry",window.from(),window.to(),15,window.points())).sections());
    return new Content(List.of(new Summary("健康评分",null,null),new Summary("可用率",null,"%"),new Summary("区间告警",Integer.toString(alarms.size()),null)),sections);
  }
  private List<Map<String,Object>> query(String sql,Object... args) {
    var rows=s.db.queryForList(sql,args); if(rows.size()>MAX_ROWS) throw new BusinessException(413,"报告记录过多，请缩小范围");
    for(var row:rows) row.replaceAll((key,value)->value instanceof java.sql.Date d?d.toLocalDate().toString():
        value instanceof Timestamp||value instanceof OffsetDateTime?iso(value):value);
    return rows;
  }
  private Section receivedStatistics(long station,Window window) {
    s.access.requireStationPermission(station,"telemetry.read");
    var periods=s.db.queryForList("""
      SELECT p.id FROM ems_binding_period p JOIN effective_station_permission a ON a.station_id=p.station_id
      AND a.user_id=? AND a.permission_code='telemetry.read'
      WHERE p.station_id=? AND p.valid_from<? AND (p.valid_to IS NULL OR p.valid_to>?) ORDER BY p.id
      """,Long.class,s.access.userId(),station,window.to(),window.from());
    var rows=new ArrayList<Map<String,Object>>();
    long start=window.from().toInstant().toEpochMilli(), until=Math.min(window.to().toInstant().toEpochMilli(),Instant.now().toEpochMilli());
    if(!periods.isEmpty()&&until>start) {
      var data=telemetry.query("SELECT source_type AS source,quality,toString(count()) AS records,toString(uniqExact(point_id)) AS points FROM "+
          telemetry.database+"."+telemetry.observationTable+" WHERE binding_period_id IN ("+EmsTelemetryQueries.ids(periods)+")"+
          " AND source_at_ms>="+start+" AND source_at_ms<"+until+" GROUP BY source_type,quality ORDER BY source_type,quality LIMIT 20001");
      for(var row:data) rows.add(json.convertValue(row,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>() {}));
    }
    return new Section("已接收遥测事实与测点覆盖（按源时间，各组测点数不相加）",
        columns("source","来源","quality","质量","records","事实记录数","points","有记录测点数"),rows);
  }
  private static List<Column> columns(String... pairs) {
    var result=new ArrayList<Column>(); for(int i=0;i<pairs.length;i+=2) result.add(new Column(pairs[i],pairs[i+1])); return result;
  }
}
