package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StationTagServiceTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final AccessControl access = mock(AccessControl.class);
  final StationTagService tags = new StationTagService(new DomainSupport(db, access));
  StationTagServiceTest() { when(access.context()).thenReturn(new TenantContext(7, 11, "enterprise", false)); }
  static void status(int status, org.junit.jupiter.api.function.Executable call) {
    assertEquals(status, assertThrows(BusinessException.class, call).status());
  }
  @Test void trimsNameAndAcceptsOnlyOneToFiftyCharacters() {
    assertEquals("Solar", StationTagService.normalizeName("  Solar  "));
    assertEquals("能".repeat(50), StationTagService.normalizeName("能".repeat(50)));
    for (String value : Arrays.asList(null, "", "   ", "a".repeat(51)))
      status(400, () -> StationTagService.normalizeName(value));
  }
  @Test void limitsDescriptionAndDeduplicatesValidIds() {
    assertEquals("", StationTagService.normalizeDescription(null));
    assertEquals("x".repeat(500), StationTagService.normalizeDescription("x".repeat(500)));
    status(400, () -> StationTagService.normalizeDescription("x".repeat(501)));
    UUID id = UUID.randomUUID();
    assertEquals(List.of(id), StationTagService.normalizeIds(new StationTagService.BindingRequest(List.of(id,id))));
    status(400, () -> StationTagService.normalizeIds(new StationTagService.BindingRequest(Arrays.asList(id,null))));
    status(400, () -> StationTagService.normalizeIds(new StationTagService.BindingRequest(null)));
  }
  @Test void validatesPaginationBeforeDatabaseReads() {
    status(400, () -> tags.list(null, 0, 0));
    status(400, () -> tags.list(null, 201, 0));
    status(400, () -> tags.list(null, 10, -1));
    verifyNoInteractions(db);
  }
  @Test void definitionListAndWritesRequireCurrentCapabilities() {
    doThrow(new BusinessException(403,"denied")).when(access).requirePermission("asset.read");
    status(403, () -> tags.list(null, 10, 0));
    doThrow(new BusinessException(403,"denied")).when(access).requirePermission("asset.edit");
    status(403, () -> tags.create(new StationTagService.TagRequest("A", "", null)));
    verifyNoInteractions(db);
  }
  @Test void stationReadRequiresStationReadScope() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.read");
    status(403, () -> tags.stationTags(101));
    verifyNoInteractions(db);
  }
  @Test void stationBindingRequiresBothReadAndEditScope() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.edit");
    status(403, () -> tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of())));
    verify(access).requireStationPermission(101,"asset.read");
    verifyNoInteractions(db);
  }
  @Test void platformScopeDoesNotPermitCrossTenantStationTags() {
    when(access.context()).thenReturn(new TenantContext(7, 11, "platform", true));
    when(db.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of("tenant_id",22L)));
    status(403, () -> tags.stationTags(101));
    status(403, () -> tags.replaceStationTags(101,new StationTagService.BindingRequest(List.of())));
  }
}
