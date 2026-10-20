package com.enerlution.ems.agent;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The database, never a caller-supplied label, defines external site identities. */
@Repository
public class AgentSites {
  private final JdbcTemplate db;
  public AgentSites(JdbcTemplate db) {this.db=db;}
  List<Map<String,Object>> resolve(List<String> localIds) {
    List<Map<String,Object>> result=new ArrayList<>();
    for(String id:localIds) {
      var rows=db.queryForList("select id,code,name from station where id=?",Long.parseLong(id));
      if(rows.size()!=1 || rows.getFirst().get("code")==null || rows.getFirst().get("code").toString().isBlank()) throw new AgentFailure(409,"场站目录已更新，请刷新后重试");
      result.add(rows.getFirst());
    }
    return result;
  }
}
