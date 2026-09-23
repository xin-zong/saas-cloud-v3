package com.enerlution.ems.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Existing injection point retained for callers and tests. */
@Component
public class AccessControl extends GrantAuthorization {
  public AccessControl(JdbcTemplate jdbc, SessionTokens sessions) {
    super(jdbc, sessions);
  }
}
