export const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const bases = [
  "峰谷套利",
  "动态电价优化",
  "光伏自发自用",
  "新能源平滑",
] as const;
export const overlays = [
  "需量控制",
  "容量保护",
  "备电保障",
  "一次调频",
  "VPP",
  "AGC",
  "调峰",
  "AVC",
] as const;
export type Base = (typeof bases)[number];
export type Overlay = (typeof overlays)[number];
export type Mode = Base | Overlay;
export type Field = {
  key: string;
  label: string;
  initial: string;
  unit?: string;
  min?: number;
  max?: number;
  options?: string[];
  readonly?: boolean;
};
export const fields: Record<Mode, Field[]> = {
  峰谷套利: [],
  动态电价优化: [
    {
      key: "source",
      label: "电价来源",
      initial: "本地预测电价",
      options: ["本地预测电价", "站点电价"],
    },
    {
      key: "cycle",
      label: "优化周期",
      initial: "24",
      unit: "小时",
      min: 1,
      max: 168,
    },
    {
      key: "frequency",
      label: "更新频率",
      initial: "15",
      unit: "分钟",
      min: 1,
      max: 1440,
    },
    {
      key: "goal",
      label: "优化目标",
      initial: "最低综合用电成本",
      options: ["最低综合用电成本", "最大套利收益"],
    },
  ],
  光伏自发自用: [
    {
      key: "surplus",
      label: "光伏余量充电",
      initial: "自动",
      options: ["自动", "关闭"],
    },
    {
      key: "grid",
      label: "电网充电",
      initial: "不允许",
      options: ["不允许", "允许"],
    },
    {
      key: "target",
      label: "并网点目标功率",
      initial: "0",
      unit: "kW",
      min: 0,
    },
    {
      key: "reserve",
      label: "最低保留电量",
      initial: "20",
      unit: "%",
      min: 0,
      max: 100,
    },
  ],
  新能源平滑: [
    {
      key: "algorithm",
      label: "平滑算法",
      initial: "移动平均",
      options: ["移动平均", "低通滤波"],
    },
    {
      key: "window",
      label: "平滑窗口",
      initial: "10",
      unit: "分钟",
      min: 1,
      max: 1440,
    },
    {
      key: "fluctuation",
      label: "允许波动率",
      initial: "5",
      unit: "%",
      min: 0,
      max: 100,
    },
    { key: "power", label: "最大补偿功率", initial: "0", unit: "kW", min: 0 },
  ],
  需量控制: [
    { key: "target", label: "目标需量", initial: "800", unit: "kW", min: 0 },
    { key: "recovery", label: "恢复阈值", initial: "760", unit: "kW", min: 0 },
  ],
  容量保护: [
    {
      key: "capacity",
      label: "变压器容量",
      initial: "1000",
      unit: "kVA",
      min: 1,
    },
    {
      key: "trigger",
      label: "触发负载率",
      initial: "90",
      unit: "%",
      min: 0,
      max: 100,
    },
    {
      key: "recovery",
      label: "恢复负载率",
      initial: "85",
      unit: "%",
      min: 0,
      max: 100,
    },
    { key: "power", label: "最大放电功率", initial: "0", unit: "kW", min: 0 },
  ],
  备电保障: [
    {
      key: "soc",
      label: "备电SOC",
      initial: "70",
      unit: "%",
      min: 0,
      max: 100,
    },
    {
      key: "load",
      label: "供电对象",
      initial: "关键负载",
      options: ["关键负载", "全站负载"],
    },
    {
      key: "switch",
      label: "切换方式",
      initial: "自动",
      options: ["自动", "手动"],
    },
    {
      key: "delay",
      label: "恢复并网延时",
      initial: "60",
      unit: "秒",
      min: 0,
      max: 3600,
    },
  ],
  一次调频: [
    {
      key: "frequency",
      label: "额定频率",
      initial: "50",
      unit: "Hz",
      min: 45,
      max: 65,
    },
    {
      key: "deadband",
      label: "频率死区",
      initial: "0.05",
      unit: "Hz",
      min: 0,
      max: 5,
    },
    {
      key: "droop",
      label: "调差系数",
      initial: "4",
      unit: "%",
      min: 0.1,
      max: 100,
    },
    { key: "power", label: "最大响应功率", initial: "0", unit: "kW", min: 0 },
  ],
  VPP: [
    { key: "connection", label: "接入状态", initial: "未接入", readonly: true },
    { key: "power", label: "调度功率上限", initial: "0", unit: "kW", min: 0 },
    {
      key: "response",
      label: "响应方式",
      initial: "自动",
      options: ["自动", "人工确认"],
    },
  ],
  AGC: [
    { key: "connection", label: "BSP通信", initial: "未接入", readonly: true },
    { key: "protocol", label: "通信协议", initial: "IEC 104", readonly: true },
    {
      key: "power",
      label: "跟踪功率上限",
      initial: "—",
      unit: "kW",
      readonly: true,
    },
    {
      key: "authorization",
      label: "内部授权",
      initial: "关闭",
      readonly: true,
    },
  ],
  调峰: [
    { key: "connection", label: "BSP通信", initial: "未接入", readonly: true },
    { key: "source", label: "计划来源", initial: "TSO / BSP", readonly: true },
    {
      key: "charge",
      label: "最大充电功率",
      initial: "—",
      unit: "kW",
      readonly: true,
    },
    {
      key: "discharge",
      label: "最大放电功率",
      initial: "—",
      unit: "kW",
      readonly: true,
    },
  ],
  AVC: [
    { key: "connection", label: "BSP通信", initial: "未接入", readonly: true },
    { key: "control", label: "控制方式", initial: "Q-V 下垂", readonly: true },
    {
      key: "voltage",
      label: "目标电压",
      initial: "—",
      unit: "kV",
      readonly: true,
    },
    {
      key: "reactive",
      label: "无功功率限值",
      initial: "—",
      unit: "kVar",
      readonly: true,
    },
  ],
};
export type Period = {
  id: string;
  start: string;
  end: string;
  power: string;
  enabled: boolean;
};
export type Slot = {
  id: string;
  days: number[];
  start: string;
  end: string;
  base: Base;
  advanced: boolean;
  overlays: Overlay[];
  priority: Overlay[];
  params: Record<Mode, Record<string, string>>;
  charge: Period[];
  discharge: Period[];
};
export type Strategy = {
  id: string;
  name: string;
  description: string;
  slots: Slot[];
  fallback: Slot;
};
export type Workspace = { plans: Strategy[]; selected: string };
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const uid = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export function newSlot(): Slot {
  const params = Object.fromEntries(
    Object.entries(fields).map(([mode, list]) => [
      mode,
      Object.fromEntries(list.map((f) => [f.key, f.initial])),
    ]),
  ) as Slot["params"];
  return {
    id: uid(),
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "00:00",
    end: "24:00",
    base: "峰谷套利",
    advanced: false,
    overlays: [],
    priority: [...overlays],
    params,
    charge: [],
    discharge: [],
  };
}
export function newStrategy(id = uid()): Strategy {
  const fallback = newSlot();
  fallback.base = "光伏自发自用";
  return { id, name: "", description: "", slots: [], fallback };
}
export function minute(time: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(time)
    ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    : NaN;
}
export function validateSlot(
  slot: Slot,
  others: Slot[],
  rated: number,
  isDefault = false,
): string {
  if (!isDefault) {
    if (
      !slot.days.length ||
      slot.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    )
      return "请选择有效生效日期";
    if (
      !Number.isFinite(minute(slot.start)) ||
      !Number.isFinite(minute(slot.end)) ||
      minute(slot.end) <= minute(slot.start)
    )
      return "结束时间必须晚于开始时间（00:00—24:00）";
    if (
      others.some(
        (row) =>
          row.id !== slot.id &&
          row.days.some((d) => slot.days.includes(d)) &&
          minute(row.start) < minute(slot.end) &&
          minute(slot.start) < minute(row.end),
      )
    )
      return "所选生效日的策略时段重叠";
  }
  if (!bases.includes(slot.base)) return "请选择基础运行模式";
  if (
    slot.overlays.some((mode) => ["VPP", "AGC", "调峰", "AVC"].includes(mode))
  )
    return "外部调度服务未接入，不能启用";
  for (const mode of [slot.base, ...(slot.advanced ? slot.overlays : [])])
    for (const field of fields[mode]) {
      const value = slot.params[mode][field.key];
      if (field.readonly) continue;
      if (field.options) {
        if (!field.options.includes(value)) return `请选择${field.label}`;
        continue;
      }
      const n = Number(value);
      const max = field.max ?? (field.key === "power" ? rated : Infinity);
      if (
        !value?.trim() ||
        !Number.isFinite(n) ||
        n < (field.min ?? -Infinity) ||
        n > max
      )
        return `${field.label}超出有效范围${Number.isFinite(max) ? `（最高 ${max}${field.unit ?? ""}）` : ""}`;
    }
  if (
    slot.advanced &&
    slot.overlays.includes("需量控制") &&
    Number(slot.params["需量控制"].recovery) >=
      Number(slot.params["需量控制"].target)
  )
    return "恢复阈值必须小于目标需量";
  if (
    slot.advanced &&
    slot.overlays.includes("容量保护") &&
    Number(slot.params["容量保护"].recovery) >=
      Number(slot.params["容量保护"].trigger)
  )
    return "恢复负载率必须小于触发负载率";
  if (slot.base === "峰谷套利") {
    const rows = [...slot.charge, ...slot.discharge]
      .filter((p) => p.enabled)
      .sort((a, b) => minute(a.start) - minute(b.start));
    let end = 0;
    for (const row of rows) {
      if (
        !Number.isFinite(minute(row.start)) ||
        !Number.isFinite(minute(row.end)) ||
        minute(row.end) <= minute(row.start)
      )
        return "充放电时段时间无效";
      if (minute(row.start) < end) return "充放电时段不能重叠";
      if (
        !row.power.trim() ||
        !Number.isFinite(Number(row.power)) ||
        Number(row.power) < 0 ||
        Number(row.power) > rated
      )
        return "充放电功率须为非负数且不超过站点额定功率";
      end = minute(row.end);
    }
  }
  return "";
}
export function validateStrategy(plan: Strategy, rated: number): string {
  if (!plan.name.trim()) return "请填写策略名称";
  for (const slot of plan.slots) {
    const issue = validateSlot(slot, plan.slots, rated);
    if (issue) return issue;
  }
  return validateSlot(plan.fallback, [], rated, true);
}
export function movePriority<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length)
    return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function validSlot(row: Slot): boolean {
  return (
    !!row &&
    typeof row.id === "string" &&
    typeof row.start === "string" &&
    typeof row.end === "string" &&
    Array.isArray(row.days) &&
    bases.includes(row.base) &&
    Array.isArray(row.overlays) &&
    row.overlays.every((x) => overlays.includes(x)) &&
    Array.isArray(row.priority) &&
    row.priority.every((x) => overlays.includes(x)) &&
    Array.isArray(row.charge) &&
    Array.isArray(row.discharge) &&
    [...row.charge, ...row.discharge].every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.start === "string" &&
        typeof p.end === "string" &&
        typeof p.power === "string" &&
        typeof p.enabled === "boolean",
    ) &&
    Object.keys(fields).every(
      (mode) =>
        row.params?.[mode as Mode] &&
        fields[mode as Mode].every(
          (f) => typeof row.params[mode as Mode][f.key] === "string",
        ),
    )
  );
}
export function decodeWorkspace(raw: string | null): Workspace {
  try {
    const data = JSON.parse(raw ?? "null");
    if (
      data &&
      Array.isArray(data.plans) &&
      typeof data.selected === "string" &&
      data.plans.every(
        (p: Strategy) =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.description === "string" &&
          Array.isArray(p.slots) &&
          p.slots.every(validSlot) &&
          validSlot(p.fallback),
      )
    )
      return data;
  } catch {
    /* Recover invalid or old local drafts. */
  }
  return { plans: [], selected: "" };
}
export function summary(slot: Slot): string {
  if (slot.base === "峰谷套利") {
    const count = slot.charge.length + slot.discharge.length;
    return count
      ? `${slot.charge.length} 个充电 · ${slot.discharge.length} 个放电时段`
      : "未配置充放电时段";
  }
  if (slot.base === "光伏自发自用")
    return `最低保留电量 ${slot.params[slot.base].reserve}%`;
  if (slot.base === "动态电价优化")
    return `${slot.params[slot.base].cycle} 小时优化周期`;
  return `${slot.params[slot.base].window} 分钟平滑窗口`;
}
