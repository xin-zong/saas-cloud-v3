package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.tenant.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
class RegularReportConfigTest {
  @Test void deviceMetricsRequireDeviceInfoAndSerialNumber() {
    for(String type:List.of("daily","total")) {
      for(String metric:RegularReportConfigService.FIELDS.get(type).stream().filter(f->f.matches("^(Inverter |Meter |Module |Microinverter ).*")).toList()) {
        assertThrows(BusinessException.class,()->RegularReportConfigService.validateTemplate(type,"Test",List.of("Site Name",metric)),type+": "+metric);
        assertThrows(BusinessException.class,()->RegularReportConfigService.validateTemplate(type,"Test",List.of("Site Name","Device Info",metric)),type+": "+metric);
        assertDoesNotThrow(()->RegularReportConfigService.validateTemplate(type,"Test",List.of("Site Name","Device Info","Device SN",metric)),type+": "+metric);
      }
    }
  }
  @Test void monthlyAndYearlyDoNotAdvertiseUnverifiedDeviceInfoChildren() {
    for(String type:List.of("monthly","yearly")) {
      assertFalse(RegularReportConfigService.FIELDS.get(type).contains("Device Info"));
      assertThrows(BusinessException.class,()->RegularReportConfigService.validateTemplate(type,"Test",List.of("Site Name","Device Info")));
      assertDoesNotThrow(()->RegularReportConfigService.validateTemplate(type,"Test",List.of("Site Name")));
    }
  }
  @Test void rejectsUnsupportedTypesMissingLockedFieldAndUnknownFields() {
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTemplate("daily","Test",List.of()));
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTemplate("range","Test",List.of("Site Name")));
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTemplate("daily","Test",List.of("Site Name","made-up")));
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTemplate("daily","Test",List.of("Site Name","Device Info")));
    assertDoesNotThrow(() -> RegularReportConfigService.validateTemplate("daily","Test",List.of("Site Name","Device Info","Device SN")));
  }
  @Test void rejectsUnverifiedTaskCombinations() {
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTask("yearly",0,0,"DAY"));
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTask("monthly",0,0,"DAY"));
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTask("daily",0,0,"FIRST"));
    assertThrows(BusinessException.class, () -> RegularReportConfigService.validateTask("daily",0,2,"DAY"));
    assertDoesNotThrow(() -> RegularReportConfigService.validateTask("daily",0,0,"DAY"));
    assertDoesNotThrow(() -> RegularReportConfigService.validateTask("monthly",1,1,"FIRST"));
  }
  @Test void readingConfigurationRequiresExportPermissionBeforeAnyQuery() {
    var access=mock(AccessControl.class);var db=mock(JdbcTemplate.class);
    doThrow(new BusinessException(403,"denied")).when(access).requirePermission("report.export");
    var service=new RegularReportConfigService(new DomainSupport(db,access));
    assertEquals(403,assertThrows(BusinessException.class,()->service.list("template")).status());
    verifyNoInteractions(db);
  }
  @Test void personalConfigurationReadsBindTenantAndActorRatherThanCallerSuppliedIds() {
    var access=mock(AccessControl.class);var db=mock(JdbcTemplate.class);
    when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    when(db.query(anyString(),any(RowMapper.class),eq(11L),eq(7L),eq("template"))).thenReturn(List.of());
    var service=new RegularReportConfigService(new DomainSupport(db,access));
    assertTrue(service.list("template").isEmpty());
    verify(db).query(contains("tenant_id=? AND user_id=? AND category=?"),any(RowMapper.class),eq(11L),eq(7L),eq("template"));
  }
}

