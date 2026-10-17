package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class AlarmWorkspaceServiceTest {
  private Map<String,Object> row(){return new HashMap<>(Map.of("id",17L,"station_id",9L,"version",2L,"lifecycle","active"));}
  @Test void detailReadingDoesNotAcknowledgeOrCreateReceiptAndContainsNoInventedSamples(){
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var row=row();
    when(access.userId()).thenReturn(7L);
    when(db.queryForList(contains("WHERE a.id=?"),eq(17L))).thenReturn(List.of(row));
    when(db.queryForObject(contains("alarm_read_receipt"),eq(Boolean.class),eq(17L),eq(7L))).thenReturn(false);
    var result=new AlarmWorkspaceService(new DomainSupport(db,access)).detail(17L);
    assertEquals(false,result.get("read_flag"));assertEquals(List.of(),result.get("samples"));assertNull(result.get("acknowledged_at"));
    verify(access).requireStationPermission(9L,"alarm.read");verify(db,never()).update(anyString(),any(Object[].class));
  }
  @Test void staleCloseAndActiveDeleteCannotChangeState(){
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
    when(db.queryForList(contains("WHERE a.id=?"),eq(17L))).thenAnswer(inv->List.of(row()));
    var service=new AlarmWorkspaceService(new DomainSupport(db,access));
    assertEquals(409,assertThrows(BusinessException.class,()->service.action(17,"close",1,"close")).status());
    assertEquals(409,assertThrows(BusinessException.class,()->service.action(17,"delete",2,"delete")).status());
    verify(db,never()).update(anyString(),any(Object[].class));
  }
  @Test void batchReceiptValidatesEveryStationBeforeAnyWrite(){
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
    when(db.queryForList(contains("WHERE a.id=?"),eq(17L))).thenReturn(List.of(row()));
    var denied=row();denied.put("id",18L);denied.put("station_id",10L);
    when(db.queryForList(contains("WHERE a.id=?"),eq(18L))).thenReturn(List.of(denied));
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(10L,"alarm.read");
    var service=new AlarmWorkspaceService(new DomainSupport(db,access));
    assertEquals(403,assertThrows(BusinessException.class,()->service.read(List.of(17L,18L))).status());
    verify(db,never()).update(anyString(),any(Object[].class));
  }
}
