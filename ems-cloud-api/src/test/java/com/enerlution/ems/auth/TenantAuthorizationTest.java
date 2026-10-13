package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantAuthorizationTest {
 @Test void selectedStationNeverUsesTheNavigationUnion() {
  JdbcTemplate db=mock(JdbcTemplate.class);SessionTokens session=mock(SessionTokens.class);
  when(session.userId()).thenReturn(7L);
  when(db.queryForObject(anyString(),eq(Boolean.class),any(Object[].class))).thenAnswer(call->{
   String sql=call.getArgument(0);return !sql.contains("saas_effective_station_permission")||!Arrays.asList(call.getArguments()).contains(102L);
  });
  TenantAuthorization access=new TenantAuthorization(db,session);
  assertDoesNotThrow(()->access.requireStationPermission(101,"asset.edit"));
  assertEquals(403,assertThrows(BusinessException.class,()->access.requireStationPermission(102,"asset.edit")).status());
  verify(db,never()).queryForObject(contains("effective_permission where"),eq(Boolean.class),any(Object[].class));
 }
 @Test void missingOrDisabledTenantInvalidatesTheSession() {
  JdbcTemplate db=mock(JdbcTemplate.class);SessionTokens session=mock(SessionTokens.class);
  when(session.userId()).thenReturn(7L);
  when(db.queryForObject(anyString(),eq(Boolean.class),any(Object[].class))).thenReturn(false);
  assertEquals(401,assertThrows(BusinessException.class,()->new TenantAuthorization(db,session).userId()).status());
  verify(session).logout();
 }
 @Test void clientIsBoundToTheSessionAndDefaultsToWeb() {
  JdbcTemplate db=mock(JdbcTemplate.class);SessionTokens session=mock(SessionTokens.class);
  TenantAuthorization access=new TenantAuthorization(db,session);
  assertEquals("web",access.client());when(session.client()).thenReturn("app");assertEquals("app",access.client());
 }
}
