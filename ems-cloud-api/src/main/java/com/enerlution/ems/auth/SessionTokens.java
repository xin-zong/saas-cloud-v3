package com.enerlution.ems.auth;

import cn.dev33.satoken.stp.StpUtil;
import org.springframework.stereotype.Component;

@Component
public class SessionTokens {
  public long userId() {
    return StpUtil.getLoginIdAsLong();
  }

  public String login(long userId) {
    StpUtil.login(userId);
    return StpUtil.getTokenValue();
  }

  public void logout() {
    StpUtil.logout();
  }
}
