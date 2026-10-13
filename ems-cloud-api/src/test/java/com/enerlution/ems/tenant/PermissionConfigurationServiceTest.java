package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class PermissionConfigurationServiceTest {
  @Test
  void arbitraryRoutesCannotCreateRuntimePages() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(false);
    var service = new MenuManagementService(db, mock(TenantSupport.class));
    assertEquals(
        400,
        assertThrows(
                BusinessException.class,
                () ->
                    service.create(
                        new MenuManagementService.Edit(
                            null,
                            "web",
                            "page",
                            "fake.page",
                            "not-a-real-page",
                            "asset.read",
                            "enterprise",
                            0,
                            null)))
            .status());
    verify(db, never())
        .queryForObject(startsWith("INSERT INTO menu"), eq(Long.class), any(Object[].class));
  }

  @Test
  void packageStatusChangesRequireImpactConfirmation() {
    var db = mock(JdbcTemplate.class);
    var service = new PermissionPackageService(db, mock(TenantSupport.class));
    assertEquals(
        409,
        assertThrows(BusinessException.class, () -> service.enabled(1, false, false)).status());
    verify(db, never()).update(startsWith("UPDATE permission_package"), any(Object[].class));
  }
}
