package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StoredDeviceTelemetryServiceTest {
  final JdbcTemplate jdbc=mock(JdbcTemplate.class);
  final ObjectMapper json=new ObjectMapper();
  final StoredDeviceTelemetryService service=new StoredDeviceTelemetryService(jdbc,json,
      Clock.fixed(Instant.ofEpochMilli(200000),ZoneOffset.UTC));
  Map<String,Object> sample(String quality,String value,String raw,long source,long receipt) {
    var row=new HashMap<String,Object>();
    row.put("point_id",7L);row.put("source_at_ms",source);row.put("received_at_ms",receipt);
    row.put("sample_quality",quality);row.put("number_exact",value);row.put("raw_value",raw);
    row.put("semantic_key","soc");row.put("device_id",3L);row.put("name","SOC");row.put("unit","%");
    row.put("reference_point_id",19L);row.put("station_id",4L);
    return row;
  }
  @Test void exactNumberRetainsSourceAndReceiptAndCannotBeRefreshedByRecentImport() {
    var out=service.observation(sample("observed","9007199254740993.0001","9007199254740993.0001",1000,199999));
    assertEquals("9007199254740993.0001",out.get("value"));
    assertEquals(1000L,out.get("sourceTime"));assertEquals(199999L,out.get("receivedAt"));
    assertEquals("source_older_than_90_seconds",out.get("staleReason"));
    assertEquals("valid",out.get("quality"));assertEquals("stored_device",out.get("source"));
    assertEquals("device",out.get("namespace"));assertEquals("stored:19",out.get("bindingPeriodId"));
    assertEquals("soc",out.get("semanticKey"));
  }
  @Test void textMissingAndFreshValuesStayTyped() {
    var text=service.observation(sample("text",null,"standby",199000,199999));
    assertEquals("text",text.get("valueType"));assertEquals("standby",text.get("value"));assertNull(text.get("staleReason"));
    var missing=service.observation(sample("missing",null,"--",199000,199999));
    assertEquals("invalid",missing.get("quality"));assertEquals("null",missing.get("valueType"));assertNull(missing.get("value"));
    assertEquals("--",missing.get("rawValue"));
  }
  @Test void rawRowsRemainCompatibleWithExactAggregation() {
    var rows=json.createArrayNode();
    rows.add(service.rawRow(sample("observed","9007199254740993","9007199254740993",1000,1100)));
    rows.add(service.rawRow(sample("observed","9007199254740995","9007199254740995",2000,2100)));
    assertEquals("9007199254740994",EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst().get("value"));
    rows.add(service.rawRow(sample("missing",null,"--",3000,3100)));
    assertNull(EmsTelemetryQueries.aggregate(rows,"last",1).getFirst().get("value"));
    assertEquals(4L,rows.get(0).path("original_station_id").longValue());
  }
  @Test void futureTimesAreNotFresh() {
    assertEquals("future_source_time",service.observation(sample("observed","1","1",200001,200001)).get("staleReason"));
    assertEquals("future_receipt_time",service.observation(sample("observed","1","1",199999,200001)).get("staleReason"));
  }
  @Test void conflictingSourceValuesKeepLastRawEvidenceButCannotTriggerAnAlarmOrNumericAggregate() {
    var conflicting=sample("observed","42.123","42.123",199000,199999);conflicting.put("sample_conflict",true);
    var observation=service.observation(conflicting);
    assertEquals("invalid",observation.get("quality"));assertNull(observation.get("value"));
    assertEquals(true,observation.get("conflict"));assertEquals("42.123",observation.get("rawValue"));
    assertEquals("conflicting_source_values",observation.get("staleReason"));
    var rows=json.createArrayNode().add(service.rawRow(conflicting));
    assertEquals(true,rows.get(0).path("conflict").asBoolean());
    assertNull(EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst().get("value"));
  }
  @Test void directoryOnlyAllowsContinuousNumericAggregations() {
    var counter=sample("observed","1","1",1000,1500);counter.put("unit","kWh");counter.put("has_number",true);
    var text=sample("text",null,"ready",1000,1500);text.put("has_text",true);text.put("has_number",true);
    var numeric=sample("observed","1","1",1000,1500);numeric.put("has_number",true);
    when(jdbc.queryForList(anyString(),eq(4L))).thenReturn(List.of(counter,text,numeric));
    var directory=service.directory(4,List.of());
    assertEquals(List.of("last"),directory.get(0).get("supportedAggregations"));
    assertEquals(List.of("last"),directory.get(1).get("supportedAggregations"));
    assertEquals("text",directory.get(1).get("valueType"));
    assertEquals(List.of("last","avg","min","max"),directory.get(2).get("supportedAggregations"));
    assertEquals(7L,directory.get(2).get("measurement_point_id"));
    assertEquals("ems",directory.get(2).get("source"));assertEquals("stored_device",directory.get(2).get("sourceType"));
  }
  @Test void emptySelectionReadsOnlyTheSpecifiedOriginalStation() {
    when(jdbc.queryForList(anyString(),eq(4L))).thenReturn(List.of());
    assertTrue(service.latest(4,List.of()).isEmpty());
    verify(jdbc).queryForList(argThat((String sql)->sql.contains("WHERE b.station_id=?")
        &&sql.contains("d.station_id=b.station_id")&&!sql.contains("measurement_point_id IN")),eq(4L));
  }
  @Test void historyUsesHalfOpenRangeAndLatestReceiptForSameSourceTime() {
    when(jdbc.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(sample("text",null,"ready",1000,1500)));
    var rows=service.historyRows(7,1000,2000);
    assertEquals("ready",rows.get(0).path("text_value").asText());
    verify(jdbc).queryForList(argThat((String sql)->sql.contains("DISTINCT ON (s.source_at)")
        && sql.contains("s.captured_at DESC,s.id DESC") && sql.contains("s.source_at>=?") && sql.contains("s.source_at<?")),
        eq(7L),eq(java.sql.Timestamp.from(Instant.ofEpochMilli(1000))),eq(java.sql.Timestamp.from(Instant.ofEpochMilli(2000))));
  }
}
