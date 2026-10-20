package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import org.springframework.jdbc.core.JdbcTemplate;
class StationTelemetryServiceTest {
 @Test void monitorTargetPointKeepsOtherSourceMappingsForAmbiguity() {
   var target=new HashMap<String,Object>(Map.of("measurement_point_id",19L,"binding_period_id",2L,"namespace","cabinet","source_id",20018L));
   long now=Instant.now().toEpochMilli();target.putAll(Map.of("device_id",3L,"subsystem","pcs","value_type","number","aggregation","average","reachable",true,"valid_from",new java.sql.Timestamp(now-1000)));
   var other=new HashMap<String,Object>(target);other.put("source_id",20019L);
   var db=new JdbcTemplate(){@Override public List<Map<String,Object>> queryForList(String sql,Object... args){
     // Model both legal bindings: a direct source filter hides the second binding.
     return sql.contains("WITH current_mappings")?List.of(target,other):List.of(target);
   }};
   var queries=mock(EmsTelemetryQueries.class);
   when(queries.latest(List.of(2L),List.of(19L))).thenReturn(List.of(new HashMap<>(Map.of("pointId","19","bindingPeriodId","2","receivedAt",now,"sourceTime",now,"quality","valid"))));
   var result=new StationTelemetryService(new DomainSupport(db,mock(AccessControl.class)),queries,mock(AssetPresence.class)).monitorSnapshot(4);
   assertEquals("ambiguous_mapping",((Map<?,?>)((List<?>)result.get("items")).getFirst()).get("staleReason"));
   assertEquals(1L,((Map<?,?>)result.get("mappingCounts")).get("cabinet:20018"));
 }
 @Test void monitorReadsOnlyTargetSemanticsAndRetainsDuplicateMappingCounts() {
   var db=mock(JdbcTemplate.class);var queries=mock(EmsTelemetryQueries.class);
   var service=new StationTelemetryService(new DomainSupport(db,mock(AccessControl.class)),queries,mock(AssetPresence.class));service.stored=mock(StoredDeviceTelemetryService.class);
   var mapping=new HashMap<String,Object>(Map.of("measurement_point_id",19L,"binding_period_id",2L,"namespace","cabinet","source_id",20018L));
   when(db.queryForList(contains("FROM point_binding pb"),eq(4L))).thenReturn(List.of(mapping,mapping));
   when(queries.latest(List.of(2L),List.of(19L))).thenReturn(List.of(new HashMap<>(Map.of("pointId","19"))));
   var result=service.monitorSnapshot(4);
   assertEquals(Map.of("cabinet:20018",2L),result.get("mappingCounts"));
   assertEquals("ambiguous_mapping",((Map<?,?>)((List<?>)result.get("items")).getFirst()).get("staleReason"));
   verify(db).queryForList(argThat((String sql)->sql.contains("namespace='cabinet'")&&sql.contains("source_id IN (20107,20018)")&&sql.contains("a.station_id=p.station_id")),eq(4L));
   verify(queries).latest(List.of(2L),List.of(19L));verifyNoInteractions(service.stored);
 }
 @Test void monitorWithoutTargetMappingsDoesNotFallBackToAllStationPoints() {
   var db=mock(JdbcTemplate.class);var queries=mock(EmsTelemetryQueries.class);
   var service=new StationTelemetryService(new DomainSupport(db,mock(AccessControl.class)),queries,mock(AssetPresence.class));service.stored=mock(StoredDeviceTelemetryService.class);
   when(db.queryForList(anyString(),eq(4L))).thenReturn(List.of());
   var result=service.monitorSnapshot(4);
   assertEquals(List.of(),result.get("items"));assertEquals(Map.of(),result.get("mappingCounts"));verifyNoInteractions(queries,service.stored);
 }
 @Test void matchingLatestValuesReadsMappingIdsLinearlyAndKeepsAmbiguity() {
   var db=mock(JdbcTemplate.class);var queries=mock(EmsTelemetryQueries.class);
   var reads=new java.util.concurrent.atomic.AtomicInteger();var mappings=new ArrayList<Map<String,Object>>();var values=new ArrayList<Map<String,Object>>();
   long now=Instant.now().toEpochMilli();
   for(long id=1;id<=100;id++){
     var mapping=new HashMap<String,Object>(){@Override public Object get(Object key){if("measurement_point_id".equals(key))reads.incrementAndGet();return super.get(key);}};
     mapping.putAll(Map.of("measurement_point_id",id,"binding_period_id",2L,"device_id",3L,"source_id",20107L,"namespace","cabinet","subsystem","pcs","value_type","number","aggregation","average","reachable",true));
     mapping.put("valid_from",new java.sql.Timestamp(now-1000));mappings.add(mapping);values.add(new HashMap<>(Map.of("pointId",Long.toString(id),"bindingPeriodId","2","receivedAt",now,"sourceTime",now,"quality","valid")));
   }
   mappings.add(mappings.getFirst());
   when(db.queryForList(contains("FROM point_binding pb"),eq(4L))).thenReturn(mappings);
   when(queries.latest(anyList(),anyList())).thenReturn(values);
   var result=new StationTelemetryService(new DomainSupport(db,mock(AccessControl.class)),queries,mock(AssetPresence.class)).snapshot(4,List.of(),false);
   assertEquals(100,((List<?>)result.get("items")).size());
   assertEquals("ambiguous_mapping",values.getFirst().get("staleReason"));
   assertNull(values.get(1).get("staleReason"));assertEquals("3",values.get(1).get("deviceId"));
   assertTrue(reads.get()<1000,"mapping lookup must scale linearly; actual reads="+reads.get());
 }
 @Test void selectedPointFilterIsAppliedBeforeMappingLimitAndRejectsForeignPoint() {
   var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var queries=mock(EmsTelemetryQueries.class);
   var service=new StationTelemetryService(new DomainSupport(db,access),queries,mock(AssetPresence.class));
   when(db.queryForList(contains("SELECT mp.id"),eq(Long.class),eq(4L))).thenReturn(List.of(19L));
   when(db.queryForList(contains("FROM point_binding pb"),eq(4L))).thenReturn(List.of());
   when(queries.latest(anyList(),anyList())).thenReturn(List.of());
   service.snapshot(4,List.of(19L),false);
   verify(db).queryForList(contains("AND pb.measurement_point_id IN (19) ORDER BY measurement_point_id LIMIT 2001"),eq(4L));
   assertThrows(com.enerlution.ems.common.BusinessException.class,()->service.snapshot(5,List.of(19L),false));
   verify(db,never()).queryForList(contains("FROM point_binding pb"),eq(5L));
 }
 @Test void receiptCannotMakeExpiredSourceOrHeartbeatFresh() {
   long now=Instant.now().toEpochMilli();
   var row=new HashMap<String,Object>(Map.of("receivedAt",now-1000,"sourceTime",now-1000,"quality","valid"));
   assertNull(StationTelemetryService.staleReason(row,true,now));
   assertEquals("heartbeat_expired",StationTelemetryService.staleReason(row,false,now));
   row.put("sourceTime",now-100000);assertEquals("source_older_than_90_seconds",StationTelemetryService.staleReason(row,true,now));
   row.put("sourceTime",now+1000);assertEquals("future_source_time",StationTelemetryService.staleReason(row,true,now));
   row.remove("sourceTime");assertEquals("unknown_source_time",StationTelemetryService.staleReason(row,true,now));
 }
 @Test void pointListIsBoundedAndUnambiguous() {
   assertEquals(List.of(19L,21L),RealtimeTelemetryController.parsePoints("19,21,19"));
   assertThrows(RuntimeException.class,()->RealtimeTelemetryController.parsePoints("19,1 OR 1=1"));
   assertThrows(RuntimeException.class,()->RealtimeTelemetryController.parsePoints("0"));
 }
}


