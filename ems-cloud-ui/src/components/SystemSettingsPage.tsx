import { DEMO_MODE, api, send } from "@/api/client"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Bell, Check, Save, X } from "lucide-react"
import type { Station } from "@/App"
import { ROLE_CONFIG, type AuthUser } from "@/auth/roles"
import { Button, Select, Switch } from "./ui/Workspace"
import "./system-settings.css"

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

  // Legacy values remain readable so existing local settings are not lost.
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

const STORAGE_KEY = "enerlution-system-settings-v1"

const DEFAULT_SETTINGS: SettingsState = {
  displayName: "周新岸",
  email: "zhou.xinan@enerlution.com",
  phone: "138 **** 2046",
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
  mfaEnabled: true,
  loginDevices: "3 台",
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

function readSettings(seed: Partial<SettingsState> = {}) {
  try {
    const raw = DEMO_MODE ? localStorage.getItem(STORAGE_KEY) : null
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
      settings: { ...DEFAULT_SETTINGS },
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
      <SettingsCard title="账户资料" status="周">
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
        个人偏好仅影响当前账户，不改变其他用户、站点或租户配置。切换左侧分类后，右侧工作区复用相同结构。
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
      <SettingsCard title="通知渠道" status="已启用">
        <div className="settings-account-grid">
          <div className="settings-account-field">
            <span>站内通知</span>
            <div className="settings-faux-field settings-field-status">
              {settings.notificationInApp ? "已开启" : "已关闭"}
            </div>
          </div>
          <div className="settings-account-field">
            <span>邮件通知</span>
            <div className="settings-faux-field settings-field-status">
              {settings.notificationEmail
                ? `已开启 · ${settings.email}`
                : "已关闭"}
            </div>
          </div>
          <div className="settings-account-field">
            <span>短信通知</span>
            <div className="settings-faux-field settings-field-status">
              {settings.notificationSms}
            </div>
          </div>
        </div>
        <p className="settings-card-note">
          通知渠道只影响当前账户，不改变告警规则和事件级别。
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
        通知偏好仅影响当前账户；紧急告警仍按平台安全策略强制送达。切换渠道后保存生效。
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
          时间轴、报表与导出文件统一采用所选时区和计量单位。
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

function SecuritySettings({
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
      <SettingsCard title="账户安全" status="正常">
        <div className="settings-account-grid">
          <div className="settings-account-field">
            <span>登录账户</span>
            <div className="settings-faux-field settings-field-status">
              {settings.email}
            </div>
          </div>
          <div className="settings-account-field">
            <span>多因素认证</span>
            <div className="settings-faux-field settings-field-status">
              {settings.mfaEnabled ? "已开启 · 验证器" : "未开启"}
            </div>
          </div>
          <div className="settings-account-field">
            <span>最近登录</span>
            <div className="settings-faux-field settings-field-status">
              09-06 14:20 · 上海
            </div>
          </div>
        </div>
        <p className="settings-card-note">
          检测到异常登录时将强制二次验证，并通知当前账户。
        </p>
      </SettingsCard>
      <SettingsCard title="登录与会话">
        <div className="settings-preferences">
          <ChoiceRow
            label="多因素认证"
            value={settings.mfaEnabled ? "已开启" : "未开启"}
            options={["已开启", "未开启"]}
            onChange={(value) => set("mfaEnabled", value === "已开启")}
          />
          <ChoiceRow
            label="登录设备"
            value={settings.loginDevices}
            options={["3 台", "查看设备"]}
            onChange={(value) => set("loginDevices", value)}
          />
          <ChoiceRow
            label="登录记录"
            value={settings.loginHistory}
            options={["今天", "近 7 天", "近 30 天"]}
            onChange={(value) => set("loginHistory", value)}
          />
          <ToggleRow
            label="新设备登录提醒"
            checked={settings.newDeviceAlert}
            onChange={() => set("newDeviceAlert", !settings.newDeviceAlert)}
          />
        </div>
      </SettingsCard>
      <ScopeNote title="安全提示">
        退出其他设备会话不会影响当前页面；权限与角色仍由平台管理统一维护。
      </ScopeNote>
    </>
  )
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
    <div className="settings-compatibility">
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
        aria-label="界面语言"
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
    </div>
  )
}

export default function SystemSettingsPage({
  stations = [],
  user,
  onLogout,
}: {
  stations?: Station[]
  user: AuthUser
  onLogout: () => void
}) {
  const primaryStation = stations[0]
  const [initial] = useState(() =>
    readSettings({
      displayName: user.name || primaryStation?.manager || DEFAULT_SETTINGS.displayName,
      email: user.account || primaryStation?.email || DEFAULT_SETTINGS.email,
      phone: primaryStation?.phone || (DEMO_MODE ? DEFAULT_SETTINGS.phone : ""),
      loginDevices: DEMO_MODE ? DEFAULT_SETTINGS.loginDevices : "未知",
      loginHistory: DEMO_MODE ? DEFAULT_SETTINGS.loginHistory : "未接入",
    }),
  )
  const [settings, setSettings] = useState(initial.settings)
  const [baseline, setBaseline] = useState(initial.settings)
  const [activeCategory, setActiveCategory] =
    useState<CategoryKey>("personal")
  const [savedAt, setSavedAt] = useState(initial.savedAt)
  const [stored, setStored] = useState(initial.stored)
  const [error, setError] = useState(initial.error)
  const restoreDialog = useRef<HTMLDialogElement>(null)
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline)
  const category =
    CATEGORIES.find((item) => item.key === activeCategory) ?? CATEGORIES[0]

  const set = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setError("")
  }

  const preferenceKeys = ['defaultEntry', 'defaultTimeRange', 'rememberSiteTab', 'language', 'timezone', 'units', 'theme', 'density', 'chartAnimation', 'highContrast'] as const
  const [serverReady, setServerReady] = useState(DEMO_MODE)
  useEffect(() => {
    if (DEMO_MODE) return
    const controller = new AbortController()
    api<Record<string, string>>('/settings', {signal: controller.signal}).then(values => {
      if (controller.signal.aborted) return
      setSettings(current => {
        const next = {...current}
        for (const key of preferenceKeys) if (values[key] != null) Object.assign(next, {[key]: typeof next[key] === 'boolean' ? values[key] === 'true' : values[key]})
        setBaseline(next); return next
      })
      setServerReady(true)
    }).catch(error => {if (!controller.signal.aborted) setError(error.message)})
    return () => controller.abort()
  }, [])
  async function save() {
    if (!DEMO_MODE) {
      if (!serverReady) return
      setServerReady(false)
      try {
        for (const key of preferenceKeys) if (settings[key] !== baseline[key]) await send('/settings', 'PUT', {key, value: String(settings[key])})
        const values = await api<Record<string, string>>('/settings')
        const next = {...baseline}
        for (const key of preferenceKeys) if (values[key] != null) Object.assign(next, {[key]: typeof next[key] === 'boolean' ? values[key] === 'true' : values[key]})
        setSettings(next); setBaseline(next); setSavedAt(new Date().toISOString()); setStored(true); setError('')
      } catch(error) {setError(error instanceof Error ? error.message : '保存失败；请刷新确认已保存项')}
      finally {setServerReady(true)}
      return
    }
    const timestamp = new Date().toISOString()
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, savedAt: timestamp }),
      )
      setBaseline({ ...settings })
      setSavedAt(timestamp)
      setStored(true)
      setError("")
    } catch {
      setError("保存失败：本地存储不可用，请检查浏览器存储权限后重试。")
    }
  }

  return (
    <main className="ui-page settings-workspace">
      <header className="settings-global-header">
        <div className="settings-global-identity">
          <span className="settings-global-mark" aria-hidden="true" />
          <strong>Enerlution</strong>
        </div>
        <div className="settings-global-utilities">
          <span className="settings-global-updated">
            数据更新{" "}
            {new Date().toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
          <button
            type="button"
            className="settings-global-icon"
            aria-label="通知"
            title="通知"
          >
            <Bell size={18} />
          </button>
          <button
            type="button"
            className="settings-global-avatar"
            aria-label={`${user.name}账户`}
            title={`${user.name} · ${ROLE_CONFIG[user.role].shortLabel}`}
          >
            {user.name.slice(0, 1)}
          </button>
        </div>
      </header>
      <div className="settings-layout">
        <aside className="settings-rail">
          <h1>设置分类</h1>
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
                onClick={() => setActiveCategory(item.key)}
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
              disabled={(!DEMO_MODE && (!serverReady || activeCategory === "security" || activeCategory === "notifications")) || (!dirty && stored)}
            >
              <Save />
              {category.saveLabel}
            </Button>
          </header>

          {error && (
            <p className="ui-error settings-feedback" role="alert">
              {error}
            </p>
          )}

          <div className="settings-detail-divider" />

          {!DEMO_MODE && <p className="settings-feedback">服务器仅保存个人界面偏好；账户资料、消息投递、安全策略和默认页面应用尚未接入。安全配置以服务器实际策略为准。</p>}
          <fieldset disabled={!DEMO_MODE && (activeCategory === 'security' || activeCategory === 'notifications')} style={{border: 0, padding: 0, margin: 0}}>
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
              <SecuritySettings settings={settings} set={set} />
            )}
          </div>

          {DEMO_MODE && <LegacyCompatibilityControls
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
              setSettings({ ...DEFAULT_SETTINGS })
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
