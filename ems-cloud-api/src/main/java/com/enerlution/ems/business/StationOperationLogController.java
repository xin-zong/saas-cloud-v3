package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.time.Instant;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stations/{stationId}/operation-logs")
public class StationOperationLogController {
  private final StationOperationLogService logs;
  public StationOperationLogController(StationOperationLogService logs) {this.logs=logs;}
  @GetMapping public ApiResponse<?> list(@PathVariable long stationId,
      @RequestParam(required=false) String content,@RequestParam(required=false) String actor,
      @RequestParam(required=false) String channel,@RequestParam(required=false) String ip,
      @RequestParam(required=false) Instant from,@RequestParam(required=false) Instant to,
      @RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="0") int offset) {
    return ApiResponse.ok(logs.list(stationId,content,actor,channel,ip,from,to,limit,offset));
  }
}
