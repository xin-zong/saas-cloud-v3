package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
class ReportTemplateServiceTest {
  void bad(org.junit.jupiter.api.function.Executable call) { assertEquals(400,assertThrows(BusinessException.class,call).status()); }
  List<String> locked(String kind) { return ReportTemplateService.catalogue(kind).fields().stream().filter(ReportTemplateService.Field::locked).map(ReportTemplateService.Field::code).toList(); }
  @Test void trimsNamesBoundsUnicodeAndRejectsUnknownPeriodsAndKinds() {
    assertEquals("Solar",ReportTemplateService.normalizeName(" Solar "));
    assertEquals("😀".repeat(50),ReportTemplateService.normalizeName("😀".repeat(50)));
    for(String name:Arrays.asList(null,""," ","a".repeat(51)))bad(()->ReportTemplateService.normalizeName(name));
    for(String type:List.of("day","month","year","range"))assertEquals(type,ReportTemplateService.timeType(type));
    bad(()->ReportTemplateService.timeType("Daily")); bad(()->ReportTemplateService.catalogue("telemetry"));
  }
  @Test void exposesTwelveStableReadOnlySystemTemplatesWithOnlyRealExistingColumns() {
    var systems=ReportTemplateService.systems();assertEquals(12,systems.size());
    assertEquals(systems,ReportTemplateService.systems());
    for(var template:systems){
      assertEquals("system",template.origin());assertEquals(1,template.version());assertEquals(1,template.schemaVersion());
      assertEquals(ReportTemplateService.catalogue(template.kind()).fields().stream().map(ReportTemplateService.Field::code).toList(),template.fields());
    }
    var fields=ReportTemplateService.catalogue("operations").fields();
    assertTrue(fields.stream().anyMatch(f->f.code().equals("section.plans.power_kw")));
    assertFalse(fields.stream().anyMatch(f->f.label().contains("预测")));
  }
  @Test void requiresLockedFieldsAndWhitelistedUniqueFieldsAndCurrencyDependencies() {
    var fields=new ArrayList<>(locked("revenue")); fields.add("section.records.statement_amount");
    bad(()->ReportTemplateService.normalizeFields("revenue",fields));
    fields.add("section.records.currency");
    assertTrue(ReportTemplateService.normalizeFields("revenue",fields).contains("section.records.statement_amount"));
    fields.add("unknown");bad(()->ReportTemplateService.normalizeFields("revenue",fields));fields.removeLast();
    fields.add("meta.stationId");bad(()->ReportTemplateService.normalizeFields("revenue",fields));
    bad(()->ReportTemplateService.normalizeFields("health",List.of()));bad(()->ReportTemplateService.normalizeFields("health",null));
  }
  @Test void filtersColumnsRowsAndSummariesWithoutLeakingUnselectedRowKeys() {
    var selected=new ArrayList<>(locked("operations")); selected.add("section.plans.power_kw");selected.add("summary.planPeriods");
    var snapshot=new ReportTemplateService.Snapshot(UUID.randomUUID().toString(),"Only power","operations","range",selected,1,1);
    var row=new LinkedHashMap<String,Object>();row.put("power_kw","12.30");row.put("mode","private");
    var content=new AnalysisJobService.Content(List.of(new AnalysisJobService.Summary("运营计划时段","1",null),new AnalysisJobService.Summary("日电量",null,"kWh")),List.of(
      new AnalysisJobService.Section("运营计划（按上海业务日期）",List.of(new AnalysisJobService.Column("power_kw","功率kW"),new AnalysisJobService.Column("mode","模式")),List.of(row))));
    var filtered=ReportTemplateService.filter(snapshot,content,101,"from","to","generated");
    assertEquals(List.of(new AnalysisJobService.Summary("运营计划时段","1",null)),filtered.summary());
    var plan=filtered.sections().stream().filter(s->s.title().equals("运营计划（按上海业务日期）")).findFirst().orElseThrow();
    assertEquals(List.of(new AnalysisJobService.Column("power_kw","功率kW")),plan.columns());
    assertEquals(Map.of("power_kw","12.30"),plan.rows().getFirst());
    assertEquals(Map.of("power_kw","12.30","mode","private"),row);
    assertTrue(filtered.sections().stream().anyMatch(s->s.rows().stream().anyMatch(r->r.containsValue("101"))));
  }
}
