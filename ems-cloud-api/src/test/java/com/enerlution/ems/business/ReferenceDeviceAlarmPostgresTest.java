package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
/** Production alarm SQL over read-only CTE fixtures: no database writes. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class ReferenceDeviceAlarmPostgresTest {
 JdbcTemplate real; AccessControl access; ReferenceDeviceListService service;
 long currentStation=10; boolean dbAlarmAllowed=true; int batchQueries;
 String alarmRows="(1,1,'device',now()-interval '1 hour',NULL::timestamptz,NULL::timestamptz,NULL::timestamptz)",originRows="(1,10)";
 @BeforeEach void setup(){
  real=new JdbcTemplate(new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD")));
  assertEquals("ems_cloud_saas_toyingzhen",real.queryForObject("select current_database()",String.class));
  assertEquals("ems_toyingzhen_owner",real.queryForObject("select current_user",String.class));
  access=mock(AccessControl.class);ScopeTestSupport.useStationIdStubs(access);var stored=mock(StoredDeviceTelemetryService.class);
  when(access.userId()).thenReturn(7L);when(access.client()).thenReturn("web");
  for(String p:List.of("asset.read","alarm.read","telemetry.read","report.export"))when(access.stationIds(p)).thenReturn(List.of(10L,20L));
  when(stored.latest(anyLong(),anyList())).thenReturn(List.of());
  var directory=new JdbcTemplate(){
   @Override public List<Map<String,Object>> queryForList(String sql,Object... args){
    if(sql.contains("st.name AS station_name"))return List.of(new HashMap<>(Map.of("id",1L,"station_id",10L,"station_name","Station","name","PCS","serial_number","SN1","source_type","pcs","category","pcs","communication_status","online")));
    batchQueries++;
    String fixture="""
     WITH device(id,station_id,archived_at) AS (VALUES(1,%d,NULL::timestamptz)),
     station(id,archived_at) AS (VALUES(10,NULL::timestamptz),(20,NULL::timestamptz)),
     saas_effective_station_permission(user_id,client,station_id,permission_code) AS
      (SELECT 7,'web',v.station_id,v.permission_code FROM (VALUES(10,'asset.read'),(20,'asset.read'),(10,'alarm.read'),(20,'alarm.read')) v(station_id,permission_code) WHERE %s OR permission_code<>'alarm.read'),
     alarm(id,device_id,source,occurred_at,recovered_at,closed_at,deleted_at) AS (VALUES %s),
     alarm_business_origin(alarm_id,station_id) AS (VALUES %s)
     """.formatted(currentStation,dbAlarmAllowed,alarmRows,originRows);
    return real.queryForList(fixture+sql,args);
   }
  };
  service=new ReferenceDeviceListService(new DomainSupport(directory,access),stored);
 }
 @SuppressWarnings("unchecked") List<Map<String,Object>> rows(){return (List<Map<String,Object>>)service.list(null,false).get("items");}
 @Test void onlineDeviceRetainsCommunicationAndAlarm(){var r=rows().getFirst();assertEquals("online",r.get("status"));assertEquals(true,r.get("hasAlarm"));assertEquals(1L,r.get("activeAlarmCount"));assertEquals(1,batchQueries);}
 @Test void recoveredClosedDeletedFutureRuleAndOtherDeviceAlarmsAreExcluded(){
  alarmRows="""
   (1,1,'device',now()-interval '1 hour',now(),NULL::timestamptz,NULL::timestamptz),
   (2,1,'device',now()-interval '1 hour',NULL,now(),NULL),
   (3,1,'device',now()-interval '1 hour',NULL,NULL,now()),
   (4,1,'device',now()+interval '1 hour',NULL,NULL,NULL),
   (5,1,'rule',now()-interval '1 hour',NULL,NULL,NULL),
   (6,2,'device',now()-interval '1 hour',NULL,NULL,NULL)
   """;
  var r=rows().getFirst();assertEquals(false,r.get("hasAlarm"));assertEquals(0L,r.get("activeAlarmCount"));
 }
 @Test void futureRecoveryRemainsActiveAndMissingOriginFallsBack(){alarmRows="(2,1,'device',now()-interval '1 hour',now()+interval '1 hour',NULL::timestamptz,NULL::timestamptz)";assertEquals(true,rows().getFirst().get("hasAlarm"));}
 @Test void oldOriginDoesNotFollowDevice(){originRows="(1,20)";assertEquals(false,rows().getFirst().get("hasAlarm"));}
 @Test void transferDuringLoadingRemovesStaleRow(){currentStation=20;assertTrue(rows().isEmpty());}
 @Test void alarmPermissionWorksWithoutTelemetry(){when(access.stationIds("telemetry.read")).thenReturn(List.of());var r=rows().getFirst();assertEquals("unknown",r.get("status"));assertEquals(true,r.get("hasAlarm"));}
 @Test void deniedAndRevokedPermissionsAreUnknown(){when(access.stationIds("alarm.read")).thenReturn(List.of(10L),List.of());assertRedacted(rows().getFirst());when(access.stationIds("alarm.read")).thenReturn(List.of(10L));dbAlarmAllowed=false;assertRedacted(rows().getFirst());}
 void assertRedacted(Map<String,Object> r){assertEquals(false,r.get("alarmAllowed"));assertNull(r.get("hasAlarm"));assertNull(r.get("activeAlarmCount"));}
}

