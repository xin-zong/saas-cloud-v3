import type { Station } from "@/App";

export const SIGNALS = [
  { id: "soc", group: "电池系统", name: "SOC", unit: "%", color: "#198469" },
  { id: "storage", group: "电池系统", name: "充放电功率", unit: "kW", color: "#3078ca" },
  { id: "temperature", group: "电池系统", name: "最高单体温度", unit: "°C", color: "#c58019" },
  { id: "pcs", group: "PCS", name: "交流有功功率", unit: "kW", color: "#8060b7" },
  { id: "dcVoltage", group: "PCS", name: "直流母线电压", unit: "V", color: "#317c9d" },
  { id: "pv", group: "其他设备", name: "光伏有功功率", unit: "kW", color: "#e08a16" },
  { id: "load", group: "其他设备", name: "负荷功率", unit: "kW", color: "#795bc8" },
  { id: "gridVoltage", group: "其他设备", name: "并网电压", unit: "V", color: "#a06376" },
  { id: "generator", group: "其他设备", name: "发电机功率", unit: "kW", color: "#65774b" },
] as const;

export type SignalId = typeof SIGNALS[number]["id"];
export type TelemetrySample = {
  timestamp: string;
  values: Partial<Record<SignalId, number | null>>;
  quality?: Partial<Record<SignalId, "good" | "bad">>;
};
export type TelemetryRow = { timestamp: number } & Partial<Record<SignalId, number | null>>;

export function normalizeTelemetry(samples: TelemetrySample[]): TelemetryRow[] {
  const rows = new Map<number, TelemetryRow>();
  samples.forEach((sample) => {
    const timestamp = Date.parse(sample.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const row = rows.get(timestamp) ?? { timestamp };
    SIGNALS.forEach(({ id }) => {
      if (id in sample.values) row[id] = sample.quality?.[id] !== "bad" && typeof sample.values[id] === "number" && Number.isFinite(sample.values[id]) ? sample.values[id] : null;
    });
    rows.set(timestamp, row);
  });
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function demoTelemetry(station: Station, timestamp: number): TelemetryRow {
  const phase = timestamp / 1000;
  const wave = Math.sin(phase / 85);
  const slow = Math.cos(phase / 170);
  return {
    timestamp,
    pv: Math.round(station.pvOutput * 1000 * (0.63 + wave * 0.22)),
    load: Math.round(station.activePower * (1.25 + slow * 0.35)),
    storage: Math.round(station.ratedPower * (Math.sin(phase / 65) * 0.38 - 0.13)),
    soc: Number(Math.max(0, Math.min(100, station.soc + slow * 2.5)).toFixed(1)),
    temperature: Number((34.6 + wave * 1.8).toFixed(1)),
    pcs: Math.round(station.ratedPower * (Math.sin(phase / 65) * 0.37 - 0.12)),
    dcVoltage: Number((812 + wave * 8).toFixed(1)),
    gridVoltage: Number((398.6 + slow * 2).toFixed(1)),
    generator: Math.round(station.generator * 1000 * (0.92 + slow * 0.06)),
  };
}

export function demoTelemetryRange(station: Station, start: number, end: number) {
  // Bound large history queries while preserving actual sample timestamps.
  const step = Math.max(1000, Math.ceil((end - start) / 3600 / 1000) * 1000);
  const rows: TelemetryRow[] = [];
  for (let time = start; time <= end; time += step) rows.push(demoTelemetry(station, time));
  return rows;
}

export function localDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}
