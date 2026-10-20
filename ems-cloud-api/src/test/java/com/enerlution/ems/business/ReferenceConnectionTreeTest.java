package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class ReferenceConnectionTreeTest {
 private Map<String,Object> row(long id,String serial,String type,String parent,boolean unavailable){var r=new LinkedHashMap<String,Object>();r.put("id",id);r.put("serial",serial);r.put("source_type",type);r.put("parent_serial_number",parent);r.put("unavailable",unavailable);return r;}
 @Test void stableCapturedIdentityMergesInventoryAndRemapsRetainedEdges(){
  var nodes=new ArrayList<Map<String,Object>>();nodes.add(new LinkedHashMap<>(Map.of("id",1L,"serial","ROOT","status","online")));nodes.add(new LinkedHashMap<>(Map.of("id",2L,"serial","UNOBSERVED")));
  var edges=new ArrayList<Map<String,Object>>();edges.add(new LinkedHashMap<>(Map.of("parentId",99L,"childId",1L)));edges.add(new LinkedHashMap<>(Map.of("parentId",1L,"childId",2L)));
  var rows=List.of(row(10,"ROOT","采集器",null,false),row(11,"PACK","电池包","ROOT",false));
  ReferenceConnectionTree.merge(nodes,edges,rows);
  assertEquals(3,nodes.size());assertEquals("reference-connection:10",nodes.getFirst().get("id"));assertEquals(1L,nodes.getFirst().get("linkedDeviceId"));assertEquals("reference-connection:11",nodes.get(1).get("id"));assertNull(nodes.get(1).get("linkedDeviceId"));assertEquals("unknown",nodes.get(1).get("status"));assertEquals("battery-pack",nodes.get(1).get("type"));assertTrue(edges.contains(Map.of("parentId","reference-connection:10","childId",2L)));assertTrue(edges.contains(Map.of("parentId","reference-connection:10","childId","reference-connection:11")));assertEquals(2,edges.size());
  var withoutInventory=new ArrayList<Map<String,Object>>();ReferenceConnectionTree.merge(withoutInventory,new ArrayList<>(),rows);assertEquals(nodes.getFirst().get("id"),withoutInventory.getFirst().get("id"));
 }
 @Test void unavailableInventoryPrunesCapturedDescendantsEvenWhenChildIsActive(){
  var nodes=new ArrayList<Map<String,Object>>();nodes.add(new LinkedHashMap<>(Map.of("id",2L,"serial","CHILD")));
  var edges=new ArrayList<Map<String,Object>>();edges.add(new LinkedHashMap<>(Map.of("parentId",3L,"childId",2L)));
  var rows=List.of(row(10,"ROOT","采集器",null,true),row(11,"CHILD","电池簇","ROOT",false),row(12,"PACK","电池包","CHILD",false),row(13,"SOURCE-ONLY","PCS",null,false));
  ReferenceConnectionTree.merge(nodes,edges,rows);assertEquals(1,nodes.size());assertEquals("SOURCE-ONLY",nodes.getFirst().get("serial"));assertTrue(edges.isEmpty());
 }
 @Test void sourceOnlyKnownTypesRemainExplicit(){
  var nodes=new ArrayList<Map<String,Object>>();ReferenceConnectionTree.merge(nodes,new ArrayList<>(),List.of(row(1,"A","PCS",null,false),row(2,"B","MPPT",null,false),row(3,"C","逆变器",null,false)));assertEquals(List.of("pcs","mppt","inverter"),nodes.stream().map(n->n.get("type")).toList());
 }
}
