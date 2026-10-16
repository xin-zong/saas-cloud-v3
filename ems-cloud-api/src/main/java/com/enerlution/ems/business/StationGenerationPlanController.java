package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stations/{stationId}/generation-plans")
public class StationGenerationPlanController {
  private final StationGenerationPlanService plans;
  public StationGenerationPlanController(StationGenerationPlanService plans) { this.plans=plans; }
  @GetMapping public ApiResponse<?> list(@PathVariable long stationId,@RequestParam(required=false) Integer year) {
    return ApiResponse.ok(plans.list(stationId,year));
  }
  @PostMapping public ApiResponse<?> create(@PathVariable long stationId,@RequestBody StationGenerationPlanService.CreateRequest request) {
    return ApiResponse.ok(plans.create(stationId,request));
  }
  @PutMapping("/{id}") public ApiResponse<?> update(@PathVariable long stationId,@PathVariable UUID id,@RequestBody StationGenerationPlanService.UpdateRequest request) {
    return ApiResponse.ok(plans.update(stationId,id,request));
  }
  @DeleteMapping("/{id}") public ApiResponse<?> delete(@PathVariable long stationId,@PathVariable UUID id,@RequestParam Long expectedVersion) {
    plans.delete(stationId,id,expectedVersion); return ApiResponse.ok(null);
  }
}
