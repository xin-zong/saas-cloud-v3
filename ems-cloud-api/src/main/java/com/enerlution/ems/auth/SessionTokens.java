package com.enerlution.ems.auth;

import cn.dev33.satoken.stp.StpUtil;
import org.springframework.stereotype.Component;

@Component
public class SessionTokens {
  public long userId() {
    return StpUtil.getLoginIdAsLong();
  }

  public String login(long userId) {
    return login(userId,"web");
  }

  public String login(long userId,String client) {
    if (!java.util.Set.of("web","app").contains(client)) throw new IllegalArgumentException("Unknown client");
    StpUtil.login(userId);
    StpUtil.getTokenSession().set("ems-client",client);
    return StpUtil.getTokenValue();
  }

  public String client() {
    if (StpUtil.getTokenValue()==null) return "web";
    var session=StpUtil.getTokenSession();
    return session!=null&&"app".equals(session.getString("ems-client"))?"app":"web";
  }

  public void revokeAll(long userId) { StpUtil.logout(userId); }

  public void logout() {
    StpUtil.logout();
  }
}
