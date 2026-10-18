package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{station}/metrics")
public class StationMetricController {
 private final StationMetricService service;
 public StationMetricController(StationMetricService service){this.service=service;}
 @GetMapping("/sources") public ApiResponse<?> sources(@PathVariable long station){return ApiResponse.ok(service.sources(station));}
 @PutMapping("/sources/{metric}") public ApiResponse<?> source(@PathVariable long station,@PathVariable String metric,@RequestBody StationMetricService.SourceRequest r){return ApiResponse.ok(service.saveSource(station,metric,r));}
 @GetMapping("/offsets") public ApiResponse<?> offsets(@PathVariable long station,@RequestParam String metricKey){return ApiResponse.ok(service.offsets(station,metricKey));}
 @PutMapping("/offsets/{metric}/{kind}/{date}") public ApiResponse<?> save(@PathVariable long station,@PathVariable String metric,@PathVariable String kind,@PathVariable String date,@RequestBody StationMetricService.OffsetRequest r){return ApiResponse.ok(service.saveOffset(station,metric,kind,date,r));}
 @DeleteMapping("/offsets/{metric}/{kind}/{date}") public ApiResponse<?> revoke(@PathVariable long station,@PathVariable String metric,@PathVariable String kind,@PathVariable String date,@RequestBody StationMetricService.RevokeRequest r){return ApiResponse.ok(service.revokeOffset(station,metric,kind,date,r));}
 @PostMapping("/recalculations") public ApiResponse<?> calculate(@PathVariable long station,@RequestBody StationMetricService.RecalculateRequest r){return ApiResponse.ok(service.recalculate(station,r));}
 @GetMapping("/results") public ApiResponse<?> results(@PathVariable long station,@RequestParam String from,@RequestParam String to){return ApiResponse.ok(service.results(station,from,to));}
}
