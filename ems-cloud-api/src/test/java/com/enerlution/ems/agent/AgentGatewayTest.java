package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class AgentGatewayTest {
  final ObjectMapper json = new ObjectMapper();
  final AccessControl access = mock(AccessControl.class);
  final AgentOwnership owners = mock(AgentOwnership.class);
  final AgentSites sites = mock(AgentSites.class);

  AgentGateway gateway() {
    when(access.context()).thenReturn(new TenantContext(8, 2, "enterprise", false));
    when(access.client()).thenReturn("web");
    when(access.stationIds("asset.read")).thenReturn(List.of(11L, 12L));
    when(sites.resolve(List.of("11"))).thenReturn(List.of(java.util.Map.of("id",11L,"code","REAL-11","name","真实站点")));
    when(sites.resolve(List.of("11","12"))).thenReturn(List.of(java.util.Map.of("id",11L,"code","REAL-11","name","真实站点"),java.util.Map.of("id",12L,"code","REAL-12","name","站点二")));
    when(access.stationPermissions()).thenReturn(java.util.Map.of(11L,java.util.Set.of("asset.read","telemetry.read","strategy.manage"),12L,java.util.Set.of("asset.read")));
    return new AgentGateway(access, owners, json, sites);
  }

  @Test void sanitizesCallerAndForcesReadOnly() throws Exception {
    var gateway = gateway();
    var actor = gateway.actor();
    var result = gateway.chat(json.readTree("{\"message\":\"hello\",\"dry_run\":false,\"user_context\":{\"user_id\":\"admin\"},\"site_scope\":[11]}"), actor);
    assertTrue(result.path("dry_run").asBoolean());
    assertEquals("2:8", result.path("user_context").path("user_id").asText());
    assertTrue(result.path("user_context").path("read_only").asBoolean());
    assertEquals("11", result.path("site_scope").get(0).asText());
  }

  @Test void rejectsUnauthorizedScopeAndMalformedAttachments() throws Exception {
    var gateway = gateway();
    assertEquals(403, assertThrows(AgentFailure.class, () -> gateway.chat(json.readTree("{\"message\":\"hello\",\"site_scope\":[13]}"), gateway.actor())).status);
    assertEquals(400, assertThrows(AgentFailure.class, () -> gateway.chat(json.readTree("{\"message\":\"hello\",\"attachment_ids\":\"x\"}"), gateway.actor())).status);
  }

  @Test void checksExistingConversationAgainstCurrentScope() throws Exception {
    var gateway = gateway();
    gateway.chat(json.readTree("{\"message\":\"hello\",\"conversation_id\":\"old\",\"site_scope\":[11]}"), gateway.actor());
    verify(owners).require("conversation", "old", new AgentGateway.Actor(2, 8, "web", List.of("11", "12")), List.of("11"));
  }
  @Test void mapsOnlyAuthorizedLocalScopeAndUsesServerDirectoryAndReadPermissions() throws Exception {
    var gateway=gateway();var actor=gateway.actor();
    var local=gateway.chat(json.readTree("{\"message\":\"hello\",\"site_scope\":[11],\"user_context\":{\"permissions\":[\"admin\"],\"selected_sites\":[{\"site_id\":\"HFHYZHEMSV3\"}]}}"),actor);
    var remote=gateway.upstreamChat(local,actor);
    assertEquals("11",local.path("site_scope").get(0).asText());
    assertEquals("REAL-11",remote.path("site_scope").get(0).asText());
    assertEquals("真实站点",remote.path("user_context").path("selected_sites").get(0).path("site_name").asText());
    assertEquals(2,remote.path("user_context").path("tenant_id").asLong());
    var permissions=remote.path("user_context").path("permissions").toString();
    assertTrue(permissions.contains("telemetry.read"));assertFalse(permissions.contains("admin"));assertFalse(permissions.contains("strategy.manage"));
    var both=gateway.upstreamChat(gateway.chat(json.readTree("{\"message\":\"hello\"}"),actor),actor);
    assertEquals("[\"asset.read\"]",both.path("user_context").path("permissions").toString());
  }
  @Test void aPermissionRevokedDuringAStreamInvalidatesTheSnapshot() {
    var gateway=gateway();var actor=gateway.actor();var scope=List.of("11");
    String stamp=gateway.authorizationStamp(actor,scope);
    assertDoesNotThrow(()->gateway.requireUnchanged(actor,scope,stamp));
    when(access.stationPermissions()).thenReturn(java.util.Map.of(11L,java.util.Set.of("asset.read")));
    assertEquals(403,assertThrows(AgentFailure.class,()->gateway.requireUnchanged(actor,scope,stamp)).status);
  }
}
