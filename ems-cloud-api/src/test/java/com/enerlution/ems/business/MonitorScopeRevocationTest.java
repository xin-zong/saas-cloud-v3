package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class MonitorScopeRevocationTest {
 @Test void unavailableTargetTelemetryKeepsMetricsEmptyAndMarksAvailability() {
  var raw=new HashMap<String,Object>(Map.of("id","4","name","One","code","ONE","scene","PV","imported",false,"replica_visible",true,"device_count",0L,"tags","[]","connections",0L,"connected",0L));
  raw.putAll(Map.of("known_connections",0L,"alarm_count",0L,"telemetry_allowed",true,"alarm_allowed",true));
  var db=new JdbcTemplate(){
   @Override public List<Map<String,Object>> queryForList(String sql,Object... args){return sql.contains("WITH permitted")?List.of(raw):List.of();}
   @Override public List<Map<String,Object>> queryForList(String sql){return List.of();}
  };
  var access=mock(AccessControl.class);when(access.client()).thenReturn("web");
  when(access.stationScopes(anyCollection())).thenReturn(Map.of("asset.read",List.of(4L),"telemetry.read",List.of(4L),"alarm.read",List.of(4L)));
  var telemetry=mock(StationTelemetryService.class);when(telemetry.monitorSnapshot(4)).thenThrow(new BusinessException(503,"unavailable"));
  var service=new MonitorWorkspaceService(new DomainSupport(db,access),new ObjectMapper(),telemetry){@Override public Preference preferences(){return new Preference(Map.of(),List.of(),0);}};
  var result=service.workspace(Map.of("sourceMode","current"),false);var item=(Map<?,?>)((List<?>)result.get("items")).getFirst();
  assertEquals(true,item.get("telemetryUnavailable"));assertFalse(((Map<?,?>)item.get("metrics")).containsKey("pvPower"));assertNull(item.get("updatedAt"));
 }
 @Test void freshExitBatchRejectsStationRevokedDuringWorkspaceRead() {
  var raw=new HashMap<String,Object>();
  raw.putAll(Map.of("id","4","name","One","code","ONE","scene","Hybrid","imported",true,"replica_visible",true,"device_count",0L,"tags","[]","connections",0L,"connected",0L));
  raw.putAll(Map.of("known_connections",0L,"alarm_count",0L,"telemetry_allowed",true,"alarm_allowed",true,"captured_at",new java.sql.Timestamp(1000),"captured_metrics","{}","captured_communication","online"));
  var db=new JdbcTemplate(){
   @Override public List<Map<String,Object>> queryForList(String sql,Object... args){return sql.contains("WITH permitted")?List.of(raw):List.of();}
   @Override public List<Map<String,Object>> queryForList(String sql){return List.of();}
  };
  var access=mock(AccessControl.class);when(access.client()).thenReturn("web");
  when(access.stationScopes(anyCollection())).thenReturn(Map.of("asset.read",List.of(4L),"telemetry.read",List.of(4L),"alarm.read",List.of(4L)),Map.of("asset.read",List.of(),"telemetry.read",List.of(4L),"alarm.read",List.of(4L)));
  var service=new MonitorWorkspaceService(new DomainSupport(db,access),new ObjectMapper(),mock(StationTelemetryService.class)){
    @Override public Preference preferences(){return new Preference(Map.of(),List.of(),0);}
  };
  assertEquals(403,assertThrows(BusinessException.class,()->service.workspace(Map.of(),false)).status());
  verify(access,times(2)).stationScopes(List.of("asset.read","telemetry.read","alarm.read"));
 }
}
