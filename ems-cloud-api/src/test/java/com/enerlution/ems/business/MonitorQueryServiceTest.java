package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.common.ApiResponse;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class MonitorQueryServiceTest {
 @Test void validatesDatesMetricAndFiltersBeforeReading() {
  var db=mock(JdbcTemplate.class); var service=new MonitorQueryService(new DomainSupport(db,mock(AccessControl.class)),mock(TelemetryController.class));
  assertEquals(400,assertThrows(BusinessException.class,()->service.history(List.of(),"unknown",OffsetDateTime.now().minusDays(1),OffsetDateTime.now(),15,false)).status());
  assertEquals(400,assertThrows(BusinessException.class,()->service.history(List.of(),"pvPower",OffsetDateTime.now().minusDays(32),OffsetDateTime.now(),15,false)).status());
  assertThrows(BusinessException.class,()->service.stations("invalid","all",""));
  verifyNoInteractions(db);
 }
 @Test void rejectsWholeQueryAboveGlobalBucketBudgetInsteadOfTruncating(){
  var service=new MonitorQueryService(new DomainSupport(mock(JdbcTemplate.class),mock(AccessControl.class)),mock(TelemetryController.class));
  var ids=java.util.stream.LongStream.rangeClosed(1,100).boxed().toList();
  assertEquals(413,assertThrows(BusinessException.class,()->service.history(ids,"pvPower",OffsetDateTime.now().minusDays(30),OffsetDateTime.now(),5,false)).status());
 }
 @Test void explicitStationScopeNeverSilentlyDropsForbiddenStation() {
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.stationIds("asset.read")).thenReturn(List.of(1L));
  var service=new MonitorQueryService(new DomainSupport(db,access),mock(TelemetryController.class));
  assertEquals(403,assertThrows(BusinessException.class,()->service.history(List.of(2L),"pvPower",OffsetDateTime.now().minusDays(1),OffsetDateTime.now(),15,false)).status());
  verifyNoInteractions(db);
 }
 @Test void rankExcludesMissingValuesAndDoesNotInterpretPowerAsEnergy() {
  var missing=new LinkedHashMap<String,Object>();missing.put("stationId","2");missing.put("value",null);
  var rows=List.of(Map.<String,Object>of("stationId","1","value",2.5),missing,Map.<String,Object>of("stationId","3","value",7.5));
  assertEquals(List.of("3","1"),MonitorQueryService.rank(rows,"DESC").stream().map(r->r.get("stationId")).toList());
  assertEquals(List.of("1","3"),MonitorQueryService.rank(rows,"ASC").stream().map(r->r.get("stationId")).toList());
 }
 @Test void deniedTelemetryAndExportPermissionsStopBeforeSampling(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(TelemetryController.class);when(access.stationIds("asset.read")).thenReturn(List.of(1L));
  var service=new MonitorQueryService(new DomainSupport(db,access),telemetry);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(1,"telemetry.read");
  assertThrows(BusinessException.class,()->service.history(List.of(1L),"storagePower",OffsetDateTime.now().minusHours(1),OffsetDateTime.now(),60,false));verifyNoInteractions(db,telemetry);
  reset(access);when(access.stationIds("asset.read")).thenReturn(List.of(1L));doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(1,"report.export");
  assertThrows(BusinessException.class,()->service.history(List.of(1L),"storagePower",OffsetDateTime.now().minusHours(1),OffsetDateTime.now(),60,true));verifyNoInteractions(db,telemetry);
 }
 @Test void unknownMappingProducesNullAndNoTelemetryQuery(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(TelemetryController.class);when(access.stationIds("asset.read")).thenReturn(List.of(1L));
  var result=new MonitorQueryService(new DomainSupport(db,access),telemetry).history(List.of(1L),"pvPower",OffsetDateTime.now().minusHours(1),OffsetDateTime.now(),60,false);
  var row=(Map<?,?>)((List<?>)result.get("stationResults")).getFirst();assertNull(row.get("value"));assertEquals("unmapped_or_ambiguous",row.get("reason"));assertTrue(((List<?>)result.get("ranking")).isEmpty());verifyNoInteractions(telemetry);
 }
 @Test void invalidQualityNeverAppearsAsValidRankedPowerAndRevocationIsRechecked(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(TelemetryController.class);when(access.stationIds("asset.read")).thenReturn(List.of(1L));
  when(db.queryForList(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Long.class),org.mockito.ArgumentMatchers.eq(1L),org.mockito.ArgumentMatchers.eq(1L),org.mockito.ArgumentMatchers.eq(20024L))).thenReturn(List.of(9L));
  doReturn(ApiResponse.ok(List.of(Map.of("timestamp",0L,"value","999","quality","invalid","samples",1)))).when(telemetry).stationHistory(org.mockito.ArgumentMatchers.eq(1L),org.mockito.ArgumentMatchers.eq(9L),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq(60),org.mockito.ArgumentMatchers.eq("last"));
  var service=new MonitorQueryService(new DomainSupport(db,access),telemetry);var from=OffsetDateTime.now().minusHours(1);var to=OffsetDateTime.now();var result=service.history(List.of(1L),"storagePower",from,to,60,false);
  assertTrue(((List<?>)result.get("ranking")).isEmpty());
  doNothing().doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(1,"telemetry.read");
  assertEquals(403,assertThrows(BusinessException.class,()->service.history(List.of(1L),"storagePower",from,to,60,false)).status());
 }
}
