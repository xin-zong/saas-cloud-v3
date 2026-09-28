package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class AnalysisJobController {
  private final AnalysisJobService jobs;
  public AnalysisJobController(AnalysisJobService jobs) { this.jobs = jobs; }
  @PostMapping("/stations/{id}/analysis-jobs")
  public ApiResponse<?> create(@PathVariable long id, @RequestBody AnalysisJobService.JobRequest request) {
    return ApiResponse.ok(jobs.create(id, request));
  }
  @GetMapping("/stations/{id}/analysis-jobs")
  public ApiResponse<?> list(@PathVariable long id, @RequestParam(required=false) String kind,
      @RequestParam(defaultValue="50") int limit, @RequestParam(defaultValue="0") int offset) {
    return ApiResponse.ok(jobs.list(id, kind, limit, offset));
  }
  @GetMapping("/analysis-jobs/{id}")
  public ApiResponse<?> preview(@PathVariable UUID id) { return ApiResponse.ok(jobs.preview(id)); }
  @GetMapping("/analysis-jobs/{id}/download")
  public ResponseEntity<byte[]> download(@PathVariable UUID id) {
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=analysis-"+id+".csv")
        .header(HttpHeaders.CACHE_CONTROL,"no-store")
        .contentType(new MediaType("text","csv",StandardCharsets.UTF_8)).body(jobs.download(id));
  }
  @PostMapping("/analysis-jobs/{id}/retry")
  public ApiResponse<?> retry(@PathVariable UUID id) { return ApiResponse.ok(jobs.retry(id)); }
}
