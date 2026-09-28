package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AnalysisJobServiceTest {
  final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
  AnalysisJobService service() {
    return new AnalysisJobService(new DomainSupport(mock(JdbcTemplate.class), mock(AccessControl.class)),
        json, mock(EmsTelemetryQueries.class));
  }
  AnalysisJobService.JobRequest request(String from, String to, Integer minutes, List<String> points) {
    return new AnalysisJobService.JobRequest("telemetry", from, to, minutes, points);
  }
  @Test void requiresOffsetAndHalfOpenIncreasingBoundedWindow() {
    assertEquals(400, assertThrows(BusinessException.class, () -> service().validate(
        request("2026-09-01T00:00:00", "2026-09-02T00:00:00Z", 0, List.of("19")))).status());
    assertThrows(BusinessException.class, () -> service().validate(
        request("2026-09-02T00:00:00Z", "2026-09-02T00:00:00Z", 0, List.of("19"))));
    assertThrows(BusinessException.class, () -> service().validate(
        request("2026-08-01T00:00:00Z", "2026-09-02T00:00:00Z", 0, List.of("19"))));
    var window = service().validate(request("2026-09-01T08:00:00+08:00", "2026-09-02T00:00:00Z", 0, List.of("19")));
    assertEquals("2026-09-01T00:00:00Z", window.from().toInstant().toString());
  }
  @Test void validatesGrainAndDeduplicatesPointIdsWithoutLosingOrderOrPrecision() {
    var result = service().validate(request("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", null,
        List.of("9007199254740993", "19", "19")));
    assertEquals(0, result.minutes());
    assertEquals(List.of(9007199254740993L, 19L), result.points());
    for (String point : List.of("0", "-1", "1 OR 1=1", "9223372036854775808"))
      assertThrows(BusinessException.class, () -> service().validate(
          request("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", 0, List.of(point))));
    assertThrows(BusinessException.class, () -> service().validate(
        request("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", 2, List.of("19"))));
    assertThrows(BusinessException.class, () -> service().validate(
        request("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", 0, List.of())));
  }
  @Test void csvEscapesFormulaWhitespaceQuotesAndPreservesExactNumericAndNull() {
    var rows = new ArrayList<Map<String,Object>>();
    var row = new LinkedHashMap<String,Object>();
    row.put("value", "9007199254740993.000000000001");
    row.put("text", " \t=HYPERLINK(\"unsafe\")"); row.put("empty", null);
    row.put("negative", new BigDecimal("-7.0001")); rows.add(row);
    var section = new AnalysisJobService.Section("Samples", List.of(
        new AnalysisJobService.Column("value", "Exact"), new AnalysisJobService.Column("text", "Text"),
        new AnalysisJobService.Column("empty", "Missing"), new AnalysisJobService.Column("negative", "Negative")), rows);
    String csv = new String(service().csv(List.of(section)), StandardCharsets.UTF_8);
    assertTrue(csv.startsWith("\ufeff"));
    assertTrue(csv.contains("\"9007199254740993.000000000001\""));
    assertTrue(csv.contains("\"' \t=HYPERLINK(\"\"unsafe\"\")\""));
    assertTrue(csv.contains(",\"\",\"-7.0001\"\r\n"));
    assertFalse(csv.contains("null"));
  }
  @Test void emptyCsvKeepsSelectedColumnsWithoutInventingSampleRow() {
    var section = new AnalysisJobService.Section("Samples", List.of(new AnalysisJobService.Column("value", "Value")), List.of());
    assertEquals("\ufeff\"Samples\"\r\n\"Value\"\r\n", new String(service().csv(List.of(section)), StandardCharsets.UTF_8));
  }
}
