package com.enerlution.ems.agent;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Resource ownership and its normalized local station scope. No network calls in transactions. */
@Repository
public class AgentOwnership {
  private final JdbcTemplate db;
  public AgentOwnership(JdbcTemplate db) { this.db=db; }
  private Map<String,Object> owner(String kind,String id) {
    var rows=db.queryForList("select tenant_id,user_id,client from agent_resource_owner where resource_kind=? and resource_id=?",kind,id);
    if(rows.isEmpty()) throw new AgentFailure(403,"会话或附件不可用，请重新创建");
    return rows.getFirst();
  }
  private Set<String> stations(String kind,String id) {
    return new HashSet<>(db.queryForList("select station_id from agent_resource_station where resource_kind=? and resource_id=? order by station_id",Long.class,kind,id).stream().map(String::valueOf).toList());
  }
  private boolean sameActor(Map<String,Object> row,AgentGateway.Actor actor) {
    return ((Number)row.get("tenant_id")).longValue()==actor.tenant()
        && ((Number)row.get("user_id")).longValue()==actor.user() && actor.client().equals(row.get("client"));
  }
  void require(String kind,String id,AgentGateway.Actor actor,List<String> scope) {
    var row=owner(kind,id);var old=stations(kind,id);
    if(!sameActor(row,actor) || old.isEmpty() || !actor.allowed().containsAll(old)
        || (kind.equals("conversation") && !old.equals(new HashSet<>(scope))))
      throw new AgentFailure(403,"无权继续访问会话或附件，请重新创建");
  }
  @Transactional
  public void remember(String kind,String id,AgentGateway.Actor actor,List<String> scope) {
    if(id==null || !id.matches("[a-zA-Z0-9_-]{1,160}")) throw new AgentFailure(502,"Agent 返回格式错误");
    int count=db.update("insert into agent_resource_owner(resource_kind,resource_id,tenant_id,user_id,client) values(?,?,?,?,?) on conflict(resource_kind,resource_id) do nothing",kind,id,actor.tenant(),actor.user(),actor.client());
    if(count==1) {
      for(String station:new TreeSet<>(scope)) db.update("insert into agent_resource_station(resource_kind,resource_id,station_id) values(?,?,?)",kind,id,Long.parseLong(station));
    } else if(!sameActor(owner(kind,id),actor) || !stations(kind,id).equals(new HashSet<>(scope)))
      throw new AgentFailure(502,"Agent 会话标识冲突，请新建会话");
  }
  void remove(String id,AgentGateway.Actor actor) {
    db.update("delete from agent_resource_owner where resource_kind='attachment' and resource_id=? and tenant_id=? and user_id=? and client=?",id,actor.tenant(),actor.user(),actor.client());
  }
}
