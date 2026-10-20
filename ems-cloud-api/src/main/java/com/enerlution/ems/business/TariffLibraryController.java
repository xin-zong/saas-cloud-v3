package com.enerlution.ems.business;
import com.enerlution.ems.common.ApiResponse;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/tariff-library")
public class TariffLibraryController {
 private final TariffLibraryService library;
 public TariffLibraryController(TariffLibraryService library){this.library=library;}
 @GetMapping public ApiResponse<?> list(){return ApiResponse.ok(library.list());}
 @GetMapping("/automatic") public ApiResponse<?> automatic(){return ApiResponse.ok(library.automatic());}
 @PostMapping public ApiResponse<?> create(@RequestBody TariffLibraryService.Request request){return ApiResponse.ok(library.save(null,request));}
 @PutMapping("/{id}") public ApiResponse<?> update(@PathVariable UUID id,@RequestBody TariffLibraryService.Request request){return ApiResponse.ok(library.save(id,request));}
}
