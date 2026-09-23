import { DEMO_MODE } from "@/api/client"
import { useEffect, useState, type FormEvent } from "react"
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Zap,
} from "lucide-react"
import {
  DEMO_MFA_CODE,
  useAuth,
} from "@/auth/AuthContext"
import { DEMO_USERS, ROLE_CONFIG } from "@/auth/roles"
import "./auth.css"

export default function LoginPage() {
  const {
    pendingUser,
    rememberedAccount,
    login,
    verifyMfa,
    cancelMfa,
  } = useAuth()
  const [account, setAccount] = useState(rememberedAccount)
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(Boolean(rememberedAccount))
  const [showPassword, setShowPassword] = useState(false)
  const [mfaCode, setMfaCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setError("")
    setMfaCode("")
  }, [pendingUser?.id])

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (!account.trim() || !password) {
      setError("请输入账号和密码。")
      return
    }
    setLoading(true)
    try {
      const result = await login(account, password, remember)
      if (!result.ok) setError(result.message)
      setLoading(false)
    } finally { setLoading(false) }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (!/^\d{6}$/.test(mfaCode)) {
      setError("请输入 6 位数字验证码。")
      return
    }
    setLoading(true)
    try {
      const result = await verifyMfa(mfaCode)
      if (!result.ok) setError(result.message)
      setLoading(false)
    } finally { setLoading(false) }
  }

  function fillDemo(user: (typeof DEMO_USERS)[number]) {
    setAccount(user.account)
    setPassword(user.password)
    setError("")
  }

  return (
    <main className="auth-page">
      <section className="auth-context" aria-label="平台介绍">
        <div className="auth-brand">
          <span><Zap size={18} /></span>
          <strong>Enerlution</strong>
        </div>
        <div className="auth-context-copy">
          <p>Energy Asset Platform</p>
          <h1>Enerlution，让能源资产运行更清晰</h1>
          <span>
            Enerlution 源自 Energy Solution，聚焦能源资产的运营、交付与运维管理。通过统一的数据视图和角色化工作台，让站点状态、设备接入、告警处置与收益表现更清楚、更可追踪。
          </span>
        </div>
        <dl className="auth-status">
          <div><dt>运行环境</dt><dd><i />{DEMO_MODE ? "演示环境" : "业务服务环境"}</dd></div>
          <div><dt>数据区域</dt><dd>{DEMO_MODE ? "华东集群" : "以授权站点为准"}</dd></div>
          <div><dt>权限模式</dt><dd>角色与站点范围</dd></div>
        </dl>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          {pendingUser ? (
            <>
              <button type="button" className="auth-back" onClick={cancelMfa}>
                <ArrowLeft size={15} />返回账号登录
              </button>
              <div className="auth-heading">
                <span className="auth-heading-icon"><ShieldCheck /></span>
                <div>
                  <h2>安全验证</h2>
                  <p>{pendingUser.name} · {DEMO_MODE ? ROLE_CONFIG[pendingUser.role].shortLabel : "请输入认证器验证码"}</p>
                </div>
              </div>
              <form className="auth-form" onSubmit={submitMfa}>
                <label>
                  <span>动态验证码</span>
                  <div className="auth-input">
                    <KeyRound size={17} />
                    <input
                      aria-label="动态验证码"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="请输入 6 位验证码"
                      value={mfaCode}
                      onChange={(event) =>
                        setMfaCode(event.target.value.replace(/\D/g, ""))
                      }
                      autoFocus
                    />
                  </div>
                </label>
                {DEMO_MODE && <p className="auth-demo-code">
                  演示验证码 <strong>{DEMO_MFA_CODE}</strong>
                </p>}
                {error && <p className="auth-error" role="alert">{error}</p>}
                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? <LoaderCircle className="auth-spin" /> : <ShieldCheck />}
                  {loading ? "正在验证" : "完成验证"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="auth-heading">
                <span className="auth-heading-icon"><LockKeyhole /></span>
                <div>
                  <h2>登录工作台</h2>
                  <p>账号将自动匹配角色和授权电站</p>
                </div>
              </div>
              <form className="auth-form" onSubmit={submitLogin}>
                <label>
                  <span>登录账号</span>
                  <div className="auth-input">
                    <KeyRound size={17} />
                    <input
                      aria-label="登录账号"
                      type="text"
                      autoComplete="username"
                      placeholder="name@company.com"
                      value={account}
                      onChange={(event) => setAccount(event.target.value)}
                      autoFocus
                    />
                  </div>
                </label>
                <label>
                  <span>密码</span>
                  <div className="auth-input">
                    <LockKeyhole size={17} />
                    <input
                      aria-label="密码"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      title={showPassword ? "隐藏密码" : "显示密码"}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </label>
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  记住登录账号
                </label>
                {error && <p className="auth-error" role="alert">{error}</p>}
                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? <LoaderCircle className="auth-spin" /> : <LockKeyhole />}
                  {loading ? "正在登录" : "登录"}
                </button>
              </form>

              {DEMO_MODE && <div className="auth-demo">
                <div><span>演示账号</span><small>密码统一为 Demo@2026</small></div>
                {DEMO_USERS.map((user) => (
                  <button key={user.id} type="button" onClick={() => fillDemo(user)}>
                    <span>
                      <strong>{ROLE_CONFIG[user.role].shortLabel}</strong>
                      <small>{user.account}</small>
                    </span>
                    <CheckCircle2 />
                  </button>
                ))}
              </div>}
            </>
          )}
        </div>
        <p className="auth-footnote">
          登录即代表你同意按照当前项目授权范围使用平台。关键操作将记录到安全审计。
        </p>
      </section>
    </main>
  )
}
