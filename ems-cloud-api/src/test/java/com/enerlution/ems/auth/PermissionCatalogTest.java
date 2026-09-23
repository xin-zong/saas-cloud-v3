package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PermissionCatalogTest {
  private final ObjectMapper mapper = new ObjectMapper();
  private final Path catalog = Path.of("src/main/resources/permission-catalog.json");
  private final Path controllers = Path.of("src/main/java/com/enerlution/ems/business");

  @Test
  void originalMatrixIsCompleteAndCodesAreUnambiguous() throws Exception {
    JsonNode entries = mapper.readTree(Files.readString(catalog));
    assertTrue(entries.isArray());
    Set<String> expected = Set.of(
        "查看站点与设备", "新建站点", "编辑站点", "删除站点", "查看运营收益", "查看运行策略", "编辑运行策略", "下发运行策略",
        "查看运营总览", "查看收益核算", "查看计划调度", "制定调度计划", "查看响应邀约", "接受响应邀约",
        "查看告警", "查看设备健康", "处理告警", "转为运维工单", "上传目标固件", "执行固件升级",
        "查看工单", "新建工单", "编辑工单", "处理工单", "查看审批", "审批申请",
        "实时数据分析", "历史趋势分析", "生成报告", "下载数据",
        "查看客户", "管理客户", "查看组织与成员", "管理组织", "管理成员", "配置角色权限", "分配成员权限", "查看安全审计");
    Set<String> names = new HashSet<>();
    Set<String> codes = new HashSet<>();
    int prototypeCount = 0;
    for (JsonNode entry : entries) {
      String code = entry.path("code").asText();
      assertTrue(code.matches("[a-z]+(\\.[a-z]+)+"), code);
      assertTrue(codes.add(code), "duplicate code " + code);
      assertTrue(Set.of("organization", "station").contains(entry.path("scope").asText()), code);
      assertTrue(entry.path("module").isTextual(), code);
      assertTrue(entry.path("page").isTextual(), code);
      assertTrue(entry.path("available").isBoolean(), code);
      if (entry.path("origin").asText().equals("prototype")) {
        prototypeCount++;
        names.add(entry.path("name").asText());
      }
      for (JsonNode binding : entry.path("bindings")) {
        assertTrue(Set.of("current", "planned", "shared-candidate").contains(binding.path("status").asText()), code);
        assertTrue(binding.path("method").isTextual(), code);
        assertTrue(binding.path("path").isTextual(), code);
        if (!entry.path("available").asBoolean())
          assertNotEquals("current", binding.path("status").asText(), code);
      }
    }
    assertEquals(38, prototypeCount);
    assertEquals(expected, names);
  }

  @Test
  void availablePermissionsHaveAnExactCurrentBackendCheck() throws Exception {
    JsonNode entries = mapper.readTree(Files.readString(catalog));
    for (JsonNode entry : entries) {
      String code = entry.path("code").asText();
      if (!entry.path("available").asBoolean()) continue;
      boolean checked = false;
      for (JsonNode binding : entry.path("bindings")) {
        if (!binding.path("status").asText().equals("current")) continue;
        String source = Files.readString(controllers.resolve(binding.path("controller").asText() + ".java"));
        String annotation = "@" + binding.path("method").asText() + "Mapping(\"" + binding.path("path").asText() + "\")";
        int start = source.indexOf(annotation);
        assertTrue(start >= 0, code + " missing route " + annotation);
        int next = source.indexOf("Mapping(\"", start + annotation.length());
        String route = source.substring(start, next < 0 ? source.length() : next);
        if (route.contains("requirePermission(\"" + code + "\")")) checked = true;
      }
      assertTrue(checked, code + " has no exact current check");
    }
  }

  @Test
  void legacyCodesArePreservedAsExtensions() throws Exception {
    JsonNode entries = mapper.readTree(Files.readString(catalog));
    Set<String> extensions = new HashSet<>();
    for (JsonNode entry : entries) if (entry.path("origin").asText().equals("existing-extension")) extensions.add(entry.path("code").asText());
    assertEquals(Set.of("telemetry.read", "inspection.manage", "tariff.manage", "market.read", "market.manage", "revenue.review", "workorder.manage", "member.manage"), extensions);
    Set<String> all = new HashSet<>(extensions);
    for (JsonNode entry : entries) all.add(entry.path("code").asText());
    assertTrue(all.containsAll(Set.of("asset.read", "asset.edit", "telemetry.read", "alarm.read", "alarm.handle", "workorder.read", "workorder.manage", "inspection.manage", "approval.review", "strategy.read", "strategy.manage", "tariff.manage", "market.read", "market.manage", "revenue.read", "revenue.review", "report.export", "member.manage", "audit.read")));
  }

  @Test
  void customerAccessRemainsStationScopedWithTheExistingAggregateConditions() throws Exception {
    JsonNode entries = mapper.readTree(Files.readString(catalog));
    JsonNode read = find(entries, "customer.read");
    JsonNode manage = find(entries, "customer.manage");
    assertEquals("station", read.path("scope").asText());
    assertEquals("visible_customer_stations", read.path("scopeRule").asText());
    assertEquals("station", manage.path("scope").asText());
    assertEquals("all_customer_stations_in_actor_station_scope_and_organization_branch", manage.path("scopeRule").asText());
    assertEquals("asset.edit + member.manage", manage.path("legacyBinding").asText());
    assertFalse(read.path("available").asBoolean());
    assertFalse(manage.path("available").asBoolean());
  }

  @Test
  void overlappingOperationsAreCandidatesNotCommittedPermissionReplacements() throws Exception {
    JsonNode entries = mapper.readTree(Files.readString(catalog));
    for (String code : Set.of("settlement.read", "dispatch.read", "dispatch.manage", "invitation.read", "analytics.history.read")) {
      JsonNode entry = find(entries, code);
      assertFalse(entry.path("available").asBoolean(), code);
      assertEquals(1, entry.path("bindings").size(), code);
      assertEquals("shared-candidate", entry.path("bindings").get(0).path("status").asText(), code);
      assertFalse(entry.path("bindings").get(0).path("enforcesCode").asBoolean(), code);
      assertEquals(entry.path("legacyBinding").asText(), entry.path("bindings").get(0).path("sharedWithCurrentCode").asText(), code);
    }
    assertFalse(find(entries, "invitation.read").path("bindings").get(0).path("representsPrototypeOperation").asBoolean());
  }

  private JsonNode find(JsonNode entries, String code) {
    for (JsonNode entry : entries) if (entry.path("code").asText().equals(code)) return entry;
    fail("missing catalog code " + code);
    return null;
  }
}
