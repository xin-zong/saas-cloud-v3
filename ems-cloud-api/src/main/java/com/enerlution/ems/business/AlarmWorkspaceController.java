package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/alarms/workspace")
public class AlarmWorkspaceController {
  private final AlarmWorkspaceService service;
  public AlarmWorkspaceController(AlarmWorkspaceService service){this.service=service;}
  @GetMapping public ApiResponse<?> list(@RequestParam(required=false) Long stationId,@RequestParam(defaultValue="all") String view,@RequestParam(required=false) String source,@RequestParam(required=false) String severity,@RequestParam(required=false) Long deviceId,@RequestParam(required=false) String readFlag,@RequestParam(required=false) String query,@RequestParam(required=false) OffsetDateTime start,@RequestParam(required=false) OffsetDateTime end,@RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="desc") String sort){return ApiResponse.ok(service.list(stationId,view,source,severity,deviceId,readFlag,query,start,end,limit,offset,sort));}
  @GetMapping("/summary") public ApiResponse<?> summary(@RequestParam(required=false) Long stationId,@RequestParam(defaultValue="history") String view,@RequestParam String source,@RequestParam(required=false) Long deviceId,@RequestParam(required=false) String readFlag,@RequestParam(required=false) String query,@RequestParam(required=false) OffsetDateTime start,@RequestParam(required=false) OffsetDateTime end,@RequestParam(defaultValue="UTC") String timezone,@RequestParam(defaultValue="DAY") String granularity){return ApiResponse.ok(service.summary(stationId,view,source,deviceId,readFlag,query,start,end,timezone,granularity,false));}
  @GetMapping("/export") public ApiResponse<?> exportRows(@RequestParam(required=false) Long stationId,@RequestParam String view,@RequestParam String source,@RequestParam(required=false) String severity,@RequestParam(required=false) Long deviceId,@RequestParam(required=false) String readFlag,@RequestParam(required=false) String query,@RequestParam OffsetDateTime start,@RequestParam OffsetDateTime end,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="desc") String sort){return ApiResponse.ok(service.exportRows(stationId,view,source,severity,deviceId,readFlag,query,start,end,limit,offset,sort));}
  @GetMapping("/export/trend") public ApiResponse<?> exportTrend(@RequestParam(required=false) Long stationId,@RequestParam(defaultValue="history") String view,@RequestParam String source,@RequestParam(required=false) String severity,@RequestParam(required=false) Long deviceId,@RequestParam(required=false) String readFlag,@RequestParam(required=false) String query,@RequestParam OffsetDateTime start,@RequestParam OffsetDateTime end,@RequestParam(defaultValue="UTC") String timezone,@RequestParam(defaultValue="DAY") String granularity){return ApiResponse.ok(service.summary(stationId,view,source,deviceId,readFlag,query,start,end,timezone,granularity,true,severity));}
  @GetMapping("/{id}") public ApiResponse<?> detail(@PathVariable long id){return ApiResponse.ok(service.detail(id));}
  public record Read(@NotEmpty @Size(max=200) List<@NotNull Long> ids){}
  @PostMapping("/read") public ApiResponse<?> read(@Valid @RequestBody Read request){return ApiResponse.ok(service.read(request.ids()));}
  public record Action(@Positive long expectedVersion,@NotBlank @Size(max=4000) String note){}
  @PostMapping("/{id}/{action:acknowledge|note|close|delete}") public ApiResponse<?> action(@PathVariable long id,@PathVariable String action,@Valid @RequestBody Action request){return ApiResponse.ok(service.action(id,action,request.expectedVersion(),request.note()));}
}
