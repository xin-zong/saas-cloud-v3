package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stations")
public class StationProfileController {
  private final StationProfileService profiles;
  public StationProfileController(StationProfileService profiles) { this.profiles = profiles; }
  @GetMapping("/{stationId}/profile")
  public ApiResponse<?> read(@PathVariable long stationId) {
    return ApiResponse.ok(profiles.read(stationId));
  }
}
