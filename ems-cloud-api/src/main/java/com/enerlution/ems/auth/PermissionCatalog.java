package com.enerlution.ems.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

/** One typed source of truth for runtime capability advertising and role configuration. */
public final class PermissionCatalog {
  public record Entry(
      String code,
      String name,
      String module,
      String scope,
      boolean available,
      String origin,
      String reason) {}

  private static final Map<String, Entry> ENTRIES = load();

  private PermissionCatalog() {}

  public static Collection<Entry> entries() {
    return ENTRIES.values();
  }

  public static Entry find(String code) {
    return ENTRIES.get(code);
  }

  public static boolean available(String code) {
    Entry entry = find(code);
    return entry != null && entry.available();
  }

  private static Map<String, Entry> load() {
    try (var input = PermissionCatalog.class.getResourceAsStream("/permission-catalog.json")) {
      Map<String, Entry> entries = new LinkedHashMap<>();
      for (var node : new ObjectMapper().readTree(input)) {
        var entry =
            new Entry(
                node.path("code").asText(),
                node.path("name").asText(),
                node.path("module").asText(),
                node.path("scope").asText(),
                node.path("available").asBoolean(),
                node.path("origin").asText(),
                node.path("notes").asText("功能暂不可用"));
        if (entries.put(entry.code(), entry) != null)
          throw new IllegalStateException("Duplicate permission code: " + entry.code());
      }
      return Collections.unmodifiableMap(entries);
    } catch (java.io.IOException e) {
      throw new ExceptionInInitializerError(e);
    }
  }
}
