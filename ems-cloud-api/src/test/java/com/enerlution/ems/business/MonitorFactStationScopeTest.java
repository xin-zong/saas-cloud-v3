package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** Point 9 moved from A=1 (period 101) to B=2 (period 202).
 * The actor may view both stations' telemetry, but may only export B.
 */
class MonitorFactStationScopeTest {
 private static final long A=1L,B=2L,POINT=9L,A_PERIOD=101L,B_PERIOD=202L;
 private final JdbcTemplate db=mock(JdbcTemplate.class);
 private final AccessControl access=mock(AccessControl.class);
 private final EmsTelemetryQueries typed=mock(EmsTelemetryQueries.class);
 private final ObjectMapper json=new ObjectMapper();
 private final OffsetDateTime from=OffsetDateTime.now().withMinute(0).withSecond(0).withNano(0).minusHours(4),to=from.plusHours(4);

 private TelemetryController setup() {
  when(access.userId()).thenReturn(7L);
  when(access.stationPermissionTable()).thenReturn("saas_web_station_permission");
  when(access.stationIds("asset.read")).thenReturn(List.of(B));
  // Both A/B telemetry reads succeed. A is deliberately not export-authorized.
  doThrow(new BusinessException(403,"A export denied")).when(access).requireStationPermission(A,"report.export");
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(call->List.of(Map.<String,Object>of("station_id",B)));
  when(db.queryForList(anyString(),eq(Long.class),any(Object[].class))).thenAnswer(call->{
   String sql=call.getArgument(0);
   if(sql.contains("SELECT DISTINCT mp.id"))return List.of(POINT);
   // Emulate the persisted fact ownership filter. Checking telemetry permission
   // alone leaves both periods readable and reproduces the cross-export leak.
   if(sql.contains("p.station_id=?")){
    long origin=((Number)call.getArgument(call.getArguments().length-1)).longValue();
    return origin==B?List.of(B_PERIOD):origin==A?List.of(A_PERIOD):List.of();
   }
   return List.of(A_PERIOD,B_PERIOD);
  });
  when(typed.history(eq(POINT),anyList(),anyLong(),anyLong())).thenAnswer(call->{
   List<Long> periods=call.getArgument(1);var rows=json.createArrayNode();
   if(periods.contains(A_PERIOD))rows.addObject().put("point_id",POINT).put("binding_period_id",A_PERIOD).put("source_time_kind","source").put("source_at_ms",from.plusMinutes(10).toInstant().toEpochMilli()).put("received_at_ms",from.plusMinutes(10).toInstant().toEpochMilli()).put("quality","valid").put("value_kind","number").put("number_exact","900");
   if(periods.contains(B_PERIOD))rows.addObject().put("point_id",POINT).put("binding_period_id",B_PERIOD).put("source_time_kind","source").put("source_at_ms",from.plusHours(2).toInstant().toEpochMilli()).put("received_at_ms",from.plusHours(2).toInstant().toEpochMilli()).put("quality","valid").put("value_kind","number").put("number_exact","12");
   return rows;
  });
  return new TelemetryController(new DomainSupport(db,access),json,"http://127.0.0.1","unused","unused","ems_cloud_v2_proto_telemetry",typed);
 }
 private void assertOnlyRequestedStationFacts(boolean export){
  var controller=setup();var monitor=new MonitorQueryService(new DomainSupport(db,access),controller);
  var result=monitor.history(List.of(B),"pvPower",from,to,60,export);
  var items=(List<?>)result.get("items");
  assertEquals(1,items.size(),"B monitor must exclude A's original facts even if A telemetry is readable");
  var row=(Map<?,?>)items.getFirst();assertEquals("2",row.get("stationId"));assertEquals(0,new BigDecimal("12").compareTo(new BigDecimal(row.get("value").toString())));
  verify(typed).history(eq(POINT),eq(List.of(B_PERIOD)),anyLong(),anyLong());
  verify(access,never()).requireStationPermission(A,"report.export");
 }
 @Test void movedPointMonitorReadDoesNotRelabelOriginalStationFacts(){assertOnlyRequestedStationFacts(false);}
 @Test void movedPointMonitorExportCannotUseBExportPermissionForAFacts(){assertOnlyRequestedStationFacts(true);}
 @Test void existingPointHistoryStillReturnsAllTelemetryAuthorizedOriginalPeriods(){
  var controller=setup();var result=(List<?>)controller.history(POINT,from,to,60,"ems","last").data();
  assertEquals(2,result.size());verify(typed).history(eq(POINT),eq(List.of(A_PERIOD,B_PERIOD)),anyLong(),anyLong());
 }
}
