package com.enerlution.ems.auth;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  record Account(long id, String account, String name, String passwordHash, boolean enabled) {}

  public record AuthUser(
      String id,
      String name,
      String account,
      String role,
      String organization,
      List<String> stationIds,
      List<String> permissions) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record LoginResult(boolean requiresMfa, String challengeId, String token, AuthUser user) {}

  public record MfaResult(String token, AuthUser user) {}

  private record Challenge(long userId, long expires, int attempts) {}

  private record Bucket(long expires, int attempts) {}

  private final JdbcTemplate jdbc;
  private final SessionTokens sessions;
  private final BCryptPasswordEncoder encoder;
  private final TotpService totp;
  private final Clock clock;
  private final String dummyHash;
  private final Map<String, Challenge> challenges = new HashMap<>();
  private final Map<String, Bucket> buckets = new HashMap<>();
  private final SecureRandom random = new SecureRandom();

  public AuthService(
      JdbcTemplate jdbc,
      SessionTokens sessions,
      BCryptPasswordEncoder encoder,
      TotpService totp,
      Clock clock) {
    this.jdbc = jdbc;
    this.sessions = sessions;
    this.encoder = encoder;
    this.totp = totp;
    this.clock = clock;
    this.dummyHash = encoder.encode(UUID.randomUUID().toString());
  }

  public LoginResult login(String account, String password, String client) {
    throttle("ip:" + client, 50);
    throttle("account:" + account, 10);
    if (account == null
        || account.isBlank()
        || account.length() > 120
        || password == null
        || password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalid();
    List<Account> found =
        jdbc.query(
            "select id,account,display_name,password_hash,enabled from app_user where account=?",
            (rs, n) ->
                new Account(
                    rs.getLong("id"),
                    rs.getString("account"),
                    rs.getString("display_name"),
                    rs.getString("password_hash"),
                    rs.getBoolean("enabled")),
            account);
    Account user = found.isEmpty() ? null : found.getFirst();
    boolean matches = encoder.matches(password, user == null ? dummyHash : user.passwordHash());
    if (user == null || !matches || !user.enabled()) {
      audit(user == null ? null : user.id(), "auth.login_failed");
      throw invalid();
    }
    if (Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from user_totp where user_id=?)", Boolean.class, user.id()))) {
      synchronized (challenges) {
        long now = clock.instant().getEpochSecond();
        challenges.entrySet().removeIf(e -> e.getValue().expires() <= now);
        if (challenges.size() >= 10_000) throw new BusinessException(401, "Try again later");
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String id = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        challenges.put(id, new Challenge(user.id(), now + 300, 0));
        return new LoginResult(true, id, null, null);
      }
    }
    AuthUser profile = profile(user.id());
    audit(user.id(), "auth.login");
    return new LoginResult(false, null, sessions.login(user.id()), profile);
  }

  public MfaResult mfa(String challengeId, String code) {
    synchronized (challenges) {
      Challenge challenge = challenges.get(challengeId);
      long now = clock.instant().getEpochSecond();
      if (challenge == null || challenge.expires() <= now || challenge.attempts() >= 5) {
        challenges.remove(challengeId);
        throw invalidMfa();
      }
      // Count every submission and consume on success; failed fifth attempt removes it.
      if (challenge.attempts() + 1 >= 5) challenges.remove(challengeId);
      else
        challenges.put(
            challengeId,
            new Challenge(challenge.userId(), challenge.expires(), challenge.attempts() + 1));
      requireEnabled(challenge.userId());
      List<String> secrets =
          jdbc.queryForList(
              "select secret_ciphertext from user_totp where user_id=?",
              String.class,
              challenge.userId());
      if (secrets.isEmpty()) {
        challenges.remove(challengeId);
        throw invalidMfa();
      }
      long counter = totp.matchCounter(totp.decrypt(secrets.getFirst()), code, now);
      if (counter < 0) throw invalidMfa();
      // Atomic database update prevents replay across challenges, threads and instances.
      int updated =
          jdbc.update(
              "update user_totp set last_counter=? where user_id=? and (last_counter is null or"
                  + " last_counter<?)",
              counter,
              challenge.userId(),
              counter);
      if (updated != 1) throw invalidMfa();
      challenges.remove(challengeId);
      AuthUser user = profile(challenge.userId());
      audit(challenge.userId(), "auth.mfa");
      return new MfaResult(sessions.login(challenge.userId()), user);
    }
  }

  public AuthUser me() {
    return profile(sessions.userId());
  }

  public void logout() {
    try {
      audit(sessions.userId(), "auth.logout");
    } finally {
      sessions.logout();
    }
  }

  private void audit(Long userId, String action) {
    jdbc.update(
        "insert into audit_event(actor_id,action,detail) values(?,?,?)",
        userId,
        action,
        "Authentication event");
  }

  private AuthUser profile(long id) {
    requireEnabled(id);
    List<String[]> users =
        jdbc.query(
            "select u.account,u.display_name,coalesce(o.name,'') organization from app_user u left"
                + " join organization o on o.id=u.organization_id where u.id=?",
            (rs, n) ->
                new String[] {
                  rs.getString("account"),
                  rs.getString("display_name"),
                  rs.getString("organization")
                },
            id);
    if (users.isEmpty()) throw new BusinessException(401, "Authentication required");
    List<String> roles =
        jdbc.queryForList(
            "select r.code from user_role ur join app_role r on r.id=ur.role_id where ur.user_id=?"
                + " order by r.id",
            String.class,
            id);
    String role =
        roles.stream()
            .filter(r -> Set.of("owner", "operator", "integrator").contains(r))
            .findFirst()
            .orElse("operator");
    List<String> stations =
        jdbc
            .queryForList(
                "select station_id from user_station where user_id=? order by station_id",
                Long.class,
                id)
            .stream()
            .map(String::valueOf)
            .toList();
    List<String> permissions =
        jdbc.queryForList(
            "select distinct rp.permission_code from user_role ur join role_permission rp on"
                + " rp.role_id=ur.role_id where ur.user_id=? order by rp.permission_code",
            String.class,
            id);
    String[] user = users.getFirst();
    return new AuthUser(Long.toString(id), user[1], user[0], role, user[2], stations, permissions);
  }

  private void requireEnabled(long id) {
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from app_user where id=? and enabled)", Boolean.class, id)))
      throw new BusinessException(401, "Authentication required");
  }

  private synchronized void throttle(String key, int limit) {
    long now = clock.instant().getEpochSecond();
    buckets.entrySet().removeIf(e -> e.getValue().expires() <= now);
    Bucket bucket = buckets.get(key);
    if (bucket == null) {
      if (buckets.size() >= 10_000) throw new BusinessException(401, "Try again later");
      bucket = new Bucket(now + 300, 0);
    }
    if (bucket.attempts() >= limit) throw new BusinessException(401, "Try again later");
    buckets.put(key, new Bucket(bucket.expires(), bucket.attempts() + 1));
  }

  private static BusinessException invalid() {
    return new BusinessException(401, "Invalid credentials");
  }

  private static BusinessException invalidMfa() {
    return new BusinessException(401, "Invalid or expired verification challenge");
  }
}
