import rawStations from "./demoStations.json"
import type { Station } from "@/App"
import type { MarketKind, MarketResource } from "./stationMarket"
import type { MarketService } from "./operations"
import type {
  IncomeKey,
  SettlementData,
  SettlementRecord,
} from "./stationSettlement"

type PackageStation = Station & {
  operations: NonNullable<Station["operations"]>
}

const MARKET_KINDS: Record<MarketKind, string> = {
  response: "需求响应",
  arbitrage: "日前套利",
  reserve: "备用容量",
  vpp: "VPP",
}

const SNAPSHOT_DATE = "2026-09-19"

function stationImage(station: Station) {
  const statusColor =
    station.status === "fault"
      ? "#d95c5c"
      : station.status === "online"
        ? "#2f7c6a"
        : "#7a8a84"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dfeae4"/><stop offset="1" stop-color="#f8fbf8"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><rect x="24" y="116" width="272" height="18" rx="3" fill="#7fa292" opacity=".45"/><g fill="#ffffff" stroke="#9ab4a8" stroke-width="2"><rect x="44" y="58" width="68" height="56" rx="6"/><rect x="126" y="44" width="68" height="70" rx="6"/><rect x="208" y="64" width="68" height="50" rx="6"/></g><g stroke="#7a9589" stroke-width="3" stroke-linecap="round"><path d="M58 76h40M58 92h40M140 64h40M140 82h40M222 80h40M222 96h40"/></g><circle cx="270" cy="34" r="10" fill="${statusColor}"/><path d="M32 140h256" stroke="#5f8073" stroke-width="2" stroke-linecap="round"/><text x="28" y="32" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#1d2f2a">${station.code}</text><text x="28" y="52" font-family="Arial, sans-serif" font-size="12" fill="#61716b">${station.project || station.region}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function stamp(date: string, time: string) {
  return `${date}T${time}:00+08:00`
}

function dateDays(station: Station) {
  return [
    ...new Set(
      (station.revenueHistory ?? [])
        .map((point) => point.date.slice(0, 10))
        .filter(Boolean),
    ),
  ].sort()
}

function marketPrice(date: string, index: number) {
  const hour = index / 4
  const peak = (hour >= 9 && hour < 12) || (hour >= 17 && hour < 21)
  const shoulder = (hour >= 7 && hour < 9) || (hour >= 12 && hour < 17)
  return Math.round(peak ? 1120 : shoulder ? 580 : 320)
}

function marketDelivery(
  date: string,
  startMinute: number,
  endMinute: number,
  capacity: number,
  snapshotEnd: number,
) {
  const rows: { timestamp: string; power: number | null }[] = []
  for (let minute = startMinute; minute < endMinute; minute += 15) {
    if (date === SNAPSHOT_DATE && minute > snapshotEnd) continue
    const wave = 0.9 + Math.sin((minute - startMinute) / 48) * 0.06
    rows.push({
      timestamp: stamp(
        date,
        `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
          minute % 60,
        ).padStart(2, "0")}`,
      ),
      power: Math.round(capacity * wave),
    })
  }
  return rows
}

