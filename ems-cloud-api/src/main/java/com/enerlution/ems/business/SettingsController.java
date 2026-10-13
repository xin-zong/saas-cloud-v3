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
