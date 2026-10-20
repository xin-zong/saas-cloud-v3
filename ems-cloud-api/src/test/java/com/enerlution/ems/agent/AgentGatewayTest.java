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

  AgentGateway gateway() {
    when(access.context()).thenReturn(new TenantContext(8, 2, "enterprise", false));
    when(access.client()).thenReturn("web");
    when(access.stationIds("asset.read")).thenReturn(List.of(11L, 12L));
    return new AgentGateway(access, owners, json);
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
}
