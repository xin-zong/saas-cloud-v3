package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;

class UnifiedStoredTelemetryTest {
 @Test void storedSamplesJoinStationSnapshotWithoutDependingOnClickHouse(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var nativeQueries=mock(EmsTelemetryQueries.class);
  var stored=mock(StoredDeviceTelemetryService.class);
  var service=new StationTelemetryService(new DomainSupport(db,access),nativeQueries,mock(AssetPresence.class));service.stored=stored;
  var sample=new LinkedHashMap<String,Object>(Map.of("pointId","42","deviceId","7","value","0","quality","valid","staleReason","source_older_than_90_seconds","sourceType","stored_device"));
  when(stored.latest(3,List.of())).thenReturn(List.of(sample));when(nativeQueries.latest(anyList(),anyList())).thenReturn(List.of());
  var result=service.snapshot(3,List.of(),false);
  assertEquals(List.of(sample),result.get("items"));assertEquals("0",((List<Map<String,Object>>)result.get("items")).getFirst().get("value"));
 }
 @Test void historicalStoredPointRequiresOriginalStationPermission(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var queries=mock(EmsTelemetryQueries.class);var stored=mock(StoredDeviceTelemetryService.class);
  var controller=new TelemetryController(new DomainSupport(db,access),new ObjectMapper(),"http://127.0.0.1","unused","unused","ems_cloud_v2_proto_telemetry",queries);controller.stored=stored;
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(new HashMap<>(Map.of("station_id",9L))));
  when(stored.owns(42)).thenReturn(true);when(stored.originalStation(42)).thenReturn(3L);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(3,"telemetry.read");
  assertThrows(BusinessException.class,()->controller.history(42,OffsetDateTime.parse("2026-10-17T00:00:00Z"),OffsetDateTime.parse("2026-10-18T00:00:00Z"),1,"ems","last"));
  verifyNoInteractions(queries);verify(stored,never()).historyRows(anyLong(),anyLong(),anyLong());
 }
}
