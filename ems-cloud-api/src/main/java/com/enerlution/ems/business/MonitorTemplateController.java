package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/monitor/templates")
public class MonitorTemplateController {
  private final MonitorTemplateService templates;
  public MonitorTemplateController(MonitorTemplateService templates) { this.templates=templates; }
  @GetMapping public ApiResponse<?> list() { return ApiResponse.ok(templates.list()); }
  @PostMapping public ApiResponse<?> create(@RequestBody MonitorTemplateService.TemplateRequest request) { return ApiResponse.ok(templates.create(request)); }
  @PutMapping("/{id}") public ApiResponse<?> update(@PathVariable UUID id,@RequestBody MonitorTemplateService.TemplateRequest request) { return ApiResponse.ok(templates.update(id,request)); }
  @PutMapping("/{id}/pin") public ApiResponse<?> pin(@PathVariable UUID id,@RequestBody MonitorTemplateService.PinRequest request) { return ApiResponse.ok(templates.pin(id,request)); }
  @DeleteMapping("/{id}") public ApiResponse<?> delete(@PathVariable UUID id,@RequestParam Long expectedVersion) { templates.delete(id,expectedVersion); return ApiResponse.ok(null); }
  @PutMapping("/selection") public ApiResponse<?> select(@RequestBody MonitorTemplateService.SelectionRequest request) { return ApiResponse.ok(templates.select(request)); }
}
