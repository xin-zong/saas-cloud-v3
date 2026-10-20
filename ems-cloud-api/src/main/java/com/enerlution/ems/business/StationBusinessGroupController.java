package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/station-business-groups")
public class StationBusinessGroupController {
 private final StationBusinessGroupService service;
 public StationBusinessGroupController(StationBusinessGroupService service){this.service=service;}
 @GetMapping("/tree") public ApiResponse<?> tree(){return ApiResponse.ok(service.tree());}
}
