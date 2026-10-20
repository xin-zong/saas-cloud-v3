package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/tariff-library/configurations")
public class TariffConfigurationController {
 private final TariffConfigurationService service;
 public TariffConfigurationController(TariffConfigurationService service){this.service=service;}
 @GetMapping public ApiResponse<?> list(){return ApiResponse.ok(service.list());}
 @PostMapping public ApiResponse<?> create(@RequestBody TariffLibraryService.Request request){return ApiResponse.ok(service.save(null,request));}
 @PutMapping("/{id}") public ApiResponse<?> update(@PathVariable UUID id,@RequestBody TariffLibraryService.Request request){return ApiResponse.ok(service.save(id,request));}
 @DeleteMapping("/{id}") public ApiResponse<?> archive(@PathVariable UUID id,@RequestParam Long version){service.archive(id,version);return ApiResponse.ok(null);}
}
