package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class AlarmFollowupTest {
  @Test void minorRuleUsesIndependentSeverityWithoutChangingExistingLevels() {
    for(String severity:List.of("critical","warning","minor","info")) {
      var field=new AlarmRules.Field("temperature","C","INSTANT","DEVICE");
      var condition=new AlarmRules.Condition(List.of(field),"self",1,"gt",BigDecimal.ONE,null,null,true,false,false);
      var draft=new AlarmRuleService.Draft(9,"温度阈值","DEVICE",19L,severity,List.of(condition),0,1440,0,"",new AlarmRuleService.Notification(false,10,List.of("app_push"),List.of(),false),1);
      assertDoesNotThrow(()->AlarmRuleService.validate(draft));
    }
  }
  @Test void summaryRequiresStationReadBeforeQueryAndRejectsUnknownSources() {
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var service=new AlarmWorkspaceService(new DomainSupport(db,access));
    var start=OffsetDateTime.parse("2026-10-01T00:00:00Z");var end=start.plusMonths(1);
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(9L,"alarm.read");
    assertThrows(BusinessException.class,()->service.summary(9L,"rule",start,end,"UTC"));
    verifyNoInteractions(db);
    assertThrows(BusinessException.class,()->service.summary(null,"unknown",start,end,"UTC"));
    assertThrows(BusinessException.class,()->service.summary(null,"rule",start,start,"UTC"));
    assertThrows(BusinessException.class,()->service.summary(null,"rule",start,end,"bad timezone"));
    verifyNoInteractions(db);
  }
  @Test void summaryQueryUsesEffectiveOriginPermissionsAndHistoricalLifecycle() {
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);when(access.stationPermissionTable()).thenReturn("saas_effective_station_permission");
    var service=new AlarmWorkspaceService(new DomainSupport(db,access));var start=OffsetDateTime.parse("2026-10-01T00:00:00Z");
    service.summary(null,"rule",start,start.plusMonths(1),"Asia/Shanghai");
    var sql=ArgumentCaptor.forClass(String.class);verify(db).queryForList(sql.capture(),eq("Asia/Shanghai"),eq("rule"),isNull(),isNull(),eq(7L),eq(start),eq(start.plusMonths(1)));
    assertTrue(sql.getValue().contains("a.title AS name"));assertTrue(sql.getValue().contains("GROUP BY a.severity,a.title,day"));assertTrue(sql.getValue().contains("alarm_business_origin"));assertTrue(sql.getValue().contains("p.permission_code='alarm.read'"));assertTrue(sql.getValue().contains("a.closed_at IS NOT NULL OR a.recovered_at<=now()"));assertTrue(sql.getValue().contains("a.deleted_at IS NULL"));assertTrue(sql.getValue().contains("a.occurred_at<?"));
  }
  @Test void recoveredViewExcludesArtificiallyClosedEventsAndSortIsWhitelisted() {
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);when(access.stationPermissionTable()).thenReturn("saas_effective_station_permission");
    when(db.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(0L);
    var service=new AlarmWorkspaceService(new DomainSupport(db,access));
    service.list(null,"recovered","device",null,null,null,null,null,null,50,0,"asc");
    var sql=ArgumentCaptor.forClass(String.class);verify(db).queryForList(sql.capture(),any(Object[].class));
    assertTrue(sql.getValue().contains("a.closed_at IS NULL AND a.recovered_at<=now()"));assertTrue(sql.getValue().contains("ORDER BY a.occurred_at ASC,a.id ASC"));
    assertThrows(BusinessException.class,()->service.list(null,"live",null,null,null,null,null,null,null,50,0,"drop"));
  }
}
