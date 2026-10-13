package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.TenantAuthorization;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class DelegationPolicyTest {
  @Test
  void roleManagementDoesNotAllowSelfEscalation() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(7, 1, "enterprise", false));
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class)))
        .thenAnswer(c -> !((String) c.getArgument(0)).contains("saas_member_capability"));
    var policy = new DelegationPolicy(db, auth);
    assertEquals(
        403,
        assertThrows(
                BusinessException.class,
                () ->
                    policy.checkSelections(
                        1, List.of(new RoleTemplateService.Selection("asset.edit", "web")), null))
            .status());
  }

  @Test
  void noRoleCanBeConfiguredForAnotherEnterprise() {
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(7, 1, "enterprise", true));
    var db = mock(JdbcTemplate.class);
    var policy = new DelegationPolicy(db, auth);
    assertEquals(
        403,
        assertThrows(BusinessException.class, () -> policy.checkSelections(2, List.of(), null))
            .status());
    verifyNoInteractions(db);
  }
}
