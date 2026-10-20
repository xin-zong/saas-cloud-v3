package com.enerlution.ems.agent;

import com.enerlution.ems.auth.AccessControl;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class AgentGateway {
  record Actor(long tenant, long user, String client, List<String> allowed) {
    String identity() { return tenant + ":" + user; }
    String lockKey() { return identity() + ":" + client; }
  }
  private final AccessControl access;
  private final AgentOwnership owners;
  private final ObjectMapper json;
  private final AgentSites sites;
  public AgentGateway(AccessControl access, AgentOwnership owners, ObjectMapper json, AgentSites sites) {
    this.access=access; this.owners=owners; this.json=json; this.sites=sites;
  }
  Actor actor() {
    var context=access.context();
    var allowed=access.stationIds("asset.read").stream().map(String::valueOf).distinct().toList();
    if(allowed.isEmpty()) throw new AgentFailure(403,"当前账户没有可供助手访问的场站");
    return new Actor(context.tenantId(), context.actorId(), access.client(), allowed);
  }
  static String id(JsonNode value) {
    if(value==null || !value.isTextual() || !value.asText().matches("[a-zA-Z0-9_-]{1,160}"))
      throw new AgentFailure(400,"标识格式错误");
    return value.asText();
  }
  ObjectNode chat(JsonNode input, Actor actor) {
    if(input==null || !input.isObject() || !input.path("message").isTextual()
        || input.path("message").asText().isBlank() || input.path("message").asText().length()>24000)
      throw new AgentFailure(400,"请输入有效消息");
    List<String> scope=new ArrayList<>();
    var requested=input.get("site_scope");
    if(requested!=null) {
      if(!requested.isArray() || requested.size()>10000) throw new AgentFailure(400,"场站范围格式错误");
      for(var value:requested) {
        if(!(value.isTextual() || value.isIntegralNumber()) || !value.asText().matches("[0-9]{1,19}")) throw new AgentFailure(400,"场站范围格式错误");
        scope.add(value.asText());
      }
    }
    scope=scope.isEmpty()?actor.allowed():scope.stream().distinct().toList();
    if(!actor.allowed().containsAll(scope)) throw new AgentFailure(403,"无权访问所选场站");
    var conversation=input.get("conversation_id");
    if(conversation!=null && !conversation.isNull()) owners.require("conversation",id(conversation),actor,scope);
    var attachments=input.get("attachment_ids");
    if(attachments!=null && (!attachments.isArray() || attachments.size()>20)) throw new AgentFailure(400,"附件格式错误");
    List<String> ids=new ArrayList<>();
    if(attachments!=null) for(var value:attachments) { var id=id(value); owners.require("attachment",id,actor,scope); ids.add(id); }
    var range=input.get("time_range");
    if(range!=null && !range.isNull() && (!range.isObject() || range.toString().length()>2048)) throw new AgentFailure(400,"时间范围格式错误");
    ObjectNode body=json.createObjectNode();
    body.put("message",input.path("message").asText());
    body.set("conversation_id",conversation==null?json.nullNode():conversation);
    body.put("agent_mode","thinking".equals(input.path("agent_mode").asText())?"thinking":"simple");
    body.put("dry_run",true); body.set("site_scope",json.valueToTree(scope));
    body.set("time_range",range==null?json.nullNode():range);
    body.set("attachment_ids",json.valueToTree(ids));
    body.put("response_language","en".equals(input.path("response_language").asText())?"en":"zh-CN");
    var context=body.putObject("user_context"); context.put("user_id",actor.identity());
    context.putArray("permissions").add("asset.read"); context.put("read_only",true);
    return body;
  }
  ObjectNode upstreamChat(ObjectNode local, Actor actor) {
    List<String> scope=new ArrayList<>();local.path("site_scope").forEach(id->scope.add(id.asText()));
    var directory=sites.resolve(scope);
    var result=local.deepCopy();var external=result.putArray("site_scope");
    var context=result.putObject("user_context");
    context.put("user_id",actor.identity());context.put("tenant_id",actor.tenant());context.put("read_only",true);
    var selected=context.putArray("selected_sites");
    for(var site:directory) {
      String code=site.get("code").toString();external.add(code);
      selected.addObject().put("site_id",code).put("site_name",String.valueOf(site.get("name")));
    }
    // A flat upstream permission list must be valid for every selected station.
    var byStation=access.stationPermissions();Set<String> readPermissions=null;
    for(String id:scope) {
      var permissions=new TreeSet<>(byStation.getOrDefault(Long.parseLong(id),Set.of()));
      permissions.removeIf(code->!(code.endsWith(".read") || code.endsWith(".query") || code.endsWith(".export")));
      if(readPermissions==null)readPermissions=permissions;else readPermissions.retainAll(permissions);
    }
    var permissions=context.putArray("permissions");
    if(readPermissions!=null)readPermissions.forEach(permissions::add);
    return result;
  }
  String authorizationStamp(Actor expected,List<String> scope) {
    var current=actor();
    if(current.tenant()!=expected.tenant() || current.user()!=expected.user()
        || !current.client().equals(expected.client()) || !current.allowed().containsAll(scope))
      throw new AgentFailure(403,"权限已变化，请刷新后重试");
    var currentPermissions=access.stationPermissions();var stamp=new TreeMap<String,Set<String>>();
    for(String id:scope)stamp.put(id,new TreeSet<>(currentPermissions.getOrDefault(Long.parseLong(id),Set.of())));
    return stamp.toString();
  }
  void requireUnchanged(Actor actor,List<String> scope,String stamp) {
    if(!authorizationStamp(actor,scope).equals(stamp))throw new AgentFailure(403,"权限已变化，请刷新后重试");
  }
}
