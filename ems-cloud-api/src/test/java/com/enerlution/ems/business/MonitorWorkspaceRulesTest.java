package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;

class MonitorWorkspaceRulesTest {
  // A missing sample must never become a zero or inflate a complete fleet total.
  @Test void totalsExposeCoverageAndEfficiencyUsesTheSameStationsOnBothSides() {
    var a=new LinkedHashMap<String,Object>();a.put("pvTotal",BigDecimal.ZERO);a.put("storageTotalCharged",new BigDecimal("100"));a.put("storageTotalDischarged",new BigDecimal("80"));
    var b=Map.<String,Object>of("pvTotal",new BigDecimal("12"),"storageTotalCharged",new BigDecimal("500"));
    var totals=MonitorWorkspaceRules.totals(List.of(a,b,Map.of()));
    assertEquals(new BigDecimal("12"),totals.get("pvTotal").get("value"));
    assertEquals(2,totals.get("pvTotal").get("covered"));
    assertEquals(false,totals.get("pvTotal").get("complete"));
    assertEquals(0,new BigDecimal("80").compareTo((BigDecimal)totals.get("storageEfficiency").get("value")));
    assertEquals(1,totals.get("storageEfficiency").get("covered"));
    assertNull(MonitorWorkspaceRules.totals(List.of(Map.of())).get("pvTotal").get("value"));
  }
  @Test void intervalAndPaginationRejectInvalidValuesBeforeAnyQuery() {
    for(var input:List.of(Map.of("minCapacity","2","maxCapacity","1"),Map.of("limit","201"),Map.of("offset","-1"),Map.of("scene","invented"),Map.of("sort","name;DROP TABLE station"),Map.of("minCapacity","NaN"))) {
      assertEquals(400,assertThrows(BusinessException.class,()->MonitorWorkspaceRules.query(input)).status());
    }
    var q=MonitorWorkspaceRules.query(Map.of("search","  华东  ","minCapacity","0","limit","2"));
    assertEquals("华东",q.get("search"));assertEquals(2,q.get("limit"));
  }
  @Test void inconsistentCapturedCountersDoNotBecomeAnEfficiencyAboveHundredPercent(){
    var total=MonitorWorkspaceRules.totals(List.of(Map.of("storageTotalCharged",new BigDecimal("10"),"storageTotalDischarged",new BigDecimal("12")))).get("storageEfficiency");
    assertNull(total.get("value"));assertEquals("counter_boundary_requires_review",total.get("reason"));
  }
  @Test void numericSortKeepsMissingValuesLastInBothDirectionsAndZeroIsValid() {
    var zero=new LinkedHashMap<String,Object>(Map.of("id","1","name","A"));zero.put("metrics",Map.of("pvPower",BigDecimal.ZERO));
    var missing=new LinkedHashMap<String,Object>(Map.of("id","2","name","B"));missing.put("metrics",Map.of());
    var ten=new LinkedHashMap<String,Object>(Map.of("id","3","name","C"));ten.put("metrics",Map.of("pvPower",new BigDecimal("10")));
    var values=List.of(missing,ten,zero);
    assertEquals(List.of("1","3","2"),values.stream().sorted(MonitorWorkspaceRules.comparator("pvPower","ASC")).map(v->v.get("id")).toList());
    assertEquals(List.of("3","1","2"),values.stream().sorted(MonitorWorkspaceRules.comparator("pvPower","DESC")).map(v->v.get("id")).toList());
  }
  @Test void updateTimeSortUsesInstantsAcrossFractionalPrecisionAndOffsets(){
    var first=Map.<String,Object>of("id","1","updatedAt","2026-10-18T02:00:00Z");
    var later=Map.<String,Object>of("id","2","updatedAt","2026-10-18T02:00:00.100Z");
    var earlier=Map.<String,Object>of("id","3","updatedAt","2026-10-18T03:59:59.999+02:00");
    var missing=Map.<String,Object>of("id","4");var rows=List.of(later,missing,first,earlier);
    assertEquals(List.of("3","1","2","4"),rows.stream().sorted(MonitorWorkspaceRules.comparator("updatedAt","ASC")).map(v->v.get("id")).toList());
    assertEquals(List.of("2","1","3","4"),rows.stream().sorted(MonitorWorkspaceRules.comparator("updatedAt","DESC")).map(v->v.get("id")).toList());
  }
  @Test void capturedSceneKeepsMpptInStorageWithoutChangingCanonicalAssetType(){
    assertEquals("BESS",MonitorWorkspaceRules.capturedScene("Hybrid",List.of("Storage System","MPPT PV System")));
    assertEquals("Hybrid",MonitorWorkspaceRules.capturedScene("Hybrid",List.of("Storage System","Solar System","MPPT PV System")));
    assertEquals("PV",MonitorWorkspaceRules.capturedScene("PV",List.of("Solar System")));
    assertEquals("Hybrid",MonitorWorkspaceRules.capturedScene("Hybrid",List.of("unsupported system")));
  }
}
