package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/alarm-rules")
public class AlarmRuleController {
 private final AlarmRuleService service;
 public AlarmRuleController(AlarmRuleService service){this.service=service;}
 @GetMapping public ApiResponse<?> list(@RequestParam(required=false) Long stationId){return ApiResponse.ok(service.list(stationId));}
 @GetMapping("/{id}") public ApiResponse<?> detail(@PathVariable long id){return ApiResponse.ok(service.detail(id));}
 @GetMapping("/{id}/history") public ApiResponse<?> history(@PathVariable long id){return ApiResponse.ok(service.history(id));}
 @GetMapping("/{id}/evaluations") public ApiResponse<?> evaluations(@PathVariable long id,@RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="0") int offset){return ApiResponse.ok(service.evaluations(id,limit,offset));}
 @GetMapping("/options") public ApiResponse<?> options(@RequestParam long stationId){return ApiResponse.ok(service.options(stationId));}
 @PostMapping public ApiResponse<?> create(@RequestBody AlarmRuleService.Draft request){return ApiResponse.ok(service.create(request));}
 @PutMapping("/{id}") public ApiResponse<?> update(@PathVariable long id,@RequestBody AlarmRuleService.Draft request){return ApiResponse.ok(service.update(id,request));}
 public record Toggle(@Positive long expectedVersion,@NotNull Boolean enabled){}
 public record Version(@Positive long expectedVersion){}
 @PostMapping("/{id}/enabled") public ApiResponse<?> toggle(@PathVariable long id,@Valid @RequestBody Toggle request){return ApiResponse.ok(service.toggle(id,request.expectedVersion(),request.enabled()));}
 @DeleteMapping("/{id}") public ApiResponse<?> delete(@PathVariable long id,@Valid @RequestBody Version request){service.delete(id,request.expectedVersion());return ApiResponse.ok(null);}
}
