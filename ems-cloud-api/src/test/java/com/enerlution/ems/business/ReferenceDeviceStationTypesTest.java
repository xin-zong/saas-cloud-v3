package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class ReferenceDeviceStationTypesTest {
 @Test void stationOnlyTypesAndExactChildMembershipSurviveWithoutInventedSamples(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);ScopeTestSupport.useStationIdStubs(access);var stored=mock(StoredDeviceTelemetryService.class);
  when(access.stationIds("asset.read")).thenReturn(List.of(4L));when(access.stationIds("telemetry.read")).thenReturn(List.of());when(access.stationIds("report.export")).thenReturn(List.of());
  var child=UUID.fromString("5196420b-59b7-47a6-a11c-85e4c2266f9d");var raw=new ArrayList<Map<String,Object>>();int id=0;
  for(String source:List.of("9","60","53")){var row=new LinkedHashMap<String,Object>();row.put("id",++id);row.put("station_id",4L);row.put("station_name","Local station");row.put("name","Custom name");row.put("serial_number","LOCAL-"+id);row.put("source_type",source);row.put("category","OTHER");row.put("substation_id",child);row.put("child_station_name","Child local");raw.add(row);}
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation -> {
   String sql=invocation.getArgument(0);
   if(sql.contains("st.name AS station_name"))return raw;
   assertTrue(sql.contains("active_alarm_count"));
   return raw.stream().map(row -> Map.<String,Object>of("id",row.get("id"),"station_id",4L,"alarm_allowed",false,"active_alarm_count",0L)).toList();
  });
  var result=new ReferenceDeviceListService(new DomainSupport(db,access),stored).list(4L,false);var items=(List<Map<String,Object>>)result.get("items");
  assertEquals(List.of("environment","mppt","liquid-cooler"),items.stream().map(row->row.get("type")).toList());
  for(var row:items){var fields=(Map<?,?>)row.get("fields");assertEquals(child.toString(),fields.get("substationId"));assertEquals("Child local",fields.get("childStationName"));assertEquals("unknown",row.get("status"));assertNull(row.get("updatedAt"));assertTrue(((List<?>)row.get("points")).isEmpty());}
  verifyNoInteractions(stored);
 }
}

