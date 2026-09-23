package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class SettingsController {
  private final DomainSupport s;

  public SettingsController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/settings")
  public ApiResponse<?> settings() {
    var rows =
        s.db.queryForList(
            "SELECT preference_key,preference_value FROM user_preference WHERE user_id=?",
            s.access.userId());
    var result = new LinkedHashMap<String, String>();
    for (var row : rows)
      result.put((String) row.get("preference_key"), (String) row.get("preference_value"));
    return ApiResponse.ok(result);
  }

  public record Preference(
      @NotBlank @Pattern(regexp = "[a-zA-Z][a-zA-Z0-9._-]{0,79}") String key,
      @NotNull @Size(max = 4000) String value) {}

  @PutMapping("/settings")
  @Transactional
  public ApiResponse<?> setting(@Valid @RequestBody Preference n) {
    s.db.update(
        "INSERT INTO user_preference(user_id,preference_key,preference_value) VALUES(?,?,?) ON"
            + " CONFLICT(user_id,preference_key) DO UPDATE SET"
            + " preference_value=excluded.preference_value",
        s.access.userId(),
        n.key(),
        n.value());
    return ApiResponse.ok(null);
  }

  @GetMapping("/members")
  public ApiResponse<?> members(@RequestParam(defaultValue = "read") String purpose) {
    String permission =
        switch (purpose) {
          case "read" -> "organization.member.read";
          case "grants" -> "member.grant.manage";
          case "profiles" -> "member.manage.profile";
          case "organizations" -> "organization.manage";
          default -> throw new BusinessException(400, "无效的成员目录用途");
        };
    s.access.requirePermission(permission);
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT"
                + " u.id,u.account,u.display_name,u.enabled,u.organization_id,u.management_organization_id"
                + (Set.of("read", "profiles").contains(purpose) ? ",u.email" : "")
                + """

FROM app_user u JOIN effective_organization_permission p ON p.organization_id=u.management_organization_id
WHERE p.user_id=? AND p.permission_code=?
 AND (u.organization_id IS NULL OR EXISTS(SELECT 1 FROM effective_organization_permission m
  WHERE m.user_id=p.user_id AND m.organization_id=u.organization_id AND m.permission_code=?))
ORDER BY u.id""",
            s.access.userId(),
            permission,
            permission));
  }

  @GetMapping("/organizations")
  public ApiResponse<?> organizations() {
    s.access.requirePermission("organization.member.read");
    return ApiResponse.ok(
        new OrganizationWorkflows(s).directory("organization.member.read", true, false));
  }

  @GetMapping("/roles")
  public ApiResponse<?> roles() {
    s.access.requirePermission("organization.member.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT r.id,r.code,r.name FROM app_role r JOIN effective_organization_permission ur ON"
                + " ur.organization_id=r.organization_id WHERE ur.user_id=? AND"
                + " ur.permission_code='organization.member.read' ORDER BY r.id",
            s.access.userId()));
  }

  @GetMapping("/audit")
  public ApiResponse<?> audit(
      @RequestParam(defaultValue = "100") int limit, @RequestParam(defaultValue = "0") int offset) {
    s.access.requirePermission("audit.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT a.* FROM audit_event a WHERE a.actor_id=? ORDER BY a.id DESC LIMIT ? OFFSET ?",
            s.access.userId(),
            s.limit(limit),
            s.offset(offset)));
  }
}
