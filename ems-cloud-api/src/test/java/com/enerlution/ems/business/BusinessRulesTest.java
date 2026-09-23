package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class BusinessRulesTest {
  @Test
  void adjacentMarketReservationsDoNotDoubleCount() {
    var zero = java.time.Instant.parse("2026-09-01T00:00:00Z");
    var windows =
        List.of(
            new BusinessRules.CapacityWindow(zero, zero.plusSeconds(3600), new BigDecimal("60")),
            new BusinessRules.CapacityWindow(
                zero.plusSeconds(3600), zero.plusSeconds(7200), new BigDecimal("60")),
            new BusinessRules.CapacityWindow(zero, zero.plusSeconds(7200), new BigDecimal("40")));
    assertEquals(0, new BigDecimal("100").compareTo(BusinessRules.peakCapacity(windows)));
  }

  @Test
  void csvFormulaWithNewlineIsNeutralized() {
    assertEquals("\"'=1+2\ntext\"", ReportController.cell("=1+2\ntext"));
  }

  @Test
  void nullPeriodIsRejectedAsBadInput() {
    var error =
        assertThrows(
            com.enerlution.ems.common.BusinessException.class,
            () ->
                BusinessRules.periods(
                    java.util.Arrays.asList((BusinessRules.Period) null), BigDecimal.TEN));
    assertEquals(400, error.status());
  }

  @Test
  void completedOrderCannotBeReopened() {
    assertThrows(
        RuntimeException.class, () -> BusinessRules.orderTransition("completed", "processing"));
  }

  @Test
  void orderMustBeAcceptedBeforeCompletion() {
    assertThrows(
        RuntimeException.class, () -> BusinessRules.orderTransition("pending", "completed"));
    assertDoesNotThrow(() -> BusinessRules.orderTransition("pending", "processing"));
    assertDoesNotThrow(() -> BusinessRules.orderTransition("processing", "completed"));
  }

  @Test
  void periodsRejectOverlapExcessCapacityAndNonzeroStandby() {
    assertThrows(
        RuntimeException.class,
        () ->
            BusinessRules.periods(
                List.of(new BusinessRules.Period(0, 60, "charge", new BigDecimal("101"))),
                new BigDecimal("100")));
    assertThrows(
        RuntimeException.class,
        () ->
            BusinessRules.periods(
                List.of(new BusinessRules.Period(0, 60, "standby", BigDecimal.ONE)),
                new BigDecimal("100")));
    assertThrows(
        RuntimeException.class,
        () ->
            BusinessRules.periods(
                List.of(
                    new BusinessRules.Period(0, 60, "charge", BigDecimal.TEN),
                    new BusinessRules.Period(30, 90, "discharge", BigDecimal.TEN)),
                new BigDecimal("100")));
    assertDoesNotThrow(
        () ->
            BusinessRules.periods(
                List.of(new BusinessRules.Period(1380, 1440, "charge", BigDecimal.TEN)),
                new BigDecimal("100")));
  }
}
