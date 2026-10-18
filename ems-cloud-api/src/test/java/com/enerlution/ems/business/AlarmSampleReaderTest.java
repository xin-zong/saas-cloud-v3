package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AlarmSampleReaderTest {
 final JdbcTemplate db=mock(JdbcTemplate.class);
 final EmsTelemetryQueries telemetry=mock(EmsTelemetryQueries.class);
 final ObjectMapper json=new ObjectMapper();
 final long bucket=1_800_000L;
 final Instant now=Instant.ofEpochMilli(bucket+70_000);
 final Map<String,Object> rule=Map.of("station_id",9L,"device_id",19L);
 AlarmRules.Condition condition(){return new AlarmRules.Condition(List.of(new AlarmRules.Field("20024","kW","INSTANT","DEVICE")),"self",1,"gt",BigDecimal.TEN,null,null,true,false,false);}
 Map<String,Object> mapping(){return Map.of("point_id",29L,"period_id",3L,"binding_id",4L,"definition_id",5L,"unit","kW","value_type","number");}
 com.fasterxml.jackson.databind.node.ArrayNode rows(String quality,String kind,String value){var rows=json.createArrayNode();rows.addObject().put("point_id",29).put("binding_period_id",3).put("source_type","ems").put("source_time_kind",kind).put("source_at_ms",bucket+30000).put("received_at_ms",bucket+31000).put("quality",quality).put("value_kind","number").put("number_exact",value);return rows;}
 AlarmSampleReader reader(){return new AlarmSampleReader(db,telemetry);}
 @Test void readsOnlyUniqueStationDeviceBindingAndPreservesExactSourceEvidence(){
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(mapping()));
  when(telemetry.history(eq(29L),eq(List.of(3L)),eq(bucket),eq(bucket+60000))).thenReturn(rows("valid","source","12.34567890123456789"));
  var result=reader().read(rule,List.of(condition()),bucket,now);
  assertNull(result.reason());assertEquals(new BigDecimal("12.34567890123456789"),result.values().getFirst());
  assertEquals("29",result.evidence().getFirst().get("pointId"));assertEquals("4:29:3:5",result.mappingKey(),"Existing persisted alarm mapping keys must remain compatible");
  verify(db).queryForList(argThat(s->s.contains("p.station_id=?")&&s.contains("mp.device_id=?")&&s.contains("FOR SHARE")),any(Object[].class));
 }
 @Test void absentOrAmbiguousMappingNeverReadsTelemetry(){
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(),List.of(mapping(),mapping()));
  assertNotNull(reader().read(rule,List.of(condition()),bucket,now).reason());
  assertNotNull(reader().read(rule,List.of(condition()),bucket,now).reason());verifyNoInteractions(telemetry);
 }
 @Test void staleInvalidArchiveAndConflictCannotTriggerOrRecover(){
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(mapping()));
  var conflict=rows("valid","source","11");conflict.add(rows("valid","source","12").get(0));
  for(var values:List.of(rows("stale","source","12"),rows("invalid","source","12"),rows("valid","archive","12"),conflict,json.createArrayNode())){
   when(telemetry.history(anyLong(),anyList(),anyLong(),anyLong())).thenReturn(values);
   assertNotNull(reader().read(rule,List.of(condition()),bucket,now).reason());
  }
 }
 @Test void oldReceiptCannotMasqueradeAsFreshSourceTime(){
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(mapping()));
  var values=rows("valid","source","12");((com.fasterxml.jackson.databind.node.ObjectNode)values.get(0)).put("received_at_ms",bucket-300000);
  when(telemetry.history(anyLong(),anyList(),anyLong(),anyLong())).thenReturn(values);
  assertNotNull(reader().read(rule,List.of(condition()),bucket,now).reason());
 }
 @Test void staleBucketAndMismatchedUnitsNeverReadSamples(){
  assertNotNull(reader().read(rule,List.of(condition()),bucket,now.plusSeconds(181)).reason());
  var wrong=new HashMap<>(mapping());wrong.put("unit","MW");
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(wrong));
  assertNotNull(reader().read(rule,List.of(condition()),bucket,now).reason());verifyNoInteractions(telemetry);
 }
}
