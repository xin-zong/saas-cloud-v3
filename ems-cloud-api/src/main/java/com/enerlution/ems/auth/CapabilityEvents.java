package com.enerlution.ems.auth;

import cn.dev33.satoken.stp.StpUtil;
import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class CapabilityEvents {
  private record Connection(long user, String token, SseEmitter emitter) {}

  private final Set<Connection> connections = ConcurrentHashMap.newKeySet();
  private final Set<Runnable> resourceInvalidators = ConcurrentHashMap.newKeySet();
  private final ScheduledExecutorService timer =
      Executors.newSingleThreadScheduledExecutor(
          r -> {
            Thread t = new Thread(r, "capability-events");
            t.setDaemon(true);
            return t;
          });
  private final JdbcTemplate db;

  public CapabilityEvents(JdbcTemplate db) {
    this.db = db;
    timer.scheduleWithFixedDelay(this::heartbeat, 15, 15, TimeUnit.SECONDS);
  }

  public SseEmitter subscribe(long user, String token) {
    if (connections.size() >= 256
        || connections.stream().filter(c -> c.user() == user).count() >= 4)
      throw new com.enerlution.ems.common.BusinessException(429, "权限通知连接过多");
    var emitter = new SseEmitter(300000L);
    var c = new Connection(user, token, emitter);
    connections.add(c);
    Runnable remove = () -> connections.remove(c);
    emitter.onCompletion(remove);
    emitter.onError(e -> remove.run());
    emitter.onTimeout(
        () -> {
          remove.run();
          emitter.complete();
        });
    send(c, "ready");
    return emitter;
  }

  public void addResourceInvalidator(Runnable invalidator) {
    resourceInvalidators.add(invalidator);
  }

  public void changed() {
    Runnable publish =
        () -> {
          invalidateResources();
          connections.forEach(c -> send(c, "capabilities-changed"));
        };
    afterCommit(publish);
  }

  public void sessionsChanged() {
    afterCommit(
        () -> {
          invalidateResources();
          heartbeat();
        });
  }

  private void invalidateResources() {
    resourceInvalidators.forEach(
        r -> {
          try {
            r.run();
          } catch (RuntimeException ignored) {
          }
        });
  }

  private void afterCommit(Runnable publish) {
    if (TransactionSynchronizationManager.isSynchronizationActive())
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            @Override
            public void afterCommit() {
              publish.run();
            }
          });
    else publish.run();
  }

  private void heartbeat() {
    connections.forEach(c -> send(c, "heartbeat"));
  }

  private void send(Connection c, String event) {
    try {
      Object login = StpUtil.getLoginIdByToken(c.token());
      boolean active =
          Boolean.TRUE.equals(
              db.queryForObject(
                  "SELECT EXISTS(SELECT 1 FROM saas_active_user WHERE user_id=?)",
                  Boolean.class,
                  c.user()));
      if (login == null || !Long.toString(c.user()).equals(login.toString()) || !active) {
        connections.remove(c);
        c.emitter().complete();
        return;
      }
      c.emitter()
          .send(SseEmitter.event().name(event).data(Map.of("refresh", !event.equals("heartbeat"))));
    } catch (Exception e) {
      connections.remove(c);
      c.emitter().complete();
    }
  }

  @PreDestroy
  void stop() {
    timer.shutdownNow();
    connections.forEach(c -> c.emitter().complete());
    connections.clear();
  }
}
