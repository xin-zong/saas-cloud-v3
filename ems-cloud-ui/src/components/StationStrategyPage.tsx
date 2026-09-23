import { DEMO_MODE, api, send, type ApiRow } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { planPeriods, validatePlan, type PlanPeriod } from "@/api/planning";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  Gauge,
  History,
  Layers3,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Send,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  UploadCloud,
  Wifi,
  X,
} from "lucide-react";
import type { Station } from "@/App";
import { stationDataNow } from "@/data/dataClock";

type Weekday = "周一" | "周二" | "周三" | "周四" | "周五" | "周六" | "周日";
type StrategyMode = "自发自用" | "峰谷套利" | "需量管理" | "备用保障";

type EditorStrategyMode =
  | "峰谷套利"
  | "动态电价优化"
  | "光伏自发自用"
  | "新能源平滑"
  | "需量管理"
  | "备用保障"
  | "自发自用";

type StrategyPeriod = {
  id: string;
  start: string;
  end: string;
  power: number;
  enabled: boolean;
};

type StrategyOverrideRule = {
  trigger: "power" | "soc" | "alarm";
  threshold: number;
  priority: "high" | "medium" | "low";
};

type StrategySegment = {
  id: string;
  weekday: Weekday;
  start: string;
  end: string;
  mode: StrategyMode;
  tags: string[];
  chargePeriods?: StrategyPeriod[];
  dischargePeriods?: StrategyPeriod[];
  overrideRule?: StrategyOverrideRule;
  priorityModes?: EditorStrategyMode[];
};

type StrategySegmentDraft = {
  weekdays: Weekday[];
  start: string;
  end: string;
  mode: EditorStrategyMode;
  chargePeriods: StrategyPeriod[];
  dischargePeriods: StrategyPeriod[];
  overrideRule: StrategyOverrideRule;
  priorityModes: EditorStrategyMode[];
};

type EditorModeTab = "基础模式" | "覆盖模式" | "模式优先级";

type StrategyPreset = {
  id: string;
  name: string;
  description: string;
  segments: StrategySegment[];
  version?: string;
  updatedAt?: string;
  owner?: string;
  status?: "active" | "draft";
};

const WEEKDAYS: Weekday[] = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const TIME_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const totalMinutes = index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

const EDITOR_BASE_MODES: {
  value: EditorStrategyMode;
  label: string;
  detail: string;
  color: string;
}[] = [
  { value: "峰谷套利", label: "峰谷套利", detail: "按峰谷价差安排充放电", color: "#0f766e" },
  { value: "动态电价优化", label: "动态电价优化", detail: "结合实时电价滚动优化", color: "#176b5d" },
  { value: "光伏自发自用", label: "光伏自发自用", detail: "优先消纳站内光伏出力", color: "#15803d" },
  { value: "新能源平滑", label: "新能源平滑", detail: "平滑新能源出力波动", color: "#7c3aed" },
];

const EDITOR_OVERRIDE_MODES: {
  value: EditorStrategyMode;
  label: string;
  detail: string;
}[] = [
  { value: "需量管理", label: "需量管理", detail: "超过并网阈值时限制站点功率" },
  { value: "备用保障", label: "备用保障", detail: "为应急调度保留 SOC 与功率余量" },
  { value: "自发自用", label: "自发自用", detail: "按负荷优先消纳本地能源" },
];

const DEFAULT_PRIORITY_MODES: EditorStrategyMode[] = [
  "峰谷套利",
  "光伏自发自用",
  "动态电价优化",
  "新能源平滑",
];

const DEFAULT_OVERRIDE_RULE: StrategyOverrideRule = {
  trigger: "power",
  threshold: 800,
  priority: "high",
};

const MODE_META: Record<
  StrategyMode,
  { color: string; background: string; border: string; description: string }
> = {
  自发自用: {
    color: "#45636d",
    background: "#edf4f5",
    border: "#54727c",
    description: "优先消纳站内光伏与储能",
  },
  峰谷套利: {
    color: "#bd6b0a",
    background: "#fff4e2",
    border: "#d88716",
    description: "按峰谷价差执行充放电",
  },
  需量管理: {
    color: "#1764a2",
    background: "#e9f3ff",
    border: "#2e78b8",
    description: "控制最大需量与并网功率",
  },
  备用保障: {
    color: "#536a74",
    background: "#e9eff1",
    border: "#5d747e",
    description: "保留容量以应对备用需求",
  },
};

const BASE_SEGMENTS: Omit<StrategySegment, "weekday">[] = [
  { id: "self-use", start: "00:00", end: "07:00", mode: "自发自用", tags: ["备用保障"] },
  { id: "arbitrage", start: "07:00", end: "10:00", mode: "峰谷套利", tags: ["VPP", "需量控制"] },
  { id: "default", start: "10:00", end: "16:30", mode: "自发自用", tags: ["需量控制", "备用保障"] },
  { id: "demand", start: "16:30", end: "20:30", mode: "需量管理", tags: ["AGC", "需量控制"] },
  { id: "reserve", start: "20:30", end: "24:00", mode: "自发自用", tags: ["备用保障"] },
];

type OptimizationGoal = "收益平衡" | "峰谷套利优先" | "保供优先";

const OPTIMIZATION_GOALS: {
  value: OptimizationGoal;
  label: string;
  detail: string;
  color: string;
}[] = [
  { value: "收益平衡", label: "收益平衡", detail: "兼顾套利、需量与备用", color: "#0f766e" },
  { value: "峰谷套利优先", label: "套利优先", detail: "扩大可用峰谷价差", color: "#b45309" },
  { value: "保供优先", label: "保供优先", detail: "保留 SOC 与功率余量", color: "#176b5d" },
];

type StrategyConstraints = {
  minSoc: number;
  maxSoc: number;
  maxImport: number;
  reservePower: number;
};

function cloneSegments() {
  return WEEKDAYS.flatMap((weekday) =>
    BASE_SEGMENTS.map((segment) => ({
      ...segment,
      id: `${weekday}-${segment.id}`,
      weekday,
    })),
  );
}

function planStrategyMode(
  station: Station,
  mode: "charge" | "discharge" | "standby",
): StrategyMode {
  if (mode === "charge") return "峰谷套利";
  if (mode === "discharge") {
    return station.mode === "需量管理" ? "需量管理" : "峰谷套利";
  }
  return station.mode === "备用保障" ? "备用保障" : "自发自用";
}

