import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE, api, allRows, send, type ApiRow } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { adaptSettlement } from "@/api/settlement"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  FileText,
  Search,
  X,
} from "lucide-react"

import type { Station } from "@/App"

import { stationsDataNow } from "@/data/dataClock"

import { exportOperationsCsv, operationsDate } from "@/data/operations"

import {
  getDefaultRevenueDateRange,
  type RevenueDateRange,
} from "@/data/stationMetrics"

import {
  buildSettlementAccounts,
  completeSettlementMoney,
  settlementRecords,
  settlementTotals,
  sumSettlementMoney,
  validSettlementRange,
  SETTLEMENT_COSTS,
  SETTLEMENT_INCOME,
  SETTLEMENT_STATES,
  type SettlementAccount,
  type SettlementState,
} from "@/data/stationSettlement"

import "./operations-settlement.css"

type Period = "日" | "周" | "月"

const NOTE_KEY = "enerlution-settlement-review-notes-v1"

const digits = (value: number | null | undefined, decimals = 2) =>
  value == null
    ? "--"
    : value.toLocaleString("zh-CN", {
        minimumFractionDigits: decimals,

        maximumFractionDigits: decimals,
      })

function money(value: number | null | undefined, currency: string) {
  if (value == null) return "--"

  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",

      currency,

      minimumFractionDigits: 2,

      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${digits(value)}`
  }
}

function periodRange(period: Period, now: Date): RevenueDateRange {
  const range = getDefaultRevenueDateRange(period, now)

  if (period === "月")
    range.end = operationsDate(
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
    )

  if (period === "周") {
    const end = new Date(`${range.start}T12:00:00`)

    end.setDate(end.getDate() + 6)

    range.end = operationsDate(end)
  }

  return range
}

function SettlementModal({
  title,

  children,

  onClose,

  footer,

  drawer = false,
}: {
  title: string

  children: ReactNode

  onClose: () => void

  footer?: ReactNode

  drawer?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current

    element?.showModal()

    return () => element?.close()
  }, [])

  return (
    <dialog
      className={`settlement-dialog ${drawer ? "is-drawer" : ""}`}
      ref={ref}
      aria-label={title}
      onCancel={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="operations-icon"
          title="关闭"
          aria-label="关闭核算弹窗"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="settlement-dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  )
}

function DateRangeDialog({
  range,

  onApply,

  onClose,
}: {
  range: RevenueDateRange

  onApply: (value: RevenueDateRange) => void

  onClose: () => void
}) {
  const [draft, setDraft] = useState(range)

  const [error, setError] = useState("")

  return (
    <SettlementModal
      title="选择核算周期"
      onClose={onClose}
      footer={
        <>
          <button className="operations-button" onClick={onClose}>
            取消
          </button>
          <button
            className="operations-button is-active"
            onClick={() => {
              if (!validSettlementRange(draft)) {
                setError("请选择有效日期，结束日期不能早于开始日期")

                return
              }

              onApply(draft)
            }}
          >
            应用范围
          </button>
        </>
      }
    >
      <div className="settlement-date-fields">
        <label>
          开始日期
          <input
            aria-label="核算开始日期"
            type="date"
            value={draft.start}
            onChange={(e) => {
              setDraft((current) => ({ ...current, start: e.target.value }))

              setError("")
            }}
          />
        </label>
        <label>
          结束日期
          <input
            aria-label="核算结束日期"
            type="date"
            value={draft.end}
            onChange={(e) => {
              setDraft((current) => ({ ...current, end: e.target.value }))

              setError("")
            }}
          />
        </label>
      </div>
      {error && (
        <p className="settlement-error" role="alert">
          {error}
        </p>
      )}
    </SettlementModal>
  )
}

function StatusBadge({ status }: { status: SettlementState }) {
  return (
    <span className={`settlement-badge settlement-state--${status}`}>
      {SETTLEMENT_STATES[status]}
    </span>
  )
}

function AccountDrawer({
  account,

  range,

  initialTab,

  onClose,

  onOpenStation,
}: {
  account: SettlementAccount

  range: RevenueDateRange

  initialTab: string

  onClose: () => void

  onOpenStation: (id: string, subNav?: string) => void
}) {
  const [tab, setTab] = useState(initialTab)

  const { user } = useAuth()

  const [reviewRecord, setReviewRecord] = useState(account.records[0]?.id ?? "")

  const [reviews, setReviews] = useState<ApiRow[]>([])

  const [saving, setSaving] = useState(false)

  const loadReviews = async () => {
    const records = await allRows(
      `/stations/${account.station.id}/settlements?from=${range.start}&to=${range.end}`,
    )

    setReviews(
      (records.find((row) => String(row.id) === reviewRecord)?.reviews ??
        []) as ApiRow[],
    )
  }

  useEffect(() => {
    if (DEMO_MODE || !reviewRecord) return

    let active = true

    allRows(
      `/stations/${account.station.id}/settlements?from=${range.start}&to=${range.end}`,
    )
      .then((records) => {
        if (active)
          setReviews(
            (records.find((row) => String(row.id) === reviewRecord)?.reviews ??
              []) as ApiRow[],
          )
      })
      .catch((error) => {
        if (active) setNotice(error.message)
      })

    return () => {
      active = false
    }
  }, [reviewRecord, account.station.id, range.start, range.end])

  const key = JSON.stringify([account.key, range.start, range.end])

  const [note, setNote] = useState(() => {
    if (!DEMO_MODE) return ""

    try {
      const saved = JSON.parse(localStorage.getItem(NOTE_KEY) ?? "{}")

      return typeof saved[key]?.note === "string" ? saved[key].note : ""
    } catch {
      return ""
    }
  })

  const [notice, setNotice] = useState("")

  const totals = account.totals

  const currency = account.currency

  const gross = completeSettlementMoney(Object.values(totals.income))

  const costs = completeSettlementMoney(Object.values(totals.costs))

  const net =
    gross !== null && costs !== null && totals.adjustment !== null
      ? sumSettlementMoney([gross, -costs, totals.adjustment])
      : null

  const incomeDifference =
    net !== null && totals.realized !== null
      ? sumSettlementMoney([totals.realized, -net])
      : null

  function exportLedger() {
    exportOperationsCsv(
      `核算证据-${account.station.name}-${range.start}-${range.end}.csv`,

      [
        "日期",

        "合同",

        "币种",

        "已实现",

        "待结算",

        "已结算",

        "争议金额",

        "调整",

        "差异",

        "状态",

        "计量(kWh)",

        `电价(${currency}/kWh)`,

        "基线(kWh)",

        "证据编号",

        "核算规则",
      ],

      account.records.map((record) => [
        record.date,

        record.contract,

        currency,

        record.realized,

        record.pending,

        record.settled,

        record.disputed,

        record.adjustment,

        record.difference,

        SETTLEMENT_STATES[record.status],

        record.evidence?.meterKwh ?? null,

        record.evidence?.pricePerKwh ?? null,

        record.evidence?.baselineKwh ?? null,

        record.evidence?.reference ?? "",

        record.evidence?.rule ?? "",
      ]),
    )
  }

  async function saveNote() {
    if (!DEMO_MODE) {
      if (!note.trim() || !reviewRecord) {
        setNotice("请选择账目并填写复核意见")
        return
      }

      setSaving(true)

      try {
        await send(`/settlements/${reviewRecord}/reviews`, "POST", {
          note: note.trim(),
        })
        await loadReviews()
        setNote("")
        setNotice("复核意见已保存，账目状态未改变")
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "保存失败")
      } finally {
        setSaving(false)
      }

      return
    }

    try {
      const saved = JSON.parse(localStorage.getItem(NOTE_KEY) ?? "{}")

      const base =
        saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}

      localStorage.setItem(
        NOTE_KEY,

        JSON.stringify({
          ...base,

          [key]: { note, savedAt: new Date().toISOString() },
        }),
      )

      setNotice("复核备注已保存至本机，结算状态未改变")
    } catch {
      setNotice("保存失败：本地存储不可用")
    }
  }

  return (
    <SettlementModal
      title={`${account.station.name} · 核算明细`}
      drawer
      onClose={onClose}
      footer={
        <>
          <button className="operations-button" onClick={exportLedger}>
            <Download size={14} />
            导出证据
          </button>
          <button
            className="operations-button is-active"
            onClick={() => onOpenStation(account.station.id, "运营收益")}
          >
            站点运营收益
            <ArrowRight size={13} />
          </button>
        </>
      }
    >
      <div className="settlement-drawer-meta">
        <div>
          <strong>{account.contract}</strong>
          <span>
            {account.start} - {account.end} · {currency}
            {account.demo ? " · 示例账目" : ""}
          </span>
        </div>
        <StatusBadge status={account.status} />
      </div>
      <div className="settlement-drawer-metrics">
        {[
          ["已实现", totals.realized],

          ["待结算", totals.pending],

          ["已结算", totals.settled],

          ["争议金额", totals.disputed],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>{money(value as number | null, currency)}</strong>
          </div>
        ))}
      </div>
      {account.disputeReason && (
        <div className="settlement-dispute-banner">
          <strong>争议事项</strong>
          <span>{account.disputeReason}</span>
        </div>
      )}
      {account.balanceError && (
        <p className="settlement-error" role="status">
          部分账目已实现与已结算、待结算合计不一致，需核验。
        </p>
      )}
      <nav className="settlement-drawer-tabs" aria-label="核算明细视图">
        {["核算账目", "证据链", "复核备注"].map((value) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </nav>
      {tab === "核算账目" && (
        <>
          <dl className="settlement-reconciliation">
            <div>
              <dt>收入合计</dt>
              <dd>{money(gross, currency)}</dd>
            </div>
            <div>
              <dt>扣减合计</dt>
              <dd>{money(costs === null ? null : -costs, currency)}</dd>
            </div>
            <div>
              <dt>其他调整</dt>
              <dd>{money(totals.adjustment, currency)}</dd>
            </div>
            <div>
              <dt>收入构成与已实现差额</dt>
              <dd className={incomeDifference ? "settlement-danger" : ""}>
                {money(incomeDifference, currency)}
              </dd>
            </div>
            <div>
              <dt>预估收益（不计已实现）</dt>
              <dd>{money(totals.estimated, currency)}</dd>
            </div>
          </dl>
          <div className="operations-table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "入账日期",

                    "已实现",

                    "待结算",

                    "已结算",

                    "差异",

                    "状态",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {account.records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.date}</td>
                    <td>{money(record.realized, currency)}</td>
                    <td>{money(record.pending, currency)}</td>
                    <td>{money(record.settled, currency)}</td>
                    <td
                      className={record.difference ? "settlement-danger" : ""}
                    >
                      {money(record.difference, currency)}
                    </td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "证据链" && (
        <div className="settlement-evidence-list">
          {account.records

            .slice()

            .reverse()

            .map((record) => (
              <section className="settlement-evidence" key={record.id}>
                <header>
                  <FileText size={14} />
                  <strong>{record.date}</strong>
                  <span>{record.evidence?.reference ?? "证据编号未接入"}</span>
                </header>
                {record.evidence ? (
                  <dl>
                    <div>
                      <dt>合同 / 规则</dt>
                      <dd>
                        {record.contract} · {record.evidence.rule ?? "--"}
                      </dd>
                    </div>
                    <div>
                      <dt>计量电量</dt>
                      <dd>{digits(record.evidence.meterKwh)} kWh</dd>
                    </div>
                    <div>
                      <dt>结算单价</dt>
                      <dd>
                        {digits(record.evidence.pricePerKwh, 4)} {currency}/kWh
                      </dd>
                    </div>
                    <div>
                      <dt>基线电量</dt>
                      <dd>{digits(record.evidence.baselineKwh)} kWh</dd>
                    </div>
                    <div>
                      <dt>执行指令</dt>
                      <dd>{record.evidence.instruction ?? "--"}</dd>
                    </div>
                    <div>
                      <dt>性能核验</dt>
                      <dd>{record.evidence.performance ?? "--"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="operations-muted">
                    该账目尚未接入计量、规则及执行证据。
                  </p>
                )}
              </section>
            ))}
        </div>
      )}
      {tab === "复核备注" && (
        <div className="settlement-review">
          {!DEMO_MODE && (
            <>
              <label>
                复核账目
                <select
                  aria-label="复核账目"
                  value={reviewRecord}
                  onChange={(e) => {
                    setReviewRecord(e.target.value)
                    setNote("")
                    setReviews([])
                  }}
                >
                  {account.records.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.date} · {record.evidence?.reference || record.id}
                    </option>
                  ))}
                </select>
              </label>
              <div aria-label="服务器复核记录">
                {reviews.length ? (
                  reviews.map((review, index) => (
                    <p key={index}>
                      {String(review.created_at)} · 用户{" "}
                      {String(review.author_id)}：{String(review.note)}
                    </p>
                  ))
                ) : (
                  <p>暂无复核意见</p>
                )}
              </div>
            </>
          )}
          <label>
            复核备注
            <textarea
              aria-label="结算复核备注"
              maxLength={2000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value)

                setNotice("")
              }}
            />
          </label>
          <div>
            <span className="operations-muted">
              {DEMO_MODE
                ? "本地记录 · 未提交后台复核"
                : "服务器记录 · 按账目保存复核意见"}
            </span>
            <button
              className="operations-button is-active"
              disabled={
                !DEMO_MODE &&
                (saving || !hasStationPermission(user, account.station.id, "revenue.review"))
              }
              title={
                !DEMO_MODE && !hasStationPermission(user, account.station.id, "revenue.review")
                  ? "需要收益复核权限"
                  : undefined
              }
              onClick={saveNote}
            >
              <Check size={13} />
              保存备注
            </button>
          </div>
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
    </SettlementModal>
  )
}

export default function OperationsSettlementPage({
  stations,

  onOpenStation,
}: {
  stations: Station[]

  onOpenStation: (id: string, subNav?: string) => void
}) {
  const [now, setNow] = useState(() =>
    DEMO_MODE ? stationsDataNow(stations) : new Date(),
  )

  const [period, setPeriod] = useState<Period | null>("月")

  const [customRange, setCustomRange] = useState<RevenueDateRange>(() =>
    periodRange("月", DEMO_MODE ? stationsDataNow(stations) : new Date()),
  )

  const [currency, setCurrency] = useState("CNY")

  const [status, setStatus] = useState("")

  const [search, setSearch] = useState("")

  const [sort, setSort] = useState("difference")

  const [dateOpen, setDateOpen] = useState(false)

  const [detail, setDetail] = useState<{
    key: string

    tab: string
  } | null>(null)

  useEffect(() => {
    setNow(DEMO_MODE ? stationsDataNow(stations) : new Date())

    const timer = window.setInterval(
      () => setNow(DEMO_MODE ? stationsDataNow(stations) : new Date()),
      60000,
    )

    return () => window.clearInterval(timer)
  }, [stations])

  const today = operationsDate(now)

  const range = period ? periodRange(period, now) : customRange

  const [apiStations, setApiStations] = useState<Station[]>([])

  const [apiError, setApiError] = useState("")

  const [apiLoading, setApiLoading] = useState(false)

  const stationKey = stations.map((station) => station.id).join(",")

  useEffect(() => {
    if (DEMO_MODE) return

    const controller = new AbortController()
    setApiLoading(true)
    setApiError("")
    setApiStations([])

    Promise.all(
      stations.map(async (station) => ({
        ...station,
        operations: {
          ...station.operations,
          source: "connected" as const,
          settlement: {
            source: "connected" as const,
            records: (
              await allRows(
                `/stations/${station.id}/settlements?from=${range.start}&to=${range.end}`,
                controller.signal,
              )
            ).map(adaptSettlement),
          },
        },
      })),
    )
      .then(setApiStations)
      .catch((error) => {
        if (!controller.signal.aborted) setApiError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setApiLoading(false)
      })

    return () => controller.abort()
  }, [stationKey, range.start, range.end])

  const accountStations = DEMO_MODE ? stations : apiStations

  const allAccounts = useMemo(
    () => buildSettlementAccounts(accountStations, range, currency, today),

    [accountStations, range.start, range.end, currency, today],
  )

  const accounts = allAccounts.filter(
    (account) =>
      (!status || account.status === status) &&
      `${account.station.name} ${account.contract}`

        .toLowerCase()

        .includes(search.trim().toLowerCase()),
  )

  const records = accounts.flatMap((account) => account.records)

  const totals = settlementTotals(records)

  const anchor = range.end < today ? range.end : today

  const daily = settlementTotals(
    records.filter((record) => record.date === anchor),
  )

  const currencies = useMemo(
    () => [
      ...new Set([
        "CNY",

        ...accountStations.flatMap((station) =>
          settlementRecords(station, today).map((record) => record.currency),
        ),
      ]),
    ],

    [accountStations, today],
  )

  const sorted = accounts

    .slice()

    .sort((a, b) =>
      sort === "difference"
        ? b.maxDifference - a.maxDifference ||
          Number(b.status === "disputed") - Number(a.status === "disputed")
        : sort === "realized"
          ? (b.totals.realized ?? -Infinity) - (a.totals.realized ?? -Infinity)
          : a.station.name.localeCompare(b.station.name, "zh-CN"),
    )

  const incomeRows = SETTLEMENT_INCOME.filter(
    (source) =>
      (source.key !== "pv" && source.key !== "other") ||
      (totals.income[source.key] !== null && totals.income[source.key] !== 0),
  )

  const gross = completeSettlementMoney(Object.values(totals.income))

  const progress = [
    {
      label: "计量齐备",

      count: accounts.filter((a) => a.metered).length,
    },

    {
      label: "初算完成",

      count: accounts.filter((a) => a.calculated).length,
    },

    {
      label: "复核中",

      count: accounts.filter(
        (a) => a.status === "reviewing" || a.status === "disputed",
      ).length,
    },

    {
      label: "已结算",

      count: accounts.filter((a) => a.status === "settled").length,
    },
  ]

  const disputed = sorted.filter((account) => account.status === "disputed")

  const firstDispute = disputed[0]

  const source = accounts.some((account) => account.demo)
    ? "含示例账目"
    : "接入账目"

  const title =
    period === "月"
      ? "本月"
      : period === "周"
        ? "本周"
        : period === "日"
          ? "今日"
          : "期间"

  const selected = allAccounts.find((account) => account.key === detail?.key)

  function exportStatement() {
    exportOperationsCsv(
      `结算对账-${range.start}-${range.end}-${currency}.csv`,

      [
        "站点",

        "合同",

        "开始日期",

        "结束日期",

        "币种",

        "已实现",

        "待结算",

        "已结算",

        "争议金额",

        "调整",

        "罚则",

        "结算状态",

        "差异",

        "来源",
      ],

      sorted.map((account) => [
        account.station.name,

        account.contract,

        account.start,

        account.end,

        currency,

        account.totals.realized,

        account.totals.pending,

        account.totals.settled,

        account.totals.disputed,

        account.totals.adjustment,

        account.totals.costs.penalty,

        SETTLEMENT_STATES[account.status],

        account.totals.difference,

        account.demo ? "示例" : "接入数据",
      ]),
    )
  }

  return (
    <div className="settlement-page">
      {!DEMO_MODE &&
        (apiError ? (
          <p role="alert">{apiError}</p>
        ) : apiLoading ? (
          <p role="status">正在加载所选期间结算账目…</p>
        ) : (
          <p>
            服务器账目 ·
            按页读取完整查询范围；已收款按查询截止日统计。核算完整时未列出的分项视为不适用。
          </p>
        ))}
      <section className="settlement-toolbar" aria-label="收益结算筛选">
        <div className="settlement-range-control">
          <span>周期</span>
          <button
            className="operations-button settlement-range"
            aria-label="选择核算周期"
            onClick={() => setDateOpen(true)}
          >
            <CalendarDays size={13} />
            <span data-testid="settlement-range">
              {range.start} - {range.end}
            </span>
          </button>
        </div>
        <div className="operations-segment" aria-label="核算周期快捷选择">
          {(["日", "周", "月"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label>
          币种
          <select
            aria-label="核算币种"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select
            aria-label="结算状态筛选"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部结算状态</option>
            {Object.entries(SETTLEMENT_STATES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="operations-button settlement-export"
          disabled={!accounts.length}
          onClick={exportStatement}
        >
          <Download size={13} />
          导出对账表
        </button>
      </section>
      <section className="settlement-kpis" aria-label="收益结算指标">
        {[
          {
            label: anchor === today ? "今日已实现" : "期末日已实现",

            value: daily.realized,

            note: `${anchor} · 不含预估收益`,

            id: "daily",
          },

          {
            label: `${title}已实现`,

            value: totals.realized,

            note: `${accounts.length}份合同 · ${source}`,

            id: "realized",
          },

          {
            label: "待结算",

            value: totals.pending,

            note: `${accounts.filter((a) => (a.totals.pending ?? 0) !== 0).length}份合同待结算`,

            id: "pending",
          },

          {
            label: "已结算",

            value: totals.settled,

            note: "按已入账结算记录",

            id: "settled",
          },

          {
            label: "争议金额",

            value: totals.disputed,

            note: `${disputed.length}项争议待核验`,

            id: "disputed",
          },
        ].map((item) => (
          <div className="settlement-kpi" key={item.id}>
            <span>{item.label}</span>
            <strong data-testid={`settlement-${item.id}`}>
              {money(item.value, currency)}
            </strong>
            <small>{item.note}</small>
          </div>
        ))}
      </section>
      <div className="settlement-middle">
        <section className="settlement-composition" aria-label="已实现收益构成">
          <div className="operations-section-heading">
            <h2>{title}已实现收益构成</h2>
            <span className="settlement-badge">已实现口径</span>
          </div>
          <div className="settlement-income-heading">
            <span>收入来源</span>
            <span>金额</span>
            <span>占收入</span>
          </div>
          <div className="settlement-income-list">
            {incomeRows.map((item) => {
              const amount = totals.income[item.key]

              const ratio =
                amount !== null && gross !== null && gross > 0
                  ? (amount / gross) * 100
                  : null

              return (
                <div
                  className="settlement-income-row"
                  key={item.key}
                  data-testid={`settlement-income-${item.key}`}
                >
                  <span>{item.label}</span>
                  <div
                    className="settlement-income-track"
                    role="img"
                    aria-label={`${item.label}占收入 ${
                      ratio === null ? "未知" : `${digits(ratio, 1)}%`
                    }`}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, ratio ?? 0))}%`,

                        background: "var(--ui-chart-primary)",
                      }}
                    />
                  </div>
                  <strong>{money(amount, currency)}</strong>
                  <span>{ratio === null ? "--" : `${digits(ratio, 1)}%`}</span>
                </div>
              )
            })}
          </div>
          <div className="settlement-costs">
            <span>扣减项目</span>
            {SETTLEMENT_COSTS.map((item) => (
              <div key={item.key}>
                <span>{item.label}</span>
                <strong>
                  {money(
                    totals.costs[item.key] === null
                      ? null
                      : -totals.costs[item.key]!,

                    currency,
                  )}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="settlement-progress" aria-label="结算进度">
          <div className="operations-section-heading">
            <h2>结算进度</h2>
            <span className="settlement-badge settlement-state--disputed">
              {disputed.length}项争议
            </span>
          </div>
          <div className="settlement-progress-list">
            {progress.map((item) => (
              <div className="settlement-progress-row" key={item.label}>
                <span>{item.label}</span>
                <progress
                  aria-label={item.label}
                  value={item.count}
                  max={Math.max(1, accounts.length)}
                />
                <strong>
                  {item.count} / {accounts.length}
                </strong>
              </div>
            ))}
          </div>
          <div
            className={`settlement-dispute-summary ${
              firstDispute ? "has-dispute" : ""
            }`}
          >
            {firstDispute ? (
              <>
                <span>
                  {firstDispute.station.name} ·{" "}
                  {firstDispute.disputeReason ?? "账目争议待复核"} ·{" "}
                  {money(firstDispute.totals.disputed, currency)}
                </span>
                <button
                  className="operations-link"
                  onClick={() =>
                    setDetail({ key: firstDispute.key, tab: "证据链" })
                  }
                >
                  查看
                  <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <span>
                {accounts.length ? "当前范围无争议记录" : "该周期暂无结算记录"}
              </span>
            )}
          </div>
        </section>
      </div>
      <section className="settlement-table-section">
        <div className="operations-section-heading">
          <h2>
            结算与对账明细 <span>{accounts.length}份合同</span>
          </h2>
          <div className="operations-actions">
            <label className="settlement-search">
              <Search size={13} />
              <input
                aria-label="搜索核算站点或合同"
                type="search"
                placeholder="站点 / 合同"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="对账排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="difference">差异优先</option>
              <option value="realized">收益优先</option>
              <option value="name">站点名称</option>
            </select>
          </div>
        </div>
        <div className="operations-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "站点 / 服务",

                  "周期",

                  "已实现",

                  "待结算",

                  "调整 / 罚则",

                  "结算状态",

                  "差异",

                  "证据",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((account) => (
                <tr key={account.key} data-station-id={account.station.id}>
                  <td>
                    <button
                      className="operations-link"
                      onClick={() =>
                        setDetail({ key: account.key, tab: "核算账目" })
                      }
                    >
                      {account.station.name}
                    </button>
                    <small className="settlement-service-name">
                      {account.records[0].service || account.contract}
                    </small>
                  </td>
                  <td className="settlement-numeric">
                    {account.start.slice(5)} - {account.end.slice(5)}
                  </td>
                  <td className="settlement-numeric">
                    {money(account.totals.realized, currency)}
                  </td>
                  <td className="settlement-numeric">
                    {money(account.totals.pending, currency)}
                  </td>
                  <td className="settlement-numeric">
                    {money(
                      completeSettlementMoney([
                        account.totals.adjustment,

                        account.totals.costs.penalty === null
                          ? null
                          : -account.totals.costs.penalty,
                      ]),

                      currency,
                    )}
                  </td>
                  <td>
                    <StatusBadge status={account.status} />
                    {account.balanceError && (
                      <small className="settlement-danger settlement-service-name">
                        金额待核验
                      </small>
                    )}
                  </td>
                  <td
                    className={`settlement-numeric ${
                      account.totals.difference ? "settlement-danger" : ""
                    }`}
                  >
                    {money(account.totals.difference, currency)}
                  </td>
                  <td>
                    <button
                      className="operations-link"
                      aria-label={`查看${account.station.name}证据链`}
                      onClick={() =>
                        setDetail({ key: account.key, tab: "证据链" })
                      }
                    >
                      证据链
                      <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!accounts.length && (
          <div className="operations-empty">
            该周期暂无符合条件的核算记录
            {(status || search) && (
              <button
                className="operations-link"
                onClick={() => {
                  setStatus("")

                  setSearch("")
                }}
              >
                重置筛选
              </button>
            )}
          </div>
        )}
        <footer className="settlement-footnote">
          {source} · {currency} · 已实现不含预估收益 ·
          争议金额按账目记录列示，不重复计入收入
        </footer>
      </section>
      {dateOpen && (
        <DateRangeDialog
          range={range}
          onClose={() => setDateOpen(false)}
          onApply={(value) => {
            setCustomRange(value)

            setPeriod(null)

            setDateOpen(false)
          }}
        />
      )}
      {selected && detail && (
        <AccountDrawer
          key={`${selected.key}:${range.start}:${range.end}`}
          account={selected}
          range={range}
          initialTab={detail.tab}
          onClose={() => setDetail(null)}
          onOpenStation={(id, tab) => {setDetail(null); onOpenStation(id, tab)}}
        />
      )}
    </div>
  )
}
