package com.enerlution.ems.business;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/** Pure evaluation of complete minute buckets; persistence and sampling belong to the caller. */
public final class AlarmEvaluation {
  private static final long MINUTE_MS = 60_000;
  private static final Set<String> OPERATORS = Set.of("eq", "neq", "lt", "lte", "gt", "gte", "bet", "nbet");

  private AlarmEvaluation() {}

  public enum Verdict { MATCH, NORMAL, UNKNOWN }
  public record State(long lastBucket, int consecutive, Long normalSince, boolean latched) {}
  public record Step(State state, String action) {}

  /** A reason is returned instead of guessing the semantics of unsupported rule configurations. */
  public static String unsupported(String objectType, List<AlarmRules.Condition> conditions) {
    if (!"DEVICE".equals(objectType)) return "暂不支持站级告警检测";
    if (conditions == null || conditions.isEmpty()) return "缺少告警条件";
    Integer period = null;
    for (var condition : conditions) {
      if (condition == null || condition.fields() == null || condition.fields().size() != 1)
        return "仅支持单指标条件";
      if (period != null && period != condition.period()) return "暂不支持不同连续周期的组合条件";
      period = condition.period();
      var field = condition.fields().getFirst();
      if (field == null || field.code() == null || field.code().isBlank()) return "缺少测点定义";
      if ("deviceStatus".equals(field.code())) return "暂不支持通信状态检测";
      if (!"DEVICE".equals(field.objectType())) return "仅支持设备指标";
      if (!"INSTANT".equals(field.cycleType())) return "仅支持瞬时指标";
      if (!"self".equals(condition.algorithm())) return "仅支持原值比较";
      if (condition.extend1()) return "暂不支持扩展条件";
      if (condition.operator() == null || !OPERATORS.contains(condition.operator())) return "暂不支持此比较算法";
      boolean interval = "bet".equals(condition.operator()) || "nbet".equals(condition.operator());
      if (condition.lower() == null && condition.upper() == null) return "缺少比较阈值";
      if (!interval && (condition.lower() == null || condition.upper() != null)) return "比较阈值不完整";
      if (condition.lower() != null && condition.upper() != null
          && condition.lower().compareTo(condition.upper()) >= 0) return "区间阈值无效";
    }
    return null;
  }

  /** All conditions must match; a missing value makes the whole bucket unknown. */
  public static Verdict compare(List<AlarmRules.Condition> conditions, List<BigDecimal> values) {
    if (unsupported("DEVICE", conditions) != null || values == null || values.size() != conditions.size())
      return Verdict.UNKNOWN;
    boolean matches = true;
    for (int index = 0; index < conditions.size(); index++) {
      var value = values.get(index);
      if (value == null) return Verdict.UNKNOWN;
      var condition = conditions.get(index);
      boolean current = switch (condition.operator()) {
        case "eq" -> value.compareTo(condition.lower()) == 0;
        case "neq" -> value.compareTo(condition.lower()) != 0;
        case "lt" -> value.compareTo(condition.lower()) < 0;
        case "lte" -> value.compareTo(condition.lower()) <= 0;
        case "gt" -> value.compareTo(condition.lower()) > 0;
        case "gte" -> value.compareTo(condition.lower()) >= 0;
        case "bet" -> within(condition, value);
        case "nbet" -> !within(condition, value);
        default -> false; // unsupported() checked the operator before comparison.
      };
      matches &= current;
    }
    return matches ? Verdict.MATCH : Verdict.NORMAL;
  }

  private static boolean within(AlarmRules.Condition condition, BigDecimal value) {
    boolean aboveLower = condition.lower() == null || (condition.includeLower()
        ? value.compareTo(condition.lower()) >= 0 : value.compareTo(condition.lower()) > 0);
    boolean belowUpper = condition.upper() == null || (condition.includeUpper()
        ? value.compareTo(condition.upper()) <= 0 : value.compareTo(condition.upper()) < 0);
    return aboveLower && belowUpper;
  }

  /** Advance once per bucket. Missing or skipped minutes break both continuity clocks. */
  public static Step advance(State prior, long bucketStartMs, Verdict verdict, int requiredPeriods,
      int recoverySeconds, boolean hasActive, boolean inEffectiveWindow) {
    if (prior != null && bucketStartMs <= prior.lastBucket()) return new Step(prior, null);
    boolean contiguous = prior != null && bucketStartMs - prior.lastBucket() == MINUTE_MS;
    boolean latched = hasActive || (prior != null && prior.latched());
    int consecutive = contiguous ? prior.consecutive() : 0;
    Long normalSince = contiguous ? prior.normalSince() : null;
    if (!inEffectiveWindow || verdict == null || verdict == Verdict.UNKNOWN)
      return new Step(new State(bucketStartMs, 0, null, latched), null);

    if (verdict == Verdict.MATCH) {
      if (!latched) {
        consecutive++;
        if (consecutive >= Math.max(1, requiredPeriods))
          return new Step(new State(bucketStartMs, consecutive, null, true), "trigger");
      }
      return new Step(new State(bucketStartMs, consecutive, null, latched), null);
    }

    if (!hasActive) return new Step(new State(bucketStartMs, 0, null, false), null);
    if (normalSince == null) normalSince = bucketStartMs;
    if (bucketStartMs - normalSince >= Math.max(0L, recoverySeconds) * 1_000L)
      return new Step(new State(bucketStartMs, 0, null, false), "recover");
    return new Step(new State(bucketStartMs, 0, normalSince, true), null);
  }
}
