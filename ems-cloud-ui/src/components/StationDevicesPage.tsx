import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { DEMO_MODE } from "@/api/client"
import EmsPanel from "./EmsPanel"
import "./station-devices-figma.css"
import {
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  Search,
  Server,
  X,
} from "lucide-react"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { Station } from "@/App"

import { stationDataNow } from "@/data/dataClock"

import {
  DEVICE_STATUS_LABEL,
  demoStationDevices,
  formatPoint,
  pointValue,
  type DeviceField,
  type DevicePoint,
  type DeviceStatus,
  type StationDevice,
} from "@/data/stationDevices"

type DeviceTab = "概况" | "参数" | "告警" | "版本" | "操作记录"

const TABS: DeviceTab[] = ["概况", "告警", "操作记录"]
const timeText = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString("zh-CN", { hour12: false })
    : "--"

const dateText = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "--"

function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <span className={`device-status device-status--${status}`}>
      <i />
      {DEVICE_STATUS_LABEL[status]}
    </span>
  )
}

function DeviceFields({
  fields,
  points,
}: {
  fields: DeviceField[]
  points?: DevicePoint[]
}) {
  return (
    <dl className="device-fields">
      {fields.map((field, index) => (
        <div key={`${field.label}-${index}`}>
          <dt>{field.label}</dt>
          <dd>
            {field.pointId
              ? formatPoint(points?.find((point) => point.id === field.pointId))
              : field.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function DeviceDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      className="device-dialog"
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="device-icon-button"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="device-dialog-body">{children}</div>
    </dialog>
  )
}

function PointsTable({ points }: { points: DevicePoint[] }) {
  return (
    <div className="device-points-table">
      <table>
        <thead>
          <tr>
            <th>测点</th>
            <th>当前值</th>
            <th>质量</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const valid = pointValue(point) !== null

            return (
              <tr key={point.id}>
                <td>{point.label}</td>
                <td>{formatPoint(point)}</td>
                <td className={valid ? "device-good" : "device-bad"}>
                  {valid ? "有效" : "无效 / 缺失"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!points.length && <div className="device-empty">暂无测点数据</div>}
    </div>
  )
}

function DeviceDetails({
  device,
  station,
  isDemo,
}: {
  device: StationDevice
  station: Station
  isDemo: boolean
}) {
  const [tab, setTab] = useState<DeviceTab>("概况")

  const [archiveOpen, setArchiveOpen] = useState(false)

  const [alarmPreview, setAlarmPreview] =
    useState<StationDevice["alarms"][number] | null>(null)

  const good = device.points.filter(
    (point) => pointValue(point) !== null,
  ).length

  const quality = device.points.length
    ? `${((good / device.points.length) * 100).toFixed(1)}%`
    : "--"

  const activeAlarms = device.alarms.filter((alarm) => alarm.active)

  const identity: DeviceField[] = [
    { label: "型号", value: device.model },
    { label: "序列号", value: device.serial },
    { label: "固件", value: device.firmware },
    { label: "投运日期", value: device.commissionedAt },
  ]

  return (
    <section className="device-details" aria-label="所选设备详情">
      <header className="device-detail-heading">
        <h2>{device.name}</h2>
        <StatusBadge status={device.status} />
      </header>
      <p className="device-sync">
        最近采集 {timeText(device.updatedAt)}{" "}
        <span>
          · 延迟 {device.latencyMs === null ? "--" : `${device.latencyMs} ms`}
        </span>
        <span>· 质量 {quality}</span>
      </p>
      <div className="device-tabs" role="tablist" aria-label="设备信息标签">
        {TABS.map((item) => (
          <button
            type="button"
            key={item}
            role="tab"
            aria-selected={item === tab}
            aria-controls="device-tab-panel"
            id={`device-tab-${item}`}
            onClick={() => setTab(item)}
          >
            {item === "操作记录" ? "控制记录" : item}
            {item === "告警" && activeAlarms.length > 0 && (
              <span>{activeAlarms.length}</span>
            )}
          </button>
        ))}
      </div>
      <div
        id="device-tab-panel"
        role="tabpanel"
        aria-labelledby={`device-tab-${tab}`}
        className="device-tab-content"
      >
        {tab === "概况" && (
          <>
            <section className="device-info-band device-info-band--tinted">
              <h3>设备档案</h3>
              <DeviceFields
                fields={[
                  {
                    label: "生产厂家",
                    value:
                      device.parameters.find((item) =>
                        /厂家|制造商/.test(item.label),
                      )?.value || "—",
                  },
                  ...identity,
                  { label: "设备编号", value: device.code },
                ]}
              />
            </section>
            <section className="device-info-band device-info-band--tinted">
              <h3>厂家额定参数</h3>
              <DeviceFields
                fields={
                  device.limits.length
                    ? device.limits
                    : [
                        { label: "额定功率", value: "—" },
                        { label: "额定电压", value: "—" },
                        { label: "额定电流", value: "—" },
                        { label: "额定频率", value: "—" },
                      ]
                }
              />
            </section>
          </>
        )}
        {tab === "参数" && (
          <section className="device-info-band">
            <div className="device-section-title">
              <h3>设备运行参数</h3>
              <span>共 {device.parameters.length} 项</span>
            </div>
            <div className="device-table-scroll">
              <table className="device-record-table">
                <thead>
                  <tr>
                    <th>参数名称</th>
                    <th>当前值</th>
                  </tr>
                </thead>
                <tbody>
                  {device.parameters.map((parameter, index) => (
                    <tr key={index}>
                      <td>{parameter.label}</td>
                      <td>{parameter.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!device.parameters.length && (
              <div className="device-empty">暂无参数数据</div>
            )}
          </section>
        )}
        {tab === "告警" && (
          <section className="device-info-band">
            <div className="device-table-scroll">
              <table className="device-record-table">
                <thead>
                  <tr>
                    {["等级", "告警内容", "发生时间", "状态", "操作"].map(
                      (label) => (
                        <th key={label}>{label}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {device.alarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>{alarm.severity === "critical" ? "严重" : "一般"}</td>
                      <td>{alarm.title}</td>
                      <td>{dateText(alarm.at)}</td>
                      <td>{alarm.active ? "活动" : "已恢复"}</td>
                      <td>
                        <button
                          className="device-link"
                          onClick={() => setAlarmPreview(alarm)}
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!device.alarms.length && (
                <div className="device-empty">暂无关联告警</div>
              )}
            </div>
          </section>
        )}
        {tab === "版本" && (
          <section className="device-info-band">
            <h3>固件版本记录</h3>
            {device.versions.length ? (
              <ol className="device-version-list">
                {device.versions.map((version) => (
                  <li key={`${version.version}-${version.at}`}>
                    <div>
                      <strong>{version.version}</strong>
                      {version.current && (
                        <span className="device-version-current">当前版本</span>
                      )}
                      <time>{dateText(version.at)}</time>
                    </div>
                    <p>{version.note}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="device-empty">暂无版本记录</div>
            )}
          </section>
        )}
        {tab === "操作记录" && (
          <section className="device-info-band">
            <h3>操作记录</h3>
            <div className="device-table-scroll">
              <table className="device-record-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作</th>
                    <th>操作人</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {device.logs.map((log, index) => (
                    <tr key={index}>
                      <td>{dateText(log.at)}</td>
                      <td>{log.action}</td>
                      <td>{log.operator}</td>
                      <td>{log.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!device.logs.length && (
              <div className="device-empty">暂无操作记录</div>
            )}
          </section>
        )}
      </div>
      <footer>
        <button
          type="button"
          className="device-action"
          onClick={() => setArchiveOpen(true)}
        >
          查看完整设备档案
          <ArrowRight size={14} />
        </button>
      </footer>
      {alarmPreview && (
        <DeviceDialog
          title="设备告警详情"
          onClose={() => setAlarmPreview(null)}
        >
          <h3>{alarmPreview.title}</h3>
          <DeviceFields
            fields={[
              { label: "告警编号", value: alarmPreview.id },
              { label: "设备", value: device.name },
              { label: "发生时间", value: dateText(alarmPreview.at) },
              {
                label: "级别",
                value: alarmPreview.severity === "critical" ? "严重" : "一般",
              },
              { label: "状态", value: alarmPreview.active ? "活动" : "已恢复" },
            ]}
          />
        </DeviceDialog>
      )}
      {archiveOpen && (
        <DeviceDialog
          title={`${device.name} · 完整设备档案`}
          onClose={() => setArchiveOpen(false)}
        >
          <p className="device-archive-source">
            {station.name} · {isDemo ? "示例设备档案" : "已接入设备档案"}
          </p>
          <DeviceFields
            fields={[
              ...identity,
              { label: "设备编号", value: device.code },
              { label: "所属系统", value: device.group },
              { label: "运行状态", value: DEVICE_STATUS_LABEL[device.status] },
              { label: "站点", value: station.name },
              { label: "安装地址", value: station.address || "--" },
              { label: "负责人", value: station.manager || "--" },
              { label: "联系电话", value: station.phone || "--" },
              { label: "最近采集", value: dateText(device.updatedAt) },
            ]}
          />
          <h3 className="device-archive-heading">能力与运行边界</h3>
          <DeviceFields fields={device.limits} />
          <h3 className="device-archive-heading">运行参数</h3>
          <DeviceFields fields={device.parameters} />
          <h3 className="device-archive-heading">实时测点</h3>
          <PointsTable points={device.points} />
          <h3 className="device-archive-heading">固件版本记录</h3>
          {device.versions.length ? (
            device.versions.map((version) => (
              <p key={version.version + version.at}>
                {version.version} · {dateText(version.at)} · {version.note}
              </p>
            ))
          ) : (
            <p>暂无版本记录</p>
          )}
        </DeviceDialog>
      )}
    </section>
  )
}

function RealtimePoints({
  device,
  now,
}: {
  device: StationDevice
  now: number
}) {
  const [allOpen, setAllOpen] = useState(false)

  const [query, setQuery] = useState("")

  const primary = device.points.find(
    (point) => point.id === device.primaryPointId,
  )

  const rows = device.trend
    .map((sample) => ({
      timestamp: Date.parse(sample.at),
      value:
        typeof sample.value === "number" && Number.isFinite(sample.value)
          ? sample.value
          : null,
      target:
        typeof sample.target === "number" && Number.isFinite(sample.target)
          ? sample.target
          : null,
    }))
    .filter((sample) => Number.isFinite(sample.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)

  const age = Number.isFinite(Date.parse(device.updatedAt))
    ? Math.max(0, Math.round((now - Date.parse(device.updatedAt)) / 1000))
    : null

  return (
    <aside className="device-realtime" aria-label="实时测点">
      <header className="device-section-title">
        <h2>实时测点</h2>
        <span>
          {age === null
            ? "暂无采样"
            : age < 3
              ? "刚刚更新"
              : age < 60
                ? `${age} 秒前`
                : `${Math.floor(age / 60)} 分钟前`}
        </span>
      </header>
      <div className="device-power-chart">
        <div className="device-primary-reading">
          <div>
            <h3>{primary?.label ?? "运行趋势"}</h3>
            <strong data-device-primary>{formatPoint(primary)}</strong>
          </div>
          <span>
            {device.status === "offline"
              ? "离线"
              : rows.length > 1
                ? `${Math.round((rows[rows.length - 1].timestamp - rows[0].timestamp) / 1000)} 秒趋势`
                : "采样趋势"}
          </span>
        </div>
        {rows.some((row) => row.value !== null) ? (
          <div className="device-sparkline" data-device-chart={device.id}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={rows}
                margin={{ top: 8, left: 0, right: 0, bottom: 4 }}
              >
                <CartesianGrid vertical={false} stroke="#e5ecef" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  hide
                />
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  labelFormatter={(value) =>
                    timeText(new Date(Number(value)).toISOString())
                  }
                  formatter={(value, name) => [
                    `${value} ${primary?.unit ?? ""}`,
                    name === "value" ? "实测值" : "参考值",
                  ]}
                  contentStyle={{ fontSize: 11, borderRadius: 5 }}
                />
                <Line
                  dataKey="value"
                  stroke="#4386b3"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="target"
                  stroke="#82949d"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="device-trend-empty">暂无趋势数据</div>
        )}
      </div>
      <PointsTable points={device.points.slice(0, 8)} />
      <footer>
        <button
          type="button"
          className="device-link"
          disabled={!device.points.length}
          onClick={() => {
            setQuery("")
            setAllOpen(true)
          }}
        >
          查看全部 {device.points.length} 个测点
          <ArrowRight size={13} />
        </button>
      </footer>
      {allOpen && (
        <DeviceDialog
          title={`${device.name} · 全部测点`}
          onClose={() => setAllOpen(false)}
        >
          <label className="device-search">
            <Search size={14} />
            <input
              aria-label="搜索测点"
              placeholder="搜索测点名称或编号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <PointsTable
            points={device.points.filter((point) =>
              `${point.id}${point.label}`
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
            )}
          />
        </DeviceDialog>
      )}
    </aside>
  )
}

export default function StationDevicesPage({
  station,
  initialDeviceId,
}: {
  station: Station
  initialDeviceId?: string
}) {
  const [filter, setFilter] = useState<"all" | DeviceStatus>("all")

  const [search, setSearch] = useState("")

  const [selectedId, setSelectedId] = useState(initialDeviceId ?? "PCS-01")
  const [now, setNow] = useState(() => stationDataNow(station).getTime())

  const [notice, setNotice] = useState("")

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(stationDataNow(station).getTime()),
      2000,
    )
    return () => window.clearInterval(timer)
  }, [station])

  const isDemo = DEMO_MODE && station.deviceInventory === undefined
  const devices = useMemo(
    () =>
      station.deviceInventory ??
      (DEMO_MODE ? demoStationDevices(station, now) : []),
    [station, now],
  )
  const filtered = devices.filter(
    (device) =>
      (filter === "all" || device.status === filter) &&
      `${device.name} ${device.code} ${device.serial}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  )

  const selected =
    filtered.find((device) => device.id === selectedId) ?? filtered[0] ?? null

  const groups = [...new Set(filtered.map((device) => device.group))]

  const filters: { id: "all" | DeviceStatus; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "online", label: "在线" },
    { id: "warning", label: "告警" },
    { id: "offline", label: "离线" },
  ]

  function exportDevices() {
    const rows = [
      [
        "设备名称",
        "设备编号",
        "系统",
        "状态",
        "型号",
        "序列号",
        "固件",
        "投运日期",
        "采集时间",
        "测点",
        "当前值",
        "单位",
        "质量",
      ],
      ...filtered.flatMap((device) =>
        (device.points.length ? device.points : [null]).map((point) => [
          device.name,
          device.code,
          device.group,
          DEVICE_STATUS_LABEL[device.status],
          device.model,
          device.serial,
          device.firmware,
          device.commissionedAt,
          device.updatedAt,
          point?.label ?? "",
          pointValue(point ?? undefined) === null ? "" : String(point?.value),
          point?.unit ?? "",
          pointValue(point ?? undefined) === null ? "无效 / 缺失" : "有效",
        ]),
      ),
    ]

    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              `"${(/^[=+@\t\r]/.test(value) || (/^-/.test(value) && !Number.isFinite(Number(value))) ? "'" + value : value).replace(/"/g, '""')}"`,
          )
          .join(","),
      )
      .join("\r\n")

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    )

    const link = document.createElement("a")
    link.href = url
    link.download = `${station.code}-设备测点.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    setNotice(`已导出 ${filtered.length} 台设备及关联测点`)
  }

  return (
    <div className="station-devices-page">
      <EmsPanel stations={[station]} module="assets" deviceId={selected?.id} />
      <header className="device-toolbar">
        <h1>设备详情</h1>
        <div className="device-filters" role="group" aria-label="设备状态筛选">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>
                {item.id === "all"
                  ? devices.length
                  : devices.filter((device) => device.status === item.id)
                      .length}
              </span>
            </button>
          ))}
        </div>
        <label className="device-search">
          <Search size={14} />
          <input
            aria-label="搜索设备"
            placeholder="搜索设备名称、编号或序列号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="device-icon-button"
              title="清空搜索"
              aria-label="清空搜索"
              onClick={() => setSearch("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
        <button
          type="button"
          className="device-action device-export"
          onClick={exportDevices}
          disabled={!filtered.length}
        >
          <Download size={14} />
          导出设备数据
        </button>
      </header>
      <div className="device-data-source">
        <span>
          {station.name} ·{" "}
          {isDemo ? "示例设备数据 · 2 s 刷新" : "已接入设备数据"}
        </span>
        <span role="status">{notice}</span>
      </div>
      <div className="device-workspace">
        <aside className="device-directory" aria-label="设备目录">
          <header>
            <h2>设备目录</h2>
            <span>按系统与设备层级</span>
          </header>
          {groups.map((group) => (
            <section key={group}>
              <h3>
                {group}
                <span>
                  {filtered.filter((device) => device.group === group).length}
                </span>
              </h3>
              {filtered
                .filter((device) => device.group === group)
                .map((device) => (
                  <button
                    type="button"
                    key={device.id}
                    className={`device-directory-item${
                      selected?.id === device.id ? " is-selected" : ""
                    }`}
                    aria-pressed={selected?.id === device.id}
                    aria-label={`选择 ${device.name}`}
                    onClick={() => setSelectedId(device.id)}
                  >
                    <i className={`device-dot--${device.status}`} />
                    <span>
                      <strong>{device.name}</strong>
                      <small title={device.code}>{device.code}</small>
                    </span>
                  </button>
                ))}
            </section>
          ))}
        </aside>
        {selected ? (
          <>
            <DeviceDetails
              key={selected.id}
              device={selected}
              station={station}
              isDemo={isDemo}
            />
            <RealtimePoints
              key={`points-${selected.id}`}
              device={selected}
              now={now}
            />
          </>
        ) : (
          <div className="device-no-selection">
            <Server size={28} />
            <h2>{devices.length ? "暂无符合条件的设备" : "暂无设备数据"}</h2>
            {devices.length > 0 && (
              <button
                type="button"
                className="device-action"
                onClick={() => {
                  setFilter("all")
                  setSearch("")
                }}
              >
                重置筛选
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
