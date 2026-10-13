package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class RoleTemplateDelegationTest {
  @Test
  void ordinaryPlatformEditorCannotConfigureCapabilitiesTheyDoNotHold() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(10, 1, "platform", false));
    var policy = new DelegationPolicy(db, auth);
    assertThrows(
        BusinessException.class,
        () ->
            policy.globalTemplate(
                null, java.util.List.of(new RoleTemplateService.Selection("asset.edit", "web"))));
  }
}
