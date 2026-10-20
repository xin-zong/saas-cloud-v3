package com.enerlution.ems.tenant;

import com.enerlution.ems.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class CompanyApplicationController {
  private final EmailChallengeService email;
  private final CompanyApplicationService service;
  private final MailDeliveryService mail;
  private final String datacenter, publicUrl;

  public CompanyApplicationController(
      EmailChallengeService email,
      CompanyApplicationService service,
      MailDeliveryService mail,
      @Value("${ems.tenant.datacenter:apac}") String datacenter,
      @Value("${ems.tenant.public-url:}") String publicUrl) {
    this.email = email;
    this.service = service;
    this.mail = mail;
    this.datacenter = datacenter;
    this.publicUrl = publicUrl;
  }

  public record Challenge(
      @NotBlank @Email @Size(max = 254) String email,
      @Pattern(regexp = "en|zh-CN") String language) {}

  public record Verify(
      @NotNull UUID challengeId, @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {}

  public record ChallengeStatus(
      @NotNull UUID challengeId, @NotBlank @Email @Size(max = 254) String email) {}

  public record Submit(
      @NotNull @Valid CompanyForm company,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(max = 100) String context,
      @Pattern(regexp = "en|zh-CN") String language) {}

  public record Progress(
      @NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 100) String context) {}

  public record Reject(@NotBlank @Size(max = 2000) String reason) {}

  @GetMapping("/public/environments")
  public ApiResponse<?> environments() {
    return ApiResponse.ok(
        List.of(
            Map.of(
                "code",
                datacenter,
                "url",
                publicUrl,
                "available",
                !publicUrl.isBlank(),
                "mailAvailable",
                mail.available(),
                "registrationAvailable",
                !publicUrl.isBlank() && mail.available())));
  }

  @PostMapping("/public/registration/email-challenges")
  public ApiResponse<?> challenge(@Valid @RequestBody Challenge body, HttpServletRequest request) {
    return ApiResponse.ok(
        Map.of(
            "challengeId",
            email.request(body.email(), body.language(), request.getRemoteAddr()),
            "mailStatus",
            "pending",
            "expiresInSeconds",
            600,
            "resendAfterSeconds",
            60));
  }

  @PostMapping("/public/registration/email-challenges/status")
  public ApiResponse<?> challengeStatus(@Valid @RequestBody ChallengeStatus body) {
    return ApiResponse.ok(email.status(body.challengeId(), body.email()));
  }

  @PostMapping("/public/registration/email-challenges/verify")
  public ApiResponse<?> verify(@Valid @RequestBody Verify body) {
    return ApiResponse.ok(email.verify(body.challengeId(), body.code()));
  }

  @PostMapping("/public/company-applications")
  public ApiResponse<?> submit(@Valid @RequestBody Submit body) {
    return ApiResponse.ok(
        service.submit(body.company(), body.email(), body.context(), body.language()));
  }

  @PostMapping("/public/company-applications/progress")
  public ApiResponse<?> progress(@Valid @RequestBody Progress body) {
    return ApiResponse.ok(service.progress(body.email(), body.context()));
  }

  @GetMapping("/platform/company-applications")
  public ApiResponse<?> list(
      @RequestParam(required = false) String query,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String type,
      @RequestParam(required = false) Long tag,
      @RequestParam(required = false) String address,
      @RequestParam(required = false) OffsetDateTime from,
      @RequestParam(required = false) OffsetDateTime until,
      @RequestParam(defaultValue = "20") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    return ApiResponse.ok(
        service.list(query, status, type, tag, address, from, until, limit, offset));
  }

  @GetMapping("/platform/company-applications/{id}")
  public ApiResponse<?> detail(@PathVariable long id) {
    return ApiResponse.ok(service.detail(id));
  }

  @PostMapping("/platform/company-applications/{id}/approve")
  public ApiResponse<?> approve(
      @PathVariable long id, @Valid @RequestBody CompanyApplicationService.Approve body) {
    return ApiResponse.ok(service.approve(id, body));
  }

  @PostMapping("/platform/company-applications/{id}/reject")
  public ApiResponse<?> reject(@PathVariable long id, @Valid @RequestBody Reject body) {
    service.reject(id, body.reason());
    return ApiResponse.ok(null);
  }
}
