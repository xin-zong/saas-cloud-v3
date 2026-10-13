package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class PeopleServiceTest {
  @Test
  void disabledPackageDoesNotPreventProtectedAdministratorReceivingResponsibilities() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(1, 2, "enterprise", true));
    when(auth.userId()).thenReturn(1L);
    when(db.queryForList(anyString(), eq(7L), eq(2L)))
        .thenReturn(
            java.util.List.of(
                java.util.Map.of("id", 7L, "status", "active", "administrator", false)));
    when(db.queryForList(contains("manager_id=?"), eq(Long.class), eq(7L), eq(2L)))
        .thenReturn(java.util.List.of(4L));
    when(db.queryForObject(
            contains("SELECT user_id FROM tenant_administrator"), eq(Long.class), eq(2L)))
        .thenReturn(1L);
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    var sessions = mock(SessionTokens.class);
    var service =
        new PeopleService(
            new TenantSupport(db, auth, mock(CapabilityEvents.class)),
            mock(ActivationService.class),
            mock(MailDeliveryService.class),
            sessions,
            new BCryptPasswordEncoder());
    service.status(7, "disabled", null);
    var order = inOrder(db);
    order.verify(db).update(contains("UPDATE station SET manager_id"), eq(1L), eq(7L), eq(2L));
    order.verify(db).update(contains("UPDATE app_user SET status"), eq("disabled"), eq(7L));
    verify(auth, never()).hasStationPermission(anyLong(), anyLong(), anyString());
    verify(db, never()).update(startsWith("INSERT INTO member_grant"), any(Object[].class));
    verify(sessions).revokeAll(7);
  }

  @Test
  void replacementMustManageEveryResponsibleStationBeforeAnyMutation() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(1, 2, "enterprise", true));
    when(db.queryForList(anyString(), eq(7L), eq(2L)))
        .thenReturn(
            java.util.List.of(
                java.util.Map.of("id", 7L, "status", "active", "administrator", false)));
    when(db.queryForList(contains("manager_id=?"), eq(Long.class), eq(7L), eq(2L)))
        .thenReturn(java.util.List.of(4L, 5L));
    when(db.queryForObject(contains("app_user WHERE id=?"), eq(Boolean.class), eq(8L), eq(2L)))
        .thenReturn(true);
    when(auth.hasStationPermission(8, 4, "asset.edit")).thenReturn(true);
    var sessions = mock(SessionTokens.class);
    var service =
        new PeopleService(
            new TenantSupport(db, auth, mock(CapabilityEvents.class)),
            mock(ActivationService.class),
            mock(MailDeliveryService.class),
            sessions,
            new BCryptPasswordEncoder());
    assertEquals(
        403,
        assertThrows(BusinessException.class, () -> service.status(7, "disabled", 8L)).status());
    verify(db, never()).update(anyString(), any(Object[].class));
    verifyNoInteractions(sessions);
  }

  @Test
  void protectedAdministratorCannotBeDisabledOrDeleted() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(1, 2, "enterprise", true));
    when(db.queryForList(anyString(), eq(1L), eq(2L)))
        .thenReturn(
            java.util.List.of(
                new java.util.HashMap<>(
                    java.util.Map.of("id", 1L, "status", "active", "administrator", true))));
    var service =
        new PeopleService(
            new TenantSupport(db, auth, mock(CapabilityEvents.class)),
            mock(ActivationService.class),
            mock(MailDeliveryService.class),
            mock(SessionTokens.class),
            new BCryptPasswordEncoder());
    assertThrows(BusinessException.class, () -> service.status(1, "disabled", null));
    assertThrows(BusinessException.class, () -> service.delete(1, null));
    verify(db, never()).update(anyString(), any(Object[].class));
  }
}
