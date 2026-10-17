package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AlarmRuleService {
  private final DomainSupport s;
  private final AlarmDetectionEngine engine;
  private final ObjectMapper json=new ObjectMapper();
  public AlarmRuleService(DomainSupport s){this(s,null);}
  @org.springframework.beans.factory.annotation.Autowired
  public AlarmRuleService(DomainSupport s,AlarmDetectionEngine engine){this.s=s;this.engine=engine;}
  public record Notification(boolean needed,int maxCount,List<String> channels,List<Long> recipients,boolean recoveryNotice){}
  public record Draft(long stationId,String name,String objectType,Long deviceId,String severity,List<AlarmRules.Condition> conditions,int effectiveStart,int effectiveEnd,int recoveryDuration,String solution,Notification notification,long expectedVersion){}
  public static void validate(Draft d){
    if(d==null||d.stationId()<1||d.name()==null||d.name().isBlank()||d.name().length()>120)AlarmRules.bad("规则名称必填且不超过120字");
    if(!Set.of("STATION","DEVICE").contains(Objects.toString(d.objectType(),""))||("DEVICE".equals(d.objectType())!=(d.deviceId()!=null)))AlarmRules.bad("请选择规则对象及设备");
    if(!Set.of("critical","warning","info").contains(Objects.toString(d.severity(),"")))AlarmRules.bad("告警等级无效");
    if(d.conditions()==null||d.conditions().isEmpty()||d.conditions().size()>10)AlarmRules.bad("规则需要1–10个条件");
    for(var c:d.conditions()){AlarmRules.validate(c);for(var field:c.fields())if(!d.objectType().equals(field.objectType()))AlarmRules.bad("条件指标对象与规则不一致");}
    if(d.effectiveStart()<0||d.effectiveEnd()>1440||d.effectiveStart()%15!=0||d.effectiveEnd()%15!=0||d.effectiveEnd()<=d.effectiveStart())AlarmRules.bad("有效时段须为15分钟整数且结束晚于开始");
    if(d.recoveryDuration()<0||d.recoveryDuration()>86400)AlarmRules.bad("恢复持续时间须为0–86400秒");
    if(d.solution()==null||d.solution().length()>4000)AlarmRules.bad("处置方案最多4000字");
    var n=d.notification();if(n==null||n.channels()==null||n.recipients()==null||n.maxCount()<1||n.maxCount()>100||n.recipients().size()>100)AlarmRules.bad("通知配置无效，次数须为1–100");
    if(n.channels().stream().anyMatch(c->c==null||!Set.of("in_app","email","sms").contains(c))||n.recipients().stream().anyMatch(Objects::isNull)||new HashSet<>(n.recipients()).size()!=n.recipients().size()||new HashSet<>(n.channels()).size()!=n.channels().size())AlarmRules.bad("通知渠道或收件人无效");
    if(n.needed()&&(n.channels().isEmpty()||n.recipients().isEmpty()))AlarmRules.bad("开启通知须选择渠道及收件人");
  }
  private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);}}
  private Map<String,Object> decode(Map<String,Object> row){
    try{row.put("conditions",json.readValue(row.get("conditions").toString(),new TypeReference<List<Object>>(){}));row.put("notification",json.readValue(row.get("notification").toString(),new TypeReference<Map<String,Object>>(){}));}catch(Exception e){throw new IllegalStateException(e);}
    if(engine!=null)engine.describe(row);
    else {row.put("evaluationStatus","disabled");row.put("evaluationReason","隔离告警检测服务未启用");row.put("deliveryStatus","not_connected");}
    return row;
  }
  public List<Map<String,Object>> list(Long stationId){
    if(stationId!=null)s.access.requireStationPermission(stationId,"alarm.read");
    var rows=s.db.queryForList("SELECT r.*,st.name AS station_name FROM alarm_rule_config r JOIN station st ON st.id=r.station_id WHERE r.deleted_at IS NULL AND (?::bigint IS NULL OR r.station_id=?) AND EXISTS(SELECT 1 FROM "+s.access.stationPermissionTable()+" p WHERE p.user_id=? AND p.station_id=r.station_id AND p.permission_code='alarm.read') ORDER BY r.id DESC",stationId,stationId,s.access.userId());
    return rows.stream().map(this::decode).toList();
  }
  private Map<String,Object> authorized(long id,String permission,boolean lock){var row=s.one("SELECT * FROM alarm_rule_config WHERE id=? AND deleted_at IS NULL"+(lock?" FOR UPDATE":""),id);s.access.requireStationPermission(s.number(row,"station_id"),permission);return row;}
  public Map<String,Object> detail(long id){return decode(authorized(id,"alarm.read",false));}
  public Map<String,Object> options(long station){
    s.access.requireStationPermission(station,"alarm.handle");
    var recipients=s.db.queryForList("SELECT u.id,u.display_name FROM app_user u JOIN station st ON st.id=? JOIN saas_active_user au ON au.user_id=u.id AND au.tenant_id=st.tenant_id WHERE EXISTS(SELECT 1 FROM "+s.access.stationPermissionTable()+" p WHERE p.user_id=u.id AND p.station_id=st.id AND p.permission_code='alarm.read') ORDER BY u.id",station);
    var devices=s.db.queryForList("SELECT id,name FROM device WHERE station_id=? ORDER BY id",station);
    return Map.of("recipients",recipients,"devices",devices,"deliveryStatus","not_connected");
  }
  private void validateReferences(Draft d){
    if(d.deviceId()!=null&&!Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM device WHERE id=? AND station_id=?)",Boolean.class,d.deviceId(),d.stationId())))AlarmRules.bad("设备不属于该站点");
    for(long recipient:d.notification().recipients()){
      if(!Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM saas_active_user u JOIN station st ON st.tenant_id=u.tenant_id WHERE u.user_id=? AND st.id=?)",Boolean.class,recipient,d.stationId())) || !s.access.hasStationPermission(recipient,d.stationId(),"alarm.read"))AlarmRules.bad("收件人未启用、跨企业或无站点告警阅读权限");
    }
  }
  private void revision(long id,String action,long station){
    var snapshot=s.one("SELECT to_jsonb(r)::text AS snapshot,version FROM alarm_rule_config r WHERE id=?",id);
    s.db.update("INSERT INTO alarm_rule_revision(rule_id,actor_id,action,version,snapshot) VALUES(?,?,?,?,?::jsonb)",id,s.access.userId(),action,snapshot.get("version"),snapshot.get("snapshot"));
    s.auditStation("alarm.rule."+action,station,Map.of("rule",id,"version",snapshot.get("version")));
  }
  @Transactional public Map<String,Object> create(Draft d){
    validate(d);s.access.requireStationPermission(d.stationId(),"alarm.handle");validateReferences(d);
    long id=s.db.queryForObject("INSERT INTO alarm_rule_config(station_id,name,object_type,device_id,severity,conditions,effective_start,effective_end,recovery_duration,solution,notification,created_by,updated_by) VALUES(?,?,?,?,?,?::jsonb,?,?,?,?,?::jsonb,?,?) RETURNING id",Long.class,d.stationId(),d.name().trim(),d.objectType(),d.deviceId(),d.severity(),encode(d.conditions()),d.effectiveStart(),d.effectiveEnd(),d.recoveryDuration(),d.solution(),encode(d.notification()),s.access.userId(),s.access.userId());
    revision(id,"create",d.stationId());return detail(id);
  }
  @Transactional public Map<String,Object> update(long id,Draft d){
    validate(d);var old=authorized(id,"alarm.handle",true);
    if(s.number(old,"station_id")!=d.stationId())AlarmRules.bad("规则不能转移站点");
    version(old,d.expectedVersion());validateReferences(d);
    s.db.update("UPDATE alarm_rule_config SET name=?,object_type=?,device_id=?,severity=?,conditions=?::jsonb,effective_start=?,effective_end=?,recovery_duration=?,solution=?,notification=?::jsonb,version=version+1,updated_at=now(),updated_by=? WHERE id=?",d.name().trim(),d.objectType(),d.deviceId(),d.severity(),encode(d.conditions()),d.effectiveStart(),d.effectiveEnd(),d.recoveryDuration(),d.solution(),encode(d.notification()),s.access.userId(),id);
    revision(id,"update",d.stationId());return detail(id);
  }
  private void version(Map<String,Object> row,long expected){if(s.number(row,"version")!=expected)throw new BusinessException(409,"规则已被其他人更新，请刷新");}
  @Transactional public Map<String,Object> toggle(long id,long expected,boolean enabled){
    var row=authorized(id,"alarm.handle",true);version(row,expected);
    if(row.get("enabled").equals(enabled))return decode(row);
    s.db.update("UPDATE alarm_rule_config SET enabled=?,version=version+1,updated_at=now(),updated_by=? WHERE id=?",enabled,s.access.userId(),id);revision(id,enabled?"enable":"disable",s.number(row,"station_id"));return detail(id);
  }
  @Transactional public void delete(long id,long expected){
    var row=authorized(id,"alarm.handle",true);version(row,expected);
    s.db.update("UPDATE alarm_rule_config SET deleted_at=now(),version=version+1,updated_at=now(),updated_by=? WHERE id=?",s.access.userId(),id);revision(id,"delete",s.number(row,"station_id"));
  }
  public List<Map<String,Object>> history(long id){authorized(id,"alarm.read",false);return s.db.queryForList("SELECT id,actor_id,action,version,snapshot,occurred_at FROM alarm_rule_revision WHERE rule_id=? ORDER BY version",id);}
  public List<Map<String,Object>> evaluations(long id,int limit,int offset){
    var rule=authorized(id,"alarm.read",false);s.limit(limit);s.offset(offset);
    boolean evidence=s.access.hasStationPermission(s.access.userId(),s.number(rule,"station_id"),"telemetry.read");
    var rows=s.db.queryForList("SELECT * FROM alarm_detection_event WHERE rule_id=? ORDER BY id DESC LIMIT ? OFFSET ?",id,limit,offset);
    for(var row:rows){try{row.put("evidence",evidence?json.readValue(row.get("evidence").toString(),List.class):List.of());}catch(Exception ex){throw new IllegalStateException(ex);}}
    return rows;
  }
}
