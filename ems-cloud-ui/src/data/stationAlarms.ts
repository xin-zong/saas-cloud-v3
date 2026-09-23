export type StationAlarm = {
  id: string;
  occurredAt: string;
  recoveredAt?: string;
  category: "安全" | "设备" | "环境" | "通信";
  title: string;
  device: string;
  location: string;
  severity: "critical" | "warning";
  status: "active" | "recovered";
  metric: { name: string; unit: string; threshold: number; holdSeconds?: number };
  samples: { offsetMinutes: number; value: number }[];
  events: { at: string; text: string }[];
};

export function alarmDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function alarmRange(days: number, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  return { start: alarmDate(start), end: alarmDate(now) };
}

// Relative dates keep the explicitly labelled demo useful in the live preview.
export function demoStationAlarms(stationId: string, now = new Date()): StationAlarm[] {
  const seeds = [
    { id: "2048", days: 4, time: "14:21:06", title: "电池簇温差偏高", category: "安全", device: "BMS-02", location: "电池簇 01", severity: "critical", status: "active", name: "温差", unit: "°C", threshold: 5, peak: 6.8 },
    { id: "2041", days: 6, time: "08:35:12", title: "消防系统温度过高", category: "安全", device: "FSS-01", location: "储能舱", severity: "critical", status: "recovered", name: "温度", unit: "°C", threshold: 55, peak: 62.4 },
    { id: "2036", days: 5, time: "02:16:30", title: "PCS 输出降额", category: "设备", device: "PCS-01", location: "变流器 01", severity: "warning", status: "recovered", name: "模块温度", unit: "°C", threshold: 75, peak: 82.1 },
    { id: "2045", days: 3, time: "09:18:04", title: "舱内湿度偏高", category: "环境", device: "ENV-01", location: "储能舱", severity: "warning", status: "recovered", name: "相对湿度", unit: "%", threshold: 85, peak: 91.2 },
    { id: "2043", days: 2, time: "07:32:08", title: "网关通信中断", category: "通信", device: "GW-01", location: "通信网关", severity: "critical", status: "recovered", name: "通信延迟", unit: "ms", threshold: 1000, peak: 1650 },
    { id: "2049", days: 0, time: "06:46:15", title: "电池绝缘阻抗异常", category: "设备", device: "HVAC-02", location: "辅助系统 02", severity: "warning", status: "active", name: "漏电流", unit: "mA", threshold: 30, peak: 38.5 },
  ] as const;
  return seeds.map((seed) => {
    const date = new Date(now);
    date.setDate(date.getDate() - seed.days);
    const occurredAt = `${alarmDate(date)}T${seed.time}`;
    const stamp = new Date(occurredAt).getTime();
    const eventAt = (seconds: number) => new Date(stamp + seconds * 1000).toISOString();
    const profile = [0.18, 0.20, 0.24, 0.32, 0.45, 0.59, 0.76, 0.91, 1, 0.98, 0.89, 0.84, 0.8];
    return {
      id: `ALM-${seed.id}`, occurredAt, category: seed.category, title: seed.title,
      device: seed.device, location: seed.location, severity: seed.severity, status: seed.status,
      recoveredAt: seed.status === "recovered" ? eventAt(672) : undefined,
      metric: { name: seed.name, unit: seed.unit, threshold: seed.threshold, holdSeconds: 180 },
      samples: profile.map((factor, index) => ({
        offsetMinutes: index * 5 - 30,
        value: Number((seed.peak * (seed.status === "recovered" && index > 8 ? factor * 0.65 : factor)).toFixed(1)),
      })),
      events: [
        { at: occurredAt, text: "规则首次命中" },
        { at: eventAt(180), text: "持续 180 秒，告警激活" },
        { at: eventAt(516), text: `${seed.name}达到峰值 ${seed.peak} ${seed.unit}` },
        ...(seed.status === "recovered" ? [{ at: eventAt(672), text: "指标恢复正常，告警恢复" }] : []),
      ],
    } satisfies StationAlarm;
  }).map((alarm) => ({ ...alarm, location: `${stationId} 号站 / ${alarm.location}` }));
}
