package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class MonitorDashboardCaptureTest {
 @Test void globalTotalsRequireTheExactCompleteAuthorizedStationSet(){
  var a=Map.<String,Object>of("id","12","telemetryAllowed",true);
  var b=Map.<String,Object>of("id","13","telemetryAllowed",true);
  assertTrue(MonitorDashboardCapture.eligible(Set.of("12","13"),List.of(a,b)));
  assertFalse(MonitorDashboardCapture.eligible(Set.of("12","13"),List.of(a)));
  assertFalse(MonitorDashboardCapture.eligible(Set.of("12"),List.of(a,b)));
  assertFalse(MonitorDashboardCapture.eligible(Set.of("12","13"),List.of(a,Map.of("id","13","telemetryAllowed",false))));
  assertFalse(MonitorDashboardCapture.eligible(Set.of(),List.of()));
 }
 @Test void sourceAlarmCountIsRedactedWithoutAlarmPermission(){
  var summary=new HashMap<String,Object>(Map.of("alarmSites",3,"pvCapacity",10));
  MonitorDashboardCapture.restrictAlarm(summary,List.of(Map.of("alarmAllowed",true)));assertEquals(3,summary.get("alarmSites"));
  MonitorDashboardCapture.restrictAlarm(summary,List.of(Map.of("alarmAllowed",false)));assertNull(summary.get("alarmSites"));assertEquals(10,summary.get("pvCapacity"));
 }
}
