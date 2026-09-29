package com.enerlution.ems.config;

import com.enerlution.ems.auth.AccessControl;
import cn.dev33.satoken.filter.SaTokenContextFilterForJakartaServlet;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

/** Servlet interceptor pattern adapted selectively from RuoYi Sa-Token integration. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final AccessControl access;
  private final String[] origins;

  public WebConfig(
      AccessControl access,
      @Value("${ems.cors.origins:http://localhost:5173,http://127.0.0.1:5173}") String origins) {
    this.access = access;
    this.origins =
        Arrays.stream(origins.split(","))
            .map(String::trim)
            .filter(s -> !s.isBlank())
            .toArray(String[]::new);
    if (Arrays.stream(this.origins).anyMatch(s -> s.contains("*")))
      throw new IllegalArgumentException("CORS requires explicit origins");
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              @Override
              public boolean preHandle(
                  HttpServletRequest request, HttpServletResponse response, Object handler) {
                if (!"OPTIONS".equals(request.getMethod())) access.userId();
                return true;
              }
            })
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/auth/login", "/api/auth/mfa", "/api/health");
  }

  /** Async completion is dispatched on another thread; initialize context before rechecking auth. */
  @Bean
  FilterRegistrationBean<SaTokenContextFilterForJakartaServlet> tokenContextRegistration(
      SaTokenContextFilterForJakartaServlet filter) {
    var registration = new FilterRegistrationBean<>(filter);
    registration.setDispatcherTypes(DispatcherType.REQUEST, DispatcherType.ASYNC, DispatcherType.ERROR);
    registration.setAsyncSupported(true);
    registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 100);
    return registration;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
        .addMapping("/api/**")
        .allowedOrigins(origins)
        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("Authorization", "Content-Type")
        .allowCredentials(false)
        .maxAge(600);
  }
}
