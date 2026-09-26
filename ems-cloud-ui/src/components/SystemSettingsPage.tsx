import { DEMO_MODE, api, send } from "@/api/client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Check, Save, X } from "lucide-react"
import type { Station } from "@/App"
import { ROLE_CONFIG, type AuthUser } from "@/auth/roles"
import { Button, Select, Switch } from "./ui/Workspace"
import "./system-settings.css"
import SettingsDialog from "./SettingsDialog"
import { useEditorLeaveGuard, type RegisterLeaveGuard } from "./useEditorLeaveGuard"

type SettingsState = {
  displayName: string
  email: string
  phone: string
  defaultEntry: string
  defaultTimeRange: string
  rememberSiteTab: boolean
  notificationInApp: boolean
  notificationEmail: boolean
  notificationSms: string
  alarmScope: string
  approvalScope: string
  taskScope: string
  quietHours: boolean
  language: string
  timezone: string
  units: string
  theme: string
  density: string
  chartAnimation: string
  highContrast: boolean
  mfaEnabled: boolean
  loginDevices: string
  loginHistory: string
  newDeviceAlert: boolean

  // Older preference fields remain readable within account-scoped local settings.
  autoRefresh: boolean
  refreshInterval: string
  auditLog: boolean
  loginAlert: boolean
  sessionTimeout: string
  apiEndpoint: string
  backupEndpoint: string
  telemetryRetention: string
  edgeMode: string
  mapLabels: boolean
}

type CategoryKey = "personal" | "notifications" | "display" | "security"

type Category = {
  key: CategoryKey
  title: string
  subtitle: string
  description: string
  saveLabel: string
}

const preferenceKeys = ["defaultEntry", "defaultTimeRange", "rememberSiteTab", "language", "timezone", "units", "theme", "density", "chartAnimation", "highContrast", "notificationInApp", "notificationEmail", "notificationSms", "alarmScope", "approvalScope", "taskScope", "quietHours", "newDeviceAlert"] as const

const DEFAULT_SETTINGS: SettingsState = {
  displayName: "",
  email: "",
  phone: "",
  defaultEntry: "总览",
  defaultTimeRange: "当天",
  rememberSiteTab: true,
  notificationInApp: true,
  notificationEmail: true,
  notificationSms: "仅紧急告警",
  alarmScope: "紧急 + 重要",
  approvalScope: "待我审批",
  taskScope: "分派给我",
  quietHours: false,
  language: "简体中文",
  timezone: "Asia / Shanghai (UTC+08:00)",
  units: "公制 · kW / kWh",
  theme: "浅色",
  density: "舒适",
  chartAnimation: "开启",
  highContrast: false,
  mfaEnabled: false,
  loginDevices: "未知",
  loginHistory: "今天",
  newDeviceAlert: true,

  autoRefresh: true,
  refreshInterval: "30 秒",
  auditLog: true,
  loginAlert: true,
  sessionTimeout: "30 分钟",
  apiEndpoint: "https://api.enerlution.local/v1",
  backupEndpoint: "https://backup.enerlution.local/v1",
  telemetryRetention: "180 天",
  edgeMode: "边缘节点优先",
  mapLabels: true,
}

const CATEGORIES: Category[] = [
  {
    key: "personal",
    title: "个人偏好",
    subtitle: "账户资料与常用偏好",
    description: "更新账户资料和常用界面偏好。",
    saveLabel: "保存更改",
  },
  {
    key: "notifications",
    title: "通知设置",
    subtitle: "告警、审批与任务通知",
    description: "配置告警、审批与任务消息的接收方式。",
    saveLabel: "保存更改",
  },
  {
    key: "display",
    title: "显示与语言",
    subtitle: "主题、密度、时区与单位",
    description: "统一界面语言、时区、单位与信息密度。",
    saveLabel: "保存更改",
  },
  {
    key: "security",
    title: "登录与安全",
    subtitle: "MFA、登录记录与会话",
    description: "管理验证方式、登录设备和账户会话。",
    saveLabel: "保存安全设置",
  },
]

