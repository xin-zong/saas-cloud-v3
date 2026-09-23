package com.enerlution.ems.auth;

import com.enerlution.ems.common.BusinessException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AccessControl {
  private final JdbcTemplate jdbc;
  private final SessionTokens sessions;

  public AccessControl(JdbcTemplate jdbc, SessionTokens sessions) {
    this.jdbc = jdbc;
    this.sessions = sessions;
  }

  public long userId() {
    long id = sessions.userId();
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from app_user where id=? and enabled)", Boolean.class, id))) {
      sessions.logout();
      throw new BusinessException(401, "Authentication required");
    }
    return id;
  }

  public void requirePermission(String permission) {
    long id = userId();
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
select exists(select 1 from user_role ur join role_permission rp on rp.role_id=ur.role_id
where ur.user_id=? and rp.permission_code=?)
""",
            Boolean.class,
            id,
            permission))) throw new BusinessException(403, "Permission denied");
  }

  public void requireStation(long stationId) {
    long id = userId();
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from user_station where user_id=? and station_id=?)",
            Boolean.class,
            id,
            stationId))) throw new BusinessException(403, "Station access denied");
  }

  public List<Long> stationIds() {
    return jdbc.queryForList(
        "select station_id from user_station where user_id=? order by station_id",
        Long.class,
        userId());
  }
}
