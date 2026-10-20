package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{station}/dashboard-view")
public class StationDashboardController {
 private final StationDashboardService service;
 public StationDashboardController(StationDashboardService service){this.service=service;}
 @GetMapping public ApiResponse<?> read(@PathVariable long station,@RequestParam(required=false) UUID substationId){return ApiResponse.ok(service.read(station,substationId));}
}
