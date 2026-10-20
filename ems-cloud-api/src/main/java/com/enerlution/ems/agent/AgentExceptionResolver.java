package com.enerlution.ems.agent;

import cn.dev33.satoken.exception.NotLoginException;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.*;
import org.springframework.web.servlet.*;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;

/** Also covers authentication and multipart failures raised before a controller is selected. */
@Component
public class AgentExceptionResolver implements HandlerExceptionResolver, Ordered {
  private final ObjectMapper json;
  public AgentExceptionResolver(ObjectMapper json) {this.json=json;}
  @Override public int getOrder() {return Ordered.HIGHEST_PRECEDENCE;}
  @Override public ModelAndView resolveException(HttpServletRequest request,HttpServletResponse response,Object handler,Exception error) {
    if(!request.getRequestURI().startsWith(request.getContextPath()+"/api/agent/"))return null;
    if(response.isCommitted())return new ModelAndView();
    int status=error instanceof NoResourceFoundException?404:error instanceof HttpRequestMethodNotSupportedException?405:
        error instanceof MaxUploadSizeExceededException?413:error instanceof MultipartException?400:
        error instanceof NotLoginException?401:error instanceof BusinessException e?e.status():502;
    String message=switch(status) {case 401->"请先登录当前系统";case 403->"当前登录或权限校验失败";case 413->"附件不能超过20MiB";case 400->"请求格式错误";default->"Agent 接口暂时不可用，请稍后重试";};
    try {
      response.reset();response.setStatus(status);response.setHeader("Cache-Control","no-store");response.setContentType("application/json;charset=UTF-8");
      json.writeValue(response.getOutputStream(),Map.of("detail",message));
    } catch(IOException ignored) {}
    return new ModelAndView();
  }
}
