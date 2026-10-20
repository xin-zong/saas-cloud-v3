package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class AgentExceptionResolverTest {
  AgentExceptionResolver resolver=new AgentExceptionResolver(new ObjectMapper());
  @Test void earlyMultipartLimitIsRaw413WithoutProviderDetails() throws Exception {
    var response=new MockHttpServletResponse();
    resolver.resolveException(new MockHttpServletRequest("POST","/api/agent/v1/attachments"),response,null,new MaxUploadSizeExceededException(20L*1024*1024));
    assertEquals(413,response.getStatus());assertTrue(new ObjectMapper().readTree(response.getContentAsByteArray()).has("detail"));
  }
  @Test void earlyAuthenticationIsRaw401() {
    var response=new MockHttpServletResponse();
    resolver.resolveException(new MockHttpServletRequest("GET","/api/agent/v1/health"),response,null,new BusinessException(401,"private auth details"));
    assertEquals(401,response.getStatus());assertFalse(new String(response.getContentAsByteArray()).contains("private"));
  }
  @Test void otherPlatformRoutesKeepTheirOwnHandler() {
    assertNull(resolver.resolveException(new MockHttpServletRequest("GET","/api/stations"),new MockHttpServletResponse(),null,new BusinessException(401,"private")));
  }
}
