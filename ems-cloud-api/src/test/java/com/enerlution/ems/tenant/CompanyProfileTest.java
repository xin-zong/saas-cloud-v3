package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class CompanyProfileTest {
  @Test
  void registeredAddressCannotBeChangedThroughProfileEditing() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(1, 2, "enterprise", true));
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    when(db.queryForMap(startsWith("SELECT country"), eq(2L)))
        .thenReturn(
            Map.of(
                "country",
                "DE",
                "province",
                "BE",
                "city",
                "Berlin",
                "address",
                "Registered address"));
    var form =
        new CompanyForm(
            "A",
            List.of("operator"),
            List.of("commercial"),
            "DE",
            "BE",
            "Berlin",
            "Changed address",
            null,
            null,
            null,
            "12345",
            null,
            null,
            null,
            "A",
            "+491234567",
            null);
    var service =
        new CompanyService(
            new TenantSupport(db, auth, mock(CapabilityEvents.class)),
            mock(SecretCodec.class),
            mock(SessionTokens.class),
            mock(ActivationService.class),
            mock(MailDeliveryService.class));
    assertEquals(400, assertThrows(BusinessException.class, () -> service.editOwn(form)).status());
    verify(db, never()).update(startsWith("UPDATE company_profile"), any(Object[].class));
  }
}
