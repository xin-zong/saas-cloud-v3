package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api")
public class ReportTemplateController {
  private final ReportTemplateService templates;
  public ReportTemplateController(ReportTemplateService templates){this.templates=templates;}
  @GetMapping("/report-template-fields") public ApiResponse<?> fields(@RequestParam String kind){return ApiResponse.ok(templates.fields(kind));}
  @GetMapping("/report-templates") public ApiResponse<?> list(@RequestParam(required=false) String kind,@RequestParam(required=false) String timeType){return ApiResponse.ok(templates.list(kind,timeType));}
  @PostMapping("/report-templates") public ApiResponse<?> create(@RequestBody ReportTemplateService.CreateRequest request){return ApiResponse.ok(templates.create(request));}
  @PutMapping("/report-templates/{id}") public ApiResponse<?> update(@PathVariable String id,@RequestBody ReportTemplateService.UpdateRequest request){return ApiResponse.ok(templates.update(id,request));}
  @DeleteMapping("/report-templates/{id}") public ApiResponse<?> delete(@PathVariable String id,@RequestParam Long expectedVersion){templates.delete(id,expectedVersion);return ApiResponse.ok(null);}
  @PostMapping("/report-templates/{id}/clone") public ApiResponse<?> clone(@PathVariable String id,@RequestBody ReportTemplateService.CloneRequest request){return ApiResponse.ok(templates.clone(id,request));}
}
