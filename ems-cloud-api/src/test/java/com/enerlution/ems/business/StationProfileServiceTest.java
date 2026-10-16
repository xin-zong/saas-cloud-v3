package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.sql.Date;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StationProfileServiceTest {
  @Test void readsRealProfileValuesWithoutExposingRawDetails() {
    var db = mock(JdbcTemplate.class);
    var access = mock(AccessControl.class);
    when(db.queryForList(anyString(), eq(7L))).thenReturn(List.of(Map.of(
        "timezone", "Europe/Berlin", "solar_capacity_kw", new BigDecimal("12.500"),
        "commissioned_on", Date.valueOf("2025-06-09"), "country", "Germany")));
    var profile = new StationProfileService(new DomainSupport(db, access)).read(7);
    assertNotNull(profile);
    assertEquals("Europe/Berlin", profile.get("timezone"));
    assertEquals(new BigDecimal("12.500"), profile.get("solarCapacityKw"));
    assertEquals("2025-06-09", profile.get("commissionedOn"));
    assertNull(profile.get("city"));
    assertFalse(profile.containsKey("details"));
    verify(access).requireStationPermission(7, "asset.read");
  }
  @Test void legacyStationWithoutProfileReturnsNull() {
    var db = mock(JdbcTemplate.class);
    when(db.queryForList(anyString(), eq(4L))).thenReturn(List.of());
    assertNull(new StationProfileService(new DomainSupport(db, mock(AccessControl.class))).read(4));
  }
  @Test void deniedStationCannotReadProfile() {
    var db = mock(JdbcTemplate.class);
    var access = mock(AccessControl.class);
    doThrow(new BusinessException(403, "denied")).when(access).requireStationPermission(8, "asset.read");
    assertThrows(BusinessException.class, () -> new StationProfileService(new DomainSupport(db, access)).read(8));
    verifyNoInteractions(db);
  }
}
