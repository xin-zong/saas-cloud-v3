package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;

class StatePolicyTest {
    @Test void heartbeatExpiresAtExactlyNinetySeconds() {
        Instant observed = Instant.parse("2026-09-28T00:00:00Z");
        assertTrue(ConnectionState.fresh(observed, observed.plusSeconds(89)));
        assertFalse(ConnectionState.fresh(observed, observed.plusSeconds(90)));
        assertFalse(ConnectionState.fresh(observed.plusSeconds(1), observed));
        assertFalse(ConnectionState.fresh(null, observed));
    }
    @Test void immutableProjectionExcludesReadinessAndVendorButRetainsDimensions() throws Exception {
        var d = (ObjectNode)new ObjectMapper().readTree(Files.readString(Path.of("../ems-cloud-protocol/src/test/resources/telemetry/structure-matched-synthetic.json"))).get("d");
        var changed = d.deepCopy();
        ((ObjectNode)changed.path("clusters").get(0)).put("cellReady", false).put("sn", "new");
        ((ObjectNode)changed.path("clusterLayout").path("vendors")).put("bmu", "new");
        assertEquals(StructureStore.layout(d), StructureStore.layout(changed));
        ((ObjectNode)changed.path("clusterLayout").path("bms")).put("voltCount", 33);
        assertNotEquals(StructureStore.layout(d), StructureStore.layout(changed));
    }
    @Test void queryAllowlistRejectsCompatibilityAndWriteCommands() {
        assertTrue(QueryDispatcher.allowed("structure.get"));
        assertTrue(QueryDispatcher.allowed("alarm.current.get"));
        assertFalse(QueryDispatcher.allowed("communication.status.get"));
        assertFalse(QueryDispatcher.allowed("power.set"));
    }
}
