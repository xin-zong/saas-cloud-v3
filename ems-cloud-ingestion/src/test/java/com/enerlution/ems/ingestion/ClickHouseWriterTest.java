package com.enerlution.ems.ingestion;

import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.net.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ClickHouseWriterTest {
    @Test void boundedHttpBatchesFailWithoutClaimingSuccess() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var calls = new AtomicInteger();
        var bodies = new ArrayList<String>();
        server.createContext("/", exchange -> {
            calls.incrementAndGet();
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            assertEquals("writer", exchange.getRequestHeaders().getFirst("X-ClickHouse-User"));
            int status = calls.get() == 2 ? 503 : 200;
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
        });
        server.start();
        try {
            var writer = new ClickHouseWriter(URI.create("http://127.0.0.1:" + server.getAddress().getPort()),
                    "writer", "secret", "ems_observation", "ems_cell", 2, 1024, Duration.ofSeconds(2));
            var row = JsonNodeFactory.instance.objectNode().put("fact_id", "x");
            assertThrows(java.io.IOException.class, () -> writer.observations(List.of(row, row, row)));
            assertEquals(2, calls.get());
            assertEquals(2, bodies.get(0).lines().count());
            assertEquals(1, bodies.get(1).lines().count());
            assertThrows(IllegalArgumentException.class, () -> writer.observations(List.of(
                    JsonNodeFactory.instance.objectNode().put("large", "x".repeat(2000)))));
            assertEquals(2, calls.get(), "Oversize row must be refused before HTTP");
        } finally { server.stop(0); }
    }

    @Test void unsafeTableAndEndpointCannotBecomeSqlOrCredentialExfiltration() {
        assertThrows(IllegalArgumentException.class, () -> new ClickHouseWriter(URI.create("http://localhost:18123"),
                "u", "p", "x;DROP TABLE x", "cells", 10, 1024, Duration.ofSeconds(1)));
        assertThrows(IllegalArgumentException.class, () -> new ClickHouseWriter(URI.create("http://u:p@localhost:18123/path?query=x"),
                "u", "p", "facts", "cells", 10, 1024, Duration.ofSeconds(1)));
    }
}
