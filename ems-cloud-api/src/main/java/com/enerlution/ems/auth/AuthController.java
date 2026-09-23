package com.enerlution.ems.auth;

import com.enerlution.ems.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  public record LoginRequest(
      @NotBlank @Size(max = 120) String account, @NotBlank @Size(max = 72) String password) {}

  public record MfaRequest(
      @NotBlank @Size(max = 100) String challengeId, @NotBlank @Size(max = 10) String code) {}

  @PostMapping("/login")
  public ApiResponse<AuthService.LoginResult> login(
      @Valid @RequestBody LoginRequest request, HttpServletRequest http) {
    return ApiResponse.ok(auth.login(request.account(), request.password(), http.getRemoteAddr()));
  }

  @PostMapping("/mfa")
  public ApiResponse<AuthService.MfaResult> mfa(@Valid @RequestBody MfaRequest request) {
    return ApiResponse.ok(auth.mfa(request.challengeId(), request.code()));
  }

  @GetMapping("/me")
  public ApiResponse<AuthService.AuthUser> me() {
    return ApiResponse.ok(auth.me());
  }

  @PostMapping("/logout")
  public ApiResponse<Void> logout() {
    auth.logout();
    return ApiResponse.ok(null);
  }
}
