package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import java.math.*;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Exact raw decimals; derived averages use 34 significant digits, HALF_EVEN. */
@Component
public class EmsTelemetryQueries {
  static final int MAX_ROWS=20000, MAX_BYTES=4*1024*1024;
  static final Set<String> OPERATIONS=Set.of("avg","min","max","last","delta");
  final String database="ems_cloud_v2_proto_telemetry", observationTable, cellTable;
  private final URI endpoint;
  private final String credentials;
  private final ObjectMapper json;
  private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
      .followRedirects(HttpClient.Redirect.NEVER).build();

  @Autowired
  public EmsTelemetryQueries(ObjectMapper json,@Value("${ems.clickhouse.url}") String url,
      @Value("${ems.clickhouse.username}") String user,@Value("${ems.clickhouse.password}") String password) {
    this(json,url,user,password,false);
  }
  // Dedicated test targets cannot be selected through production settings or requests.
  EmsTelemetryQueries(ObjectMapper json,String url,String user,String password,boolean isolatedTest) {
    this.json=json;endpoint=URI.create(url);
    if(!Set.of("http","https").contains(endpoint.getScheme()) || endpoint.getHost()==null
        || endpoint.getUserInfo()!=null || endpoint.getFragment()!=null || endpoint.getQuery()!=null)
      throw new IllegalArgumentException("Invalid telemetry endpoint");
    credentials=Base64.getEncoder().encodeToString((user+":"+password).getBytes(StandardCharsets.UTF_8));
    observationTable=isolatedTest?"task8_observation_final":"ems_observation_final";
    cellTable=isolatedTest?"task8_cell_final":"ems_cell_final";
  }
  JsonNode query(String sql) {
    CompletableFuture<HttpResponse<byte[]>> pending=null;
    try {
      var request=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10))
          .header("Authorization","Basic "+credentials).header("Content-Type","text/plain; charset=utf-8")
          .POST(HttpRequest.BodyPublishers.ofString(sql+" SETTINGS max_execution_time=8,max_result_rows="+(MAX_ROWS+1)
              +",max_result_bytes="+MAX_BYTES+",result_overflow_mode='throw',output_format_json_quote_64bit_integers=0 FORMAT JSON")).build();
      pending=client.sendAsync(request,info->new BoundedBody());
      var response=pending.get(10,TimeUnit.SECONDS);
      {
        if(response.statusCode()!=200)throw new BusinessException(503,"遥测服务暂不可用");
        byte[] bytes=response.body();
        if(bytes.length>MAX_BYTES)throw new BusinessException(413,"遥测结果过大，请缩小查询范围");
        var data=json.readTree(bytes).path("data");
        if(!data.isArray() || data.size()>MAX_ROWS)throw new BusinessException(413,"遥测结果过大，请缩小查询范围");
        return data;
      }
    } catch(InterruptedException e){Thread.currentThread().interrupt();throw new BusinessException(503,"遥测查询已中断");}
    catch(BusinessException e){throw e;}catch(ExecutionException e){if(e.getCause() instanceof BusinessException b)throw b;throw new BusinessException(503,"遥测服务暂不可用");}
    catch(Exception e){throw new BusinessException(503,"遥测服务暂不可用");}
    finally {if(pending!=null&&!pending.isDone())pending.cancel(true);}
  }
  private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
    private final CompletableFuture<byte[]> result=new CompletableFuture<>();
    private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    private Flow.Subscription subscription;
    public CompletionStage<byte[]> getBody(){return result;}
    public void onSubscribe(Flow.Subscription s){subscription=s;s.request(1);}
    public void onNext(List<ByteBuffer> buffers) {
      for(var b:buffers) {
        if((long)bytes.size()+b.remaining()>MAX_BYTES){subscription.cancel();result.completeExceptionally(new BusinessException(413,"遥测结果过大，请缩小查询范围"));return;}
        var chunk=new byte[b.remaining()];b.get(chunk);bytes.writeBytes(chunk);
      }
      subscription.request(1);
    }
    public void onError(Throwable error){result.completeExceptionally(error);}
    public void onComplete(){result.complete(bytes.toByteArray());}
  }
  static String ids(Collection<Long> ids) {
    if(ids.isEmpty())return "0";
    if(ids.size()>2000 || ids.stream().anyMatch(i->i==null||i<=0))throw new BusinessException(413,"授权范围过大");
    return String.join(",",ids.stream().map(Object::toString).toList());
  }
  List<Map<String,Object>> latest(List<Long> periods,List<Long> points) {
    if(periods.isEmpty()||points.isEmpty())return List.of();
    // Keep one complete row per point, rather than sorting the entire telemetry history.
    // A tuple preserves null fields in the newest row; independent argMax calls would skip them.
    var rows=query("SELECT point_id,latest.1 AS binding_period_id,latest.2 AS source_type,"
        +"latest.3 AS source_time_kind,latest.4 AS source_at_ms,latest.5 AS received_at_ms,"
        +"latest.6 AS quality,latest.7 AS value_kind,latest.8 AS number_exact,"
        +"latest.9 AS text_value,latest.10 AS u16_words FROM (SELECT point_id,"
        +"argMax(tuple(binding_period_id,source_type,source_time_kind,source_at_ms,received_at_ms,"
        +"quality,value_kind,number_exact,text_value,u16_words),tuple(received_at_ms,fact_id)) AS latest"
        +" FROM "+database+"."+observationTable+" WHERE binding_period_id IN ("+ids(periods)
        +") AND point_id IN ("+ids(points)+") AND source_type IN ('ems','cabinet_30s','cabinet_60s')"
        +" GROUP BY point_id) LIMIT "+(MAX_ROWS+1));
    var result=new ArrayList<Map<String,Object>>();rows.forEach(r->result.add(observation(r)));
    result.sort(Comparator.comparing(r->new BigInteger(r.get("pointId").toString())));return result;
  }
  JsonNode history(long point,List<Long> periods,long from,long to) {
    if(periods.isEmpty())return json.createArrayNode();
    return query("SELECT * FROM "+database+"."+observationTable+" WHERE point_id="+point
        +" AND binding_period_id IN ("+ids(periods)+") AND source_at_ms>="+from+" AND source_at_ms<"+to
        +" ORDER BY source_at_ms,received_at_ms,fact_id LIMIT "+(MAX_ROWS+1));
  }
  List<Map<String,Object>> cells(List<Long> periods,int cabinet,long revision,UUID connection) {
    if(periods.isEmpty())return List.of();
    var rows=query("SELECT * FROM "+database+"."+cellTable+" WHERE binding_period_id IN ("+ids(periods)
        +") AND cabinet_no="+cabinet+" AND structure_revision_id="+revision+" AND connection_id=toUUID('"+Objects.requireNonNull(connection)+"')"
        +" ORDER BY received_at_ms DESC,fact_id DESC LIMIT 1 BY cell_kind LIMIT 3");
    var result=new ArrayList<Map<String,Object>>();
    for(var r:rows) {
      var dto=observation(r);dto.put("kind",r.path("cell_kind").asText());
      dto.put("valueType","cell_array");
      dto.put("structureRevisionId",r.path("structure_revision_id").asText());
      dto.put("value",r.path("values_present").asInt()==0?null:json.convertValue(r.path("cell_values"),Object.class));
      result.add(dto);
    }
    return result;
  }
  static Map<String,Object> observation(JsonNode r) {
    var out=new LinkedHashMap<String,Object>();
    out.put("pointId",r.has("point_id")?r.path("point_id").asText():null);
    out.put("bindingPeriodId",r.has("binding_period_id")?r.path("binding_period_id").asText():null);
    out.put("value",value(r));out.put("valueType",r.path("value_kind").asText());
    out.put("quality",r.path("quality").asText());out.put("sourceTime",r.path("source_at_ms").isNumber()?r.path("source_at_ms").longValue():null);
    out.put("receivedAt",r.path("received_at_ms").longValue());out.put("sourceTimeKind",r.path("source_time_kind").asText("unknown"));
    out.put("source",r.path("source_type").asText("ems_cell"));
    long receipt=r.path("received_at_ms").asLong();
    out.put("staleReason",r.path("quality").asText().equals("stale")?"source_marked_stale":
        receipt<Instant.now().minusSeconds(90).toEpochMilli()?"receipt_older_than_90_seconds":null);
    return out;
  }
  static Object value(JsonNode r) {
    return switch(r.path("value_kind").asText()) {
      case "number" -> r.path("number_exact").asText();
      case "text" -> r.path("text_value").asText();
      case "u16_words" -> {var words=new ArrayList<Integer>();r.path("u16_words").forEach(v->words.add(v.intValue()));yield words;}
      default -> null;
    };
  }
  private record SampleIdentity(String point,String period,String timeKind,String sourceTime) {}
  private record SampleValue(SampleIdentity identity,String canonical) {}
  static List<Map<String,Object>> aggregate(JsonNode rows,String op,int minutes) {
    if(!OPERATIONS.contains(op)||!Set.of(1,5,15,30,60).contains(minutes))throw new BusinessException(400,"不支持的聚合方式或粒度");
    if(rows.size()>MAX_ROWS)throw new BusinessException(413,"遥测结果过大");
    long interval=minutes*60000L;
    var buckets=new TreeMap<Long,List<JsonNode>>();
    for(var row:rows)if(row.path("source_at_ms").isNumber())
      buckets.computeIfAbsent(Math.floorDiv(row.path("source_at_ms").longValue(),interval)*interval,x->new ArrayList<>()).add(row);
    var result=new ArrayList<Map<String,Object>>();
    for(var entry:buckets.entrySet()) {
      var unique=new LinkedHashMap<SampleValue,JsonNode>();var sourceValues=new HashMap<SampleIdentity,Set<String>>();
      for(var row:entry.getValue()) {
        var identity=new SampleIdentity(row.path("point_id").asText(),row.path("binding_period_id").asText(),
            row.path("source_time_kind").asText("unknown"),row.path("source_at_ms").asText());
        String canonical=row.path("value_kind").asText()+":"+Objects.toString(value(row));
        sourceValues.computeIfAbsent(identity,x->new HashSet<>()).add(canonical);
        // Collapse only identical known-source samples; conflicts remain evidence.
        unique.put(new SampleValue(identity,canonical),row);
      }
      // Source quality is chosen for the whole bucket, before filtering invalid/null samples.
      // An archive value cannot stand in for an unavailable source observation.
      String selectedKind=unique.values().stream().anyMatch(r->r.path("source_time_kind").asText().equals("source"))?"source":
          unique.values().stream().anyMatch(r->r.path("source_time_kind").asText().equals("archive"))?"archive":"unknown";
      var selected=unique.values().stream().filter(r->r.path("source_time_kind").asText("unknown").equals(selectedKind)).toList();
      boolean evidenceConflict=sourceValues.values().stream().anyMatch(values->values.size()>1);
      boolean conflict=sourceValues.entrySet().stream().anyMatch(e->e.getKey().timeKind().equals(selectedKind)&&e.getValue().size()>1);
      var ordered=selected.stream().sorted(Comparator.comparingLong((JsonNode r)->r.path("source_at_ms").asLong())
          .thenComparingLong(r->r.path("received_at_ms").asLong())).toList();
      var samples=selected.stream().filter(r->r.path("quality").asText().equals("valid")&&!r.path("value_kind").asText().equals("null"))
          .sorted(Comparator.comparingLong(r->r.path("source_at_ms").asLong())).toList();
      Object value=null;boolean resetUnknown=false;
      if(op.equals("last"))value=value(ordered.getLast());
      else if(!samples.isEmpty()) {
          if(samples.stream().anyMatch(r->!r.path("value_kind").asText().equals("number")))throw new BusinessException(400,"非数值点只支持 last");
          var numbers=samples.stream().map(r->decimal(r.path("number_exact").asText())).toList();
          if(!conflict)value=switch(op) {
            case "avg" -> numbers.stream().reduce(BigDecimal.ZERO,BigDecimal::add).divide(BigDecimal.valueOf(numbers.size()),MathContext.DECIMAL128).stripTrailingZeros().toString();
            case "min" -> numbers.stream().min(BigDecimal::compareTo).orElseThrow().toString();
            case "max" -> numbers.stream().max(BigDecimal::compareTo).orElseThrow().toString();
            case "delta" -> {boolean reset=false;for(int i=1;i<numbers.size();i++)if(numbers.get(i).compareTo(numbers.get(i-1))<0)reset=true;yield reset?null:numbers.getLast().subtract(numbers.getFirst()).toString();}
            default -> throw new BusinessException(400,"不支持的聚合方式");
          };
          resetUnknown=op.equals("delta")&&value==null&&!conflict;
      }
      var dto=new LinkedHashMap<String,Object>();dto.put("timestamp",entry.getKey());dto.put("value",conflict?null:value);
      dto.put("samples",op.equals("last")?ordered.size():samples.size());dto.put("conflict",conflict);dto.put("resetUnknown",resetUnknown);
      dto.put("quality",op.equals("last")?ordered.getLast().path("quality").asText():samples.isEmpty()?"invalid":"valid");
      dto.put("sourceTime",op.equals("last")?ordered.getLast().path("source_at_ms").longValue():null);
      dto.put("receivedAt",op.equals("last")?ordered.getLast().path("received_at_ms").longValue():null);
      dto.put("source","ems");dto.put("aggregation",op);dto.put("precision",op.equals("avg")?"34 significant digits HALF_EVEN":"exact");
      dto.put("selectedSourceTimeKind",selectedKind);dto.put("selectionPolicy","prefer_source_per_bucket_else_archive");
      dto.put("excludedEvidenceCount",unique.size()-selected.size());dto.put("evidenceConflict",evidenceConflict);
      dto.put("completeness","unknown");
      dto.put("evidence",unique.values().stream().map(EmsTelemetryQueries::observation).toList());result.add(dto);
    }
    return result;
  }
  private static BigDecimal decimal(String value) {
    if(value.length()>1024)throw new BusinessException(413,"数值精度超出查询范围");
    var n=new BigDecimal(value);
    if(n.precision()>512||Math.abs((long)n.scale())>4096)throw new BusinessException(413,"数值精度超出查询范围");
    return n;
  }
}