function buildMarketData(station: Station): {
  market: MarketResource
  marketServices: MarketService[]
} {
  const dates = dateDays(station)
  const lastDate = dates.at(-1) ?? SNAPSHOT_DATE
  const isAvailable =
    station.status !== "offline" &&
    station.status !== "building" &&
    station.dataStatus !== "disconnected"
  const occupied = Math.round(station.ratedPower * 0.12)
  const capacityByDate = Object.fromEntries(
    dates.map((date, dateIndex) => {
      const dateFactor = dateIndex === dates.length - 1 ? 0.78 : 0.92
      const up = isAvailable
        ? Math.max(0, Math.round(station.ratedPower * dateFactor - occupied))
        : null
      const down = isAvailable
        ? Math.max(0, Math.round(station.ratedPower * 0.68))
        : null
      return [
        date,
        {
          timestamp: stamp(date, date === lastDate ? "10:30" : "23:59"),
          up,
          down,
          occupied: isAvailable ? occupied : null,
          durationHours:
            isAvailable && up
              ? Number(
                  (
                    (station.storageCapacity * 1000 * 0.7) /
                    Math.max(up, 1)
                  ).toFixed(2),
                )
              : null,
          constraint:
            station.status === "fault"
              ? "PCS 降额，已按活动告警限制可用能力"
              : "",
        },
      ]
    }),
  )

  const market: MarketResource = {
    source: "connected",
    portfolio:
      station.type === "BESS" ? "工商业储能组合" : `${station.type}组合`,
    area: station.region,
    qualifications: (Object.keys(MARKET_KINDS) as MarketKind[]).map(
      (kind) => ({
        kind,
        status: isAvailable ? "valid" : "suspended",
        validUntil: "2026-09-30",
        reference: `PKG-${station.code}-${kind.toUpperCase()}`,
      }),
    ),
    capacity: capacityByDate[lastDate],
    capacityByDate,
    prices: dates.flatMap((date) =>
      Array.from({ length: 96 }, (_, index) => ({
        timestamp: stamp(
          date,
          `${String(Math.floor((index * 15) / 60)).padStart(2, "0")}:${String(
            (index * 15) % 60,
          ).padStart(2, "0")}`,
        ),
        price: marketPrice(date, index),
      })),
    ),
  }

  const serviceDefinitions = [
    {
      kind: "response" as const,
      start: 14 * 60,
      end: 16 * 60,
      rate: 0.3,
    },
    {
      kind: "arbitrage" as const,
      start: 18 * 60,
      end: 20 * 60,
      rate: 0.22,
    },
    {
      kind: "reserve" as const,
      start: 0,
      end: 24 * 60,
      rate: 0.12,
    },
  ]
  const marketServices: MarketService[] = dates.flatMap((date) =>
    serviceDefinitions.map((definition, index) => {
      const dateIsSnapshot = date === lastDate
      const capacity = Math.round(station.ratedPower * definition.rate)
      const status =
        !dateIsSnapshot || definition.kind === "reserve"
          ? "已完成"
          : "待执行"
      const deliveryEnd = dateIsSnapshot ? 10 * 60 + 30 : definition.end
      return {
        id: `PKG-${station.code}-${date}-${definition.kind}`,
        eventId: `PKG-${date}-${definition.kind}`,
        date,
        kind: definition.kind,
        name: MARKET_KINDS[definition.kind],
        start: `${String(Math.floor(definition.start / 60)).padStart(2, "0")}:${String(
          definition.start % 60,
        ).padStart(2, "0")}`,
        end: `${String(Math.floor(definition.end / 60)).padStart(2, "0")}:${String(
          definition.end % 60,
        ).padStart(2, "0")}`,
        capacity: isAvailable ? capacity : 0,
        revenue: null,
        status,
        attention:
          station.status === "fault"
            ? "活动告警期间按降额能力执行"
            : "交付包补充记录",
        delivery:
          definition.kind === "reserve"
            ? []
            : marketDelivery(
                date,
                definition.start,
                Math.min(definition.end, deliveryEnd),
                capacity,
                10 * 60 + 30,
              ),
        ...(index === 0 && dateIsSnapshot
          ? { attention: "当前快照尚未到执行时段" }
          : {}),
      }
    }),
  )

  return { market, marketServices }
}

function settlementIncome(point: NonNullable<Station["revenueHistory"]>[number]) {
  const realized = (point.settled ?? 0) + (point.pending ?? 0)
  const income: Partial<Record<IncomeKey, number | null>> = {
    arbitrage: realized,
    demand: 0,
    response: 0,
    gridServices: 0,
    pv: 0,
    other: 0,
  }
  return income
}

function buildSettlementData(station: Station): SettlementData {
  const records: SettlementRecord[] = (station.revenueHistory ?? []).map(
    (point) => {
      const realized = (point.settled ?? 0) + (point.pending ?? 0)
      const status =
        (point.est ?? 0) > 0
          ? "metered"
          : (point.pending ?? 0) > 0
            ? "reviewing"
            : "settled"
      return {
        id: `PKG-SETTLE-${station.code}-${point.date}`,
        date: point.date.slice(0, 10),
        currency: "CNY",
        contract: `PKG-${station.code}-TOU`,
        service: station.mode,
        status,
        realized,
        pending: point.pending ?? 0,
        settled: point.settled ?? 0,
        disputed: 0,
        estimated: point.est ?? 0,
        adjustment: point.penalty ?? 0,
        income: settlementIncome(point),
        costs: { purchase: 0, operating: 0, penalty: 0 },
        meterComplete: true,
        calculationComplete: status === "settled" || status === "reviewing",
        evidence: {
          reference: `PKG-EVIDENCE-${station.code}-${point.date}`,
          meterKwh: Math.round(
            Math.abs(
              (station.operations?.samples ?? [])
                .filter((sample) => sample.timestamp.slice(0, 10) === point.date)
                .reduce((total, sample) => total + (sample.storage ?? 0), 0),
            ) / 4,
          ),
          baselineKwh: 0,
          pricePerKwh: 0.58,
          rule: "交付包峰谷套利核算",
          instruction: station.mode,
          performance: "由交付包运行计划与遥测快照生成",
        },
      }
    },
  )
  return { source: "connected", records }
}

export function loadDemoStations(): Station[] {
  return (rawStations as unknown as PackageStation[]).map((station) => {
    const { market, marketServices } = buildMarketData(station)
    return {
      ...station,
      imageUrl: station.imageUrl || stationImage(station),
      revenueSource: "connected",
      maintenance: {
        ...station.maintenance,
        source: "connected",
      },
      operations: {
        ...station.operations,
        source: "connected",
        market,
        marketServices,
        settlement: buildSettlementData(station),
      },
    }
  })
}

export const demoStations = loadDemoStations()
