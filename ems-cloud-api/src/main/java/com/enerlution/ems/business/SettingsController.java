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
  public ApiResponse<?> members() {
    s.access.requirePermission("member.manage");
    return ApiResponse.ok(
        s.db.queryForList(
            """
WITH RECURSIVE branch AS (
  SELECT o.id FROM organization o JOIN app_user actor ON actor.organization_id=o.id WHERE actor.id=?
  UNION ALL SELECT child.id FROM organization child JOIN branch parent ON child.parent_id=parent.id
) SELECT u.id,u.account,u.display_name,u.enabled,u.organization_id
  FROM app_user u JOIN branch b ON b.id=u.organization_id ORDER BY u.id
""",
            s.access.userId()));
  }

  @GetMapping("/organizations")
  public ApiResponse<?> organizations() {
    s.access.requirePermission("member.manage");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT o.* FROM organization o JOIN app_user u ON u.organization_id=o.id WHERE u.id=?",
            s.access.userId()));
  }

  @GetMapping("/roles")
  public ApiResponse<?> roles() {
    s.access.requirePermission("member.manage");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT r.id,r.code,r.name FROM app_role r JOIN user_role ur ON ur.role_id=r.id WHERE"
                + " ur.user_id=? ORDER BY r.id",
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
