package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.business.*;
import com.enerlution.ems.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class LegacyPermissionRetirementTest {
  @Test
  void aggregateReadsAreAuthenticatedGoneAndNeverReadGrantData() {
    var access = mock(AccessControl.class);
    var db = mock(JdbcTemplate.class);
    var controller = new PlatformController(new DomainSupport(db, access));
    when(access.userId()).thenReturn(7L);
    assertEquals(410, assertThrows(BusinessException.class, controller::memberGrants).status());
    assertEquals(410, assertThrows(BusinessException.class, controller::rolePermissions).status());
    verify(access, times(2)).userId();
    verifyNoInteractions(db);
    when(access.userId()).thenThrow(new BusinessException(401, "Authentication required"));
    assertEquals(401, assertThrows(BusinessException.class, controller::memberGrants).status());
    assertEquals(401, assertThrows(BusinessException.class, controller::rolePermissions).status());
  }
}
