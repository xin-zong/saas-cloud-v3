package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.SessionTokens;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class ActivationServiceTest {
  @Test
  void inspectingALinkNeverConsumesIt() {
    var db = mock(JdbcTemplate.class);
    var sessions = mock(SessionTokens.class);
    when(db.queryForList(anyString(), any(Object[].class)))
        .thenReturn(
            List.of(
                new HashMap<>(
                    Map.of(
                        "id",
                        UUID.randomUUID(),
                        "user_id",
                        7L,
                        "account",
                        "invite@test.invalid",
                        "display_name",
                        "Invite",
                        "status",
                        "invited"))));
    var service = new ActivationService(db, new BCryptPasswordEncoder(4), sessions);
    assertEquals("invite@test.invalid", service.inspect("t".repeat(43)).get("account"));
    verify(db, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void consumedOrExpiredLinksCannotSetPasswords() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
    var service =
        new ActivationService(db, new BCryptPasswordEncoder(4), mock(SessionTokens.class));
    assertEquals(
        400,
        assertThrows(
                BusinessException.class, () -> service.accept("t".repeat(43), "ValidPassword9"))
            .status());
    verify(db, never()).update(startsWith("UPDATE app_user"), any(Object[].class));
  }

  @Test
  void passwordsRequireUpperLowerAndDigitsAndRespectBcryptByteLimit() {
    assertThrows(
        BusinessException.class, () -> ActivationService.validatePassword("alllowercase9"));
    assertThrows(BusinessException.class, () -> ActivationService.validatePassword("NoDigitsHere"));
    assertThrows(
        BusinessException.class, () -> ActivationService.validatePassword("Aa9" + "长".repeat(30)));
    assertDoesNotThrow(() -> ActivationService.validatePassword("StrongPassword9"));
  }

  @Test
  void unicodeSecretsAreAuthenticatedAndWrongKeysFail() {
    String key = Base64.getEncoder().encodeToString(new byte[32]);
    var codec = new SecretCodec(key);
    String encrypted = codec.encrypt("企业邀请 https://example.invalid/#activate=opaque");
    assertEquals("企业邀请 https://example.invalid/#activate=opaque", codec.decrypt(encrypted));
    assertThrows(
        IllegalStateException.class,
        () -> new SecretCodec(Base64.getEncoder().encodeToString(new byte[16])).decrypt(encrypted));
  }
}
