package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api")
public class TariffTemplateController {
  private final TariffTemplateService templates;private final TariffBindingService bindings;
  public TariffTemplateController(TariffTemplateService templates,TariffBindingService bindings){this.templates=templates;this.bindings=bindings;}
  @GetMapping("/tariff-templates") public ApiResponse<?> list(){return ApiResponse.ok(templates.list());}
  @GetMapping("/tariff-templates/{id}") public ApiResponse<?> get(@PathVariable UUID id){return ApiResponse.ok(templates.get(id));}
  @PostMapping("/tariff-templates") public ApiResponse<?> create(@RequestBody TariffTemplateService.CreateRequest request){return ApiResponse.ok(templates.create(request));}
  @PutMapping("/tariff-templates/{id}") public ApiResponse<?> update(@PathVariable UUID id,@RequestBody TariffTemplateService.UpdateRequest request){return ApiResponse.ok(templates.update(id,request));}
  @DeleteMapping("/tariff-templates/{id}") public ApiResponse<?> archive(@PathVariable UUID id,@RequestParam Long expectedVersion){templates.archive(id,expectedVersion);return ApiResponse.ok(null);}
  @GetMapping("/stations/{station}/tariff-bindings") public ApiResponse<?> bindings(@PathVariable long station,@RequestParam(defaultValue="false") boolean includeInactive){return ApiResponse.ok(bindings.list(station,includeInactive));}
  @PostMapping("/stations/{station}/tariff-bindings") public ApiResponse<?> bind(@PathVariable long station,@RequestBody TariffBindingService.CreateRequest request){return ApiResponse.ok(bindings.create(station,request));}
  @PutMapping("/stations/{station}/tariff-bindings/{id}") public ApiResponse<?> dates(@PathVariable long station,@PathVariable long id,@RequestBody TariffBindingService.UpdateRequest request){return ApiResponse.ok(bindings.update(station,id,request));}
  @DeleteMapping("/stations/{station}/tariff-bindings/{id}") public ApiResponse<?> unbind(@PathVariable long station,@PathVariable long id,@RequestParam Long expectedVersion){bindings.unbind(station,id,expectedVersion);return ApiResponse.ok(null);}
  @GetMapping("/stations/{station}/tariff-bindings/{id}/history") public ApiResponse<?> history(@PathVariable long station,@PathVariable long id){return ApiResponse.ok(bindings.history(station,id));}
}
