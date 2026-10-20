package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;

/** Shared bounds and exact aggregation for scoped stored-history endpoints. */
final class StoredHistoryBatch {
 static final int MAX_POINTS=128;
 static void validate(List<Long> ids,OffsetDateTime from,OffsetDateTime to,int minutes,String aggregation){
  if(ids==null||ids.isEmpty()||ids.stream().anyMatch(p->p==null||p<=0)||new HashSet<>(ids).size()!=ids.size())throw new BusinessException(400,"请选择不重复的有效测点");
  if(ids.size()>MAX_POINTS)throw new BusinessException(413,"每次最多128个测点");
  if(from==null||to==null||!to.isAfter(from)||Duration.between(from,to).compareTo(Duration.ofDays(31))>0||!Set.of(1,5,15,30,60).contains(minutes)||!Set.of("last","avg","min","max").contains(aggregation))throw new BusinessException(400,"历史时段或聚合方式无效");
 }
 static Map<String,Object> read(StoredDeviceTelemetryService stored,List<Long> ids,List<Map<String,Object>> metadata,OffsetDateTime from,OffsetDateTime to,int minutes,String aggregation){
  var found=new HashSet<Long>();
  for(var point:metadata){found.add(((Number)point.get("id")).longValue());if(!((List<?>)point.get("supportedAggregations")).contains(aggregation))throw new BusinessException(400,"该测点不支持所选聚合方式");}
  if(found.size()!=ids.size()||!found.containsAll(ids))throw new BusinessException(409,"测点归属已变化");
  long end=Math.min(to.toInstant().toEpochMilli(),Instant.now().toEpochMilli());
  var grouped=new LinkedHashMap<Long,com.fasterxml.jackson.databind.node.ArrayNode>();var mapper=new ObjectMapper();
  for(long id:ids)grouped.put(id,mapper.createArrayNode());
  if(end>from.toInstant().toEpochMilli())for(var row:stored.historyRows(ids,from.toInstant().toEpochMilli(),end)){
   long id=row.path("point_id").asLong();if(!grouped.containsKey(id))throw new BusinessException(409,"测点归属已变化");grouped.get(id).add(row);
  }
  var items=new ArrayList<Map<String,Object>>();
  for(long id:ids){var rows=EmsTelemetryQueries.aggregate(grouped.get(id),aggregation,minutes);for(var row:rows){row.put("source","stored_device");row.put("sourceType","stored_device");}items.add(Map.of("pointId",Long.toString(id),"rows",rows));}
  Map<String,Object> result=Map.of("items",items);
  checkOutput(result);
  return result;
 }
 static void checkOutput(Map<String,Object> result){
  try{if(new ObjectMapper().writeValueAsBytes(com.enerlution.ems.common.ApiResponse.ok(result)).length>EmsTelemetryQueries.MAX_BYTES)throw new BusinessException(413,"遥测结果过大，请缩小查询范围");}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
 }
}
