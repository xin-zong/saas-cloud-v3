package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;

class EmsTelemetryQueriesTest {
  @Test void sourceAndArchiveAreDistinctEvidenceWithExplicitBucketPrecedence() throws Exception {
    for(String archived:List.of("1","9")) {
      var rows=json.createArrayNode();
      rows.add(json.readTree("{\"point_id\":1,\"binding_period_id\":10,\"source_at_ms\":1000,\"received_at_ms\":1001,\"source_time_kind\":\"source\",\"quality\":\"valid\",\"value_kind\":\"number\",\"number_exact\":\"1\"}"));
      var archive=rows.get(0).deepCopy();((com.fasterxml.jackson.databind.node.ObjectNode)archive).put("source_time_kind","archive").put("number_exact",archived);rows.add(archive);
      var bucket=EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst();
      assertEquals("1",bucket.get("value"));assertEquals(false,bucket.get("conflict"));
      assertEquals("source",bucket.get("selectedSourceTimeKind"));
      assertEquals("prefer_source_per_bucket_else_archive",bucket.get("selectionPolicy"));
      assertEquals(2,((List<?>)bucket.get("evidence")).size());assertEquals(1,bucket.get("excludedEvidenceCount"));
      ((com.fasterxml.jackson.databind.node.ObjectNode)rows.get(0)).put("value_kind","null").put("quality","invalid");
      assertNull(EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst().get("value"));
      rows.remove(0);assertEquals(archived,EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst().get("value"));
    }
  }
  @Test void equalTimeInDifferentBindingPeriodsDoesNotConflict()throws Exception {
    var rows=json.readTree("[{\"point_id\":1,\"binding_period_id\":10,\"source_at_ms\":1,\"source_time_kind\":\"source\",\"quality\":\"valid\",\"value_kind\":\"number\",\"number_exact\":\"1\"},{\"point_id\":1,\"binding_period_id\":11,\"source_at_ms\":1,\"source_time_kind\":\"source\",\"quality\":\"valid\",\"value_kind\":\"number\",\"number_exact\":\"3\"}]");
    var bucket=EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst();assertEquals("2",bucket.get("value"));assertEquals(false,bucket.get("conflict"));assertEquals(2,bucket.get("samples"));
  }
  final ObjectMapper json = new ObjectMapper();
  @Test void exactAverageCollapsesReceiptsAndPreservesConflicts() throws Exception {
    var rows = json.readTree("""
      [{"point_id":1,"source_at_ms":1000,"received_at_ms":1001,"source_time_kind":"source","quality":"valid","value_kind":"number","number_exact":"9007199254740993"},
       {"point_id":1,"source_at_ms":1000,"received_at_ms":1002,"source_time_kind":"source","quality":"valid","value_kind":"number","number_exact":"9007199254740993"},
       {"point_id":1,"source_at_ms":2000,"received_at_ms":2001,"source_time_kind":"source","quality":"valid","value_kind":"number","number_exact":"9007199254740995"}]
      """);
    var result=EmsTelemetryQueries.aggregate(rows,"avg",1);
    assertFalse(result.isEmpty());
    assertEquals("9007199254740994",result.getFirst().get("value"));
    assertEquals(2,result.getFirst().get("samples"));
    var conflict=json.readTree("""
      [{"point_id":1,"source_at_ms":1000,"received_at_ms":1001,"source_time_kind":"source","quality":"valid","value_kind":"number","number_exact":"1"},
       {"point_id":1,"source_at_ms":1000,"received_at_ms":1002,"source_time_kind":"source","quality":"valid","value_kind":"number","number_exact":"2"}]
      """);
    assertNull(EmsTelemetryQueries.aggregate(conflict,"avg",1).getFirst().get("value"));
    assertEquals(true,EmsTelemetryQueries.aggregate(conflict,"avg",1).getFirst().get("conflict"));
  }
  @Test void rejectsOpaqueAverageAndUndefinedResetDelta() throws Exception {
    var text=json.readTree("[{\"source_at_ms\":1,\"received_at_ms\":2,\"quality\":\"valid\",\"value_kind\":\"text\",\"text_value\":\"1.02\"}]");
    assertEquals(400,assertThrows(BusinessException.class,()->EmsTelemetryQueries.aggregate(text,"avg",1)).status());
    assertEquals("1.02",EmsTelemetryQueries.aggregate(text,"last",1).getFirst().get("value"));
    assertEquals(400,assertThrows(BusinessException.class,()->EmsTelemetryQueries.aggregate(text,"sum",1)).status());
  }
  @Test void unknownSourceTimeIsNeverReceiptTime() throws Exception {
    var rows=json.readTree("[{\"source_at_ms\":null,\"received_at_ms\":12345,\"quality\":\"invalid\",\"value_kind\":\"null\"}]");
    assertTrue(EmsTelemetryQueries.aggregate(rows,"last",1).isEmpty());
    assertNull(EmsTelemetryQueries.observation(rows.get(0)).get("sourceTime"));
    assertEquals(12345L,EmsTelemetryQueries.observation(rows.get(0)).get("receivedAt"));
    assertNull(EmsTelemetryQueries.observation(rows.get(0)).get("value"));
  }
  @Test void lastPreservesTheActualLatestInvalidNullAndStaleSourceSample()throws Exception {
    var rows=json.readTree("""
      [{"point_id":1,"source_at_ms":1000,"received_at_ms":1001,"quality":"valid","value_kind":"number","number_exact":"42"},
       {"point_id":1,"source_at_ms":2000,"received_at_ms":2001,"quality":"invalid","value_kind":"null"}]
      """);
    var last=EmsTelemetryQueries.aggregate(rows,"last",1).getFirst();
    assertNull(last.get("value"));assertEquals("invalid",last.get("quality"));
    assertEquals(2000L,last.get("sourceTime"));assertEquals(2001L,last.get("receivedAt"));
    assertEquals("42",EmsTelemetryQueries.aggregate(rows,"avg",1).getFirst().get("value"));
    var stale=json.readTree("""
      [{"point_id":1,"source_at_ms":1000,"received_at_ms":1001,"quality":"valid","value_kind":"text","text_value":"1.02"},
       {"point_id":1,"source_at_ms":2000,"received_at_ms":2001,"quality":"stale","value_kind":"text","text_value":"1.03"}]
      """);
    assertEquals("1.03",EmsTelemetryQueries.aggregate(stale,"last",1).getFirst().get("value"));
    assertEquals("stale",EmsTelemetryQueries.aggregate(stale,"last",1).getFirst().get("quality"));
  }
}
