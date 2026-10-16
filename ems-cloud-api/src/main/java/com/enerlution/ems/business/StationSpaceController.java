package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stations/{stationId}")
public class StationSpaceController {
  private final StationSpaceService spaces;
  public StationSpaceController(StationSpaceService spaces) { this.spaces=spaces; }
  @GetMapping("/spaces") public ApiResponse<?> list(@PathVariable long stationId) { return ApiResponse.ok(spaces.list(stationId)); }
  @PostMapping("/spaces") public ApiResponse<?> create(@PathVariable long stationId,@RequestBody StationSpaceService.CreateRequest request) { return ApiResponse.ok(spaces.create(stationId,request)); }
  @PutMapping("/spaces/{id}") public ApiResponse<?> rename(@PathVariable long stationId,@PathVariable UUID id,@RequestBody StationSpaceService.RenameRequest request) { return ApiResponse.ok(spaces.rename(stationId,id,request)); }
  @PutMapping("/spaces/{id}/parent") public ApiResponse<?> move(@PathVariable long stationId,@PathVariable UUID id,@RequestBody StationSpaceService.MoveRequest request) { return ApiResponse.ok(spaces.move(stationId,id,request)); }
  @DeleteMapping("/spaces/{id}") public ApiResponse<?> delete(@PathVariable long stationId,@PathVariable UUID id,@RequestParam Long expectedVersion) { spaces.delete(stationId,id,expectedVersion);return ApiResponse.ok(null); }
  @GetMapping("/space-devices") public ApiResponse<?> devices(@PathVariable long stationId,
      @RequestParam(required=false) String q,@RequestParam(required=false) UUID spaceId,
      @RequestParam(defaultValue="false") boolean unassigned,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset) {
    return ApiResponse.ok(spaces.devices(stationId,q,spaceId,unassigned,limit,offset));
  }
  @PutMapping("/spaces/{id}/devices") public ApiResponse<?> bind(@PathVariable long stationId,@PathVariable UUID id,@RequestBody StationSpaceService.BindRequest request) { return ApiResponse.ok(spaces.bind(stationId,id,request)); }
  @DeleteMapping("/spaces/{id}/devices/{deviceId}") public ApiResponse<?> unbind(@PathVariable long stationId,@PathVariable UUID id,@PathVariable String deviceId,@RequestParam Long expectedVersion) { return ApiResponse.ok(spaces.unbind(stationId,id,deviceId,expectedVersion)); }
}
