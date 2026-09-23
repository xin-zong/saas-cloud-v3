import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays, ChevronDown, LineChart as LineChartIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Station } from "@/App";
import { DEMO_MODE } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import ApiAnalyticsPage from "./ApiAnalyticsPage";
import { stationDataNow } from "@/data/dataClock";
import {
  demoTelemetryRange,
  normalizeTelemetry,
  type TelemetryRow,
} from "@/data/stationTelemetry";
import "./station-run-curves.css";

type CurveRange = "D" | "W" | "M";

type CurvePoint = {
  time: string;
  pv: number | null;
  battery: number | null;
  load: number | null;
  soc: number | null;
  charge: number | null;
  discharge: number | null;
};

type CurveDataModel = {
  points: CurvePoint[];
  source: "connected" | "calculated";
  sampleCount: number;
};

const RANGE_LABELS: Record<CurveRange, string> = {
  D: "日",
  W: "周",
  M: "月",
};

const POWER_SERIES = [
  { key: "pv", name: "光伏功率", color: "#c58b2a" },
  { key: "battery", name: "电池功率", color: "#2f7c6a" },
  { key: "load", name: "负荷功率", color: "#5b7787" },
] as const;

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function rangeBounds(dateValue: string, range: CurveRange) {
  const start = parseDateInput(dateValue);
  if (range === "W") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (range === "M") {
    start.setDate(1);
  }
  const end = new Date(start);
  if (range === "W") end.setDate(end.getDate() + 6);
  if (range === "M") end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatRange(bounds: ReturnType<typeof rangeBounds>, range: CurveRange) {
  const startKey = localDateKey(bounds.start);
  const endKey = localDateKey(bounds.end);
  if (range === "D") return `${startKey} 00:00 - 23:59`;
  return `${startKey} 00:00 - ${endKey} 23:59`;
}

function formatTime(timestamp: number, range: CurveRange) {
  const date = new Date(timestamp);
  if (range !== "D") return `${date.getMonth() + 1}/${date.getDate()}`;
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function averageValue(rows: TelemetryRow[], key: "pv" | "storage" | "load" | "soc") {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bucketEndExclusive(bounds: ReturnType<typeof rangeBounds>) {
  return bounds.end.getTime() + 1;
}

function buildBuckets(bounds: ReturnType<typeof rangeBounds>, range: CurveRange) {
  const buckets: { start: number; end: number; label: string; hours: number }[] = [];
  const endExclusive = bucketEndExclusive(bounds);
  let cursor = bounds.start.getTime();

  while (cursor < endExclusive) {
    const next = new Date(cursor);
    if (range === "D") next.setHours(next.getHours() + 1);
    else next.setDate(next.getDate() + 1);
    const end = Math.min(next.getTime(), endExclusive);
    buckets.push({
      start: cursor,
      end,
      label: formatTime(cursor, range),
      hours: Math.max(0, (end - cursor) / 3_600_000),
    });
    cursor = end;
  }

  return buckets;
}

function buildCurveData(station: Station, dateValue: string, range: CurveRange): CurveDataModel {
  const bounds = rangeBounds(dateValue, range);
  const connectedRows = station.telemetryHistory
    ? normalizeTelemetry(station.telemetryHistory).filter(
        (row) => row.timestamp >= bounds.start.getTime() && row.timestamp <= bounds.end.getTime(),
      )
    : [];
  const source = connectedRows.length >= 2 ? "connected" : "calculated";
  const rows = source === "connected"
    ? connectedRows
    : demoTelemetryRange(station, bounds.start.getTime(), bounds.end.getTime());

  const points = buildBuckets(bounds, range).map((bucket) => {
    const bucketRows = rows.filter(
      (row) => row.timestamp >= bucket.start && row.timestamp < bucket.end,
    );
    const pv = averageValue(bucketRows, "pv");
    const battery = averageValue(bucketRows, "storage");
    const load = averageValue(bucketRows, "load");
    const socValue = averageValue(bucketRows, "soc");
    const soc = socValue === null ? null : Math.max(0, Math.min(100, socValue));
    const energy = battery === null ? null : battery * bucket.hours;

    return {
      time: bucket.label,
      pv: pv === null ? null : Math.round(pv),
      battery: battery === null ? null : Math.round(battery),
      load: load === null ? null : Math.round(load),
      soc: soc === null ? null : Number(soc.toFixed(1)),
      charge: energy === null ? null : energy < 0 ? Math.round(energy) : 0,
      discharge: energy === null ? null : energy > 0 ? Math.round(energy) : 0,
    };
  });

  if (range === "D") {
    points.push({
      time: "24:00",
      pv: null,
      battery: null,
      load: null,
      soc: null,
      charge: null,
      discharge: null,
    });
  }

  return { points, source, sampleCount: rows.length };
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | null; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="run-curve-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name} style={{ color: item.color }}>
          {item.name} {typeof item.value === "number" ? item.value.toLocaleString("zh-CN") : "--"}
        </span>
      ))}
    </div>
  );
}

function ChartHeader({
  title,
  unit,
  children,
  onDeepAnalysis,
}: {
  title: string;
  unit: string;
  children: ReactNode;
  onDeepAnalysis: () => void;
}) {
  return (
    <header className="run-curve-card__header">
      <div>
        <h2>{title}</h2>
        <span>{unit}</span>
      </div>
      <div className="run-curve-card__legend">{children}</div>
      <button type="button" className="run-curve-deep-link" onClick={onDeepAnalysis}>
        深入分析
        <ArrowUpRight size={13} aria-hidden="true" />
      </button>
    </header>
  );
}

