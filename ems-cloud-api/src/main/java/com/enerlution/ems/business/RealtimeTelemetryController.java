package com.enerlution.ems.business;

import cn.dev33.satoken.stp.StpUtil;
import com.enerlution.ems.common.*;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletResponse;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/stations/{id}/telemetry")
public class RealtimeTelemetryController {
 private final DomainSupport s;private final StationTelemetryService telemetry;
 private final ScheduledExecutorService executor=Executors.newScheduledThreadPool(4);
 private final Semaphore global=new Semaphore(64);
 private final ConcurrentHashMap<Long,AtomicInteger> users=new ConcurrentHashMap<>();
 public RealtimeTelemetryController(DomainSupport s,StationTelemetryService telemetry){this.s=s;this.telemetry=telemetry;}
 @GetMapping("/snapshot") public ApiResponse<?> snapshot(@PathVariable long id,@RequestParam(required=false) String pointIds){
   s.access.requireStationPermission(id,"telemetry.read");
   var data=telemetry.snapshot(id,parsePoints(pointIds),s.access.hasStationPermission(s.access.userId(),id,"asset.read"));
   s.access.requireStationPermission(id,"telemetry.read");
   if(!s.access.hasStationPermission(s.access.userId(),id,"asset.read"))data.put("presence",null);
   return ApiResponse.ok(data);
 }
 @GetMapping(value="/stream",produces="text/event-stream") public SseEmitter stream(@PathVariable long id,@RequestParam(required=false) String pointIds,HttpServletResponse response){
   s.access.requireStationPermission(id,"telemetry.read");long user=s.access.userId();String token=StpUtil.getTokenValue();
   var selected=parsePoints(pointIds);
   if(!selected.isEmpty())telemetry.snapshot(id,selected,false); // reject cross-station selection before opening SSE
   AtomicInteger count=users.computeIfAbsent(user,key->new AtomicInteger());
   if(count.incrementAndGet()>3){count.decrementAndGet();throw new BusinessException(429,"实时订阅过多，请关闭其他分析窗口");}
   if(!global.tryAcquire()){count.decrementAndGet();throw new BusinessException(429,"实时订阅繁忙，请稍后重试");}
   response.setHeader("Cache-Control","no-cache");response.setHeader("X-Accel-Buffering","no");
   var emitter=new SseEmitter(120000L);var closed=new AtomicBoolean();var future=new AtomicReference<ScheduledFuture<?>>();
   Runnable cleanup=()->{if(closed.compareAndSet(false,true)){var scheduled=future.get();if(scheduled!=null)scheduled.cancel(false);count.decrementAndGet();global.release();}};
   emitter.onCompletion(cleanup);emitter.onTimeout(()->{cleanup.run();emitter.complete();});emitter.onError(error->cleanup.run());
   Runnable tick=()->{
     if(closed.get())return;
     try {
       requireSession(token,user,id);
       var data=telemetry.snapshot(id,selected,s.access.hasStationPermission(user,id,"asset.read"));
       requireSession(token,user,id);
       if(!s.access.hasStationPermission(user,id,"asset.read"))data.put("presence",null);
       if(!closed.get())emitter.send(SseEmitter.event().name("snapshot").data(data));
     }catch(Exception error){
       try{int status=error instanceof BusinessException b?b.status():503;emitter.send(SseEmitter.event().name("stream-error").data(Map.of("code",status,"msg",status==401||status==403?"登录或站点权限已变化":"实时数据暂不可用")));}catch(Exception ignored){}
       cleanup.run();emitter.complete();
     }
   };
   try{future.set(executor.scheduleWithFixedDelay(tick,0,5,TimeUnit.SECONDS));}
   catch(RejectedExecutionException error){cleanup.run();throw new BusinessException(503,"实时服务正在重启");}
   if(closed.get())future.get().cancel(false);
   return emitter;
 }
 private void requireSession(String token,long user,long station){
   Object login=StpUtil.getLoginIdByToken(token);
   if(login==null||!Long.toString(user).equals(login.toString())||!Boolean.TRUE.equals(s.db.queryForObject("SELECT EXISTS(SELECT 1 FROM app_user WHERE id=? AND enabled)",Boolean.class,user)))throw new BusinessException(401,"登录已失效");
   if(!s.access.hasStationPermission(user,station,"telemetry.read"))throw new BusinessException(403,"站点权限已撤销");
 }
 static List<Long> parsePoints(String input){
   if(input==null||input.isBlank())return List.of();
   String[] parts=input.split(",",-1);if(parts.length>200)throw new BusinessException(400,"最多选择200个测点");
   var ids=new LinkedHashSet<Long>();
   for(var part:parts){if(!part.matches("[1-9][0-9]{0,17}"))throw new BusinessException(400,"测点编号无效");ids.add(Long.parseLong(part));}
   return List.copyOf(ids);
 }
 @PreDestroy void stop(){executor.shutdownNow();}
}
