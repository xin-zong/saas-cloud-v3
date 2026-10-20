package com.enerlution.ems.agent;

import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.stereotype.Component;

@Component
public class AgentUpstream {
  private static final ScheduledExecutorService DEADLINES=Executors.newScheduledThreadPool(1, r->{var t=new Thread(r,"agent-deadlines");t.setDaemon(true);return t;});
  private final HttpClient client;
  private final URI base;
  private final String key;
  @Autowired
  public AgentUpstream(@Value("${EMS_AGENT_URL:http://47.99.70.238:18080}") String url,
      @Value("${EMS_AGENT_API_KEY:}") String key) {
    this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).followRedirects(HttpClient.Redirect.NEVER).build(),url,key);
  }
  AgentUpstream(HttpClient client,String url,String key) {
    this.client=client; this.base=URI.create(url); this.key=key;
    if(!("http".equals(base.getScheme()) || "https".equals(base.getScheme())) || base.getHost()==null || base.getUserInfo()!=null || base.getQuery()!=null || base.getFragment()!=null || !(base.getPath().isEmpty() || base.getPath().equals("/")))
      throw new IllegalArgumentException("Invalid Agent URL");
  }
  Reply call(String method,String path,byte[] body,String type,boolean streaming) throws Exception {
    if(key.isBlank()) throw new AgentFailure(503,"原 Agent 接口尚未配置");
    if(!path.matches("/v1/(health|rag/health|tools|chat|chat/stream|attachments(/[a-zA-Z0-9_-]{1,160})?)")) throw new AgentFailure(404,"接口不存在");
    var request=HttpRequest.newBuilder(base.resolve(path)).timeout(Duration.ofSeconds(streaming?180:30)).header("X-API-Key",key);
    if(type!=null) request.header("Content-Type",type);
    var response=client.send(request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofByteArray(body)).build(),HttpResponse.BodyHandlers.ofInputStream());
    var reply=new Reply(response.body(),streaming?180:30);
    if(response.statusCode()<200 || response.statusCode()>=300) {
      reply.close();
      throw new AgentFailure(response.statusCode()==429?429:502,"原 Agent 接口请求失败，请稍后重试");
    }
    return reply;
  }
  static final class Reply implements AutoCloseable {
    final InputStream body;
    private final ScheduledFuture<?> deadline;
    Reply(InputStream body,int seconds) {
      this.body=body;
      deadline=DEADLINES.schedule(()->{try {body.close();} catch(IOException ignored) {}},seconds,TimeUnit.SECONDS);
    }
    public void close() throws IOException {deadline.cancel(false);body.close();}
  }
}
