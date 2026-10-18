package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{stationId}")
public class SubstationController {
 private final SubstationService service;
 public SubstationController(SubstationService service){this.service=service;}
 @GetMapping("/substation-capabilities") public ApiResponse<?> capabilities(@PathVariable long stationId){return ApiResponse.ok(service.capabilities(stationId));}
 @GetMapping("/substations") public ApiResponse<?> list(@PathVariable long stationId){return ApiResponse.ok(service.list(stationId));}
 @PostMapping("/substations") public ApiResponse<?> create(@PathVariable long stationId,@RequestBody SubstationService.Request request){return ApiResponse.ok(service.create(stationId,request));}
 @GetMapping("/substations/{id}") public ApiResponse<?> detail(@PathVariable long stationId,@PathVariable UUID id){return ApiResponse.ok(service.detail(stationId,id));}
 @PutMapping("/substations/{id}") public ApiResponse<?> update(@PathVariable long stationId,@PathVariable UUID id,@RequestBody SubstationService.Request request){return ApiResponse.ok(service.update(stationId,id,request));}
 @DeleteMapping("/substations/{id}") public ApiResponse<?> archive(@PathVariable long stationId,@PathVariable UUID id,@RequestBody SubstationService.DeleteRequest request){service.archive(stationId,id,request);return ApiResponse.ok(null);}
 @GetMapping("/substation-devices") public ApiResponse<?> devices(@PathVariable long stationId){return ApiResponse.ok(service.devices(stationId));}
 @PutMapping("/substations/{id}/devices") public ApiResponse<?> replace(@PathVariable long stationId,@PathVariable UUID id,@RequestBody SubstationService.BindRequest request){return ApiResponse.ok(service.replaceDevices(stationId,id,request));}
 @GetMapping("/substations/{id}/telemetry") public ApiResponse<?> telemetry(@PathVariable long stationId,@PathVariable UUID id){return ApiResponse.ok(service.telemetry(stationId,id));}
}
