package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.common.BusinessException;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class MfaLifecycleTest {
  final JdbcTemplate jdbc = mock(JdbcTemplate.class);
  final SessionTokens tokens = mock(SessionTokens.class);
  final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
  final TotpService totp = new TotpService(Base64.getEncoder().encodeToString(new byte[32]));
  final Clock clock = mock(Clock.class);
  AuthService auth;

  @BeforeEach
  void setup() {
    when(clock.instant()).thenReturn(Instant.ofEpochSecond(59));
    auth = new AuthService(jdbc, tokens, encoder, totp, clock);
    when(jdbc.query(startsWith("select id,account"), any(RowMapper.class), any(Object[].class)))
        .thenReturn(
            List.of(
                new AuthService.Account(1, "alice", "Alice", encoder.encode("password"), true)));
    when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    when(jdbc.queryForList(
            startsWith("select secret_ciphertext"), eq(String.class), any(Object[].class)))
        .thenReturn(List.of(totp.encrypt("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")));
  }

  @Test
  void passwordOnlyProducesChallengeAndNoSession() {
    AuthService.LoginResult result = auth.login("alice", "password", "peer");
    assertTrue(result.requiresMfa());
    assertNotNull(result.challengeId());
    assertNull(result.token());
    assertNull(result.user());
    verifyNoInteractions(tokens);
  }

  @Test
  void fifthWrongCodeConsumesChallenge() {
    String challenge = auth.login("alice", "password", "peer").challengeId();
    for (int i = 0; i < 5; i++)
      assertEquals(
          401, assertThrows(BusinessException.class, () -> auth.mfa(challenge, "000000")).status());
    assertThrows(BusinessException.class, () -> auth.mfa(challenge, "287082"));
    verifyNoInteractions(tokens);
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void expiredChallengeCannotAuthenticate() {
    String challenge = auth.login("alice", "password", "peer").challengeId();
    when(clock.instant()).thenReturn(Instant.ofEpochSecond(360));
    assertThrows(BusinessException.class, () -> auth.mfa(challenge, "287082"));
    verifyNoInteractions(tokens);
  }

  @Test
  void acceptedCodeCreatesOneSessionAndChallengeCannotBeReused() {
    when(jdbc.update(startsWith("update user_totp"), any(Object[].class))).thenReturn(1);
    when(jdbc.query(startsWith("select u.account"), any(RowMapper.class), any(Object[].class)))
        .thenReturn(Collections.singletonList(new String[] {"alice", "Alice", "Org"}));
    when(tokens.login(1)).thenReturn("opaque-session");
    String challenge = auth.login("alice", "password", "peer").challengeId();
    assertEquals("opaque-session", auth.mfa(challenge, "287082").token());
    assertThrows(BusinessException.class, () -> auth.mfa(challenge, "287082"));
    verify(tokens, times(1)).login(1);
  }

  @Test
  void databaseReplayRejectionNeverCreatesSession() {
    when(jdbc.update(startsWith("update user_totp"), any(Object[].class))).thenReturn(0);
    String challenge = auth.login("alice", "password", "peer").challengeId();
    assertThrows(BusinessException.class, () -> auth.mfa(challenge, "287082"));
    verifyNoInteractions(tokens);
  }

  @Test
  void loginThrottleRejectsBeforeUnboundedCredentialWork() {
    for (int i = 0; i < 10; i++) auth.login("alice", "password", "peer");
    assertEquals(
        "Try again later",
        assertThrows(BusinessException.class, () -> auth.login("alice", "password", "peer"))
            .getMessage());
  }
}