function stationPlanDate(station: Station) {
  return station.operations?.plan
    ?.map((period) => period.date)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function strategySegmentsFromStation(station: Station): StrategySegment[] {
  const latestDate = stationPlanDate(station);
  const source =
    station.operations?.plan?.filter((period) => period.date === latestDate) ?? [];
  if (!source.length) return DEMO_MODE ? cloneSegments() : [];

  return WEEKDAYS.flatMap((weekday) =>
    source.map((period) => {
      const mode = planStrategyMode(station, period.mode);
      return {
        id: `${station.id}-${weekday}-${period.id}`,
        weekday,
        start: period.start,
        end: period.end,
        mode,
        tags: [
          "交付包计划",
          period.mode === "charge"
            ? "充电调度"
            : period.mode === "discharge"
              ? "放电调度"
              : "备用约束",
        ],
        chargePeriods:
          period.mode === "charge"
            ? [createStrategyPeriod(`${period.id}-charge`, period.start, period.end, period.power)]
            : [],
        dischargePeriods:
          period.mode === "discharge"
            ? [createStrategyPeriod(`${period.id}-discharge`, period.start, period.end, period.power)]
            : [],
        overrideRule: {
          trigger: "power",
          threshold: Math.max(1, Math.round(station.ratedPower * 0.8)),
          priority: "high",
        },
        priorityModes: [mode, "备用保障", "需量管理"],
      };
    }),
  );
}

function stationStrategyConstraints(station: Station): StrategyConstraints {
  const powers =
    station.operations?.plan?.map((period) => period.power).filter(Number.isFinite) ?? [];
  const maxPlanPower = powers.length ? Math.max(...powers) : station.ratedPower * 0.8;
  return {
    minSoc: Math.max(10, Math.min(35, Math.round(station.soc - 35))),
    maxSoc: Math.min(98, Math.max(80, Math.round(station.soc + 25))),
    maxImport: Math.max(100, Math.round(Math.max(station.activePower, maxPlanPower) * 1.1)),
    reservePower: Math.max(0, Math.round(station.ratedPower * 0.24)),
  };
}

function stationOptimizationGoal(station: Station): OptimizationGoal {
  if (station.mode === "需量管理") return "保供优先";
  if (station.mode === "削峰填谷") return "峰谷套利优先";
  return "收益平衡";
}

function buildStationPresets(station: Station): StrategyPreset[] {
  const segments = strategySegmentsFromStation(station);
  const date = stationPlanDate(station) ?? "当前快照";
  const version = station.operations?.dispatch?.version ?? `PKG-${date.replace(/-/g, "")}`;
  const owner = station.manager || "交付包运行服务";
  const source = station.mode || "储能运行";
  return [
    {
      id: `package-${station.id}`,
      name: `${source} · 交付包计划`,
      description: `基于 ${station.name} 的 ${date} 运行计划`,
      version,
      updatedAt: station.updateTime || date,
      owner,
      status: "active",
      segments,
    },
    {
      id: `package-reserve-${station.id}`,
      name: `${source} · 保供补充方案`,
      description: "在交付包计划基础上提高备用约束",
      version: `${version}-R`,
      updatedAt: station.updateTime || date,
      owner,
      status: "draft",
      segments: segments.map((segment) => ({
        ...segment,
        mode: segment.mode === "峰谷套利" ? "备用保障" : segment.mode,
        tags: [...segment.tags, "SOC保护"],
      })),
    },
  ];
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeLabel(value: string) {
  return value === "24:00" ? "24:00" : value;
}

function validateTimeRange(start: string, end: string) {
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && minutes(end) > minutes(start);
}

function findScheduleIssue(segments: StrategySegment[]) {
  const invalid = segments.find((segment) => !validateTimeRange(segment.start, segment.end));
  if (invalid) return `${invalid.start}-${invalid.end} 时段的结束时间必须晚于开始时间`;

  const ordered = [...segments].sort((a, b) => minutes(a.start) - minutes(b.start));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (minutes(current.start) < minutes(previous.end)) {
      return `${previous.start}-${previous.end} 与 ${current.start}-${current.end} 存在重叠`;
    }
  }
  return "";
}

function modeMeta(mode: StrategyMode) {
  return MODE_META[mode];
}

function currentTimeLabel(now = new Date()) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function currentWeekday(now = new Date()) {
  const day = now.getDay();
  return WEEKDAYS[(day + 6) % 7];
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutesValue = totalMinutes % 60;
  if (!hours) return `${minutesValue} 分钟`;
  if (!minutesValue) return `${hours} 小时`;
  return `${hours} 小时 ${minutesValue} 分钟`;
}

function nextScheduleSegment(segments: StrategySegment[], currentTime: string) {
  const currentMinutes = minutes(currentTime);
  return segments.find((segment) => minutes(segment.start) > currentMinutes) ?? segments[0];
}

function scheduleCoverage(segments: StrategySegment[]) {
  const coverage = segments.reduce(
    (total, segment) => total + Math.max(0, minutes(segment.end) - minutes(segment.start)),
    0,
  );
  return Math.min(100, Math.round((coverage / 1440) * 100));
}

function constraintIssue(constraints: StrategyConstraints) {
  if (constraints.minSoc < 0 || constraints.minSoc > 100) return "SOC 下限必须在 0%-100% 之间";
  if (constraints.maxSoc < 0 || constraints.maxSoc > 100) return "SOC 上限必须在 0%-100% 之间";
  if (constraints.minSoc >= constraints.maxSoc) return "SOC 下限必须低于上限";
  if (constraints.maxImport <= 0) return "并网功率上限必须大于 0 kW";
  if (constraints.reservePower < 0) return "备用功率不能小于 0 kW";
  return "";
}

function strategyStatusText(applied: boolean) {
  return applied ? "策略已提交并应用" : "有未提交修改";
}

function editorModeToStrategyMode(mode: EditorStrategyMode): StrategyMode {
  if (mode === "动态电价优化") return "需量管理";
  if (mode === "光伏自发自用") return "自发自用";
  if (mode === "新能源平滑") return "备用保障";
  return mode;
}

function strategyModeToEditorMode(mode: StrategyMode): EditorStrategyMode {
  if (mode === "自发自用") return "光伏自发自用";
  if (mode === "需量管理") return "需量管理";
  if (mode === "备用保障") return "备用保障";
  return mode;
}

function createStrategyPeriod(
  id: string,
  start: string,
  end: string,
  power = 100,
): StrategyPeriod {
  return { id, start, end, power, enabled: true };
}

function cloneStrategyPeriods(periods: StrategyPeriod[]) {
  return periods.map((period) => ({ ...period }));
}

function defaultChargePeriods() {
  return [
    createStrategyPeriod("charge-1", "00:00", "07:00", 100),
    createStrategyPeriod("charge-2", "12:00", "14:00", 80),
  ];
}

function defaultDischargePeriods() {
  return [
    createStrategyPeriod("discharge-1", "10:00", "12:00", 100),
    createStrategyPeriod("discharge-2", "17:00", "21:00", 100),
  ];
}

function createStrategyDraft(
  weekday: Weekday,
  segment?: StrategySegment,
): StrategySegmentDraft {
  const defaultWeekdays =
    weekday === "周六" || weekday === "周日" ? [weekday] : WEEKDAYS.slice(0, 5);
  return {
    weekdays: segment ? [segment.weekday] : defaultWeekdays,
    start: segment?.start ?? "08:00",
    end: segment?.end ?? "22:00",
    mode: segment ? strategyModeToEditorMode(segment.mode) : "峰谷套利",
    chargePeriods: cloneStrategyPeriods(segment?.chargePeriods ?? defaultChargePeriods()),
    dischargePeriods: cloneStrategyPeriods(segment?.dischargePeriods ?? defaultDischargePeriods()),
    overrideRule: { ...DEFAULT_OVERRIDE_RULE, ...segment?.overrideRule },
    priorityModes: segment?.priorityModes
      ? [...segment.priorityModes]
      : [...DEFAULT_PRIORITY_MODES],
  };
}

type StrategyAssistantSuggestion = {
  draft: StrategySegmentDraft;
  minSoc: number;
  maxImport: number;
  optimizationGoal: OptimizationGoal;
};

type StrategyAssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function assistantDayLabel(weekdays: Weekday[]) {
  if (weekdays.length === 7) return "每日";
  if (weekdays.length === 5 && WEEKDAYS.slice(0, 5).every((day) => weekdays.includes(day))) return "工作日";
  if (weekdays.length === 2 && weekdays.includes("周六") && weekdays.includes("周日")) return "周末";
  return weekdays.join("、") || "当前日期";
}

function normalizeAssistantTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute !== 0)) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assistantSuggestionFromPrompt(
  prompt: string,
  weekday: Weekday,
  constraints: StrategyConstraints,
  previous?: StrategyAssistantSuggestion,
): StrategyAssistantSuggestion {
  const baseDraft = previous?.draft ?? { ...createStrategyDraft(weekday), start: "00:00", end: "24:00" };
  const normalizedPrompt = prompt.trim().replace(/：/g, ":");
  const namedDays = WEEKDAYS.filter((day) => normalizedPrompt.includes(day));
  const weekdays = /工作日/.test(normalizedPrompt)
    ? WEEKDAYS.slice(0, 5)
    : /周末/.test(normalizedPrompt)
      ? ["周六", "周日"] as Weekday[]
      : /每天|每日/.test(normalizedPrompt)
        ? [...WEEKDAYS]
        : namedDays.length ? namedDays : baseDraft.weekdays;

  const mode: EditorStrategyMode = /光伏|自发自用/.test(normalizedPrompt)
    ? "光伏自发自用"
    : /动态|实时电价/.test(normalizedPrompt)
      ? "动态电价优化"
      : /平滑|新能源/.test(normalizedPrompt)
        ? "新能源平滑"
        : /峰谷|套利/.test(normalizedPrompt) ? "峰谷套利" : baseDraft.mode;

  const maxImportMatch = normalizedPrompt.match(/(?:需量|并网功率|并网上限)[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)/i);
  const minSocMatch =
    normalizedPrompt.match(/(?:最低|最小|下限)[^0-9\-]{0,8}SOC[^0-9\-]{0,8}(-?\d+(?:\.\d+)?)/i) ??
    normalizedPrompt.match(/SOC[^0-9\-]{0,8}(-?\d+(?:\.\d+)?)/i);
  const rangeMatch = normalizedPrompt.match(/(\d{1,2}:\d{2})\s*(?:-|至|到|~|～)\s*(\d{1,2}:\d{2})/);
  const chargePowerMatch = normalizedPrompt.match(/充电[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)(?=\s*(?:kw|千瓦|[,，。;；]|$))/i);
  const dischargePowerMatch = normalizedPrompt.match(/放电[^0-9\-]{0,12}(-?\d+(?:\.\d+)?)(?=\s*(?:kw|千瓦|[,，。;；]|$))/i);

  if (!/工作日|周末|每天|每日|周[一二三四五六日]|光伏|自发自用|动态|实时电价|平滑|新能源|峰谷|套利|保供|备用|收益|平衡/i.test(normalizedPrompt)
    && !maxImportMatch && !minSocMatch && !rangeMatch && !chargePowerMatch && !dischargePowerMatch) {
    throw new Error("暂未识别到策略参数，请补充生效日期、时间范围或功率约束。");
  }
  const maxImport = Number(maxImportMatch?.[1] ?? previous?.maxImport ?? constraints.maxImport);
  const minSoc = Number(minSocMatch?.[1] ?? previous?.minSoc ?? constraints.minSoc);
  const issue = constraintIssue({ ...constraints, maxImport, minSoc });
  if (issue) throw new Error(issue);
  const rangeStart = normalizeAssistantTime(rangeMatch?.[1] ?? "");
  const rangeEnd = normalizeAssistantTime(rangeMatch?.[2] ?? "");
  if (rangeMatch && (!rangeStart || !rangeEnd || minutes(rangeEnd) <= minutes(rangeStart))) {
    throw new Error("时间范围无效，请使用同一天内的开始和结束时间，例如 08:00-22:00。");
  }
  const start = rangeStart || baseDraft.start;
  const end = rangeEnd || baseDraft.end;
  const chargePower = Number(chargePowerMatch?.[1] ?? baseDraft.chargePeriods[0]?.power ?? 100);
  const dischargePower = Number(dischargePowerMatch?.[1] ?? baseDraft.dischargePeriods[0]?.power ?? 100);
  if (chargePower <= 0 || dischargePower <= 0) throw new Error("充放电功率必须大于 0 kW。");
  const optimizationGoal: OptimizationGoal =
    /保供|备用|安全/.test(normalizedPrompt)
      ? "保供优先"
      : /平衡/.test(normalizedPrompt) ? "收益平衡" : /收益|套利|峰谷/.test(normalizedPrompt)
        ? "峰谷套利优先"
        : previous?.optimizationGoal ?? "收益平衡";

  return {
    draft: {
      ...baseDraft,
      weekdays,
      start,
      end,
      mode,
      chargePeriods: baseDraft.chargePeriods.map((period) =>
        chargePowerMatch ? { ...period, power: chargePower } : period,
      ),
      dischargePeriods: baseDraft.dischargePeriods.map((period) =>
        dischargePowerMatch ? { ...period, power: dischargePower } : period,
      ),
      overrideRule: { ...baseDraft.overrideRule, trigger: "power", threshold: maxImport },
    },
    minSoc,
    maxImport,
    optimizationGoal,
  };
}

function assistantReply(suggestion: StrategyAssistantSuggestion) {
  const { draft, minSoc, maxImport, optimizationGoal } = suggestion;
  return `草案已更新：${assistantDayLabel(draft.weekdays)}，${draft.mode}，${draft.start}-${draft.end}。并网功率上限 ${maxImport} kW，SOC 下限 ${minSoc}%，目标为“${optimizationGoal}”。充放电时段沿用默认配置或上一版草案，尚未按实际电价优化。`;
}

function periodIssue(periods: StrategyPeriod[], label: string) {
  const enabled = periods.filter((period) => period.enabled);
  const invalid = enabled.find((period) => !validateTimeRange(period.start, period.end));
  if (invalid) return `${label} ${invalid.start}-${invalid.end} 的结束时间必须晚于开始时间`;

  const ordered = [...enabled].sort((a, b) => minutes(a.start) - minutes(b.start));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (minutes(current.start) < minutes(previous.end)) {
      return `${label} ${previous.start}-${previous.end} 与 ${current.start}-${current.end} 存在重叠`;
    }
  }
  return "";
}

function draftIssue(draft: StrategySegmentDraft) {
  if (!draft.weekdays.length) return "至少选择一个生效日期";
  if (!validateTimeRange(draft.start, draft.end)) {
    return "生效时间的结束时间必须晚于开始时间";
  }
  return periodIssue(draft.chargePeriods, "充电时段") || periodIssue(draft.dischargePeriods, "放电时段");
}

