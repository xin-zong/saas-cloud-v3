package com.enerlution.ems.tenant;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class MailDeliveryService {
  private final JdbcTemplate db;
  private final SecretCodec codec;
  private final ObjectProvider<JavaMailSender> sender;
  private final String from, publicUrl;
  private final ObjectMapper json = new ObjectMapper();

  public MailDeliveryService(
      JdbcTemplate db,
      SecretCodec codec,
      ObjectProvider<JavaMailSender> sender,
      @Value("${ems.tenant.mail-from:}") String from,
      @Value("${ems.tenant.public-url:}") String publicUrl) {
    this.db = db;
    this.codec = codec;
    this.sender = sender;
    this.from = from;
    this.publicUrl = publicUrl;
  }

  public boolean available() {
    if (sender.getIfAvailable() == null || from.isBlank() || publicUrl.isBlank()) return false;
    try {
      activationUrl("");
      return true;
    } catch (BusinessException error) {
      return false;
    }
  }

  public void requireAvailable() {
    if (!available()) throw new BusinessException(503, "邮件服务尚未配置，请联系平台管理员");
  }

  public String activationUrl(String token) {
    URI base;
    try {
      base = URI.create(publicUrl);
    } catch (RuntimeException e) {
      throw new BusinessException(503, "激活页面地址未配置");
    }
    if (!Set.of("http", "https").contains(base.getScheme())
        || base.getHost() == null
        || base.getRawUserInfo() != null
        || base.getRawQuery() != null
        || base.getRawFragment() != null) throw new BusinessException(503, "激活页面地址配置无效");
    return publicUrl.replaceAll("/+$", "") + "/#activate=" + token;
  }

  public void enqueue(
      String key, String recipient, String language, String template, Map<String, ?> payload) {
    try {
      String encrypted = codec.encrypt(json.writeValueAsString(payload));
      db.update(
          "INSERT INTO mail_delivery(event_key,recipient,language,template,payload_ciphertext)"
              + " VALUES(?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
          key,
          recipient,
          "zh-CN".equals(language) ? "zh-CN" : "en",
          template,
          encrypted);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Mail payload invalid");
    }
  }

  public void cancelActivationMails(long user) {
    db.update(
        "UPDATE mail_delivery SET status='cancelled' WHERE event_key LIKE ? AND status IN"
            + " ('pending','sending')",
        "activation:" + user + ":%");
  }

  @Scheduled(fixedDelay = 5000)
  public void deliverPending() {
    if (!available()) return;
    db.update(
        "UPDATE mail_delivery SET status='failed',last_error='DeliveryLeaseExpired' WHERE"
            + " status='sending' AND attempts>=5 AND next_attempt_at<=now()");
    for (int i = 0; i < 10; i++) {
      var rows =
          db.queryForList(
              "UPDATE mail_delivery SET"
                  + " status='sending',attempts=attempts+1,next_attempt_at=now()+interval '2"
                  + " minutes' WHERE id=(SELECT id FROM mail_delivery WHERE status IN"
                  + " ('pending','sending') AND next_attempt_at<=now() AND attempts<5 ORDER BY"
                  + " next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING"
                  + " id,event_key,recipient,language,template,payload_ciphertext,attempts");
      if (rows.isEmpty()) return;
      var row = rows.getFirst();
      try {
        Map<String, Object> payload =
            json.readValue(
                codec.decrypt((String) row.get("payload_ciphertext")), new TypeReference<>() {});
        boolean zh = "zh-CN".equals(row.get("language"));
        String template = (String) row.get("template");
        if (!eligible(row, payload)) {
          db.update(
              "UPDATE mail_delivery SET status='cancelled',last_error=? WHERE id=? AND"
                  + " status='sending'",
              "ExpiredOrRevoked",
              row.get("id"));
          continue;
        }
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo((String) row.get("recipient"));
        message.setSubject(
            zh ? "Enerlution 账号与企业通知" : "Enerlution account and company notification");
        message.setText(
            switch (template) {
              case "email-code" ->
                  (zh ? "邮箱验证码：" : "Email verification code: ")
                      + payload.get("code")
                      + (zh ? "\n十分钟内有效，请勿转发。" : "\nValid for ten minutes. Do not forward.");
              case "activation" ->
                  (zh ? "请设置密码并激活账号：" : "Set your password and activate your account: ")
                      + payload.get("url")
                      + (zh
                          ? "\n链接仅可使用一次，48 小时内有效。"
                          : "\nThis link can be used once within 48 hours.");
              case "rejected" ->
                  (zh ? "企业申请未通过。原因：" : "Company application rejected. Reason: ")
                      + payload.get("reason");
              case "application-submitted" ->
                  (zh ? "有新的企业申请等待审批：" : "A company application is awaiting review: ")
                      + payload.get("number");
              default -> throw new IllegalArgumentException("Unknown mail template");
            });
        Objects.requireNonNull(sender.getIfAvailable()).send(message);
        db.update(
            "UPDATE mail_delivery SET"
                + " status='sent',sent_at=now(),last_error=NULL,payload_ciphertext=? WHERE id=? AND"
                + " status='sending'",
            codec.encrypt("{}"),
            row.get("id"));
      } catch (Exception error) {
        int attempts = ((Number) row.get("attempts")).intValue();
        // Provider messages can contain credentials or the activation link; retain only the error
        // class.
        db.update(
            "UPDATE mail_delivery SET status=?,last_error=?,next_attempt_at=now()+(? * interval '1"
                + " second') WHERE id=? AND status='sending'",
            attempts >= 5 ? "failed" : "pending",
            error.getClass().getSimpleName(),
            Math.min(3600, 30 * (1 << attempts)),
            row.get("id"));
      }
    }
  }

  private boolean eligible(Map<String, Object> row, Map<String, Object> payload) {
    String template = Objects.toString(row.get("template")),
        key = Objects.toString(row.get("event_key"));
    if ("email-code".equals(template)) {
      if (!key.startsWith("email-code:")) return false;
      UUID id;
      try {
        id = UUID.fromString(key.substring(11));
      } catch (IllegalArgumentException error) {
        return false;
      }
      return Boolean.TRUE.equals(
          db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM email_challenge WHERE id=? AND email=? AND code_hash=?"
                  + " AND expires_at>now() AND attempts<5 AND context_hash IS NULL)",
              Boolean.class,
              id,
              row.get("recipient"),
              SecureTokens.hash(id + ":" + payload.get("code"))));
    }
    if ("activation".equals(template)) {
      String url = Objects.toString(payload.get("url"), "");
      String fragment;
      try {
        fragment = URI.create(url).getFragment();
      } catch (IllegalArgumentException error) {
        return false;
      }
      if (fragment == null || !fragment.matches("activate=[A-Za-z0-9_-]{43}")) return false;
      String token = fragment.substring(9);
      if (!activationUrl(token).equals(url)) return false;
      return Boolean.TRUE.equals(
          db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM account_activation a JOIN app_user u ON u.id=a.user_id"
                  + " JOIN tenant t ON t.id=u.tenant_id WHERE a.token_hash=? AND a.consumed_at IS"
                  + " NULL AND a.revoked_at IS NULL AND a.expires_at>now() AND u.status='invited'"
                  + " AND t.enabled AND u.account=?)",
              Boolean.class,
              SecureTokens.hash(token),
              row.get("recipient")));
    }
    return true;
  }
}
