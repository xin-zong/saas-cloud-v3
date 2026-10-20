package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/monitor/devices")
public class ReferenceDeviceListController {
 private final ReferenceDeviceListService service;
 public ReferenceDeviceListController(ReferenceDeviceListService service){this.service=service;}
 @GetMapping public ApiResponse<?> list(@RequestParam(required=false) Long stationId,@RequestParam(required=false) String businessGroupId){return ApiResponse.ok(service.list(stationId,false,null,businessGroupId));}
 @GetMapping("/export-data") public ApiResponse<?> export(@RequestParam(required=false) Long stationId,@RequestParam(required=false) java.util.List<Long> deviceIds,@RequestParam(required=false) String businessGroupId){return ApiResponse.ok(service.list(stationId,true,deviceIds,businessGroupId));}
}
