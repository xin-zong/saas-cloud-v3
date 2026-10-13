package com.enerlution.ems.tenant;

import com.enerlution.ems.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class CompanyController {
  @PostMapping("/platform/companies/{id}/reinvite-administrator")
  public ApiResponse<?> reinviteAdministrator(
      @PathVariable long id, @Valid @RequestBody TenantGovernanceController.Language b) {
    companies.reinviteAdministrator(id, b.language());
    return ApiResponse.ok(Map.of("mailStatus", "pending"));
  }

  private final CompanyService companies;

  public CompanyController(CompanyService companies) {
    this.companies = companies;
  }

  public record Packages(
      @NotEmpty @Size(max = 200) List<@Min(1) Long> packageIds, boolean confirmed) {}

  public record Tags(@NotNull @Size(max = 200) List<@Min(1) Long> tagIds) {}

  public record Tag(@NotBlank @Size(max = 60) String name) {}

  @GetMapping("/company/profile")
  public ApiResponse<?> own() {
    return ApiResponse.ok(companies.own());
  }

  @GetMapping("/platform/company-options")
  public ApiResponse<?> options() {
    return ApiResponse.ok(companies.options());
  }

  @PutMapping("/company/profile")
  public ApiResponse<?> editOwn(@Valid @RequestBody CompanyForm b) {
    companies.editOwn(b);
    return ApiResponse.ok(null);
  }

  @GetMapping("/platform/companies")
  public ApiResponse<?> list(
      @RequestParam(required = false) String query,
      @RequestParam(required = false) String type,
      @RequestParam(required = false) Boolean enabled,
      @RequestParam(required = false) Long tag,
      @RequestParam(required = false) String address,
      @RequestParam(defaultValue = "20") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    return ApiResponse.ok(companies.list(query, type, enabled, tag, address, limit, offset));
  }

  @GetMapping("/platform/companies/{id}/stations")
  public ApiResponse<?> stations(
      @PathVariable long id, @RequestParam(required = false) String query) {
    return ApiResponse.ok(companies.stations(id, query));
  }

  @GetMapping("/platform/companies/{id}/people")
  public ApiResponse<?> employees(@PathVariable long id) {
    return ApiResponse.ok(companies.employees(id));
  }

  @GetMapping("/platform/companies/{id}")
  public ApiResponse<?> detail(@PathVariable long id) {
    return ApiResponse.ok(companies.platformDetail(id));
  }

  @PutMapping("/platform/companies/{id}")
  public ApiResponse<?> edit(@PathVariable long id, @Valid @RequestBody CompanyForm b) {
    companies.editPlatform(id, b);
    return ApiResponse.ok(null);
  }

  public record Types(@NotEmpty @Size(max = 4) List<@NotBlank String> companyTypes) {}

  @PutMapping("/platform/companies/{id}/types")
  public ApiResponse<?> types(@PathVariable long id, @Valid @RequestBody Types b) {
    companies.types(id, b.companyTypes());
    return ApiResponse.ok(null);
  }

  @PutMapping("/platform/companies/{id}/packages")
  public ApiResponse<?> packages(@PathVariable long id, @Valid @RequestBody Packages b) {
    companies.packages(id, b.packageIds(), b.confirmed());
    return ApiResponse.ok(null);
  }

  @PutMapping("/platform/companies/{id}/status")
  public ApiResponse<?> status(
      @PathVariable long id, @Valid @RequestBody PermissionConfigurationController.Status b) {
    companies.status(id, b.enabled(), b.confirmed());
    return ApiResponse.ok(null);
  }

  @PutMapping("/platform/companies/{id}/tags")
  public ApiResponse<?> tags(@PathVariable long id, @Valid @RequestBody Tags b) {
    companies.tags(id, b.tagIds());
    return ApiResponse.ok(null);
  }

  @GetMapping("/platform/company-tags")
  public ApiResponse<?> tags() {
    return ApiResponse.ok(companies.tags());
  }

  @PostMapping("/platform/company-tags")
  public ApiResponse<?> createTag(@Valid @RequestBody Tag b) {
    return ApiResponse.ok(Map.of("id", companies.createTag(b.name())));
  }

  @PutMapping("/platform/company-tags/{id}")
  public ApiResponse<?> editTag(@PathVariable long id, @Valid @RequestBody Tag b) {
    companies.editTag(id, b.name());
    return ApiResponse.ok(null);
  }

  @GetMapping("/platform/company-tags/{id}/impact")
  public ApiResponse<?> impact(@PathVariable long id) {
    return ApiResponse.ok(companies.tagImpact(id));
  }

  @DeleteMapping("/platform/company-tags/{id}")
  public ApiResponse<?> deleteTag(
      @PathVariable long id, @RequestParam(defaultValue = "false") boolean confirmed) {
    companies.deleteTag(id, confirmed);
    return ApiResponse.ok(null);
  }
}
