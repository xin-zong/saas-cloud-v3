package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class StationTelemetryService {
 private final DomainSupport s;
 private final EmsTelemetryQueries telemetry;
 private final AssetPresence presence;
 public StationTelemetryService(DomainSupport s,EmsTelemetryQueries telemetry,AssetPresence presence){this.s=s;this.telemetry=telemetry;this.presence=presence;}

 /** Caller must validate current user/session before AND after this bounded read. */
 Map<String,Object> snapshot(long station,List<Long> selected,boolean includePresence) {
   if(!selected.isEmpty()) {
     var owned=s.db.queryForList("SELECT mp.id FROM measurement_point mp JOIN device d ON d.id=mp.device_id WHERE d.station_id=? AND mp.id IN ("+EmsTelemetryQueries.ids(selected)+")",Long.class,station);
     if(owned.size()!=selected.size())throw new BusinessException(403,"测点不属于当前授权站点");
   }
   var mappings=s.db.queryForList("""
     SELECT pb.measurement_point_id,d.device_id,d.binding_period_id,pd.source_id,pd.namespace,pd.value_type,pd.aggregation,
       d.role AS subsystem,c.reachable,greatest(p.valid_from,d.valid_from,pb.valid_from) AS valid_from
     FROM point_binding pb JOIN device_binding d ON d.id=pb.device_binding_id
     JOIN ems_binding_period p ON p.id=d.binding_period_id JOIN point_definition pd ON pd.id=pb.definition_id
     JOIN device a ON a.id=d.device_id AND a.station_id=p.station_id
     LEFT JOIN ems_connection_read c ON c.ems_uuid=p.ems_uuid
     WHERE p.station_id=? AND p.valid_to IS NULL AND d.valid_to IS NULL AND pb.valid_to IS NULL
       AND greatest(p.valid_from,d.valid_from,pb.valid_from)<=clock_timestamp()
     """+ (selected.isEmpty()?"":" AND pb.measurement_point_id IN ("+EmsTelemetryQueries.ids(selected)+")")
       +" ORDER BY pb.measurement_point_id LIMIT 2001",station);
   if(mappings.size()>2000)throw new BusinessException(413,"实时测点超过2000，请缩小站点设备范围");
   var periods=mappings.stream().map(m->((Number)m.get("binding_period_id")).longValue()).distinct().toList();
   var points=mappings.stream().map(m->((Number)m.get("measurement_point_id")).longValue()).distinct().toList();
   var values=telemetry.latest(periods,points);
   long now=Instant.now().toEpochMilli();
   for(var value:values) {
     var matching=mappings.stream().filter(m->m.get("measurement_point_id").toString().equals(value.get("pointId"))).toList();
     if(matching.size()!=1){value.put("staleReason","ambiguous_mapping");continue;}
     var m=matching.getFirst();
     value.put("deviceId",m.get("device_id").toString());value.put("sourceId",m.get("source_id"));
     value.put("namespace",m.get("namespace"));value.put("subsystem",m.get("subsystem"));
     value.put("aggregation",m.get("aggregation"));value.put("supportedAggregations",aggregations(m.get("value_type"),m.get("aggregation")));
     var start=((Timestamp)m.get("valid_from")).toInstant().toEpochMilli();
     if(!m.get("binding_period_id").toString().equals(value.get("bindingPeriodId")) || ((Number)value.get("receivedAt")).longValue()<start)
       value.put("staleReason","outside_current_binding");
     else value.put("staleReason",staleReason(value,Boolean.TRUE.equals(m.get("reachable")),now));
   }
   var result=new LinkedHashMap<String,Object>();result.put("items",values);result.put("serverTime",now);
   result.put("presence",includePresence?presence.snapshot(station):null);
   return result;
 }
 static List<String> aggregations(Object type,Object aggregation) {
   if(!"number".equals(type))return List.of("last");
   if(Set.of("average","min","max").contains(Objects.toString(aggregation,"")))return List.of("last","avg","min","max");
   return "delta".equals(aggregation)?List.of("last","delta"):List.of("last");
 }
 static String staleReason(Map<String,Object> row,boolean reachable,long now) {
   if(!reachable)return "heartbeat_expired";
   if(!(row.get("receivedAt") instanceof Number receipt))return "unknown_receipt_time";
   if(receipt.longValue()>now)return "future_receipt_time";
   if(receipt.longValue()<now-90000)return "receipt_older_than_90_seconds";
   if(!(row.get("sourceTime") instanceof Number source))return "unknown_source_time";
   if(source.longValue()>now)return "future_source_time";
   if(source.longValue()<now-90000)return "source_older_than_90_seconds";
   return "stale".equals(row.get("quality"))?"source_marked_stale":null;
 }
}
