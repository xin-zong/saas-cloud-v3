package com.enerlution.ems.tenant;

import com.enerlution.ems.auth.SessionTokens;
import com.enerlution.ems.common.BusinessException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivationService {
  private final JdbcTemplate db;
  private final BCryptPasswordEncoder encoder;
  private final SessionTokens sessions;

  public ActivationService(JdbcTemplate db, BCryptPasswordEncoder encoder, SessionTokens sessions) {
    this.db = db;
    this.encoder = encoder;
    this.sessions = sessions;
  }

  @Transactional
  public String issue(long user) {
    var rows =
        db.queryForList("SELECT id FROM app_user WHERE id=? AND status='invited' FOR UPDATE", user);
    if (rows.isEmpty()) throw new BusinessException(400, "仅可邀请未激活账号");
    db.update(
        "UPDATE account_activation SET revoked_at=now() WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",
        user);
    String token = SecureTokens.create();
    db.update(
        "INSERT INTO account_activation(id,user_id,token_hash,expires_at) VALUES(?,?,?,now()+interval '48 hours')",
        UUID.randomUUID(),
        user,
        SecureTokens.hash(token));
    return token;
  }

  public Map<String, Object> inspect(String token) {
    var row = eligible(token, false);
    return Map.of("account", row.get("account"), "name", row.get("display_name"));
  }

  @Transactional
  public void accept(String token, String password) {
    validatePassword(password);
    var row = eligible(token, true);
    long user = ((Number) row.get("user_id")).longValue();
    int used =
        db.update(
            "UPDATE account_activation SET consumed_at=now() WHERE id=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now()",
            row.get("id"));
    if (used != 1) throw invalid();
    db.update(
        "UPDATE app_user SET password_hash=?,status='active' WHERE id=? AND status='invited'",
        encoder.encode(password),
        user);
    sessions.revokeAll(user);
    db.update(
        "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) SELECT id,tenant_id,'account.activated','One-time activation consumed' FROM app_user WHERE id=?",
        user);
  }

  private Map<String, Object> eligible(String token, boolean lock) {
    if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw invalid();
    var rows =
        db.queryForList(
            "SELECT a.id,a.user_id,u.account,u.display_name,u.status FROM account_activation a JOIN app_user u ON u.id=a.user_id JOIN tenant t ON t.id=u.tenant_id WHERE a.token_hash=? AND a.consumed_at IS NULL AND a.revoked_at IS NULL AND a.expires_at>now() AND u.status='invited' AND t.enabled"
                + (lock ? " FOR UPDATE OF a,u" : ""),
            SecureTokens.hash(token));
    if (rows.isEmpty()) throw invalid();
    return rows.getFirst();
  }

  public static void validatePassword(String password) {
    if (password == null
        || password.length() < 8
        || password.getBytes(StandardCharsets.UTF_8).length > 72
        || !password.matches("(?s).*[A-Z].*")
        || !password.matches("(?s).*[a-z].*")
        || !password.matches("(?s).*[0-9].*"))
      throw new BusinessException(400, "密码至少 8 位，包含大小写字母和数字，且不超过 72 字节");
  }

  private static BusinessException invalid() {
    return new BusinessException(400, "激活链接无效、已使用或已过期，请重新邀请");
  }
}
