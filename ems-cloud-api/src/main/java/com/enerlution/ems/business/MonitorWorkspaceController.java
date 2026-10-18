package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/monitor/workspace")
public class MonitorWorkspaceController {
  private final MonitorWorkspaceService service;
  public MonitorWorkspaceController(MonitorWorkspaceService service){this.service=service;}
  @GetMapping public ApiResponse<?> workspace(@RequestParam Map<String,String> query){return ApiResponse.ok(service.workspace(query,false));}
  @GetMapping("/export-data") public ApiResponse<?> exportData(@RequestParam Map<String,String> query){return ApiResponse.ok(service.workspace(query,true));}
  @GetMapping("/preferences") public ApiResponse<?> preferences(){return ApiResponse.ok(service.preferences());}
  @PutMapping("/preferences") public ApiResponse<?> save(@RequestBody MonitorWorkspaceService.SavePreference body){return ApiResponse.ok(service.savePreferences(body));}
  @SuppressWarnings("unchecked") @GetMapping("/export") public ResponseEntity<String> export(@RequestParam Map<String,String> query){
    var data=service.workspace(query,true);var keys=MonitorWorkspaceRules.METRICS.stream().sorted().toList();var csv=new StringBuilder("\ufeff站点ID,站点名称,场景,通信,数据来源,源更新时间,"+String.join(",",keys)+"\r\n");
    for(var raw:(List<?>)data.get("items")){var row=(Map<String,Object>)raw;var values=new ArrayList<Object>();for(String key:List.of("id","name","scene","communication","source","updatedAt"))values.add(row.get(key));var metrics=(Map<String,Object>)row.get("metrics");keys.forEach(k->values.add(metrics.get(k)));csv.append(String.join(",",values.stream().map(ReportController::cell).toList())).append("\r\n");}
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=station-monitor.csv").contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).body(csv.toString());
  }
}
