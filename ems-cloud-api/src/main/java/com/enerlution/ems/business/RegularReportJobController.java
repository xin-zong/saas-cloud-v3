package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/regular-report-jobs")
public class RegularReportJobController {
 private final RegularReportJobService service;
 public RegularReportJobController(RegularReportJobService service){this.service=service;}
 @PostMapping public ApiResponse<?> create(@RequestBody RegularReportJobService.Request request){return ApiResponse.ok(service.create(request));}
 @GetMapping("/capabilities") public ApiResponse<?> capabilities(){return ApiResponse.ok(service.capabilities());}
 @GetMapping public ApiResponse<?> list(@RequestParam(defaultValue="regular") String category,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(required=false) String template,@RequestParam(required=false) String type,@RequestParam(required=false) java.time.LocalDate from,@RequestParam(required=false) java.time.LocalDate to,@RequestParam(required=false) String createType){return ApiResponse.ok(service.list(category,limit,offset,template,type,from,to,createType));}
 @GetMapping("/{id}") public ApiResponse<?> query(@PathVariable UUID id){return ApiResponse.ok(service.query(id));}
 @DeleteMapping("/{id}") public ApiResponse<?> delete(@PathVariable UUID id,@RequestParam Long version){service.delete(id,version);return ApiResponse.ok(null);}
 @GetMapping("/{id}/download") public ResponseEntity<byte[]> download(@PathVariable UUID id){var file=service.download(id);return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file.name(),StandardCharsets.UTF_8).build().toString()).header(HttpHeaders.CACHE_CONTROL,"no-store").header("X-Content-Type-Options","nosniff").body(file.bytes());}
}

