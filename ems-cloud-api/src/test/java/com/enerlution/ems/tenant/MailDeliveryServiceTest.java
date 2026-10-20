package com.enerlution.ems.tenant;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class MailDeliveryServiceTest {
  @Test
  void providerFailureSchedulesRetryWithoutMarkingSentOrLoggingPayload() {
    var db = mock(JdbcTemplate.class);
    var codec = mock(SecretCodec.class);
    @SuppressWarnings("unchecked")
    var provider = (ObjectProvider<JavaMailSender>) mock(ObjectProvider.class);
    var sender = mock(JavaMailSender.class);
    when(provider.getIfAvailable()).thenReturn(sender);
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    when(codec.decrypt("encrypted")).thenReturn("{\"code\":\"123456\"}");
    when(db.queryForList(startsWith("UPDATE mail_delivery")))
        .thenReturn(
            List.of(
                Map.of(
                    "id",
                    1L,
                    "event_key",
                    "email-code:" + UUID.randomUUID(),
                    "recipient",
                    "a@test.invalid",
                    "language",
                    "en",
                    "template",
                    "email-code",
                    "payload_ciphertext",
                    "encrypted",
                    "attempts",
                    1)),
            List.of());
    doThrow(new MailSendException("provider detail must not be persisted"))
        .when(sender)
        .send(any(SimpleMailMessage.class));
    new MailDeliveryService(db, codec, provider, "noreply@test.invalid", "http://localhost:8447")
        .deliverPending();
    verify(db)
        .update(
            contains("last_error=?,next_attempt_at"),
            eq("pending"),
            eq("MailSendException"),
            eq(60),
            eq(1L));
    verify(db, never()).update(contains("status='sent'"), any(Object[].class));
  }

  @Test
  void successfulDeliveryRedactsTheOneTimePayload() {
    var db = mock(JdbcTemplate.class);
    var codec = mock(SecretCodec.class);
    @SuppressWarnings("unchecked")
    var provider = (ObjectProvider<JavaMailSender>) mock(ObjectProvider.class);
    var sender = mock(JavaMailSender.class);
    when(provider.getIfAvailable()).thenReturn(sender);
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    when(codec.decrypt("encrypted"))
        .thenReturn("{\"url\":\"http://localhost:8447/#activate=" + "a".repeat(43) + "\"}");
    when(codec.encrypt("{}")).thenReturn("redacted");
    when(db.queryForList(startsWith("UPDATE mail_delivery")))
        .thenReturn(
            List.of(
                Map.of(
                    "id",
                    1L,
                    "event_key",
                    "activation:7:" + UUID.randomUUID(),
                    "recipient",
                    "a@test.invalid",
                    "language",
                    "en",
                    "template",
                    "activation",
                    "payload_ciphertext",
                    "encrypted",
                    "attempts",
                    1)),
            List.of());
    new MailDeliveryService(db, codec, provider, "noreply@test.invalid", "http://localhost:8447")
        .deliverPending();
    verify(sender).send(any(SimpleMailMessage.class));
    verify(db).update(contains("status='sent'"), eq("redacted"), eq(1L));
  }
}
