package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class StationOperationLogServiceTest {
  final JdbcTemplate db=mock(JdbcTemplate.class);
  final AccessControl access=mock(AccessControl.class);
  final StationOperationLogService logs=new StationOperationLogService(new DomainSupport(db,access));
  @org.junit.jupiter.api.BeforeEach void tenant() { when(db.queryForObject("SELECT tenant_id FROM station WHERE id=?",Long.class,101L)).thenReturn(11L); }
  @Test void bothStationPermissionsAreRequiredBeforeQuery() {
    doThrow(new BusinessException(403,"denied")).when(access).requireTenantPermission(11,"audit.read");
    assertEquals(403,assertThrows(BusinessException.class,()->logs.list(101,null,null,null,null,null,null,20,0)).status());
    verify(access).requireStationPermission(101,"asset.read");verify(db,never()).queryForList(anyString(),any(Object[].class));
  }
  @Test void invalidPaginationTimeAndLongTermsRejectWithoutQuery() {
    assertThrows(BusinessException.class,()->logs.list(101,null,null,null,null,null,null,201,0));
    assertThrows(BusinessException.class,()->logs.list(101,null,null,null,null,null,null,20,-1));
    var now=Instant.now();assertThrows(BusinessException.class,()->logs.list(101,null,null,null,null,now,now,20,0));
    assertThrows(BusinessException.class,()->StationOperationLogService.term("a".repeat(201)));
    verify(db,never()).queryForList(anyString(),any(Object[].class));
  }
  @Test void literalWildcardsNeverBroadenFilters() {
    assertNull(StationOperationLogService.term(" "));
    assertEquals("%a\\%\\_\\\\%",StationOperationLogService.term(" a%_\\ "));
  }
}
