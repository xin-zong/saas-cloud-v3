package com.enerlution.ems.agent;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Short autocommit statements only: upstream calls never retain a database transaction. */
@Repository
public class AgentOwnership {
  private final JdbcTemplate db;
  public AgentOwnership(JdbcTemplate db) { this.db=db; }
  void require(String kind,String id,AgentGateway.Actor actor,List<String> scope) {
    var rows=db.queryForList("select tenant_id,user_id,client,station_scope from agent_resource_owner where resource_kind=? and resource_id=?",kind,id);
    if(rows.isEmpty()) throw new AgentFailure(403,"会话或附件不可用，请重新创建");
    var row=rows.getFirst();
    List<String> old=List.of(row.get("station_scope").toString().split(","));
    // Uploads capture the actor's full scope, independently of a later chat's selection.
    // Both resource kinds fail after snapshot revocation; only conversation context must
    // retain its exact selected scope to prevent old messages broadening a narrowed chat.
    if(((Number)row.get("tenant_id")).longValue()!=actor.tenant() || ((Number)row.get("user_id")).longValue()!=actor.user()
       || !actor.client().equals(row.get("client")) || !actor.allowed().containsAll(old)
       || (kind.equals("conversation") && !new HashSet<>(old).equals(new HashSet<>(scope))))
      throw new AgentFailure(403,"无权继续访问会话或附件，请重新创建");
  }
  void remember(String kind,String id,AgentGateway.Actor actor,List<String> scope) {
    if(id==null || !id.matches("[a-zA-Z0-9_-]{1,160}")) throw new AgentFailure(502,"Agent 返回格式错误");
    // Never overwrite on an upstream identifier collision, including a collision across tenants.
    int count=db.update("insert into agent_resource_owner(resource_kind,resource_id,tenant_id,user_id,client,station_scope) values(?,?,?,?,?,?) on conflict(resource_kind,resource_id) do update set station_scope=excluded.station_scope,updated_at=now() where agent_resource_owner.tenant_id=excluded.tenant_id and agent_resource_owner.user_id=excluded.user_id and agent_resource_owner.client=excluded.client and agent_resource_owner.station_scope=excluded.station_scope",
        kind,id,actor.tenant(),actor.user(),actor.client(),String.join(",",new TreeSet<>(scope)));
    if(count!=1) throw new AgentFailure(502,"Agent 会话标识冲突，请新建会话");
  }
  void remove(String id,AgentGateway.Actor actor) {
    db.update("delete from agent_resource_owner where resource_kind='attachment' and resource_id=? and tenant_id=? and user_id=? and client=?",id,actor.tenant(),actor.user(),actor.client());
  }
}
