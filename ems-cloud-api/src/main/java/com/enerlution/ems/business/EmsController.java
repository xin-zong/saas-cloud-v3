package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import com.enerlution.ems.protocol.PointCatalog;
import com.fasterxml.jackson.databind.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigInteger;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class EmsController {
  private final DomainSupport s;
  private final ObjectMapper json;
  private final EmsTelemetryQueries telemetry;
  private final PointCatalog catalog=PointCatalog.loadDefault();
  public EmsController(DomainSupport s,ObjectMapper json,EmsTelemetryQueries telemetry) {
    this.s=s;this.json=json;this.telemetry=telemetry;
  }
  private static void identity(UUID ems) {
    if(ems==null||ems.version()!=4||ems.variant()!=2)throw new BusinessException(400,"EMS 必须为 UUIDv4");
  }
  private void lock(UUID ems) {
    identity(ems);s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?::text,78291029))",Object.class,ems.toString());
  }
  private Map<String,Object> current(UUID ems,String permission) {
    identity(ems);
    var p=s.one("SELECT id,station_id,valid_from FROM ems_binding_period WHERE ems_uuid=? AND valid_from<=clock_timestamp() AND valid_to IS NULL",ems);
    s.access.requireStationPermission(s.number(p,"station_id"),permission);return p;
  }
  @GetMapping("/stations/{id}/ems")
  public ApiResponse<?> gateways(@PathVariable long id) {
    s.access.requireStationPermission(id,"ems.read");
    return ApiResponse.ok(s.db.queryForList("""
      SELECT g.ems_uuid,g.device_id::text,p.id::text AS binding_period_id,
        c.reachable,c.last_fresh_heartbeat
      FROM ems_gateway g JOIN ems_binding_period p USING(ems_uuid)
      LEFT JOIN ems_connection_read c USING(ems_uuid)
      WHERE p.station_id=? AND p.valid_to IS NULL AND p.valid_from<=clock_timestamp()
      ORDER BY g.ems_uuid LIMIT 200
      """,id));
  }
  public record Registration(@NotNull UUID emsId,@Positive long deviceId){}
  @PostMapping("/stations/{id}/ems-bindings")
  @Transactional
  public ApiResponse<?> register(@PathVariable long id,@Valid @RequestBody Registration request) {
    s.access.requireStationPermission(id,"ems.manage");lock(request.emsId());
    var asset=s.one("SELECT station_id FROM device WHERE id=? FOR UPDATE",request.deviceId());
    if(s.number(asset,"station_id")!=id)throw new BusinessException(400,"EMS 资产不属于该站点");
    if(Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM ems_gateway WHERE ems_uuid=? OR device_id=?)",Boolean.class,request.emsId(),request.deviceId())))
      throw new BusinessException(409,"EMS 身份或资产已注册");
    s.db.update("INSERT INTO ems_gateway(ems_uuid,device_id) VALUES(?,?)",request.emsId(),request.deviceId());
    long period=s.db.queryForObject("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES(?,?,clock_timestamp()) RETURNING id",Long.class,request.emsId(),id);
    s.audit("ems.register",Map.of("emsId",request.emsId().toString(),"stationId",id));
    return ApiResponse.ok(Map.of("emsId",request.emsId(),"bindingPeriodId",Long.toString(period)));
  }
  public record Transfer(@Positive long stationId){}
  @PostMapping("/ems/{id}/transfer")
  @Transactional
  public ApiResponse<?> transfer(@PathVariable UUID id,@Valid @RequestBody Transfer n) {
    lock(id);var p=current(id,"ems.manage");s.access.requireStationPermission(n.stationId(),"ems.manage");
    long oldStation=s.number(p,"station_id"),period=s.number(p,"id");
    if(oldStation==n.stationId())throw new BusinessException(400,"EMS 已在该站点");
    var at=s.db.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class);
    closeChildren(period,at);
    s.db.update("UPDATE ems_binding_period SET valid_to=? WHERE id=?",at,period);
    s.db.queryForObject("SELECT ems_invalidate_binding(?,?)",Object.class,id,period);
    s.db.update("UPDATE device SET station_id=? WHERE id=(SELECT device_id FROM ems_gateway WHERE ems_uuid=?)",n.stationId(),id);
    long next=s.db.queryForObject("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES(?,?,?) RETURNING id",Long.class,id,n.stationId(),at);
    s.audit("ems.transfer",Map.of("emsId",id.toString(),"oldStationId",oldStation,"stationId",n.stationId()));
    return ApiResponse.ok(Map.of("bindingPeriodId",Long.toString(next)));
  }
  private void closeChildren(long period,java.sql.Timestamp at) {
    s.db.queryForList("SELECT pb.id FROM point_binding pb JOIN device_binding d ON d.id=pb.device_binding_id WHERE d.binding_period_id=? AND pb.valid_to IS NULL ORDER BY pb.id FOR UPDATE OF pb",period);
    s.db.update("UPDATE point_binding SET valid_to=? WHERE device_binding_id IN(SELECT id FROM device_binding WHERE binding_period_id=?) AND valid_to IS NULL",at,period);
    s.db.queryForList("SELECT id FROM device_binding WHERE binding_period_id=? AND valid_to IS NULL ORDER BY id FOR UPDATE",period);
    s.db.update("UPDATE device_binding SET valid_to=? WHERE binding_period_id=? AND valid_to IS NULL",at,period);
  }
  @GetMapping("/ems/{id}/structure")
  public ApiResponse<?> structure(@PathVariable UUID id) {
    var p=current(id,"ems.read");
    var rows=s.db.queryForList("""
      SELECT r.sv::text,c.seq::text,c.metadata::text,r.layout::text,c.received_at,
        COALESCE(v.reachable,false) AS reachable
      FROM structure_current c JOIN structure_revision r ON r.id=c.revision_id
      JOIN ems_connection_read v ON v.ems_uuid=c.ems_uuid AND v.connection_id=c.connection_id
      WHERE c.ems_uuid=? AND c.binding_period_id=?
      """,id,s.number(p,"id"));
    var result=new LinkedHashMap<String,Object>();result.put("known",!rows.isEmpty());result.put("bindingPeriodId",p.get("id").toString());
    result.put("unknownReason",rows.isEmpty()?"no_current_connection_structure":null);
    if(!rows.isEmpty()) {
      var row=rows.getFirst();result.put("sv",row.get("sv"));result.put("seq",row.get("seq"));
      result.put("metadata",safeJson(row.get("metadata")));result.put("layout",safeJson(row.get("layout")));
      result.put("receivedAt",row.get("received_at"));result.put("reachable",row.get("reachable"));
    }
    result.put("deviceMappings",s.db.queryForList("SELECT id::text,scope,cabinet_no,role,local_no::text,device_id::text,valid_from FROM device_binding WHERE binding_period_id=? AND valid_to IS NULL ORDER BY id",s.number(p,"id")));
    result.put("cabinetLinks",s.db.queryForList("SELECT cabinet_no,online,source_at_ms::text AS source_time_ms,received_at,binding_period_id::text,ingress_generation,ingress_order::text,fencing_token::text FROM cabinet_link_current WHERE binding_period_id=? ORDER BY cabinet_no",s.number(p,"id")));
    var mappings=s.db.queryForList("SELECT pb.id::text,pb.measurement_point_id::text,d.catalog_version,d.namespace,d.source_id::text,d.value_type,d.aggregation FROM point_binding pb JOIN device_binding b ON b.id=pb.device_binding_id JOIN point_definition d ON d.id=pb.definition_id WHERE b.binding_period_id=? AND b.valid_to IS NULL AND pb.valid_to IS NULL ORDER BY pb.id",s.number(p,"id"));
    for(var mapping:mappings)semantics(mapping,(String)mapping.get("aggregation"),(String)mapping.get("value_type"));
    result.put("pointMappings",mappings);
    return ApiResponse.ok(result);
  }
  @GetMapping("/ems/{id}/configuration")
  public ApiResponse<?> configuration(@PathVariable UUID id) {
    var p=current(id,"ems.read");
    var rows=s.db.queryForList("""
      SELECT r.id,r.cfg_rev::text,a.received_at FROM config_current c
      JOIN config_revision r ON r.id=c.revision_id
      JOIN config_acceptance a ON a.revision_id=c.revision_id AND a.binding_period_id=c.binding_period_id
      WHERE c.ems_uuid=? AND c.binding_period_id=?
      """,id,s.number(p,"id"));
    var result=new LinkedHashMap<String,Object>();result.put("known",!rows.isEmpty());result.put("unknownReason",rows.isEmpty()?"no_accepted_configuration":null);
    if(!rows.isEmpty()) {
      var row=rows.getFirst();result.put("revision",row.get("cfg_rev"));result.put("receivedAt",row.get("received_at"));
      result.put("revisionMeaning","effective_snapshot_identity_not_numeric_chronology");
      var values=s.db.queryForList("""
        SELECT d.source_id::text,d.value_type,v.number_value::text,v.text_value,v.boolean_value,v.words_value::text
        FROM config_value v JOIN point_definition d ON d.id=v.definition_id
        WHERE v.revision_id=? ORDER BY d.source_id LIMIT 2001
      """,s.number(row,"id"));
      if(values.size()>2000)throw new BusinessException(413,"配置快照超出展示范围");
      for(var value:values) {
        Object exact=value.get("number_value");if(exact==null)exact=value.get("text_value");if(exact==null)exact=value.get("boolean_value");
        if(value.get("words_value")!=null)exact=safeJson(value.get("words_value"));
        value.put("value",exact);value.keySet().removeAll(Set.of("number_value","text_value","boolean_value","words_value"));
        value.put("semanticStatus","unconfirmed_unit_and_enum");
      }
      result.put("values",values);
    } else result.put("values",List.of());
    return ApiResponse.ok(result);
  }
  public record Query(@NotBlank String operation,@NotNull JsonNode params){}
  @PostMapping("/ems/{id}/queries")
  @Transactional
  public ApiResponse<?> query(@PathVariable UUID id,@Valid @RequestBody Query n) {
    lock(id);var p=current(id,"ems.query");
    if(n==null||!Set.of("structure.get","alarm.current.get").contains(n.operation())||n.params()==null||!n.params().isObject())
      throw new BusinessException(400,"不支持的 EMS 查询操作");
    if(n.operation().equals("structure.get")) {
      if(!n.params().isEmpty())throw new BusinessException(400,"结构查询参数必须为空");
    } else {
      var c=n.params().path("c");
      if(n.params().size()!=1||!c.isIntegralNumber()||!c.canConvertToInt()||c.intValue()<1||c.intValue()>30)
        throw new BusinessException(400,"当前告警仅支持已分配柜号 1–30");
      if(!Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM device_binding WHERE binding_period_id=? AND scope='cabinet' AND cabinet_no=? AND valid_from<=clock_timestamp() AND valid_to IS NULL)",Boolean.class,s.number(p,"id"),c.intValue())))
        throw new BusinessException(400,"柜号尚未映射");
    }
    var state=s.one("SELECT connection_id,reachable FROM ems_connection_read WHERE ems_uuid=?",id);
    if(!Boolean.TRUE.equals(state.get("reachable")))throw new BusinessException(409,"EMS 通信不可达");
    long active=s.db.queryForObject("SELECT count(*) FROM query_request WHERE ems_uuid=? AND status IN ('pending','sent') AND expires_at>clock_timestamp()",Long.class,id);
    if(active>=32)throw new BusinessException(429,"EMS 查询队列已满");
    UUID request=UUID.randomUUID();
    s.db.update("INSERT INTO query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?,?,?,?,?,?,?::jsonb,clock_timestamp(),clock_timestamp()+interval '30 seconds','pending')",
        request,id,s.access.userId(),s.number(p,"id"),state.get("connection_id"),n.operation(),n.params().toString());
    s.audit("ems.query",Map.of("emsId",id.toString(),"requestId",request.toString(),"operation",n.operation()));
    return poll(id,request);
  }
  @GetMapping("/ems/{id}/queries/{requestId}")
  public ApiResponse<?> poll(@PathVariable UUID id,@PathVariable UUID requestId) {
    identity(id);
    var row=s.one("SELECT q.id,q.operation,q.status,q.created_at,q.expires_at,q.result::text,p.station_id FROM query_request q JOIN ems_binding_period p ON p.id=q.binding_period_id WHERE q.ems_uuid=? AND q.id=?",id,requestId);
    s.access.requireStationPermission(s.number(row,"station_id"),"ems.query");row.remove("station_id");
    row.put("result",safeJson(row.get("result")));return ApiResponse.ok(row);
  }
  @GetMapping("/ems/{id}/ingestion-status")
  public ApiResponse<?> ingestion(@PathVariable UUID id) {
    var p=current(id,"ems.read");long period=s.number(p,"id");
    var result=new LinkedHashMap<String,Object>();
    result.put("savedEvidence",s.db.queryForList("SELECT saved_objects,projected_objects,projection_failures,saved_history_parts,last_saved_at FROM ems_ingestion_status WHERE ems_uuid=? AND binding_period_id=?",id,period));
    result.put("diagnostics",s.db.queryForList("SELECT reason,retained_samples,last_received_at FROM ems_ingestion_diagnostics WHERE binding_period_id=?",period));
    result.put("refreshDemand",s.db.queryForList("SELECT cabinet_no,pending,CASE WHEN cabinet_no IS NULL THEN 'unsupported_ems_public_current_query' ELSE 'allocated_cabinet_query' END AS scope_status FROM ems_alarm_refresh_read WHERE binding_period_id=? ORDER BY cabinet_no NULLS FIRST",period));
    result.put("consumerLag",null);result.put("consumerLagUnavailableReason","not_instrumented_by_business_api");
    result.put("historyCompleteness",null);result.put("historyCompletenessUnavailableReason","protocol_packets_do_not_prove_complete_gap_recovery");
    return ApiResponse.ok(result);
  }
  @GetMapping("/ems-point-definitions")
  public ApiResponse<?> definitions() {
    s.access.requirePermission("ems.manage");
    return ApiResponse.ok(Map.of("catalogVersion",catalog.version(),"definitions",catalog.definitions()));
  }
  public record DeviceMapping(@NotBlank String scope,Integer cabinetNo,@NotBlank String role,
      @NotBlank String localNo,@Positive long deviceId){}
  @PostMapping("/ems/{id}/device-bindings")
  @Transactional
  public ApiResponse<?> deviceBinding(@PathVariable UUID id,@Valid @RequestBody DeviceMapping n) {
    lock(id);var p=current(id,"ems.manage");
    if(!Set.of("ems","cabinet","public").contains(n.scope())||!Set.of("ems","emu","bms","bmu","pcs","dcdc","tms","meter").contains(n.role()))
      throw new BusinessException(400,"不支持的设备作用域或角色");
    if(n.scope().equals("cabinet")?(n.cabinetNo()==null||n.cabinetNo()<1||n.cabinetNo()>30):n.cabinetNo()!=null)
      throw new BusinessException(400,"柜号与作用域不匹配");
    if(n.scope().equals("ems")?!n.role().equals("ems"):n.scope().equals("public")?!n.role().equals("meter"):n.role().equals("ems"))
      throw new BusinessException(400,"设备角色与作用域不匹配");
    var local=positive(n.localNo());var asset=s.one("SELECT station_id FROM device WHERE id=? FOR UPDATE",n.deviceId());
    if(s.number(asset,"station_id")!=s.number(p,"station_id"))throw new BusinessException(400,"设备不属于该站点");
    long binding=s.db.queryForObject("INSERT INTO device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(?,?,?,?,?,?,clock_timestamp()) RETURNING id",Long.class,s.number(p,"id"),n.scope(),n.cabinetNo(),n.role(),new java.math.BigDecimal(local),n.deviceId());
    s.audit("ems.device_mapping",Map.of("emsId",id.toString(),"bindingId",binding));return ApiResponse.ok(Map.of("id",Long.toString(binding)));
  }
  public record PointMapping(@Positive long deviceBindingId,@NotBlank String namespace,
      @NotBlank String sourceId,@Positive long pointId){}
  @PostMapping("/ems/{id}/point-bindings")
  @Transactional
  public ApiResponse<?> pointBinding(@PathVariable UUID id,@Valid @RequestBody PointMapping n) {
    lock(id);var p=current(id,"ems.manage");
    var binding=s.one("SELECT * FROM device_binding WHERE id=? AND binding_period_id=? AND valid_to IS NULL AND valid_from<=clock_timestamp() FOR UPDATE",n.deviceBindingId(),s.number(p,"id"));
    int source;try{source=positive(n.sourceId()).intValueExact();}catch(ArithmeticException e){throw new BusinessException(400,"源点不在批准目录");}
    var definition=catalog.find(n.namespace(),source).orElseThrow(()->new BusinessException(400,"源点不在批准目录"));
    if(definition.namespace().equals("config")||definition.wireType()==PointCatalog.WireType.UNKNOWN||definition.wireType()==PointCatalog.WireType.SCALAR)
      throw new BusinessException(400,"配置或未知定义不能绑定运行测点");
    String role=definition.namespace().equals("ems")?"ems":switch(definition.subsystem()){case "pvdc"->"dcdc";case "grid"->"meter";default->definition.subsystem();};
    if(!Objects.equals(role,binding.get("role"))||!definition.namespace().equals(binding.get("scope")))throw new BusinessException(400,"源点与设备位置不匹配");
    var point=s.one("SELECT p.device_id,p.kind_code,k.unit FROM measurement_point p JOIN measurement_kind k ON k.code=p.kind_code WHERE p.id=? FOR SHARE OF p",n.pointId());
    if(s.number(point,"device_id")!=s.number(binding,"device_id")||definition.verifiedUnit()!=null&&!definition.verifiedUnit().equals(point.get("unit")))
      throw new BusinessException(400,"测点资产或已确认单位不匹配");
    String type=definition.wireType().name().toLowerCase(Locale.ROOT);
    s.db.update("INSERT INTO point_definition(catalog_version,namespace,source_id,kind_code,value_type,aggregation) VALUES(?,?,?,?,?,'last') ON CONFLICT(catalog_version,namespace,source_id) DO NOTHING",catalog.version(),n.namespace(),source,point.get("kind_code"),type);
    var stored=s.one("SELECT id,value_type,kind_code FROM point_definition WHERE catalog_version=? AND namespace=? AND source_id=?",catalog.version(),n.namespace(),source);
    if(!stored.get("value_type").equals(type)||stored.get("kind_code")!=null&&!stored.get("kind_code").equals(point.get("kind_code")))
      throw new BusinessException(400,"目录类型或既有语义不匹配");
    long mapped=s.db.queryForObject("INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) VALUES(?,?,?,clock_timestamp()) RETURNING id",Long.class,n.deviceBindingId(),s.number(stored,"id"),n.pointId());
    s.audit("ems.point_mapping",Map.of("emsId",id.toString(),"bindingId",mapped));return ApiResponse.ok(Map.of("id",Long.toString(mapped),"catalogVersion",catalog.version()));
  }
  @PostMapping("/ems/{id}/device-bindings/{bindingId}/close")
  @Transactional
  public ApiResponse<?> closeDeviceBinding(@PathVariable UUID id,@PathVariable long bindingId) {
    lock(id);var p=current(id,"ems.manage");
    s.one("SELECT id FROM device_binding WHERE id=? AND binding_period_id=? AND valid_to IS NULL FOR UPDATE",bindingId,s.number(p,"id"));
    var at=s.db.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class);
    s.db.update("UPDATE point_binding SET valid_to=? WHERE device_binding_id=? AND valid_to IS NULL",at,bindingId);
    s.db.update("UPDATE device_binding SET valid_to=? WHERE id=?",at,bindingId);s.audit("ems.mapping_close",Map.of("bindingId",bindingId));return ApiResponse.ok(null);
  }
  @GetMapping("/ems/{id}/alarms")
  public ApiResponse<?> alarms(@PathVariable UUID id,@RequestParam(defaultValue="current") String scope,
      @RequestParam(required=false) Long stationId,@RequestParam(defaultValue="100") int limit,@RequestParam(defaultValue="0") int offset) {
    identity(id);List<Map<String,Object>> rows;
    if(scope.equals("current")) {
      var p=current(id,"ems.read");
      rows=s.db.queryForList("""
        SELECT e.*,i.business_alarm_id FROM ems_alarm_evidence e
        JOIN alarm_current_snapshot a ON a.ems_uuid=e.ems_uuid AND a.cabinet_no=e.cabinet_no
        JOIN ems_connection_read c ON c.ems_uuid=a.ems_uuid AND c.connection_id=a.connection_id
        JOIN ems_alarm_identity i ON i.ems_uuid=e.ems_uuid AND i.alarm_id=e.alarm_id
        WHERE e.ems_uuid=? AND e.binding_period_id=? AND e.evidence_kind IN ('current','last_known')
        ORDER BY e.cabinet_no,e.alarm_id LIMIT ? OFFSET ?
        """,id,s.number(p,"id"),s.limit(limit),s.offset(offset));
    } else if(scope.equals("history")&&stationId!=null) {
      s.access.requireStationPermission(stationId,"ems.read");
      rows=s.db.queryForList("SELECT e.*,i.business_alarm_id FROM ems_alarm_evidence e JOIN ems_binding_period p ON p.id=e.binding_period_id JOIN ems_alarm_identity i ON i.ems_uuid=e.ems_uuid AND i.alarm_id=e.alarm_id WHERE e.ems_uuid=? AND p.station_id=? AND e.evidence_kind='event' ORDER BY e.source_at DESC,e.seq DESC LIMIT ? OFFSET ?",id,stationId,s.limit(limit),s.offset(offset));
    } else throw new BusinessException(400,"历史告警必须指定原站点");
    for(var row:rows) {
      row.put("device",safeJson(row.get("device")));
      Object level=row.get("level");row.put("levelLabel",level==null?"等级未知":switch(((Number)level).intValue()){case 1->"预警";case 2->"故障";case 3->"紧急";default->"等级未知";});
      row.put("codeMeaning","uninterpreted_protocol_code");
      if(row.get("business_alarm_id")!=null) {
        var origin=s.one("SELECT station_id FROM ems_alarm_business_origin WHERE alarm_id=?",row.get("business_alarm_id"));
        if(!s.access.hasStationPermission(s.access.userId(),s.number(origin,"station_id"),"alarm.read"))row.put("business_alarm_id",null);
      }
      for(String key:List.of("seq","sv","binding_period_id","business_alarm_id"))if(row.get(key)!=null)row.put(key,row.get(key).toString());
    }
    if(scope.equals("current")) {
      var p=current(id,"ems.read");
      var parents=s.db.queryForList("""
        SELECT a.cabinet_no,a.known,a.observed_at,c.reachable,
          (SELECT count(*) FROM alarm_current_member m WHERE m.ems_uuid=a.ems_uuid AND m.cabinet_no=a.cabinet_no) AS total_members
        FROM alarm_current_snapshot a
        JOIN ems_connection_read c ON c.ems_uuid=a.ems_uuid AND c.connection_id=a.connection_id
        WHERE a.ems_uuid=? AND a.binding_period_id=? ORDER BY a.cabinet_no
        """,id,s.number(p,"id"));
      long precedingMembers=0;
      for(var parent:parents) {
        int cabinet=((Number)parent.get("cabinet_no")).intValue();
        parent.put("alarms",rows.stream().filter(r->((Number)r.get("cabinet_no")).intValue()==cabinet).toList());
        long total=((Number)parent.get("total_members")).longValue();
        long consumed=Math.min(total,Math.max(0L,(long)offset-precedingMembers))+((List<?>)parent.get("alarms")).size();
        parent.put("hasMore",consumed<total);precedingMembers+=total;
        parent.put("unknownReason",Boolean.TRUE.equals(parent.get("known"))?null:"current_alarm_list_unknown_last_known_only");
      }
      var result=new LinkedHashMap<String,Object>();result.put("snapshots",parents);
      result.put("scope","observed_cabinet_snapshots");
      result.put("known",!parents.isEmpty()&&parents.stream().allMatch(r->Boolean.TRUE.equals(r.get("known"))));
      result.put("unknownReason",parents.isEmpty()?"no_current_connection_snapshot":null);
      result.put("unsupportedScope","ems_public_current_query");result.put("memberLimit",limit);result.put("memberOffset",offset);
      return ApiResponse.ok(result);
    }
    return ApiResponse.ok(rows);
  }
  @GetMapping("/stations/{id}/telemetry/latest")
  public ApiResponse<?> latest(@PathVariable long id,@RequestParam(defaultValue="200") int limit,@RequestParam(defaultValue="0") int offset) {
    s.access.requireStationPermission(id,"telemetry.read");
    s.limit(limit);s.offset(offset);
    var periods=s.db.queryForList("SELECT id FROM ems_binding_period WHERE station_id=? AND valid_from<=clock_timestamp() AND valid_to IS NULL ORDER BY id LIMIT 2001",Long.class,id);
    String mapped=" FROM point_binding pb JOIN device_binding d ON d.id=pb.device_binding_id JOIN ems_binding_period p ON p.id=d.binding_period_id WHERE p.station_id=? AND p.valid_to IS NULL AND d.valid_to IS NULL AND pb.valid_to IS NULL AND pb.valid_from<=clock_timestamp()";
    long total=s.db.queryForObject("SELECT count(DISTINCT pb.measurement_point_id)"+mapped,Long.class,id);
    var points=s.db.queryForList("SELECT DISTINCT pb.measurement_point_id"+mapped+" ORDER BY pb.measurement_point_id LIMIT ? OFFSET ?",Long.class,id,limit,offset);
    var values=telemetry.latest(periods,points);
    var definitions=s.db.queryForList("SELECT pb.measurement_point_id,d.value_type,d.aggregation FROM point_binding pb JOIN device_binding b ON b.id=pb.device_binding_id JOIN ems_binding_period p ON p.id=b.binding_period_id JOIN point_definition d ON d.id=pb.definition_id WHERE p.station_id=? AND p.valid_to IS NULL AND b.valid_to IS NULL AND pb.valid_to IS NULL",id);
    for(var value:values) {
      var matching=definitions.stream().filter(d->Objects.equals(d.get("measurement_point_id").toString(),value.get("pointId"))).toList();
      if(matching.size()==1)semantics(value,(String)matching.getFirst().get("aggregation"),(String)matching.getFirst().get("value_type"));
      else semantics(value,null,null);
    }
    return ApiResponse.ok(Map.of("items",values,"total",total,"limit",limit,"offset",offset,"hasMore",(long)offset+points.size()<total));
  }
  @GetMapping("/devices/{id}/cells")
  public ApiResponse<?> cells(@PathVariable long id) {
    var asset=s.one("SELECT station_id FROM device WHERE id=?",id);s.access.requireStationPermission(s.number(asset,"station_id"),"telemetry.read");
    var rows=s.db.queryForList("""
      SELECT d.binding_period_id,d.cabinet_no,d.role,d.local_no::text,c.revision_id,c.connection_id,c.metadata::text FROM device_binding d
      JOIN ems_binding_period p ON p.id=d.binding_period_id
      JOIN structure_current c ON c.binding_period_id=p.id AND c.ems_uuid=p.ems_uuid
      JOIN ems_connection_read r ON r.ems_uuid=c.ems_uuid AND r.connection_id=c.connection_id
      WHERE d.device_id=? AND d.scope='cabinet' AND d.role IN ('bms','bmu') AND p.station_id=?
        AND d.valid_to IS NULL AND p.valid_to IS NULL AND c.revision_id IS NOT NULL
      ORDER BY d.id
      """,id,s.number(asset,"station_id"));
    if(rows.isEmpty())return ApiResponse.ok(Map.of("known",false,"unknownReason","no_accepted_layout_or_mapping","values",List.of()));
    var scopeKeys=rows.stream().map(r->r.get("binding_period_id")+":"+r.get("cabinet_no")+":"+r.get("revision_id")).distinct().toList();
    if(scopeKeys.size()!=1)return ApiResponse.ok(Map.of("known",false,"unknownReason","ambiguous_cabinet_mapping","values",List.of()));
    var row=rows.getFirst();int cabinet=((Number)row.get("cabinet_no")).intValue();
    boolean ready=false;JsonNode metadata;
    try {
      metadata=json.readTree(row.get("metadata").toString());
      for(var cluster:metadata.path("clusters"))
        if(cluster.path("c").intValue()==cabinet&&cluster.path("state").asText().equals("active")&&cluster.path("cellReady").asBoolean())ready=true;
    }catch(Exception e){throw new IllegalStateException("Invalid accepted structure metadata");}
    if(!ready)return ApiResponse.ok(Map.of("known",false,"unknownReason","current_cell_readiness_unconfirmed","values",List.of()));
    int bmuCount=metadata.path("clusterLayout").path("bms").path("bmuCount").asInt();
    var slots=new TreeSet<Integer>();
    for(var mapping:rows) {
      if(mapping.get("role").equals("bms")) {
        if(new java.math.BigDecimal(mapping.get("local_no").toString()).compareTo(java.math.BigDecimal.ONE)!=0||metadata.path("clusterLayout").path("bms").path("count").asInt()!=1)
          return ApiResponse.ok(Map.of("known",false,"unknownReason","unproven_bms_frame_scope","values",List.of()));
        for(int slot=1;slot<=bmuCount;slot++)slots.add(slot);
      } else {
        try {slots.add(new java.math.BigDecimal(mapping.get("local_no").toString()).intValueExact());}
        catch(ArithmeticException e){return ApiResponse.ok(Map.of("known",false,"unknownReason","bmu_slot_outside_accepted_layout","values",List.of()));}
      }
    }
    if(bmuCount<1||bmuCount>10||slots.isEmpty()||slots.first()<1||slots.last()>bmuCount)
      return ApiResponse.ok(Map.of("known",false,"unknownReason","bmu_slot_outside_accepted_layout","values",List.of()));
    var values=telemetry.cells(List.of(s.number(row,"binding_period_id")),cabinet,s.number(row,"revision_id"),(UUID)row.get("connection_id"));
    var scoped=new ArrayList<Map<String,Object>>();
    for(var value:values) {
      var dto=new LinkedHashMap<>(value);dto.put("bmuSlots",slots.stream().map(Object::toString).toList());
      if(value.get("value") instanceof List<?> groups) {
        if(groups.size()!=bmuCount)throw new BusinessException(503,"单体数据与接受布局不一致");
        dto.put("value",slots.stream().map(slot->groups.get(slot-1)).toList());
      }
      scoped.add(dto);
    }
    return ApiResponse.ok(Map.of("known",!scoped.isEmpty(),"unknownReason",scoped.isEmpty()?"no_accepted_cell_observation":"","values",scoped));
  }
  private static BigInteger positive(String value) {
    if(value==null||!value.matches("[1-9][0-9]{0,127}"))throw new BusinessException(400,"位置或源点号必须为正整数");return new BigInteger(value);
  }
  private static void semantics(Map<String,Object> dto,String aggregation,String type) {
    var supported=new ArrayList<String>();supported.add("last");
    boolean continuous="number".equals(type)&&Set.of("average","min","max").contains(Objects.toString(aggregation,""));
    if(continuous)supported.addAll(List.of("avg","min","max"));
    if("number".equals(type)&&"delta".equals(aggregation))supported.add("delta");
    dto.put("supportedAggregations",supported);dto.put("semanticStatus",continuous||"delta".equals(aggregation)?"approved_definition":"last_only_unconfirmed_aggregation_semantics");
  }
  private Object safeJson(Object value) {
    if(value==null)return null;
    try{return safeTree(json.readTree(value.toString()));}catch(Exception e){throw new IllegalStateException("Invalid stored normalized EMS evidence");}
  }
  private Object safeTree(JsonNode n) {
    if(n.isNull())return null;if(n.isNumber())return n.isIntegralNumber()?n.bigIntegerValue().toString():n.decimalValue().toString();
    if(n.isTextual())return n.textValue();if(n.isBoolean())return n.booleanValue();
    if(n.isArray()){var out=new ArrayList<Object>();n.forEach(v->out.add(safeTree(v)));return out;}
    var out=new LinkedHashMap<String,Object>();n.fields().forEachRemaining(e->out.put(e.getKey(),safeTree(e.getValue())));return out;
  }
}
