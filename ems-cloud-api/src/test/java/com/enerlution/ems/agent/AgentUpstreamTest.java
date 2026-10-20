package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.io.*;
import java.net.http.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class AgentUpstreamTest {
  @Test void deadlineClosesAnIdleResponseBody() throws Exception {
    var closed=new java.util.concurrent.CountDownLatch(1);
    var input=new ByteArrayInputStream(new byte[0]) {@Override public void close() {closed.countDown();}};
    try(var reply=new AgentUpstream.Reply(input,1)) {
      assertTrue(closed.await(3,java.util.concurrent.TimeUnit.SECONDS));
    }
  }
  @Test void forwardsOnlyServerKeyAndApprovedPath() throws Exception {
    var client=mock(HttpClient.class);
    @SuppressWarnings("unchecked") HttpResponse<InputStream> response=mock(HttpResponse.class);
    when(response.statusCode()).thenReturn(200);when(response.body()).thenReturn(new ByteArrayInputStream("{}".getBytes()));
    when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
    var service=new AgentUpstream(client,"http://example.test:18080","server-key");
    try(var result=service.call("GET","/v1/health",null,null,false)) {assertEquals("{}",new String(result.body.readAllBytes()));}
    var request=ArgumentCaptor.forClass(HttpRequest.class);verify(client).send(request.capture(),any(HttpResponse.BodyHandler.class));
    assertEquals("server-key",request.getValue().headers().firstValue("X-API-Key").orElseThrow());
    assertTrue(request.getValue().headers().firstValue("Authorization").isEmpty());
    assertEquals("/v1/health",request.getValue().uri().getPath());
    assertEquals(404,assertThrows(AgentFailure.class,()->service.call("GET","/v1/../../admin",null,null,false)).status);
  }
  @Test void emptyConfigurationMakesNoNetworkRequest() {
    var client=mock(HttpClient.class);var service=new AgentUpstream(client,"http://example.test","");
    assertEquals(503,assertThrows(AgentFailure.class,()->service.call("GET","/v1/health",null,null,false)).status);
    verifyNoInteractions(client);
  }
  @Test void providerFailureIsSanitizedAndBodyClosed() throws Exception {
    var client=mock(HttpClient.class);var body=mock(InputStream.class);
    @SuppressWarnings("unchecked") HttpResponse<InputStream> response=mock(HttpResponse.class);
    when(response.statusCode()).thenReturn(401);when(response.body()).thenReturn(body);
    when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
    var service=new AgentUpstream(client,"http://example.test","secret");
    assertEquals(502,assertThrows(AgentFailure.class,()->service.call("GET","/v1/tools",null,null,false)).status);
    verify(body).close();verify(body,never()).readAllBytes();
  }
}
