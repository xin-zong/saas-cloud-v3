package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationTargetException;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StoredAnalysisExportTest {
  final ObjectMapper json=new ObjectMapper();
  final JdbcTemplate db=mock(JdbcTemplate.class);
  final AccessControl access=mock(AccessControl.class);
  final EmsTelemetryQueries ems=mock(EmsTelemetryQueries.class);
  final StoredDeviceTelemetryService stored=mock(StoredDeviceTelemetryService.class);
  final AnalysisJobService service=new AnalysisJobService(new DomainSupport(db,access),json,ems);
  StoredAnalysisExportTest() throws Exception {
    service.stored=stored;
    when(stored.owns(7)).thenReturn(true);when(stored.originalStation(7)).thenReturn(4L);
    when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(Map.of("station_id",4L,"device_name","Device","point_name","Power","unit","kW")));
    when(stored.directory(4,List.of(7L))).thenReturn(List.of(Map.of("supportedAggregations",List.of("last"),"semanticKey","pcsPower")));
    when(stored.historyRows(eq(7L),anyLong(),anyLong())).thenReturn(json.readTree("""
      [{"point_id":"7","binding_period_id":"stored:19","original_station_id":4,"source_type":"stored_device","source_time_kind":"source","source_at_ms":1000,"received_at_ms":1500,"quality":"valid","value_kind":"number","number_exact":"9007199254740993.0001","raw_value":"9007199254740993.0001"},
       {"point_id":"7","binding_period_id":"stored:19","original_station_id":4,"source_type":"stored_device","source_time_kind":"source","source_at_ms":2000,"received_at_ms":2500,"quality":"valid","value_kind":"text","text_value":"standby","raw_value":"standby"},
       {"point_id":"7","binding_period_id":"stored:19","original_station_id":4,"source_type":"stored_device","source_time_kind":"source","source_at_ms":3000,"received_at_ms":3500,"quality":"invalid","value_kind":"null","raw_value":"--"}]
      """));
  }
  AnalysisJobService.Content export(int minutes)throws Exception {
    var method=AnalysisJobService.class.getDeclaredMethod("telemetryReport",long.class,AnalysisJobService.Window.class);method.setAccessible(true);
    try {return (AnalysisJobService.Content)method.invoke(service,4L,new AnalysisJobService.Window("telemetry",OffsetDateTime.parse("1970-01-01T00:00:00Z"),OffsetDateTime.parse("1970-01-01T00:01:00Z"),minutes,List.of(7L)));}
    catch(InvocationTargetException e){if(e.getCause() instanceof RuntimeException runtime)throw runtime;throw e;}
  }
  @Test void rawExportPreservesExactNumericTextMissingAndProvenance()throws Exception {
    var rows=export(0).sections().getFirst().rows();assertEquals(3,rows.size());
    assertEquals("9007199254740993.0001",rows.get(0).get("value"));assertEquals("standby",rows.get(1).get("value"));assertNull(rows.get(2).get("value"));
    assertEquals("--",rows.get(2).get("rawValue"));assertEquals("stored_device",rows.get(0).get("sourceType"));
    assertEquals(1000L,rows.get(0).get("sourceTime"));assertEquals(1500L,rows.get(0).get("receivedAt"));
    assertEquals(4L,rows.get(0).get("originalStationId"));assertNotNull(rows.get(0).get("staleReason"));
    verifyNoInteractions(ems);verify(stored,atLeast(2)).originalStation(7);
  }
  @Test void aggregatedExportKeepsAllOriginalEvidenceAndLastMissingValue()throws Exception {
    var row=export(1).sections().getFirst().rows().getFirst();assertNull(row.get("value"));
    assertEquals("stored_device",row.get("sourceType"));assertEquals(3000L,row.get("sourceTime"));
    var evidence=(List<?>)row.get("evidence");assertEquals(3,evidence.size());
    assertEquals("9007199254740993.0001",((Map<?,?>)evidence.getFirst()).get("rawValue"));
    verifyNoInteractions(ems);
  }
  @Test void movedStoredPointCannotExportUnderCurrentStation() {
    when(stored.originalStation(7)).thenReturn(5L);
    assertEquals(403,assertThrows(BusinessException.class,()->export(0)).status());
    verify(stored,never()).historyRows(anyLong(),anyLong(),anyLong());verify(access).requireStationPermission(5,"telemetry.read");
  }
  @Test void missingSupportedAggregationFailsClosed() {
    when(stored.directory(4,List.of(7L))).thenReturn(List.of(Map.of("supportedAggregations",List.of("avg"))));
    assertEquals(400,assertThrows(BusinessException.class,()->export(1)).status());
    verify(stored,never()).historyRows(anyLong(),anyLong(),anyLong());
  }
  @Test void originalStationChangedDuringReadPreventsExport() {
    when(stored.originalStation(7)).thenReturn(4L,5L);
    assertEquals(403,assertThrows(BusinessException.class,()->export(0)).status());
    verify(stored).historyRows(eq(7L),anyLong(),anyLong());
  }
}
