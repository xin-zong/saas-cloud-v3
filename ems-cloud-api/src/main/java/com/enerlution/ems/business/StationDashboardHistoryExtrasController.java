package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{station}/dashboard-history")
public class StationDashboardHistoryExtrasController {
 private final StationDashboardHistoryExtras service;
 public StationDashboardHistoryExtrasController(StationDashboardHistoryExtras service){this.service=service;}
 @GetMapping("/workbook") public ResponseEntity<byte[]> workbook(@PathVariable long station,@RequestParam String period,@RequestParam String date,@RequestParam String scene,@RequestParam List<String> fields){return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=station-history.xlsx").body(service.workbook(station,period,date,scene,fields));}
 @GetMapping("/templates") public ApiResponse<?> templates(@PathVariable long station,@RequestParam String scene){return ApiResponse.ok(service.templates(station,scene));}
 @PostMapping("/templates") public ApiResponse<?> save(@PathVariable long station,@RequestBody StationDashboardHistoryExtras.TemplateInput input){return ApiResponse.ok(service.save(station,input));}
}
