package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class StationOperationLogService {
  private final DomainSupport s;
  public StationOperationLogService(DomainSupport s) { this.s=s; }
  public record Page(List<Map<String,Object>> items, int limit, int offset, boolean hasMore) {}
  private void requireRead(long station) {
    s.access.requireStationPermission(station,"asset.read");
    Long tenant=s.db.queryForObject("SELECT tenant_id FROM station WHERE id=?",Long.class,station);
    if(tenant==null) throw new BusinessException(404,"站点不存在");
    s.access.requireTenantPermission(tenant,"audit.read");
  }
  static String term(String value) {
    if (value==null || value.isBlank()) return null;
    if (value.length()>200) throw new BusinessException(400,"筛选内容最多 200 字符");
    return "%"+value.trim().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
  }
  public Page list(long station,String content,String actor,String channel,String ip,Instant from,Instant to,int limit,int offset) {
    requireRead(station); s.limit(limit); s.offset(offset);
    if (from!=null && to!=null && !from.isBefore(to)) throw new BusinessException(400,"结束时间须晚于开始时间");
    StringBuilder where=new StringBuilder(" WHERE l.station_id=? AND a.target_tenant_id=st.tenant_id");
    List<Object> args=new ArrayList<>(); args.add(station);
    // Shared payloads are excluded from both projection and content searches.
    filter(where,args,"(a.action || ' ' || CASE WHEN l.shared_detail THEN '' ELSE a.detail END)",content);
    filter(where,args,"COALESCE(l.actor_name,'')",actor);
    filter(where,args,"COALESCE(l.channel,'')",channel);
    filter(where,args,"COALESCE(l.ip_address,'')",ip);
    if (from!=null) {where.append(" AND a.occurred_at>=?");args.add(Timestamp.from(from));}
    if (to!=null) {where.append(" AND a.occurred_at<?");args.add(Timestamp.from(to));}
    args.add(limit+1);args.add(offset);
    var rows=s.db.queryForList("SELECT a.id::text AS id,l.station_id::text AS \"stationId\",a.action,a.occurred_at AS \"occurredAt\",l.actor_name AS actor,l.channel,l.ip_address AS ip,NULL::text AS \"actorGroup\",NULL::text AS location,l.shared_detail AS \"sharedDetail\",CASE WHEN l.shared_detail THEN NULL ELSE a.detail END AS content FROM station_audit_event l JOIN audit_event a ON a.id=l.event_id JOIN station st ON st.id=l.station_id"+where+" ORDER BY a.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?",args.toArray());
    requireRead(station);
    boolean more=rows.size()>limit;
    return new Page(more?List.copyOf(rows.subList(0,limit)):rows,limit,offset,more);
  }
  private static void filter(StringBuilder where,List<Object> args,String column,String value) {
    String pattern=term(value);
    if(pattern!=null) {where.append(" AND ").append(column).append(" ILIKE ? ESCAPE '\\'");args.add(pattern);}
  }
}
