package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantRoleServiceTest {
  @Test
  void roleListFiltersInactiveMenuAndOtherClientPermissionsWithoutPerPermissionQueries() {
    for (String kind : List.of("platform", "enterprise")) {
      var db = mock(JdbcTemplate.class);
      var auth = mock(TenantAuthorization.class);
      when(auth.context()).thenReturn(new TenantContext(7, 2, kind, true));
      var role = new HashMap<String, Object>(Map.of("id", 9L, "name", "Reader", "enabled", true));
      when(db.queryForList(contains("FROM app_role"), eq(2L)))
          .thenReturn(new ArrayList<>(List.of(role)));
      var effective = List.<Map<String, Object>>of(Map.of("code", "asset.read", "client", "web"));
      when(db.queryForList(startsWith("SELECT DISTINCT permission_code"), eq(2L)))
          .thenReturn(effective);
      when(db.queryForList(startsWith("SELECT DISTINCT permission_code"))).thenReturn(effective);
      when(db.queryForList(contains("FROM role_permission"), eq(9L)))
          .thenReturn(
              List.of(
                  Map.of("code", "asset.read", "client", "web"),
                  Map.of("code", "asset.read", "client", "app"),
                  Map.of("code", "retired.permission", "client", "web")));
      var service =
          new TenantRoleService(
              new TenantSupport(db, auth, mock(CapabilityEvents.class)),
              new DelegationPolicy(db, auth));
      var rows = service.list();
      var result =
          rows.stream().filter(r -> "custom".equals(r.get("source"))).findFirst().orElseThrow();
      assertEquals(effective, result.get("permissions"));
      assertEquals(2, result.get("unavailablePermissionCount"));
      assertEquals("system", rows.getFirst().get("source"));
      assertEquals(true, rows.getFirst().get("readonly"));
      verify(db, never()).queryForObject(anyString(), eq(Boolean.class), any(Object[].class));
      verify(auth).requirePermission("company.role.manage");
    }
  }
}
