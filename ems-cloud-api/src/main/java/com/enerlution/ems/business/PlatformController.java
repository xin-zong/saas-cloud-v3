package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import org.springframework.web.bind.annotation.*;

/** Retired URLs explicitly fail rather than exposing a new global tenant directory. */
@RestController
@RequestMapping("/api")
public class PlatformController {
  @RequestMapping({
    "/platform/customers",
    "/platform/customers/**",
    "/platform/organizations",
    "/platform/organizations/**",
    "/platform/member-grants",
    "/platform/role-permissions",
    "/members",
    "/members/**",
    "/organizations",
    "/organizations/**",
    "/roles",
    "/roles/**"
  })
  public ApiResponse<?> retired() {
    throw new BusinessException(410, "旧客户与组织权限接口已退休，请使用企业管理入口");
  }
}
