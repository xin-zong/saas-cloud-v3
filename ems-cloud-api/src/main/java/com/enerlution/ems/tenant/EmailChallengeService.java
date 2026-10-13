package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailChallengeService {
  private final JdbcTemplate db;
  private final MailDeliveryService mail;
  private final Map<String, long[]> attempts = new HashMap<>();

  public EmailChallengeService(JdbcTemplate db, MailDeliveryService mail) {
    this.db = db;
    this.mail = mail;
  }

  @Transactional
  public UUID request(String email, String language, String remote) {
    mail.requireAvailable();
    email = normalize(email);
    limit("ip:" + remote, 20);
    limit("email:" + email, 5);
    UUID id = UUID.randomUUID();
    String code = String.format(Locale.ROOT, "%06d", new SecureRandom().nextInt(1000000));
    db.update(
        "INSERT INTO email_challenge(id,email,code_hash,expires_at) VALUES(?,?,?,now()+interval '10 minutes')",
        id,
        email,
        SecureTokens.hash(id + ":" + code));
    mail.enqueue("email-code:" + id, email, language, "email-code", Map.of("code", code));
    return id;
  }

  @Transactional(noRollbackFor = BusinessException.class)
  public Map<String, String> verify(UUID id, String code) {
    var rows =
        db.queryForList(
            "SELECT email,code_hash FROM email_challenge WHERE id=? AND expires_at>now() AND attempts<5 AND context_hash IS NULL FOR UPDATE",
            id);
    if (rows.isEmpty()) throw new BusinessException(400, "验证码无效或已过期");
    db.update("UPDATE email_challenge SET attempts=attempts+1 WHERE id=?", id);
    if (code == null
        || !code.matches("[0-9]{6}")
        || !MessageDigest.isEqual(
            SecureTokens.hash(id + ":" + code).getBytes(StandardCharsets.US_ASCII),
            ((String) rows.getFirst().get("code_hash")).getBytes(StandardCharsets.US_ASCII)))
      throw new BusinessException(400, "验证码错误");
    String context = SecureTokens.create();
    db.update(
        "UPDATE email_challenge SET context_hash=? WHERE id=?", SecureTokens.hash(context), id);
    return Map.of("context", context, "email", (String) rows.getFirst().get("email"));
  }

  public String requireContext(String token, String email) {
    email = normalize(email);
    if (token == null || !token.matches("[A-Za-z0-9_-]{43}"))
      throw new BusinessException(401, "请先验证邮箱");
    if (db.queryForList(
            "SELECT id FROM email_challenge WHERE context_hash=? AND email=? AND expires_at>now()",
            SecureTokens.hash(token),
            email)
        .isEmpty()) throw new BusinessException(401, "邮箱验证已过期，请重新验证");
    return email;
  }

  public static String normalize(String email) {
    if (email == null) throw new BusinessException(400, "邮箱不能为空");
    return email.trim().toLowerCase(Locale.ROOT);
  }

  private synchronized void limit(String key, int maximum) {
    long now = System.currentTimeMillis();
    attempts.entrySet().removeIf(e -> e.getValue()[0] < now);
    if (attempts.size() > 10000) throw new BusinessException(429, "验证请求繁忙");
    long[] bucket = attempts.computeIfAbsent(key, k -> new long[] {now + 600000, 0});
    if (++bucket[1] > maximum) throw new BusinessException(429, "请求过于频繁，请稍后重试");
  }
}
