package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Read-only generated history: no fixtures are inserted into a business database. */
@EnabledIfEnvironmentVariable(named="EMS_LATEST_TEST_CH_URL",matches=".+")
class EmsLatestReadOnlyClickHouseTest {
  @Test void latestKeepsWholeNullableRowAndDeterministicTieAcrossLargeHistory() {
    var queries=new EmsTelemetryQueries(new ObjectMapper(),System.getenv("EMS_LATEST_TEST_CH_URL"),
        System.getenv("EMS_LATEST_TEST_CH_USER"),System.getenv("EMS_LATEST_TEST_CH_PASSWORD")) {
      @Override JsonNode query(String sql) {
        String fixture="""
          (SELECT toInt64(19) AS point_id,toInt64(if(number=2000003,3,2)) AS binding_period_id,
          toString(number) AS fact_id,if(number=2000002,'important_history','cabinet_30s') AS source_type,
          'source' AS source_time_kind,if(number=2000001,NULL,toNullable(toInt64(number))) AS source_at_ms,
          toInt64(if(number=2000001,2000000,number)) AS received_at_ms,
          if(number=2000001,'invalid','valid') AS quality,
          if(number=2000001,'null','number') AS value_kind,
          if(number=2000001,NULL,toNullable('9007199254740993.00000000001')) AS number_exact,
          CAST(NULL AS Nullable(String)) AS text_value,CAST([] AS Array(UInt16)) AS u16_words
          FROM numbers(2000004))
          """;
        return super.query(sql.replace(database+"."+observationTable,fixture));
      }
    };
    var rows=queries.latest(List.of(2L),List.of(19L));
    assertEquals(1,rows.size());
    var row=rows.getFirst();
    assertEquals("2",row.get("bindingPeriodId"));
    assertEquals("cabinet_30s",row.get("source"));
    assertEquals("invalid",row.get("quality"));
    assertEquals(2000000L,row.get("receivedAt"));
    assertNull(row.get("sourceTime"));
    assertNull(row.get("value"));
  }
}
