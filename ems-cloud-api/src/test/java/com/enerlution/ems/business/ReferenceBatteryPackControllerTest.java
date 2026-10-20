package com.enerlution.ems.business;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
class ReferenceBatteryPackControllerTest {
 @Test void batchHistoryChecksPackBeforeAndAfterSingleHistoryRead(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var stored=mock(StoredDeviceTelemetryService.class);var reads=new java.util.concurrent.atomic.AtomicInteger();
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE")){reads.incrementAndGet();return List.of(identity());}return List.of(points().getFirst());});
  when(stored.directory(2,List.of(91L))).thenReturn(List.of(Map.of("id",91L,"device_id",8L,"supportedAggregations",List.of("last"))));when(stored.historyRows(eq(List.of(91L)),anyLong(),anyLong())).thenReturn(new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode());
  var data=(Map<?,?>)new ReferenceBatteryPackController(new DomainSupport(db,access),stored).historyBatch(2,3,List.of(91L),from(),from().plusDays(1),15,"last").data();assertEquals(1,((List<?>)data.get("items")).size());assertEquals(2,reads.get());verify(stored).historyRows(eq(List.of(91L)),anyLong(),anyLong());
 }
 @Test void manyCellsUseOneBoundedLatestQuery(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.hasStationPermission(anyLong(),eq(2L),eq("telemetry.read"))).thenReturn(true);
  var latest=new java.util.concurrent.atomic.AtomicInteger();
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE"))return List.of(identity());if(sql.contains("FROM reference_device_point"))return java.util.stream.IntStream.rangeClosed(1,50).mapToObj(n->Map.<String,Object>of("id",90L+n,"reference_id",190L+n,"name","电池包 PACK_1 · 电压 #"+n,"unit","V")).toList();if(sql.contains("reference_device_sample")){latest.incrementAndGet();return List.of();}return List.of();});
  new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3);assertEquals(1,latest.get());
 }
 @Test void identityMustMatchWholePackAndPreserveMissingTemperatureIndex(){
  assertEquals(3,ReferenceBatteryPackController.cell("PACK_1","电池包 PACK_1 · 温度 #3","℃").get("index"));
  assertTrue(ReferenceBatteryPackController.cell("PACK_1","电池包 PACK_10 · 温度 #3","℃").isEmpty());
  assertTrue(ReferenceBatteryPackController.cell("PACK_1","电池包 PACK_1 · 电压 #1","℃").isEmpty());
 }
 @Test void assetPermissionDeniedBeforeQuery(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(2,"asset.read");
  assertThrows(BusinessException.class,()->new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3));verifyNoInteractions(db);
 }
 @Test void noVerifiedParentNeverReturnsPack(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList(anyString(),any(Object[].class))).thenReturn(List.of());
  assertThrows(BusinessException.class,()->new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3));
 }
 private Map<String,Object> identity(){return Map.of("id",3L,"serial","PACK_1","parentDeviceId",8L);}
 private List<Map<String,Object>> points(){return List.of(Map.of("id",91L,"reference_id",19L,"name","电池包 PACK_1 · 温度 #3","unit","℃"),Map.of("id",92L,"reference_id",20L,"name","电池包 PACK_10 · 温度 #3","unit","℃"));}
 @Test void noTelemetryPermissionDoesNotReadSamples(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE"))return List.of(identity());if(sql.contains("FROM reference_device_point"))return points();fail("Unexpected sample read");return List.of();});
  var result=(Map<?,?>)new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3).data();
  assertTrue(result.containsKey("energyGroup"));assertNull(result.get("energyGroup"));assertEquals(1,((List<?>)result.get("points")).size());assertEquals(List.of(),result.get("observations"));assertEquals(8L,result.get("historyDeviceId"));
 }
 @Test void samplesUseActualPointIdAndZeroIsRetained(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);when(access.hasStationPermission(7,2,"telemetry.read")).thenReturn(true);
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE"))return List.of(identity());if(sql.contains("FROM reference_device_point"))return points();return List.of(Map.of("reference_id",19L,"value",0,"quality","observed","sourceTime","saved"));});
  var result=(Map<?,?>)new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3).data();var samples=(List<?>)result.get("observations");assertEquals(1,samples.size());var sample=(Map<?,?>)samples.getFirst();assertEquals(91L,sample.get("pointId"));assertEquals(0,sample.get("value"));assertEquals(3,sample.get("index"));
 }
 @Test void ancestorUnavailableOnFinalCheckRefusesResponse(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var reads=new java.util.concurrent.atomic.AtomicInteger();
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE"))return reads.incrementAndGet()==1?List.of(identity()):List.of();return points();});
  assertThrows(BusinessException.class,()->new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3));assertEquals(2,reads.get());
 }
 @Test void conflictingSameTimeSampleIsInvalidAndNotDisplayed(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.hasStationPermission(anyLong(),eq(2L),eq("telemetry.read"))).thenReturn(true);
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE"))return List.of(identity());if(sql.contains("FROM reference_device_point"))return points();return List.of(Map.of("reference_id",19L,"value",4,"quality","observed","conflict",true));});
  var result=(Map<?,?>)new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3).data();var sample=(Map<?,?>)((List<?>)result.get("observations")).getFirst();assertNull(sample.get("value"));assertEquals("invalid",sample.get("quality"));
 }
 private java.time.OffsetDateTime from(){return java.time.OffsetDateTime.parse("2026-01-01T00:00:00Z");}
 @Test void historyRejectsOtherPackPointBeforeService(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var stored=mock(StoredDeviceTelemetryService.class);
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->((String)i.getArgument(0)).contains("WITH RECURSIVE")?List.of(identity()):List.of(points().get(1)));
  assertThrows(BusinessException.class,()->new ReferenceBatteryPackController(new DomainSupport(db,access),stored).history(2,3,92,from(),from().plusDays(1),15,"avg"));verifyNoInteractions(stored);
 }
 @Test void historyRevalidatesAncestryAfterService(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var stored=mock(StoredDeviceTelemetryService.class);var reads=new java.util.concurrent.atomic.AtomicInteger();
  when(stored.historyRows(anyLong(),anyLong(),anyLong())).thenReturn(new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode());
  when(stored.directory(eq(2L),eq(List.of(91L)))).thenReturn(List.of(Map.of("supportedAggregations",List.of("avg"))));
  when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{if(((String)i.getArgument(0)).contains("WITH RECURSIVE"))return reads.incrementAndGet()==1?List.of(identity()):List.of();return List.of(points().getFirst());});
  assertThrows(BusinessException.class,()->new ReferenceBatteryPackController(new DomainSupport(db,access),stored).history(2,3,91,from(),from().plusDays(1),15,"avg"));verify(stored).historyRows(eq(91L),anyLong(),anyLong());assertEquals(2,reads.get());
 }
 @Test void historyPermissionDeniedBeforeAnyQuery(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var stored=mock(StoredDeviceTelemetryService.class);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(2,"telemetry.read");
  assertThrows(BusinessException.class,()->new ReferenceBatteryPackController(new DomainSupport(db,access),stored).history(2,3,91,from(),from().plusDays(1),15,"avg"));verifyNoInteractions(db,stored);
 }
 @Test void energyIsOptionalAndRedactedAfterPermissionRecheck(){
  for(int mode=0;mode<4;mode++){
   final int scenario=mode;var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
   when(access.hasStationPermission(anyLong(),eq(2L),eq("telemetry.read"))).thenReturn(true,scenario!=3);
   var energy=new LinkedHashMap<String,Object>();energy.put("chargeKwh",scenario==2?null:0);energy.put("dischargeKwh",null);energy.put("sourceTime","saved");energy.put("capturedAt","captured");
   when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(i->{String sql=i.getArgument(0);if(sql.contains("WITH RECURSIVE")){assertFalse(sql.contains("charge_kwh"));return List.of(identity());}if(sql.contains("FROM reference_device_point"))return points();if(sql.contains("FROM reference_battery_pack_capture"))return scenario==0?List.of():List.of(energy);return List.of();});
   var result=(Map<?,?>)new ReferenceBatteryPackController(new DomainSupport(db,access)).read(2,3).data();
   assertTrue(result.containsKey("energyGroup"));
   if(scenario==0||scenario==3)assertNull(result.get("energyGroup"));else {var group=(Map<?,?>)result.get("energyGroup");assertEquals(scenario==2?null:0,group.get("chargeKwh"));assertNull(group.get("dischargeKwh"));assertEquals("saved",group.get("sourceTime"));assertEquals("captured",group.get("capturedAt"));}
   assertFalse(((Map<?,?>)result.get("archive")).containsKey("chargeKwh"));
  }
 }
}
