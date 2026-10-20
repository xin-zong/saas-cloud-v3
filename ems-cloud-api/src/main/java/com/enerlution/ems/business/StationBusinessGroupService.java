package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.springframework.stereotype.Service;

/** Current-tenant business scope navigation, never tenant switching or a grant. */
@Service
public class StationBusinessGroupService {
 private final DomainSupport s;
 public StationBusinessGroupService(DomainSupport s){this.s=s;}
 public record Node(String id,String type,String name,String parentId,List<String> stationIds,List<Node> children){}
 public record View(String tenantId,String source,String datasetId,Integer datasetVersion,List<Node> nodes){}
 public View tree(){
  s.access.requirePermission("asset.read");
  var actor=s.access.context();
  if(!actor.kind().equals("enterprise"))throw new BusinessException(403,"请在当前企业内查看业务组");
  long tenant=actor.tenantId();
  var companies=s.db.queryForList("SELECT name FROM company_profile WHERE tenant_id=?",tenant);
  if(companies.isEmpty())throw new BusinessException(404,"当前企业不存在");
  var datasets=s.db.queryForList("SELECT dataset_id,dataset_version FROM station_business_group_dataset WHERE tenant_id=? ORDER BY created_at DESC,dataset_version DESC,dataset_id LIMIT 1",tenant);
  String dataset=null;Integer version=null;
  List<Map<String,Object>> groups=List.of(),bindings=List.of();
  if(!datasets.isEmpty()){
   dataset=Objects.toString(datasets.getFirst().get("dataset_id"));version=((Number)datasets.getFirst().get("dataset_version")).intValue();
   groups=s.db.queryForList("SELECT id,parent_id,name,kind FROM station_business_group WHERE tenant_id=? AND dataset_id=? AND dataset_version=? ORDER BY sort_order,lower(name),id",tenant,dataset,version);
   bindings=s.db.queryForList("SELECT b.group_id,b.station_id FROM station_business_group_station b JOIN station st ON st.id=b.station_id AND st.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.dataset_id=? AND b.dataset_version=? AND st.archived_at IS NULL",tenant,dataset,version);
  }
  // The capability relation supplies authorized station IDs; group membership adds no access.
  var stations=s.db.queryForList("SELECT DISTINCT st.id,st.name FROM station st JOIN saas_effective_station_permission p ON p.station_id=st.id AND p.permission_code='asset.read' WHERE st.tenant_id=? AND st.archived_at IS NULL AND p.user_id=? AND p.client=? ORDER BY st.name,st.id",tenant,actor.actorId(),s.access.client());
  Node root=buildTree(tenant,Objects.toString(companies.getFirst().get("name")),groups,bindings,stations,actor.administrator());
  s.access.requirePermission("asset.read");
  var current=s.access.context();
  if(current.tenantId()!=tenant||current.actorId()!=actor.actorId()||!current.kind().equals("enterprise"))throw new BusinessException(403,"企业身份已变化，请刷新");
  return new View(Long.toString(tenant),"database",dataset,version,root.stationIds().isEmpty()&&!actor.administrator()?List.of():List.of(root));
 }
 public List<Long> stationScope(String businessGroupId){
  if(businessGroupId==null||businessGroupId.isBlank())return null;
  if(businessGroupId.length()>240)throw new BusinessException(400,"业务组标识无效");
  var view=tree();var pending=new ArrayDeque<Node>(view.nodes());
  while(!pending.isEmpty()){var node=pending.removeFirst();if(node.id().equals(businessGroupId))return node.stationIds().stream().map(Long::valueOf).toList();pending.addAll(node.children());}
  throw new BusinessException(404,"业务组不存在或无权查看");
 }
 static Node buildTree(long tenant,String company,List<Map<String,Object>> groups,List<Map<String,Object>> bindings,List<Map<String,Object>> stations,boolean showEmptyGroups){
  var groupMap=new LinkedHashMap<String,Map<String,Object>>();
  for(var row:groups){String id=Objects.toString(row.get("id"));if(groupMap.putIfAbsent(id,row)!=null)throw invalid();}
  // Validate all ancestry, including a disconnected cycle that has no root.
  for(String id:groupMap.keySet()){
   var ancestors=new HashSet<String>();String cursor=id;
   while(cursor!=null){if(!ancestors.add(cursor)||ancestors.size()>50||!groupMap.containsKey(cursor))throw invalid();Object p=groupMap.get(cursor).get("parent_id");cursor=p==null?null:p.toString();}
  }
  var visible=new LinkedHashMap<String,String>();
  for(var st:stations)visible.put(((Number)st.get("id")).toString(),Objects.toString(st.get("name")));
  var direct=new HashMap<String,LinkedHashSet<String>>();var assigned=new HashSet<String>();
  for(var binding:bindings){String group=Objects.toString(binding.get("group_id")),station=((Number)binding.get("station_id")).toString();if(groupMap.containsKey(group)&&visible.containsKey(station)){direct.computeIfAbsent(group,x->new LinkedHashSet<>()).add(station);assigned.add(station);}}
  String rootId="tenant:"+tenant;
  var children=new ArrayList<Node>();
  for(var row:groups)if(row.get("parent_id")==null){var node=groupNode(row,rootId,groups,direct,visible,showEmptyGroups);if(node!=null)children.add(node);}
  var unassigned=visible.keySet().stream().filter(id->!assigned.contains(id)).toList();
  if(!unassigned.isEmpty()){
   String id=rootId+":unassigned";var leaves=unassigned.stream().map(sid->stationNode(sid,visible.get(sid),id)).toList();
   children.add(new Node(id,"unassigned","未分组电站",rootId,sortedIds(unassigned),leaves));
  }
  return new Node(rootId,"enterprise",company,null,sortedIds(visible.keySet()),List.copyOf(children));
 }
 private static Node groupNode(Map<String,Object> row,String parent,List<Map<String,Object>> groups,Map<String,LinkedHashSet<String>> direct,Map<String,String> visible,boolean showEmpty){
  String raw=Objects.toString(row.get("id")),id="group:"+raw;var children=new ArrayList<Node>();var stations=new LinkedHashSet<String>();
  for(var child:groups)if(Objects.equals(child.get("parent_id"),raw)){var node=groupNode(child,id,groups,direct,visible,showEmpty);if(node!=null){children.add(node);stations.addAll(node.stationIds());}}
  for(String sid:direct.getOrDefault(raw,new LinkedHashSet<>())){children.add(stationNode(sid,visible.get(sid),id));stations.add(sid);}
  if(stations.isEmpty()&&!showEmpty)return null;
  return new Node(id,Objects.toString(row.get("kind")),Objects.toString(row.get("name")),parent,sortedIds(stations),List.copyOf(children));
 }
 private static Node stationNode(String id,String name,String parent){return new Node("station:"+id+"@"+parent,"station",name,parent,List.of(id),List.of());}
 private static List<String> sortedIds(Collection<String> ids){return ids.stream().distinct().sorted(Comparator.comparingLong(Long::parseLong)).toList();}
 private static BusinessException invalid(){return new BusinessException(500,"业务组层级异常");}
}
