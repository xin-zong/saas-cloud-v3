package com.enerlution.ems.business;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class ReferenceDeviceSamplesControllerTest {
 @Test void requiresBothPermissionsBeforeReading(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(16,"telemetry.read");
  assertThrows(BusinessException.class,()->new ReferenceDeviceSamplesController(new DomainSupport(db,access)).latest(16,100));
  verify(access).requireStationPermission(16,"asset.read");verifyNoInteractions(db);
 }
 @Test void rejectsDeviceFromAnotherStation(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList("SELECT id FROM device WHERE id=? AND station_id=?",100L,16L)).thenReturn(List.of());
  assertThrows(BusinessException.class,()->new ReferenceDeviceSamplesController(new DomainSupport(db,access)).latest(16,100));
  verify(db).queryForList("SELECT id FROM device WHERE id=? AND station_id=?",100L,16L);verifyNoMoreInteractions(db);
 }
 @Test void rejectsCrossDevicePointAndUnboundedHistory(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList("SELECT id FROM device WHERE id=? AND station_id=?",100L,16L)).thenReturn(List.of(Map.of("id",100L)));
  var c=new ReferenceDeviceSamplesController(new DomainSupport(db,access));var at=Instant.parse("2026-10-18T00:00:00Z");
  assertThrows(BusinessException.class,()->c.history(16,100,1,at,at));
  assertThrows(BusinessException.class,()->c.history(16,100,1,at,at.plusSeconds(367L*86400)));
  assertThrows(BusinessException.class,()->c.history(16,100,1,at,at.plusSeconds(3600)));
  verify(db).queryForList("SELECT id FROM reference_device_point WHERE id=? AND device_id=?",1L,100L);
 }
}
