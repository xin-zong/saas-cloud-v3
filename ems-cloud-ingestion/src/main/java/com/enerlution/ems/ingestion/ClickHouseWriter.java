package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.io.IOException;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;

public final class ClickHouseWriter implements TelemetryConsumer.FactSink {
    private final URI endpoint;
    private final String user, password, observations, cells;
    private final int maxRows, maxBytes;
    private final Duration timeout;
    private final HttpClient client;
    public ClickHouseWriter(URI endpoint, String user, String password, String observations, String cells,
                            int maxRows, int maxBytes, Duration timeout) {
        if (endpoint == null || !List.of("http", "https").contains(endpoint.getScheme()) || endpoint.getHost() == null
                || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null
                || !(endpoint.getPath().isEmpty() || endpoint.getPath().equals("/"))
                || !table(observations) || !table(cells) || maxRows < 1 || maxRows > 10000
                || maxBytes < 128 || maxBytes > 8388608 || timeout == null || timeout.isZero() || timeout.isNegative())
            throw new IllegalArgumentException("Invalid bounded ClickHouse configuration");
        this.endpoint = endpoint; this.user = user; this.password = password;
        this.observations = observations; this.cells = cells; this.maxRows = maxRows; this.maxBytes = maxBytes; this.timeout = timeout;
        client = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(HttpClient.Redirect.NEVER).build();
    }
    private static boolean table(String name) { return name != null && name.matches("[a-zA-Z_][a-zA-Z0-9_]*(\\.[a-zA-Z_][a-zA-Z0-9_]*)?"); }
    public void observations(List<ObjectNode> rows) throws IOException, InterruptedException { write(observations, rows); }
    public void cells(List<ObjectNode> rows) throws IOException, InterruptedException { write(cells, rows); }
    private void write(String table, List<ObjectNode> rows) throws IOException, InterruptedException {
        // Validate every row before sending any partial batch. Memory stays bounded to one batch.
        for (var row : rows) if (row.toString().getBytes(StandardCharsets.UTF_8).length + 1 > maxBytes)
            throw new IllegalArgumentException("ClickHouse row exceeds bounded batch size");
        var bytes = new ByteArrayOutputStream(); int count = 0;
        for (var row : rows) {
            var encoded = (row.toString() + "\n").getBytes(StandardCharsets.UTF_8);
            if (count == maxRows || bytes.size() + encoded.length > maxBytes) {
                send(table, bytes.toByteArray()); bytes.reset(); count = 0;
            }
            bytes.writeBytes(encoded); count++;
        }
        if (count > 0) send(table, bytes.toByteArray());
    }
    private void send(String table, byte[] bytes) throws IOException, InterruptedException {
        String query = "INSERT INTO " + table + " FORMAT JSONEachRow";
        var uri = URI.create(endpoint.toString().replaceAll("/$", "") + "/?wait_end_of_query=1&query="
                + URLEncoder.encode(query, StandardCharsets.UTF_8));
        var request = HttpRequest.newBuilder(uri).timeout(timeout)
                .header("X-ClickHouse-User", user).header("X-ClickHouse-Key", password)
                .header("Content-Type", "application/x-ndjson")
                .POST(HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
        var response = client.send(request, HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() != 200) throw new IOException("ClickHouse batch failed with HTTP " + response.statusCode());
    }
}
