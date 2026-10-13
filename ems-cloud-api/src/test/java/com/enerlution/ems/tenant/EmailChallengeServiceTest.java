package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class EmailChallengeServiceTest {
  @Test
  void wrongCodesCountAttemptsAndNeverReturnProgressAccess() {
    var db = mock(JdbcTemplate.class);
    UUID id = UUID.randomUUID();
    when(db.queryForList(anyString(), any(Object[].class)))
        .thenReturn(
            List.of(
                Map.of("email", "a@test.invalid", "code_hash", SecureTokens.hash(id + ":123456"))));
    var service = new EmailChallengeService(db, mock(MailDeliveryService.class));
    assertEquals(
        400, assertThrows(BusinessException.class, () -> service.verify(id, "654321")).status());
    verify(db).update(contains("attempts=attempts+1"), eq(id));
    verify(db, never()).update(contains("context_hash=?"), any(Object[].class));
  }

  @Test
  void verifiedContextDoesNotAllowAnotherEmail() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
    assertEquals(
        401,
        assertThrows(
                BusinessException.class,
                () ->
                    new EmailChallengeService(db, mock(MailDeliveryService.class))
                        .requireContext("t".repeat(43), "other@test.invalid"))
            .status());
  }

  @Test
  void publicRequestsFailClearlyWhenEmailIsNotConfigured() {
    var db = mock(JdbcTemplate.class);
    var mail = mock(MailDeliveryService.class);
    doThrow(new BusinessException(503, "Email unavailable")).when(mail).requireAvailable();
    assertEquals(
        503,
        assertThrows(
                BusinessException.class,
                () ->
                    new EmailChallengeService(db, mail)
                        .request("a@test.invalid", "en", "127.0.0.1"))
            .status());
    verify(db, never()).update(startsWith("INSERT INTO email_challenge"), any(Object[].class));
  }
}
