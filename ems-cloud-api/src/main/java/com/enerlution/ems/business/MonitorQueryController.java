package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/monitor")
public class MonitorQueryController {
 private final MonitorQueryService monitor;
 public MonitorQueryController(MonitorQueryService monitor){this.monitor=monitor;}
 @GetMapping("/stations") public ApiResponse<?> stations(@RequestParam(defaultValue="all")String scene,@RequestParam(defaultValue="all")String communication,@RequestParam(defaultValue="")String search){return ApiResponse.ok(monitor.stations(scene,communication,search));}
 @GetMapping("/history") public ApiResponse<?> history(@RequestParam(required=false)List<Long> stationIds,@RequestParam(defaultValue="storagePower")String metric,@RequestParam OffsetDateTime from,@RequestParam OffsetDateTime to,@RequestParam(defaultValue="60")int minutes,@RequestParam(defaultValue="false")boolean export){return ApiResponse.ok(monitor.history(stationIds==null?List.of():stationIds,metric,from,to,minutes,export));}
 @GetMapping("/history/export") public ResponseEntity<String> export(@RequestParam List<Long> stationIds,@RequestParam String metric,@RequestParam OffsetDateTime from,@RequestParam OffsetDateTime to,@RequestParam(defaultValue="60")int minutes){
  var data=monitor.history(stationIds,metric,from,to,minutes,true);var csv=new StringBuilder("\ufeffstationId,timestamp,value,unit,samples\r\n");
  for(var item:(List<?>)data.get("items")){var row=(Map<?,?>)item;csv.append(String.join(",",List.of("stationId","timestamp","value","unit","samples").stream().map(k->ReportController.cell(row.get(k))).toList())).append("\r\n");}
  return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=monitor-power-history.csv").contentType(new MediaType("text","csv",java.nio.charset.StandardCharsets.UTF_8)).body(csv.toString());
 }
}
