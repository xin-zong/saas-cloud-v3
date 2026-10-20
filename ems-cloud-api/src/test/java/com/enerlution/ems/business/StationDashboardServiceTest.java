package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class StationDashboardServiceTest {
 @Test void assetDeniedNeverQueriesDatabase(){
  var db=mock(JdbcTemplate.class);var a=mock(AccessControl.class);
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"asset.read");
  assertThrows(BusinessException.class,()->new StationDashboardService(new DomainSupport(db,a)).read(21,null));verifyNoInteractions(db);
 }
 @Test void snapshotDistinguishesZeroMissingAndFixedSourceTime(){
  var snapshot=StationDashboardService.decode("{\"sourceTime\":\"2026-10-18T23:30:00+08:00\",\"flow\":{\"mpptKw\":0},\"panels\":[]}");
  assertEquals(0,snapshot.flow().mpptKw().intValue());assertNull(snapshot.flow().gridKw());
  assertEquals("2026-10-18T23:30:00+08:00",snapshot.sourceTime());
 }
 @Test void telemetryDeniedDoesNotExposeSnapshotMeasurements(){
  var db=mock(JdbcTemplate.class);var a=mock(AccessControl.class);
  when(db.queryForList(anyString(),eq(21L))).thenReturn(List.of(Map.of("name","station")),List.of(Map.of("dataset_id","test","dataset_version",1,"payload","{\"sourceTime\":\"2026-10-18T23:30:00+08:00\",\"flow\":{\"mpptKw\":0},\"panels\":[]}")));
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"telemetry.read");
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"alarm.read");
  var out=new StationDashboardService(new DomainSupport(db,a)).read(21,null);
  assertFalse(out.telemetryAvailable());assertNull(out.flow());assertNull(out.sourceTime());assertTrue(out.panels().isEmpty());assertNull(out.alarmTotal());
 }
 @Test void childFromAnotherStationRejectedBeforeLoadingDataset(){
  var db=mock(JdbcTemplate.class);var a=mock(AccessControl.class);var child=UUID.randomUUID();
  when(db.queryForList(anyString(),eq(21L))).thenReturn(List.of(Map.of("name","station")));
  when(db.queryForList(anyString(),eq(21L),eq(child))).thenReturn(List.of());
  var error=assertThrows(BusinessException.class,()->new StationDashboardService(new DomainSupport(db,a)).read(21,child));
  assertEquals(404,error.status());verify(a,never()).requireStationPermission(21,"telemetry.read");
 }
 @Test void revokedTelemetryAtResponseBoundaryIsRejected(){
  var db=mock(JdbcTemplate.class);var a=mock(AccessControl.class);
  when(db.queryForList(anyString(),eq(21L))).thenReturn(List.of(Map.of("name","station")),List.of());
  doNothing().doThrow(new BusinessException(403,"revoked")).when(a).requireStationPermission(21,"telemetry.read");
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"alarm.read");
  assertEquals(403,assertThrows(BusinessException.class,()->new StationDashboardService(new DomainSupport(db,a)).read(21,null)).status());
 }
 @Test void freshEquipmentStatusIsRedactedWithoutTelemetryPermission(){
  var db=mock(JdbcTemplate.class);var a=mock(AccessControl.class);
  when(db.queryForList(anyString(),eq(21L))).thenReturn(List.of(Map.of("name","station")),List.of());
  when(db.queryForList(contains("FROM device d"),eq(21L),isNull(),isNull())).thenReturn(List.of(Map.of("id",123L,"source_type","PCS","status","online")));
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"telemetry.read");
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"alarm.read");
  var out=new StationDashboardService(new DomainSupport(db,a)).read(21,null);
  assertEquals(1,out.equipment().size());assertEquals("unknown",out.equipment().getFirst().status());
  assertEquals(List.of("123"),out.equipment().getFirst().deviceIds());assertEquals(1,out.equipment().getFirst().count());
 }
 @Test void equipmentUsesCanonicalDeviceTypesAndCategoryFallback(){
  var db=mock(JdbcTemplate.class);var a=mock(AccessControl.class);
  when(db.queryForList(anyString(),eq(21L))).thenReturn(List.of(Map.of("name","station")),List.of());
  when(db.queryForList(contains("FROM device d"),eq(21L),isNull(),isNull())).thenReturn(List.of(
    Map.of("id",1L,"source_type","31001","category","BMS","status","online"),
    Map.of("id",2L,"source_type","5","category","MTR","status","online"),
    Map.of("id",3L,"category","BESS","status","unknown"),
    Map.of("id",4L,"source_type","unrecognized","category","OTHER","status","unknown")));
  doThrow(new BusinessException(403,"denied")).when(a).requireStationPermission(21,"alarm.read");
  var out=new StationDashboardService(new DomainSupport(db,a)).read(21,null);
  assertEquals(List.of("battery-cluster","meter","cabinet","other"),out.equipment().stream().map(StationDashboardService.Cell::type).toList());
 }
}
