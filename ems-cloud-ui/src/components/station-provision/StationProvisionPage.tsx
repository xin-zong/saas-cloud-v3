import { useEffect, useRef, useState } from "react"

import type { Station } from "@/App"

import { DEMO_MODE, api } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import {
  useEditorLeaveGuard,
  type RegisterLeaveGuard,
} from "../useEditorLeaveGuard"

import { Button } from "../ui/Workspace"

import { Asset, Field, Modal } from "./Common"

import {
  provisionDraftKey,
  deviceTypes,
  emptyProvision,
  parseDraft,
  validateBasics,
  validateTopology,
  deploymentStages,
  type Device,
  type DeviceType,
  type ProvisionDraft,
} from "./model"

import "./station-entry.css"

const icon: Record<DeviceType, string> = {
  电网: "imgGrid",

  光伏: "imgPv",

  "光伏 DC/DC": "imgPvDcDc",

  PCS: "imgPcs",

  "电池 / BMS": "imgBattery",

  负载: "imgLoad",

  电表: "img",
}

const positions: Record<DeviceType, [number, number]> = {
  电网: [18, 15],

  光伏: [72, 43],

  "光伏 DC/DC": [72, 66],

  PCS: [39, 52],

  "电池 / BMS": [62, 83],

  负载: [83, 15],

  电表: [18, 30],
}

type PositionedDevice = Device & { x?: number; y?: number }

function initialFor(station?: Station): ProvisionDraft {
  return station
    ? {
        ...emptyProvision(),

        stationId: station.id,

        name: station.name,

        code: station.code,

        region: station.region,

        address: station.address,

        ratedPower: String(station.ratedPower),

        storageCapacity: String(station.storageCapacity),
      }
    : emptyProvision()
}

type Props = {
  station?: Station

  onBack: () => void

  registerLeaveGuard?: RegisterLeaveGuard
}

export default function StationProvisionPage(props: Props) {
  const { user } = useAuth()

  const storageKey = provisionDraftKey(
    user?.id ?? "anonymous",
    DEMO_MODE,
    props.station?.id,
  )

  return <ProvisionEditor key={storageKey} {...props} storageKey={storageKey} />
}

