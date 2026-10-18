package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class StationWiringDiagramServiceTest {
 private StationWiringDiagramService.Element element(String id,double x){return new StationWiringDiagramService.Element(id,"text",x,10,120,60,0,"Label","#123456",14,"left",null,null);}
 @Test void rejectsDanglingEdgesDuplicateIdsAndBounds(){
  assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(List.of(element("a",1)),List.of(new StationWiringDiagramService.Edge("e","a","b")))));
  assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(List.of(element("a",1),element("a",1)),List.of())));
  assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(List.of(element("a",Double.NaN)),List.of())));
 }
 @Test void acceptsEmptyGraphAndValidIndependentElements(){
  assertDoesNotThrow(()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(List.of(),List.of())));
  assertDoesNotThrow(()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(List.of(element("a",100)),List.of())));
 }
 @Test void deniedReadNeverTouchesDatabase(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(9,"asset.read");
  var service=new StationWiringDiagramService(new DomainSupport(db,access),mock(StationTelemetryService.class));
  assertThrows(BusinessException.class,()->service.read(9));verifyNoInteractions(db);
 }
 @Test void writeAndValuesHaveIndependentPermissions(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(StationTelemetryService.class);
  var service=new StationWiringDiagramService(new DomainSupport(db,access),telemetry);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(9,"asset.edit");
  assertThrows(BusinessException.class,()->service.save(9,new StationWiringDiagramService.SaveRequest(0L,new StationWiringDiagramService.Graph(List.of(),List.of()))));
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(9,"telemetry.read");
  assertThrows(BusinessException.class,()->service.values(9));verifyNoInteractions(db,telemetry);
 }
 @Test void rejectsOversizedGraphsAndUnboundPoints(){
  assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(Collections.nCopies(501,element("a",1)),List.of())));
  var bad=new StationWiringDiagramService.Element("a","text",0,0,100,30,0,"x","#123456",14,"left",null,"7");
  assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(new StationWiringDiagramService.Graph(List.of(bad),List.of())));
 }
 @Test void fractionalVersionAndNumericBindingAreRejectedOnWire(){
  var json=new com.fasterxml.jackson.databind.ObjectMapper();
  assertThrows(com.fasterxml.jackson.databind.JsonMappingException.class,()->json.readValue("{\"expectedVersion\":1.5}",StationWiringDiagramService.SaveRequest.class));
  assertThrows(com.fasterxml.jackson.databind.JsonMappingException.class,()->json.readValue("{\"deviceId\":9007199254740993}",StationWiringDiagramService.Element.class));
 }
 private JdbcTemplate transactionalDb() throws Exception {
  var db=mock(JdbcTemplate.class);var ds=mock(javax.sql.DataSource.class);var connection=mock(java.sql.Connection.class);
  when(ds.getConnection()).thenReturn(connection);when(db.getDataSource()).thenReturn(ds);
  when(db.queryForList("SELECT id FROM station WHERE id=? FOR UPDATE",9L)).thenReturn(List.of(Map.of("id",9L)));
  return db;
 }
 @Test void staleVersionRejectsBeforeAnyMutation() throws Exception {
  var db=transactionalDb();var access=mock(AccessControl.class);
  when(db.queryForList("SELECT graph::text AS graph,version FROM station_wiring_diagram WHERE station_id=?",9L)).thenReturn(List.of(Map.of("graph","{\"elements\":[],\"edges\":[]}","version",2L)));
  var service=new StationWiringDiagramService(new DomainSupport(db,access),mock(StationTelemetryService.class));
  assertEquals(409,assertThrows(BusinessException.class,()->service.save(9,new StationWiringDiagramService.SaveRequest(1L,new StationWiringDiagramService.Graph(List.of(),List.of())))).status());
  verify(db,never()).update(anyString(),any(Object[].class));verify(access,times(2)).requireStationPermission(9,"asset.edit");
 }
 @Test void foreignDeviceAndPointRejectedBeforePersistence() throws Exception {
  var db=transactionalDb();var access=mock(AccessControl.class);
  var service=new StationWiringDiagramService(new DomainSupport(db,access),mock(StationTelemetryService.class));
  var bound=new StationWiringDiagramService.Element("a","device",0,0,100,50,0,"A","#123456",14,"left","11","12");
  var request=new StationWiringDiagramService.SaveRequest(0L,new StationWiringDiagramService.Graph(List.of(bound),List.of()));
  assertEquals(403,assertThrows(BusinessException.class,()->service.save(9,request)).status());
  when(db.queryForList("SELECT id FROM device WHERE id=? AND station_id=? FOR SHARE",Long.class,11L,9L)).thenReturn(List.of(11L));
  assertEquals(403,assertThrows(BusinessException.class,()->service.save(9,request)).status());
  verify(db,never()).update(anyString(),any(Object[].class));
 }
 @Test void permissionRevocationAfterGovernanceLockStopsSave() throws Exception {
  var db=transactionalDb();var access=mock(AccessControl.class);
  doNothing().doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(9,"asset.edit");
  var service=new StationWiringDiagramService(new DomainSupport(db,access),mock(StationTelemetryService.class));
  assertEquals(403,assertThrows(BusinessException.class,()->service.save(9,new StationWiringDiagramService.SaveRequest(0L,new StationWiringDiagramService.Graph(List.of(),List.of())))).status());
  verify(db).queryForObject("SELECT pg_advisory_xact_lock_shared(78291001)",Object.class);verify(db,never()).update(anyString(),any(Object[].class));
 }
 @Test void movedPointDuringTelemetryReadNeverReturnsOldBindingValues() throws Exception {
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(StationTelemetryService.class);
  var graph=new StationWiringDiagramService.Graph(List.of(new StationWiringDiagramService.Element("a","device",0,0,100,50,0,"A","#123456",14,"left","11","12")),List.of());
  when(db.queryForList("SELECT graph::text AS graph,version FROM station_wiring_diagram WHERE station_id=?",9L)).thenReturn(List.of(Map.of("graph",new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(graph),"version",1L)));
  when(db.queryForList("SELECT id FROM device WHERE id=? AND station_id=?",Long.class,11L,9L)).thenReturn(List.of(11L));
  when(db.queryForList("SELECT id FROM measurement_point WHERE id=? AND device_id=?",Long.class,12L,11L)).thenReturn(List.of(12L),List.of());
  when(telemetry.snapshot(9,List.of(12L),false)).thenReturn(Map.of("items",List.of(Map.of("pointId","12","value",42))));
  var service=new StationWiringDiagramService(new DomainSupport(db,access),telemetry);
  assertEquals(403,assertThrows(BusinessException.class,()->service.values(9)).status());
  verify(telemetry).snapshot(9,List.of(12L),false);
 }
 @Test void firstSavePersistsGraphAuditsStationAndReturnsDatabaseVersion() throws Exception {
  var db=transactionalDb();var access=mock(AccessControl.class);var support=spy(new DomainSupport(db,access));
  doNothing().when(support).auditStation(anyString(),anyLong(),any());
  when(db.queryForList("SELECT graph::text AS graph,version FROM station_wiring_diagram WHERE station_id=?",9L)).thenReturn(List.of(),List.of(Map.of("graph","{\"elements\":[],\"edges\":[]}","version",1L)));
  var service=new StationWiringDiagramService(support,mock(StationTelemetryService.class));
  var result=service.save(9,new StationWiringDiagramService.SaveRequest(0L,new StationWiringDiagramService.Graph(List.of(),List.of())));
  assertEquals(1,result.version());assertTrue(result.graph().elements().isEmpty());
  verify(support).auditStation(eq("station-wiring-diagram.save"),eq(9L),eq(Map.of("version",1L,"elements",0,"edges",0)));
  verify(db).update(startsWith("INSERT INTO station_wiring_diagram"),eq(9L),eq("{\"elements\":[],\"edges\":[]}"),eq(0L));
 }
}
