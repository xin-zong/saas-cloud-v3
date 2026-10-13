package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class CompanyApplicationServiceTest {
  @Test
  void anAlreadyProcessedApplicationCannotCreateAnotherTenant() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    var support = mock(TenantSupport.class);
    when(db.queryForList(contains("company_application"), eq(7L)))
        .thenReturn(List.of(Map.of("status", "approved")));
    var service =
        new CompanyApplicationService(
            db,
            support,
            mock(EmailChallengeService.class),
            mock(ActivationService.class),
            mock(MailDeliveryService.class),
            mock(SecretCodec.class),
            new BCryptPasswordEncoder(4));
    assertEquals(
        409,
        assertThrows(
                BusinessException.class,
                () ->
                    service.approve(
                        7,
                        new CompanyApplicationService.Approve(
                            List.of(1L), List.of(), List.of(), null, List.of())))
            .status());
    verify(db, never())
        .queryForObject(startsWith("INSERT INTO tenant"), eq(Long.class), any(Object[].class));
  }

  @Test
  void rejectionRequiresAnExplicitReason() {
    var service =
        new CompanyApplicationService(
            mock(JdbcTemplate.class),
            mock(TenantSupport.class),
            mock(EmailChallengeService.class),
            mock(ActivationService.class),
            mock(MailDeliveryService.class),
            mock(SecretCodec.class),
            new BCryptPasswordEncoder(4));
    assertEquals(
        400, assertThrows(BusinessException.class, () -> service.reject(7, "   ")).status());
  }
}
