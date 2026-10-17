package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Dedicated DB-only worker. Does not start ingestion, issue hardware commands or send notifications. */
@Service
public class AlarmDetectionEngine {
  private static final Logger log=LoggerFactory.getLogger(AlarmDetectionEngine.class);
  private final JdbcTemplate db;private final AlarmSampleReader samples;private final ObjectMapper json;
  private final TransactionTemplate tx;private final boolean enabled;
  private long cursor;
  public AlarmDetectionEngine(JdbcTemplate db,AlarmSampleReader samples,ObjectMapper json,
      PlatformTransactionManager manager,@Value("${EMS_ALARM_ENGINE_ENABLED:false}") boolean enabled){
    this.db=db;this.samples=samples;this.json=json;this.tx=new TransactionTemplate(manager);this.enabled=enabled;
  }
  private void guard(){
    if(!Boolean.TRUE.equals(db.queryForObject("SELECT current_database()='ems_cloud_saas_toyingzhen' AND current_user='ems_toyingzhen_owner' AND current_schema()='public'",Boolean.class)))
      throw new IllegalStateException("Alarm engine requires isolated toyingzhen database and owner");
  }
  @Scheduled(fixedDelayString="${EMS_ALARM_ENGINE_DELAY_MS:10000}",initialDelayString="${EMS_ALARM_ENGINE_INITIAL_DELAY_MS:15000}")
  public synchronized void runOnce(){
    if(!enabled)return;
    guard();
    var ids=db.queryForList("SELECT id FROM alarm_rule_config WHERE deleted_at IS NULL AND id>? ORDER BY id LIMIT 100",Long.class,cursor);
    if(ids.isEmpty()){cursor=0;return;}
    for(long id:ids){
      try{evaluateRule(id,Instant.now());}catch(RuntimeException ex){log.warn("Alarm rule {} evaluation rolled back ({})",id,ex.getClass().getSimpleName());}
      cursor=id;
    }
  }
  List<AlarmRules.Condition> conditions(Map<String,Object> rule){
    try{Object value=rule.get("conditions");return value instanceof List<?>?json.convertValue(value,new TypeReference<>(){}):json.readValue(value.toString(),new TypeReference<>(){});}
    catch(Exception ex){throw new IllegalStateException("Invalid persisted alarm conditions",ex);}
  }
  private boolean permitted(Map<String,Object> rule){
    return Boolean.TRUE.equals(db.queryForObject("SELECT count(DISTINCT permission_code)=3 FROM saas_effective_station_permission WHERE user_id=? AND station_id=? AND client='web' AND permission_code IN ('alarm.handle','alarm.read','telemetry.read')",Boolean.class,rule.get("updated_by"),rule.get("station_id")));
  }
  static long number(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
  private static Instant instant(Object value){return value instanceof OffsetDateTime d?d.toInstant():((Timestamp)value).toInstant();}
  private OffsetDateTime at(long milliseconds){return OffsetDateTime.ofInstant(Instant.ofEpochMilli(milliseconds),ZoneOffset.UTC);}
  private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception ex){throw new IllegalStateException(ex);}}

  /** Internal testable worker entry; no HTTP endpoint accepts sample values or an evaluation clock. */
  public void evaluateRule(long id,Instant now){
    if(!enabled)return;guard();
    tx.executeWithoutResult(transaction->{
      var rules=db.queryForList("SELECT * FROM alarm_rule_config WHERE id=? AND deleted_at IS NULL FOR UPDATE SKIP LOCKED",id);
      if(rules.isEmpty())return;var rule=rules.getFirst();long version=number(rule,"version");
      long bucket=(now.toEpochMilli()-5000)/60000*60000-60000;
      var rows=db.queryForList("SELECT * FROM alarm_rule_execution WHERE rule_id=?",id);
      Map<String,Object> saved=rows.isEmpty()?null:rows.getFirst();
      boolean sameVersion=saved!=null&&number(saved,"rule_version")==version;
      if(sameVersion&&number(saved,"last_bucket_ms")>=bucket)return;
      Map<String,Object> active=null;
      var candidates=db.queryForList("SELECT alarm_id FROM alarm_rule_occurrence WHERE rule_id=? AND ended_at IS NULL",Long.class,id);
      if(!candidates.isEmpty()){
        long candidate=candidates.getFirst();
        // UI actions lock alarm before occurrence. Keep that order and recheck the candidate
        // after waiting, so a concurrent manual close cannot deadlock or be recovered again.
        var alarm=db.queryForMap("SELECT version AS alarm_version,closed_at,deleted_at,recovered_at FROM alarm WHERE id=? FOR UPDATE",candidate);
        var currentOccurrence=db.queryForList("SELECT * FROM alarm_rule_occurrence WHERE alarm_id=? AND ended_at IS NULL FOR UPDATE",candidate);
        if(!currentOccurrence.isEmpty()){active=currentOccurrence.getFirst();active.putAll(alarm);}
      }
      boolean terminal=active!=null&&(active.get("closed_at")!=null||active.get("deleted_at")!=null||active.get("recovered_at")!=null);
      if(terminal){db.update("UPDATE alarm_rule_occurrence SET ended_at=? WHERE alarm_id=?",at(now.toEpochMilli()),active.get("alarm_id"));active=null;}
      boolean latched=(saved!=null&&Boolean.TRUE.equals(saved.get("latched")))||terminal||active!=null;
      var prior=sameVersion?new AlarmEvaluation.State(number(saved,"last_bucket_ms"),((Number)saved.get("consecutive")).intValue(),saved.get("normal_since_ms")==null?null:number(saved,"normal_since_ms"),latched):new AlarmEvaluation.State(-1,0,null,latched);
      String mapping=saved==null?"":saved.get("mapping_key").toString();
      var reset=new AlarmEvaluation.State(bucket,0,null,latched);
      Long activeId=active==null?null:number(active,"alarm_id");
      if(!Boolean.TRUE.equals(rule.get("enabled"))){save(rule,reset,mapping,"disabled","规则已停用，触发和恢复累计已重置",List.of(),activeId,bucket,now);return;}
      if(!permitted(rule)){save(rule,reset,mapping,"unknown","规则最近修改者已失去本站告警处理或采样读取权限，检测暂停",List.of(),activeId,bucket,now);return;}
      var conditions=conditions(rule);String unsupported=AlarmEvaluation.unsupported(rule.get("object_type").toString(),conditions);
      if(unsupported!=null){save(rule,reset,mapping,"unsupported",unsupported,List.of(),activeId,bucket,now);return;}
      if(instant(rule.get("updated_at")).toEpochMilli()>bucket){save(rule,reset,mapping,"waiting","等待规则修改后的首个完整分钟",List.of(),activeId,bucket,now);return;}
      if(active!=null&&number(active,"rule_version")!=version){save(rule,reset,mapping,"unknown","规则已改版，请先人工关闭旧版本告警；不会用新阈值恢复旧告警",List.of(),activeId,bucket,now);return;}
      int minute=Instant.ofEpochMilli(bucket).atOffset(ZoneOffset.UTC).getHour()*60+Instant.ofEpochMilli(bucket).atOffset(ZoneOffset.UTC).getMinute();
      if(minute<number(rule,"effective_start")||minute>=number(rule,"effective_end")){
        save(rule,reset,mapping,"waiting","不在规则UTC有效时段内，连续累计已重置",List.of(),activeId,bucket,now);return;
      }
      AlarmSampleReader.Frame frame;
      try{frame=samples.read(rule,conditions,bucket,now);}catch(BusinessException ex){frame=new AlarmSampleReader.Frame(List.of(),List.of(),"","真实采样查询暂不可用，本分钟不判定");}
      // The source read can outlive a role edit. Recheck the same persisted rule and live permissions.
      var current=db.queryForMap("SELECT version,enabled,deleted_at FROM alarm_rule_config WHERE id=?",id);
      if(number(current,"version")!=version||!Boolean.TRUE.equals(current.get("enabled"))||current.get("deleted_at")!=null||!permitted(rule))return;
      if(frame.reason()!=null){save(rule,reset,mapping,"unknown",frame.reason(),frame.evidence(),activeId,bucket,now);return;}
      if(!frame.mappingKey().equals(mapping))prior=new AlarmEvaluation.State(-1,0,null,latched);
      if(active!=null&&!frame.mappingKey().equals(active.get("mapping_key"))){
        save(rule,reset,mapping,"unknown","测点绑定已变化，请先人工关闭旧绑定告警",frame.evidence(),activeId,bucket,now);return;
      }
      mapping=frame.mappingKey();var verdict=AlarmEvaluation.compare(conditions,frame.values());
      int periods=conditions.getFirst().period();
      var step=AlarmEvaluation.advance(prior,bucket,verdict,periods,(int)number(rule,"recovery_duration"),active!=null,true);
      long sourceTime=frame.evidence().stream().mapToLong(v->((Number)v.get("sourceTime")).longValue()).max().orElse(bucket+59999);
      if(active!=null&&verdict==AlarmEvaluation.Verdict.NORMAL){
        // Adjacent buckets need not be 60 seconds apart in actual source time. Start only
        // after all first-frame facts, and require the whole current evidence frontier to pass it.
        long since=prior.lastBucket()==bucket-60000&&prior.normalSince()!=null?prior.normalSince():sourceTime;
        long frontier=frame.evidence().stream().mapToLong(v->((Number)v.get("sourceTime")).longValue()).min().orElse(sourceTime);
        boolean recovered=number(rule,"recovery_duration")==0||frontier-since>=number(rule,"recovery_duration")*1000;
        step=new AlarmEvaluation.Step(new AlarmEvaluation.State(bucket,0,recovered?null:since,!recovered),recovered?"recover":null);
      }
      String status=active!=null?"active":verdict==AlarmEvaluation.Verdict.NORMAL?"normal":"ready";
      String reason=verdict==AlarmEvaluation.Verdict.NORMAL?"真实采样正常，连续正常时长达到配置后自动恢复":"条件命中，连续 "+step.state().consecutive()+"/"+periods+" 个完整分钟";
      if("trigger".equals(step.action())){
        activeId=db.queryForObject("INSERT INTO alarm(device_id,code,title,severity,occurred_at,source) VALUES(?,?,?,?,?,'rule') RETURNING id",Long.class,rule.get("device_id"),"RULE-"+id,rule.get("name"),rule.get("severity"),at(sourceTime));
        String snapshot=db.queryForObject("SELECT to_jsonb(r)::text FROM alarm_rule_config r WHERE id=?",String.class,id);
        db.update("INSERT INTO alarm_rule_occurrence(alarm_id,rule_id,rule_version,station_id,mapping_key,rule_snapshot,trigger_evidence) VALUES(?,?,?,?,?,?::jsonb,?::jsonb)",activeId,id,version,rule.get("station_id"),mapping,snapshot,encode(frame.evidence()));
        reason="真实采样连续命中，自动触发；触发采样证据已保存，规则版本 "+version;status="active";
        action(rule,activeId,1,"trigger",reason);
      }else if("recover".equals(step.action())){
        long alarm=Objects.requireNonNull(activeId);
        db.update("UPDATE alarm SET recovered_at=?,version=version+1 WHERE id=? AND closed_at IS NULL AND deleted_at IS NULL",at(sourceTime),alarm);
        db.update("UPDATE alarm_rule_occurrence SET recovery_evidence=?::jsonb,ended_at=? WHERE alarm_id=?",encode(frame.evidence()),at(sourceTime),alarm);
        reason="连续正常真实采样已达到恢复时长，自动恢复；恢复采样证据已保存，规则版本 "+version;status="normal";
        action(rule,alarm,number(Objects.requireNonNull(active),"alarm_version")+1,"recover",reason);
      }else if(step.state().latched()&&active==null){reason="持续异常已抑制，须先出现有效正常采样后才可再次触发";}
      save(rule,step.state(),mapping,status,reason,frame.evidence(),activeId,bucket,now);
    });
  }
  private void action(Map<String,Object> rule,long alarm,long version,String action,String reason){
    db.update("INSERT INTO alarm_action_event(alarm_id,actor_id,actor_type,action,note,version) VALUES(?,NULL,'engine',?,?,?)",alarm,action,reason,version);
    db.update("INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) SELECT NULL,tenant_id,?,? FROM station WHERE id=?","alarm.engine."+action,encode(Map.of("ruleId",rule.get("id"),"alarmId",alarm,"ruleVersion",rule.get("version"),"reason",reason)),rule.get("station_id"));
  }
  private void save(Map<String,Object> rule,AlarmEvaluation.State state,String mapping,String status,String reason,List<Map<String,Object>> evidence,Long alarm,long bucket,Instant now){
    db.update("INSERT INTO alarm_rule_execution(rule_id,rule_version,mapping_key,last_bucket_ms,consecutive,normal_since_ms,latched,status,reason,checked_at,evidence) VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb) ON CONFLICT(rule_id) DO UPDATE SET rule_version=excluded.rule_version,mapping_key=excluded.mapping_key,last_bucket_ms=excluded.last_bucket_ms,consecutive=excluded.consecutive,normal_since_ms=excluded.normal_since_ms,latched=excluded.latched,status=excluded.status,reason=excluded.reason,checked_at=excluded.checked_at,evidence=excluded.evidence",rule.get("id"),rule.get("version"),mapping,state.lastBucket(),state.consecutive(),state.normalSince(),state.latched(),status,reason,at(now.toEpochMilli()),encode(evidence));
    db.update("INSERT INTO alarm_detection_event(rule_id,rule_version,alarm_id,bucket_ms,status,reason,evidence) VALUES(?,?,?,?,?,?,?::jsonb) ON CONFLICT DO NOTHING",rule.get("id"),rule.get("version"),alarm,bucket,status,reason,encode(evidence));
  }
  public void describe(Map<String,Object> rule){
    rule.put("deliveryStatus","not_connected");
    if(!enabled||!Boolean.TRUE.equals(rule.get("enabled"))){rule.put("evaluationStatus","disabled");rule.put("evaluationReason",!enabled?"隔离告警检测服务未启用":"规则已停用");return;}
    String reason=AlarmEvaluation.unsupported(rule.get("object_type").toString(),conditions(rule));
    if(reason!=null){rule.put("evaluationStatus","unsupported");rule.put("evaluationReason",reason);return;}
    var rows=db.queryForList("SELECT e.*,(SELECT alarm_id FROM alarm_rule_occurrence o WHERE o.rule_id=e.rule_id AND o.ended_at IS NULL) AS active_alarm_id FROM alarm_rule_execution e WHERE rule_id=? AND rule_version=?",rule.get("id"),rule.get("version"));
    if(rows.isEmpty()){rule.put("evaluationStatus","ready");rule.put("evaluationReason","等待首个规则修改后的完整采样分钟");return;}
    var execution=rows.getFirst();rule.put("evaluationStatus",execution.get("status"));rule.put("evaluationReason",execution.get("reason"));rule.put("evaluationLastAt",execution.get("checked_at"));rule.put("evaluationRuleVersion",execution.get("rule_version"));rule.put("evaluationConsecutive",execution.get("consecutive"));rule.put("evaluationActiveAlarmId",execution.get("active_alarm_id"));
  }
}
