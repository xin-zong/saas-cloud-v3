package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class StationTagController {
  private final StationTagService tags;
  public StationTagController(StationTagService tags) { this.tags = tags; }

  @GetMapping("/station-tags")
  public ApiResponse<?> list(@RequestParam(required=false) String q,
      @RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset) {
    return ApiResponse.ok(tags.list(q,limit,offset));
  }
  @PostMapping("/station-tags")
  public ApiResponse<?> create(@RequestBody StationTagService.TagRequest request) {
    return ApiResponse.ok(tags.create(request));
  }
  @PutMapping("/station-tags/{id}")
  public ApiResponse<?> update(@PathVariable UUID id,@RequestBody StationTagService.TagRequest request) {
    return ApiResponse.ok(tags.update(id,request));
  }
  @DeleteMapping("/station-tags/{id}")
  public ApiResponse<?> delete(@PathVariable UUID id,@RequestParam Long expectedVersion) {
    tags.delete(id,expectedVersion); return ApiResponse.ok(null);
  }
  @GetMapping("/stations/{stationId}/tags")
  public ApiResponse<?> stationTags(@PathVariable long stationId) {
    return ApiResponse.ok(tags.stationTags(stationId));
  }
  @PutMapping("/stations/{stationId}/tags")
  public ApiResponse<?> replaceStationTags(@PathVariable long stationId,@RequestBody StationTagService.BindingRequest request) {
    return ApiResponse.ok(tags.replaceStationTags(stationId,request));
  }
}
