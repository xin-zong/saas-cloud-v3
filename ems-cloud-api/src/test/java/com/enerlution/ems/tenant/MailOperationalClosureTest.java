package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.common.BusinessException;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class MailOperationalClosureTest {
  @Test
  void publicCapabilitiesReflectConfigurationWithoutClaimingDelivery() {
    var mail = mock(MailDeliveryService.class);
    var controller =
        new CompanyApplicationController(
            mock(EmailChallengeService.class),
            mock(CompanyApplicationService.class),
            mail,
            "apac",
            "https://example.invalid");
    @SuppressWarnings("unchecked")
    var unavailable = (List<Map<String, Object>>) controller.environments().data();
    assertEquals(false, unavailable.getFirst().get("mailAvailable"));
    assertEquals(false, unavailable.getFirst().get("registrationAvailable"));
    when(mail.available()).thenReturn(true);
    @SuppressWarnings("unchecked")
    var configured = (List<Map<String, Object>>) controller.environments().data();
    assertEquals(true, configured.getFirst().get("registrationAvailable"));
  }

  @Test
  void expiredCodeAndRevokedActivationAreCancelledBeforeProviderSend() {
    for (String template : List.of("email-code", "activation")) {
      var db = mock(JdbcTemplate.class);
      var codec = mock(SecretCodec.class);
      @SuppressWarnings("unchecked")
      var provider = (ObjectProvider<JavaMailSender>) mock(ObjectProvider.class);
      var sender = mock(JavaMailSender.class);
      when(provider.getIfAvailable()).thenReturn(sender);
      String key =
          template.equals("email-code")
              ? "email-code:" + UUID.randomUUID()
              : "activation:7:" + UUID.randomUUID();
      when(codec.decrypt("encrypted"))
          .thenReturn(
              template.equals("email-code")
                  ? "{\"code\":\"123456\"}"
                  : "{\"url\":\"https://example.invalid/#activate=" + "a".repeat(43) + "\"}");
      when(db.queryForList(startsWith("UPDATE mail_delivery")))
          .thenReturn(
              List.of(
                  Map.of(
                      "id",
                      1L,
                      "event_key",
                      key,
                      "recipient",
                      "a@example.invalid",
                      "language",
                      "en",
                      "template",
                      template,
                      "payload_ciphertext",
                      "encrypted",
                      "attempts",
                      1)),
              List.of());
      when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class)))
          .thenReturn(false);
      new MailDeliveryService(
              db, codec, provider, "noreply@example.invalid", "https://example.invalid")
          .deliverPending();
      verify(sender, never()).send(any(SimpleMailMessage.class));
      verify(db).update(contains("status='cancelled'"), eq("ExpiredOrRevoked"), eq(1L));
    }
  }

  @Test
  void challengeStatusIsBoundToEmailAndNeverReturnsCodeOrContext() {
    var db = mock(JdbcTemplate.class);
    var service = new EmailChallengeService(db, mock(MailDeliveryService.class));
    var id = UUID.randomUUID();
    when(db.queryForList(anyString(), any(Object[].class)))
        .thenReturn(
            List.of(
                Map.of(
                    "status",
                    "failed",
                    "expiresAt",
                    OffsetDateTime.parse("2099-01-01T00:00:00Z"),
                    "expired",
                    false)));
    var status = service.status(id, "A@EXAMPLE.INVALID");
    assertEquals("failed", status.get("mailStatus"));
    assertEquals(Set.of("mailStatus", "expiresAt"), status.keySet());
    verify(db).queryForList(contains("c.email=?"), eq(id), eq("a@example.invalid"));
    when(db.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
    assertEquals(
        404,
        assertThrows(BusinessException.class, () -> service.status(id, "other@example.invalid"))
            .status());
  }

  @Test
  void resendCooldownUsesDatabaseLockAndRejectsBeforeInsertingOrEnqueuing() {
    var db = mock(JdbcTemplate.class);
    var mail = mock(MailDeliveryService.class);
    var service = new EmailChallengeService(db, mail);
    when(db.queryForObject(
            contains("created_at>now()-interval '60 seconds'"),
            eq(Boolean.class),
            any(Object[].class)))
        .thenReturn(true);
    assertEquals(
        429,
        assertThrows(
                BusinessException.class,
                () -> service.request("a@example.invalid", "en", "127.0.0.1"))
            .status());
    verify(db)
        .queryForList(contains("pg_advisory_xact_lock"), eq("email-challenge:a@example.invalid"));
    verify(db, never()).update(startsWith("INSERT INTO email_challenge"), any(Object[].class));
    verify(mail, never()).enqueue(anyString(), anyString(), anyString(), anyString(), anyMap());
  }

  @Test
  void resendExpiresOnlyUnverifiedChallengesAndRetainsVerifiedProgressContexts() {
    var db = mock(JdbcTemplate.class);
    var mail = mock(MailDeliveryService.class);
    var service = new EmailChallengeService(db, mail);
    service.request("a@example.invalid", "zh-CN", "127.0.0.1");
    var order = inOrder(db);
    order
        .verify(db)
        .queryForList(contains("pg_advisory_xact_lock"), eq("email-challenge:a@example.invalid"));
    order
        .verify(db)
        .queryForObject(
            contains("created_at>now()-interval '60 seconds'"),
            eq(Boolean.class),
            eq("a@example.invalid"));
    order
        .verify(db)
        .update(contains("context_hash IS NULL AND created_at<now()"), eq("a@example.invalid"));
    order
        .verify(db)
        .update(
            startsWith("INSERT INTO email_challenge"),
            any(UUID.class),
            eq("a@example.invalid"),
            anyString());
  }
}