export default function StationRunCurvePage({ station }: { station: Station }) {
  const { user } = useAuth();
  if (!DEMO_MODE) return <ApiAnalyticsPage stations={[station]} allowedTabs={["数据分析"]} allowedReportTypes={[]} role={user?.role ?? "owner"} />;
  return <DemoStationRunCurvePage station={station} />;
}

function DemoStationRunCurvePage({ station }: { station: Station }) {
  const [range, setRange] = useState<CurveRange>("D");
  const [dateValue, setDateValue] = useState(() => localDateKey(stationDataNow(station)));
  const [notice, setNotice] = useState("");
  const bounds = useMemo(() => rangeBounds(dateValue, range), [dateValue, range]);
  const curveModel = useMemo(() => buildCurveData(station, dateValue, range), [station, dateValue, range]);
  const data = curveModel.points;
  const dayTicks = range === "D" ? ["00:00", "06:00", "12:00", "18:00", "24:00"] : undefined;

  function showDeepAnalysis() {
    setNotice("已保留当前时间范围，可在分析与 AI 页面继续查看详细通道。");
    window.setTimeout(() => setNotice(""), 2800);
  }

  return (
    <main className="station-run-curves-page">
      <div className="run-curves-toolbar">
        <label className="run-curves-range-select">
          <span className="sr-only">范围</span>
          <select aria-label="运行曲线时间范围" value={range} onChange={(event) => setRange(event.target.value as CurveRange)}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <label className="run-curves-date">
          <CalendarDays size={14} aria-hidden="true" />
          <span className="run-curves-date-text">{formatRange(bounds, range)}</span>
          <input aria-label="运行曲线日期" type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} />
        </label>
        <span className="run-curves-source">
          {curveModel.source === "connected"
            ? `已接入采样数据 · ${curveModel.sampleCount.toLocaleString("zh-CN")} 个采样点`
            : "当前范围使用实时计算数据"} · {station.name}
        </span>
      </div>

      <section className="run-curve-card" aria-label="功率曲线">
        <ChartHeader title="功率曲线" unit="kW" onDeepAnalysis={showDeepAnalysis}>
          {POWER_SERIES.map((series) => (
            <span key={series.key} className="run-curve-legend-item">
              <i style={{ background: series.color }} />
              {series.name}
            </span>
          ))}
        </ChartHeader>
        <div className="run-curve-chart run-curve-chart--power">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }}>
              <CartesianGrid stroke="#e5ece9" vertical={false} />
              <XAxis dataKey="time" ticks={dayTicks} tick={{ fontSize: 10, fill: "#697a78" }} axisLine={false} tickLine={false} minTickGap={42} />
              <YAxis tick={{ fontSize: 10, fill: "#697a78" }} axisLine={false} tickLine={false} width={42} />
              <ReferenceLine y={0} stroke="#b9c8c2" />
              <Tooltip content={<ChartTooltip />} />
              {POWER_SERIES.map((series) => (
                <Line key={series.key} type="monotone" dataKey={series.key} name={series.name} stroke={series.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="run-curve-card" aria-label="SOC趋势">
        <ChartHeader title="SOC趋势" unit="%" onDeepAnalysis={showDeepAnalysis}>
          <span className="run-curve-legend-item">
            <i style={{ background: "#2f7c6a" }} />
            SOC
          </span>
        </ChartHeader>
        <div className="run-curve-chart run-curve-chart--soc">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }}>
              <CartesianGrid stroke="#e5ece9" vertical={false} />
              <XAxis dataKey="time" ticks={dayTicks} tick={{ fontSize: 10, fill: "#697a78" }} axisLine={false} tickLine={false} minTickGap={42} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: "#697a78" }} axisLine={false} tickLine={false} width={42} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="soc" name="SOC" stroke="#2f7c6a" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="run-curve-card" aria-label="充放电量">
        <ChartHeader title="充放电量" unit="kWh" onDeepAnalysis={showDeepAnalysis}>
          <span className="run-curve-legend-item">
            <i style={{ background: "#527990" }} />
            充电量（-）
          </span>
          <span className="run-curve-legend-item">
            <i style={{ background: "#3d4e59" }} />
            放电量（+）
          </span>
        </ChartHeader>
        <div className="run-curve-chart run-curve-chart--energy">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }} barCategoryGap="24%">
              <CartesianGrid stroke="#e5ece9" vertical={false} />
              <XAxis dataKey="time" ticks={dayTicks} tick={{ fontSize: 10, fill: "#697a78" }} axisLine={false} tickLine={false} minTickGap={42} />
              <YAxis tick={{ fontSize: 10, fill: "#697a78" }} axisLine={false} tickLine={false} width={42} />
              <ReferenceLine y={0} stroke="#84938f" />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="charge" name="充电量（-）" fill="#527990" radius={[1, 1, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="discharge" name="放电量（+）" fill="#3d4e59" radius={[1, 1, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {notice && <div className="run-curve-notice" role="status"><LineChartIcon size={14} />{notice}</div>}
    </main>
  );
}
