import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE, api, send, type ApiRow } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { PlugZap, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Station } from "@/App";
import { stationDataNow } from "@/data/dataClock";
import "./station-price-settings.css";

type PriceMode = "buy" | "sell";
type PeriodLabel = "峰时" | "平时" | "谷时" | "尖峰";
type TariffPeriod = {
  id: string;
  label: PeriodLabel;
  start: string;
  end: string;
  price: string;
};
type TariffConfig = {
  effectiveDate: string;
  currency: string;
  billing: string;
  periods: TariffPeriod[];
};
type TariffDraft = Record<PriceMode, TariffConfig>;
type PriceSourceMode = "manual" | "api";
type PriceAuthType = "none" | "apiKey" | "bearer";
type PriceUnit = "CNY_KWH" | "CNY_MWH" | "EUR_MWH" | "USD_KWH";
type PriceInterval = "15m" | "30m" | "1h" | "dayAhead";
type PriceConnectionStatus = "idle" | "connected" | "failed" | "cached";
type ProviderRegion = {
  code: string;
  label: string;
  currency: string;
  base: number;
  volatility: number;
};
type DynamicProvider = {
  id: string;
  name: string;
  detail: string;
  endpoint: string;
  unit: PriceUnit;
  interval: PriceInterval;
  authTypes: PriceAuthType[];
  regions: ProviderRegion[];
};
type DynamicTariffSource = {
  mode: PriceSourceMode;
  providerId: string;
  regionCode: string;
  endpoint: string;
  authType: PriceAuthType;
  credential: string;
  unit: PriceUnit;
  interval: PriceInterval;
  status: PriceConnectionStatus;
  lastSyncAt: string;
  lastResultCount: number;
  lastError: string;
};
type DynamicPricePoint = {
  timestamp: string;
  price: number;
  unit: PriceUnit;
  currency: string;
  region: string;
  source: string;
};
type SyncLog = {
  time: string;
  level: "info" | "error";
  message: string;
};

const STORAGE_KEY = "enerlution-station-tariff-v2";
const LEGACY_STORAGE_KEY = "enerlution-station-tariff-v1";
const SOURCE_STORAGE_KEY = "enerlution-station-tariff-source-v1";
const PERIOD_LABELS: PeriodLabel[] = ["峰时", "平时", "谷时", "尖峰"];
const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  CNY_KWH: "CNY / kWh",
  CNY_MWH: "CNY / MWh",
  EUR_MWH: "EUR / MWh",
  USD_KWH: "USD / kWh",
};
const PRICE_INTERVAL_LABEL: Record<PriceInterval, string> = {
  "15m": "15分钟",
  "30m": "30分钟",
  "1h": "1小时",
  dayAhead: "日前价格",
};
const AUTH_TYPE_LABEL: Record<PriceAuthType, string> = {
  none: "无鉴权",
  apiKey: "API Key",
  bearer: "Bearer Token",
};
const STATUS_LABEL: Record<PriceConnectionStatus, string> = {
  idle: "未连接",
  connected: "已连接",
  failed: "同步失败",
  cached: "使用缓存",
};
const CNY_PER_EUR = 7.8;
const CNY_PER_USD = 7.2;

const DYNAMIC_PROVIDERS: DynamicProvider[] = [
  {
    id: "cn-grid",
    name: "供应商 A · 国内分时电价",
    detail: "面向国内省级目录电价和分时电价公告的标准化接口。",
    endpoint: "https://api.demo-tariff.cn/grid/tou",
    unit: "CNY_KWH",
    interval: "1h",
    authTypes: ["apiKey", "bearer"],
    regions: [
      { code: "CN-JS", label: "江苏 / 华东", currency: "CNY", base: 0.66, volatility: 0.34 },
      { code: "CN-GD", label: "广东 / 华南", currency: "CNY", base: 0.72, volatility: 0.38 },
      { code: "CN-BJ", label: "北京 / 华北", currency: "CNY", base: 0.61, volatility: 0.29 },
    ],
  },
  {
    id: "eu-dayahead",
    name: "供应商 B · 欧洲日前市场",
    detail: "面向欧洲日前市场价格的标准化行情接口，支持按国家和地区获取价格。",
    endpoint: "https://api.demo-market.eu/day-ahead",
    unit: "EUR_MWH",
    interval: "1h",
    authTypes: ["bearer", "apiKey"],
    regions: [
      { code: "ES-VC", label: "西班牙 / 瓦伦西亚", currency: "EUR", base: 72, volatility: 44 },
      { code: "DE-BW", label: "德国 / 巴登-符腾堡", currency: "EUR", base: 88, volatility: 52 },
      { code: "FR-IDF", label: "法国 / 法兰西岛", currency: "EUR", base: 81, volatility: 47 },
    ],
  },
  {
    id: "custom",
    name: "自定义 API",
    detail: "用于演示接入厂商自定义动态电价接口，字段映射由平台统一转换。",
    endpoint: "https://vendor.example.com/tariff",
    unit: "CNY_MWH",
    interval: "30m",
    authTypes: ["none", "apiKey", "bearer"],
    regions: [
      { code: "CUSTOM", label: "自定义地区", currency: "CNY", base: 640, volatility: 260 },
    ],
  },
];

