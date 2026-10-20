package com.enerlution.ems.business;
import java.util.*;
/** Captured topology is asset evidence. Captured status is never promoted to live status. */
final class ReferenceConnectionTree {
 static void merge(List<Map<String,Object>> nodes,List<Map<String,Object>> edges,List<Map<String,Object>> saved){
  var suppressed=new HashSet<String>();
  for(var row:saved)if(Boolean.TRUE.equals(row.get("unavailable")))suppressed.add(Objects.toString(row.get("serial"),""));
  boolean changed;
  do {changed=false;for(var row:saved)if(suppressed.contains(row.get("parent_serial_number")))changed|=suppressed.add(Objects.toString(row.get("serial"),""));}while(changed);
  var inventory=new HashMap<String,Map<String,Object>>();var removedIds=new HashSet<Object>();
  for(var node:nodes){
   String serial=Objects.toString(node.get("serial"),"");
   if(suppressed.contains(serial)){removedIds.add(node.get("id"));continue;}
   node.put("linkedDeviceId",node.get("id"));node.put("sourceType",node.get("source_type"));inventory.put(serial,node);
  }
  nodes.removeIf(n->removedIds.contains(n.get("id")));
  var ordered=new ArrayList<Map<String,Object>>();var ids=new HashMap<String,Object>();var capturedSerials=new HashSet<String>();var remapped=new HashMap<Object,Object>();
  for(var row:saved){
   String serial=Objects.toString(row.get("serial"),"");if(suppressed.contains(serial))continue;
   var existing=inventory.get(serial);var node=existing==null?new LinkedHashMap<String,Object>():new LinkedHashMap<>(existing);
   String canonical="reference-connection:"+row.get("id");
   if(existing==null){node.put("name",serial);node.put("serial",serial);node.put("linkedDeviceId",null);node.put("status","unknown");node.put("updatedAt",null);}else remapped.put(existing.get("id"),canonical);
   node.put("id",canonical);
   node.put("sourceType",row.get("source_type"));node.put("source_type",row.get("source_type"));node.put("type",type(Objects.toString(row.get("source_type"),""),Objects.toString(node.get("type"),"other")));
   node.put("sortOrder",row.get("sort_order"));node.put("evidenceSource","reference-capture");node.put("observedStatus",row.get("observed_status"));node.put("observedAt",row.get("observed_at"));node.put("capturedAt",row.get("captured_at"));
   ordered.add(node);ids.put(serial,canonical);capturedSerials.add(serial);
  }
  for(var node:nodes)if(!capturedSerials.contains(Objects.toString(node.get("serial"),"")))ordered.add(node);
  nodes.clear();nodes.addAll(ordered);
  var rebuilt=new ArrayList<Map<String,Object>>();
  for(var edge:edges){
   Object parent=edge.get("parentId"),child=edge.get("childId");
   if(removedIds.contains(parent)||removedIds.contains(child)||remapped.containsKey(child))continue;
   parent=remapped.getOrDefault(parent,parent);child=remapped.getOrDefault(child,child);
   rebuilt.add(new LinkedHashMap<>(Map.of("parentId",parent,"childId",child)));
  }
  for(var row:saved){Object parent=ids.get(row.get("parent_serial_number")),child=ids.get(row.get("serial"));if(parent!=null&&child!=null)rebuilt.add(new LinkedHashMap<>(Map.of("parentId",parent,"childId",child)));}
  edges.clear();edges.addAll(new LinkedHashSet<>(rebuilt));
 }
 private static String type(String source,String fallback){return switch(source){case "采集器"->"logger";case "EMS控制器"->"ems";case "电池包"->"battery-pack";case "电池簇"->"battery-cluster";case "电池堆"->"battery-stack";case "液冷机"->"liquid-cooler";case "动环"->"environment";case "储能变流器","PCS"->"pcs";case "MPPT"->"mppt";case "逆变器"->"inverter";case "电表"->"meter";default->fallback;};}
}

