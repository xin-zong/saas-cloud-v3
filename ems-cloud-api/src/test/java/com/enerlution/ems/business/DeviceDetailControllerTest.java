package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class DeviceDetailControllerTest {
  @Test void storedHistoryEligibilityRequiresCurrentAndOriginalDeviceStation(){
    when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("SELECT d.id,d.station_id"))return List.of(Map.of("id",9L));return List.of();});
    controller().detail(7,9);
    verify(db).queryForList(argThat((String sql)->sql.contains("AS \"sourceType\"")&&sql.contains("b.station_id=d.station_id")&&sql.contains("rp.device_id=p.device_id")),eq(9L));
  }
  final JdbcTemplate db=mock(JdbcTemplate.class);
  final AccessControl access=mock(AccessControl.class);
  final StationTelemetryService telemetry=mock(StationTelemetryService.class);
  DeviceDetailController controller(){return new DeviceDetailController(new DomainSupport(db,access),new ObjectMapper(),telemetry);}
  @Test void deniedStationCannotReadDeviceOrPrivateProfile() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(7,"asset.read");
    assertThrows(BusinessException.class,()->controller().detail(7,9));
    verifyNoInteractions(db);
  }
  @Test void deniedEditorCannotLockOrWriteConfiguration() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(7,"asset.edit");
    assertThrows(BusinessException.class,()->controller().configure(7,9,new DeviceDetailController.Configuration(0,List.of(),Map.of())));
    verifyNoInteractions(db);
  }
  @Test void realtimeRequiresSeparateTelemetryPermissionBeforeAnyDataRead() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(7,"telemetry.read");
    assertThrows(BusinessException.class,()->controller().realtime(7,9));
    verifyNoInteractions(db,telemetry);
  }
  @Test void anotherStationDeviceCannotBeReadThroughAuthorizedStation() {
    when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of());
    assertThrows(BusinessException.class,()->controller().detail(7,999));
    verifyNoInteractions(telemetry);
  }
}
