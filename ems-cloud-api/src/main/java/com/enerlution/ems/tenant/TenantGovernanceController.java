package com.enerlution.ems.tenant;

import com.enerlution.ems.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/company")
public class TenantGovernanceController {
  @GetMapping("/grant-members")
  public ApiResponse<?> grantMembers(
      @RequestParam(required = false) String query,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "20") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    return ApiResponse.ok(grants.members(query, status, limit, offset));
  }

  private final PeopleService people;
  private final TenantRoleService roles;
  private final TenantGrantService grants;

  public TenantGovernanceController(
      PeopleService people, TenantRoleService roles, TenantGrantService grants) {
    this.people = people;
    this.roles = roles;
    this.grants = grants;
  }

  public record Status(@NotNull Boolean enabled, Long replacementUserId) {}

  public record Remove(Long replacementUserId) {}

  public record Language(@Pattern(regexp = "en|zh-CN") String language) {}

  @GetMapping("/people")
  public ApiResponse<?> people(
      @RequestParam(required = false) String query,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String role,
      @RequestParam(defaultValue = "20") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    return ApiResponse.ok(people.list(query, status, role, limit, offset));
  }

  @GetMapping("/people/role-options")
  public ApiResponse<?> peopleRoleOptions() {
    return ApiResponse.ok(people.roleOptions());
  }

  @GetMapping("/people/{id}")
  public ApiResponse<?> person(@PathVariable long id) {
    return ApiResponse.ok(people.detail(id));
  }

  @PostMapping("/people")
  public ApiResponse<?> invite(@Valid @RequestBody PeopleService.Invite b) {
    return ApiResponse.ok(people.invite(b));
  }

  @PutMapping("/people/{id}")
  public ApiResponse<?> edit(@PathVariable long id, @Valid @RequestBody PeopleService.Edit b) {
    people.edit(id, b);
    return ApiResponse.ok(null);
  }

  @PostMapping("/people/{id}/reinvite")
  public ApiResponse<?> reinvite(@PathVariable long id, @Valid @RequestBody Language b) {
    people.reinvite(id, b.language());
    return ApiResponse.ok(Map.of("mailStatus", "pending"));
  }

  @GetMapping("/people/{id}/transfer-options")
  public ApiResponse<?> transfer(@PathVariable long id) {
    return ApiResponse.ok(people.transfers(id));
  }

  @PutMapping("/people/{id}/status")
  public ApiResponse<?> status(@PathVariable long id, @Valid @RequestBody Status b) {
    people.status(id, b.enabled() ? "active" : "disabled", b.replacementUserId());
    return ApiResponse.ok(null);
  }

  @DeleteMapping("/people/{id}")
  public ApiResponse<?> delete(@PathVariable long id, @RequestBody(required = false) Remove b) {
    people.delete(id, b == null ? null : b.replacementUserId());
    return ApiResponse.ok(null);
  }

  @GetMapping("/roles")
  public ApiResponse<?> roles() {
    return ApiResponse.ok(roles.list());
  }

  @GetMapping("/roles/options")
  public ApiResponse<?> options() {
    return ApiResponse.ok(roles.options());
  }

  @PostMapping("/roles")
  public ApiResponse<?> createRole(@Valid @RequestBody TenantRoleService.Edit b) {
    return ApiResponse.ok(Map.of("id", roles.create(b)));
  }

  @PutMapping("/roles/{id}")
  public ApiResponse<?> editRole(
      @PathVariable long id, @Valid @RequestBody TenantRoleService.Edit b) {
    roles.edit(id, b);
    return ApiResponse.ok(null);
  }

  @PutMapping("/roles/{id}/status")
  public ApiResponse<?> roleStatus(
      @PathVariable long id, @Valid @RequestBody PermissionConfigurationController.Status b) {
    roles.enabled(id, b.enabled(), b.confirmed());
    return ApiResponse.ok(null);
  }

  @DeleteMapping("/roles/{id}")
  public ApiResponse<?> deleteRole(@PathVariable long id) {
    roles.delete(id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/member-grants")
  public ApiResponse<?> grants(@RequestParam long userId) {
    return ApiResponse.ok(grants.list(userId));
  }

  @GetMapping("/member-grants/options")
  public ApiResponse<?> grantOptions() {
    return ApiResponse.ok(grants.options());
  }

  @PostMapping("/member-grants")
  public ApiResponse<?> createGrant(@Valid @RequestBody TenantGrantService.Grant b) {
    return ApiResponse.ok(Map.of("id", grants.create(b)));
  }

  @PutMapping("/member-grants/{id}")
  public ApiResponse<?> editGrant(
      @PathVariable long id, @Valid @RequestBody TenantGrantService.Grant b) {
    grants.edit(id, b);
    return ApiResponse.ok(null);
  }

  @DeleteMapping("/member-grants/{id}")
  public ApiResponse<?> revoke(@PathVariable long id) {
    grants.revoke(id);
    return ApiResponse.ok(null);
  }
}
