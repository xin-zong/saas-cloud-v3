import { useEffect, useRef, useState, type ReactNode } from "react"

import { DEMO_MODE, api } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import type { Station } from "@/App"

import { Button } from "./ui/Workspace"

import { Asset, EntryTabs, Field, Modal } from "./station-provision/Common"

import StationProvisionPage from "./station-provision/StationProvisionPage"

import {
  useEditorLeaveGuard,
  type RegisterLeaveGuard,
} from "./useEditorLeaveGuard"

import "./station-provision/station-entry.css"

export const DRAFT_KEY = "enerlution_new_draft"

type Draft = Partial<Station>

interface Props {
  station: Station | null

  isNew: boolean

  initialDraft?: Draft | null

  showRevenue?: boolean

  readOnly?: boolean

  onBack: () => void

  onNavigate?: (tab: string) => void

  onSubmit: (patch: Partial<Station>) => void | Promise<void>

  registerLeaveGuard?: RegisterLeaveGuard
}

export default function StationEditPage(props: Props) {
  if (props.isNew)
    return (
      <StationProvisionPage
        onBack={props.onBack}
        registerLeaveGuard={props.registerLeaveGuard}
      />
    )

  return <StationEditor {...props} />
}

function StationEditor({
  station,

  initialDraft,

  showRevenue = true,

  readOnly = false,

  onBack,

  onNavigate,

  onSubmit,

  registerLeaveGuard,
}: Props) {
  const { user } = useAuth()

  type CustomerOptions = {
    can_assign: boolean
    customers: { id: number; name: string }[]
    current_customer: { id: number; name: string } | null
    current_customer_restricted: boolean
  }

  const [customerOptions, setCustomerOptions] =
    useState<CustomerOptions | null>(null)

  const [customerError, setCustomerError] = useState("")

  const [customerSearch, setCustomerSearch] = useState("")

  const [customerLoading, setCustomerLoading] = useState(false)

  const savedCustomer = useRef(station?.customerId)

  const pendingSave = useRef(false)

  const customerRequest = useRef(0)

  async function reloadCustomers(signal?: AbortSignal) {
    const request = ++customerRequest.current
    setCustomerLoading(true)
    setCustomerError("")
    try {
      const options = await api<CustomerOptions>(
        `/platform/customers/options?stationId=${encodeURIComponent(station!.id)}`,
        { signal },
      )
      if (signal?.aborted || request !== customerRequest.current) {
        throw new Error("客户关联选项已失效，请重试")
      }
      setCustomerOptions(options)
      return options
    } catch (e) {
      if (!signal?.aborted && request === customerRequest.current) {
        setCustomerOptions(null)
        setCustomerError(e instanceof Error ? e.message : "客户加载失败")
      }
      throw e
    } finally {
      if (!signal?.aborted && request === customerRequest.current) setCustomerLoading(false)
    }
  }

  useEffect(() => {
    if (DEMO_MODE || !station) return
    const controller = new AbortController()
    setCustomerOptions(null)
    void reloadCustomers(controller.signal).catch(() => {})
    return () => {
      customerRequest.current++
      controller.abort()
    }
  }, [
    station?.id,
    user?.id,
    JSON.stringify(user?.stationPermissions),
    JSON.stringify(user?.organizationPermissions),
    JSON.stringify(user?.permissions),
  ])

  const [draft, setDraft] = useState<Draft>(
    () => initialDraft ?? { ...station },
  )

  const [snapshot, setSnapshot] = useState(() => JSON.stringify(draft))

  const [modal, setModal] = useState<"leave" | "review" | "coordinates" | null>(
    null,
  )

  const [notice, setNotice] = useState("")

  const [error, setError] = useState("")

  const [saving, setSaving] = useState(false)

  const [coords, setCoords] = useState({
    lat: draft.lat ?? "",

    lng: draft.lng ?? "",
  })

  const file = useRef<HTMLInputElement>(null)

  const destination = useRef<string | undefined>(undefined)

  const initialNumbers = useRef({
    ratedPower: draft.ratedPower,
    storageCapacity: draft.storageCapacity,
  })

  const dirty = JSON.stringify(draft) !== snapshot

  const { settleLeave } = useEditorLeaveGuard({
    dirty,
    enabled: !readOnly,
    registerLeaveGuard,

    onConfirm: () => {
      destination.current = undefined
      setModal("leave")
    },

    onCancel: () => setModal(null),
  })

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

  function field<K extends keyof Station>(key: K, value: Station[K]) {
    setDraft((d) => ({ ...d, [key]: value }))

    setNotice("")

    setError("")
  }

  function finishLeave() {
    settleLeave(true)

    if (destination.current && onNavigate) onNavigate(destination.current)
    else onBack()
  }

  function leave(tab?: string) {
    destination.current = tab

    if (dirty && !readOnly) setModal("leave")
    else finishLeave()
  }

  async function save(exit = false) {
    if (readOnly || pendingSave.current) return

    if (!draft.name?.trim()) {
      setError("请填写站点名称")

      return
    }

    if (
      (["ratedPower", "storageCapacity"] as const).some(
        (key) =>
          !Object.is(draft[key], initialNumbers.current[key]) &&
          (!Number.isFinite(draft[key]) || Number(draft[key]) < 0),
      )
    ) {
      setError("额定功率与储能容量必须为非负数")

      return
    }

    pendingSave.current = true

    setSaving(true)

    setError("")

    try {
      const customerChanged = !Object.is(
        draft.customerId,
        savedCustomer.current,
      )

      if (!DEMO_MODE && customerChanged) {
        if (customerError || !customerOptions?.can_assign)
          throw new Error("客户选项不可用或关联权限已失效，未保存修改")
        const latest = await reloadCustomers()
        if (
          !latest.can_assign ||
          (draft.customerId != null &&
            !latest.customers.some((c) => String(c.id) === draft.customerId))
        )
          throw new Error("客户关联权限已失效，请重新选择")
      }

      const patch: Partial<Station> = DEMO_MODE
        ? draft
        : {
            name: draft.name.trim(),

            ...(customerChanged
              ? { customerId: draft.customerId ?? null }
              : {}),

            ...(Number.isFinite(draft.ratedPower)
              ? { ratedPower: draft.ratedPower }
              : {}),

            ...(Number.isFinite(draft.storageCapacity)
              ? { storageCapacity: draft.storageCapacity }
              : {}),

            region: draft.region,

            address: draft.address,

            lng: draft.lng,

            lat: draft.lat,
          }

      await onSubmit(patch)

      savedCustomer.current = draft.customerId

      setSnapshot(JSON.stringify(draft))

      initialNumbers.current = {
        ratedPower: draft.ratedPower,
        storageCapacity: draft.storageCapacity,
      }

      setNotice("已保存编辑")

      setModal(null)

      if (exit) finishLeave()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试")
    } finally {
      pendingSave.current = false

      setSaving(false)
    }
  }

  const apiUnsupported = !DEMO_MODE

  const input = (
    key: keyof Station,

    label: string,

    extra: { type?: string; disabled?: boolean; wide?: boolean } = {},
  ) => (
    <Field label={label} wide={extra.wide}>
      <input
        type={extra.type ?? "text"}
        value={
          extra.type === "number" && !Number.isFinite(draft[key])
            ? ""
            : String(draft[key] ?? "")
        }
        placeholder={key === "address" ? "请输入详细地址" : undefined}
        disabled={readOnly || extra.disabled}
        onChange={(e) =>
          field(
            key,

            (extra.type === "number"
              ? e.target.value === ""
                ? NaN
                : Number(e.target.value)
              : e.target.value) as never,
          )
        }
      />
    </Field>
  )

  function section(title: string, children: ReactNode) {
    return (
      <section className="station-panel station-edit-section">
        <h2>{title}</h2>
        <div className="station-edit-grid">{children}</div>
      </section>
    )
  }

  return (
    <div
      className="station-editor station-entry-scope"
      data-design-node={readOnly ? "1127:10085" : "1127:9052"}
    >
      <EntryTabs onChange={leave} />
      <main className="station-edit-scroll">
        {notice && (
          <div className="station-notice" role="status">
            ✓ {notice}
          </div>
        )}
        {error && (
          <div className="station-error" role="alert">
            {error}
          </div>
        )}
        <header className="station-edit-heading">
          <div>
            <button className="station-text-button" onClick={() => leave()}>
              资产与站点 / 列表查询 / {station?.name} / 编辑
            </button>
            <h1>
              编辑站点信息{" "}
              <span className="station-muted-tag">
                {readOnly ? "只读" : dirty ? "草稿" : "已保存"}
              </span>
            </h1>
          </div>
          <div>
            <Button disabled={readOnly || saving} onClick={() => void save()}>
              <Asset name="edit-imgSave" />
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button
              variant="primary"
              disabled={readOnly || saving}
              onClick={() => setModal("review")}
            >
              <Asset name="edit-imgSend" />
              提交审核
            </Button>
          </div>
        </header>
        {apiUnsupported && (
          <p className="station-subtle station-api-note">
            可保存名称、额定功率、储能容量、区域、地址及坐标；所属客户按关联权限编辑，其余字段当前仅供查看。
          </p>
        )}
        {section(
          "基本信息",

          <>
            {input("name", "站点名称 *")}
            {!DEMO_MODE && (
              <Field label="所属客户">
                <div className="station-customer-selector">
                  {customerOptions?.can_assign && !readOnly ? (
                    <>
                      <input
                        aria-label="搜索所属客户"
                        placeholder="搜索客户名称"
                        value={customerSearch}
                        disabled={saving}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                      <select
                        aria-label="所属客户"
                        value={draft.customerId ?? ""}
                        disabled={saving || customerLoading}
                        onChange={(e) =>
                          field("customerId", e.target.value || null)
                        }
                      >
                        <option value="">未关联客户</option>
                        {customerOptions.customers
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
                    </>
                  ) : (
                    <input
                      aria-label="所属客户"
                      readOnly
                      value={
                        customerLoading
                          ? "正在加载客户…"
                          : customerOptions?.current_customer_restricted
                            ? "当前客户关联受限"
                            : (customerOptions?.current_customer?.name ??
                              (customerError
                                ? "客户关联暂不可用"
                                : "未关联客户"))
                      }
                    />
                  )}{" "}
                  {customerError && (
                    <>
                      <p role="alert" className="station-danger">
                        {customerError}；保留原关联
                      </p>
                      <button
                        className="station-text-button"
                        onClick={() => void reloadCustomers().catch(() => {})}
                      >
                        重试加载客户
                      </button>
                    </>
                  )}
                </div>
              </Field>
            )}
            <Field label="站点 ID">
              <div className="station-locked-input">
                <input readOnly value={station?.code ?? "—"} />
                <Asset name="edit-imgLock" />
              </div>
            </Field>
            <Field label="站点类型 *">
              <select
                disabled={readOnly || apiUnsupported}
                value={draft.type ?? "BESS"}
                onChange={(e) =>
                  field("type", e.target.value as Station["type"])
                }
              >
                {["BESS", "PV", "Wind", "Hybrid", "Diesel"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="站点状态">
              <div>
                <button
                  className={
                    "station-status-switch " +
                    (draft.status === "online" ? "on" : "")
                  }
                  role="switch"
                  aria-label="站点在线状态"
                  aria-checked={draft.status === "online"}
                  disabled={readOnly || apiUnsupported}
                  onClick={() =>
                    field(
                      "status",

                      draft.status === "online" ? "offline" : "online",
                    )
                  }
                >
                  <i />
                </button>{" "}
                {draft.status === "online"
                  ? "在线"
                  : draft.status === "building"
                    ? "建设中"
                    : draft.status === "fault"
                      ? "告警"
                      : "离线 / 未知"}
              </div>
            </Field>
            <Field label="运行状态">
              <select
                disabled={readOnly || apiUnsupported}
                value={draft.runStatus ?? ""}
                onChange={(e) =>
                  field("runStatus", e.target.value as Station["runStatus"])
                }
              >
                {[
                  ...new Set([
                    draft.runStatus ?? "未知",

                    "正常",

                    "待机",

                    "维护中",

                    "异常",
                  ]),
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="概要图">
              <div className="station-edit-photo">
                {draft.imageUrl && (
                  <img src={draft.imageUrl} alt="站点概要图" />
                )}
                <div>
                  <small>{draft.imageUrl ? "站点概要图" : "暂无概要图"}</small>
                  <button
                    disabled={readOnly || apiUnsupported}
                    className="station-text-button"
                    onClick={() => file.current?.click()}
                  >
                    <Asset name="edit-imgUpload" />
                    上传图片
                  </button>
                  <button
                    disabled={readOnly || apiUnsupported || !draft.imageUrl}
                    className="station-text-button station-danger"
                    onClick={() => field("imageUrl", "")}
                  >
                    删除
                  </button>
                  <small>支持 JPG、PNG，最大 2 MB</small>
                </div>
                <input
                  ref={file}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0]

                    if (!f) return

                    if (
                      !["image/jpeg", "image/png"].includes(f.type) ||
                      f.size > 2 * 1024 * 1024
                    ) {
                      setError("请选择 2 MB 以内的 JPG 或 PNG 图片")

                      return
                    }

                    const r = new FileReader()

                    r.onload = () => field("imageUrl", String(r.result))

                    r.readAsDataURL(f)
                  }}
                />
              </div>
            </Field>
          </>,
        )}
        {section(
          "位置信息",

          <>
            <Field label="所属区域 *">
              <select
                disabled={readOnly}
                value={draft.region ?? ""}
                onChange={(e) => field("region", e.target.value)}
              >
                {[
                  ...new Set([
                    draft.region ?? "",

                    "华东",

                    "华南",

                    "华北",

                    "华中",

                    "西南",

                    "西北",

                    "东北",

                    "欧洲",

                    "北美",
                  ]),
                ].map((x) => (
                  <option key={x}>{x || "请选择区域"}</option>
                ))}
              </select>
            </Field>
            {input("project", "所属项目", { disabled: apiUnsupported })}
            {input("address", "详细地址 *", { wide: true })}
            <div className="station-coordinate-grid">
              <div className="station-coordinate-marker">
                <Asset name="edit-imgMapPin1" />
              </div>
              <Button
                disabled={readOnly}
                onClick={() => {
                  setCoords({ lat: draft.lat ?? "", lng: draft.lng ?? "" })

                  setModal("coordinates")
                }}
              >
                <Asset name="edit-imgCrosshair" />
                选择坐标
              </Button>
              <span>
                {draft.lng && draft.lat
                  ? "经纬度位置示意"
                  : "暂无坐标 · 请填写真实位置"}
              </span>
            </div>
            {input("lng", "经度", { disabled: true })}
            {input("lat", "纬度", { disabled: true })}
          </>,
        )}
        {section(
          "运营概览",

          <>
            {input("ratedPower", "额定功率 (kW)", { type: "number" })}
            {input("storageCapacity", "储能容量 (kWh)", { type: "number" })}
            <Field label="当前电量 (SOC)">
              <input
                readOnly
                value={Number.isFinite(draft.soc) ? draft.soc + "%" : "—"}
              />
            </Field>
            <Field label="当前功率">
              <input
                readOnly
                value={
                  Number.isFinite(draft.activePower)
                    ? draft.activePower + " kW"
                    : "—"
                }
              />
            </Field>
            <Field label="累计运行时间">
              <input readOnly value={draft.runtime ?? "—"} />
            </Field>
            {showRevenue && (
              <Field label="累计收益">
                <input readOnly value={draft.revenue ?? "—"} />
              </Field>
            )}
          </>,
        )}
        {section(
          "负责人",

          <>
            {input("manager", "负责人", { disabled: apiUnsupported })}
            {input("email", "联系邮箱", {
              disabled: apiUnsupported,

              type: "email",
            })}
            {input("phone", "联系电话", { disabled: apiUnsupported })}
            {input("role", "职务/角色", { disabled: apiUnsupported })}
          </>,
        )}
        {section(
          "备注信息",

          <Field label="备注" wide>
            <textarea
              rows={3}
              disabled={readOnly || apiUnsupported}
              value={draft.remark ?? ""}
              onChange={(e) => field("remark", e.target.value)}
            />
          </Field>,
        )}
        <footer className="station-edit-footer">
          <Button onClick={() => leave()}>返回站点列表</Button>
          {readOnly && <span>当前账户仅可查看此站点信息</span>}
        </footer>
      </main>
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
              <Button disabled={saving} onClick={finishLeave}>
                不保存离开
              </Button>
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => void save(true)}
              >
                保存并离开
              </Button>
            </>
          }
        >
          <p>你有未保存的编辑内容，确定要离开吗？</p>
          {error && (
            <p role="alert" className="station-danger">
              {error}
            </p>
          )}
        </Modal>
      )}
      {modal === "review" && (
        <Modal
          title="确认提交审核"
          onClose={() => setModal(null)}
          actions={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setModal(null)

                  setNotice(
                    "审核服务尚未接通，未提交审核。可以使用“保存”保存已支持的字段。",
                  )
                }}
              >
                知道了
              </Button>
            </>
          }
        >
          <p>
            当前审核流程尚未接通，无法提交审核或生成审核记录。请先保存站点信息。
          </p>
        </Modal>
      )}
      {modal === "coordinates" && (
        <Modal
          title="选择坐标"
          onClose={() => setModal(null)}
          actions={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const lat = Number(coords.lat),
                    lng = Number(coords.lng)

                  if (
                    !coords.lat.trim() ||
                    !coords.lng.trim() ||
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lng) ||
                    lat < -90 ||
                    lat > 90 ||
                    lng < -180 ||
                    lng > 180
                  ) {
                    setError("纬度应为 -90～90，经度应为 -180～180")

                    return
                  }

                  setDraft((d) => ({ ...d, lat: coords.lat, lng: coords.lng }))

                  setError("")

                  setModal(null)
                }}
              >
                确认坐标
              </Button>
            </>
          }
        >
          <p>填写站点真实经纬度，保存后用于地图定位。</p>
          <Field label="经度">
            <input
              value={coords.lng}
              onChange={(e) =>
                setCoords((c) => ({ ...c, lng: e.target.value }))
              }
            />
          </Field>
          <Field label="纬度">
            <input
              value={coords.lat}
              onChange={(e) =>
                setCoords((c) => ({ ...c, lat: e.target.value }))
              }
            />
          </Field>
          {error && (
            <p role="alert" className="station-danger">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
