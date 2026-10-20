package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{station}/dashboard-history")
public class StationHistoryController {
 private final StationHistoryService service;
 public StationHistoryController(StationHistoryService service){this.service=service;}
 @GetMapping public ApiResponse<?> read(@PathVariable long station,@RequestParam String period,@RequestParam String date){return ApiResponse.ok(service.read(station,period,date));}
 @GetMapping("/export") public ApiResponse<?> export(@PathVariable long station,@RequestParam String period,@RequestParam String date){return ApiResponse.ok(service.export(station,period,date));}
}
