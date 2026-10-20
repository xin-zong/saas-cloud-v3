package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;

class AgentControllerTest {
  ObjectMapper json=new ObjectMapper();
  AccessControl access=mock(AccessControl.class);
  AgentOwnership owners=mock(AgentOwnership.class);
  AgentUpstream upstream=mock(AgentUpstream.class);
  AgentController controller;
  @BeforeEach void setup() {
    when(access.context()).thenReturn(new TenantContext(8,2,"enterprise",false));
    when(access.client()).thenReturn("web");
    when(access.stationIds("asset.read")).thenReturn(List.of(11L));
    controller=new AgentController(new AgentGateway(access,owners,json),owners,upstream,json);
  }
  @Test void streamsEachEventAndPersistsBeforeForwarding() throws Exception {
    var response=new MockHttpServletResponse();
    String first="{\"type\":\"meta\",\"conversation_id\":\"c1\"}\n";
    String second="{\"type\":\"delta\",\"text\":\"你好\"}\n";
    byte[] bytes=(first+second).getBytes(StandardCharsets.UTF_8);
    var input=new ByteArrayInputStream(bytes) {
      int calls;
      @Override public synchronized int read(byte[] b,int off,int len) {
        if(calls++==1) {assertTrue(response.isCommitted());assertEquals(first,new String(response.getContentAsByteArray(),StandardCharsets.UTF_8));}
        return super.read(b,off,Math.min(len,first.getBytes(StandardCharsets.UTF_8).length));
      }
    };
    when(upstream.call(eq("POST"),eq("/v1/chat/stream"),any(),eq("application/json"),eq(true))).thenReturn(new AgentUpstream.Reply(input,30));
    var request=new MockHttpServletRequest("POST","/api/agent/v1/chat/stream");
    request.setContent("{\"message\":\"hello\"}".getBytes(StandardCharsets.UTF_8));
    controller.relay(request,response);
    assertEquals(first+second,response.getContentAsString(StandardCharsets.UTF_8));
    verify(owners).remember(eq("conversation"),eq("c1"),any(),eq(List.of("11")));
  }
  @Test void unavailableUpstreamIsRawSanitized503() throws Exception {
    when(upstream.call(anyString(),anyString(),any(),any(),anyBoolean())).thenThrow(new AgentFailure(503,"原 Agent 接口尚未配置"));
    var response=new MockHttpServletResponse();
    controller.relay(new MockHttpServletRequest("GET","/api/agent/v1/health"),response);
    assertEquals(503,response.getStatus());
    assertTrue(json.readTree(response.getContentAsByteArray()).has("detail"));
    assertFalse(json.readTree(response.getContentAsByteArray()).has("code"));
  }
  @Test void exceptionDetailsNeverReachCaller() throws Exception {
    when(upstream.call(anyString(),anyString(),any(),any(),anyBoolean())).thenThrow(new IOException("private-key-and-provider-error"));
    var response=new MockHttpServletResponse();
    controller.relay(new MockHttpServletRequest("GET","/api/agent/v1/tools"),response);
    assertEquals(502,response.getStatus());assertFalse(response.getContentAsString().contains("private-key"));
  }
  @Test void reconstructsResolvedMultipartAndPersistsOwnership() throws Exception {
    var request=new MockMultipartHttpServletRequest();request.setMethod("POST");request.setRequestURI("/api/agent/v1/attachments");
    request.addFile(new MockMultipartFile("file","report.txt","text/plain","file-data".getBytes(StandardCharsets.UTF_8)));
    when(upstream.call(eq("POST"),eq("/v1/attachments"),any(),startsWith("multipart/form-data; boundary="),eq(false)))
      .thenAnswer(inv->{var body=new String((byte[])inv.getArgument(2),StandardCharsets.UTF_8);assertTrue(body.contains("name=\"file\"; filename=\"report.txt\""));assertTrue(body.contains("file-data"));return new AgentUpstream.Reply(new ByteArrayInputStream("{\"attachment_id\":\"a1\"}".getBytes()),30);});
    var response=new MockHttpServletResponse();controller.relay(request,response);
    assertEquals(200,response.getStatus());verify(owners).remember(eq("attachment"),eq("a1"),any(),eq(List.of("11")));
  }
  @Test void attachmentAccessChecksOwnershipBeforeNetwork() throws Exception {
    doThrow(new AgentFailure(403,"denied")).when(owners).require(eq("attachment"),eq("other"),any(),any());
    var response=new MockHttpServletResponse();controller.relay(new MockHttpServletRequest("GET","/api/agent/v1/attachments/other"),response);
    assertEquals(403,response.getStatus());verifyNoInteractions(upstream);
  }
  @Test void boundedBodyRejectsOverflow() {
    assertEquals(413,assertThrows(AgentFailure.class,()->AgentController.bounded(new ByteArrayInputStream(new byte[5]),4)).status);
  }
  @Test void upstreamStreamErrorsAreSanitized() throws Exception {
    when(upstream.call(anyString(),anyString(),any(),any(),eq(true))).thenReturn(new AgentUpstream.Reply(new ByteArrayInputStream("{\"type\":\"error\",\"message\":\"private-provider-error\"}\n".getBytes()),30));
    var request=new MockHttpServletRequest("POST","/api/agent/v1/chat/stream");request.setContent("{\"message\":\"hello\"}".getBytes());
    var response=new MockHttpServletResponse();controller.relay(request,response);
    assertEquals(502,response.getStatus());assertFalse(new String(response.getContentAsByteArray()).contains("private-provider"));
  }
  @Test void oversizedFileIsRejectedBeforeUpstream() throws Exception {
    var request=new MockMultipartHttpServletRequest();request.setMethod("POST");request.setRequestURI("/api/agent/v1/attachments");
    request.addFile(new MockMultipartFile("file","large.txt","text/plain",new byte[]{1}) {@Override public long getSize() {return 20L*1024*1024+1;}});
    var response=new MockHttpServletResponse();controller.relay(request,response);
    assertEquals(413,response.getStatus());verifyNoInteractions(upstream);
  }
  @Test void clientWriteFailureClosesUpstream() throws Exception {
    var input=spy(new ByteArrayInputStream("{\"type\":\"delta\",\"text\":\"hello\"}\n".getBytes()));
    when(upstream.call(anyString(),anyString(),any(),any(),eq(true))).thenReturn(new AgentUpstream.Reply(input,30));
    var response=new MockHttpServletResponse() {
      @Override public jakarta.servlet.ServletOutputStream getOutputStream() {
        return new jakarta.servlet.ServletOutputStream() {
          public boolean isReady() {return true;}
          public void setWriteListener(jakarta.servlet.WriteListener listener) {}
          public void write(int b) throws IOException {throw new IOException("client gone");}
        };
      }
    };
    var request=new MockHttpServletRequest("POST","/api/agent/v1/chat/stream");request.setContent("{\"message\":\"hello\"}".getBytes());
    assertThrows(IOException.class,()->controller.relay(request,response));verify(input).close();
  }
}
