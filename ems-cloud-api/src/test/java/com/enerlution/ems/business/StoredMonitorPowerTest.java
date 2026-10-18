package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.ApiResponse;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StoredMonitorPowerTest {
  final JdbcTemplate db=mock(JdbcTemplate.class);
  final AccessControl access=mock(AccessControl.class);
  final TelemetryController telemetry=mock(TelemetryController.class);
  final MonitorQueryService service=new MonitorQueryService(new DomainSupport(db,access),telemetry);
  final OffsetDateTime from=OffsetDateTime.parse("2026-01-01T00:00:00Z"),to=from.plusHours(1);
  StoredMonitorPowerTest() {
    service.stored=mock(StoredDeviceTelemetryService.class);
    when(access.stationIds("asset.read")).thenReturn(List.of(4L));
    when(db.queryForList(anyString(),eq(Long.class),any(Object[].class))).thenReturn(List.of());
    doReturn(ApiResponse.ok(List.of(Map.of("timestamp",from.toInstant().toEpochMilli(),"sourceTime",from.toInstant().toEpochMilli(),"receivedAt",from.toInstant().toEpochMilli()+10,"value","12.0001","quality","valid","samples",1,"source","stored_device","sourceType","stored_device"))))
      .when(telemetry).stationHistory(eq(4L),anyLong(),eq(from),eq(to),eq(60),eq("last"));
  }
  Map<String,Object> point(long id,long device,String type,Long parent) {
    var row=new HashMap<String,Object>();row.put("id",id);row.put("device_id",device);row.put("source_type",type);row.put("parent_device_id",parent);return row;
  }
  Map<String,Object> history(String metric){return service.history(List.of(4L),metric,from,to,60,true);}
  @Test void storedPvPointUsesStationScopedHistoryAndPreservesSourceTimes() {
    when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(point(7,70,"Inverter",null)));
    var items=(List<?>)history("pvPower").get("items");assertEquals(1,items.size());
    var row=(Map<?,?>)items.getFirst();assertEquals("stored_device",row.get("sourceType"));assertEquals(from.toInstant().toEpochMilli(),row.get("sourceTime"));
    verify(telemetry).stationHistory(4L,7L,from,to,60,"last");verify(access,atLeast(2)).requireStationPermission(4,"report.export");
    verify(db).queryForList(argThat((String sql)->sql.contains("d.station_id=b.station_id")&&sql.contains("rp.device_id=mp.device_id")),eq(4L),eq("pvPower"));
  }
  @Test void provenStackIsSelectedWithoutAddingItsChildCluster() {
    when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(point(7,70,"Battery Stack",null),point(8,80,"Battery Cluster",70L)));
    assertEquals(1,((List<?>)history("storagePower").get("items")).size());verify(telemetry).stationHistory(4,7,from,to,60,"last");
  }
  @Test void unrelatedClustersAndMultipleParentsRemainAmbiguous() {
    for(var candidates:List.of(List.of(point(7,70,"Battery Stack",null),point(8,80,"Battery Cluster",90L)),List.of(point(7,70,"Battery Stack",null),point(8,80,"Battery Stack",null)))) {
      when(db.queryForList(anyString(),any(Object[].class))).thenReturn(candidates);
      var response=history("storagePower");assertTrue(((List<?>)response.get("items")).isEmpty());
      assertEquals("unmapped_or_ambiguous",((Map<?,?>)((List<?>)response.get("stationResults")).getFirst()).get("reason"));
    }
    verifyNoInteractions(telemetry);
  }
  @Test void nativeAndStoredCandidatesCannotBeSilentlyCombined() {
    when(db.queryForList(anyString(),eq(Long.class),any(Object[].class))).thenReturn(List.of(9L));
    when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(point(7,70,"Inverter",null)));
    assertTrue(((List<?>)history("pvPower").get("items")).isEmpty());verifyNoInteractions(telemetry);
  }
}
