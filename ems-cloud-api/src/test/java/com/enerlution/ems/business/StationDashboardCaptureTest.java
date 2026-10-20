package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class StationDashboardCaptureTest {
 private StationDashboardService.View read(String asset,String metrics,String explicit){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList(anyString(),eq(17L))).thenAnswer(call->{String sql=call.getArgument(0);
   if(sql.contains("station_dashboard_read_model"))return explicit==null?List.of():List.of(Map.of("dataset_id","explicit","dataset_version",1,"payload",explicit));
   if(sql.contains("monitor_station_capture"))return List.of(Map.of("id",8L,"metrics",metrics,"source_updated_at","2026-10-17T12:15:00Z","charge_status","discharging"));
   return List.of(Map.of("name","site","asset_type",asset,"timezone","Europe/Madrid"));});
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(17,"alarm.read");
  return new StationDashboardService(new DomainSupport(db,access)).read(17,null);
 }
 @Test void savedStationMetricsAppearWithoutInventingFlows(){
  var v=read("Hybrid","{\"pvPower\":0,\"storageSoc\":53,\"storageActivePower\":-2.2,\"storageDailyCharged\":1.6,\"storageDailyDischarged\":null}",null);
  assertTrue(v.configured());assertFalse(v.mocked());assertEquals("2026-10-17T12:15:00Z",v.sourceTime());assertNull(v.flow());
  assertEquals(List.of("overall","solar","storage"),v.scenes());assertEquals(List.of("solar","storage"),v.panels().stream().map(StationDashboardService.Panel::key).toList());
  var m=v.panels().get(1).metrics();assertEquals(53,m.stream().filter(x->x.key().equals("soc")).findFirst().orElseThrow().value().intValue());
  assertNull(m.stream().filter(x->x.key().equals("dailyDischarge")).findFirst().orElseThrow().value());
  assertTrue(m.stream().noneMatch(x->x.key().equals("availableCharge")));
 }
 @Test void storageOnlyDoesNotAcquireSolarPanelFromIncidentalZero(){
  var v=read("BESS","{\"pvPower\":0,\"storageSoc\":null}",null);
  assertEquals(List.of("storage"),v.scenes());assertEquals(List.of("storage"),v.panels().stream().map(StationDashboardService.Panel::key).toList());
 }
 @Test void explicitDatasetRemainsAuthoritative(){
  var v=read("Hybrid","{\"storageSoc\":53}","{\"name\":\"explicit\",\"scenes\":[\"grid\"],\"panels\":[],\"sourceTime\":\"fixed\"}");
  assertTrue(v.mocked());assertEquals("explicit",v.datasetId());assertEquals("fixed",v.sourceTime());assertEquals(List.of("grid"),v.scenes());
 }
 @Test void photovoltaicOnlyPreservesItsCapacityWithoutInventingStorage(){
  var v=read("PV","{\"pvCapacity\":120,\"pvPower\":0}",null);
  assertEquals(List.of("solar"),v.scenes());assertNull(v.capacityKwh());assertNull(v.ratedPowerKw());
  assertEquals(120,v.panels().getFirst().metrics().stream().filter(m->m.key().equals("capacity")).findFirst().orElseThrow().value().intValue());
 } @Test void jdbcSourceTimestampKeepsItsUtcInstant(){
  var source=java.sql.Timestamp.from(java.time.Instant.parse("2026-10-17T12:15:00Z"));
  var v=StationDashboardCapture.snapshot(Map.of("name","site","asset_type","PV"),Map.of("metrics","{}","source_updated_at",source));
  assertEquals("2026-10-17T12:15:00Z",v.sourceTime());
 } @Test void capturedDecimalRetainsAllSourceDigits(){
  var v=read("PV","{\"pvTotal\":123456789012.12345678,\"pvPower\":-0.000000000123456789}",null);
  var fields=v.panels().getFirst().metrics();
  assertEquals(new java.math.BigDecimal("123456789012.12345678"),fields.stream().filter(m->m.key().equals("totalProduction")).findFirst().orElseThrow().value());
  assertEquals(new java.math.BigDecimal("-0.000000000123456789"),fields.stream().filter(m->m.key().equals("power")).findFirst().orElseThrow().value());
 }}



