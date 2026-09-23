package com.enerlution.ems.auth;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.enerlution.ems.common.ApiExceptionHandler;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.config.WebConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@Import({ApiExceptionHandler.class, WebConfig.class})
class AuthHttpTest {
  @Autowired MockMvc mvc;
  @MockitoBean AuthService auth;
  @MockitoBean AccessControl access;

  @Test
  void invalidLoginReturns401Envelope() throws Exception {
    when(auth.login("alice", "bad", "127.0.0.1"))
        .thenThrow(new BusinessException(401, "Invalid credentials"));
    mvc.perform(
            post("/api/auth/login")
                .contentType("application/json")
                .content("{\"account\":\"alice\",\"password\":\"bad\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value(401))
        .andExpect(jsonPath("$.msg").value("Invalid credentials"));
  }

  @Test
  void protectedMeChecksCurrentAccount() throws Exception {
    when(access.userId()).thenThrow(new BusinessException(401, "Authentication required"));
    mvc.perform(get("/api/auth/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value(401));
    verifyNoInteractions(auth);
  }

  @Test
  void malformedLoginReturns400() throws Exception {
    mvc.perform(post("/api/auth/login").contentType("application/json").content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value(400));
  }

  @Test
  void corsPreflightAllowsExplicitLocalOrigin() throws Exception {
    mvc.perform(
            options("/api/auth/me")
                .header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    verifyNoInteractions(access);
  }

  @Test
  void unexpectedExceptionDoesNotLeakSql() throws Exception {
    when(auth.login("alice", "bad", "127.0.0.1"))
        .thenThrow(new RuntimeException("secret SQL password"));
    mvc.perform(
            post("/api/auth/login")
                .contentType("application/json")
                .content("{\"account\":\"alice\",\"password\":\"bad\"}"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.msg").value("Internal server error"));
  }
}
