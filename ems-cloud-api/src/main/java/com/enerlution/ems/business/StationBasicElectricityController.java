package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{station}/basic-electricity")
public class StationBasicElectricityController {
 private final StationBasicElectricityService service;
 public StationBasicElectricityController(StationBasicElectricityService service){this.service=service;}
 @GetMapping public ApiResponse<?> get(@PathVariable long station){return ApiResponse.ok(service.get(station));}
 @PutMapping public ApiResponse<?> save(@PathVariable long station,@RequestBody StationBasicElectricityService.Request request){return ApiResponse.ok(service.save(station,request));}
}
