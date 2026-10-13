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
      String tenantName,
      List<String> stationIds,
      List<String> permissions,
      Map<String, List<String>> stationPermissions,
      com.enerlution.ems.tenant.TenantContext tenant,
      List<MenuNode> menus,
      List<String> roleNames) {
    public AuthUser(
        String id,
        String name,
        String account,
        String role,
        String organization,
        List<String> stationIds,
        List<String> permissions,
        Map<String, List<String>> stationPermissions,
        Map<String, List<String>> organizationPermissions) {
      this(
          id,
          name,
          account,
          organization,
          stationIds,
          permissions,
          stationPermissions,
          null,
          List.of(),
          List.of());
    }

    public AuthUser(
        String id,
        String name,
        String account,
        String role,
        String organization,
        List<String> stationIds,
        List<String> permissions) {
      this(id, name, account, role, organization, stationIds, permissions, Map.of(), Map.of());
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record LoginResult(boolean requiresMfa, String challengeId, String token, AuthUser user) {}

  public record MfaResult(String token, AuthUser user) {}

  private record Challenge(long userId, long expires, int attempts, String client) {}

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
    return login(account, password, client, "web");
  }

  public LoginResult login(
      String account, String password, String client, String applicationClient) {
    if (!Set.of("web", "app").contains(applicationClient))
      throw new BusinessException(400, "Unknown client");
    if (account != null) account = account.trim().toLowerCase(java.util.Locale.ROOT);
    throttle("ip:" + client, 50);
    throttle("account:" + account, 10);
    if (account == null
        || account.isBlank()
        || account.length() > 254
        || password == null
        || password.getBytes(StandardCharsets.UTF_8).length > 72) throw invalid();
    List<Account> found =
        jdbc.query(
            "select u.id,u.account,u.display_name,u.password_hash,(u.status='active' AND t.enabled) enabled from app_user u join tenant t on t.id=u.tenant_id where u.account=?",
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
        challenges.put(id, new Challenge(user.id(), now + 300, 0, applicationClient));
        return new LoginResult(true, id, null, null);
      }
    }
    String token =
        applicationClient.equals("web")
            ? sessions.login(user.id())
            : sessions.login(user.id(), applicationClient);
    try {
      AuthUser profile = profile(user.id());
      audit(user.id(), "auth.login");
      return new LoginResult(false, null, token, profile);
    } catch (RuntimeException failure) {
      sessions.logout();
      throw failure;
    }
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
            new Challenge(
                challenge.userId(),
                challenge.expires(),
                challenge.attempts() + 1,
                challenge.client()));
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
      String token =
          challenge.client().equals("web")
              ? sessions.login(challenge.userId())
              : sessions.login(challenge.userId(), challenge.client());
      try {
        AuthUser user = profile(challenge.userId());
        audit(challenge.userId(), "auth.mfa");
        return new MfaResult(token, user);
      } catch (RuntimeException failure) {
        sessions.logout();
        throw failure;
      }
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
    if (userId != null) {
      jdbc.update(
          "insert into audit_event(actor_id,target_tenant_id,action,detail) select id,tenant_id,?,? from app_user where id=?",
          action,
          "Authentication event",
          userId);
      return;
    }
    jdbc.update(
        "insert into audit_event(actor_id,action,detail) values(?,?,?)",
        userId,
        action,
        "Authentication event");
  }

  private AuthUser profile(long id) {
    requireEnabled(id);
    TenantAuthorization access = new TenantAuthorization(jdbc, sessions);
    var capabilities = access.snapshot(access.client());
    var row =
        jdbc.queryForMap(
            "SELECT u.account,u.display_name,coalesce(c.name,'Enerlution Platform') tenant_name FROM app_user u LEFT JOIN company_profile c ON c.tenant_id=u.tenant_id WHERE u.id=?",
            id);
    Map<String, List<String>> stationPermissions = new LinkedHashMap<>();
    capabilities
        .stationPermissions()
        .forEach(
            (station, codes) -> stationPermissions.put(station.toString(), List.copyOf(codes)));
    List<String> roleNames =
        capabilities.tenant().administrator()
            ? List.of("Super Admin")
            : jdbc.queryForList(
                "SELECT DISTINCT coalesce(r.name,t.name) FROM member_grant g LEFT JOIN app_role r ON r.id=g.role_id LEFT JOIN role_template t ON t.id=g.template_id WHERE g.user_id=? AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) ORDER BY 1",
                String.class,
                id);
    return new AuthUser(
        Long.toString(id),
        (String) row.get("display_name"),
        (String) row.get("account"),
        (String) row.get("tenant_name"),
        List.copyOf(stationPermissions.keySet()),
        List.copyOf(capabilities.permissions()),
        stationPermissions,
        capabilities.tenant(),
        capabilities.menus(),
        roleNames);
  }

  static String workspaceRole(String code) {
    if (Set.of("owner", "operator", "integrator").contains(code)) return code;
    if (code.matches("(owner|operator|integrator)__o(?:[0-9]+|null)__r[0-9]+"))
      return code.substring(0, code.indexOf("__"));
    return null;
  }

  private void requireEnabled(long id) {
    if (!Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists(select 1 from saas_active_user where user_id=?)", Boolean.class, id)))
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