function nextEffectiveDate(station?: Station) {
  const latest =
    station?.revenueHistory?.map((point) => point.date.slice(0, 10)).sort().at(-1);
  const date = latest ? new Date(`${latest}T00:00:00`) : station ? stationDataNow(station) : new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createDefaultConfig(mode: PriceMode, station?: Station): TariffConfig {
  if (!DEMO_MODE) return {effectiveDate: "", currency: "CNY", billing: "分时电价", periods: []};
  const labels: PeriodLabel[] = ["谷时", "平时", "峰时", "平时", "峰时", "谷时"];
  const ranges = [["00:00", "08:00"], ["08:00", "10:00"], ["10:00", "12:00"], ["12:00", "18:00"], ["18:00", "22:00"], ["22:00", "24:00"]];
  const latestDate =
    station?.revenueHistory?.map((point) => point.date.slice(0, 10)).sort().at(-1);
  const marketPrices =
    station?.operations?.market?.prices?.filter((point) =>
      latestDate ? point.timestamp.startsWith(latestDate) : true,
    ) ?? [];
  const prices = ranges.map(([start, end], index) => {
    const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
    const values = marketPrices
      .filter((point) => {
        const time = point.timestamp.slice(11, 16);
        const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
        return minutes >= startMinutes && minutes < endMinutes && typeof point.price === "number" && Number.isFinite(point.price);
      })
      .map((point) => point.price as number / 1000);
    const fallback = [0.32, 0.68, 1.08, 0.68, 1.08, 0.32][index];
    const value = values.length
      ? values.reduce((sum, item) => sum + item, 0) / values.length
      : fallback;
    return (mode === "buy" ? value : value * 0.56).toFixed(4);
  });
  return {
    effectiveDate: nextEffectiveDate(station),
    currency: "CNY",
    billing: "分时电价",
    periods: ranges.map(([start, end], index) => ({
      id: `${mode}-${index + 1}`,
      label: labels[index],
      start,
      end,
      price: prices[index],
    })),
  };
}

function loadTariffs(station: Station): TariffDraft {
  if (!DEMO_MODE) return {buy:createDefaultConfig("buy"),sell:createDefaultConfig("sell")};
  try {
    for (const { key, migrateDate } of [
      { key: STORAGE_KEY, migrateDate: false },
      { key: LEGACY_STORAGE_KEY, migrateDate: true },
    ]) {
      const stored = localStorage.getItem(`${key}:${station.id}`);
      if (!stored) continue;
      const parsed = JSON.parse(stored) as Partial<TariffDraft>;
      const fallbackDate = nextEffectiveDate(station);
      const buy = parsed.buy ?? createDefaultConfig("buy", station);
      const sell = parsed.sell ?? createDefaultConfig("sell", station);
      return {
        buy: migrateDate ? { ...buy, effectiveDate: fallbackDate } : buy,
        sell: migrateDate ? { ...sell, effectiveDate: fallbackDate } : sell,
      };
    }
  } catch {
    // Fall back to the design defaults when local storage is unavailable.
  }
  return { buy: createDefaultConfig("buy", station), sell: createDefaultConfig("sell", station) };
}

function timeToMinutes(value: string) {
  const match = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  if (match[1] === "24" && match[2] !== "00") return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value: number) {
  const minutes = Math.max(0, Math.min(24 * 60, Math.round(value)));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatMode(mode: PriceMode) {
  return mode === "buy" ? "购电电价" : "售电电价";
}

function formatLocalDateTime(value: Date) {
  const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

function providerById(id: string) {
  return DYNAMIC_PROVIDERS.find((provider) => provider.id === id) ?? DYNAMIC_PROVIDERS[0];
}

function regionByCode(provider: DynamicProvider, code: string) {
  return provider.regions.find((region) => region.code === code) ?? provider.regions[0];
}

function defaultProviderId(station: Station) {
  return /瓦伦西亚|西班牙|欧洲|Valencia/i.test(`${station.name} ${station.address} ${station.region}`)
    ? "eu-dayahead"
    : "cn-grid";
}

function createDefaultSource(station: Station): DynamicTariffSource {
  const provider = providerById(defaultProviderId(station));
  const region = /瓦伦西亚|西班牙|欧洲|Valencia/i.test(`${station.name} ${station.address} ${station.region}`)
    ? provider.regions.find((item) => item.code === "ES-VC") ?? provider.regions[0]
    : provider.regions[0];
  return {
    mode: "manual",
    providerId: provider.id,
    regionCode: region.code,
    endpoint: provider.endpoint,
    authType: provider.authTypes[0],
    credential: "",
    unit: provider.unit,
    interval: provider.interval,
    status: "idle",
    lastSyncAt: "",
    lastResultCount: 0,
    lastError: "",
  };
}

function loadDynamicSource(station: Station): DynamicTariffSource {
  if (!DEMO_MODE) return {...createDefaultSource(station),mode:"manual",credential:"",status:"idle",lastSyncAt:"",lastResultCount:0};
  const fallback = createDefaultSource(station);
  try {
    const stored = localStorage.getItem(`${SOURCE_STORAGE_KEY}:${station.id}`);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<DynamicTariffSource>;
    const provider = providerById(parsed.providerId ?? fallback.providerId);
    const region = regionByCode(provider, parsed.regionCode ?? fallback.regionCode);
    return {
      ...fallback,
      ...parsed,
      providerId: provider.id,
      regionCode: region.code,
      endpoint: parsed.endpoint || provider.endpoint,
      authType: provider.authTypes.includes(parsed.authType as PriceAuthType)
        ? (parsed.authType as PriceAuthType)
        : provider.authTypes[0],
      unit: parsed.unit ?? provider.unit,
      interval: parsed.interval ?? provider.interval,
    };
  } catch {
    return fallback;
  }
}

function convertToCnyKwh(point: DynamicPricePoint) {
  if (point.unit === "CNY_KWH") return point.price;
  if (point.unit === "CNY_MWH") return point.price / 1000;
  if (point.unit === "EUR_MWH") return (point.price * CNY_PER_EUR) / 1000;
  return point.price * CNY_PER_USD;
}

function latestStationDate(station: Station) {
  return (
    station.revenueHistory
      ?.map((point) => point.date.slice(0, 10))
      .sort()
      .at(-1) ?? formatLocalDateTime(stationDataNow(station)).slice(0, 10)
  );
}

function clampPrice(value: number, unit: PriceUnit) {
  if (unit === "EUR_MWH") return Math.max(12, Math.min(260, value));
  if (unit === "CNY_MWH") return Math.max(180, Math.min(1600, value));
  if (unit === "USD_KWH") return Math.max(0.04, Math.min(0.8, value));
  return Math.max(0.18, Math.min(1.45, value));
}

function createMockDynamicPrices(station: Station, source: DynamicTariffSource): DynamicPricePoint[] {
  const provider = providerById(source.providerId);
  const region = regionByCode(provider, source.regionCode);
  const date = latestStationDate(station);
  return Array.from({ length: 24 }, (_, hour) => {
    const eveningPeak = hour >= 18 && hour < 22 ? 1 : 0;
    const middayPeak = hour >= 10 && hour < 12 ? 0.72 : 0;
    const shoulder = hour >= 8 && hour < 18 ? 0.24 : 0;
    const valley = hour < 7 || hour >= 23 ? -0.55 : 0;
    const solarRelief = Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI)) * -0.22;
    const deterministicNoise =
      Math.sin((hour + station.id.length + region.code.length) * 1.27) * 0.08 +
      Math.cos((hour + provider.id.length) * 0.73) * 0.05;
    const price = clampPrice(
      region.base + region.volatility * (eveningPeak + middayPeak + shoulder + valley + solarRelief + deterministicNoise),
      source.unit,
    );
    return {
      timestamp: `${date}T${String(hour).padStart(2, "0")}:00:00`,
      price: Number(price.toFixed(source.unit.endsWith("KWH") ? 4 : 2)),
      unit: source.unit,
      currency: region.currency,
      region: region.label,
      source: provider.name,
    };
  });
}

function averageConvertedPrice(points: DynamicPricePoint[], start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  const values = points
    .filter((point) => {
      const time = point.timestamp.slice(11, 16);
      const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      return minutes >= startMinutes && minutes < endMinutes;
    })
    .map(convertToCnyKwh);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default function StationPriceSettingsPage({
  station,
  onOpenStrategy,
}: {
  station: Station;
  onOpenStrategy?: () => void;
}) {
  const {user} = useAuth();
  const canManage = hasStationPermission(user, station.id, 'tariff.manage');
  const [tariffs, setTariffs] = useState<ApiRow[]>([]);
  const [tariffName, setTariffName] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [serverBusy, setServerBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<PriceMode>("buy");
  const [savedDraft, setSavedDraft] = useState<TariffDraft>(() => loadTariffs(station));
  const [draft, setDraft] = useState<TariffDraft>(() => loadTariffs(station));
  const [savedSource, setSavedSource] = useState<DynamicTariffSource>(() => loadDynamicSource(station));
  const [source, setSource] = useState<DynamicTariffSource>(() => loadDynamicSource(station));
  const [previewPoints, setPreviewPoints] = useState<DynamicPricePoint[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const activeProvider = providerById(source.providerId);
  const activeRegion = regionByCode(activeProvider, source.regionCode);
  const previewMetrics = useMemo(() => {
    const converted = previewPoints.map(convertToCnyKwh);
    if (!converted.length) return null;
    const average = converted.reduce((sum, value) => sum + value, 0) / converted.length;
    return {
      average,
      min: Math.min(...converted),
      max: Math.max(...converted),
      count: converted.length,
    };
  }, [previewPoints]);
  const hasChanges =
    JSON.stringify(draft) !== JSON.stringify(savedDraft) ||
    JSON.stringify(source) !== JSON.stringify(savedSource);

  useEffect(() => {
    setNotice("");
    setNoticeError(false);
  }, [mode]);

  function selectServerTariff(row?: ApiRow) {
    const labels: Record<string,PeriodLabel> = {peak:'峰时',flat:'平时',valley:'谷时',superPeak:'尖峰'};
    const config: TariffConfig = row ? {effectiveDate:String(row.valid_from),currency:String(row.currency),billing:'分时电价',periods:((row.periods ?? []) as ApiRow[]).map((p,index) => ({id:`api-${index}`,label:labels[String(p.band)],start:minutesToTime(Number(p.start_minute)),end:minutesToTime(Number(p.end_minute)),price:String(p.price_per_kwh)}))} : createDefaultConfig('buy');
    setDraft({buy:config,sell:createDefaultConfig('sell')}); setSavedDraft({buy:config,sell:createDefaultConfig('sell')});
    setTariffName(row ? String(row.name) : ''); setValidUntil(row ? String(row.valid_until) : '');
  }
  useEffect(() => {
    if (DEMO_MODE) return;
    const controller = new AbortController(); setTariffs([]); selectServerTariff();
    if (!canManage) {setNotice('当前账号无电价管理权限'); setNoticeError(true); return}
    setServerBusy(true);
    api<ApiRow[]>(`/stations/${station.id}/tariffs`,{signal:controller.signal}).then(rows => {
      if (!controller.signal.aborted) {setTariffs(rows); selectServerTariff(rows[0])}
    }).catch(error => {if (!controller.signal.aborted) {setNotice(error.message);setNoticeError(true)}})
      .finally(() => {if (!controller.signal.aborted) setServerBusy(false)});
    return () => controller.abort();
  },[station.id,canManage,revision]);
  const activeConfig = draft[mode];
  function updateConfig(patch: Partial<TariffConfig>) {
    setNotice("");
    setNoticeError(false);
    setDraft((current) => ({ ...current, [mode]: { ...current[mode], ...patch } }));
  }

  function updatePeriod(id: string, patch: Partial<TariffPeriod>) {
    updateConfig({
      periods: activeConfig.periods.map((period) => period.id === id ? { ...period, ...patch } : period),
    });
  }

  function appendLog(level: SyncLog["level"], message: string) {
    const time = formatLocalDateTime(new Date());
    setSyncLogs((current) => [{ time, level, message }, ...current].slice(0, 8));
  }

  function updateSource(patch: Partial<DynamicTariffSource>) {
    setNotice("");
    setNoticeError(false);
    setSource((current) => ({ ...current, ...patch }));
  }

  function selectProvider(providerId: string) {
    const provider = providerById(providerId);
    const region = provider.regions[0];
    setPreviewPoints([]);
    updateSource({
      providerId: provider.id,
      regionCode: region.code,
      endpoint: provider.endpoint,
      authType: provider.authTypes[0],
      unit: provider.unit,
      interval: provider.interval,
      status: "idle",
      lastError: "",
      lastResultCount: 0,
    });
  }

  function validateSource() {
    if (source.mode !== "api") return "请先切换到 API 动态接入";
    if (!/^https?:\/\//i.test(source.endpoint.trim())) return "请输入有效的 API 地址";
    if (!activeProvider.authTypes.includes(source.authType)) return "当前供应商不支持所选鉴权方式";
    if (source.endpoint.includes("fail")) return "供应商接口返回 503，已保留当前电价";
    return "";
  }

  function testConnection() {
    const error = validateSource();
    if (error) {
      updateSource({ status: "failed", lastError: error });
      appendLog("error", error);
      setNotice(error);
      setNoticeError(true);
      return;
    }
    const now = formatLocalDateTime(new Date());
    updateSource({
      status: "connected",
      lastSyncAt: now,
      lastError: "",
    });
    appendLog("info", `${activeProvider.name} · ${activeRegion.label} 测试连接通过`);
    setNotice("测试连接通过，可拉取最新动态电价");
    setNoticeError(false);
  }

  function fetchDynamicPrices() {
    const error = validateSource();
    if (error) {
      updateSource({ status: "failed", lastError: error });
      appendLog("error", error);
      setNotice(error);
      setNoticeError(true);
      return;
    }
    const points = createMockDynamicPrices(station, source);
    const now = formatLocalDateTime(new Date());
    setPreviewPoints(points);
    updateSource({
      status: "connected",
      lastSyncAt: now,
      lastResultCount: points.length,
      lastError: "",
    });
    appendLog("info", `${activeProvider.name} 已返回 ${points.length} 条 ${activeRegion.label} 电价`);
    setNotice(`已拉取 ${points.length} 条动态电价，可预览后应用`);
    setNoticeError(false);
  }

  function applyDynamicPrices(targetMode: PriceMode) {
    if (!previewPoints.length) {
      setNotice("请先拉取动态电价");
      setNoticeError(true);
      return;
    }
    const currentConfig = draft[targetMode];
    const nextPeriods = currentConfig.periods.map((period) => {
      const average = averageConvertedPrice(previewPoints, period.start, period.end);
      if (average === null) return period;
      const value = targetMode === "buy" ? average : average * 0.56;
      return { ...period, price: value.toFixed(4) };
    });
    setDraft((current) => ({
      ...current,
      [targetMode]: {
        ...current[targetMode],
        currency: "CNY",
        billing: "分时电价",
        periods: nextPeriods,
      },
    }));
    setMode(targetMode);
    appendLog("info", `已将动态电价转换为${formatMode(targetMode)}分时表`);
    setNotice(`已生成${formatMode(targetMode)}草案，保存后生效`);
    setNoticeError(false);
  }

  function addPeriod() {
    if (!DEMO_MODE && !activeConfig.periods.length) {updateConfig({periods:[{id:`api-${Date.now()}`,label:"平时",start:"00:00",end:"24:00",price:""}]}); return;}
    const candidates = activeConfig.periods
      .map((period, index) => {
        const start = timeToMinutes(period.start);
        const end = timeToMinutes(period.end);
        return { period, index, start, end, duration: start === null || end === null ? -1 : end - start };
      })
      .filter((item) => item.duration >= 60)
      .sort((a, b) => b.duration - a.duration);
    const target = candidates[0];

    if (!target || target.start === null || target.end === null) {
      setNotice("请先修正现有时段，再新增电价时段");
      setNoticeError(true);
      return;
    }

    const rawMidpoint = target.start + target.duration / 2;
    const midpoint = Math.max(
      target.start + 30,
      Math.min(target.end - 30, Math.round(rawMidpoint / 30) * 30),
    );
    const nextPeriods = [...activeConfig.periods];
    nextPeriods.splice(
      target.index,
      1,
      { ...target.period, end: minutesToTime(midpoint) },
      {
        id: `${mode}-${Date.now()}`,
        label: target.period.label === "峰时" ? "平时" : target.period.label,
        start: minutesToTime(midpoint),
        end: target.period.end,
        price: target.period.price,
      },
    );
    updateConfig({
      periods: nextPeriods,
    });
  }

  function removePeriod(id: string) {
    if (activeConfig.periods.length <= 1) {
      setNotice("至少保留一个电价时段");
      setNoticeError(true);
      return;
    }
    const index = activeConfig.periods.findIndex((period) => period.id === id);
    if (index < 0) return;
    const removed = activeConfig.periods[index];
    const nextPeriods = activeConfig.periods.filter((period) => period.id !== id);
    if (index === 0) {
      nextPeriods[0] = { ...nextPeriods[0], start: removed.start };
    } else {
      nextPeriods[index - 1] = { ...nextPeriods[index - 1], end: removed.end };
    }
    updateConfig({ periods: nextPeriods });
  }

  function validateConfig() {
    if (!activeConfig.effectiveDate) return "请选择生效日期";
    const parsedPeriods = activeConfig.periods.map((period) => ({
      period,
      start: timeToMinutes(period.start),
      end: timeToMinutes(period.end),
    }));
    for (const { period, start, end } of parsedPeriods) {
      const price = Number(period.price);
      if (start === null || end === null || start >= end) return `请检查 ${period.label} 的时间范围`;
      if (!period.price.trim() || !Number.isFinite(price) || (DEMO_MODE && price < 0)) return `请检查 ${period.label} 的电价`;
    }
    if (parsedPeriods[0]?.start !== 0) return "首个时段必须从 00:00 开始";
    for (let index = 1; index < parsedPeriods.length; index += 1) {
      if (parsedPeriods[index].start !== parsedPeriods[index - 1].end) {
        return "各时段必须首尾相接，不能重叠或留空";
      }
    }
    if (parsedPeriods.at(-1)?.end !== 24 * 60) return "最后一个时段必须在 24:00 结束";
    return "";
  }

  async function save() {
    if (!DEMO_MODE) {
      if (serverBusy || !canManage) return;
      const problem = validateConfig();
      if (problem || !tariffName.trim() || !validUntil || validUntil <= activeConfig.effectiveDate) {setNotice(problem || '请输入名称及晚于生效日期的结束日期（不含）');setNoticeError(true);return}
      if (tariffs.some(row => activeConfig.effectiveDate < String(row.valid_until) && validUntil > String(row.valid_from))) {setNotice('新电价生效期间与已保存期间重叠；请创建不重叠的新期间');setNoticeError(true);return}
      setServerBusy(true);
      try {
        const bands: Record<PeriodLabel,string> = {'峰时':'peak','平时':'flat','谷时':'valley','尖峰':'superPeak'};
        await send('/tariffs','POST',{stationId:Number(station.id),name:tariffName.trim(),currency:activeConfig.currency,validFrom:activeConfig.effectiveDate,validUntil,periods:activeConfig.periods.map(p => ({startMinute:timeToMinutes(p.start),endMinute:timeToMinutes(p.end),band:bands[p.label],pricePerKwh:Number(p.price)}))});
        setNotice('新电价生效期间已由服务器创建，既有版本未覆盖');setNoticeError(false);setRevision(v => v+1);
      } catch(error) {setNotice(error instanceof Error ? error.message : '保存失败');setNoticeError(true)}
      finally {setServerBusy(false)}
      return;
    }
    const error = validateConfig();
    if (error) {
      setNotice(error);
      setNoticeError(true);
      return;
    }
    const nextSaved = { ...draft };
    setSavedDraft(nextSaved);
    const nextSource = { ...source };
    setSavedSource(nextSource);
    try {
      localStorage.setItem(`${STORAGE_KEY}:${station.id}`, JSON.stringify(nextSaved));
      localStorage.setItem(`${SOURCE_STORAGE_KEY}:${station.id}`, JSON.stringify(nextSource));
    } catch {
      // The draft remains active even when persistence is unavailable.
    }
    setNotice(`${formatMode(mode)}与电价来源配置已保存`);
    setNoticeError(false);
  }

  function cancel() {
    if (!DEMO_MODE) {selectServerTariff(tariffs[0]);setNotice("已恢复服务器电价版本");setNoticeError(false);return;}
    setDraft(savedDraft);
    setSource(savedSource);
    setNotice("已恢复上次保存的电价配置");
    setNoticeError(false);
  }

  return (
    <main className="station-price-settings-page">
      {!DEMO_MODE && <section className="price-settings-section"><h2>站点电价版本</h2><p>每次保存创建新的生效期间，不覆盖已有电价；结束日期不包含当天。动态供应商接入和独立卖电电价暂不支持。</p>
        <select aria-label="服务器电价版本" disabled={serverBusy} onChange={e => selectServerTariff(e.target.value === "" ? undefined : tariffs[Number(e.target.value)])}><option value="">选择已保存版本</option>{tariffs.map((row,index) => <option key={index} value={index}>{String(row.name)} · {String(row.valid_from)} 至 {String(row.valid_until)}（不含）</option>)}</select>
        <button className="price-cancel-button" disabled={serverBusy || !canManage} onClick={() => {selectServerTariff();setNotice('新期间草稿尚未保存')}}>新建生效期间</button>
        {!tariffs.length && !serverBusy && <p>服务器暂无电价版本。请新建生效期间并配置时段。</p>}
        <label>电价名称 <input aria-label="电价名称" value={tariffName} onChange={e => setTariffName(e.target.value)} disabled={!canManage || serverBusy}/></label>
        <label>结束日期（不含） <input aria-label="电价结束日期" type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} disabled={!canManage || serverBusy}/></label>
      </section>}

      <header className="price-settings-toolbar">
        <div className="price-mode-tabs" role="tablist" aria-label="电价类型">
          {(["buy", "sell"] as PriceMode[]).map((item) => (
            <button disabled={!DEMO_MODE && item === "sell"} title={!DEMO_MODE && item === "sell" ? "独立卖电电价尚未接入" : undefined} key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)}>
              {formatMode(item)}
            </button>
          ))}
        </div>
        <button type="button" className="price-strategy-link" onClick={onOpenStrategy}>
          查看运行策略
        </button>
      </header>

      <section className="price-settings-section price-source-section" aria-label="电价来源">
        <header className="price-section-heading price-source-heading">
          <div>
            <h2>电价来源</h2>
            <p>{DEMO_MODE ? "可保留手工分时电价，也可用模拟 API 拉取不同厂商和地区的动态电价。" : "手工配置电价，保存至业务服务器；动态供应商连接尚未接入。"}</p>
          </div>
          <span className={`price-source-status is-${source.status}`}>
            {STATUS_LABEL[source.status]}
          </span>
        </header>

        <div className="price-source-body">
          <div className="price-source-mode" role="group" aria-label="电价来源模式">
            {([
              ["manual", "手工维护"],
              ["api", "API 动态接入"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                disabled={!DEMO_MODE && value === "api"}
                title={!DEMO_MODE && value === "api" ? "动态供应商接口尚未接入" : undefined}
                type="button"
                aria-pressed={source.mode === value}
                onClick={() => {
                  setPreviewPoints([]);
                  updateSource({ mode: value, status: value === "manual" ? "idle" : source.status });
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {source.mode === "manual" ? (
            <div className="price-source-empty">
              <strong>{DEMO_MODE ? "当前使用本地分时电价表" : "当前编辑服务器电价的新生效期间"}</strong>
              <span>下方表格中的时段和价格由用户手工维护，保存后创建站点电价版本；以生效日期为准。</span>
            </div>
          ) : (
            <>
              <div className="price-api-grid">
                <label>
                  <span>供应商</span>
                  <select value={source.providerId} onChange={(event) => selectProvider(event.target.value)}>
                    {DYNAMIC_PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>地区 / 市场</span>
                  <select
                    value={source.regionCode}
                    onChange={(event) => {
                      setPreviewPoints([]);
                      updateSource({ regionCode: event.target.value, status: "idle", lastError: "", lastResultCount: 0 });
                    }}
                  >
                    {activeProvider.regions.map((region) => (
                      <option key={region.code} value={region.code}>{region.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>API 地址</span>
                  <input
                    value={source.endpoint}
                    onChange={(event) => {
                      setPreviewPoints([]);
                      updateSource({ endpoint: event.target.value, status: "idle", lastError: "", lastResultCount: 0 });
                    }}
                  />
                </label>
                <label>
                  <span>鉴权方式</span>
                  <select value={source.authType} onChange={(event) => updateSource({ authType: event.target.value as PriceAuthType })}>
                    {activeProvider.authTypes.map((type) => (
                      <option key={type} value={type}>{AUTH_TYPE_LABEL[type]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>访问凭据</span>
                  <input
                    type="password"
                    placeholder={source.authType === "none" ? "无需填写" : "演示可为空"}
                    disabled={source.authType === "none"}
                    value={source.credential}
                    onChange={(event) => updateSource({ credential: event.target.value })}
                  />
                </label>
                <label>
                  <span>价格单位</span>
                  <select value={source.unit} onChange={(event) => updateSource({ unit: event.target.value as PriceUnit })}>
                    {(Object.keys(PRICE_UNIT_LABEL) as PriceUnit[]).map((unit) => (
                      <option key={unit} value={unit}>{PRICE_UNIT_LABEL[unit]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>时间粒度</span>
                  <select value={source.interval} onChange={(event) => updateSource({ interval: event.target.value as PriceInterval })}>
                    {(Object.keys(PRICE_INTERVAL_LABEL) as PriceInterval[]).map((interval) => (
                      <option key={interval} value={interval}>{PRICE_INTERVAL_LABEL[interval]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="price-api-summary">
                <div>
                  <span>供应商说明</span>
                  <strong>{activeProvider.detail}</strong>
                </div>
                <div>
                  <span>最近同步</span>
                  <strong>{source.lastSyncAt || "尚未同步"}</strong>
                </div>
                <div>
                  <span>返回价格</span>
                  <strong>{source.lastResultCount ? `${source.lastResultCount} 条` : "—"}</strong>
                </div>
                <div>
                  <span>标准化单位</span>
                  <strong>转换为 CNY / kWh 后应用</strong>
                </div>
              </div>

              {source.lastError && (
                <p className="price-api-error" role="alert">{source.lastError}</p>
              )}

              <div className="price-api-actions">
                <button type="button" className="price-api-button" onClick={testConnection}>
                  <PlugZap size={15} />测试连接
                </button>
                <button type="button" className="price-api-button is-primary" onClick={fetchDynamicPrices}>
                  <RefreshCw size={15} />拉取最新电价
                </button>
                <button type="button" className="price-api-button" onClick={() => applyDynamicPrices("buy")} disabled={!previewPoints.length}>
                  应用到购电电价
                </button>
                <button type="button" className="price-api-button" onClick={() => applyDynamicPrices("sell")} disabled={!previewPoints.length}>
                  应用到售电电价
                </button>
                <button type="button" className="price-api-button" onClick={() => setLogsOpen((open) => !open)}>
                  查看同步日志
                </button>
              </div>

              {previewMetrics && (
                <div className="price-preview">
                  <div className="price-preview-kpis">
                    <div><span>均价</span><strong>{previewMetrics.average.toFixed(4)}</strong><small>CNY/kWh</small></div>
                    <div><span>最低</span><strong>{previewMetrics.min.toFixed(4)}</strong><small>CNY/kWh</small></div>
                    <div><span>最高</span><strong>{previewMetrics.max.toFixed(4)}</strong><small>CNY/kWh</small></div>
                    <div><span>采样</span><strong>{previewMetrics.count}</strong><small>条</small></div>
                  </div>
                  <div className="price-preview-table" aria-label="动态电价预览">
                    <table>
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>源价格</th>
                          <th>转换后</th>
                          <th>地区</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewPoints.map((point) => (
                          <tr key={point.timestamp}>
                            <td>{point.timestamp.slice(11, 16)}</td>
                            <td>{point.price.toFixed(point.unit.endsWith("KWH") ? 4 : 2)} {PRICE_UNIT_LABEL[point.unit]}</td>
                            <td>{convertToCnyKwh(point).toFixed(4)} CNY/kWh</td>
                            <td>{point.region}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {logsOpen && (
                <div className="price-sync-log" aria-label="同步日志">
                  {syncLogs.length ? syncLogs.map((log) => (
                    <div key={`${log.time}-${log.message}`} data-level={log.level}>
                      <span>{log.time}</span>
                      <strong>{log.message}</strong>
                    </div>
                  )) : (
                    <p>暂无同步日志</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="price-settings-section price-settings-meta" aria-label="电价基本设置">
        <label>
          <span>生效日期</span>
          <input aria-label="电价生效日期" type="date" value={activeConfig.effectiveDate} onChange={(event) => updateConfig({ effectiveDate: event.target.value })} />
        </label>
        <label>
          <span>币种</span>
          <select value={activeConfig.currency} onChange={(event) => updateConfig({ currency: event.target.value })}>
            <option value="CNY">CNY · 元 / kWh</option>
            <option value="USD">USD · 美元 / kWh</option><option value="EUR">EUR · 欧元 / kWh</option>
          </select>
        </label>
        <label>
          <span>计价方式</span>
          <select disabled={!DEMO_MODE} title={!DEMO_MODE ? "服务端按全天时段表计价" : undefined} value={activeConfig.billing} onChange={(event) => updateConfig({ billing: event.target.value })}>
            <option value="分时电价">分时电价</option>
            <option value="统一电价">统一电价</option>
          </select>
        </label>
      </section>

      <section className="price-settings-section price-period-section" aria-label={`${formatMode(mode)}分时电价`}>
        <header className="price-section-heading">
          <h2>分时电价</h2>
          <button type="button" className="price-add-button" aria-label="新增电价时段" title="新增电价时段" onClick={addPeriod}>
            <Plus size={17} />
          </button>
        </header>
        <div className="price-table-scroll">
          <table className="price-period-table">
            <thead>
              <tr>
                <th>时段</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>电价（{activeConfig.currency}/kWh）</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {activeConfig.periods.map((period) => (
                <tr key={period.id}>
                  <td>
                    <select aria-label={`${period.id}时段`} value={period.label} onChange={(event) => updatePeriod(period.id, { label: event.target.value as PeriodLabel })}>
                      {PERIOD_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
                    </select>
                  </td>
                  <td><input aria-label={`${period.label}开始时间`} value={period.start} inputMode="numeric" placeholder="00:00" onChange={(event) => updatePeriod(period.id, { start: event.target.value })} /></td>
                  <td><input aria-label={`${period.label}结束时间`} value={period.end} inputMode="numeric" placeholder="24:00" onChange={(event) => updatePeriod(period.id, { end: event.target.value })} /></td>
                  <td><input aria-label={`${period.label}电价`} type="number" min={DEMO_MODE ? "0" : undefined} step="0.0001" value={period.price} onChange={(event) => updatePeriod(period.id, { price: event.target.value })} /></td>
                  <td>
                    <button type="button" className="price-delete-button" aria-label={`删除${period.label}时段`} title="删除时段" onClick={() => removePeriod(period.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="price-settings-footer">
        <span className={`price-settings-notice${noticeError ? " is-error" : ""}`} role="status">{notice}</span>
        <button type="button" className="price-cancel-button" onClick={cancel} disabled={!hasChanges}>取消</button>
        <button type="button" className="price-save-button" onClick={save} disabled={DEMO_MODE ? !hasChanges : serverBusy || !canManage}>{DEMO_MODE ? "保存电价" : "创建新生效期间"}</button>
      </footer>
    </main>
  );
}
