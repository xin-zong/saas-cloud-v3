package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import cn.dev33.satoken.context.SaHolder;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.*;
import com.enerlution.ems.config.WebConfig;

@SpringBootTest(classes=AsyncContextHttpTest.App.class, webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class AsyncContextHttpTest {
  @Configuration(proxyBeanMethods=false)
  @EnableAutoConfiguration(exclude={DataSourceAutoConfiguration.class,FlywayAutoConfiguration.class})
  @Import({WebConfig.class,Endpoint.class})
  static class App {}
  @RestController static class Endpoint {
    @GetMapping("/api/async-context-test") Callable<String> result() { return () -> "completed"; }
  }
  @Autowired TestRestTemplate http;
  @MockitoBean AccessControl access;

  @Test void initializesRequestContextAgainOnAsyncDispatch() {
    when(access.userId()).thenAnswer(call -> {
      assertEquals("/api/async-context-test",SaHolder.getRequest().getRequestPath());
      return 7L;
    });
    var response=http.getForEntity("/api/async-context-test",String.class);
    assertEquals(200,response.getStatusCode().value());
    assertEquals("completed",response.getBody());
    verify(access,times(2)).userId();
  }
}
