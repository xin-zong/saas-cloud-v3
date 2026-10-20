package com.enerlution.ems.business;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class DeviceHistoryBatchTest {
 @Test void outputLimitIncludesApiEnvelope() throws Exception {
  var json=new ObjectMapper();var empty=Map.<String,Object>of("padding","");int overhead=json.writeValueAsBytes(empty).length;
  var exactData=Map.<String,Object>of("padding","x".repeat(EmsTelemetryQueries.MAX_BYTES-overhead));assertEquals(EmsTelemetryQueries.MAX_BYTES,json.writeValueAsBytes(exactData).length);
  assertThrows(BusinessException.class,()->StoredHistoryBatch.checkOutput(exactData));
 }
 final JdbcTemplate db=mock(JdbcTemplate.class);
 final AccessControl access=mock(AccessControl.class);
 final StoredDeviceTelemetryService stored=mock(StoredDeviceTelemetryService.class);
 final OffsetDateTime from=OffsetDateTime.parse("2026-01-01T00:00:00Z");
 DeviceHistoryBatchController controller(){return new DeviceHistoryBatchController(new DomainSupport(db,access),stored,new ObjectMapper());}
 List<Map<String,Object>> metadata(){return List.of(Map.of("id",91L,"device_id",8L,"supportedAggregations",List.of("last","avg")),Map.of("id",92L,"device_id",8L,"supportedAggregations",List.of("last")));}
 void authorized(){when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(Map.of("id",91L),Map.of("id",92L)));when(stored.directory(2,List.of(91L,92L))).thenReturn(metadata());when(stored.historyRows(eq(List.of(91L,92L)),anyLong(),anyLong())).thenReturn(new ObjectMapper().createArrayNode());}
 @Test void batchesAllSelectedPointsAndRechecksOwnership(){authorized();var result=(Map<?,?>)controller().history(2,8,List.of(91L,92L),from,from.plusDays(1),15,"last").data();var items=(List<?>)result.get("items");assertEquals(2,items.size());assertEquals("91",((Map<?,?>)items.getFirst()).get("pointId"));verify(stored,times(1)).historyRows(eq(List.of(91L,92L)),anyLong(),anyLong());verify(db,times(2)).queryForList(anyString(),any(Object[].class));verify(access,times(2)).requireStationPermission(2,"asset.read");verify(access,times(2)).requireStationPermission(2,"telemetry.read");}
 @Test void deniedPermissionNeverReads(){doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(2,"telemetry.read");assertThrows(BusinessException.class,()->controller().history(2,8,List.of(91L),from,from.plusDays(1),15,"last"));verifyNoInteractions(db,stored);}
 @Test void duplicateAndOversizedSelectionsFail(){assertThrows(BusinessException.class,()->controller().history(2,8,List.of(91L,91L),from,from.plusDays(1),15,"last"));assertThrows(BusinessException.class,()->controller().history(2,8,java.util.stream.LongStream.rangeClosed(1,129).boxed().toList(),from,from.plusDays(1),15,"last"));verifyNoInteractions(db,stored);}
 @Test void everyPointMustRemainOwnedAfterRead(){authorized();when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(Map.of("id",91L),Map.of("id",92L)),List.of(Map.of("id",91L)));assertThrows(BusinessException.class,()->controller().history(2,8,List.of(91L,92L),from,from.plusDays(1),15,"last"));}
 @Test void disallowedAggregationRefusesWholeBatch(){authorized();assertThrows(BusinessException.class,()->controller().history(2,8,List.of(91L,92L),from,from.plusDays(1),15,"avg"));verify(stored,never()).historyRows(anyList(),anyLong(),anyLong());}
 @Test void metadataCannotContainAnotherDevice(){authorized();when(stored.directory(2,List.of(91L,92L))).thenReturn(List.of(Map.of("id",91L,"device_id",7L,"supportedAggregations",List.of("last")),metadata().get(1)));assertThrows(BusinessException.class,()->controller().history(2,8,List.of(91L,92L),from,from.plusDays(1),15,"last"));verify(stored,never()).historyRows(anyList(),anyLong(),anyLong());}
 @Test void batchUsesIdenticalExactAggregationAndPreservesEmptySeries(){
  authorized();var json=new ObjectMapper();long time=from.toInstant().toEpochMilli();
  var evidence=json.createArrayNode();evidence.addObject().put("point_id","91").put("source_at_ms",time).put("received_at_ms",time+1).put("source_type","stored_device").put("source_time_kind","source").put("quality","valid").put("value_kind","number").put("number_exact","9007199254740993.0001");
  when(stored.historyRows(eq(List.of(91L,92L)),anyLong(),anyLong())).thenReturn(evidence);
  var data=(Map<?,?>)controller().history(2,8,List.of(91L,92L),from,from.plusDays(1),15,"last").data();var items=(List<?>)data.get("items");var first=(List<?>)((Map<?,?>)items.getFirst()).get("rows");var expected=EmsTelemetryQueries.aggregate(evidence,"last",15);expected.forEach(row->{row.put("source","stored_device");row.put("sourceType","stored_device");});assertEquals(expected,first);assertEquals(List.of(),((Map<?,?>)items.get(1)).get("rows"));
 }
}
