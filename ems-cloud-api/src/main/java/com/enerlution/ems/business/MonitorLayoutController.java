package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/monitor/layout")
public class MonitorLayoutController {
 private final MonitorLayoutService layouts;public MonitorLayoutController(MonitorLayoutService layouts){this.layouts=layouts;}
 @GetMapping public ApiResponse<?> get(@RequestParam(required=false)UUID templateId){return ApiResponse.ok(layouts.get(templateId));}
 @PutMapping public ApiResponse<?> save(@RequestParam(required=false)UUID templateId,@RequestBody MonitorLayoutService.Request request){return ApiResponse.ok(layouts.save(templateId,request));}
}
