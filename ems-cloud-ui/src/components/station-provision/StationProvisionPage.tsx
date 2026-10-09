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
  emptyProvision,
  parseDraft,
  validateBasics,
  deploymentStages,
  type DeviceType,
  type ProvisionDraft,
} from "./model"

import "./station-entry.css"

import TopologyEditor, { NodeIcon } from "./TopologyEditor"

import { templates, buildTemplate, validateGraph } from "./model"

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
    setDraft((d) => (d.customerId ? { ...d, customerId: null } : d))

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

  const customerRequest = useRef(0)

  async function loadCustomers(signal?: AbortSignal) {
    const request = ++customerRequest.current

    setCustomerLoading(true)

    setCustomerError("")

    setCustomers([])

    try {
      const data = await api<{ id: number; name: string; can_edit: boolean }[]>(
        "/platform/customers",

        { signal },
      )

      if (signal?.aborted || request !== customerRequest.current) return

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
      if (!signal?.aborted && request === customerRequest.current) {
        setCustomerError(e instanceof Error ? e.message : "客户加载失败")

        revokeDraftCustomer()
      }
    } finally {
      if (!signal?.aborted && request === customerRequest.current)
        setCustomerLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    if (canReadCustomers) void loadCustomers(controller.signal)
    else {
      setCustomerLoading(false)

      setCustomerError("")

      setCustomers([])

      revokeDraftCustomer()
    }

    return () => {
      customerRequest.current++

      controller.abort()
    }
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

  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null)

  const [modal, setModal] = useState<"leave" | "clear" | "publish" | null>(null)

  const [past, setPast] = useState<ProvisionDraft[]>([])

  const [future, setFuture] = useState<ProvisionDraft[]>([])

  useEffect(() => {
    if (DEMO_MODE || !station || localStorage.getItem(key)) return
    const controller = new AbortController()
    const initial = JSON.stringify(draft)
    api<ProvisionDraft>(`/stations/${station.id}/provision-design`, { signal: controller.signal })
      .then((record) => {
        const parsed = parseDraft(JSON.stringify(record))
        if (!parsed || controller.signal.aborted) return
        setDraft((current) => JSON.stringify(current) === initial ? parsed : current)
        setSaved(JSON.stringify(parsed))
      })
      .catch(() => { /* Existing stations without a saved engineering design keep their local draft. */ })
    return () => controller.abort()
  }, [station?.id, key])

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

  const issues = validateGraph(draft)

  const communication = draft.devices.filter(
    (d) => !["电网", "负载", "变压器", "交流母线", "断路器"].includes(d.type),
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
        {["基本信息", "搭建拓扑", "校验发布", "部署结果"].map((label, i) => (
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
      {pendingTemplate && (
        <Modal
          title="替换当前拓扑？"
          onClose={() => setPendingTemplate(null)}
          actions={
            <>
              <Button onClick={() => setPendingTemplate(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  change(buildTemplate(pendingTemplate))
                  setPendingTemplate(null)
                }}
              >
                替换拓扑
              </Button>
            </>
          }
        >
          <p>
            将使用“{pendingTemplate}
            ”替换当前节点和连接。基本信息保留，替换后可撤销。
          </p>
        </Modal>
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
              <Field label="站点 ID *">
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
              <Field label="所属组织 *">
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
            <section className="provision-templates">
              <h3>拓扑起始模板</h3>
              <div role="radiogroup" aria-label="拓扑起始模板">
                {templates.map((t) => (
                  <label key={t}>
                    <input
                      type="radio"
                      name="topology-template"
                      checked={(draft.template ?? "自定义空白拓扑") === t}
                      onChange={() => {
                        if (draft.devices.length) setPendingTemplate(t)
                        else change(buildTemplate(t))
                      }}
                    />
                    {t}
                  </label>
                ))}
              </div>
              <div className="template-preview">
                <div>
                  <strong>{draft.template ?? "自定义空白拓扑"}</strong>
                  <p>
                    {draft.template === "工商业储能"
                      ? "储能接入交流母线，为工商业负荷供能。"
                      : draft.template === "光储充"
                        ? "光伏、储能与充电设施共用交流母线。"
                        : draft.template === "光储协同"
                          ? "光伏发电与储能协同，接入站内负荷。"
                          : "从空白画布开始，自行添加设备和连接。"}
                  </p>
                </div>
                <div className="template-diagram">
                  {draft.template && draft.template !== "自定义空白拓扑" ? (
                    <>
                      <div>
                        <NodeIcon type="电网" />
                        公共电网
                      </div>
                      <div className="template-branches">
                        {(draft.template === "工商业储能"
                          ? ["PCS", "负载"]
                          : ["光伏", "PCS", "负载"]
                        ).map((t) => (
                          <div key={t}>
                            <NodeIcon type={t as DeviceType} />
                            {t === "PCS"
                              ? "储能"
                              : t === "负载"
                                ? draft.template === "光储充"
                                  ? "充电设施"
                                  : "负荷"
                                : "光伏"}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>
                      ＋<br />
                      添加节点 · 自由连接
                    </p>
                  )}
                </div>
              </div>
            </section>
          </section>
        )}
        {step === 1 && (
          <TopologyEditor
            draft={draft}
            change={change}
            undo={undo}
            redo={redo}
            canUndo={!!past.length}
            canRedo={!!future.length}
            onClear={() => setModal("clear")}
            onExport={download}
          />
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
              <table className="station-table provision-checks">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>检查项</th>
                    <th>结果</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {["电气结构", "通信端口", "计量配置", "设计属性"].map(
                    (name, i) => {
                      const words = [
                        ["电气", "连接", "直流", "交流", "节点"],
                        ["通信", "端口", "协议", "地址", "IP", "接口"],
                        ["并网点"],
                        ["名称", "编号", "额定"],
                      ][i]
                      const findings = issues.filter((e) =>
                        words.some((w) => e.includes(w)),
                      )
                      return (
                        <tr key={name}>
                          <td>{findings.length ? "待修正" : "本地通过"}</td>
                          <td>{name}</td>
                          <td>
                            {findings.length
                              ? findings.join("；")
                              : "当前本地配置检查通过"}
                          </td>
                          <td>
                            <button
                              className="station-text-button"
                              onClick={() => setStep(1)}
                            >
                              查看
                            </button>
                          </td>
                        </tr>
                      )
                    },
                  )}
                </tbody>
              </table>
              <h3>待现场确认</h3>
              {[
                "设备绑定 · EMS 与实际设备关联",
                "现场通信 · 接线、地址与协议联调",
                "部署生效 · 配置传输及现场应用结果",
              ].map((x) => (
                <p className="station-subtle" key={x}>
                  待确认　{x}
                </p>
              ))}
            </section>
            <aside className="station-panel">
              <h2>发布摘要</h2>
              <h3>{draft.name || "未命名站点"}配置</h3>
              <p>配置版本　{version} · 本地草稿</p>
              <dl>
                <dt>EMS 绑定</dt>
                <dd>未接通，未绑定</dd>
                <dt>拓扑对象</dt>
                <dd>{draft.devices.length + draft.buses.length}</dd>
                <dt>通信连接</dt>
                <dd>
                  {draft.devices.reduce(
                    (sum, d) =>
                      sum +
                      (d.ports ?? []).reduce((n, p) => n + p.targets.length, 0),
                    0,
                  )}
                </dd>
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
                  change({ devices: [], buses: [], connections: [] })

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
