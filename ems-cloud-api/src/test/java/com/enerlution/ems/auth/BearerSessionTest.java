package com.enerlution.ems.auth;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.enerlution.ems.common.*;
import com.enerlution.ems.config.WebConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(classes = BearerSessionTest.TestApplication.class)
@AutoConfigureMockMvc
class BearerSessionTest {
  @Configuration
  @EnableAutoConfiguration(
      exclude = {DataSourceAutoConfiguration.class, FlywayAutoConfiguration.class})
  @Import({
    AuthController.class,
    AccessControl.class,
    SessionTokens.class,
    WebConfig.class,
    ApiExceptionHandler.class
  })
  static class TestApplication {}

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;
  @Autowired SessionTokens tokens;
  @MockitoBean JdbcTemplate jdbc;
  @MockitoBean AuthService auth;

  @Test
  void bearerWorksButQueryCookieAndRawTokenDoNotAndLogoutRevokes() throws Exception {
    AuthService.AuthUser user =
        new AuthService.AuthUser("1", "Alice", "alice", "operator", "", List.of(), List.of());
    when(auth.login(anyString(), anyString(), anyString()))
        .thenAnswer(i -> new AuthService.LoginResult(false, null, tokens.login(1), user));
    when(auth.me()).thenReturn(user);
    doAnswer(
            i -> {
              tokens.logout();
              return null;
            })
        .when(auth)
        .logout();
    when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    String json =
        mvc.perform(
                post("/api/auth/login")
                    .contentType("application/json")
                    .content("{\"account\":\"alice\",\"password\":\"password\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String token = mapper.readTree(json).path("data").path("token").asText();
    org.junit.jupiter.api.Assertions.assertTrue(token.length() >= 32);
    mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());
    mvc.perform(get("/api/auth/me").param("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/auth/me").cookie(new Cookie("Authorization", token)))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/auth/me").header("Authorization", token))
        .andExpect(status().isUnauthorized());
    mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
        .andExpect(status().isOk());
    mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
        .andExpect(status().isUnauthorized());
  }
}
