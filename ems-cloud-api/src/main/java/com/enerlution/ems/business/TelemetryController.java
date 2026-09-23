package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class TelemetryController {
  private final DomainSupport s;
  private final ObjectMapper json;
  private final String url, user, password, database;
  private final HttpClient client =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  public TelemetryController(
      DomainSupport s,
      ObjectMapper json,
      @Value("${ems.clickhouse.url}") String url,
      @Value("${ems.clickhouse.username}") String user,
      @Value("${ems.clickhouse.password}") String password,
      @Value("${EMS_CH_DATABASE:ems_cloud_v2_proto_telemetry}") String database) {
    this.s = s;
    this.json = json;
    this.url = url;
    this.user = user;
    this.password = password;
    this.database = database;
    if (!database.equals("ems_cloud_v2_proto_telemetry"))
      throw new IllegalArgumentException("Only new telemetry database is permitted");
  }

  @GetMapping("/points/{id}/history")
  public ApiResponse<?> history(
      @PathVariable long id,
      @RequestParam OffsetDateTime from,
      @RequestParam OffsetDateTime to,
      @RequestParam(defaultValue = "15") int minutes) {
    var point =
        s.one(
            "SELECT d.station_id FROM measurement_point p JOIN device d ON d.id=p.device_id WHERE"
                + " p.id=?",
            id);
    s.access.requireStationPermission(s.number(point, "station_id"), "telemetry.read");
    if (!Set.of(1, 5, 15, 30, 60).contains(minutes)
        || !to.isAfter(from)
        || Duration.between(from, to).compareTo(Duration.ofDays(31)) > 0)
      throw new BusinessException(400, "查询应为 31 天内有效时段，粒度为 1/5/15/30/60 分钟");
    long until = Math.min(to.toInstant().toEpochMilli(), Instant.now().toEpochMilli());
    if (until <= from.toInstant().toEpochMilli()) return ApiResponse.ok(List.of());
    String sql =
        "SELECT toUnixTimestamp64Milli(toDateTime64(toStartOfInterval(sampled_at, INTERVAL "
            + minutes
            + " MINUTE),3,'UTC')) AS timestamp,avg(value) AS value,count() AS samples FROM "
            + database
            + ".measurement_sample FINAL WHERE point_id="
            + id
            + " AND sampled_at>=fromUnixTimestamp64Milli("
            + from.toInstant().toEpochMilli()
            + ") AND sampled_at<fromUnixTimestamp64Milli("
            + until
            + ") GROUP BY timestamp ORDER BY timestamp LIMIT 44640 FORMAT JSON";
    return ApiResponse.ok(query(sql));
  }

  private Object query(String sql) {
    try {
      var request =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(15))
              .header(
                  "Authorization",
                  "Basic "
                      + Base64.getEncoder()
                          .encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8)))
              .header("Content-Type", "text/plain; charset=utf-8")
              .POST(HttpRequest.BodyPublishers.ofString(sql))
              .build();
      var response = client.send(request, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() != 200) throw new BusinessException(503, "历史数据服务暂不可用");
      return json.readTree(response.body()).get("data");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new BusinessException(503, "历史数据查询已中断");
    } catch (BusinessException e) {
      throw e;
    } catch (Exception e) {
      throw new BusinessException(503, "历史数据服务暂不可用");
    }
  }
}
