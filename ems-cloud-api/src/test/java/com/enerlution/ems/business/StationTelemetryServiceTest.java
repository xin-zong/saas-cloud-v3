package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import org.springframework.jdbc.core.JdbcTemplate;
class StationTelemetryServiceTest {
 @Test void selectedPointFilterIsAppliedBeforeMappingLimitAndRejectsForeignPoint() {
   var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var queries=mock(EmsTelemetryQueries.class);
   var service=new StationTelemetryService(new DomainSupport(db,access),queries,mock(AssetPresence.class));
   when(db.queryForList(contains("SELECT mp.id"),eq(Long.class),eq(4L))).thenReturn(List.of(19L));
   when(db.queryForList(contains("FROM point_binding pb"),eq(4L))).thenReturn(List.of());
   when(queries.latest(anyList(),anyList())).thenReturn(List.of());
   service.snapshot(4,List.of(19L),false);
   verify(db).queryForList(contains("AND pb.measurement_point_id IN (19) ORDER BY pb.measurement_point_id LIMIT 2001"),eq(4L));
   assertThrows(com.enerlution.ems.common.BusinessException.class,()->service.snapshot(5,List.of(19L),false));
   verify(db,never()).queryForList(contains("FROM point_binding pb"),eq(5L));
 }
 @Test void receiptCannotMakeExpiredSourceOrHeartbeatFresh() {
   long now=Instant.now().toEpochMilli();
   var row=new HashMap<String,Object>(Map.of("receivedAt",now-1000,"sourceTime",now-1000,"quality","valid"));
   assertNull(StationTelemetryService.staleReason(row,true,now));
   assertEquals("heartbeat_expired",StationTelemetryService.staleReason(row,false,now));
   row.put("sourceTime",now-100000);assertEquals("source_older_than_90_seconds",StationTelemetryService.staleReason(row,true,now));
   row.put("sourceTime",now+1000);assertEquals("future_source_time",StationTelemetryService.staleReason(row,true,now));
   row.remove("sourceTime");assertEquals("unknown_source_time",StationTelemetryService.staleReason(row,true,now));
 }
 @Test void pointListIsBoundedAndUnambiguous() {
   assertEquals(List.of(19L,21L),RealtimeTelemetryController.parsePoints("19,21,19"));
   assertThrows(RuntimeException.class,()->RealtimeTelemetryController.parsePoints("19,1 OR 1=1"));
   assertThrows(RuntimeException.class,()->RealtimeTelemetryController.parsePoints("0"));
 }
}
