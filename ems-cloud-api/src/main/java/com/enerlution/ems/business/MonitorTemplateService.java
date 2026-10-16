package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.sql.Array;
import java.sql.SQLException;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Personal presentation preferences; card data readers independently enforce data permissions. */
@Service
public class MonitorTemplateService {
  private static final Set<String> CARDS = Set.of("站点运营概况", "在线运行容量", "能源供应与构成",
      "建站与接入进度", "设备接入概况", "交付就绪度", "储能充放趋势", "社会与环境效益", "收益概览",
      "当班处置态势", "运行健康", "异常与告警实时监控", "子系统可用性与出力");
  private final DomainSupport s;
  public record Template(UUID id, String name, List<String> cards, boolean pinned, long sortOrder, long version) {}
  public record Templates(List<Template> items, UUID selectedId) {}
  public record TemplateRequest(String name, List<String> cards, Long expectedVersion) {}
  public record PinRequest(Boolean pinned, Long expectedVersion) {}
  public record SelectionRequest(UUID templateId) {}
  private record Owner(long tenant, long user) {}
  public MonitorTemplateService(DomainSupport s) { this.s=s; }

  static String normalizeName(String name) {
    if(name==null) throw new BusinessException(400,"模板名称应为1–50个字符");
    String value=name.strip();
    if(value.isEmpty() || value.codePointCount(0,value.length())>50)
      throw new BusinessException(400,"模板名称应为1–50个字符");
    return value;
  }
  static List<String> normalizeCards(List<String> cards) {
    if(cards==null || cards.isEmpty() || cards.size()>CARDS.size()
        || cards.stream().anyMatch(c->c==null || !CARDS.contains(c))
        || new HashSet<>(cards).size()!=cards.size())
      throw new BusinessException(400,"请选择不重复的有效看板卡片");
    return List.copyOf(cards);
  }
  static long expectedVersion(Long version) {
    if(version==null || version<1) throw new BusinessException(400,"缺少有效版本");
    return version;
  }
  private Owner owner() {
    var ctx=s.access.context();
    return new Owner(ctx.tenantId(),ctx.actorId());
  }
  private <T> T mutate(Owner owner, Supplier<T> action) {
    try {
      return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource())))
          .execute(status->{
            // A transaction lock also serializes creation before a selection row exists.
            s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,
                "monitor-template:"+owner.tenant()+":"+owner.user());
            return action.get();
          });
    } catch(DuplicateKeyException ex) { throw new BusinessException(409,"模板名称已存在"); }
  }
  private Template row(java.sql.ResultSet rs, int index) throws SQLException {
    Array array=rs.getArray("cards");
    try { return new Template(rs.getObject("id",UUID.class),rs.getString("name"),
        List.of((String[])array.getArray()),rs.getBoolean("pinned"),rs.getLong("sort_order"),rs.getLong("version")); }
    finally { array.free(); }
  }
  private Template owned(Owner o,UUID id) {
    var rows=s.db.query("SELECT * FROM monitor_template WHERE tenant_id=? AND user_id=? AND id=?",this::row,o.tenant(),o.user(),id);
    if(rows.isEmpty()) throw new BusinessException(404,"模板不存在");
    return rows.getFirst();
  }
  private Template current(Owner o,UUID id,long version) {
    Template template=owned(o,id);
    if(template.version()!=version) throw new BusinessException(409,"模板已更新，请刷新后重试");
    return template;
  }
  private long nextOrder(Owner o) {
    return s.db.queryForObject("SELECT coalesce(max(sort_order),0)+1 FROM monitor_template WHERE tenant_id=? AND user_id=?",Long.class,o.tenant(),o.user());
  }
  private void audit(String action,UUID id) { s.audit("monitor.template."+action,Map.of("templateId",id==null?"default":id.toString())); }
  public Templates list() {
    Owner o=owner();
    UUID[] selected={null};
    // One statement gives items and selection the same MVCC snapshot, including concurrent deletion.
    var items=s.db.query("SELECT t.*,selection.template_id AS selected_id FROM monitor_template t LEFT JOIN monitor_template_selection selection ON selection.tenant_id=t.tenant_id AND selection.user_id=t.user_id WHERE t.tenant_id=? AND t.user_id=? ORDER BY t.pinned DESC,t.sort_order DESC,t.id",
        (rs,index)->{ selected[0]=rs.getObject("selected_id",UUID.class); return row(rs,index); },o.tenant(),o.user());
    // A selected template must exist by the composite FK, so zero items also means no selection.
    return new Templates(items,selected[0]);
  }
  public Template create(TemplateRequest request) {
    if(request==null) throw new BusinessException(400,"缺少模板内容");
    String name=normalizeName(request.name()); var cards=normalizeCards(request.cards()); Owner o=owner();
    return mutate(o,()->{
      UUID id=UUID.randomUUID();
      s.db.update("INSERT INTO monitor_template(id,tenant_id,user_id,name,cards,sort_order) VALUES(?,?,?,?,?::text[],?)",
          id,o.tenant(),o.user(),name,cards.toArray(String[]::new),nextOrder(o));
      audit("create",id); return owned(o,id);
    });
  }
  public Template update(UUID id,TemplateRequest request) {
    if(request==null) throw new BusinessException(400,"缺少模板内容");
    String name=normalizeName(request.name()); var cards=normalizeCards(request.cards()); long version=expectedVersion(request.expectedVersion()); Owner o=owner();
    return mutate(o,()->{current(o,id,version);
      s.db.update("UPDATE monitor_template SET name=?,cards=?::text[],version=version+1 WHERE id=? AND tenant_id=? AND user_id=? AND version=?",
          name,cards.toArray(String[]::new),id,o.tenant(),o.user(),version);
      audit("update",id); return owned(o,id);
    });
  }
  public Template pin(UUID id,PinRequest request) {
    if(request==null || request.pinned()==null) throw new BusinessException(400,"缺少置顶状态");
    long version=expectedVersion(request.expectedVersion()); Owner o=owner();
    return mutate(o,()->{current(o,id,version);
      s.db.update("UPDATE monitor_template SET pinned=?,sort_order=?,version=version+1 WHERE id=? AND tenant_id=? AND user_id=? AND version=?",
          request.pinned(),nextOrder(o),id,o.tenant(),o.user(),version);
      audit("pin",id); return owned(o,id);
    });
  }
  public void delete(UUID id,Long expectedVersion) {
    long version=expectedVersion(expectedVersion); Owner o=owner();
    mutate(o,()->{current(o,id,version);
      s.db.update("DELETE FROM monitor_template_selection WHERE tenant_id=? AND user_id=? AND template_id=?",o.tenant(),o.user(),id);
      s.db.update("DELETE FROM monitor_template WHERE id=? AND tenant_id=? AND user_id=? AND version=?",id,o.tenant(),o.user(),version);
      audit("delete",id); return null;
    });
  }
  public Templates select(SelectionRequest request) {
    if(request==null) throw new BusinessException(400,"缺少选择内容");
    Owner o=owner();
    return mutate(o,()->{
      if(request.templateId()!=null) owned(o,request.templateId());
      s.db.update("INSERT INTO monitor_template_selection(tenant_id,user_id,template_id) VALUES(?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET template_id=excluded.template_id",o.tenant(),o.user(),request.templateId());
      audit("select",request.templateId()); return list();
    });
  }
}

