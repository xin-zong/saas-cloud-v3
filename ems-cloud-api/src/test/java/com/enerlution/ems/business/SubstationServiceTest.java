package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.auth.AccessControl;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class SubstationServiceTest {
 @Test void validatesSystemsAndCapacityWithoutGuessingUnknownParent() {
  assertThrows(BusinessException.class,()->SubstationService.validateSystems(List.of("charge")));
  assertThrows(BusinessException.class,()->SubstationService.validateSystems(List.of("pv","mppt")));
  assertEquals(List.of("pv","storage"),SubstationService.validateSystems(List.of("pv","storage")));
  assertThrows(BusinessException.class,()->SubstationService.capacity(new BigDecimal("101"),new BigDecimal("100"),true));
  assertThrows(BusinessException.class,()->SubstationService.capacity(new BigDecimal("-1"),null,true));
  assertThrows(BusinessException.class,()->SubstationService.capacity(null,null,true));
  assertEquals(new BigDecimal("10"),SubstationService.capacity(new BigDecimal("10"),null,true));
 }
 @Test void permissionDeniedBeforeAnyDatabaseReadOrWrite() {
  var access=mock(AccessControl.class);var db=mock(JdbcTemplate.class);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.read");
  var service=new SubstationService(new DomainSupport(db,access),mock(StationTelemetryService.class));
  assertThrows(BusinessException.class,()->service.list(101));
  assertThrows(BusinessException.class,()->service.create(101,null));verifyNoInteractions(db);
 }
}
