package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/regular-reports")
public class RegularReportConfigController {
 private final RegularReportConfigService service;
 public RegularReportConfigController(RegularReportConfigService service){this.service=service;}
 @GetMapping("/fields") public ApiResponse<?> catalog(){return ApiResponse.ok(service.catalog());}
 @GetMapping("/{category}") public ApiResponse<?> list(@PathVariable String category){return ApiResponse.ok(service.list(category));}
 @PostMapping("/template") public ApiResponse<?> createTemplate(@RequestBody RegularReportConfigService.TemplateDraft draft){return ApiResponse.ok(service.saveTemplate(null,draft));}
 @PutMapping("/template/{id}") public ApiResponse<?> updateTemplate(@PathVariable String id,@RequestBody RegularReportConfigService.TemplateDraft draft){return ApiResponse.ok(service.saveTemplate(id,draft));}
 @PostMapping("/task") public ApiResponse<?> createTask(@RequestBody RegularReportConfigService.TaskDraft draft){return ApiResponse.ok(service.saveTask(null,draft));}
 @PutMapping("/task/{id}") public ApiResponse<?> updateTask(@PathVariable String id,@RequestBody RegularReportConfigService.TaskDraft draft){return ApiResponse.ok(service.saveTask(id,draft));}
 @DeleteMapping("/{category}/{id}") public ApiResponse<?> delete(@PathVariable String category,@PathVariable String id,@RequestParam Long version){service.delete(category,id,version);return ApiResponse.ok(null);}
}
