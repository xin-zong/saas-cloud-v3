package com.enerlution.ems.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** UI capability declarations only include operations with a real backend binding. */
final class PermissionAvailability {
  private static final Set<String> AVAILABLE = load();

  static boolean available(String code) {
    return AVAILABLE.contains(code);
  }

  private static Set<String> load() {
    try (var input = PermissionAvailability.class.getResourceAsStream("/permission-catalog.json")) {
      Set<String> codes = new HashSet<>();
      for (var entry : new ObjectMapper().readTree(input))
        if (entry.path("available").asBoolean()) codes.add(entry.path("code").asText());
      return Set.copyOf(codes);
    } catch (java.io.IOException e) {
      throw new ExceptionInInitializerError(e);
    }
  }
}
