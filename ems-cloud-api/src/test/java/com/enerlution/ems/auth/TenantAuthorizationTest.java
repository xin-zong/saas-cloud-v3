package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantAuthorizationTest {
 @Test void batchedScopesKeepClientAndPermissionSeparationWithOneFreshCheckAndOneRead() {
  var db=mock(JdbcTemplate.class);var session=mock(SessionTokens.class);when(session.userId()).thenReturn(7L);when(session.client()).thenReturn("app");
  when(db.queryForObject(anyString(),eq(Boolean.class),any(Object[].class))).thenReturn(true);
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(Map.of("station_id",101L,"permission_code","asset.read"),Map.of("station_id",102L,"permission_code","telemetry.read")));
  var access=new TenantAuthorization(db,session);
  assertEquals(Map.of("asset.read",List.of(101L),"telemetry.read",List.of(102L),"alarm.read",List.of()),access.stationScopes(List.of("asset.read","telemetry.read","alarm.read")));
  verify(db,times(1)).queryForObject(contains("saas_active_user"),eq(Boolean.class),eq(7L));
  verify(db,times(1)).queryForList(argThat((String sql)->sql.contains("saas_effective_station_permission")&&sql.contains("permission_code IN (?,?,?)")),eq(7L),eq("app"),eq("asset.read"),eq("telemetry.read"),eq("alarm.read"));
 }
 @Test void emptyScopeStillChecksActiveUserAndNeverReadsAllStationPermissions() {
  var db=mock(JdbcTemplate.class);var session=mock(SessionTokens.class);when(session.userId()).thenReturn(7L);
  when(db.queryForObject(anyString(),eq(Boolean.class),any(Object[].class))).thenReturn(true,false);
  var access=new TenantAuthorization(db,session);
  assertEquals(Map.of(),access.stationScopes(List.of()));
  assertEquals(401,assertThrows(BusinessException.class,()->access.stationScopes(List.of())).status());
  verify(db,never()).queryForList(anyString(),any(Object[].class));verify(session).logout();
 }
 @Test void eachBatchReflectsFreshRevocationRatherThanReusingAnAllowDecision() {
  var db=mock(JdbcTemplate.class);var session=mock(SessionTokens.class);when(session.userId()).thenReturn(7L);
  when(db.queryForObject(anyString(),eq(Boolean.class),any(Object[].class))).thenReturn(true);
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of(Map.of("station_id",101L,"permission_code","asset.read")),List.of());
  var access=new TenantAuthorization(db,session);
  assertEquals(List.of(101L),access.stationScopes(List.of("asset.read")).get("asset.read"));
  assertEquals(List.of(),access.stationScopes(List.of("asset.read")).get("asset.read"));
  verify(db,times(2)).queryForObject(contains("saas_active_user"),eq(Boolean.class),eq(7L));verify(db,times(2)).queryForList(anyString(),any(Object[].class));
 }
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
