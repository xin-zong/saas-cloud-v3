package com.enerlution.ems.business;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** Source reporting snapshots, only for the complete authorized station scope. */
final class MonitorDashboardCapture {
 private MonitorDashboardCapture(){}
 static boolean eligible(Set<String> expected,List<Map<String,Object>> rows){
  return !expected.isEmpty()&&rows.size()==expected.size()
    &&rows.stream().allMatch(r->Boolean.TRUE.equals(r.get("telemetryAllowed")))
    &&expected.equals(new HashSet<>(rows.stream().map(r->r.get("id").toString()).toList()));
 }
 static void restrictAlarm(Map<String,Object> summary,List<Map<String,Object>> rows){
  if(rows.stream().anyMatch(r->!Boolean.TRUE.equals(r.get("alarmAllowed"))))summary.put("alarmSites",null);
 }
 static Map<String,Object> read(DomainSupport s,ObjectMapper json,List<Map<String,Object>> rows,Map<String,Object> query){
  if(!"capture".equals(query.get("sourceMode"))||!"imported".equals(query.get("scope"))||!"all".equals(query.get("scene")))return null;
  var found=s.db.queryForList("SELECT id,payload::text,captured_at,source_updated_at,source_host FROM monitor_dashboard_capture ORDER BY captured_at DESC,id DESC LIMIT 1");
  if(found.isEmpty())return null;var record=found.getFirst();
  var expected=new HashSet<>(s.db.queryForList("SELECT station_id::text FROM monitor_dashboard_capture_station WHERE capture_id=?",String.class,record.get("id")));
  if(!eligible(expected,rows))return null;
  try{
   var result=json.readValue(record.get("payload").toString(),new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String,Object>>(){});
   restrictAlarm((Map<String,Object>)result.get("summary"),rows);
   result.put("capturedAt",((java.sql.Timestamp)record.get("captured_at")).toInstant().toString());
   result.put("sourceUpdatedAt",((java.sql.Timestamp)record.get("source_updated_at")).toInstant().toString());
   result.put("sourceHost",record.get("source_host"));return result;
  }catch(Exception ex){throw new IllegalStateException("Invalid stored source dashboard capture",ex);}
 }
}
