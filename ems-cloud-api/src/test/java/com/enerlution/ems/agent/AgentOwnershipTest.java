package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AgentOwnershipTest {
  JdbcTemplate db=mock(JdbcTemplate.class);
  AgentOwnership owners=new AgentOwnership(db);
  AgentGateway.Actor actor=new AgentGateway.Actor(2,8,"web",List.of("11","12"));
  void stored(long tenant,long user,String client,String scope) {
    when(db.queryForList(anyString(),eq("conversation"),eq("c1"))).thenReturn(List.of(Map.of("tenant_id",tenant,"user_id",user,"client",client)));
    when(db.queryForList(anyString(),eq(Long.class),eq("conversation"),eq("c1"))).thenReturn(Arrays.stream(scope.split(",")).map(Long::valueOf).toList());
  }
  @Test void rejectsOtherOwnersAndClient() {
    stored(3,8,"web","11");assertEquals(403,assertThrows(AgentFailure.class,()->owners.require("conversation","c1",actor,List.of("11"))).status);
    stored(2,9,"web","11");assertThrows(AgentFailure.class,()->owners.require("conversation","c1",actor,List.of("11")));
    stored(2,8,"app","11");assertThrows(AgentFailure.class,()->owners.require("conversation","c1",actor,List.of("11")));
  }
  @Test void revokedOrChangedConversationScopeCannotContinue() {
    stored(2,8,"web","11,12");
    assertThrows(AgentFailure.class,()->owners.require("conversation","c1",new AgentGateway.Actor(2,8,"web",List.of("11")),List.of("11","12")));
    assertThrows(AgentFailure.class,()->owners.require("conversation","c1",actor,List.of("11")));
    assertDoesNotThrow(()->owners.require("conversation","c1",actor,List.of("12","11")));
  }
  @Test void attachmentCanBeUsedInSelectedSubsetButNotAfterSnapshotRevocation() {
    when(db.queryForList(anyString(),eq("attachment"),eq("a1"))).thenReturn(List.of(Map.of("tenant_id",2L,"user_id",8L,"client","web")));
    when(db.queryForList(anyString(),eq(Long.class),eq("attachment"),eq("a1"))).thenReturn(List.of(11L,12L));
    assertDoesNotThrow(()->owners.require("attachment","a1",actor,List.of("11")));
    var revoked=new AgentGateway.Actor(2,8,"web",List.of("11"));
    assertEquals(403,assertThrows(AgentFailure.class,()->owners.require("attachment","a1",revoked,List.of("11"))).status);
    var otherClient=new AgentGateway.Actor(2,8,"app",List.of("11","12"));
    assertEquals(403,assertThrows(AgentFailure.class,()->owners.require("attachment","a1",otherClient,List.of("11"))).status);
  }
  @Test void unknownConversationIsNeverAdopted() {
    when(db.queryForList(anyString(),eq("conversation"),eq("c1"))).thenReturn(List.of());
    assertEquals(403,assertThrows(AgentFailure.class,()->owners.require("conversation","c1",actor,List.of("11"))).status);
  }
  @Test void identifierCollisionFailsClosed() {
    stored(3,8,"web","11");
    when(db.update(anyString(),any(Object[].class))).thenReturn(0);
    assertEquals(502,assertThrows(AgentFailure.class,()->owners.remember("conversation","c1",actor,List.of("11"))).status);
  }
}