function ProvisionEditor({
  station,

  onBack,

  registerLeaveGuard,

  storageKey: key,
}: Props & { storageKey: string }) {
  const [draft, setDraft] = useState<ProvisionDraft>(() => {
    try {
      return parseDraft(localStorage.getItem(key)) ?? initialFor(station)
    } catch {
      return initialFor(station)
    }
  })

  const { user } = useAuth()

  const [customers, setCustomers] = useState<{
    id: number
    name: string
    can_edit: boolean
  }[]>([])

  const [customerLoading, setCustomerLoading] = useState(false)

  const [customerError, setCustomerError] = useState("")

  const [customerSearch, setCustomerSearch] = useState("")

  const canReadCustomers =
    !DEMO_MODE && !!user?.permissions.includes("customer.read")

  function revokeDraftCustomer() {
    setDraft((d) => d.customerId ? { ...d, customerId: null } : d)
    setPast([])
    setFuture([])
    try {
      const stored = parseDraft(localStorage.getItem(key))
      if (stored)
        localStorage.setItem(
          key,
          JSON.stringify({ ...stored, customerId: null }),
        )
    } catch {}
  }

  async function loadCustomers(signal?: AbortSignal) {
    setCustomerLoading(true)
    setCustomerError("")
    setCustomers([])
    try {
      const data = await api<{ id: number; name: string; can_edit: boolean }[]>(
        "/platform/customers",
        { signal },
      )
      if (signal?.aborted) return
      const allowed = data.filter((c) => c.can_edit)
      setCustomers(allowed)
      setDraft((d) =>
        d.customerId && !allowed.some((c) => String(c.id) === d.customerId)
          ? { ...d, customerId: null }
          : d,
      )
      try {
        const stored = parseDraft(localStorage.getItem(key))
        if (
          stored?.customerId &&
          !allowed.some((c) => String(c.id) === stored.customerId)
        ) {
          localStorage.setItem(
            key,
            JSON.stringify({ ...stored, customerId: null }),
          )
          setPast([])
          setFuture([])
        }
      } catch {}
    } catch (e) {
      if (!signal?.aborted) {
        setCustomerError(e instanceof Error ? e.message : "客户加载失败")
        revokeDraftCustomer()
      }
    } finally {
      if (!signal?.aborted) setCustomerLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    if (canReadCustomers) void loadCustomers(controller.signal)
    else {
      setCustomers([])
      revokeDraftCustomer()
    }
    return () => controller.abort()
  }, [
    user?.id,
    canReadCustomers,
    JSON.stringify(user?.stationPermissions),
    JSON.stringify(user?.organizationPermissions),
    JSON.stringify(user?.permissions),
  ])

  const [saved, setSaved] = useState(() => JSON.stringify(draft))

  const [step, setStep] = useState(station ? 1 : 0)

  const [selected, setSelected] = useState("")

  const [errors, setErrors] = useState<string[]>([])

  const [notice, setNotice] = useState("")

  const [modal, setModal] = useState<"leave" | "clear" | "publish" | null>(null)

  const [past, setPast] = useState<ProvisionDraft[]>([])

  const [future, setFuture] = useState<ProvisionDraft[]>([])

  const canvas = useRef<HTMLDivElement>(null)

  const file = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(draft) !== saved

  const { settleLeave } = useEditorLeaveGuard({
    dirty,
    registerLeaveGuard,

    onConfirm: () => setModal("leave"),
    onCancel: () => setModal(null),
  })

  function finishLeave() {
    settleLeave(true)

    onBack()
  }

  const device = draft.devices.find((d) => d.id === selected)

  const issues = validateTopology(draft.devices)

  const communication = draft.devices.filter(
    (d) => !["电网", "光伏", "负载"].includes(d.type),
  )

  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()

        e.returnValue = ""
      }
    }

    window.addEventListener("beforeunload", listener)

    return () => window.removeEventListener("beforeunload", listener)
  }, [dirty])

  function change(patch: Partial<ProvisionDraft>) {
    setPast((p) => [...p.slice(-39), draft])

    setFuture([])

    setDraft({ ...draft, ...patch })

    setNotice("")
  }

  function setField(key: keyof ProvisionDraft, value: string) {
    change({ [key]: value })

    setErrors([])
  }

  function updateDevice(patch: Partial<PositionedDevice>) {
    change({
      devices: draft.devices.map((d) =>
        d.id === selected ? { ...d, ...patch } : d,
      ),
    })
  }

  function addDevice(type: DeviceType) {
    const count = draft.devices.filter((d) => d.type === type).length

    const d: Device = {
      id: crypto.randomUUID(),

      type,

      name: `${type === "电池 / BMS" ? "电池簇" : type} ${count + 1}`,

      protocol: "",

      interface: type === "电池 / BMS" ? "COM 1" : "LAN 1",

      ip: "",

      port: "502",

      address: String(communication.length + 1),

      bus: draft.buses[0] ?? "",

      baud: "9600",

      parity: "无校验",

      bits: "8 / 1",
    }

    change({ devices: [...draft.devices, d] })

    setSelected(d.id)
  }

  function save() {
    try {
      if (
        draft.customerId &&
        (customerLoading ||
          customerError ||
          !customers.some((c) => String(c.id) === draft.customerId))
      ) {
        setErrors(["客户选项已失效，请重新选择后保存草稿"])
        return
      }

      localStorage.setItem(key, JSON.stringify(draft))

      setSaved(JSON.stringify(draft))

      setNotice("本地草稿已保存 · 仅保存在此浏览器，尚未发布")

      return true
    } catch {
      setErrors(["浏览器存储不可用或空间不足，请先移除大图片后重试"])

      return false
    }
  }

  function back() {
    if (dirty) setModal("leave")
    else onBack()
  }

  function next() {
    if (step === 0) {
      const e = validateBasics(draft)

      setErrors(e)

      if (e.length) return
    }

    setErrors([])

    setStep((s) => s + 1)
  }

  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          { ...draft, kind: "local-draft", deploymentStatus: "unavailable" },

          null,

          2,
        ),
      ],

      { type: "application/json" },
    )

    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")

    a.href = url

    a.download = `${draft.name || "station"}-本地草稿-v${draft.version}.json`

    a.click()

    URL.revokeObjectURL(url)
  }

  function undo() {
    const d = past.at(-1)

    if (!d) return

    setFuture((f) => [draft, ...f])

    setPast((p) => p.slice(0, -1))

    setDraft(d)
  }

  function redo() {
    const d = future[0]

    if (!d) return

    setPast((p) => [...p, draft])

    setFuture((f) => f.slice(1))

    setDraft(d)
  }

  const version = `V${draft.version}.0`

  return (
    <div
      className="station-provision station-entry-scope"
      data-design-node={
        step === 0
          ? "2136:8507"
          : step === 1
            ? "2136:8619"
            : step === 2
              ? "2136:8735"
              : "2136:8851"
      }
    >
      <header className="provision-heading">
        <button className="station-text-button" onClick={back}>
          ← 返回站点列表
        </button>
        <h1>
          {station
            ? `${station.name} · ${step === 3 ? "建站进度" : "编辑配置"}`
            : "新建站点"}{" "}
          <span className="station-muted-tag">本地草稿</span>
        </h1>
      </header>
      <nav className="provision-steps" aria-label="建站步骤">
        {["基础信息", "拓扑与设备", "校验发布", "部署结果"].map((label, i) => (
          <button
            key={label}
            aria-current={step === i ? "step" : undefined}
            onClick={() => {
              if (i === 0 || i <= step) {
                setErrors([])

                setStep(i)
              } else if (i === 1) next()
            }}
          >
            {i + 1} {label}
            {i === 1 && draft.version > 1 ? ` · ${version}` : ""}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="station-notice" role="status">
          {notice}
        </div>
      )}
      {errors.length > 0 && (
        <div className="station-error" role="alert">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <main className="provision-main">
        {step === 0 && (
          <section className="station-panel provision-basics">
            <h2>站点信息</h2>
            <div className="provision-form-grid">
              <Field label="站点名称 *">
                <input
                  value={draft.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="请输入站点名称"
                />
              </Field>
              <Field label="站点 ID">
                <input
                  value={draft.code}
                  onChange={(e) => setField("code", e.target.value)}
                  placeholder="请输入站点 ID（本地草稿标识）"
                />
              </Field>
              {!station && !DEMO_MODE && (
                <Field label="所属客户">
                  <div className="station-customer-selector">
                    {canReadCustomers && (
                      <input
                        aria-label="搜索草稿客户"
                        placeholder="搜索客户名称"
                        value={customerSearch}
                        disabled={customerLoading}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                    )}
                    <select
                      aria-label="所属客户"
                      disabled={
                        !canReadCustomers || customerLoading || !!customerError
                      }
                      value={
                        customers.some((c) => String(c.id) === draft.customerId)
                          ? (draft.customerId ?? "")
                          : ""
                      }
                      onChange={(e) =>
                        change({ customerId: e.target.value || null })
                      }
                    >
                      <option value="">
                        {customerLoading ? "正在加载客户…" : "未关联客户"}
                      </option>
                      {customers
                        .filter(
                          (c) =>
                            String(c.id) === draft.customerId ||
                            c.name.includes(customerSearch),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    <small>
                      仅保存草稿关联；站点创建服务接通后需再次核验。
                    </small>
                    {customerError && (
                      <>
                        <p role="alert" className="station-danger">
                          {customerError}
                        </p>
                        <button
                          className="station-text-button"
                          onClick={() => void loadCustomers()}
                        >
                          重试加载客户
                        </button>
                      </>
                    )}
                  </div>
                </Field>
              )}
              <Field label="所属组织">
                <input
                  value={draft.organization}
                  onChange={(e) => setField("organization", e.target.value)}
                  placeholder="填写所属组织，发布前需核验权限"
                />
              </Field>
              <Field label="站点类型 *">
                <select
                  value={draft.type}
                  onChange={(e) => setField("type", e.target.value)}
                >
                  {["工商业储能", "光储充", "光伏", "混合能源"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="所在地区 *">
                <select
                  value={draft.region}
                  onChange={(e) => setField("region", e.target.value)}
                >
                  <option value="">请选择地区</option>
                  {[
                    "华东",

                    "华南",

                    "华北",

                    "华中",

                    "西南",

                    "西北",

                    "东北",

                    "欧洲",

                    "北美",

                    "东南亚",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="时区 *">
                <select
                  value={draft.timezone}
                  onChange={(e) => setField("timezone", e.target.value)}
                >
                  {[
                    "Asia/Shanghai (UTC+08:00)",

                    "Europe/Berlin",

                    "America/New_York",

                    "UTC",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="详细地址 *" wide>
                <input
                  value={draft.address}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder="请输入详细地址"
                />
              </Field>
              <Field label="站点照片（选填）" wide>
                <div className="provision-photo">
                  {draft.imageUrl && (
                    <img src={draft.imageUrl} alt="站点照片预览" />
                  )}
                  <Button onClick={() => file.current?.click()}>
                    <Asset name="basic-imgIconActionUpload" />
                    上传站点照片
                  </Button>
                  {draft.imageUrl && (
                    <Button onClick={() => setField("imageUrl", "")}>
                      移除图片
                    </Button>
                  )}
                  <input
                    ref={file}
                    type="file"
                    accept="image/png,image/jpeg"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]

                      if (!f) return

                      if (
                        !["image/jpeg", "image/png"].includes(f.type) ||
                        f.size > 2 * 1024 * 1024
                      ) {
                        setErrors(["请选择 2 MB 以内的 JPG 或 PNG 图片"])

                        return
                      }

                      const reader = new FileReader()

                      reader.onload = () =>
                        setField("imageUrl", String(reader.result))

                      reader.readAsDataURL(f)
                    }}
                  />
                </div>
              </Field>
            </div>
          </section>
        )}
        {step === 1 && (
          <div className="provision-topology">
            <aside className="station-panel provision-palette">
              <h2>设备与母线</h2>
              {["交流母线", "直流母线"].map((bus) => (
                <Button
                  key={bus}
                  className={bus === "直流母线" ? "dc" : "ac"}
                  disabled={draft.buses.includes(bus)}
                  onClick={() => change({ buses: [...draft.buses, bus] })}
                >
                  ＋ {bus}
                </Button>
              ))}
              <div className="palette-devices">
                {deviceTypes.map((type) => (
                  <Button key={type} onClick={() => addDevice(type)}>
                    <span className="palette-icon">
                      <Asset name={`topology-${icon[type]}`} />
                    </span>
                    {type}
                  </Button>
                ))}
              </div>
            </aside>
            <section className="station-panel provision-canvas-panel">
              <header>
                <h2>电气拓扑</h2>
                <div>
                  <Button
                    aria-label="撤销"
                    disabled={!past.length}
                    onClick={undo}
                  >
                    <Asset name="topology-imgFrame" />
                    撤销
                  </Button>
                  <Button
                    aria-label="重做"
                    disabled={!future.length}
                    onClick={redo}
                  >
                    <Asset name="topology-imgFrame1" />
                    重做
                  </Button>
                  <Button
                    disabled={!device}
                    onClick={() => {
                      change({
                        devices: draft.devices.filter((d) => d.id !== selected),
                      })

                      setSelected("")
                    }}
                  >
                    删除
                  </Button>
                  <Button
                    disabled={!draft.devices.length && !draft.buses.length}
                    onClick={() => setModal("clear")}
                  >
                    清空
                  </Button>
                  <Button
                    onClick={() => {
                      change({
                        devices: draft.devices.map(
                          ({ x: _, y: __, ...d }: PositionedDevice) => d,
                        ),
                      })
                    }}
                  >
                    适应画布
                  </Button>
                </div>
              </header>
              <div
                ref={canvas}
                className="provision-canvas"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()

                  const id = e.dataTransfer.getData("text/plain")

                  const rect = canvas.current?.getBoundingClientRect()

                  if (!rect) return

                  const x = Math.max(
                    8,

                    Math.min(90, ((e.clientX - rect.left) / rect.width) * 100),
                  )

                  const y = Math.max(
                    9,

                    Math.min(90, ((e.clientY - rect.top) / rect.height) * 100),
                  )

                  change({
                    devices: draft.devices.map((d) =>
                      d.id === id ? { ...d, x, y } : d,
                    ),
                  })
                }}
              >
                <svg
                  className="topology-lines"
                  width="100%"
                  height="100%"
                  aria-hidden="true"
                >
                  {draft.buses.map((b, i) => (
                    <line
                      key={b}
                      x1="8%"
                      x2="93%"
                      y1={`${i === 0 ? 41 : 73}%`}
                      y2={`${i === 0 ? 41 : 73}%`}
                      stroke={b === "交流母线" ? "#4a7ea1" : "#d99000"}
                      strokeWidth="2"
                    />
                  ))}
                  {draft.devices.map((d: PositionedDevice, i) => {
                    const b = draft.buses.indexOf(d.bus)

                    const p = positions[d.type]

                    const duplicate = draft.devices

                      .slice(0, i)

                      .filter((x) => x.type === d.type).length

                    const x = d.x ?? Math.min(90, p[0] + duplicate * 12),
                      y = d.y ?? p[1]

                    return b >= 0 ? (
                      <line
                        key={d.id}
                        x1={`${x}%`}
                        x2={`${x}%`}
                        y1={`${y}%`}
                        y2={`${b === 0 ? 41 : 73}%`}
                        stroke={d.bus === "交流母线" ? "#4a7ea1" : "#d99000"}
                        strokeWidth="2"
                      />
                    ) : null
                  })}
                </svg>
                {draft.buses.map((b, i) => (
                  <span
                    className={`topology-bus ${b === "交流母线" ? "ac" : "dc"}`}
                    key={b}
                    style={{ top: `${i === 0 ? 36 : 68}%` }}
                  >
                    {b}
                    {b === "交流母线" ? " · 400 V" : ""}
                  </span>
                ))}
                {!draft.devices.length && (
                  <div className="provision-empty">
                    <strong>开始配置电气拓扑</strong>
                    <p>添加母线和设备，在右侧选择连接的母线。</p>
                    <p>设备支持拖动；所有内容仅保存为本地草稿。</p>
                  </div>
                )}
                {draft.devices.map((d: PositionedDevice, i) => {
                  const p = positions[d.type],
                    duplicate = draft.devices

                      .slice(0, i)

                      .filter((x) => x.type === d.type).length

                  return (
                    <button
                      key={d.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", d.id)
                      }
                      onClick={() => setSelected(d.id)}
                      className={`topology-device ${
                        d.id === selected ? "selected" : ""
                      }`}
                      style={{
                        left: `${d.x ?? Math.min(90, p[0] + duplicate * 12)}%`,

                        top: `${d.y ?? p[1]}%`,
                      }}
                      aria-label={`配置 ${d.name}`}
                    >
                      <span>{d.name}</span>
                      <Asset name={`topology-${icon[d.type]}`} />
                      {d.type === "电池 / BMS" && <small>BMS 配置</small>}
                    </button>
                  )
                })}
              </div>
            </section>
            <aside className="station-panel provision-properties">
              <h2>
                {device
                  ? `${device.name}${
                      device.type === "电池 / BMS" ? " · BMS 配置" : ""
                    }`
                  : "设备属性"}
              </h2>
              {device ? (
                <>
                  <Field label="逻辑设备名称">
                    <input
                      value={device.name}
                      onChange={(e) => updateDevice({ name: e.target.value })}
                    />
                  </Field>
                  <Field label="设备类型">
                    <input readOnly value={device.type} />
                  </Field>
                  <Field label="连接母线 *">
                    <select
                      value={device.bus}
                      onChange={(e) => updateDevice({ bus: e.target.value })}
                    >
                      <option value="">请选择母线</option>
                      {draft.buses.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </Field>
                  {!["电网", "光伏", "负载"].includes(device.type) && (
                    <>
                      <Field label="协议模板 *">
                        <select
                          value={device.protocol}
                          onChange={(e) =>
                            updateDevice({ protocol: e.target.value })
                          }
                        >
                          <option value="">请选择通信协议</option>
                          <option>Modbus TCP</option>
                          <option>Modbus RTU</option>
                        </select>
                      </Field>
                      <small>本地协议设置，服务端模板尚未接通</small>
                      <Field label="EMS 接口 *">
                        <select
                          value={device.interface}
                          onChange={(e) =>
                            updateDevice({ interface: e.target.value })
                          }
                        >
                          {["LAN 1", "LAN 2", "COM 1", "COM 2"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                      {device.interface.startsWith("LAN") ? (
                        <>
                          <Field label="IP 地址 *">
                            <input
                              value={device.ip}
                              onChange={(e) =>
                                updateDevice({ ip: e.target.value })
                              }
                              placeholder="例如 192.168.1.101"
                            />
                          </Field>
                          <Field label="端口 *">
                            <input
                              inputMode="numeric"
                              value={device.port}
                              onChange={(e) =>
                                updateDevice({ port: e.target.value })
                              }
                            />
                          </Field>
                        </>
                      ) : (
                        <div className="bms-fields">
                          <Field label="波特率 *">
                            <select
                              value={device.baud}
                              onChange={(e) =>
                                updateDevice({ baud: e.target.value })
                              }
                            >
                              {[
                                "9600",

                                "19200",

                                "38400",

                                "57600",

                                "115200",
                              ].map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="校验位 *">
                            <select
                              value={device.parity}
                              onChange={(e) =>
                                updateDevice({ parity: e.target.value })
                              }
                            >
                              {["无校验", "奇校验", "偶校验"].map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="数据位 / 停止位">
                            <select
                              value={device.bits}
                              onChange={(e) =>
                                updateDevice({ bits: e.target.value })
                              }
                            >
                              <option>8 / 1</option>
                              <option>8 / 2</option>
                            </select>
                          </Field>
                        </div>
                      )}
                      <Field label="设备地址 *">
                        <input
                          inputMode="numeric"
                          value={device.address}
                          onChange={(e) =>
                            updateDevice({ address: e.target.value })
                          }
                        />
                      </Field>
                    </>
                  )}
                </>
              ) : (
                <p className="station-subtle">
                  从画布选择设备，或在左侧添加新设备。
                </p>
              )}
            </aside>
          </div>
        )}
        {step === 2 && (
          <div className="provision-validation">
            <section className="station-panel">
              <h2>配置校验</h2>
              <p
                className={issues.length ? "station-danger" : "station-accent"}
              >
                {issues.length
                  ? `发现 ${issues.length} 项待修正`
                  : "本地校验通过"}
              </p>
              {[
                [
                  "电气连接",

                  draft.devices.length && draft.devices.every((d) => d.bus)
                    ? "设备已连接到所选母线"
                    : "请添加设备并配置母线连接",
                ],

                ["设备协议", "仅检查本地通信字段；协议模板兼容性需服务端核验"],

                [
                  "通信地址",

                  issues.length
                    ? issues.join("；")
                    : "IP、端口与设备地址格式正确，未发现重复地址",
                ],

                ["配置完整性", "发布服务未接通，尚未进行现场可用性校验"],
              ].map(([title, detail]) => (
                <div className="validation-item" key={title}>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              ))}
            </section>
            <aside className="station-panel">
              <h2>发布内容</h2>
              <h3>{draft.name || "未命名站点"}配置</h3>
              <p>配置版本　{version} · 本地草稿</p>
              <dl>
                <dt>EMS 绑定</dt>
                <dd>未接通，未绑定</dd>
                <dt>拓扑对象</dt>
                <dd>{draft.devices.length + draft.buses.length}</dd>
                <dt>通信设备</dt>
                <dd>{communication.length}</dd>
                <dt>部署方式</dt>
                <dd>手机现场传输（服务未接通）</dd>
              </dl>
              <p className="station-subtle">
                本地校验通过不代表配置已发布或现场已生效。
              </p>
            </aside>
          </div>
        )}
        {step === 3 && (
          <div className="provision-results">
            <section className="station-panel">
              <header>
                <div>
                  <h2>部署服务未接通</h2>
                  <p>
                    {draft.name || "未命名站点"}配置 · {version} · 尚未发布
                  </p>
                </div>
                <Button onClick={download}>下载本地草稿</Button>
              </header>
              <div className="deployment-stages">
                {deploymentStages.map((s) => (
                  <div key={s.label}>
                    <span>○</span>
                    {s.label}
                    <small>未接通</small>
                  </div>
                ))}
              </div>
              <div className="deployment-meta">
                <span>EMS：未获取绑定结果</span>
                <span>发布 / 生效配置：— / —</span>
              </div>
            </section>
            <section className="station-panel">
              <header>
                <h2>设备关联结果</h2>
                <Button
                  onClick={() =>
                    setNotice("部署结果服务尚未接通，没有可刷新的现场结果。")
                  }
                >
                  刷新结果
                </Button>
              </header>
              <table className="station-table">
                <thead>
                  <tr>
                    {[
                      "设备",

                      "类型",

                      "通信地址",

                      "实际设备序列号",

                      "关联结果",
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {communication.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{d.type}</td>
                      <td>
                        {d.interface} /{" "}
                        {d.interface.startsWith("LAN")
                          ? `${d.ip}:${d.port}`
                          : `地址 ${d.address}`}
                      </td>
                      <td>—</td>
                      <td>未获取结果</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!communication.length && (
                <div className="station-table-empty">暂无通信设备关联结果</div>
              )}
              <details className="deployment-help">
                <summary>部署状态与异常处理说明</summary>
                <p>
                  待现场部署：发布服务接通后才能下载正式配置。部署中：等待真实设备关联结果。设备关联异常：查看实际通信错误并修正配置。EMS
                  绑定失败：重新连接现场 EMS
                  后重试。结果待回传：等待设备返回最终状态。设备关联完成：须以实际返回结果确认，当前无完成记录。
                </p>
              </details>
            </section>
          </div>
        )}
      </main>
      <footer className="provision-footer">
        {step < 3 ? (
          <Button onClick={save}>保存草稿</Button>
        ) : (
          <Button
            onClick={() => {
              change({ version: draft.version + 1 })

              setStep(1)

              setNotice("已创建新版本本地草稿，现场生效版本未知。")
            }}
          >
            新版本配置草稿
          </Button>
        )}
        <div>
          {step > 0 && step < 3 && (
            <Button
              onClick={() => {
                setErrors([])

                setStep((s) => s - 1)
              }}
            >
              上一步
            </Button>
          )}
          {step < 2 && (
            <Button variant="primary" onClick={next}>
              {step === 0 ? "下一步" : "校验配置"}
            </Button>
          )}
          {step === 2 && (
            <>
              <Button onClick={() => setStep(3)}>查看部署结果</Button>
              <Button
                variant="primary"
                onClick={() =>
                  issues.length ? setStep(1) : setModal("publish")
                }
              >
                {issues.length ? "返回修改" : "发布配置"}
              </Button>
            </>
          )}
          {step === 3 && (
            <Button variant="primary" onClick={back}>
              返回站点列表
            </Button>
          )}
        </div>
      </footer>
      {modal === "clear" && (
        <Modal
          title="清空画布？"
          onClose={() => setModal(null)}
          actions={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                className="station-danger-button"
                onClick={() => {
                  change({ devices: [], buses: [] })

                  setSelected("")

                  setModal(null)
                }}
              >
                确认清空
              </Button>
            </>
          }
        >
          <p>将移除画布中的全部设备和连线，是否继续？</p>
        </Modal>
      )}
      {modal === "leave" && (
        <Modal
          title="未保存的更改"
          onClose={() => {
            settleLeave(false)
            setModal(null)
          }}
          actions={
            <>
              <Button
                onClick={() => {
                  settleLeave(false)
                  setModal(null)
                }}
              >
                取消
              </Button>
              <Button onClick={finishLeave}>不保存离开</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (save()) finishLeave()
                }}
              >
                保存并离开
              </Button>
            </>
          }
        >
          <p>你有未保存的本地草稿内容，确定要离开吗？</p>
        </Modal>
      )}
      {modal === "publish" && (
        <Modal
          title="暂时无法发布配置"
          onClose={() => setModal(null)}
          actions={
            <>
              <Button onClick={() => setModal(null)}>返回编辑</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (save()) {
                    setModal(null)

                    setStep(3)
                  }
                }}
              >
                保存本地草稿并查看结果
              </Button>
            </>
          }
        >
          <p>
            配置发布、EMS
            绑定及现场部署服务尚未接通。当前内容只能保存为本地草稿，没有生成发布记录，也不会下发到设备。
          </p>
        </Modal>
      )}
    </div>
  )
}
