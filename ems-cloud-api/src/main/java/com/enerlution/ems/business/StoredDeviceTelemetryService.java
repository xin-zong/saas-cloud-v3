package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Stored observations share canonical points, but never acquire a fictitious EMS binding.
 * Callers enforce permissions, including the immutable original station before history reads. */
@Service
public class StoredDeviceTelemetryService {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final Clock clock;
  @Autowired public StoredDeviceTelemetryService(JdbcTemplate db,ObjectMapper json) {this(db,json,Clock.systemUTC());}
  StoredDeviceTelemetryService(JdbcTemplate db,ObjectMapper json,Clock clock) {this.db=db;this.json=json;this.clock=clock;}
  private static final String JOINS="""
      FROM stored_device_point_binding b
      JOIN measurement_point mp ON mp.id=b.measurement_point_id
      JOIN reference_device_point rp ON rp.id=b.reference_point_id AND rp.device_id=mp.device_id
      JOIN device d ON d.id=mp.device_id AND d.station_id=b.station_id
      """;
  private static final String METADATA="b.measurement_point_id AS point_id,b.station_id,b.reference_point_id,mp.device_id,mp.code,rp.name,rp.unit,b.semantic_key";
  private static final String SAMPLE="""
      ,s.quality AS sample_quality,s.value::text AS number_exact,s.raw_value,
      (extract(epoch FROM s.source_at)*1000)::bigint AS source_at_ms,
      (extract(epoch FROM s.captured_at)*1000)::bigint AS received_at_ms,
      EXISTS(SELECT 1 FROM reference_device_sample other
        WHERE other.point_id=s.point_id AND other.source_at=s.source_at
          AND (other.quality,other.value,CASE WHEN other.quality='text' THEN other.raw_value END)
          IS DISTINCT FROM (s.quality,s.value,CASE WHEN s.quality='text' THEN s.raw_value END)) AS sample_conflict
      """;
  public boolean owns(long point) {return originalStation(point)!=null;}
  public Long originalStation(long point) {
    var rows=db.queryForList("SELECT station_id FROM stored_device_point_binding WHERE measurement_point_id=?",Long.class,point);
    return rows.isEmpty()?null:rows.getFirst();
  }
  /** null or an empty list selects all points in the specified station. */
  public List<Map<String,Object>> latest(long station,List<Long> selected) {
    var rows=db.queryForList("SELECT "+METADATA+SAMPLE+JOINS+"""
        JOIN LATERAL (SELECT * FROM reference_device_sample s WHERE s.point_id=b.reference_point_id
          ORDER BY s.source_at DESC,s.captured_at DESC,s.id DESC LIMIT 1) s ON true
        WHERE b.station_id=?
        """+selection(selected)+" ORDER BY mp.id LIMIT "+(EmsTelemetryQueries.MAX_ROWS+1),station);
    bounded(rows);
    return rows.stream().map(this::observation).toList();
  }
  public List<Map<String,Object>> directory(long station,List<Long> selected) {
    var rows=db.queryForList("SELECT "+METADATA+"""
        ,EXISTS(SELECT 1 FROM reference_device_sample s WHERE s.point_id=rp.id AND s.quality='text') AS has_text,
        EXISTS(SELECT 1 FROM reference_device_sample s WHERE s.point_id=rp.id AND s.quality='observed') AS has_number
        """+JOINS+" WHERE b.station_id=?"+selection(selected)+" ORDER BY mp.id LIMIT "+(EmsTelemetryQueries.MAX_ROWS+1),station);
    bounded(rows);
    return rows.stream().<Map<String,Object>>map(row->{
      var out=metadata(row);out.put("id",row.get("point_id"));out.put("measurement_point_id",row.get("point_id"));
      out.put("reference_point_id",row.get("reference_point_id"));out.put("station_id",row.get("station_id"));
      out.put("device_id",row.get("device_id"));out.put("source","ems");out.put("sourceType","stored_device");
      String type=Boolean.TRUE.equals(row.get("has_text"))?"text":Boolean.TRUE.equals(row.get("has_number"))?"number":"null";
      out.put("valueType",type);out.put("value_type",type);out.put("supportedAggregations",aggregations(type,row.get("unit")));
      out.put("aggregation",aggregations(type,row.get("unit")).size()>1?"average":"last");return out;
    }).toList();
  }
  public JsonNode historyRows(long point,long fromMs,long toMs) {
    if(fromMs>=toMs)throw new BusinessException(400,"查询结束时间必须晚于开始时间");
    var rows=db.queryForList("SELECT * FROM (SELECT DISTINCT ON (s.source_at) "+METADATA+SAMPLE+JOINS+"""
        JOIN reference_device_sample s ON s.point_id=b.reference_point_id
        WHERE b.measurement_point_id=? AND s.source_at>=? AND s.source_at<?
        ORDER BY s.source_at,s.captured_at DESC,s.id DESC) chosen ORDER BY source_at_ms LIMIT
        """+(EmsTelemetryQueries.MAX_ROWS+1),point,Timestamp.from(Instant.ofEpochMilli(fromMs)),Timestamp.from(Instant.ofEpochMilli(toMs)));
    bounded(rows);var out=json.createArrayNode();rows.forEach(row->out.add(rawRow(row)));return out;
  }
  private static String selection(List<Long> points) {
    if(points==null||points.isEmpty())return "";
    if(points.size()>EmsTelemetryQueries.MAX_ROWS||points.stream().anyMatch(p->p==null||p<=0))throw new BusinessException(413,"测点选择超出查询范围");
    return " AND b.measurement_point_id IN ("+String.join(",",points.stream().map(Object::toString).toList())+")";
  }
  private static void bounded(List<Map<String,Object>> rows) {
    if(rows.size()>EmsTelemetryQueries.MAX_ROWS)throw new BusinessException(413,"遥测结果过大，请缩小查询范围");
    long size=0;for(var row:rows)for(var value:row.values())if(value!=null)size+=value.toString().length()*3L;
    if(size>EmsTelemetryQueries.MAX_BYTES)throw new BusinessException(413,"遥测结果过大，请缩小查询范围");
  }
  private static List<String> aggregations(String type,Object unit) {
    return "number".equals(type)&&Set.of("kW","W","MW","V","A","℃","%","Hz","kVar","kVA").contains(Objects.toString(unit,""))
        ?List.of("last","avg","min","max"):List.of("last");
  }
  private static LinkedHashMap<String,Object> metadata(Map<String,Object> row) {
    var out=new LinkedHashMap<String,Object>();
    out.put("pointId",row.get("point_id").toString());out.put("deviceId",row.get("device_id").toString());
    out.put("code",row.get("code"));out.put("name",row.get("name"));out.put("unit",row.get("unit"));
    out.put("semanticKey",row.get("semantic_key"));out.put("namespace","device");return out;
  }
  ObjectNode rawRow(Map<String,Object> row) {
    String quality=Objects.toString(row.get("sample_quality"));
    boolean conflict=Boolean.TRUE.equals(row.get("sample_conflict"));
    var raw=json.createObjectNode();raw.put("point_id",row.get("point_id").toString());
    raw.put("source_at_ms",((Number)row.get("source_at_ms")).longValue());raw.put("received_at_ms",((Number)row.get("received_at_ms")).longValue());
    raw.put("source_type","stored_device");raw.put("source_time_kind","source");raw.put("quality",conflict||"missing".equals(quality)?"invalid":"valid");
    raw.put("conflict",conflict);
    if(row.get("reference_point_id")!=null)raw.put("binding_period_id","stored:"+row.get("reference_point_id"));
    if(row.get("station_id")!=null)raw.put("original_station_id",((Number)row.get("station_id")).longValue());
    raw.put("value_kind",conflict?"null":switch(quality){case "observed"->"number";case "text"->"text";default->"null";});
    raw.put("number_exact",(String)row.get("number_exact"));raw.put("text_value","text".equals(quality)?(String)row.get("raw_value"):null);
    raw.put("raw_value",(String)row.get("raw_value"));return raw;
  }
  Map<String,Object> observation(Map<String,Object> row) {
    var out=EmsTelemetryQueries.observation(rawRow(row));out.putAll(metadata(row));
    boolean conflict=Boolean.TRUE.equals(row.get("sample_conflict"));out.put("conflict",conflict);
    out.put("sourceType","stored_device");out.put("rawValue",row.get("raw_value"));
    out.put("supportedAggregations",aggregations(out.get("valueType").toString(),row.get("unit")));
    long now=clock.millis(),source=((Number)out.get("sourceTime")).longValue(),receipt=((Number)out.get("receivedAt")).longValue();
    out.put("staleReason",conflict?"conflicting_source_values":source>now?"future_source_time":receipt>now?"future_receipt_time":
        source<now-90000?"source_older_than_90_seconds":receipt<now-90000?"receipt_older_than_90_seconds":null);
    return out;
  }
}
