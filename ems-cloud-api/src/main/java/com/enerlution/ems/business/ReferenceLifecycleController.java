package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/reference-lifecycle")
public class ReferenceLifecycleController {
 private final ReferenceLifecycleService service;
 public ReferenceLifecycleController(ReferenceLifecycleService service){this.service=service;}
 @GetMapping("/options") public ApiResponse<?> options(){return ApiResponse.ok(service.options());}
 @GetMapping("/stations/{id}") public ApiResponse<?> station(@PathVariable long id){return ApiResponse.ok(service.station(id));}
 @PostMapping("/stations") public ApiResponse<?> createStation(@RequestBody Map<String,Object>b){return ApiResponse.ok(service.createStation(b));}
 @PutMapping("/stations/{id}") public ApiResponse<?> updateStation(@PathVariable long id,@RequestBody Map<String,Object>b){return ApiResponse.ok(service.updateStation(id,b));}
 @PostMapping("/stations/{id}/archive") public ApiResponse<?> archiveStation(@PathVariable long id,@RequestBody Map<String,Object>b){return ApiResponse.ok(service.archiveStation(id,b));}
 @PostMapping("/stations/{id}/assign") public ApiResponse<?> assignStation(@PathVariable long id,@RequestBody Map<String,Object>b){return ApiResponse.ok(service.assignStation(id,b));}
 @GetMapping("/devices/{id}") public ApiResponse<?> device(@PathVariable long id){return ApiResponse.ok(service.device(id));}
 @PostMapping("/devices") public ApiResponse<?> createDevice(@RequestBody Map<String,Object>b){return ApiResponse.ok(service.createDevice(b));}
 @PutMapping("/devices/{id}") public ApiResponse<?> updateDevice(@PathVariable long id,@RequestBody Map<String,Object>b){return ApiResponse.ok(service.updateDevice(id,b));}
 @PostMapping("/devices/{id}/archive") public ApiResponse<?> archiveDevice(@PathVariable long id,@RequestBody Map<String,Object>b){return ApiResponse.ok(service.archiveDevice(id,b));}
 @PostMapping("/devices/{id}/assign") public ApiResponse<?> assignDevice(@PathVariable long id,@RequestBody Map<String,Object>b){return ApiResponse.ok(service.assignDevice(id,b));}
}
