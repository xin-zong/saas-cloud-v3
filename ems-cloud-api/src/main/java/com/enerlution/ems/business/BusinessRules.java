package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

public final class BusinessRules {
  private BusinessRules() {}

  public record Period(int startMinute, int endMinute, String mode, BigDecimal powerKw) {}

  public record CapacityWindow(Instant start, Instant end, BigDecimal power) {}

  public static BigDecimal peakCapacity(List<CapacityWindow> windows) {
    var changes = new TreeMap<Instant, BigDecimal>();
    for (var window : windows) {
      changes.merge(window.start(), window.power(), BigDecimal::add);
      changes.merge(window.end(), window.power().negate(), BigDecimal::add);
    }
    BigDecimal running = BigDecimal.ZERO, peak = BigDecimal.ZERO;
    for (var delta : changes.values()) {
      running = running.add(delta);
      peak = peak.max(running);
    }
    return peak;
  }

  public static void orderTransition(String from, String to) {
    boolean valid =
        (from.equals("pending") && Set.of("processing", "cancelled").contains(to))
            || (from.equals("processing") && Set.of("completed", "cancelled").contains(to));
    if (!valid) throw new BusinessException(409, "工单状态已变化或不允许此操作");
  }

  public static void periods(List<Period> periods, BigDecimal rated) {
    if (periods == null
        || periods.isEmpty()
        || periods.size() > 96
        || periods.stream().anyMatch(Objects::isNull))
      throw new BusinessException(400, "计划需要 1–96 个有效时段");
    int end = -1;
    for (Period p :
        periods.stream().sorted(Comparator.comparingInt(Period::startMinute)).toList()) {
      if (p.startMinute() < 0
          || p.endMinute() > 1440
          || p.endMinute() <= p.startMinute()
          || p.startMinute() < end
          || p.mode() == null
          || !Set.of("charge", "discharge", "standby").contains(p.mode())
          || p.powerKw() == null
          || p.powerKw().signum() < 0
          || p.powerKw().compareTo(rated) > 0
          || (p.mode().equals("standby") && p.powerKw().signum() != 0))
        throw new BusinessException(400, "时段重叠、时间范围或功率无效");
      end = p.endMinute();
    }
  }
}
