package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static com.enerlution.ems.business.AlarmEvaluation.Verdict.*;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlarmEvaluationTest {
  private AlarmRules.Condition condition(String operator, String lower, String upper,
      boolean includeLower, boolean includeUpper) {
    return new AlarmRules.Condition(List.of(new AlarmRules.Field("temperature", "°C", "INSTANT", "DEVICE")),
        "self", 3, operator, decimal(lower), decimal(upper), null, includeLower, includeUpper, false);
  }
  private BigDecimal decimal(String value) { return value == null ? null : new BigDecimal(value); }
  private AlarmEvaluation.Verdict compare(String op, String value, String lower, String upper,
      boolean includeLower, boolean includeUpper) {
    return AlarmEvaluation.compare(List.of(condition(op, lower, upper, includeLower, includeUpper)),
        List.of(decimal(value)));
  }
  @Test void scalarComparisonsUseExactDecimalAndNumericEquality() {
    assertEquals(MATCH, compare("eq", "1.00", "1", null, true, true));
    assertEquals(NORMAL, compare("neq", "1.00", "1", null, true, true));
    assertEquals(MATCH, compare("neq", "1.0000000000000000001", "1", null, true, true));
    assertEquals(NORMAL, compare("lt", "1", "1", null, true, true));
    assertEquals(MATCH, compare("lte", "1", "1", null, true, true));
    assertEquals(NORMAL, compare("gt", "1", "1", null, true, true));
    assertEquals(MATCH, compare("gte", "1", "1", null, true, true));
    assertEquals(MATCH, compare("lt", "0.9999999999999999999", "1", null, true, true));
    assertEquals(MATCH, compare("gt", "1.0000000000000000001", "1", null, true, true));
  }
  @Test void intervalEndpointsAndOneSidedLimitsAreRespected() {
    assertEquals(MATCH, compare("bet", "1", "1", "2", true, false));
    assertEquals(NORMAL, compare("bet", "1", "1", "2", false, true));
    assertEquals(NORMAL, compare("bet", "2", "1", "2", true, false));
    assertEquals(MATCH, compare("bet", "2", "1", "2", false, true));
    assertEquals(MATCH, compare("nbet", "2", "1", "2", true, false));
    assertEquals(NORMAL, compare("nbet", "1.5", "1", "2", true, true));
    assertEquals(MATCH, compare("bet", "-100", null, "2", false, true));
    assertEquals(MATCH, compare("bet", "100", "1", null, true, false));
    assertEquals(MATCH, compare("nbet", "2", null, "2", false, false));
    assertEquals(MATCH, compare("nbet", "1", "1", null, false, false));
  }
  @Test void conditionsAreAndedButAnyMissingValueIsUnknownEvenWhenAnotherIsNormal() {
    var conditions = List.of(condition("gt", "10", null, true, true), condition("lt", "20", null, true, true));
    assertEquals(MATCH, AlarmEvaluation.compare(conditions, List.of(decimal("15"), decimal("15"))));
    assertEquals(NORMAL, AlarmEvaluation.compare(conditions, List.of(decimal("5"), decimal("15"))));
    assertEquals(UNKNOWN, AlarmEvaluation.compare(conditions, Arrays.asList(decimal("5"), null)));
    assertEquals(UNKNOWN, AlarmEvaluation.compare(conditions, List.of(decimal("5"))));
    assertEquals(UNKNOWN, AlarmEvaluation.compare(conditions, null));
    assertEquals(UNKNOWN, AlarmEvaluation.compare(List.of(), List.of()));
  }
  @Test void unsupportedConfigurationsHaveReasonsAndSupportedNumericDeviceReturnsNull() {
    var supported = condition("gt", "10", null, true, true);
    assertNull(AlarmEvaluation.unsupported("DEVICE", List.of(supported)));
    assertNotNull(AlarmEvaluation.unsupported("STATION", List.of(supported)));
    assertNotNull(AlarmEvaluation.unsupported("DEVICE", List.of()));
    for (var field : List.of(new AlarmRules.Field("deviceStatus", "", "INSTANT", "DEVICE"),
        new AlarmRules.Field("temperature", "°C", "DAY_00", "DEVICE"),
        new AlarmRules.Field("temperature", "°C", "INSTANT", "STATION"))) {
      assertNotNull(AlarmEvaluation.unsupported("DEVICE", List.of(new AlarmRules.Condition(List.of(field),
          "self", 1, "eq", BigDecimal.ONE, null, null, true, true, false))));
    }
    assertNotNull(AlarmEvaluation.unsupported("DEVICE", List.of(new AlarmRules.Condition(supported.fields(),
        "dpc_rate", 1, "gt", BigDecimal.ONE, null, null, true, true, false))));
    assertNotNull(AlarmEvaluation.unsupported("DEVICE", List.of(new AlarmRules.Condition(supported.fields(),
        "self", 1, "mom_up", BigDecimal.ONE, null, null, true, true, false))));
    assertNotNull(AlarmEvaluation.unsupported("DEVICE", List.of(new AlarmRules.Condition(supported.fields(),
        "self", 1, "gt", BigDecimal.ONE, null, null, true, true, true))));
    assertNotNull(AlarmEvaluation.unsupported("DEVICE", List.of(new AlarmRules.Condition(
        List.of(supported.fields().getFirst(), new AlarmRules.Field("voltage", "V", "INSTANT", "DEVICE")),
        "self", 1, "gt", BigDecimal.ONE, null, null, true, true, false))));
  }
  @Test void onlyConsecutiveMinuteBucketsReachTriggerThresholdAndTriggerOnce() {
    var first = AlarmEvaluation.advance(null, 60000, MATCH, 3, 0, false, true);
    assertEquals(new AlarmEvaluation.State(60000, 1, null, false), first.state());
    assertNull(first.action());
    var second = AlarmEvaluation.advance(first.state(), 120000, MATCH, 3, 0, false, true);
    var third = AlarmEvaluation.advance(second.state(), 180000, MATCH, 3, 0, false, true);
    assertEquals("trigger", third.action());
    assertTrue(third.state().latched());
    assertNull(AlarmEvaluation.advance(third.state(), 240000, MATCH, 3, 0, true, true).action());
    var gap = AlarmEvaluation.advance(second.state(), 240000, MATCH, 3, 0, false, true);
    assertEquals(1, gap.state().consecutive());
    assertNull(gap.action());
  }
  @Test void mixedContinuousPeriodsAreUnsupportedRatherThanCollapsedToMaximum() {
    var threePeriods = condition("gt", "10", null, true, true);
    var onePeriod = new AlarmRules.Condition(threePeriods.fields(), "self", 1, "lt",
        decimal("20"), null, null, true, true, false);
    assertEquals("暂不支持不同连续周期的组合条件",
        AlarmEvaluation.unsupported("DEVICE", List.of(threePeriods, onePeriod)));
    assertNull(AlarmEvaluation.unsupported("DEVICE", List.of(threePeriods, threePeriods)));
  }
  @Test void sameAndOlderBucketsDoNotMutateStateOrRepeatActions() {
    var prior = new AlarmEvaluation.State(120000, 2, null, false);
    for (long bucket : new long[]{60000, 120000}) {
      var step = AlarmEvaluation.advance(prior, bucket, MATCH, 3, 0, false, true);
      assertEquals(prior, step.state());
      assertNull(step.action());
    }
  }
  @Test void unknownAndOutOfWindowResetCountersWhilePreservingLatch() {
    var prior = new AlarmEvaluation.State(120000, 2, 60000L, true);
    for (var verdict : new AlarmEvaluation.Verdict[]{UNKNOWN, MATCH}) {
      var step = AlarmEvaluation.advance(prior, 180000, verdict, 3, 0, true, verdict == UNKNOWN);
      assertEquals(new AlarmEvaluation.State(180000, 0, null, true), step.state());
      assertNull(step.action());
    }
    var reset = AlarmEvaluation.advance(new AlarmEvaluation.State(60000, 2, null, false),
        120000, UNKNOWN, 3, 0, false, true);
    assertFalse(reset.state().latched());
    assertEquals(0, reset.state().consecutive());
  }
  @Test void recoveryRequiresContinuousNormalDurationAndGapRestartsClock() {
    var active = new AlarmEvaluation.State(60000, 3, null, true);
    var first = AlarmEvaluation.advance(active, 120000, NORMAL, 3, 90, true, true);
    assertEquals(120000L, first.state().normalSince());
    assertNull(first.action());
    var second = AlarmEvaluation.advance(first.state(), 180000, NORMAL, 3, 90, true, true);
    assertNull(second.action());
    var recovered = AlarmEvaluation.advance(second.state(), 240000, NORMAL, 3, 90, true, true);
    assertEquals("recover", recovered.action());
    assertFalse(recovered.state().latched());
    var gap = AlarmEvaluation.advance(first.state(), 240000, NORMAL, 3, 90, true, true);
    assertEquals(240000L, gap.state().normalSince());
    assertNull(gap.action());
    var unknown = AlarmEvaluation.advance(first.state(), 180000, UNKNOWN, 3, 90, true, true);
    var restart = AlarmEvaluation.advance(unknown.state(), 240000, NORMAL, 3, 90, true, true);
    assertEquals(240000L, restart.state().normalSince());
    assertNull(restart.action());
  }
  @Test void zeroDurationRecoversOnFirstNormalAndActiveEventAlwaysLatches() {
    var active = AlarmEvaluation.advance(null, 60000, MATCH, 3, 0, true, true);
    assertTrue(active.state().latched());
    assertNull(active.action());
    var recovered = AlarmEvaluation.advance(active.state(), 120000, NORMAL, 3, 0, true, true);
    assertEquals("recover", recovered.action());
    assertFalse(recovered.state().latched());
  }
  @Test void manualCloseCannotRetriggerUntilNormalBucketRearmsRule() {
    var latched = new AlarmEvaluation.State(60000, 3, null, true);
    var continued = AlarmEvaluation.advance(latched, 120000, MATCH, 1, 0, false, true);
    assertNull(continued.action());
    assertTrue(continued.state().latched());
    var gap = AlarmEvaluation.advance(continued.state(), 240000, MATCH, 1, 0, false, true);
    assertNull(gap.action());
    assertTrue(gap.state().latched());
    var normal = AlarmEvaluation.advance(gap.state(), 300000, NORMAL, 1, 0, false, true);
    assertNull(normal.action());
    assertFalse(normal.state().latched());
    assertEquals("trigger", AlarmEvaluation.advance(normal.state(), 360000, MATCH, 1, 0, false, true).action());
  }
  @Test void matchInterruptsRecoveryClock() {
    var prior = new AlarmEvaluation.State(120000, 0, 60000L, true);
    var fault = AlarmEvaluation.advance(prior, 180000, MATCH, 3, 60, true, true);
    assertNull(fault.state().normalSince());
    assertNull(fault.action());
    assertNull(AlarmEvaluation.advance(fault.state(), 240000, NORMAL, 3, 60, true, true).action());
  }
}
