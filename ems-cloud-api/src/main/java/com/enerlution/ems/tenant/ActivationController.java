package com.enerlution.ems.tenant;

import com.enerlution.ems.common.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/activations")
public class ActivationController {
  private final ActivationService service;

  public ActivationController(ActivationService service) {
    this.service = service;
  }

  public record Inspect(@NotBlank @Size(max = 100) String token) {}

  public record Accept(
      @NotBlank @Size(max = 100) String token, @NotBlank @Size(max = 128) String password) {}

  @PostMapping("/inspect")
  public ApiResponse<?> inspect(@Valid @RequestBody Inspect body) {
    return ApiResponse.ok(service.inspect(body.token()));
  }

  @PostMapping("/accept")
  public ApiResponse<?> accept(@Valid @RequestBody Accept body) {
    service.accept(body.token(), body.password());
    return ApiResponse.ok(null);
  }
}