function draftTags(draft: StrategySegmentDraft) {
  const tags: string[] = [draft.mode];
  if (draft.chargePeriods.some((period) => period.enabled)) tags.push("充电调度");
  if (draft.dischargePeriods.some((period) => period.enabled)) tags.push("放电调度");
  return tags;
}

function editingIdLabel(id: string | null | undefined) {
  return id ? "时段设置" : "新增时段";
}

function SegmentTimeline({
  segments,
  currentTime,
}: {
  segments: StrategySegment[];
  currentTime: string;
}) {
  const currentMinutes = minutes(currentTime);

  return (
    <div
      style={{
        position: "relative",
        minHeight: 85,
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      <div style={{ position: "relative", minWidth: 560, height: 85, paddingTop: 28, paddingBottom: 25, boxSizing: "border-box" }}>
        <div
          style={{
            display: "flex",
            height: 32,
            borderRadius: 3,
            overflow: "hidden",
            background: "#edf2f4",
          }}
        >
          {segments.map((segment) => {
            const meta = modeMeta(segment.mode);
            const width = ((minutes(segment.end) - minutes(segment.start)) / 1440) * 100;
            return (
              <div
                key={segment.id}
                title={`${segment.start}-${segment.end} · ${segment.mode}`}
                style={{
                  width: `${width}%`,
                  position: DEMO_MODE ? undefined : "absolute",
                  left: DEMO_MODE ? undefined : `${minutes(segment.start) / 1440 * 100}%`,
                  height: DEMO_MODE ? undefined : 32,
                  minWidth: 42,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 8px",
                  color: meta.color,
                  background: meta.background,
                  borderRight: `1px solid ${meta.border}`,
                  fontSize: 10,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {DEMO_MODE ? segment.mode : segment.tags[0]}
              </div>
            );
          })}
        </div>

        {[0, 360, 720, 1080, 1440].map((value) => (
          <span
            key={value}
            style={{
              position: "absolute",
              top: 68,
              left: `${(value / 1440) * 100}%`,
              transform: value === 0 ? "translateX(0)" : value === 1440 ? "translateX(-100%)" : "translateX(-50%)",
              color: "#7c8a90",
              fontSize: 9,
              fontFamily: "'Roboto Mono', monospace",
            }}
          >
            {String(Math.floor(value / 60)).padStart(2, "0")}:00
          </span>
        ))}

        {currentMinutes >= 0 && currentMinutes <= 1440 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: `${(currentMinutes / 1440) * 100}%`,
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                color: "#fff",
                background: "#0e6958",
                fontSize: 9,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              当前 {currentTime}
            </span>
            <span style={{ width: 2, height: 52, background: "#0e6958" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function StrategyPeriodGroup({
  label,
  periods,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  periods: StrategyPeriod[];
  onChange: (id: string, patch: Partial<StrategyPeriod>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <span style={{ color: "#28776c", fontSize: 10, fontWeight: 750 }}>{label}</span>
        <button type="button" title={`新增${label}`} aria-label={`新增${label}`} onClick={onAdd} style={modalIconButton}>
          <Plus size={14} />
        </button>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {periods.map((period) => (
          <div key={period.id} className="strategy-segment-period-row">
            <select
              aria-label={`${label}开始时间`}
              value={period.start}
              onChange={(event) => onChange(period.id, { start: event.target.value })}
              style={modalSelect}
            >
              {TIME_OPTIONS.map((value) => <option key={value}>{value}</option>)}
            </select>
            <span style={{ color: "#93a0a5", fontSize: 11, textAlign: "center" }}>→</span>
            <select
              aria-label={`${label}结束时间`}
              value={period.end}
              onChange={(event) => onChange(period.id, { end: event.target.value })}
              style={modalSelect}
            >
              {TIME_OPTIONS.map((value) => <option key={value}>{value}</option>)}
            </select>
            <div className="strategy-segment-power-field">
              <input
                aria-label={`${label}功率`}
                type="number"
                min={0}
                step={10}
                value={period.power}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  onChange(period.id, { power: Number.isFinite(nextValue) ? nextValue : 0 });
                }}
                style={modalNumberInput}
              />
              <span>kW</span>
            </div>
            <label className="strategy-segment-enabled">
              <input
                type="checkbox"
                checked={period.enabled}
                onChange={(event) => onChange(period.id, { enabled: event.target.checked })}
              />
              <span>启用</span>
            </label>
            <button type="button" title={`删除${label}`} aria-label={`删除${label}`} onClick={() => onRemove(period.id)} style={modalIconButton}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      {!periods.length && (
        <div style={{ padding: "12px 10px", border: "1px dashed #cbd7d8", borderRadius: 6, color: "#94a3a8", fontSize: 10 }}>
          暂无{label}，点击右侧加号添加
        </div>
      )}
    </section>
  );
}

function StrategySegmentModal({
  initialDraft,
  editing,
  assistantSuggestion,
  onCancel,
  onSave,
}: {
  initialDraft: StrategySegmentDraft;
  editing: boolean;
  assistantSuggestion?: StrategyAssistantSuggestion;
  onCancel: () => void;
  onSave: (draft: StrategySegmentDraft) => void;
}) {
  const [draft, setDraft] = useState<StrategySegmentDraft>(initialDraft);
  const [activeTab, setActiveTab] = useState<EditorModeTab>("基础模式");
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  const activeBaseMode = EDITOR_BASE_MODES.find((item) => item.value === draft.mode) ?? EDITOR_BASE_MODES[0];
  const activeOverrideMode = EDITOR_OVERRIDE_MODES.find((item) => item.value === draft.mode) ?? EDITOR_OVERRIDE_MODES[0];
  const dateSummary =
    draft.weekdays.length === 7
      ? "每日"
      : draft.weekdays.length === 5 && WEEKDAYS.slice(0, 5).every((day) => draft.weekdays.includes(day))
        ? "工作日"
        : `${draft.weekdays.length} 天`;

  function updateDraft(patch: Partial<StrategySegmentDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }

  function toggleWeekday(day: Weekday) {
    updateDraft({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((item) => item !== day)
        : [...draft.weekdays, day],
    });
  }

  function updatePeriod(kind: "chargePeriods" | "dischargePeriods", id: string, patch: Partial<StrategyPeriod>) {
    updateDraft({
      [kind]: draft[kind].map((period) => (period.id === id ? { ...period, ...patch } : period)),
    });
  }

  function addPeriod(kind: "chargePeriods" | "dischargePeriods") {
    const source = draft[kind];
    const nextPeriod = kind === "chargePeriods"
      ? createStrategyPeriod(`charge-${Date.now()}`, "14:00", "16:00", 80)
      : createStrategyPeriod(`discharge-${Date.now()}`, "21:00", "22:00", 100);
    updateDraft({ [kind]: [...source, nextPeriod] });
  }

  function removePeriod(kind: "chargePeriods" | "dischargePeriods", id: string) {
    updateDraft({ [kind]: draft[kind].filter((period) => period.id !== id) });
  }

  function movePriority(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draft.priorityModes.length) return;
    const next = [...draft.priorityModes];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateDraft({ priorityModes: next });
  }

  function saveDraft() {
    const issue = draftIssue(draft);
    if (issue) {
      setError(issue);
      return;
    }
    onSave(draft);
  }

  return (
    <div
      role="presentation"
      style={strategyModalOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="strategy-segment-dialog-title"
        className="strategy-segment-modal"
        style={strategyModalPanel}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px 11px", borderBottom: "1px solid #dbe5e6", flexShrink: 0 }}>
          <h2 id="strategy-segment-dialog-title" style={{ margin: 0, color: "#17262c", fontSize: 15, lineHeight: 1.3, fontWeight: 800 }}>
            {editing ? "编辑策略时段" : "新增策略时段"}
          </h2>
          <button ref={closeButtonRef} type="button" onClick={onCancel} style={modalCloseButton}>
            <X size={13} /> 关闭
          </button>
        </header>

        <div className="strategy-segment-modal__body" style={{ flex: "0 1 auto", minHeight: 0, overflowY: "auto", padding: "10px 16px 16px" }}>
          {assistantSuggestion && (
            <div style={{ marginBottom: 12, padding: "8px 0", color: "#176b5e", fontSize: 12 }}>
              草案约束：SOC 下限 {assistantSuggestion.minSoc}% · 并网上限 {assistantSuggestion.maxImport} kW · {assistantSuggestion.optimizationGoal}。保存时一并写入。
            </div>
          )}
          <section style={{ ...modalSection, marginBottom: 12 }}>
            <div>
              <div style={modalLabel}>生效日期 <span>(可多选)</span></div>
              <div className="strategy-segment-weekdays" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                {WEEKDAYS.map((day) => {
                  const selected = draft.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWeekday(day)}
                      style={{
                        minWidth: 42,
                        height: 27,
                        padding: "0 10px",
                        border: `1px solid ${selected ? "#2b8d7e" : "#d8e2e3"}`,
                        borderRadius: 5,
                        background: selected ? "#eef8f5" : "#fff",
                        color: selected ? "#197466" : "#758388",
                        fontSize: 10,
                        fontWeight: selected ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
            <label>
              <span style={modalLabel}>生效时间</span>
              <div className="strategy-segment-time-range" style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
                <select aria-label="生效开始时间" value={draft.start} onChange={(event) => updateDraft({ start: event.target.value })} style={{ ...modalSelect, flex: 1 }}>
                  {[...new Set([...TIME_OPTIONS, draft.start])].sort().map((value) => <option key={value}>{value}</option>)}
                </select>
                <span style={{ color: "#849196", fontSize: 12 }}>—</span>
                <select aria-label="生效结束时间" value={draft.end} onChange={(event) => updateDraft({ end: event.target.value })} style={{ ...modalSelect, flex: 1 }}>
                  {[...new Set([...TIME_OPTIONS, draft.end])].sort().map((value) => <option key={value}>{value}</option>)}
                </select>
                <span style={{ minWidth: 34, color: "#7c898e", fontSize: 10, textAlign: "right" }}>{dateSummary}</span>
              </div>
            </label>
          </section>

          <div style={{ color: "#4d5f64", fontSize: 11, fontWeight: 750, marginBottom: 7 }}>模式设置</div>
          <div className="strategy-segment-tabs" style={{ display: "flex", gap: 7, marginBottom: 9 }}>
            {(["基础模式", "覆盖模式", "模式优先级"] as EditorModeTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  minWidth: 84,
                  height: 28,
                  padding: "0 14px",
                  border: `1px solid ${activeTab === tab ? "#2b8d7e" : "#d8e2e3"}`,
                  borderRadius: 5,
                  background: activeTab === tab ? "#eef8f5" : "#fff",
                  color: activeTab === tab ? "#197466" : "#758388",
                  fontSize: 10,
                  fontWeight: activeTab === tab ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "基础模式" && (
            <div className="strategy-segment-mode-layout">
              <div style={modalSubpanel}>
                <div style={modalSubpanelTitle}>基础运行模式</div>
                <div style={{ display: "grid", gap: 7 }}>
                  {EDITOR_BASE_MODES.map((item) => {
                    const selected = draft.mode === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateDraft({ mode: item.value })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minHeight: 48,
                          padding: "8px 10px",
                          border: `1px solid ${selected ? "#3a9385" : "#e0e7e8"}`,
                          borderRadius: 6,
                          background: selected ? "#eef8f5" : "#fff",
                          color: selected ? "#28776c" : "#57676c",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 13, height: 13, border: `1px solid ${selected ? "#277e71" : "#cbd7d9"}`, borderRadius: "50%", background: selected ? "#277e71" : "#fff", boxShadow: selected ? "inset 0 0 0 3px #eef8f5" : "none", flexShrink: 0 }} />
                        <span>
                          <strong style={{ display: "block", fontSize: 10, fontWeight: 700 }}>{item.label}</strong>
                          <span style={{ display: "block", marginTop: 3, color: "#95a1a5", fontSize: 9 }}>{item.detail}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ ...modalSubpanel, padding: "13px 14px 14px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, color: "#26383d", fontSize: 14, lineHeight: 1.25, fontWeight: 800 }}>{activeBaseMode.label}</h3>
                    <div style={{ color: "#7f8f93", fontSize: 9, marginTop: 4 }}>模式内时间</div>
                  </div>
                  <span style={{ color: activeBaseMode.color, background: `${activeBaseMode.color}12`, padding: "4px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                    {draft.weekdays.length ? `应用于${dateSummary}` : "未选择日期"}
                  </span>
                </div>
                <StrategyPeriodGroup
                  label="充电时段"
                  periods={draft.chargePeriods}
                  onChange={(id, patch) => updatePeriod("chargePeriods", id, patch)}
                  onAdd={() => addPeriod("chargePeriods")}
                  onRemove={(id) => removePeriod("chargePeriods", id)}
                />
                <StrategyPeriodGroup
                  label="放电时段"
                  periods={draft.dischargePeriods}
                  onChange={(id, patch) => updatePeriod("dischargePeriods", id, patch)}
                  onAdd={() => addPeriod("dischargePeriods")}
                  onRemove={(id) => removePeriod("dischargePeriods", id)}
                />
              </div>
            </div>
          )}

          {activeTab === "覆盖模式" && (
            <div className="strategy-segment-mode-layout">
              <div style={modalSubpanel}>
                <div style={modalSubpanelTitle}>覆盖运行模式</div>
                <div style={{ display: "grid", gap: 7 }}>
                  {EDITOR_OVERRIDE_MODES.map((item) => {
                    const selected = draft.mode === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => updateDraft({ mode: item.value })}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minHeight: 48,
                          padding: "8px 10px",
                          border: `1px solid ${selected ? "#3a9385" : "#e0e7e8"}`,
                          borderRadius: 6,
                          background: selected ? "#eef8f5" : "#fff",
                          color: selected ? "#28776c" : "#57676c",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 13, height: 13, border: `1px solid ${selected ? "#277e71" : "#cbd7d9"}`, borderRadius: "50%", background: selected ? "#277e71" : "#fff", boxShadow: selected ? "inset 0 0 0 3px #eef8f5" : "none", flexShrink: 0 }} />
                        <span>
                          <strong style={{ display: "block", fontSize: 10, fontWeight: 700 }}>{item.label}</strong>
                          <span style={{ display: "block", marginTop: 3, color: "#95a1a5", fontSize: 9 }}>{item.detail}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ ...modalSubpanel, padding: "13px 14px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <ShieldCheck size={15} color="#0f766e" />
                  <div>
                    <h3 style={{ margin: 0, color: "#26383d", fontSize: 14, fontWeight: 800 }}>{activeOverrideMode.label}</h3>
                    <div style={{ color: "#7f8f93", fontSize: 9, marginTop: 3 }}>{activeOverrideMode.detail}</div>
                  </div>
                </div>
                <div className="strategy-segment-rule-grid">
                  <label style={modalFieldLabel}>
                    触发条件
                    <select
                      value={draft.overrideRule.trigger}
                      onChange={(event) =>
                        updateDraft({
                          overrideRule: {
                            ...draft.overrideRule,
                            trigger: event.target.value as StrategyOverrideRule["trigger"],
                          },
                        })
                      }
                      style={modalSelect}
                    >
                      <option value="power">并网功率超过上限</option>
                      <option value="soc">SOC 低于下限</option>
                      <option value="alarm">站点出现告警</option>
                    </select>
                  </label>
                  <label style={modalFieldLabel}>
                    触发阈值
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <input
                        type="number"
                        min={0}
                        value={draft.overrideRule.threshold}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          updateDraft({
                            overrideRule: {
                              ...draft.overrideRule,
                              threshold: Number.isFinite(nextValue) ? nextValue : 0,
                            },
                          });
                        }}
                        style={{ ...modalNumberInput, flex: 1 }}
                      />
                      <span style={{ color: "#8c999d", fontSize: 9 }}>
                        {draft.overrideRule.trigger === "soc" ? "%" : "kW"}
                      </span>
                    </div>
                  </label>
                  <label style={modalFieldLabel}>
                    接管优先级
                    <select
                      value={draft.overrideRule.priority}
                      onChange={(event) =>
                        updateDraft({
                          overrideRule: {
                            ...draft.overrideRule,
                            priority: event.target.value as StrategyOverrideRule["priority"],
                          },
                        })
                      }
                      style={modalSelect}
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </label>
                </div>
                <div style={{ marginTop: 15, padding: "9px 10px", borderRadius: 6, background: "#f4f8f8", color: "#718084", fontSize: 9, lineHeight: 1.5 }}>
                  覆盖模式仅在触发条件满足时接管基础模式，条件解除后自动恢复当前基础策略。
                </div>
              </div>
            </div>
          )}

          {activeTab === "模式优先级" && (
            <div className="strategy-segment-priority-layout">
              <div style={{ ...modalSubpanel, padding: "13px 14px" }}>
                <div style={modalSubpanelTitle}>模式优先级</div>
                <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                  {draft.priorityModes.map((mode, index) => (
                    <div key={mode} style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 42, padding: "7px 9px", border: "1px solid #e0e7e8", borderRadius: 6, background: index === 0 ? "#eef8f5" : "#fff" }}>
                      <span style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: index === 0 ? "#28776c" : "#eef2f3", color: index === 0 ? "#fff" : "#718084", fontSize: 10, fontWeight: 800 }}>
                        {index + 1}
                      </span>
                      <span style={{ flex: 1, color: "#46575c", fontSize: 10, fontWeight: index === 0 ? 700 : 550 }}>{mode}</span>
                      <button type="button" title="上移" aria-label={`${mode}上移`} onClick={() => movePriority(index, -1)} disabled={index === 0} style={modalIconButton}>
                        <ChevronDown size={13} style={{ transform: "rotate(180deg)" }} />
                      </button>
                      <button type="button" title="下移" aria-label={`${mode}下移`} onClick={() => movePriority(index, 1)} disabled={index === draft.priorityModes.length - 1} style={modalIconButton}>
                        <ChevronDown size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ ...modalSubpanel, padding: "15px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#28776c", fontSize: 11, fontWeight: 750 }}>
                  <Target size={15} /> 优先级说明
                </div>
                <p style={{ margin: "12px 0 0", color: "#6f7e82", fontSize: 10, lineHeight: 1.65 }}>
                  当多个模式在同一时段同时满足执行条件时，系统按照此顺序选择优先级更高的模式。当前生效模式为“{draft.mode}”。
                </p>
                <div style={{ marginTop: 15, padding: "10px 11px", borderRadius: 6, background: "#f4f8f8", color: "#7b898d", fontSize: 9, lineHeight: 1.5 }}>
                  优先级只影响冲突时的选择，不会改变已配置的生效日期和时间范围。
                </div>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, padding: "8px 10px", borderRadius: 6, color: "#a16207", background: "#fffbeb", fontSize: 10, fontWeight: 650 }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}
        </div>

        <footer style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "11px 16px 14px", borderTop: "1px solid #dbe5e6", flexShrink: 0 }}>
          <button type="button" onClick={onCancel} style={modalSecondaryButton}>取消</button>
          <button type="button" onClick={saveDraft} style={modalPrimaryButton}>保存设置</button>
        </footer>
      </div>
    </div>
  );
}

function StrategyAssistantDrawer({
  station,
  preset,
  weekday,
  constraints,
  onClose,
  onApply,
}: {
  station: Station;
  preset: StrategyPreset;
  weekday: Weekday;
  constraints: StrategyConstraints;
  onClose: () => void;
  onApply: (suggestion: StrategyAssistantSuggestion) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [suggestion, setSuggestion] = useState<StrategyAssistantSuggestion | null>(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<StrategyAssistantMessage[]>([
    {
      id: "starter-assistant",
      role: "assistant",
      content: "请描述你的策略目标、生效日期和运行约束。当前可根据这些参数整理配置草案，电价、光伏与负荷预测尚未接入。",
    },
  ]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    promptRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea');
        const first = focusable?.[0];
        const last = focusable?.[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [messages, suggestion]);

  function generateDraft() {
    const content = prompt.trim();
    if (!content) {
      promptRef.current?.focus();
      return;
    }
    let nextSuggestion: StrategyAssistantSuggestion;
    try {
      nextSuggestion = assistantSuggestionFromPrompt(content, weekday, constraints, suggestion ?? undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "草案生成失败，请重试。");
      return;
    }
    setError("");
    setSuggestion(nextSuggestion);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content },
      { id: `assistant-${Date.now() + 1}`, role: "assistant", content: assistantReply(nextSuggestion) },
    ]);
    setPrompt("");
  }

  return (
    <>
      <div
        className="strategy-ai-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      />
      <aside
        ref={drawerRef}
        className="strategy-ai-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="strategy-ai-drawer-title"
      >
        <header className="strategy-ai-drawer__header">
          <div>
            <div className="strategy-ai-drawer__eyebrow">
              <Sparkles size={12} aria-hidden="true" />
              AI策略助手
            </div>
            <h2 id="strategy-ai-drawer-title">对话生成策略方案</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} style={modalCloseButton}>
            <X size={13} /> 关闭
          </button>
        </header>

        <div ref={messagesRef} className="strategy-ai-drawer__body">
          <div className="strategy-ai-drawer__context">
            <div>
              <strong>{station.name}</strong>
              <span> · 当前方案 {preset.name}</span>
            </div>
            <div>权限：仅生成草案，人工确认后才能提交</div>
          </div>

          <div className="strategy-ai-drawer__conversation" role="log" aria-live="polite" aria-label="策略对话">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`strategy-ai-message strategy-ai-message--${message.role}`}
              >
                {message.role === "assistant" && (
                  <div className="strategy-ai-message__author">
                    <Bot size={12} aria-hidden="true" />
                    Enerlution AI
                  </div>
                )}
                <div>{message.content}</div>
              </div>
            ))}
          </div>

          {suggestion && <section className="strategy-ai-suggestion" aria-label="策略草案摘要">
            <div className="strategy-ai-suggestion__title">
              <Sparkles size={13} aria-hidden="true" />
              当前草案预览
            </div>
            <div className="strategy-ai-suggestion__grid">
              <div>
                <span>生效日期</span>
                <strong>{assistantDayLabel(suggestion.draft.weekdays)}</strong>
              </div>
              <div>
                <span>生效时间</span>
                <strong>{suggestion.draft.start}-{suggestion.draft.end}</strong>
              </div>
              <div>
                <span>基础模式</span>
                <strong>{suggestion.draft.mode}</strong>
              </div>
            </div>
            <div className="strategy-ai-suggestion__details">
              <span>充电 {suggestion.draft.chargePeriods[0]?.power ?? 0} kW</span>
              <span>放电 {suggestion.draft.dischargePeriods[0]?.power ?? 0} kW</span>
              <span>并网 ≤ {suggestion.maxImport} kW</span>
              <span>SOC ≥ {suggestion.minSoc}%</span>
            </div>
            <button type="button" disabled={Boolean(error)} onClick={() => onApply(suggestion)} style={assistantApplyButton}>
              带入编辑器
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          </section>}
        </div>

        <footer className="strategy-ai-drawer__footer">
          <form
            className="strategy-ai-drawer__composer"
            onSubmit={(event) => {
              event.preventDefault();
              generateDraft();
            }}
          >
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => { setPrompt(event.target.value); setError(""); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  generateDraft();
                }
              }}
              placeholder="补充目标或约束…"
              aria-label="补充目标或约束"
            />
            <button type="submit" disabled={!prompt.trim()} style={assistantGenerateButton}>
              <Send size={12} aria-hidden="true" />
              生成草案
            </button>
          </form>
          {error && <p className="strategy-ai-drawer__error" role="alert">{error}</p>}
          <div className="strategy-ai-drawer__hint">
            本地规则草案 · AI 服务未连接 · 保存后仍需提交
          </div>
        </footer>
      </aside>
    </>
  );
}

function StrategyEditor({
  station,
  preset,
  presets,
  onChange,
  onCreatePreset,
}: {
  station: Station;
  preset: StrategyPreset;
  presets: StrategyPreset[];
  onChange: (next: StrategyPreset) => void;
  onCreatePreset: () => void;
}) {
  const stationNow = stationDataNow(station);
  const [weekday, setWeekday] = useState<Weekday>(() => currentWeekday(stationNow));
  const [segmentEditor, setSegmentEditor] = useState<{
    originalId: string | null;
    draft: StrategySegmentDraft;
    assistantSuggestion?: StrategyAssistantSuggestion;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [applied, setApplied] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => currentTimeLabel(stationNow));
  const [optimizationGoal, setOptimizationGoal] = useState<OptimizationGoal>(() =>
    stationOptimizationGoal(station),
  );
  const [constraints, setConstraints] = useState<StrategyConstraints>(() =>
    stationStrategyConstraints(station),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);

  const daySegments = useMemo(
    () => preset.segments.filter((segment) => segment.weekday === weekday).sort((a, b) => minutes(a.start) - minutes(b.start)),
    [preset.segments, weekday],
  );
  const currentSegment = daySegments.find(
    (segment) => minutes(currentTime) >= minutes(segment.start) && minutes(currentTime) < minutes(segment.end),
  ) ?? daySegments[0];
  const allScheduleIssue = WEEKDAYS
    .map((item) => findScheduleIssue(preset.segments.filter((segment) => segment.weekday === item)))
    .find(Boolean) ?? "";
  const currentConstraintIssue = constraintIssue(constraints);
  const publishIssue = allScheduleIssue || currentConstraintIssue;
  const nextSegment = nextScheduleSegment(daySegments, currentTime);
  const coverage = scheduleCoverage(daySegments);
  const liveWeekday = currentWeekday(stationNow);
  const isLiveDay = weekday === liveWeekday;
  const simulation = useMemo(() => {
    const baseline = Math.max(
      800,
      Math.round(station.activePower * 5.6 + station.storageCapacity * 1400),
    );
    const goalFactor =
      optimizationGoal === "峰谷套利优先"
        ? 1.12
        : optimizationGoal === "保供优先"
          ? 0.92
          : 1.04;
    const reserveFactor = Math.max(0.78, 1 - constraints.reservePower / 1600);
    const projectedRevenue = Math.round(baseline * goalFactor * reserveFactor);
    const projectedPeakReduction = Math.max(
      0,
      Math.round(constraints.maxImport * (optimizationGoal === "保供优先" ? 0.16 : 0.22)),
    );
    const risk =
      optimizationGoal === "保供优先"
        ? "低"
        : constraints.minSoc < 20 || constraints.maxImport > 1200
          ? "中"
          : "低";
    return { projectedRevenue, projectedPeakReduction, risk };
  }, [constraints, optimizationGoal, station.activePower, station.storageCapacity]);

  useEffect(() => {
    setSegmentEditor(null);
    setNotice("");
    setApplied(true);
    setOptimizationGoal(stationOptimizationGoal(station));
    setConstraints(stationStrategyConstraints(station));
  }, [preset.id, station]);

  useEffect(() => {
    const syncClock = () => {
      const dataNow = stationDataNow(station);
      setCurrentTime(currentTimeLabel(dataNow));
      setWeekday(currentWeekday(dataNow));
    };
    syncClock();
    const timer = window.setInterval(syncClock, 30_000);
    return () => window.clearInterval(timer);
  }, [station]);

  function addSegment() {
    setSegmentEditor({
      originalId: null,
      draft: createStrategyDraft(weekday),
    });
  }

  function openSegmentEditor(segment: StrategySegment) {
    setSegmentEditor({
      originalId: segment.id,
      draft: createStrategyDraft(segment.weekday, segment),
    });
  }

  function deleteSegment(id: string) {
    const target = daySegments.find((segment) => segment.id === id);
    if (!target) return;
    onChange({ ...preset, segments: preset.segments.filter((segment) => segment.id !== id) });
    setSegmentEditor(null);
    setApplied(false);
    setNotice(`${target.start}-${target.end} 时段已删除`);
  }

  function saveSegmentDraft(draft: StrategySegmentDraft) {
    const nextMode = editorModeToStrategyMode(draft.mode);
    const createdAt = Date.now();
    const nextSegments = draft.weekdays.map((day, index) => ({
      id: index === 0 && segmentEditor?.originalId
        ? segmentEditor.originalId
        : `${preset.id}-${day}-${createdAt}-${index}`,
      weekday: day,
      start: draft.start,
      end: draft.end,
      mode: nextMode,
      tags: draftTags(draft),
      chargePeriods: cloneStrategyPeriods(draft.chargePeriods),
      dischargePeriods: cloneStrategyPeriods(draft.dischargePeriods),
      overrideRule: { ...draft.overrideRule },
      priorityModes: [...draft.priorityModes],
    }));
    const preservedSegments = preset.segments.filter((segment) => segment.id !== segmentEditor?.originalId);
    onChange({ ...preset, segments: [...preservedSegments, ...nextSegments] });
    if (segmentEditor?.assistantSuggestion) {
      const { minSoc, maxImport, optimizationGoal: goal } = segmentEditor.assistantSuggestion;
      setConstraints((current) => ({ ...current, minSoc, maxImport }));
      setOptimizationGoal(goal);
    }
    setSegmentEditor(null);
    setApplied(false);

    const issues = draft.weekdays
      .map((day) => findScheduleIssue([
        ...preservedSegments.filter((segment) => segment.weekday === day),
        ...nextSegments.filter((segment) => segment.weekday === day),
      ]))
      .filter(Boolean);
    setNotice(
      issues[0]
        ? `${editingIdLabel(segmentEditor?.originalId)}已保存，${issues[0]}`
        : `${editingIdLabel(segmentEditor?.originalId)}已保存`,
    );
  }

  function saveChanges() {
    if (publishIssue) {
      setNotice(publishIssue);
      return;
    }
    setNotice("修改已保存为草稿");
  }

  function submitChanges() {
    if (publishIssue) {
      setNotice(publishIssue);
      return;
    }
    setApplied(true);
    setNotice("策略已提交并应用到站点");
  }

  function updateConstraint(key: keyof StrategyConstraints, value: string) {
    const nextValue = Number(value);
    setConstraints((current) => ({
      ...current,
      [key]: Number.isFinite(nextValue) ? nextValue : 0,
    }));
    setApplied(false);
    setNotice("");
  }

  function applyAssistantSuggestion(suggestion: StrategyAssistantSuggestion) {
    setAssistantOpen(false);
    setSegmentEditor({
      originalId: null,
      draft: suggestion.draft,
      assistantSuggestion: suggestion,
    });
  }

  function copyDayToWeekdays(targetDays: Weekday[]) {
    const sourceSegments = daySegments.map((segment) => ({ ...segment }));
    const nextSegments = preset.segments.filter((segment) => !targetDays.includes(segment.weekday));
    targetDays.forEach((targetDay) => {
      sourceSegments.forEach((segment) => {
        nextSegments.push({
          ...segment,
          id: `${targetDay}-${segment.id.split("-").slice(1).join("-")}`,
          weekday: targetDay,
        });
      });
    });
    onChange({ ...preset, segments: nextSegments });
    setApplied(false);
    setNotice(`已将${weekday}时段复制到${targetDays.join("、")}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: "#fff" }}>
      <div className="station-strategy-page" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 20px 22px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#61716b", fontSize: 11, marginBottom: 4 }}>
                <span>{station.name}</span>
                <span>UTC+8</span>
                <span>{isLiveDay ? "今日执行日" : `正在查看 ${weekday}`}</span>
              </div>
              <h1 style={{ margin: 0, color: "#17262c", fontSize: 19, lineHeight: 1.25, fontWeight: 800 }}>运行策略</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <StatusPill color={applied ? "#047857" : "#b45309"} background={applied ? "#ecfdf5" : "#fffbeb"}>
                {applied ? <CircleCheck size={12} /> : <AlertTriangle size={12} />}
                {strategyStatusText(applied)}
              </StatusPill>
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                style={{
                  ...secondaryButton,
                  color: "#0f766e",
                  borderColor: "#b9d7d2",
                  background: "#f0fdf9",
                }}
              >
                <Sparkles size={13} /> AI辅助配置
              </button>
              <button type="button" onClick={() => setHistoryOpen((open) => !open)} style={secondaryButton} aria-expanded={historyOpen}>
                <History size={13} /> 发布记录
              </button>
              <button type="button" onClick={saveChanges} style={secondaryButton}>
                <Save size={13} /> 保存草稿
              </button>
              <button type="button" onClick={submitChanges} style={primaryButton}>
                <UploadCloud size={13} /> 提交并应用
              </button>
            </div>
          </div>

          {historyOpen && (
            <div style={{ ...card, padding: "12px 15px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#24423b", fontSize: 11, fontWeight: 700 }}>
                <History size={14} color="#61716b" /> 发布记录
              </div>
              {[
                { version: preset.version ?? "V1", time: preset.updatedAt ?? "未发布", status: "当前生效", color: "#047857" },
                { version: "V2", time: "08-22 11:06", status: "已归档", color: "#61716b" },
                { version: "V1", time: "07-18 09:42", status: "已归档", color: "#61716b" },
              ].map((item) => (
                <div key={`${item.version}-${item.time}`} style={{ display: "flex", alignItems: "center", gap: 9, paddingRight: 18, borderRight: "1px solid #eef2f6" }}>
                  <span style={{ color: item.color, fontSize: 11, fontWeight: 750 }}>{item.version}</span>
                  <span style={{ color: "#76857f", fontSize: 10 }}>{item.time}</span>
                  <span style={{ color: item.color, fontSize: 10, fontWeight: 600 }}>{item.status}</span>
                </div>
              ))}
              <span style={{ color: "#76857f", fontSize: 10 }}>仅提交并应用后生成新版本</span>
            </div>
          )}

          <section className="station-strategy-hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div style={{ ...card, padding: "15px 16px 12px", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#0f766e", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                    <Play size={13} /> 当前生效策略
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, color: "#17262c", fontSize: 20, lineHeight: 1.2, fontWeight: 800 }}>
                      {preset.name}
                    </h2>
                    <span style={{ color: "#61716b", fontSize: 10 }}>
                      {preset.version ?? "未发布"} · 最近发布 {preset.updatedAt ?? "未发布"}
                    </span>
                  </div>
                  <div style={{ color: "#61716b", fontSize: 10, marginTop: 5 }}>
                    {preset.description} · 负责人 {preset.owner ?? "系统"}
                  </div>
                </div>
                <StatusPill color={publishIssue ? "#b45309" : "#047857"} background={publishIssue ? "#fffbeb" : "#ecfdf5"}>
                  {publishIssue ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                  {publishIssue ? "待处理校验" : "可发布"}
                </StatusPill>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
                <StrategyMetric icon={Activity} label="当前模式" value={currentSegment?.mode ?? "默认"} detail={currentSegment ? `${currentSegment.start}-${currentSegment.end}` : "未配置时段"} color="#0f766e" />
                <StrategyMetric icon={TimerReset} label="下一切换" value={nextSegment?.start ?? "--:--"} detail={nextSegment ? nextSegment.mode : "无后续时段"} color="#176b5d" />
                <StrategyMetric icon={Layers3} label="日程覆盖" value={`${coverage}%`} detail={`${daySegments.length} 个显式时段`} color="#7c3aed" />
                <StrategyMetric icon={Wifi} label="下发链路" value={station.dataStatus === "connected" ? "在线" : "待核验"} detail={station.updateTime || "等待更新"} color={station.dataStatus === "connected" ? "#047857" : "#b45309"} />
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
                {WEEKDAYS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setWeekday(item)}
                    style={{
                      flexShrink: 0,
                      minWidth: 46,
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: `1px solid ${weekday === item ? "#0f766e" : "#dbe3ec"}`,
                      background: weekday === item ? "#ecfdf5" : "#fff",
                      color: weekday === item ? "#0f766e" : "#61716b",
                      fontSize: 10,
                      fontWeight: weekday === item ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                <span style={{ color: "#24423b", fontSize: 12, fontWeight: 700 }}>24 小时运行模式</span>
                <span style={{ color: "#76857f", fontSize: 10 }}>时段颜色对应基础模式，竖线为当前时间</span>
              </div>
              <SegmentTimeline segments={daySegments} currentTime={currentTime} />
            </div>

            <div className="station-strategy-config-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
              <div style={{ ...card, padding: 15 }}>
                <PanelTitle icon={Target} title="优化目标" detail="影响策略解释与发布校验" />
                <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
                  {OPTIMIZATION_GOALS.map((goal) => (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => {
                        setOptimizationGoal(goal.value);
                        setApplied(false);
                        setNotice("");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 9px",
                        borderRadius: 7,
                        border: `1px solid ${optimizationGoal === goal.value ? goal.color : "#dbe3ec"}`,
                        background: optimizationGoal === goal.value ? `${goal.color}12` : "#fff",
                        color: "#24423b",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>
                        <strong style={{ display: "block", fontSize: 11, color: optimizationGoal === goal.value ? goal.color : "#24423b" }}>{goal.label}</strong>
                        <span style={{ display: "block", marginTop: 2, color: "#76857f", fontSize: 9 }}>{goal.detail}</span>
                      </span>
                      {optimizationGoal === goal.value && <Check size={13} color={goal.color} />}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...card, padding: 15 }}>
                <PanelTitle icon={SlidersHorizontal} title="运行约束" detail="发布前参与校验" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
                  <ConstraintInput label="SOC 下限" unit="%" value={constraints.minSoc} onChange={(value) => updateConstraint("minSoc", value)} />
                  <ConstraintInput label="SOC 上限" unit="%" value={constraints.maxSoc} onChange={(value) => updateConstraint("maxSoc", value)} />
                  <ConstraintInput label="并网上限" unit="kW" value={constraints.maxImport} onChange={(value) => updateConstraint("maxImport", value)} />
                  <ConstraintInput label="备用功率" unit="kW" value={constraints.reservePower} onChange={(value) => updateConstraint("reservePower", value)} />
                </div>
              </div>

              <div style={{ ...card, padding: 15 }}>
                <PanelTitle icon={ShieldCheck} title="发布准备度" detail="策略下发前检查" />
                <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
                  <CheckItem ok={!allScheduleIssue} label="时段无重叠" detail={allScheduleIssue || "七天日程均通过"} />
                  <CheckItem ok={!currentConstraintIssue} label="约束范围有效" detail={currentConstraintIssue || "SOC 与功率约束有效"} />
                  <CheckItem ok={station.dataStatus === "connected"} label="站点链路在线" detail={station.dataStatus === "connected" ? "可直接下发" : "下发前需要确认链路"} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, color: publishIssue ? "#b45309" : "#047857", fontSize: 10, fontWeight: 600 }}>
                  {publishIssue ? <AlertTriangle size={13} /> : <CircleCheck size={13} />}
                  {publishIssue || "当前方案可提交并应用"}
                </div>
              </div>
            </div>
          </section>

          <section className="station-strategy-work-grid" style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 12 }}>
            <aside style={{ ...card, padding: 12, alignSelf: "start" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <PanelTitle icon={CalendarClock} title="策略方案" detail="版本与预设" />
                <button type="button" title="新建方案" aria-label="新建方案" onClick={onCreatePreset} style={iconButton}>
                  <Plus size={15} color="#465b53" />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {presets.map((item) => {
                  const active = item.id === preset.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onChange(item);
                        setSegmentEditor(null);
                        setApplied(true);
                        setNotice("");
                      }}
                      style={{
                        textAlign: "left",
                        padding: "10px 9px",
                        borderRadius: 8,
                        border: `1px solid ${active ? "#0f766e" : "#dbe3ec"}`,
                        background: active ? "#ecfdf5" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ color: active ? "#0f766e" : "#24423b", fontSize: 11 }}>{item.name}</strong>
                        <span style={{ color: "#76857f", fontSize: 9 }}>{item.version ?? "V1"}</span>
                      </div>
                      <div style={{ color: "#61716b", fontSize: 9, lineHeight: 1.45, marginTop: 4 }}>{item.description}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#76857f", fontSize: 9, marginTop: 7 }}>
                        <span>{item.owner ?? "系统"}</span>
                        <span>{item.updatedAt ?? "未发布"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div style={{ ...card, padding: "14px 14px 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <div>
                  <PanelTitle icon={Layers3} title={`${preset.name} · ${weekday}`} detail="编辑仅保存草稿，提交后才会下发" />
                  <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => copyDayToWeekdays(WEEKDAYS.filter((item) => item !== weekday))} style={compactButton}>
                      <Copy size={12} /> 复制到全周
                    </button>
                    <button type="button" onClick={() => copyDayToWeekdays(WEEKDAYS.filter((item) => item !== weekday && item !== "周六" && item !== "周日"))} style={compactButton}>
                      <Copy size={12} /> 复制到工作日
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSimulationOpen(true);
                        setNotice(`已按${optimizationGoal}和当前约束完成一次策略预估`);
                      }}
                      style={compactButton}
                    >
                      <RefreshCw size={12} /> 重新计算
                    </button>
                  </div>
                </div>
                <button type="button" onClick={addSegment} style={primaryButton}>
                  <Plus size={13} /> 新增时段
                </button>
              </div>

              {notice && (
                <div
                  role="status"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    marginBottom: 9,
                    padding: "7px 9px",
                    borderRadius: 6,
                    color: /删除|重叠|结束时间|必须|需要/.test(notice) ? "#b45309" : "#047857",
                    background: /删除|重叠|结束时间|必须|需要/.test(notice) ? "#fffbeb" : "#ecfdf5",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {/删除|重叠|结束时间|必须|需要/.test(notice) ? <AlertTriangle size={13} /> : <Check size={13} />} {notice}
                </div>
              )}

              <div style={{ overflowX: "auto", flex: 1 }}>
                <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "#f4f8f5", borderTop: "1px solid #eef2f6", borderBottom: "1px solid #eef2f6" }}>
                      {[
                        ["星期", "11%"],
                        ["时间", "17%"],
                        ["基础模式", "18%"],
                        ["优先级 / 约束", "31%"],
                        ["执行说明", "15%"],
                        ["操作", "8%"],
                      ].map(([label, width]) => (
                        <th key={label} style={{ width, padding: "8px 10px", textAlign: "left", color: "#61716b", fontSize: 10, fontWeight: 700 }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #e8f0eb", background: "#fbfdff" }}>
                      <td style={tableCell}>默认</td>
                      <td style={{ ...tableCell, color: "#76857f" }}>未配置时段</td>
                      <td style={tableCell}>
                        <ModeTag mode="自发自用" />
                      </td>
                      <td style={{ ...tableCell, color: "#61716b" }}>① 需量控制 ② 备用保障</td>
                      <td style={{ ...tableCell, color: "#76857f" }}>兜底策略</td>
                      <td style={tableCell}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                          <LockKeyhole size={13} color="#76857f" />
                        </div>
                      </td>
                    </tr>
                    {daySegments.map((segment) => {
                      const duration = minutes(segment.end) - minutes(segment.start);
                      return (
                        <tr key={segment.id} style={{ borderBottom: "1px solid #e8f0eb", background: "#fff" }}>
                          <td style={tableCell}>{segment.weekday}</td>
                          <td style={{ ...tableCell, fontFamily: "'Roboto Mono', monospace", color: "#24423b" }}>
                            {timeLabel(segment.start)}-{timeLabel(segment.end)}
                          </td>
                          <td style={tableCell}>
                            <ModeTag mode={segment.mode} />
                          </td>
                          <td style={{ ...tableCell, color: "#465b53" }}>
                            {segment.tags.map((tag, index) => (
                              <span key={`${segment.id}-${tag}`}>
                                {index > 0 ? "  " : ""} {index + 1} {tag}
                              </span>
                            ))}
                          </td>
                          <td style={{ ...tableCell, color: "#61716b" }}>{formatDuration(duration)}</td>
                          <td style={tableCell}>
                            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                              <button type="button" title="查看时段" aria-label="查看时段" onClick={() => openSegmentEditor(segment)} style={iconButton}>
                                <ChevronRight size={14} color="#61716b" />
                              </button>
                              <button type="button" title="编辑时段" aria-label="编辑时段" onClick={() => openSegmentEditor(segment)} style={iconButton}>
                                <Pencil size={13} color="#61716b" />
                              </button>
                              <button type="button" title="删除时段" aria-label="删除时段" onClick={() => deleteSegment(segment.id)} style={iconButton}>
                                <Trash2 size={13} color="#61716b" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: "auto", padding: "11px 0 12px", color: publishIssue ? "#b45309" : "#047857", fontSize: 10, fontWeight: 600 }}>
                {publishIssue ? <AlertTriangle size={13} /> : <CircleCheck size={13} />}
                {publishIssue || "无时间段冲突 · 约束有效 · 可提交下发"}
              </div>
              {simulationOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: "0 0 12px" }}>
                  <SimulationMetric label="预估日收益" value={`¥ ${simulation.projectedRevenue.toLocaleString()}`} color="#0f766e" />
                  <SimulationMetric label="需量削减" value={`${simulation.projectedPeakReduction} kW`} color="#176b5d" />
                  <SimulationMetric label="运行风险" value={simulation.risk} color={simulation.risk === "低" ? "#047857" : "#b45309"} />
                </div>
              )}
            </div>
          </section>

          <section className="station-strategy-bottom-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12 }}>
            <div style={{ ...card, padding: 15 }}>
              <PanelTitle icon={Bot} title="策略解释" detail="说明调度为何这样执行" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 9, marginTop: 13 }}>
                <ExplanationItem icon={TrendingUp} label="收益目标" value={optimizationGoal} detail="优先级影响峰谷套利与备用保留" color="#0f766e" />
                <ExplanationItem icon={Gauge} label="功率边界" value={`${constraints.maxImport} kW`} detail="并网功率超过阈值时触发需量控制" color="#176b5d" />
                <ExplanationItem icon={ShieldCheck} label="SOC 保护" value={`${constraints.minSoc}-${constraints.maxSoc}%`} detail="低于下限时禁止继续放电" color="#7c3aed" />
              </div>
            </div>
            <div style={{ ...card, padding: 15 }}>
              <PanelTitle icon={Link2} title="接入与版本" detail="后续对接真实 EMS 数据" />
              <div style={{ display: "grid", gap: 10, marginTop: 13 }}>
                <CheckItem ok label="策略版本" detail={`${preset.version ?? "V1"} · ${preset.updatedAt ?? "未发布"}`} />
                <CheckItem ok={station.dataStatus === "connected"} label="数据链路" detail={station.updateSub || "实时同步"} />
                <CheckItem ok={!publishIssue} label="发布校验" detail={publishIssue || "校验通过"} />
              </div>
            </div>
          </section>
        </div>
      </div>
      {segmentEditor && (
        <StrategySegmentModal
          initialDraft={segmentEditor.draft}
          assistantSuggestion={segmentEditor.assistantSuggestion}
          editing={Boolean(segmentEditor.originalId)}
          onCancel={() => setSegmentEditor(null)}
          onSave={saveSegmentDraft}
        />
      )}
      {assistantOpen && (
        <StrategyAssistantDrawer
          station={station}
          preset={preset}
          weekday={weekday}
          constraints={constraints}
          onClose={closeAssistant}
          onApply={applyAssistantSuggestion}
        />
      )}
    </div>
  );
}

function StatusPill({
  children,
  color,
  background,
}: {
  children: React.ReactNode;
  color: string;
  background: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 8px",
        borderRadius: 6,
        color,
        background,
        fontSize: 10,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Activity;
  title: string;
  detail: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <Icon size={14} color="#0f766e" />
      <strong style={{ color: "#1d2f2a", fontSize: 12 }}>{title}</strong>
      <span style={{ color: "#76857f", fontSize: 10 }}>{detail}</span>
    </div>
  );
}

function StrategyMetric({
  icon: Icon,
  label,
  value,
  detail,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div style={{ minWidth: 0, padding: "9px 10px", borderRadius: 7, background: "#f4f8f5" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#61716b", fontSize: 9 }}>
        <Icon size={12} color={color} />
        {label}
      </div>
      <div style={{ color, fontSize: 13, fontWeight: 800, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
      <div style={{ color: "#76857f", fontSize: 9, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {detail}
      </div>
    </div>
  );
}

function ConstraintInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, color: "#61716b", fontSize: 10 }}>
      <span>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          value={value}
          min={0}
          onChange={(event) => onChange(event.target.value)}
          style={{
            width: 62,
            height: 26,
            padding: "0 6px",
            border: "1px solid #dbe3ec",
            borderRadius: 5,
            background: "#fff",
            color: "#24423b",
            fontSize: 11,
            fontFamily: "'Roboto Mono', monospace",
            outline: "none",
          }}
        />
        <span style={{ color: "#76857f", fontSize: 9 }}>{unit}</span>
      </span>
    </label>
  );
}

function CheckItem({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
      {ok ? <CircleCheck size={13} color="#059669" /> : <AlertTriangle size={13} color="#d97706" />}
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#24423b", fontSize: 10, fontWeight: 650 }}>{label}</div>
        <div style={{ color: ok ? "#76857f" : "#b45309", fontSize: 9, lineHeight: 1.45, marginTop: 2 }}>{detail}</div>
      </div>
    </div>
  );
}

function ModeTag({ mode }: { mode: StrategyMode }) {
  const meta = modeMeta(mode);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 6px",
        borderRadius: 4,
        color: meta.color,
        background: meta.background,
        fontSize: 10,
        fontWeight: 650,
        whiteSpace: "nowrap",
      }}
    >
      {mode}
    </span>
  );
}

function ExplanationItem({
  icon: Icon,
  label,
  value,
  detail,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 10px", borderRadius: 7, background: "#f4f8f5" }}>
      <Icon size={14} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#76857f", fontSize: 9 }}>{label}</div>
        <div style={{ color, fontSize: 12, fontWeight: 750, marginTop: 4 }}>{value}</div>
        <div style={{ color: "#76857f", fontSize: 9, lineHeight: 1.45, marginTop: 3 }}>{detail}</div>
      </div>
    </div>
  );
}

function SimulationMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 7, background: "#f4f8f5" }}>
      <div style={{ color: "#76857f", fontSize: 9 }}>{label}</div>
      <div style={{ color, fontSize: 12, fontWeight: 750, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #d8e3dc",
  borderRadius: 9,
} as const;

const tableCell = {
  padding: "9px 10px",
  color: "#4a5b61",
  fontSize: 10,
  verticalAlign: "middle",
} as const;

const iconButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 2,
  border: "none",
  background: "transparent",
  cursor: "pointer",
} as const;

const strategyModalOverlay = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 8,
  overflow: "auto",
  background: "rgba(15, 23, 42, 0.36)",
} as const;

const strategyModalPanel = {
  width: "min(1000px, calc(100vw - 16px))",
  height: "auto",
  maxHeight: "min(680px, calc(100vh - 16px))",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "#f4f8f5",
  border: "1px solid #cfdcdd",
  borderRadius: 8,
  boxShadow: "0 4px 8px rgba(15, 23, 42, 0.16)",
} as const;

const modalSection = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(300px, 0.95fr)",
  gap: 16,
  padding: "11px 12px",
  background: "#fff",
  border: "1px solid #dce6e7",
  borderRadius: 7,
} as const;

const modalSubpanel = {
  padding: 10,
  background: "#fff",
  border: "1px solid #dce6e7",
  borderRadius: 7,
} as const;

const modalSubpanelTitle = {
  color: "#53656a",
  fontSize: 10,
  fontWeight: 750,
  marginBottom: 8,
} as const;

const modalLabel = {
  display: "block",
  color: "#718084",
  fontSize: 9,
  fontWeight: 650,
} as const;

const modalFieldLabel = {
  display: "grid",
  gap: 5,
  color: "#718084",
  fontSize: 9,
  fontWeight: 650,
} as const;

const modalSelect = {
  minWidth: 0,
  height: 28,
  padding: "0 7px",
  border: "1px solid #d5e0e1",
  borderRadius: 5,
  background: "#fff",
  color: "#42545a",
  fontSize: 10,
  outline: "none",
} as const;

const modalNumberInput = {
  width: 72,
  height: 28,
  padding: "0 7px",
  border: "1px solid #d5e0e1",
  borderRadius: 5,
  background: "#fff",
  color: "#42545a",
  fontSize: 10,
  fontFamily: "'Roboto Mono', monospace",
  outline: "none",
} as const;

const modalIconButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  padding: 0,
  border: "1px solid #b9d7d2",
  borderRadius: 5,
  background: "#fff",
  color: "#28776c",
  cursor: "pointer",
} as const;

const modalCloseButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: 26,
  padding: "0 10px",
  border: "1px solid #d8e2e3",
  borderRadius: 5,
  background: "#fff",
  color: "#53656a",
  fontSize: 10,
  cursor: "pointer",
} as const;

const modalSecondaryButton = {
  minWidth: 72,
  height: 30,
  padding: "0 14px",
  border: "1px solid #d8e2e3",
  borderRadius: 6,
  background: "#fff",
  color: "#53656a",
  fontSize: 10,
  fontWeight: 650,
  cursor: "pointer",
} as const;

const modalPrimaryButton = {
  minWidth: 82,
  height: 30,
  padding: "0 14px",
  border: "1px solid #116c59",
  borderRadius: 6,
  background: "#116c59",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const assistantApplyButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  minHeight: 30,
  padding: "0 11px",
  border: "1px solid #b9d7d2",
  borderRadius: 5,
  background: "#eef8f5",
  color: "#176b5e",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const assistantGenerateButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  minWidth: 86,
  height: 34,
  padding: "0 10px",
  border: "1px solid #116c59",
  borderRadius: 6,
  background: "#116c59",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const secondaryButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 13px",
  border: "1px solid #d9e2e4",
  borderRadius: 6,
  background: "#fff",
  color: "#53666c",
  fontSize: 10,
  fontWeight: 650,
  cursor: "pointer",
} as const;

const compactButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 8px",
  border: "1px solid #dbe3ec",
  borderRadius: 5,
  background: "#fff",
  color: "#61716b",
  fontSize: 9,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const primaryButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 13px",
  border: "1px solid #116c59",
  borderRadius: 6,
  background: "#116c59",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
} as const;

function DemoStationStrategyPage({ station }: { station: Station }) {
  const [presets, setPresets] = useState(() => buildStationPresets(station));
  const [activePresetId, setActivePresetId] = useState(
    () => buildStationPresets(station)[0]?.id ?? "",
  );
  const activePreset = presets.find((preset) => preset.id === activePresetId) ?? presets[0];

  function createPreset() {
    const nextPreset: StrategyPreset = {
      id: `custom-${Date.now()}`,
      name: `自定义方案 ${presets.length + 1}`,
      description: "新建策略方案，按站点需求配置",
      segments: cloneSegments(),
    };
    setPresets((current) => [...current, nextPreset]);
    setActivePresetId(nextPreset.id);
  }

  return (
    <StrategyEditor
      station={station}
      preset={activePreset}
      presets={presets}
      onCreatePreset={createPreset}
      onChange={(next) => {
        setPresets((current) => current.map((preset) => (preset.id === next.id ? next : preset)));
        setActivePresetId(next.id);
      }}
    />
  );
}

function ApiStationStrategyPage({station}: {station: Station}) {
  const {user} = useAuth();
  const canRead = Boolean(user?.permissions.includes('strategy.read'));
  const canManage = Boolean(user?.permissions.includes('strategy.manage'));
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Shanghai'}));
  const [kind, setKind] = useState<'dayAhead'|'intraday'>('dayAhead');
  const [plans, setPlans] = useState<ApiRow[]>([]);
  const [selected, setSelected] = useState('');
  const [periods, setPeriods] = useState<PlanPeriod[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const current = plans.find(plan => String(plan.id) === selected);
  const choose = (plan?: ApiRow) => {
    setSelected(plan ? String(plan.id) : '');
    setPeriods(planPeriods((plan?.periods ?? []) as ApiRow[]));
    setKind(plan?.kind === 'intraday' ? 'intraday' : 'dayAhead'); setDirty(false);
  };
  useEffect(() => {
    const controller = new AbortController(); setPlans([]); choose();
    if (!canRead) {setNotice('当前账号无策略读取权限'); return}
    setBusy(true);
    api<ApiRow[]>(`/stations/${station.id}/plans?date=${date}`, {signal:controller.signal})
      .then(rows => {if (!controller.signal.aborted) {setPlans(rows); choose(rows[0])}})
      .catch(error => {if (!controller.signal.aborted) setNotice(error.message)})
      .finally(() => {if (!controller.signal.aborted) setBusy(false)});
    return () => controller.abort();
  }, [station.id, date, canRead, revision]);
  const change = (id: string, patch: Partial<PlanPeriod>) => {setPeriods(rows => rows.map(row => row.id === id ? {...row,...patch} : row)); setDirty(true)};
  async function savePlan() {
    if (busy || !canManage) return;
    setBusy(true); setNotice('');
    try {
      const payload = validatePlan(periods, station.ratedPower);
      const result = await send<{id:number;version:number}>('/plans', 'POST', {stationId:Number(station.id),date,kind,periods:payload});
      setNotice(`草稿版本 ${result.version} 已保存至服务器；尚未审批或执行`); setRevision(v => v+1);
    } catch(error) {setNotice(error instanceof Error ? error.message : '保存失败')}
    finally {setBusy(false)}
  }
  async function submitPlan() {
    if (busy || !canManage || dirty || current?.status !== 'draft') return;
    setBusy(true); setNotice('');
    try {await send(`/plans/${selected}/submit`, 'POST'); setNotice('已提交内部审批；未向 EMS 下发，未执行'); setRevision(v => v+1)}
    catch(error) {setNotice(error instanceof Error ? error.message : '提交失败')}
    finally {setBusy(false)}
  }
  const labels: Record<string,string> = {draft:'服务器草稿',submitted:'待内部审批',approved:'已审批（未表示执行）',rejected:'审批驳回'};
  const timeline: StrategySegment[] = periods.map(p => ({id:p.id,weekday:'周一',start:p.start,end:p.end,mode:p.mode === 'standby' ? '备用保障' : '峰谷套利',tags:[p.mode === 'charge' ? '充电计划' : p.mode === 'discharge' ? '放电计划' : '待机计划']}));
  return <div className="station-strategy-page" style={{flex:1,minHeight:0,overflow:'auto',padding:'14px 20px 22px',background:'#fff'}}><div style={{maxWidth:1440,margin:'0 auto',display:'flex',flexDirection:'column',gap:12}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><p style={{color:'#61716b',fontSize:11}}>{station.name} · UTC+8 · 内部计划</p><h1 style={{fontSize:19,fontWeight:800}}>运行策略</h1></div><div style={{display:'flex',gap:8}}>
      <button style={secondaryButton} disabled={!canManage || busy} onClick={() => {choose(); setNotice('新版本草稿尚未保存')}}>新建空白计划</button>
      <button style={secondaryButton} disabled={!canManage || busy || !periods.length} onClick={savePlan}><Save size={13}/>保存新版本草稿</button>
      <button style={primaryButton} disabled={!canManage || busy || dirty || current?.status !== 'draft'} onClick={submitPlan}><Send size={13}/>提交内部审批</button>
    </div></header>
    <p style={{fontSize:12,color:'#61716b'}}>保存会创建新版本，不覆盖历史版本。审批通过不表示设备执行。AI优化、约束下发、仿真和 EMS 执行暂未接入。</p>
    <div role="status" style={{color:'#9a5b1a'}}>{busy ? '正在与服务器同步…' : notice}</div>
    <section style={{...card,padding:16}}><div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
      <label>计划日期 <input aria-label="策略计划日期" type="date" value={date} disabled={busy} onChange={e => {setDate(e.target.value);setNotice('')}}/></label>
      <label>版本 <select aria-label="策略版本" value={selected} disabled={busy} onChange={e => choose(plans.find(p => String(p.id) === e.target.value))}><option value="">未保存草稿</option>{plans.map(p => <option key={String(p.id)} value={String(p.id)}>V{String(p.version)} · {labels[String(p.status)] || String(p.status)}</option>)}</select></label>
      <label>计划类型 <select aria-label="策略计划类型" value={kind} disabled={!canManage || busy} onChange={e => {setKind(e.target.value as 'dayAhead'|'intraday');setDirty(true)}}><option value="dayAhead">日前计划</option><option value="intraday">日内计划</option></select></label>
      <span>{current ? labels[String(current.status)] : '未保存'}{dirty ? ' · 有未保存修改' : ''}</span>
    </div><div style={{marginTop:16}}><SegmentTimeline segments={timeline} currentTime="unknown"/></div>{!periods.length && <p>该日期暂无计划时段。不会自动生成演示计划。</p>}</section>
    <section style={{...card,padding:16}}><div style={{display:'flex',justifyContent:'space-between'}}><h2>日计划时段</h2><button style={secondaryButton} disabled={!canManage || busy} onClick={() => {setPeriods(rows => [...rows,{id:`draft-${Date.now()}`,start:'00:00',end:'01:00',mode:'standby',power:0}]);setDirty(true)}}><Plus size={13}/>新增时段</button></div>
      <fieldset disabled={!canManage || busy} style={{border:0,padding:0}}><table style={{width:'100%',marginTop:16}}><thead><tr><th>开始时间</th><th>结束时间</th><th>模式</th><th>计划功率 kW</th><th>操作</th></tr></thead><tbody>{periods.map(p => <tr key={p.id}>
        <td><input aria-label="计划开始时间" value={p.start} onChange={e => change(p.id,{start:e.target.value})}/></td><td><input aria-label="计划结束时间" value={p.end} onChange={e => change(p.id,{end:e.target.value})}/></td>
        <td><select aria-label="计划时段模式" value={p.mode} onChange={e => change(p.id,{mode:e.target.value as PlanPeriod['mode']})}><option value="charge">充电</option><option value="discharge">放电</option><option value="standby">待机</option></select></td>
        <td><input aria-label="计划功率" type="number" min="0" max={station.ratedPower} value={p.power} onChange={e => change(p.id,{power:Number(e.target.value)})}/></td><td><button style={secondaryButton} onClick={() => {setPeriods(rows => rows.filter(row => row.id !== p.id));setDirty(true)}}>删除</button></td>
      </tr>)}</tbody></table></fieldset></section>
  </div></div>;
}
export default function StationStrategyPage({station}: {station:Station}) {
  return DEMO_MODE ? <DemoStationStrategyPage station={station}/> : <ApiStationStrategyPage key={station.id} station={station}/>;
}
