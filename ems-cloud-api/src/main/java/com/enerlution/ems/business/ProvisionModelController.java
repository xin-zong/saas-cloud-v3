package com.enerlution.ems.business;

import com.enerlution.ems.common.ApiResponse;
import com.enerlution.ems.common.BusinessException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Shared registered model identities, not a claim of field protocol certification. */
@RestController
public class ProvisionModelController {
  private final DomainSupport s;

  public ProvisionModelController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/api/provision-models")
  public ApiResponse<?> models() {
    if (!s.access.hasPermission("asset.create") && !s.access.hasPermission("asset.edit"))
      throw new BusinessException(403, "无权读取建站型号目录");
    return ApiResponse.ok(s.db.queryForList(
        "SELECT id,manufacturer,name,category FROM device_model ORDER BY category,manufacturer,name,id"));
  }
}
