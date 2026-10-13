package com.enerlution.ems.tenant;

import com.enerlution.ems.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/platform")
public class PermissionConfigurationController {
  private final MenuManagementService menus;
  private final PermissionPackageService packages;
  private final RoleTemplateService templates;

  public PermissionConfigurationController(
      MenuManagementService menus,
      PermissionPackageService packages,
      RoleTemplateService templates) {
    this.menus = menus;
    this.packages = packages;
    this.templates = templates;
  }

  public record Status(@NotNull Boolean enabled, boolean confirmed) {}

  public record Order(@NotEmpty @Size(max = 200) List<@Min(1) Long> ids) {}

  @GetMapping("/menus")
  public ApiResponse<?> menus() {
    return ApiResponse.ok(menus.list());
  }

  @GetMapping("/permission-options")
  public ApiResponse<?> configurationOptions() {
    return ApiResponse.ok(menus.configurationOptions());
  }

  @GetMapping("/menus/options")
  public ApiResponse<?> options() {
    return ApiResponse.ok(menus.options());
  }

  @PostMapping("/menus")
  public ApiResponse<?> create(@Valid @RequestBody MenuManagementService.Edit b) {
    return ApiResponse.ok(Map.of("id", menus.create(b)));
  }

  @PutMapping("/menus/{id}")
  public ApiResponse<?> edit(
      @PathVariable long id, @Valid @RequestBody MenuManagementService.Edit b) {
    menus.edit(id, b);
    return ApiResponse.ok(null);
  }

  @DeleteMapping("/menus/{id}")
  public ApiResponse<?> deleteMenu(@PathVariable long id) {
    menus.delete(id);
    return ApiResponse.ok(null);
  }

  @PutMapping("/menus/{id}/status")
  public ApiResponse<?> status(@PathVariable long id, @Valid @RequestBody Status b) {
    menus.enabled(id, b.enabled(), b.confirmed());
    return ApiResponse.ok(null);
  }

  @GetMapping("/menus/{id}/impact")
  public ApiResponse<?> menuImpact(@PathVariable long id) {
    return ApiResponse.ok(menus.impact(id));
  }

  @PutMapping("/menus/order")
  public ApiResponse<?> order(@Valid @RequestBody Order b) {
    menus.order(b.ids());
    return ApiResponse.ok(null);
  }

  @GetMapping("/permission-packages")
  public ApiResponse<?> packages(
      @RequestParam(required = false) String query, @RequestParam(required = false) String type) {
    return ApiResponse.ok(packages.list(query, type));
  }

  @PostMapping("/permission-packages")
  public ApiResponse<?> createPackage(@Valid @RequestBody PermissionPackageService.Edit b) {
    return ApiResponse.ok(Map.of("id", packages.create(b)));
  }

  @PutMapping("/permission-packages/{id}")
  public ApiResponse<?> editPackage(
      @PathVariable long id, @Valid @RequestBody PermissionPackageService.Edit b) {
    packages.edit(id, b);
    return ApiResponse.ok(null);
  }

  @PutMapping("/permission-packages/{id}/status")
  public ApiResponse<?> packageStatus(@PathVariable long id, @Valid @RequestBody Status b) {
    packages.enabled(id, b.enabled(), b.confirmed());
    return ApiResponse.ok(null);
  }

  @GetMapping("/permission-packages/{id}/impact")
  public ApiResponse<?> packageImpact(@PathVariable long id) {
    return ApiResponse.ok(packages.impact(id));
  }

  @GetMapping("/role-templates")
  public ApiResponse<?> templates() {
    return ApiResponse.ok(templates.list());
  }

  @PostMapping("/role-templates")
  public ApiResponse<?> createTemplate(@Valid @RequestBody RoleTemplateService.Edit b) {
    return ApiResponse.ok(Map.of("id", templates.create(b)));
  }

  @PutMapping("/role-templates/{id}")
  public ApiResponse<?> editTemplate(
      @PathVariable long id, @Valid @RequestBody RoleTemplateService.Edit b) {
    templates.edit(id, b);
    return ApiResponse.ok(null);
  }

  @PutMapping("/role-templates/{id}/status")
  public ApiResponse<?> templateStatus(@PathVariable long id, @Valid @RequestBody Status b) {
    templates.enabled(id, b.enabled(), b.confirmed());
    return ApiResponse.ok(null);
  }

  @GetMapping("/role-templates/{id}/impact")
  public ApiResponse<?> templateImpact(@PathVariable long id) {
    return ApiResponse.ok(templates.impact(id));
  }
}
