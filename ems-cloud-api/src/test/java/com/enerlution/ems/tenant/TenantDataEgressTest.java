package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.business.*;
import com.enerlution.ems.common.BusinessException;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantDataEgressTest {
  @Test
  void legacyReportRechecksBeforeReturningItsFile() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(AccessControl.class);
    doNothing()
        .doThrow(new BusinessException(403, "revoked"))
        .when(auth)
        .requireStationPermission(4, "report.export");
    var controller = new ReportController(new DomainSupport(db, auth));
    assertEquals(
        403,
        assertThrows(
                BusinessException.class,
                () ->
                    controller.report(
                        4, "health", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 2)))
            .status());
    verify(db, never()).update(anyString(), any(Object[].class));
  }
}
