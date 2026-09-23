package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class PlatformScopeTest {
  @Test
  void memberEditRequiresBothAdministrativeOwnerAndCurrentMembership() {
    for (long deniedOrg : new long[] {1, 11}) {
      JdbcTemplate db = mock(JdbcTemplate.class);
      AccessControl access = mock(AccessControl.class);
      when(access.userId()).thenReturn(7L);
      when(db.queryForList(contains("FROM app_user"), eq(9L)))
          .thenReturn(List.of(Map.of("organization_id", 11L, "management_organization_id", 1L)));
      doThrow(new BusinessException(403, "denied"))
          .when(access)
          .requireOrganizationPermission(deniedOrg, "member.manage.profile");
      MemberController controller =
          new MemberController(new DomainSupport(db, access), mock(BCryptPasswordEncoder.class));
      assertEquals(
          403,
          assertThrows(
                  BusinessException.class,
                  () -> controller.edit(9, new MemberController.Edit("No change", true, null)))
              .status());
      verify(db, never()).update(startsWith("UPDATE app_user"), any(Object[].class));
    }
  }

  @Test
  void bulkLegacyGrantWritesAreRetired() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    AccessControl access = mock(AccessControl.class);
    MemberController controller =
        new MemberController(new DomainSupport(db, access), mock(BCryptPasswordEncoder.class));
    assertEquals(
        410,
        assertThrows(
                BusinessException.class,
                () ->
                    controller.create(
                        new MemberController.Create(
                            "name", "Name", "password", List.of(1L), List.of(2L), 1L)))
            .status());
    assertEquals(
        410,
        assertThrows(
                BusinessException.class,
                () ->
                    controller.updateGrants(
                        1, new MemberController.Grants(List.of(1L), List.of(2L))))
            .status());
    verifyNoInteractions(db);
  }
}
