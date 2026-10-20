package com.enerlution.ems.agent;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.*;

/** Raw Agent wire format; never wraps responses in the platform ApiResponse envelope. */
@RestController
@RequestMapping("/api/agent")
public class AgentController {
  private final AgentGateway gateway;
  private final AgentOwnership owners;
  private final AgentUpstream upstream;
  private final ObjectMapper json;
  private final Set<String> busy=ConcurrentHashMap.newKeySet();
  public AgentController(AgentGateway gateway,AgentOwnership owners,AgentUpstream upstream,ObjectMapper json) {
    this.gateway=gateway;this.owners=owners;this.upstream=upstream;this.json=json;
  }
  @RequestMapping(value={"/v1/health","/v1/rag/health","/v1/tools","/v1/chat","/v1/chat/stream","/v1/attachments","/v1/attachments/{id}"})
  public void relay(HttpServletRequest request,HttpServletResponse response) throws IOException {
    String lock=null;
    try {
      var actor=gateway.actor();
      String path=request.getRequestURI().substring(request.getContextPath().length()+"/api/agent".length());
      String method=request.getMethod();
      boolean chat=method.equals("POST") && (path.equals("/v1/chat") || path.equals("/v1/chat/stream"));
      boolean stream=chat && path.endsWith("/stream");
      boolean upload=method.equals("POST") && path.equals("/v1/attachments");
      boolean attachment=path.matches("/v1/attachments/[a-zA-Z0-9_-]{1,160}") && Set.of("GET","DELETE").contains(method);
      boolean read=method.equals("GET") && Set.of("/v1/health","/v1/rag/health","/v1/tools").contains(path);
      if(!chat && !upload && !attachment && !read) throw new AgentFailure(404,"接口不存在");
      byte[] body=null;String contentType=null;List<String> scope=actor.allowed();
      if(chat) {
        JsonNode input;
        try {input=json.readTree(bounded(request.getInputStream(),128*1024));}
        catch(AgentFailure e) {throw e;} catch(IOException e) {throw new AgentFailure(400,"请求格式错误");}
        var payload=gateway.chat(input,actor);
        scope=new ArrayList<>();for(var id:payload.path("site_scope"))scope.add(id.asText());
        body=json.writeValueAsBytes(gateway.upstreamChat(payload,actor));contentType="application/json";
        if(!busy.add(actor.lockKey())) throw new AgentFailure(429,"已有消息正在处理");
        lock=actor.lockKey();
      } else if(upload) {
        if(!(request instanceof MultipartHttpServletRequest multipart)) throw new AgentFailure(400,"附件格式错误");
        if(multipart.getMultiFileMap().size()!=1 || multipart.getFiles("file").size()!=1 || !multipart.getParameterMap().isEmpty()) throw new AgentFailure(400,"仅允许上传一个文件");
        var file=multipart.getFile("file");
        if(file==null || file.isEmpty()) throw new AgentFailure(400,"请选择附件");
        if(file.getSize()>20L*1024*1024) throw new AgentFailure(413,"附件不能超过20MiB");
        String boundary="emsagent"+UUID.randomUUID().toString().replace("-","");
        body=multipart(file,boundary);contentType="multipart/form-data; boundary="+boundary;
      } else if(attachment) owners.require("attachment",path.substring("/v1/attachments/".length()),actor,scope);
      String authorization=gateway.authorizationStamp(actor,scope);
      try(var reply=upstream.call(method,path,body,contentType,stream)) {
        gateway.requireUnchanged(actor,scope,authorization);
        response.setHeader("Cache-Control","no-store");
        if(stream) {
          response.setContentType("application/x-ndjson;charset=UTF-8");response.setHeader("X-Accel-Buffering","no");
          stream(reply.body,response,actor,scope,authorization);
        } else {
          JsonNode data;
          byte[] bytes;
          try {bytes=bounded(reply.body,16*1024*1024);}
          catch(AgentFailure e) {throw new AgentFailure(502,"Agent 回复过大");}
          try {data=bytes.length==0?json.createObjectNode():json.readTree(bytes);}
          catch(IOException e) {throw new AgentFailure(502,"Agent 返回格式错误");}
          gateway.requireUnchanged(actor,scope,authorization);
          if(chat) rememberConversation(data,actor,scope);
          if(upload) {
            var id=data.hasNonNull("attachment_id")?data.get("attachment_id"):data.get("id");
            if(id==null || !id.isTextual()) throw new AgentFailure(502,"Agent 返回格式错误");
            owners.remember("attachment",id.asText(),actor,scope);
          }
          if(attachment && method.equals("DELETE")) owners.remove(path.substring("/v1/attachments/".length()),actor);
          response.setContentType("application/json;charset=UTF-8");json.writeValue(response.getOutputStream(),data);
        }
      }
    } catch(Exception e) {
      if(response.isCommitted()) {
        try {response.getOutputStream().write("{\"type\":\"error\",\"message\":\"Agent 响应中断，请重试\"}\n".getBytes(StandardCharsets.UTF_8));response.flushBuffer();} catch(IOException ignored) {}
      } else {
        response.reset();
        int status=e instanceof AgentFailure f?f.status:e instanceof BusinessException b?b.status():502;
        String message=e instanceof AgentFailure || e instanceof BusinessException?e.getMessage():"无法连接原 Agent 接口，请稍后重试";
        response.setStatus(status);response.setHeader("Cache-Control","no-store");response.setContentType("application/json;charset=UTF-8");
        json.writeValue(response.getOutputStream(),Map.of("detail",message));
      }
    } finally {if(lock!=null)busy.remove(lock);}
  }
  private void rememberConversation(JsonNode data,AgentGateway.Actor actor,List<String> scope) {
    var id=data.get("conversation_id");
    if(id==null || id.isNull()) id=data.path("response").get("conversation_id");
    if(id!=null && !id.isNull()) {
      if(!id.isTextual()) throw new AgentFailure(502,"Agent 返回格式错误");
      owners.remember("conversation",id.asText(),actor,scope);
    }
  }
  private void stream(InputStream input,HttpServletResponse response,AgentGateway.Actor actor,List<String> scope,String authorization) throws IOException {
    var line=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int total=0,n;
    while((n=input.read(chunk))!=-1) {
      total+=n;if(total>16*1024*1024) throw new AgentFailure(502,"Agent 回复过大");
      for(int i=0;i<n;i++) {
        if(chunk[i]=='\n') {emit(line.toByteArray(),response,actor,scope,authorization);line.reset();}
        else {line.write(chunk[i]);if(line.size()>1024*1024)throw new AgentFailure(502,"Agent 事件过大");}
      }
    }
    if(line.size()>0)emit(line.toByteArray(),response,actor,scope,authorization);
  }
  private void emit(byte[] line,HttpServletResponse response,AgentGateway.Actor actor,List<String> scope,String authorization) throws IOException {
    if(new String(line,StandardCharsets.UTF_8).isBlank())return;
    var data=json.readTree(line);
    if(data==null || !data.isObject())throw new AgentFailure(502,"Agent 返回格式错误");
    if("error".equals(data.path("type").asText()))throw new AgentFailure(502,"Agent 响应中断，请重试");
    gateway.requireUnchanged(actor,scope,authorization);
    rememberConversation(data,actor,scope);
    response.getOutputStream().write(line);response.getOutputStream().write('\n');response.flushBuffer();
  }
  static byte[] bounded(InputStream input,int max) throws IOException {
    var bytes=input.readNBytes(max+1);if(bytes.length>max)throw new AgentFailure(413,"请求或响应内容过大");return bytes;
  }
  static byte[] multipart(MultipartFile file,String boundary) throws IOException {
    String name=Optional.ofNullable(file.getOriginalFilename()).orElse("attachment").replaceAll("[\\r\\n\\\"\\\\]","_");
    if(name.length()>200)name=name.substring(name.length()-200);
    String type=file.getContentType();if(type==null || !type.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+"))type="application/octet-stream";
    var out=new ByteArrayOutputStream();
    out.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\""+name+"\"\r\nContent-Type: "+type+"\r\n\r\n").getBytes(StandardCharsets.UTF_8));
    try(var input=file.getInputStream()) {out.write(bounded(input,20*1024*1024));}
    out.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));return out.toByteArray();
  }
}
