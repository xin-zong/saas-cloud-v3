package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ReferenceDeviceQueryScopeTest {
  @Test void selectedDeviceAvoidsUnrelatedDirectoryLimitAndTelemetry() {
    var calls=new ArrayList<String>();
    var db=new JdbcTemplate(){
      @Override public List<Map<String,Object>> queryForList(String sql,Object... args){
        calls.add(sql);
        if(sql.contains("ORDER BY d.id LIMIT 2001")){
          var row=new HashMap<String,Object>(Map.of("id",11L,"station_id",4L,"station_name","One","name","Device","source_type","inverter","serial_number","SN"));
          return sql.contains("d.id IN (")?List.of(row):Collections.nCopies(2001,row);
        }
        if(sql.contains("COUNT(a.id)"))return List.of(new HashMap<>(Map.of("id",11L,"station_id",4L,"alarm_allowed",false,"active_alarm_count",0L)));
        return List.of();
      }
    };
    var access=mock(AccessControl.class);ScopeTestSupport.useStationIdStubs(access);when(access.client()).thenReturn("web");
    for(String code:List.of("asset.read","telemetry.read","alarm.read","report.export"))when(access.stationIds(code)).thenReturn(List.of(4L));
    var service=new ReferenceDeviceListService(new DomainSupport(db,access),new StoredDeviceTelemetryService(db,new ObjectMapper()));
    var result=service.list(null,true,List.of(11L));
    assertEquals(1,((List<?>)result.get("items")).size());
    assertTrue(calls.stream().anyMatch(sql->sql.contains("reference_device_sample")&&sql.contains("d.id IN (11)")),"latest must exclude unrelated devices before loading samples");
    verify(access,times(2)).requireStationPermission(4L,"report.export");
  }
}