function readSettings(storageKey: string, seed: Partial<SettingsState> = {}) {
  try {
    const raw = DEMO_MODE ? localStorage.getItem(storageKey) : null
    if (!raw) {
      return {
        settings: { ...DEFAULT_SETTINGS, ...seed },
        savedAt: "",
        stored: false,
        error: "",
      }
    }

    const parsed = JSON.parse(raw)
    const values = parsed?.settings ?? parsed
    const settings = { ...DEFAULT_SETTINGS, ...seed }
    for (const key of Object.keys(settings) as Array<keyof SettingsState>) {
      if (values && typeof values[key] === typeof settings[key])
        Object.assign(settings, { [key]: values[key] })
    }
    return {
      settings,
      savedAt: typeof parsed?.savedAt === "string" ? parsed.savedAt : "",
      stored: true,
      error: "",
    }
  } catch {
    return {
      settings: { ...DEFAULT_SETTINGS, ...seed },
      savedAt: "",
      stored: false,
      error: "无法读取本地配置，当前显示默认值。",
    }
  }
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-choice-group" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`settings-choice ${
            value === option ? "is-selected" : ""
          }`}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-preference-row">
      <span className="settings-row-label">{label}</span>
      <ChoiceGroup
        label={label}
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="settings-preference-row settings-toggle-row">
      <span className="settings-row-label">{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-account-field">
      <span>{label}</span>
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </Select>
    </label>
  )
}

function TextField({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string
  value: string
  type?: "text" | "email" | "tel"
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-account-field">
      <span>{label}</span>
      <input
        disabled={!DEMO_MODE}
        title={!DEMO_MODE ? "账户资料修改尚未接入服务器" : undefined}
        className="settings-faux-field"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SettingsCard({
  title,
  status,
  children,
  className = "",
}: {
  title: string
  status?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`settings-card ${className}`}>
      <header className="settings-card-header">
        <h2>{title}</h2>
        {status && <span className="settings-status-pill">{status}</span>}
      </header>
      {children}
    </section>
  )
}

function ScopeNote({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <aside className="settings-scope-note">
      <strong>{title}</strong>
      <p>{children}</p>
    </aside>
  )
}

function PersonalPreferences({
  settings,
  set,
}: {
  settings: SettingsState
  set: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => void
}) {
  return (
    <>
      <SettingsCard title="账户资料" status={settings.displayName.slice(0, 1) || "—"}>
        <div className="settings-account-grid">
          <TextField
            label="显示名称"
            value={settings.displayName}
            onChange={(value) => set("displayName", value)}
          />
          <TextField
            label="联系邮箱"
            type="email"
            value={settings.email}
            onChange={(value) => set("email", value)}
          />
          <TextField
            label="联系电话"
            type="tel"
            value={settings.phone}
            onChange={(value) => set("phone", value)}
          />
        </div>
        <p className="settings-card-note">
          账户身份和权限由平台管理维护，此处不提供角色名称或角色切换。
        </p>
      </SettingsCard>
      <SettingsCard title="常用偏好">
        <div className="settings-preferences">
          <ChoiceRow
            label="登录后默认进入"
            value={settings.defaultEntry}
            options={["总览", "上次访问页面"]}
            onChange={(value) => set("defaultEntry", value)}
          />
          <ChoiceRow
            label="页面密度"
            value={settings.density}
            options={["舒适", "紧凑"]}
            onChange={(value) => set("density", value)}
          />
          <ChoiceRow
            label="默认时间范围"
            value={settings.defaultTimeRange}
            options={["当天", "近 7 天", "近 30 天"]}
            onChange={(value) => set("defaultTimeRange", value)}
          />
          <ToggleRow
            label="记住站点标签页"
            checked={settings.rememberSiteTab}
            onChange={() => set("rememberSiteTab", !settings.rememberSiteTab)}
          />
        </div>
      </SettingsCard>
      <ScopeNote title="设置范围">
        个人偏好仅影响当前账户，不改变其他用户、站点或租户配置。默认页面等偏好的全局应用尚未接入；演示账户资料仅保存在本机。
      </ScopeNote>
    </>
  )
}

function NotificationSettings({
  settings,
  set,
}: {
  settings: SettingsState
  set: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => void
}) {
  return (
    <>
      <SettingsCard title="通知渠道" status="接收偏好">
        <div className="settings-account-grid">
          <FieldSelect label="站内通知" value={settings.notificationInApp ? "接收" : "不接收"} options={["接收", "不接收"]} onChange={value => set("notificationInApp", value === "接收")} />
          <FieldSelect label="邮件通知" value={settings.notificationEmail ? "接收" : "不接收"} options={["接收", "不接收"]} onChange={value => set("notificationEmail", value === "接收")} />
          <FieldSelect label="短信通知" value={settings.notificationSms} options={["仅紧急告警", "全部告警", "不接收"]} onChange={value => set("notificationSms", value)} />
        </div>
        <p className="settings-card-note">
          通知渠道只保存当前账户的接收偏好，不代表消息已送达；消息投递服务尚未接入。
        </p>
      </SettingsCard>
      <SettingsCard title="通知规则">
        <div className="settings-preferences">
          <ChoiceRow
            label="告警通知"
            value={settings.alarmScope}
            options={["紧急 + 重要", "全部级别"]}
            onChange={(value) => set("alarmScope", value)}
          />
          <ChoiceRow
            label="审批通知"
            value={settings.approvalScope}
            options={["待我审批", "全部审批"]}
            onChange={(value) => set("approvalScope", value)}
          />
          <ChoiceRow
            label="任务通知"
            value={settings.taskScope}
            options={["分派给我", "即将超时", "全部任务"]}
            onChange={(value) => set("taskScope", value)}
          />
          <ToggleRow
            label="免打扰时段 22:00–07:00"
            checked={settings.quietHours}
            onChange={() => set("quietHours", !settings.quietHours)}
          />
        </div>
      </SettingsCard>
      <ScopeNote title="生效范围">
        通知偏好仅影响当前账户，不改变告警规则。实际投递和紧急告警策略以平台服务为准。
      </ScopeNote>
    </>
  )
}

function DisplaySettings({
  settings,
  set,
}: {
  settings: SettingsState
  set: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => void
}) {
  return (
    <>
      <SettingsCard title="地区与计量" status="简体中文">
        <div className="settings-account-grid">
          <FieldSelect
            label="界面语言"
            value={settings.language}
            options={["简体中文", "English"]}
            onChange={(value) => set("language", value)}
          />
          <FieldSelect
            label="时区"
            value={settings.timezone}
            options={[
              "Asia / Shanghai (UTC+08:00)",
              "UTC (UTC+00:00)",
              "Asia / Tokyo (UTC+09:00)",
            ]}
            onChange={(value) => set("timezone", value)}
          />
          <FieldSelect
            label="计量单位"
            value={settings.units}
            options={["公制 · kW / kWh", "英制 · kW / kWh"]}
            onChange={(value) => set("units", value)}
          />
        </div>
        <p className="settings-card-note">
          此处保存显示偏好；时间轴、报表、导出的全局应用尚未接入。
        </p>
      </SettingsCard>
      <SettingsCard title="界面显示">
        <div className="settings-preferences">
          <ChoiceRow
            label="主题"
            value={settings.theme}
            options={["浅色", "跟随系统"]}
            onChange={(value) => set("theme", value)}
          />
          <ChoiceRow
            label="页面密度"
            value={settings.density}
            options={["舒适", "紧凑"]}
            onChange={(value) => set("density", value)}
          />
          <ChoiceRow
            label="图表动效"
            value={settings.chartAnimation}
            options={["开启", "简化", "关闭"]}
            onChange={(value) => set("chartAnimation", value)}
          />
          <ToggleRow
            label="高对比度模式"
            checked={settings.highContrast}
            onChange={() => set("highContrast", !settings.highContrast)}
          />
        </div>
      </SettingsCard>
      <ScopeNote title="显示说明">
        显示设置仅影响当前账户。高频监控页面仍优先保证信息密度和长时间阅读舒适度。
      </ScopeNote>
    </>
  )
}

function SecuritySettings({ settings, set, account, busy, registerLeaveGuard }: {
  account: string
  settings: SettingsState
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
  busy: boolean
  registerLeaveGuard: RegisterLeaveGuard
}) {
  const [panel, setPanel] = useState("")
  const [range, setRange] = useState("今天")
  const [method, setMethod] = useState<"password" | "mfa">("password")
  const [password, setPassword] = useState("")
  const [nextPassword, setNextPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [mfaPassword, setMfaPassword] = useState("")
  const [code, setCode] = useState("")
  const [mfaMethod, setMfaMethod] = useState("验证器")
  const [step, setStep] = useState(1)
  const [feedback, setFeedback] = useState("")
  const [leaving, setLeaving] = useState(false)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const sensitiveDirty = !!(password || nextPassword || confirmation || mfaPassword || code)
  const clearSensitive = useCallback(() => {
    setPassword(""); setNextPassword(""); setConfirmation("")
    setMfaPassword(""); setCode(""); setMfaMethod("验证器")
    setStep(1); setMethod("password"); setFeedback("")
  }, [])
  const { requestLeave: requestSensitiveLeave, settleLeave } = useEditorLeaveGuard({
    dirty: sensitiveDirty,
    onConfirm: () => setLeaving(true),
    onCancel: () => setLeaving(false),
  })
  const requestLeave = useCallback(async () => {
    if (busyRef.current) {
      setFeedback("正在保存，请等待保存完成后再离开。")
      return false
    }
    if (!await requestSensitiveLeave()) return false
    clearSensitive()
    setPanel("")
    return true
  }, [requestSensitiveLeave, clearSensitive])
  useEffect(() => {
    registerLeaveGuard(requestLeave)
    return () => registerLeaveGuard(null)
  }, [registerLeaveGuard, requestLeave])
  useEffect(() => {
    if (!sensitiveDirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [sensitiveDirty])
  const decideLeave = (allow: boolean) => {
    if (allow && busyRef.current) return
    if (allow) clearSensitive()
    setLeaving(false)
    settleLeave(allow)
  }
  const switchMethod = async (next: "password" | "mfa") => {
    if (next === method || busyRef.current) return
    if (!await requestSensitiveLeave()) return
    clearSensitive()
    setMethod(next)
  }
  const submitPassword = () => {
    if (busyRef.current) return
    if (!password) return setFeedback("请输入当前密码。")
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,128}$/.test(nextPassword)) return setFeedback("新密码需为 8–128 位，且包含字母和数字。")
    if (nextPassword !== confirmation) return setFeedback("两次新密码不一致，请重新确认。")
    if (nextPassword === password) return setFeedback("新密码不能与当前密码相同。")
    setFeedback("密码变更服务尚未接通，未提交任何变更。")
  }
  const submitMfa = () => {
    if (busyRef.current) return
    if (!mfaPassword) return setFeedback("请输入 MFA 当前密码。")
    if (step === 1) { setStep(2); setFeedback(""); return }
    if (!/^\d{6}$/.test(code)) return setFeedback("MFA 验证码必须为 6 位数字。")
    setFeedback("MFA 配置服务尚未接通，未提交任何变更。")
  }
  return <>
    <SettingsCard title="账户安全" status="状态未接入"><div className="settings-account-grid">
      {[["登录账户", account], ["多因素认证", "未获取状态"], ["最近登录", "暂无数据"]].map(([label, value]) => <div className="settings-account-field" key={label}><span>{label}</span><div className="settings-faux-field settings-field-status">{value || "—"}</div></div>)}
    </div><p className="settings-card-note">验证方式、登录记录与设备会话服务尚未接入，无法判断账户安全状态。</p></SettingsCard>
    <SettingsCard title="登录与会话"><div className="settings-preferences">
      <div className="settings-preference-row"><span className="settings-row-label">多因素认证</span><div className="settings-choice-group"><span className="settings-choice">未获取</span><button className="settings-choice" onClick={() => setPanel("验证方式")}>管理方式</button></div></div>
      <div className="settings-preference-row"><span className="settings-row-label">登录设备</span><div className="settings-choice-group"><span className="settings-choice">— 台</span><button className="settings-choice" onClick={() => setPanel("登录设备")}>查看设备</button></div></div>
      <ChoiceRow label="登录记录" value={range} options={["今天", "近 7 天", "近 30 天"]} onChange={value => {setRange(value); setPanel("登录记录")}} />
      <ToggleRow label="新设备登录提醒" checked={settings.newDeviceAlert} onChange={() => set("newDeviceAlert", !settings.newDeviceAlert)} />
    </div></SettingsCard>
    <ScopeNote title="安全提示">仅保存新设备提醒偏好，不能启用 MFA 或撤销其他会话。密码变更和消息投递尚未接入。</ScopeNote>
    {panel && <SettingsDialog title={panel} onClose={() => { void requestLeave() }}>
      <p>{panel === "验证方式" ? "验证方式和密码变更服务尚未接入，请联系管理员。" : panel === "登录设备" ? "暂无可用的登录设备数据" : `${range} · 暂无可用的登录记录数据`}</p>
      {panel === "验证方式" && <>
        <div role="tablist" aria-label="安全验证方式" className="settings-security-tabs">
          <button type="button" role="tab" aria-selected={method === "password"} onClick={() => { void switchMethod("password") }}>修改密码</button>
          <button type="button" role="tab" aria-selected={method === "mfa"} onClick={() => { void switchMethod("mfa") }}>MFA 配置</button>
        </div>
        <form noValidate onSubmit={event => { event.preventDefault(); method === "password" ? submitPassword() : submitMfa() }}>
          <fieldset disabled={busy} className="settings-security-form">
            {method === "password" ? <>
              <label>当前密码<input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label>
              <label>新密码<input type="password" autoComplete="off" maxLength={128} value={nextPassword} onChange={event => setNextPassword(event.target.value)} aria-describedby="settings-password-format" /></label>
              <p id="settings-password-format">8–128 位，包含字母和数字。</p>
              <label>确认新密码<input type="password" autoComplete="off" maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
              <Button type="submit">提交密码变更</Button>
            </> : <>
              <p>步骤 {step} / 2 · {step === 1 ? "选择验证方式" : "检查验证码格式"}</p>
              {step === 1 ? <>
                <label>验证方式<select value={mfaMethod} onChange={event => setMfaMethod(event.target.value)}><option>验证器</option><option>邮箱验证</option></select></label>
                <label>MFA 当前密码<input type="password" autoComplete="off" value={mfaPassword} onChange={event => setMfaPassword(event.target.value)} /></label>
                <Button type="submit">下一步</Button>
              </> : <>
                <p>{mfaMethod}服务未接通，未生成二维码或发送验证码；此步骤仅检查输入格式。</p>
                <label>MFA 验证码<input type="text" inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={event => setCode(event.target.value)} /></label>
                <Button type="button" onClick={() => { setStep(1); setFeedback("") }}>上一步</Button>
                <Button type="submit">提交 MFA 配置</Button>
              </>}
            </>}
          </fieldset>
        </form>
      </>}
      {feedback && <p role="alert" className="ui-error">{feedback}</p>}
      {panel === "登录设备" && <><table><thead><tr><th>设备</th><th>登录地点</th><th>最近活动</th></tr></thead><tbody><tr><td colSpan={3}>设备会话服务尚未接入</td></tr></tbody></table><button disabled>退出其他设备（未接通）</button></>}
      <footer><Button onClick={() => { void requestLeave() }}>关闭</Button></footer>
    </SettingsDialog>}
    {leaving && <SettingsDialog title="未保存的安全输入" onClose={() => decideLeave(false)}>
      <p>安全服务尚未接通。放弃后将清空本次密码与验证码输入。</p>
      <footer><Button onClick={() => decideLeave(false)}>继续编辑</Button><Button variant="primary" onClick={() => decideLeave(true)}>放弃修改</Button></footer>
    </SettingsDialog>}
  </>
}

function LegacyCompatibilityControls({
  settings,
  set,
  onRestore,
}: {
  settings: SettingsState
  set: <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => void
  onRestore: () => void
}) {
  return (
    <details className="settings-compatibility"><summary>本地兼容配置</summary><p>仅为当前演示账户保存，不连接数据服务。</p>
      <input
        aria-label="备用接口地址"
        value={settings.backupEndpoint}
        onChange={(event) => set("backupEndpoint", event.target.value)}
      />
      <input
        aria-label="数据服务接口"
        value={settings.apiEndpoint}
        onChange={(event) => set("apiEndpoint", event.target.value)}
      />
      <select
        aria-label="兼容界面语言"
        value={settings.language}
        onChange={(event) => set("language", event.target.value)}
      >
        <option>简体中文</option>
        <option>English</option>
      </select>
      <button
        type="button"
        aria-label="自动刷新数据"
        role="switch"
        aria-checked={settings.autoRefresh}
        onClick={() => set("autoRefresh", !settings.autoRefresh)}
      />
      <select
        aria-label="刷新间隔"
        value={settings.refreshInterval}
        disabled={!settings.autoRefresh}
        onChange={(event) => set("refreshInterval", event.target.value)}
      >
        {["10 秒", "30 秒", "60 秒", "5 分钟"].map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <button type="button" aria-label="恢复默认" onClick={onRestore}>
        恢复默认
      </button>
    </details>
  )
}

export default function SystemSettingsPage({
  stations = [],
  user,
  onLogout,
  registerLeaveGuard,
}: {
  stations?: Station[]
  user: AuthUser
  onLogout: () => void
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const storageKey = `enerlution:settings:${DEMO_MODE ? "demo" : "api"}:${user.id}`
  const seed = { displayName: user.name || "", email: user.account || "", phone: "" }
  const [initial] = useState(() => readSettings(storageKey, seed))
  const [settings, setSettings] = useState(initial.settings)
  const [baseline, setBaseline] = useState(initial.settings)
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("personal")
  const [stored, setStored] = useState(initial.stored)
  const [error, setError] = useState(initial.error)
  const [serverReady, setServerReady] = useState(DEMO_MODE)
  const [busy, setBusy] = useState(false)
  const [leave, setLeave] = useState(false)
  const [loadVersion, setLoadVersion] = useState(0)
  const restoreDialog = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false)
  const securityLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerSecurityLeaveGuard = useCallback<RegisterLeaveGuard>(guard => { securityLeaveGuard.current = guard }, [])
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline)
  const category = CATEGORIES.find(item => item.key === activeCategory) ?? CATEGORIES[0]
  const { requestLeave: requestDraftLeave, settleLeave } = useEditorLeaveGuard({ dirty, onConfirm: () => setLeave(true), onCancel: () => setLeave(false) })
  const requestLeave = useCallback(async () => {
    if (busyRef.current) { setError("正在保存，请等待保存完成后再离开。"); return false }
    if (securityLeaveGuard.current && !await securityLeaveGuard.current()) return false
    return requestDraftLeave()
  }, [requestDraftLeave])
  useEffect(() => { registerLeaveGuard?.(requestLeave); return () => registerLeaveGuard?.(null) }, [registerLeaveGuard, requestLeave])
  useEffect(() => {
    if (!dirty && !busy) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [dirty, busy])
  const decideLeave = (allow: boolean) => { if (allow) {setSettings({...baseline}); setError("")} setLeave(false); settleLeave(allow) }
  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => { if (!busyRef.current) {setSettings(current => ({...current, [key]: value})); setError("")} }
  useEffect(() => {
    if (DEMO_MODE) return
    const controller = new AbortController()
    setServerReady(false)
    api<Record<string, string>>("/settings", {signal: controller.signal}).then(values => {
      if (controller.signal.aborted) return
      const next = {...initial.settings}
      for (const key of preferenceKeys) if (values[key] != null) Object.assign(next, {[key]: typeof next[key] === "boolean" ? values[key] === "true" : values[key]})
      setSettings(next); setBaseline(next); setServerReady(true); setError("")
    }).catch(error => {if (!controller.signal.aborted) setError(error.message)})
    return () => controller.abort()
  }, [loadVersion])
  async function save() {
    if (!serverReady || busyRef.current || (!DEMO_MODE && !dirty)) return
    if (DEMO_MODE && (!settings.displayName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email))) {setError("请填写显示名称和有效的联系邮箱。"); return}
    busyRef.current = true; setBusy(true); setError("")
    const snapshot = {...settings}
    try {
      if (DEMO_MODE) localStorage.setItem(storageKey, JSON.stringify({settings: snapshot, savedAt: new Date().toISOString()}))
      else {
        let confirmed = {...baseline}
        for (const key of preferenceKeys) {
          if (snapshot[key] === confirmed[key]) continue
          await send("/settings", "PUT", {key, value: String(snapshot[key])})
          if (!alive.current) return
          confirmed = {...confirmed, [key]: snapshot[key]}
          setBaseline(confirmed)
        }
      }
      if (!alive.current) return
      setBaseline(snapshot); setStored(true); setError("")
    } catch (error) {
      if (alive.current) setError(DEMO_MODE ? "保存失败：本地存储不可用，请检查浏览器存储权限后重试。" : `部分偏好可能已保存；其余输入已保留，请重试。${error instanceof Error ? error.message : "保存失败"}`)
    } finally {busyRef.current = false; if (alive.current) setBusy(false)}
  }

  return (
    <main className="ui-page settings-workspace">
      <div className="settings-layout">
        <aside className="settings-rail">
          <h1 className="sr-only">设置分类</h1>
          <nav className="settings-category-nav" aria-label="设置分类">
            {CATEGORIES.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`settings-category ${
                  activeCategory === item.key ? "is-selected" : ""
                }`}
                aria-current={
                  activeCategory === item.key ? "page" : undefined
                }
                onClick={async () => {if (item.key !== activeCategory && await requestLeave()) setActiveCategory(item.key)}}
              >
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </button>
            ))}
          </nav>
          <div className="settings-rail-explanation">
            <strong>说明</strong>
            <p>
              当前身份：{ROLE_CONFIG[user.role].label}。此处仅管理当前登录账户。
            </p>
          </div>
          <div className="settings-rail-footer">
            <button type="button" className="settings-logout" onClick={onLogout}>
              退出登录
            </button>
          </div>
        </aside>

        <section className="settings-detail">
          <header className="settings-detail-header">
            <div>
              <h1>{category.title}</h1>
              <p>{category.description}</p>
            </div>
            <Button
              variant="primary"
              aria-label="保存配置"
              onClick={save}
              disabled={!serverReady || busy || (!dirty && (!DEMO_MODE || stored))}
            >
              <Save />
              {busy ? "保存中…" : category.saveLabel}
            </Button>
          </header>

          {error && (
            <p className="ui-error settings-feedback" role="alert">
              {error}
            </p>
          )}

          <div className="settings-detail-divider" />

          {!serverReady && !busy && error && <Button onClick={() => setLoadVersion(value => value + 1)}>重试加载偏好</Button>}
          <fieldset disabled={!serverReady || busy} style={{border: 0, padding: 0, margin: 0}}>
          <div className="settings-detail-content">
            {activeCategory === "personal" && (
              <PersonalPreferences settings={settings} set={set} />
            )}
            {activeCategory === "notifications" && (
              <NotificationSettings settings={settings} set={set} />
            )}
            {activeCategory === "display" && (
              <DisplaySettings settings={settings} set={set} />
            )}
            {activeCategory === "security" && (
              <SecuritySettings settings={settings} set={set} account={user.account} busy={busy} registerLeaveGuard={registerSecurityLeaveGuard} />
            )}
          </div>

          {DEMO_MODE && activeCategory === "personal" && <LegacyCompatibilityControls
            settings={settings}
            set={set}
            onRestore={() => restoreDialog.current?.showModal()}
          />}

          <div className="settings-save-status" role="status" aria-live="polite">
            {stored && !dirty && !error && (
              <>
                <Check size={14} />
                <span>{DEMO_MODE ? "已保存至本机" : "偏好已保存至服务器"}</span>
              </>
            )}
            {dirty && <span>有未保存修改</span>}
          </div>
        </fieldset>
        </section>
      </div>

      {leave && <SettingsDialog title="未保存的修改" onClose={() => decideLeave(false)}><p>离开将放弃未保存的修改，已确认保存的偏好会保留。</p><footer><Button onClick={() => decideLeave(false)}>继续编辑</Button><Button variant="primary" onClick={() => decideLeave(true)}>放弃修改</Button></footer></SettingsDialog>}
      <dialog
        ref={restoreDialog}
        className="ui-dialog"
        aria-labelledby="settings-restore-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="ui-dialog-heading">
          <h2 id="settings-restore-title">恢复默认配置？</h2>
          <Button
            iconOnly
            variant="ghost"
            aria-label="关闭"
            title="关闭"
            onClick={() => restoreDialog.current?.close()}
          >
            <X />
          </Button>
        </div>
        <p>
          当前未保存的修改将被替换。已保存的本地配置不受影响，直到再次保存。
        </p>
        <div className="ui-dialog-actions">
          <Button onClick={() => restoreDialog.current?.close()}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              setSettings({ ...DEFAULT_SETTINGS, ...seed })
              setError("")
              restoreDialog.current?.close()
            }}
          >
            恢复默认
          </Button>
        </div>
      </dialog>
    </main>
  )
}
