package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class DeviceConnectionsControllerTest {
 @Test void deniedReaderCannotQueryTopology(){var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(4,"asset.read");assertThrows(BusinessException.class,()->new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8));verifyNoInteractions(db);}

 @Test void connectionTypeComesFromMetadataRatherThanCustomName(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  var node=new java.util.LinkedHashMap<String,Object>(java.util.Map.of("id",9L,"name","Custom arbitrary label","source_type","Battery Stack","category","BMS"));
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation->{String sql=invocation.getArgument(0);if(sql.contains("SELECT d.id FROM device d JOIN station"))return java.util.List.of(java.util.Map.of("id",8L));if(sql.contains("SELECT d.id,d.name"))return java.util.List.of(node);return java.util.List.of();});
  var result=(java.util.Map<?,?>)new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8).data();
  var saved=(java.util.Map<?,?>)((java.util.List<?>)result.get("nodes")).getFirst();assertEquals("battery-stack",saved.get("type"));assertEquals("Custom arbitrary label",saved.get("name"));
 }

 @Test void assetOnlyReaderKeepsTopologyButCannotReadCommunicationSamples(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.userId()).thenReturn(5L);
  var node=new java.util.LinkedHashMap<String,Object>(java.util.Map.of("id",9L,"name","Asset","serial","LOCAL-SN","source_type","PCS","category","PCS","status","online","updatedAt","2026-10-19T00:00:00Z"));
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation->{String sql=invocation.getArgument(0);if(sql.contains("SELECT d.id FROM device d JOIN station"))return java.util.List.of(java.util.Map.of("id",8L));if(sql.contains("SELECT d.id,d.name"))return java.util.List.of(node);if(sql.contains("SELECT DISTINCT"))return java.util.List.of(java.util.Map.of("parentId",8L,"childId",9L));return java.util.List.of();});
  var result=(java.util.Map<?,?>)new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8).data();
  var saved=(java.util.Map<?,?>)((java.util.List<?>)result.get("nodes")).getFirst();assertEquals("unknown",saved.get("status"));assertNull(saved.get("updatedAt"));assertEquals("LOCAL-SN",saved.get("serial"));assertEquals("pcs",saved.get("type"));assertEquals(1,((java.util.List<?>)result.get("edges")).size());
 }
 @Test void telemetryPermissionIsReadAgainAtResponseAfterRevocationDuringQuery(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.userId()).thenReturn(5L);var allowed=new java.util.concurrent.atomic.AtomicBoolean(true);
  when(access.hasStationPermission(5,4,"telemetry.read")).thenAnswer(invocation->allowed.get());
  var node=new java.util.LinkedHashMap<String,Object>(java.util.Map.of("id",9L,"status","online","updatedAt","2026-10-19T00:00:00Z"));
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation->{String sql=invocation.getArgument(0);if(sql.contains("SELECT d.id FROM device d JOIN station"))return java.util.List.of(java.util.Map.of("id",8L));if(sql.contains("SELECT d.id,d.name"))return java.util.List.of(node);allowed.set(false);return java.util.List.of();});
  var result=(java.util.Map<?,?>)new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8).data();var saved=(java.util.Map<?,?>)((java.util.List<?>)result.get("nodes")).getFirst();assertEquals("unknown",saved.get("status"));assertNull(saved.get("updatedAt"));verify(access).hasStationPermission(5,4,"telemetry.read");
 }
 @Test void telemetryReaderRetainsStatusAndSampleTime(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.userId()).thenReturn(5L);when(access.hasStationPermission(5,4,"telemetry.read")).thenReturn(true);
  var node=new java.util.LinkedHashMap<String,Object>(java.util.Map.of("id",9L,"status","online","updatedAt","2026-10-19T00:00:00Z"));
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation->{String sql=invocation.getArgument(0);if(sql.contains("SELECT d.id FROM device d JOIN station"))return java.util.List.of(java.util.Map.of("id",8L));if(sql.contains("SELECT d.id,d.name"))return java.util.List.of(node);return java.util.List.of();});
  var result=(java.util.Map<?,?>)new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8).data();var saved=(java.util.Map<?,?>)((java.util.List<?>)result.get("nodes")).getFirst();assertEquals("online",saved.get("status"));assertEquals("2026-10-19T00:00:00Z",saved.get("updatedAt"));
 }
 @Test void deviceMovedAfterFirstReadCannotReturnOldStationTopology(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var checks=new java.util.concurrent.atomic.AtomicInteger();
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation->{String sql=invocation.getArgument(0);if(sql.contains("SELECT d.id FROM device d JOIN station"))return checks.incrementAndGet()==1?java.util.List.of(java.util.Map.of("id",8L)):java.util.List.of();return java.util.List.of();});
  assertThrows(BusinessException.class,()->new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8));assertEquals(2,checks.get());
 }
 @Test void capturedObservationIsRedactedWithoutTelemetryPermission(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(invocation->{String sql=invocation.getArgument(0);if(sql.contains("SELECT d.id FROM device d JOIN station"))return java.util.List.of(java.util.Map.of("id",8L));if(sql.contains("FROM station_reference_connection_node"))return java.util.List.of(new java.util.LinkedHashMap<String,Object>(java.util.Map.of("id",1L,"serial","TEST","source_type","电池包","sort_order",0,"observed_status","online","observed_at","2026-10-19T00:00:00Z","captured_at","2026-10-19T00:05:00Z")));return java.util.List.of();});
  var result=(java.util.Map<?,?>)new DeviceConnectionsController(new DomainSupport(db,access)).read(4,8).data();var saved=(java.util.Map<?,?>)((java.util.List<?>)result.get("nodes")).getFirst();assertEquals("unknown",saved.get("status"));assertNull(saved.get("observedStatus"));assertNull(saved.get("observedAt"));assertNull(saved.get("capturedAt"));assertNull(saved.get("linkedDeviceId"));
 }}


