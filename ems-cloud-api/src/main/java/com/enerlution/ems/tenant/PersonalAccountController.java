package com.enerlution.ems.tenant;

import cn.dev33.satoken.stp.StpUtil;
import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.*;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me")
public class PersonalAccountController {
  private final JdbcTemplate db;
  private final TenantAuthorization auth;
  private final SessionTokens sessions;
  private final BCryptPasswordEncoder encoder;
  private final CapabilityEvents events;

  public PersonalAccountController(
      JdbcTemplate db,
      TenantAuthorization auth,
      SessionTokens sessions,
      BCryptPasswordEncoder encoder,
      CapabilityEvents events) {
    this.db = db;
    this.auth = auth;
    this.sessions = sessions;
    this.encoder = encoder;
    this.events = events;
  }

  public record Profile(@NotBlank @Size(max = 120) String name) {}

  public record Password(
      @NotBlank @Size(max = 128) String currentPassword,
      @NotBlank @Size(max = 128) String newPassword) {}

  @GetMapping("/profile")
  public ApiResponse<?> profile() {
    return ApiResponse.ok(
        db.queryForMap(
            "SELECT u.id,u.account,u.display_name,EXISTS(SELECT 1 FROM user_totp m WHERE m.user_id=u.id) mfa_enabled,t.kind,coalesce(c.name,'Enerlution Platform') tenant_name FROM app_user u JOIN tenant t ON t.id=u.tenant_id LEFT JOIN company_profile c ON c.tenant_id=t.id WHERE u.id=?",
            auth.userId()));
  }

  @PutMapping("/profile")
  @Transactional
  public ApiResponse<?> profile(@Valid @RequestBody Profile body) {
    long user = auth.userId();
    db.update("UPDATE app_user SET display_name=? WHERE id=?", body.name().trim(), user);
    db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) SELECT id,tenant_id,'account.profile.updated','Display name updated' FROM app_user WHERE id=?",
        user);
    events.changed();
    return ApiResponse.ok(null);
  }

  @PutMapping("/password")
  @Transactional
  public ApiResponse<?> password(@Valid @RequestBody Password body) {
    long user = auth.userId();
    ActivationService.validatePassword(body.newPassword());
    String hash =
        db.queryForObject(
            "SELECT password_hash FROM app_user WHERE id=? FOR UPDATE", String.class, user);
    if (!encoder.matches(body.currentPassword(), hash))
      throw new BusinessException(400, "Current password is incorrect");
    db.update(
        "UPDATE app_user SET password_hash=? WHERE id=?", encoder.encode(body.newPassword()), user);
    db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) SELECT id,tenant_id,'account.password.updated','All device sessions revoked' FROM app_user WHERE id=?",
        user);
    sessions.revokeAll(user);
    events.changed();
    return ApiResponse.ok(null);
  }

  @GetMapping(value = "/capabilities/events", produces = "text/event-stream")
  public org.springframework.web.servlet.mvc.method.annotation.SseEmitter events(
      HttpServletResponse response) {
    long user = auth.userId();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Accel-Buffering", "no");
    return events.subscribe(user, StpUtil.getTokenValue());
  }

  @GetMapping("/capabilities")
  public ApiResponse<?> capabilities() {
    return ApiResponse.ok(auth.snapshot(auth.client()));
  }
}
