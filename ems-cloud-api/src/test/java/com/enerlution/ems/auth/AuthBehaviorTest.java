package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.common.BusinessException;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class AuthBehaviorTest {
  final JdbcTemplate jdbc = mock(JdbcTemplate.class);
  final SessionTokens sessions = mock(SessionTokens.class);
  final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
  final AuthService auth =
      new AuthService(jdbc, sessions, encoder, new TotpService(""), Clock.systemUTC());

  @Test
  void invalidLoginDoesNotIssueSession() {
    when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
    BusinessException ex =
        assertThrows(BusinessException.class, () -> auth.login("missing", "password", "127.0.0.1"));
    assertEquals(401, ex.status());
    assertEquals("Invalid credentials", ex.getMessage());
    verify(sessions, never()).login(anyLong());
  }

  @Test
  void disabledUserCannotLoginEvenWithCorrectPassword() {
    when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(
            List.of(
                new AuthService.Account(1L, "alice", "Alice", encoder.encode("password"), false)));
    assertEquals(
        401,
        assertThrows(BusinessException.class, () -> auth.login("alice", "password", "127.0.0.1"))
            .status());
    verify(sessions, never()).login(anyLong());
  }

  @Test
  void stationWithoutExplicitGrantIsForbidden() {
    when(sessions.userId()).thenReturn(1L);
    when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class)))
        .thenReturn(true, false);
    AccessControl access = new AccessControl(jdbc, sessions);
    assertEquals(
        403,
        assertThrows(
                BusinessException.class, () -> access.requireStationPermission(9, "asset.read"))
            .status());
  }

  @Test
  void logoutRevokesSession() {
    auth.logout();
    verify(sessions).logout();
  }

  @Test
  void logoutStillRevokesWhenAuditStorageFails() {
    when(jdbc.update(anyString(), any(Object[].class)))
        .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("offline"));
    assertThrows(org.springframework.dao.DataAccessResourceFailureException.class, auth::logout);
    verify(sessions).logout();
  }

  @Test
  void disabledAccountIsRejectedOnAuthenticatedRequests() {
    when(sessions.userId()).thenReturn(1L);
    when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class)))
        .thenReturn(false);
    assertEquals(
        401,
        assertThrows(BusinessException.class, () -> new AccessControl(jdbc, sessions).userId())
            .status());
  }

  @Test
  void totpMatchesRfc6238Sha1VectorAndRejectsWrongCode() {
    TotpService service = new TotpService("");
    String secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    assertEquals(1L, service.matchCounter(secret, "287082", 59));
    assertEquals(-1L, service.matchCounter(secret, "000000", 59));
    assertEquals(-1L, service.matchCounter(secret, "28708x", 59));
  }

  @Test
  void totpCiphertextAuthenticatesAndRequiresKey() {
    String key = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    TotpService service = new TotpService(key);
    String ciphertext = service.encrypt("JBSWY3DPEHPK3PXP");
    assertEquals("JBSWY3DPEHPK3PXP", service.decrypt(ciphertext));
    assertThrows(IllegalStateException.class, () -> new TotpService("").decrypt(ciphertext));
    assertThrows(
        IllegalStateException.class,
        () -> service.decrypt(ciphertext.substring(0, ciphertext.length() - 4) + "AAAA"));
  }
}
