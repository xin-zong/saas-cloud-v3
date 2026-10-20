package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.*;
import java.math.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MonitorWorkspaceService {
  private final DomainSupport s;private final ObjectMapper json;
  private final StationTelemetryService telemetry;
  private final StationBusinessGroupService businessGroups;
  public MonitorWorkspaceService(DomainSupport s,ObjectMapper json,StationTelemetryService telemetry){this(s,json,telemetry,new StationBusinessGroupService(s));}
  @org.springframework.beans.factory.annotation.Autowired
  public MonitorWorkspaceService(DomainSupport s,ObjectMapper json,StationTelemetryService telemetry,StationBusinessGroupService businessGroups){this.s=s;this.json=json;this.telemetry=telemetry;this.businessGroups=businessGroups;}
  public record Preference(Map<String,Object> settings,List<String> watchedStationIds,long version) {}
  public record SavePreference(Map<String,Object> settings,List<String> watchedStationIds,Long expectedVersion) {}
  private Map<String,Object> object(Object raw){if(raw==null)return new LinkedHashMap<>();try{return json.readValue(raw.toString(),new TypeReference<LinkedHashMap<String,Object>>(){});}catch(Exception ex){throw new IllegalStateException("Invalid stored monitor data",ex);}}
  private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception ex){throw new BusinessException(400,"监控配置格式无效");}}
  private String capturedScene(Object raw,String canonical){try{return MonitorWorkspaceRules.capturedScene(canonical,json.readValue(raw.toString(),Object.class));}catch(Exception ex){return canonical;}}
  public Preference preferences(){
    var actor=s.access.context();var rows=s.db.queryForList("SELECT settings::text,to_json(watched_station_ids)::text AS watched,version FROM monitor_user_workspace WHERE user_id=? AND tenant_id=? AND client=?",actor.actorId(),actor.tenantId(),s.access.client());
    if(rows.isEmpty())return new Preference(Map.of(),List.of(),0);
    var row=rows.getFirst();var allowed=new HashSet<>(s.access.stationIds("asset.read"));List<String> ids=new ArrayList<>();try{json.readTree(row.get("watched").toString()).forEach(id->{if(allowed.contains(id.asLong()))ids.add(id.asText());});}catch(Exception ex){throw new IllegalStateException("Invalid stored watchlist",ex);}
    return new Preference(object(row.get("settings")),ids,((Number)row.get("version")).longValue());
  }
  @Transactional public Preference savePreferences(SavePreference body){
    if(body==null||body.expectedVersion()==null||body.expectedVersion()<0||body.settings()==null||body.watchedStationIds()==null||body.watchedStationIds().size()>2000)throw new BusinessException(400,"缺少有效配置、站点或版本");
    var settings=new LinkedHashMap<String,Object>();
    for(var e:body.settings().entrySet()){
      if(!Set.of("sourceMode","fieldView","dashboardField","refreshMinutes","solarColumns","storageColumns","deviceColumns").contains(e.getKey()))throw new BusinessException(400,"不支持的监控配置");
      Object v=e.getValue();
      if(Set.of("sourceMode","fieldView","dashboardField").contains(e.getKey())){var allowed=e.getKey().equals("sourceMode")?Set.of("capture","current"):Set.of("solar","storage");if(!(v instanceof String)||!allowed.contains(v))throw new BusinessException(400,"监控显示选项无效");}
      else if(e.getKey().equals("refreshMinutes")){if(!(v instanceof Number n)||!Set.of("0","1","3","5","10","30").contains(n.toString()))throw new BusinessException(400,"刷新周期无效");}
      else if(e.getKey().equals("deviceColumns")){ReferenceDeviceListService.validateColumns(v);}
      else {if(!(v instanceof List<?> values)||values.size()>30||new HashSet<>(values).size()!=values.size()||values.stream().anyMatch(k->!(k instanceof String)||!(MonitorWorkspaceRules.METRICS.contains(k)||Set.of("pvTrend","chargeStatus").contains(k))))throw new BusinessException(400,"列表列配置无效");}
      settings.put(e.getKey(),v);
    }
    var ids=new LinkedHashSet<Long>();for(String id:body.watchedStationIds())try{if(id==null||!id.matches("[1-9][0-9]{0,18}")||!ids.add(Long.parseLong(id)))throw new NumberFormatException();}catch(NumberFormatException ex){throw new BusinessException(400,"关注站点编号重复或无效");}
    var actor=s.access.context();String client=s.access.client();
    s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"monitor-workspace:"+actor.actorId()+":"+actor.tenantId()+":"+client);
    if(preferences().version()!=body.expectedVersion())throw new BusinessException(409,"监控配置已被更新，请刷新后重试；本次未覆盖其他修改");
    for(long id:ids)s.access.requireStationPermission(id,"asset.read");
    String array="{"+String.join(",",ids.stream().map(Object::toString).toList())+"}";
    s.db.update("INSERT INTO monitor_user_workspace(user_id,tenant_id,client,settings,watched_station_ids,version) VALUES(?,?,?,?::jsonb,?::bigint[],1) ON CONFLICT(user_id,tenant_id,client) DO UPDATE SET settings=excluded.settings,watched_station_ids=excluded.watched_station_ids,version=monitor_user_workspace.version+1,updated_at=now()",actor.actorId(),actor.tenantId(),client,encode(settings),array);
    s.audit("monitor.workspace.save",Map.of("watchedCount",ids.size(),"settings",settings.keySet()));return preferences();
  }
  public Map<String,Object> workspace(Map<String,String> parameters,boolean export){
    var groupScope=businessGroups.stationScope(parameters.get("businessGroupId"));
    var queryArgs=new ArrayList<Object>();queryArgs.add(s.access.userId());queryArgs.add(s.access.client());
    String groupFilter="";if(groupScope!=null){if(groupScope.isEmpty())groupFilter=" AND FALSE";else{groupFilter=" AND st.id IN ("+String.join(",",Collections.nCopies(groupScope.size(),"?"))+")";queryArgs.addAll(groupScope);}}
    var q=MonitorWorkspaceRules.query(parameters);var preference=preferences();long user=s.access.userId();String client=s.access.client();
    var scope=s.access.stationScopes(List.of("asset.read","telemetry.read","alarm.read"));
    var assetScope=new HashSet<>(scope.get("asset.read"));var telemetryScope=new HashSet<>(scope.get("telemetry.read"));var alarmScope=new HashSet<>(scope.get("alarm.read"));
    // Expand the effective permission view once, rather than generating thousands
    // of JIT expressions for three correlated copies. Fresh scope checks remain below.
    var raw=s.db.queryForList("""
      WITH permitted AS MATERIALIZED (
       SELECT station_id,bool_or(permission_code='asset.read') AS asset,
        bool_or(permission_code='telemetry.read') AS telemetry,bool_or(permission_code='alarm.read') AS alarm
       FROM saas_effective_station_permission WHERE user_id=? AND client=? GROUP BY station_id
      )
      SELECT st.replica_visible,st.id::text,st.name,st.code,st.asset_type AS scene,st.region,st.address,st.rated_power_kw,st.capacity_kwh,
       sp.solar_capacity_kw,sp.country,sp.province,sp.city,sp.timezone,sp.commissioned_on,sp.grid_connection_date,
       coalesce(sp.details->>'siteType','unknown') AS site_type,coalesce(sp.details->'systems','[]'::jsonb)::text AS reference_systems,
       EXISTS(SELECT 1 FROM station_reference_import i WHERE i.station_id=st.id) AS imported,
       cap.captured_at,cap.source_updated_at,cap.communication AS captured_communication,cap.charge_status,cap.metrics::text AS captured_metrics,
       (SELECT count(*) FROM device d WHERE d.station_id=st.id AND d.archived_at IS NULL) AS device_count,
       permitted.telemetry AS telemetry_allowed,permitted.alarm AS alarm_allowed,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)) FROM station_tag_link l JOIN station_tag t ON t.id=l.tag_id AND t.tenant_id=l.tenant_id WHERE l.station_id=st.id AND l.tenant_id=st.tenant_id),'[]'::jsonb)::text AS tags,
       (SELECT count(*) FROM ems_binding_period b WHERE b.station_id=st.id AND b.valid_to IS NULL AND b.valid_from<=now()) AS connections,
       (SELECT count(*) FROM ems_binding_period b JOIN ems_connection_read c USING(ems_uuid) WHERE b.station_id=st.id AND b.valid_to IS NULL AND b.valid_from<=now() AND c.reachable AND c.last_fresh_heartbeat BETWEEN now()-interval '90 seconds' AND now()) AS connected,
       (SELECT count(*) FROM ems_binding_period b JOIN ems_connection_read c USING(ems_uuid) WHERE b.station_id=st.id AND b.valid_to IS NULL AND b.valid_from<=now() AND c.last_fresh_heartbeat<=now()) AS known_connections,
       (SELECT count(*) FROM alarm a JOIN device d ON d.id=a.device_id LEFT JOIN alarm_business_origin o ON o.alarm_id=a.id WHERE coalesce(o.station_id,d.station_id)=st.id AND a.deleted_at IS NULL AND a.closed_at IS NULL AND a.occurred_at<=now() AND (a.recovered_at IS NULL OR a.recovered_at>now())) AS alarm_count
      FROM station st JOIN permitted ON permitted.station_id=st.id LEFT JOIN station_profile sp ON sp.station_id=st.id
      LEFT JOIN LATERAL(SELECT * FROM monitor_station_capture c WHERE c.station_id=st.id ORDER BY c.captured_at DESC,c.id DESC LIMIT 1) cap ON true
      WHERE permitted.asset AND st.archived_at IS NULL """+groupFilter+" ORDER BY st.id LIMIT 2001",queryArgs.toArray());
    if(raw.size()>2000)throw new BusinessException(413,"授权站点超过2000；请先缩小站点授权范围");
    var rows=new ArrayList<Map<String,Object>>();
    for(var r:raw){
      long id=Long.parseLong(r.get("id").toString());if(!assetScope.contains(id))continue;
      boolean t=Boolean.TRUE.equals(r.get("telemetry_allowed"))&&telemetryScope.contains(id),a=Boolean.TRUE.equals(r.get("alarm_allowed"))&&alarmScope.contains(id);
      var row=new LinkedHashMap<String,Object>();for(String key:List.of("id","name","code","scene","region","address","country","province","city","timezone","imported","replica_visible","device_count"))row.put(key,r.get(key));
      var metrics=new LinkedHashMap<String,Object>();boolean capture=q.get("sourceMode").equals("capture");
      row.put("assetScene",r.get("scene"));
      if(capture&&t&&Boolean.TRUE.equals(r.get("imported"))&&r.get("captured_at")!=null)row.put("scene",capturedScene(r.get("reference_systems"),r.get("scene").toString()));
      if(capture&&t)for(var e:object(r.get("captured_metrics")).entrySet())metrics.put(e.getKey(),MonitorWorkspaceRules.number(e.getValue()));
      // Installed capacities are asset metadata; no telemetry permission is needed to read them.
      metrics.put("pvCapacity",r.get("solar_capacity_kw"));
      if(Set.of("BESS","Hybrid").contains(r.get("scene"))){metrics.put("storagePower",r.get("rated_power_kw"));metrics.put("storageCapacity",r.get("capacity_kwh"));}
      row.put("metrics",metrics);row.put("telemetryAllowed",t);row.put("alarmAllowed",a);
      long total=((Number)r.get("connections")).longValue(),connected=((Number)r.get("connected")).longValue(),known=((Number)r.get("known_connections")).longValue();
      String communication=total==0?"unknown":connected==total?"online":connected>0?"partial":known>0?"offline":"connecting";
      row.put("currentCommunication",communication);
      if(capture&&t&&r.get("captured_communication")!=null)communication=r.get("captured_communication").toString();
      row.put("communication",communication);row.put("alarmCount",a?r.get("alarm_count"):null);
      row.put("capturedAt",t?time(r.get("captured_at")):null);row.put("updatedAt",capture&&t?time(r.get("source_updated_at")):null);
      row.put("source",capture&&t&&r.get("captured_at")!=null?"reference_capture":"current");
      row.put("siteType",Objects.toString(r.get("site_type"),"unknown"));
      var commissioned=r.get("commissioned_on");if(commissioned==null)commissioned=r.get("grid_connection_date");
      row.put("productionStatus",commissioned==null?"unknown":java.sql.Date.valueOf(commissioned.toString()).toLocalDate().isAfter(LocalDate.now(ZoneOffset.UTC))?"not_started":"running");
      // Captured storagePower is installed power, not instantaneous charge/discharge power.
      row.put("chargeStatus",capture&&t?Objects.toString(r.get("charge_status"),"unknown"):"unknown");row.put("watched",preference.watchedStationIds().contains(Long.toString(id)));
      try{row.put("tags",json.readValue(r.get("tags").toString(),List.class));}catch(Exception ex){throw new IllegalStateException("Invalid station tags",ex);}
      rows.add(row);
    }
    var options=new LinkedHashMap<String,Object>();options.put("regions",rows.stream().map(r->r.get("region")).filter(Objects::nonNull).map(Object::toString).filter(v->!v.isBlank()).distinct().sorted().toList());options.put("siteTypes",rows.stream().map(r->r.get("siteType").toString()).distinct().sorted().toList());
    var tags=new LinkedHashMap<String,Map<String,Object>>();for(var row:rows)for(Object rawTag:(List<?>)row.get("tags")){var tag=(Map<String,Object>)rawTag;tags.put(tag.get("id").toString(),tag);}options.put("tags",List.copyOf(tags.values()));
    var candidates=rows.stream().filter(row->matches(row,q)).toList();
    // Read the complete filtered set before ordering; paging must not hide the true highest/lowest value.
    for(var row:candidates)if(MonitorWorkspaceRules.needsLive(q.get("sourceMode").toString(),row.get("source").toString())){
      try{live(row);}catch(BusinessException ex){
        if(ex.status()!=503)throw ex;
        row.put("telemetryUnavailable",true);
      }
    }
    var filtered=candidates.stream().sorted(MonitorWorkspaceRules.comparator(q.get("sort").toString(),q.get("direction").toString())).toList();
    var facetQuery=new LinkedHashMap<>(q);facetQuery.put("communication","all");facetQuery.put("alarm","all");var facets=summary(rows.stream().filter(row->matches(row,facetQuery)).toList());
    int from=Math.min((int)q.get("offset"),filtered.size()),to=Math.min(from+(int)q.get("limit"),filtered.size());var page=new ArrayList<>(export?filtered:filtered.subList(from,to));
    var rules=ruleSummary(filtered);
    var dashboard="true".equals(parameters.get("includeDashboard"))?MonitorDashboardCapture.read(s,json,filtered,q):null;
    var currentScope=s.access.stationScopes(List.of("asset.read","telemetry.read","alarm.read"));
    var currentAssets=new HashSet<>(currentScope.get("asset.read"));var currentTelemetry=new HashSet<>(currentScope.get("telemetry.read"));var currentAlarms=new HashSet<>(currentScope.get("alarm.read"));
    for(var row:rows){long id=Long.parseLong(row.get("id").toString());if(!currentAssets.contains(id)||Boolean.TRUE.equals(row.get("telemetryAllowed"))&&!currentTelemetry.contains(id)||Boolean.TRUE.equals(row.get("alarmAllowed"))&&!currentAlarms.contains(id))throw new BusinessException(403,"监控查询期间权限已变化，请刷新重试");if(export&&filtered.contains(row))s.access.requireStationPermission(id,"report.export");}
    var result=new LinkedHashMap<String,Object>();result.put("items",page);result.put("total",filtered.size());result.put("limit",q.get("limit"));result.put("offset",q.get("offset"));result.put("summary",summary(filtered));result.put("facets",facets);result.put("rules",rules);result.put("preferences",preference);result.put("options",options);result.put("sourceMode",q.get("sourceMode"));result.put("serverTime",Instant.now().toString());result.put("dashboardCapture",dashboard);return result;
  }
  private static Object time(Object v){return v instanceof java.sql.Timestamp ts?ts.toInstant().toString():v;}
  @SuppressWarnings("unchecked") private static boolean matches(Map<String,Object> r,Map<String,Object> q){
    for(String key:List.of("scene","communication","productionStatus","chargeStatus"))if(!q.get(key).equals("all")&&!q.get(key).equals(r.get(key)))return false;
    if(q.get("scope").equals("replica")&&!Boolean.TRUE.equals(r.get("imported"))&&!Boolean.TRUE.equals(r.get("replica_visible")))return false; if(q.get("scope").equals("imported")&&!Boolean.TRUE.equals(r.get("imported")))return false;
    if(q.get("watched").equals("true")&&!Boolean.TRUE.equals(r.get("watched")))return false;
    if(!q.get("stationId").equals("")&&!q.get("stationId").equals(r.get("id")))return false;
    for(String key:List.of("region","siteType"))if(!q.get(key).equals("")&&!q.get(key).equals(r.get(key)))return false;
    String search=q.get("search").toString().toLowerCase(Locale.ROOT);if(!search.isEmpty()&&!(r.get("name")+" "+r.get("code")+" "+r.get("address")+" "+r.get("region")).toLowerCase(Locale.ROOT).contains(search))return false;
    Object alarm=r.get("alarmCount");if(q.get("alarm").equals("active")&&(alarm==null||((Number)alarm).longValue()==0)||q.get("alarm").equals("clear")&&(alarm==null||((Number)alarm).longValue()>0)||q.get("alarm").equals("unknown")&&alarm!=null)return false;
    if(!q.get("tagId").equals("")&&((List<Map<String,Object>>)r.get("tags")).stream().noneMatch(t->q.get("tagId").equals(t.get("id"))))return false;
    BigDecimal capacity=MonitorWorkspaceRules.number(((Map<String,Object>)r.get("metrics")).get("pvCapacity")),min=(BigDecimal)q.get("minCapacity"),max=(BigDecimal)q.get("maxCapacity");
    return (min==null||capacity!=null&&capacity.compareTo(min)>=0)&&(max==null||capacity!=null&&capacity.compareTo(max)<=0);
  }
  @SuppressWarnings("unchecked") private Map<String,Object> summary(List<Map<String,Object>> rows){
    var result=new LinkedHashMap<String,Object>();result.put("total",rows.size());
    for(String state:List.of("online","partial","offline","connecting","unknown"))result.put(state,rows.stream().filter(r->state.equals(r.get("communication"))).count());
    result.put("alarmSites",rows.stream().filter(r->r.get("alarmCount") instanceof Number n&&n.longValue()>0).count());result.put("alarmUnknown",rows.stream().filter(r->r.get("alarmCount")==null).count());
    for(String scene:List.of("PV","BESS","Hybrid"))result.put(scene,rows.stream().filter(r->scene.equals(r.get("scene"))).count());
    var metrics=rows.stream().map(r->(Map<String,Object>)r.get("metrics")).toList();result.put("totals",MonitorWorkspaceRules.totals(metrics));
    for(String key:List.of("pvCapacity","storagePower","storageCapacity")){var values=metrics.stream().map(m->MonitorWorkspaceRules.number(m.get(key))).filter(Objects::nonNull).toList();result.put(key,values.isEmpty()?null:values.stream().reduce(BigDecimal.ZERO,BigDecimal::add));}
    result.put("captureSites",rows.stream().filter(r->r.get("source").equals("reference_capture")).count());result.put("latestCapturedAt",rows.stream().map(r->r.get("capturedAt")).filter(Objects::nonNull).map(Object::toString).max(String::compareTo).orElse(null));return result;
  }
  private Map<String,Object> ruleSummary(List<Map<String,Object>> rows){
    var ids=rows.stream().filter(r->Boolean.TRUE.equals(r.get("alarmAllowed"))).map(r->r.get("id").toString()).toList();if(ids.isEmpty())return Map.of("counts",List.of(),"recent",List.of());
    String from=" FROM alarm a JOIN device d ON d.id=a.device_id LEFT JOIN alarm_business_origin o ON o.alarm_id=a.id JOIN station st ON st.id=coalesce(o.station_id,d.station_id) WHERE st.id IN ("+String.join(",",ids)+") AND a.source='rule' AND a.deleted_at IS NULL AND a.closed_at IS NULL AND a.occurred_at<=now() ";
    var counts=s.db.queryForList("SELECT a.severity,CASE WHEN a.recovered_at<=now() THEN 'recovered' ELSE 'active' END AS lifecycle,count(*) AS count"+from+"GROUP BY a.severity,lifecycle");
    var recent=s.db.queryForList("SELECT a.id::text,st.id::text AS station_id,st.name AS station_name,a.title,a.severity,a.occurred_at"+from+"AND (a.recovered_at IS NULL OR a.recovered_at>now()) ORDER BY a.occurred_at DESC,a.id DESC LIMIT 5");return Map.of("counts",counts,"recent",recent);
  }
  @SuppressWarnings("unchecked") private void live(Map<String,Object> row){
    if(!Boolean.TRUE.equals(row.get("telemetryAllowed")))return;long id=Long.parseLong(row.get("id").toString());
    var snapshot=telemetry.monitorSnapshot(id);var values=(List<Map<String,Object>>)snapshot.get("items");
    if(values==null)return;var metrics=(Map<String,Object>)row.get("metrics");var counts=(Map<String,Long>)snapshot.getOrDefault("mappingCounts",Map.of());
    Long newest=null;
    for(var entry:Map.of(20107L,"pvPower",20018L,"storageSoc").entrySet()){
      if(!Long.valueOf(1).equals(counts.get("cabinet:"+entry.getKey())))continue;
      var matches=values.stream().filter(v->"cabinet".equals(v.get("namespace"))&&entry.getKey().equals(v.get("sourceId") instanceof Number n?n.longValue():null)).toList();
      if(matches.size()!=1)continue;var reading=matches.getFirst();
      if(reading.get("staleReason")!=null||!"valid".equals(reading.get("quality"))||Boolean.TRUE.equals(reading.get("conflict"))||!(reading.get("sourceTime") instanceof Number time))continue;
      var value=MonitorWorkspaceRules.number(reading.get("value"));
      // Protocol catalog 20107 is already kW; 20018 is percent. No implicit unit conversion.
      if(value!=null){metrics.put(entry.getValue(),value);newest=newest==null?time.longValue():Math.max(newest,time.longValue());}
    }
    if(newest!=null)row.put("updatedAt",Instant.ofEpochMilli(newest).toString());
  }
}

