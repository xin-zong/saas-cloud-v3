package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class MonitorLayoutService {
 private final DomainSupport s;private final ObjectMapper json;
 public MonitorLayoutService(DomainSupport s,ObjectMapper json){this.s=s;this.json=json;}
 public record Widget(String card,int x,int y,int w,int h){}
 public record Layout(List<Widget> widgets,long version){}
 public record Request(List<Widget> widgets,Long expectedVersion){}
 static List<Widget> validate(List<Widget> widgets){
  if(widgets==null||widgets.isEmpty()||widgets.size()>13||widgets.stream().anyMatch(Objects::isNull))throw new BusinessException(400,"请选择有效布局");
  MonitorTemplateService.normalizeCards(widgets.stream().map(Widget::card).toList());
  for(var a:widgets){if(a.x()<0||a.y()<0||a.y()>100||a.w()<1||a.w()>12||a.h()<1||a.h()>12||a.x()+a.w()>12)throw new BusinessException(400,"布局超出12列范围");
   for(var b:widgets)if(a!=b&&a.x()<b.x()+b.w()&&a.x()+a.w()>b.x()&&a.y()<b.y()+b.h()&&a.y()+a.h()>b.y())throw new BusinessException(400,"布局模块不能重叠");
  }return List.copyOf(widgets);
 }
 private String scope(UUID template){var c=s.access.context();if(template!=null&& !Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM monitor_template WHERE id=? AND tenant_id=? AND user_id=?)",Boolean.class,template,c.tenantId(),c.actorId())))throw new BusinessException(404,"模板不存在");return template==null?"default":template.toString();}
 public Layout get(UUID template){String scope=scope(template);var c=s.access.context();var rows=s.db.queryForList("SELECT widgets::text AS widgets,version FROM monitor_layout WHERE tenant_id=? AND user_id=? AND scope=?",c.tenantId(),c.actorId(),scope);if(rows.isEmpty())return new Layout(List.of(),0);
  try{return new Layout(Arrays.asList(json.readValue(rows.getFirst().get("widgets").toString(),Widget[].class)),((Number)rows.getFirst().get("version")).longValue());}catch(Exception ex){throw new IllegalStateException("Invalid stored monitor layout",ex);}}
 @Transactional public Layout save(UUID template,Request request){
  if(request==null||request.expectedVersion()==null||request.expectedVersion()<0)throw new BusinessException(400,"缺少布局版本");var widgets=validate(request.widgets());String scope=scope(template);var c=s.access.context();
  s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"monitor-layout:"+c.tenantId()+":"+c.actorId()+":"+scope);
  // Serialize with template deletion and protect the persisted scope by the composite FK.
  if(template!=null)s.one("SELECT id FROM monitor_template WHERE id=? AND tenant_id=? AND user_id=? FOR UPDATE",template,c.tenantId(),c.actorId());
  var current=get(template);if(current.version()!=request.expectedVersion())throw new BusinessException(409,"布局已更新，请刷新后重试");
  try{s.db.update("INSERT INTO monitor_layout(tenant_id,user_id,scope,template_id,widgets,version) VALUES(?,?,?,?,?::jsonb,1) ON CONFLICT(tenant_id,user_id,scope) DO UPDATE SET widgets=excluded.widgets,version=monitor_layout.version+1",c.tenantId(),c.actorId(),scope,template,json.writeValueAsString(widgets));}catch(com.fasterxml.jackson.core.JsonProcessingException ex){throw new IllegalStateException(ex);}
  s.audit("monitor.layout.update",Map.of("scope",scope,"widgetCount",widgets.size()));return get(template);
 }
}
