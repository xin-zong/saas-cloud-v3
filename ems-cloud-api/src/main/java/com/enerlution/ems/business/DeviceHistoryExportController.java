package com.enerlution.ems.business;
import java.nio.charset.StandardCharsets;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/stations/{station}/devices/{device}/history-export")
public class DeviceHistoryExportController {
 private final DeviceHistoryExportService service;
 public DeviceHistoryExportController(DeviceHistoryExportService service){this.service=service;}
 @PostMapping public ResponseEntity<byte[]> export(@PathVariable long station,@PathVariable long device,@RequestBody DeviceHistoryExportService.Request request){
  var file=service.export(station,device,request);
  return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file.name(),StandardCharsets.UTF_8).build().toString()).header(HttpHeaders.CACHE_CONTROL,"no-store").header("X-Content-Type-Options","nosniff").body(file.bytes());
 }
}
