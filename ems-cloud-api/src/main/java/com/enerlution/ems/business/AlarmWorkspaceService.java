package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AlarmWorkspaceService {
  private final DomainSupport s;
  public AlarmWorkspaceService(DomainSupport s) { this.s=s; }
  private static final String FROM=" FROM alarm a JOIN device d ON d.id=a.device_id LEFT JOIN ems_alarm_business_origin o ON o.alarm_id=a.id JOIN station st ON st.id=COALESCE(o.station_id,d.station_id) ";
  private static final String COLUMNS="a.id,a.device_id,a.code,a.title,a.severity,a.source,a.version,a.occurred_at,CASE WHEN a.recovered_at<=now() THEN a.recovered_at END AS recovered_at,a.acknowledged_by,a.acknowledged_at,a.sla_due_at,a.closed_by,a.closed_at,COALESCE(o.station_id,d.station_id) AS station_id,d.name AS device_name,st.name AS station_name,CASE WHEN a.recovered_at<=now() THEN a.recovered_at END AS effective_recovered_at,CASE WHEN a.closed_at IS NOT NULL THEN 'closed' WHEN a.recovered_at<=now() THEN 'recovered' ELSE 'active' END AS lifecycle";
  public Map<String,Object> list(Long stationId,String view,String source,String severity,Long deviceId,String readFlag,String query,OffsetDateTime start,OffsetDateTime end,int limit,int offset) {
    s.limit(limit);s.offset(offset);
    if(stationId!=null) s.access.requireStationPermission(stationId,"alarm.read");
    if(!Set.of("all","live","history").contains(view)) AlarmRules.bad("告警视图无效");
    if(source!=null&&!Set.of("device","rule").contains(source)) AlarmRules.bad("告警来源无效");
    if(severity!=null&&!Set.of("critical","warning","info").contains(severity)) AlarmRules.bad("告警等级无效");
    if(readFlag!=null&&!Set.of("read","unread").contains(readFlag)) AlarmRules.bad("阅读状态无效");
    if(start!=null&&end!=null&&!end.isAfter(start)) AlarmRules.bad("结束时间须晚于开始时间");
    if(query!=null&&query.length()>200) AlarmRules.bad("搜索内容过长");
    StringBuilder where=new StringBuilder(" WHERE a.deleted_at IS NULL AND a.occurred_at<=now() AND EXISTS(SELECT 1 FROM "+s.access.stationPermissionTable()+" p WHERE p.user_id=? AND p.station_id=st.id AND p.permission_code='alarm.read')");
    List<Object> args=new ArrayList<>();args.add(s.access.userId());
    if(stationId!=null){where.append(" AND st.id=?");args.add(stationId);}
    if("live".equals(view)) where.append(" AND a.closed_at IS NULL AND (a.recovered_at IS NULL OR a.recovered_at>now())");
    if("history".equals(view)) where.append(" AND (a.closed_at IS NOT NULL OR a.recovered_at<=now())");
    if(source!=null){where.append(" AND a.source=?");args.add(source);}
    if(severity!=null){where.append(" AND a.severity=?");args.add(severity);}
    if(deviceId!=null){where.append(" AND a.device_id=?");args.add(deviceId);}
    if(start!=null){where.append(" AND a.occurred_at>=?");args.add(start);}
    if(end!=null){where.append(" AND a.occurred_at<?");args.add(end);}
    if(query!=null&&!query.isBlank()){where.append(" AND (a.title ILIKE ? OR a.code ILIKE ? OR d.name ILIKE ?)");for(int i=0;i<3;i++) args.add("%"+query+"%");}
    String read="EXISTS(SELECT 1 FROM alarm_read_receipt rr WHERE rr.alarm_id=a.id AND rr.user_id="+s.access.userId()+")";
    if(readFlag!=null)where.append(" AND "+("unread".equals(readFlag)?"NOT ":"")+read);
    long total=s.db.queryForObject("SELECT count(*)"+FROM+where,Long.class,args.toArray());
    args.add(limit);args.add(offset);
    var rows=s.db.queryForList("SELECT "+COLUMNS+","+read+" AS read_flag"+FROM+where+" ORDER BY a.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?",args.toArray());
    return Map.of("items",rows,"total",total,"limit",limit,"offset",offset);
  }
  Map<String,Object> authorized(long id,String permission,boolean lock) {
    var a=s.one("SELECT "+COLUMNS+FROM+" WHERE a.id=? AND a.deleted_at IS NULL AND a.occurred_at<=now()"+(lock?" FOR UPDATE OF a":""),id);
    s.access.requireStationPermission(s.number(a,"station_id"),permission);return a;
  }
  public Map<String,Object> detail(long id) {
    var a=authorized(id,"alarm.read",false);
    a.put("read_flag",Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM alarm_read_receipt WHERE alarm_id=? AND user_id=?)",Boolean.class,id,s.access.userId())));
    a.put("notes",s.db.queryForList("SELECT n.id,n.body,n.created_at,u.display_name AS author_name FROM alarm_note n JOIN app_user u ON u.id=n.author_id WHERE n.alarm_id=? ORDER BY n.id",id));
    a.put("events",s.db.queryForList("SELECT e.*,u.display_name AS actor_name FROM alarm_action_event e JOIN app_user u ON u.id=e.actor_id WHERE alarm_id=? ORDER BY e.id",id));
    a.put("samples",List.of());a.put("sampleStatus","暂无已关联的告警前后测点采样；未生成模拟曲线");return a;
  }
  @Transactional public Map<String,Object> read(List<Long> ids) {
    if(ids==null||ids.isEmpty()||ids.size()>200||ids.stream().anyMatch(Objects::isNull))AlarmRules.bad("请选择1–200条告警");
    var unique=ids.stream().distinct().sorted().toList();
    var alarms=unique.stream().map(id->authorized(id,"alarm.read",true)).toList();
    for(var a:alarms){long id=s.number(a,"id");int changed=s.db.update("INSERT INTO alarm_read_receipt(alarm_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",id,s.access.userId());
      if(changed>0)s.auditStation("alarm.read",s.number(a,"station_id"),"alarm="+id);}
    return Map.of("ids",unique);
  }
  @Transactional public Map<String,Object> action(long id,String action,long expectedVersion,String note) {
    var a=authorized(id,"alarm.handle",true);long version=s.number(a,"version");
    AlarmRules.action(action,(String)a.get("lifecycle"),version,expectedVersion);
    if(note==null||note.isBlank()||note.length()>4000)AlarmRules.bad("请填写1–4000字处理说明");
    if("acknowledge".equals(action)&&a.get("acknowledged_at")!=null)throw new BusinessException(409,"告警已确认，请刷新");
    switch(action){
      case "acknowledge"->s.db.update("UPDATE alarm SET acknowledged_by=?,acknowledged_at=now(),version=version+1 WHERE id=?",s.access.userId(),id);
      case "close"->s.db.update("UPDATE alarm SET closed_by=?,closed_at=now(),version=version+1 WHERE id=?",s.access.userId(),id);
      case "delete"->s.db.update("UPDATE alarm SET deleted_by=?,deleted_at=now(),version=version+1 WHERE id=?",s.access.userId(),id);
      case "note"->s.db.update("UPDATE alarm SET version=version+1 WHERE id=?",id);
    }
    s.db.update("INSERT INTO alarm_note(alarm_id,author_id,body) VALUES(?,?,?)",id,s.access.userId(),note.trim());
    s.db.update("INSERT INTO alarm_action_event(alarm_id,actor_id,action,note,version) VALUES(?,?,?,?,?)",id,s.access.userId(),action,note.trim(),version+1);
    s.auditStation("alarm."+action,s.number(a,"station_id"),Map.of("alarm",id,"version",version+1,"note",note.trim()));
    return Map.of("id",id,"version",version+1);
  }
}
