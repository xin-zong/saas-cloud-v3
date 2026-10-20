package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class StationWiringEditorDocumentTest {
 private final ObjectMapper json=new ObjectMapper();
 private JsonNode doc(String extra)throws Exception{return json.readTree("{\"schema\":1,\"nodes\":[{\"id\":\"pcs1\",\"type\":\"pcs\",\"name\":\"PCS\",\"x\":100,\"y\":100"+extra+"}],\"edges\":[],\"site\":{\"mode\":\"island\"}}");}
 private StationWiringDiagramService.Graph graph(JsonNode doc){return new StationWiringDiagramService.Graph(List.of(),List.of(),doc);}
 @Test void roundTripsMetadataAndPreservesLegacyWireShape()throws Exception{
  var graph=graph(doc(",\"channels\":[{\"port\":\"RS485\"}]"));StationWiringDiagramService.validate(graph);
  assertEquals(graph,json.readValue(json.writeValueAsString(graph),StationWiringDiagramService.Graph.class));
  assertEquals("{\"elements\":[],\"edges\":[]}",json.writeValueAsString(new StationWiringDiagramService.Graph(List.of(),List.of())));
 }
 @Test void rejectsBadSchemaDuplicateDanglingBoundsBindingsAndSize()throws Exception{
  var valid=doc("");
  for(String mutation:List.of("{\"schema\":2,\"nodes\":[],\"edges\":[]}","{\"schema\":4294967297,\"nodes\":[],\"edges\":[]}","[]"))assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(graph(json.readTree(mutation))));
  var duplicate=valid.deepCopy();((com.fasterxml.jackson.databind.node.ArrayNode)duplicate.get("nodes")).add(valid.get("nodes").get(0));assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(graph(duplicate)));
  var dangling=valid.deepCopy();((com.fasterxml.jackson.databind.node.ArrayNode)dangling.get("edges")).add(json.readTree("{\"id\":\"e1\",\"from\":\"pcs1\",\"to\":\"missing\",\"kind\":\"ac\"}"));assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(graph(dangling)));
  for(String extra:List.of(",\"pointId\":\"12\"",",\"deviceId\":12",",\"x\":10001",",\"type\":\"html\""))assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(graph(doc(extra))));
  var script=doc(",\"onload\":\"alert(1)\"");assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(graph(script)));
  var oversized=doc("");((com.fasterxml.jackson.databind.node.ObjectNode)oversized).put("notes","x".repeat(524289));assertThrows(BusinessException.class,()->StationWiringDiagramService.validate(graph(oversized)));
 }
 @Test void documentOnlyBindingsAreCheckedAndTelemetryUsesOnlyOwnedPoint()throws Exception{
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(StationTelemetryService.class);
  var graph=graph(doc(",\"deviceId\":\"11\",\"pointId\":\"12\""));
  when(db.queryForList("SELECT graph::text AS graph,version FROM station_wiring_diagram WHERE station_id=?",9L)).thenReturn(List.of(Map.of("graph",json.writeValueAsString(graph),"version",1L)));
  var service=new StationWiringDiagramService(new DomainSupport(db,access),telemetry);
  assertEquals(403,assertThrows(BusinessException.class,()->service.values(9)).status());verifyNoInteractions(telemetry);
  when(db.queryForList("SELECT id FROM device WHERE id=? AND station_id=?",Long.class,11L,9L)).thenReturn(List.of(11L));
  when(db.queryForList("SELECT id FROM measurement_point WHERE id=? AND device_id=?",Long.class,12L,11L)).thenReturn(List.of(12L));
  when(telemetry.snapshot(9,List.of(12L),false)).thenReturn(Map.of("items",List.of()));assertEquals(Map.of("items",List.of()),service.values(9));
  verify(telemetry).snapshot(9,List.of(12L),false);
 }
}
