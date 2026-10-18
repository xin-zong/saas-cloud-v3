package com.enerlution.ems.business;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Read-only EMS evidence. Called inside the rule transaction, never accepts request sample values. */
@Component
public class AlarmSampleReader {
  @org.springframework.beans.factory.annotation.Autowired
  StoredDeviceTelemetryService stored;
  private final JdbcTemplate db;
  private final EmsTelemetryQueries telemetry;
  public AlarmSampleReader(JdbcTemplate db,EmsTelemetryQueries telemetry){this.db=db;this.telemetry=telemetry;}
  public record Frame(List<BigDecimal> values,List<Map<String,Object>> evidence,String mappingKey,String reason){}
  private Frame unknown(String reason){return new Frame(List.of(),List.of(),"",reason);}

  public Frame read(Map<String,Object> rule,List<AlarmRules.Condition> conditions,long bucket,Instant now){
    if(bucket<0 || bucket+60_000>now.toEpochMilli() || now.toEpochMilli()-bucket>180_000)
      return unknown("采样分钟未结束或已过期，等待新的完整分钟");
    var values=new ArrayList<BigDecimal>();var evidence=new ArrayList<Map<String,Object>>();
    var keys=new ArrayList<String>();
    for(var condition:conditions){
      var field=condition.fields().getFirst();
      var bindings=db.queryForList("""
        SELECT mp.id AS point_id,p.id AS period_id,pb.id AS binding_id,pd.id AS definition_id,
               k.unit,pd.value_type
        FROM point_binding pb JOIN device_binding d ON d.id=pb.device_binding_id
        JOIN ems_binding_period p ON p.id=d.binding_period_id
        JOIN point_definition pd ON pd.id=pb.definition_id
        JOIN measurement_point mp ON mp.id=pb.measurement_point_id AND mp.device_id=d.device_id
        JOIN measurement_kind k ON k.code=mp.kind_code
        JOIN device a ON a.id=mp.device_id AND a.station_id=p.station_id
        WHERE p.station_id=? AND mp.device_id=? AND (mp.code=? OR pd.source_id::text=?)
          AND greatest(p.valid_from,d.valid_from,pb.valid_from)<=?
          AND (p.valid_to IS NULL OR p.valid_to>=?)
          AND (d.valid_to IS NULL OR d.valid_to>=?)
          AND (pb.valid_to IS NULL OR pb.valid_to>=?)
        ORDER BY pb.id LIMIT 2 FOR SHARE OF p,d,pb,mp,pd,k,a
        """,rule.get("station_id"),rule.get("device_id"),field.code(),field.code(),
          OffsetDateTime.ofInstant(Instant.ofEpochMilli(bucket),ZoneOffset.UTC),
          OffsetDateTime.ofInstant(Instant.ofEpochMilli(bucket+60_000),ZoneOffset.UTC),
          OffsetDateTime.ofInstant(Instant.ofEpochMilli(bucket+60_000),ZoneOffset.UTC),
          OffsetDateTime.ofInstant(Instant.ofEpochMilli(bucket+60_000),ZoneOffset.UTC));
      boolean fromStored=false;
      if(bindings.isEmpty()&&stored!=null){
        bindings=db.queryForList("""
          SELECT mp.id AS point_id,b.reference_point_id AS binding_id,b.reference_point_id AS definition_id,
                 'stored:'||b.reference_point_id AS period_id,k.unit,
                 CASE WHEN EXISTS(SELECT 1 FROM reference_device_sample a WHERE a.point_id=b.reference_point_id AND a.quality='text') THEN 'text' ELSE 'number' END AS value_type
          FROM stored_device_point_binding b JOIN measurement_point mp ON mp.id=b.measurement_point_id
          JOIN measurement_kind k ON k.code=mp.kind_code JOIN device d ON d.id=mp.device_id
          WHERE b.station_id=? AND d.station_id=b.station_id AND mp.device_id=? AND mp.code=?
          LIMIT 2 FOR SHARE OF b,mp,k,d
          """,rule.get("station_id"),rule.get("device_id"),field.code());
        fromStored=!bindings.isEmpty();
      }
      if(bindings.size()!=1)return unknown("测点没有唯一的本站设备绑定："+field.code());
      var binding=bindings.getFirst();
      if(!field.unit().equals(binding.get("unit")) || !"number".equals(binding.get("value_type")))
        return unknown("测点单位或数值类型与规则不一致："+field.code());
      long point=((Number)binding.get("point_id")).longValue();
      String period=binding.get("period_id").toString();
      // Native keys are persisted on active occurrences; preserve their existing identity.
      keys.add((fromStored?"stored:":"")+binding.get("binding_id")+":"+point+":"+period+":"+binding.get("definition_id"));
      JsonNode rows=fromStored?stored.historyRows(point,bucket,bucket+60_000):telemetry.history(point,List.of(Long.parseLong(period)),bucket,bucket+60_000);
      var source=JsonNodeFactory.instance.arrayNode();
      for(var row:rows){
        // Receipt/archive time is never a substitute for verified source time. Any future evidence
        // invalidates the bucket rather than making an older value appear current.
        if(!row.path("source_time_kind").asText().equals("source"))continue;
        if(!(fromStored?"stored_device".equals(row.path("source_type").asText()):Set.of("ems","cabinet_30s","cabinet_60s").contains(row.path("source_type").asText()))
            || fromStored&&row.path("original_station_id").asLong(-1)!=((Number)rule.get("station_id")).longValue()
            || !row.path("point_id").asText().equals(Long.toString(point))
            || !row.path("binding_period_id").asText().equals(period)
            || !row.path("source_at_ms").isNumber() || !row.path("received_at_ms").isNumber()
            || row.path("received_at_ms").asLong()>now.toEpochMilli()
            || now.toEpochMilli()-row.path("received_at_ms").asLong()>180_000
            || row.path("source_at_ms").asLong()<bucket || row.path("source_at_ms").asLong()>=bucket+60_000)
          return unknown("采样来源、原站点归属或时间无效");
        source.add(row);
      }
      var buckets=EmsTelemetryQueries.aggregate(source,"last",1);
      if(buckets.size()!=1)return unknown("完整分钟内没有可信源时间采样："+field.code());
      var sample=buckets.getFirst();
      if(!"valid".equals(sample.get("quality")) || Boolean.TRUE.equals(sample.get("evidenceConflict")) || sample.get("value")==null)
        return unknown("采样无效、过期或存在冲突："+field.code());
      var last=source.get(source.size()-1);
      if(!"number".equals(last.path("value_kind").asText()))return unknown("采样不是有效数值："+field.code());
      try{
        String text=sample.get("value").toString();
        if(text.length()>512)return unknown("采样精度超出范围");
        BigDecimal value=new BigDecimal(text);
        if(value.precision()>256||Math.abs((long)value.scale())>1024)return unknown("采样精度超出范围");
        values.add(value);
      }catch(NumberFormatException ex){return unknown("采样不是有限十进制数值");}
      var fact=EmsTelemetryQueries.observation(last);fact.put("originalStationId",rule.get("station_id"));fact.put("fieldCode",field.code());fact.put("unit",field.unit());evidence.add(fact);
    }
    return new Frame(List.copyOf(values),List.copyOf(evidence),String.join("|",keys),null);
  }
}
