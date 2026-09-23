package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class PlatformScopeTest {
  @Test
  void memberEditRejectsParentAndSiblingOrganizations() {
    for (long targetOrg : new long[] {1L, 11L}) {
      JdbcTemplate db = mock(JdbcTemplate.class);
      AccessControl access = mock(AccessControl.class);
      when(access.userId()).thenReturn(7L);
      when(db.queryForList(
              eq("SELECT organization_id FROM app_user WHERE id=? FOR UPDATE"), eq(9L)))
          .thenReturn(List.of(Map.of("organization_id", targetOrg)));
      when(db.queryForList(eq("SELECT organization_id FROM app_user WHERE id=?"), eq(7L)))
          .thenReturn(List.of(Map.of("organization_id", 10L)));
      when(db.queryForObject(
              contains("WITH RECURSIVE branch"), eq(Boolean.class), eq(10L), eq(targetOrg)))
          .thenReturn(false);
      MemberController controller =
          new MemberController(new DomainSupport(db, access), mock(BCryptPasswordEncoder.class));

      BusinessException error =
          assertThrows(
              BusinessException.class,
              () -> controller.edit(9L, new MemberController.Edit("No change", true, 10L)));

      assertEquals(403, error.status());
      verify(db, never()).update(startsWith("UPDATE app_user"), any(), any(), any(), any());
    }
  }

  @Test
  void creatingMemberInSiblingOrganizationIsRejectedBeforeInsert() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    AccessControl access = mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    when(db.queryForList(eq("SELECT organization_id FROM app_user WHERE id=?"), eq(7L)))
        .thenReturn(List.of(Map.of("organization_id", 10L)));
    when(db.queryForObject(contains("WITH RECURSIVE branch"), eq(Boolean.class), eq(10L), eq(11L)))
        .thenReturn(false);
    MemberController controller =
        new MemberController(new DomainSupport(db, access), mock(BCryptPasswordEncoder.class));

    BusinessException error =
        assertThrows(
            BusinessException.class,
            () ->
                controller.create(
                    new MemberController.Create(
                        "sibling", "Sibling", "long-password", List.of(2L), List.of(), 11L)));

    assertEquals(403, error.status());
    verify(db, never()).update(startsWith("INSERT INTO app_user"), any(), any(), any(), any());
  }
}
