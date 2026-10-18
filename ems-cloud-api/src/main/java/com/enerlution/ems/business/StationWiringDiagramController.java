package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{stationId}/wiring-diagram")
public class StationWiringDiagramController {
 private final StationWiringDiagramService service;
 public StationWiringDiagramController(StationWiringDiagramService service){this.service=service;}
 @GetMapping public ApiResponse<?> read(@PathVariable long stationId){return ApiResponse.ok(service.read(stationId));}
 @GetMapping("/bindings") public ApiResponse<?> bindings(@PathVariable long stationId){return ApiResponse.ok(service.bindings(stationId));}
 @GetMapping("/values") public ApiResponse<?> values(@PathVariable long stationId){return ApiResponse.ok(service.values(stationId));}
 @PutMapping public ApiResponse<?> save(@PathVariable long stationId,@RequestBody StationWiringDiagramService.SaveRequest request){return ApiResponse.ok(service.save(stationId,request));}
}
