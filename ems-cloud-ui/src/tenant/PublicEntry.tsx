import { useEffect, useState, type FormEvent } from "react"

import LoginPage from "@/components/LoginPage"

import { send } from "@/api/client"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import { useDisplayPreferences } from "@/preferences/PreferencesProvider"

import CompanyForm, { blankCompany } from "./CompanyForm"

import { Field, QueryState, useTenantQuery, date, statusLabel } from "./shared"

import type { Row } from "./types"

export default function PublicEntry() {
  const [route, setRoute] = useState(() => location.hash),
    [token] = useState(() =>
      new URLSearchParams(location.hash.slice(1)).get("activate"),
    )

  useEffect(() => {
    if (token) history.replaceState(null, "", location.pathname)

    const changed = () => setRoute(location.hash)

    window.addEventListener("hashchange", changed)

    return () => window.removeEventListener("hashchange", changed)
  }, [])

  if (token) return <ActivationPage token={token} />

  if (route === "#register") return <RegistrationPage />

  if (route === "#application-progress") return <ApplicationProgressPage />

  return (
    <LoginPage
      onRegister={() => (location.hash = "register")}
      onProgress={() => (location.hash = "application-progress")}
    />
  )
}

function PublicShell({
  title,

  children,
}: {
  title: string

  children: React.ReactNode
}) {
  return (
    <main className="tenant-public">
      <a href="#">Enerlution · 返回登录</a>
      <h1>{title}</h1>
      <div className="tenant-card">{children}</div>
    </main>
  )
}

export function EmailVerification({
  onVerified,
}: {
  onVerified: (email: string, context: string) => void
}) {
  const { language } = useDisplayPreferences()

  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("")

  async function request() {
    setBusy(true)

    setError("")

    try {
      const r = await send<{ challengeId: string ;mailStatus: string }>(
        "/public/registration/email-challenges",

        "POST",

        { email, language: language === "English" ? "en" : "zh-CN" },
      )

      setChallenge(r.challengeId)

      setNotice("验证码已加入邮件队列，请查收邮箱。")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()

    setBusy(true)

    setError("")

    try {
      const r = await send<{ email: string ;context: string }>(
        "/public/registration/email-challenges/verify",

        "POST",

        { challengeId: challenge, code },
      )

      onVerified(r.email, r.context)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={verify}>
      <div className="tenant-form-grid">
        <Field label="邮箱 *">
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            disabled={busy}
            onChange={(e) => {
              setEmail(e.target.value)

              setChallenge("")

              setNotice("")
            }}
          />
        </Field>
        <div style={{ alignSelf: "end" }}>
          <Button
            disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
            onClick={request}
          >
            {challenge ? "重发验证码" : "发送验证码"}
          </Button>
        </div>
        {challenge && (
          <Field label="邮箱验证码">
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        )}
      </div>
      {notice && (
        <p role="status" className="tenant-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="api-inline-error">
          {error}
        </p>
      )}
      {challenge && (
        <div className="tenant-public-actions">
          <Button variant="primary" type="submit" disabled={busy}>
            验证邮箱
          </Button>
        </div>
      )}
    </form>
  )
}

export function RegistrationPage() {
  const { language } = useDisplayPreferences()

  const env = useTenantQuery<Row[]>("/public/environments")

  const [company, setCompany] = useState<Row>({ ...blankCompany }),
    [step, setStep] = useState(1),
    [email, setEmail] = useState(""),
    [context, setContext] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Row | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()

    setError("")

    if (!company.companyTypes.length || !company.businessScopes.length)
      return setError("请选择企业类型及储能业务范围")

    if (step === 1) {
      setStep(2)

      return
    }

    if (!context) return setError("请先完成邮箱验证")

    setBusy(true)

    try {
      setResult(
        await send<Row>("/public/company-applications", "POST", {
          company,

          email,

          context,

          language: language === "English" ? "en" : "zh-CN",
        }),
      )

      setStep(3)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicShell title="企业入驻申请">
      <div className="tenant-steps">
        {["企业资料", "联系人与邮箱验证", "提交成功"].map((s, i) => (
          <span key={s} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      <Field label="数据中心">
        <select aria-label="数据中心">
          {env.data?.map((v) => (
            <option key={v.code} value={v.code} disabled={!v.available}>
              {v.code} · {v.available ? "可用" : "未开放"}
            </option>
          ))}
        </select>
      </Field>
      <QueryState loading={env.loading} error={env.error} />
      {step < 3 ? (
        <>
          <form onSubmit={submit}>
            {step === 1 ? (
              <CompanyForm
                value={company}
                onChange={setCompany}
                contact={false}
              />
            ) : (
              <>
                <p>申请邮箱：{email || "待验证"}</p>
                <p>企业：{company.name}</p>
                <div className="tenant-form-grid">
                  {[
                    ["contactName", "联系人 *"],

                    ["phone", "国际电话 *"],

                    ["website", "官网"],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        required={key !== "website"}
                        type={
                          key === "phone"
                            ? "tel"
                            : key === "website"
                              ? "url"
                              : "text"
                        }
                        value={company[key]}
                        onChange={(e) =>
                          setCompany({ ...company, [key]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="api-inline-error">
                {error}
              </p>
            )}
            <div className="tenant-public-actions">
              {step === 2 ? (
                <Button onClick={() => setStep(1)} disabled={busy}>
                  上一步
                </Button>
              ) : (
                <a href="#">返回登录</a>
              )}
              <Button
                variant="primary"
                type="submit"
                disabled={
                  busy ||
                  env.loading ||
                  !env.data?.some((e) => e.available) ||
                  (step === 2 && !context)
                }
              >
                {busy ? "正在提交…" : step === 1 ? "下一步" : "提交申请"}
              </Button>
            </div>
          </form>
          {step === 2 && !context && (
            <section style={{ marginTop: 24 }}>
              <h2>验证申请邮箱</h2>
              <EmailVerification
                onVerified={(email, context) => {
                  setEmail(email)

                  setContext(context)
                }}
              />
            </section>
          )}
        </>
      ) : (
        <>
          <h2>申请已提交</h2>
          <p className="tenant-notice">
            申请编号：{result?.number}
            。审批通过后，邮箱将收到一次性激活链接，届时由你设置登录密码。
          </p>
          <a href="#application-progress">查看申请进度</a>
        </>
      )}
    </PublicShell>
  )
}

export function ApplicationProgressPage() {
  const [identity, setIdentity] = useState<{
      email: string

      context: string
    } | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false)

  async function load(email: string, context: string) {
    setIdentity({ email, context })

    setLoading(true)

    setError("")

    try {
      setRows(
        await send<Row[]>("/public/company-applications/progress", "POST", {
          email,

          context,
        }),
      )
    } catch (e) {
      setError((e as Error).message)

      setIdentity(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell title="企业申请进度">
      {!identity ? (
        <EmailVerification onVerified={load} />
      ) : (
        <>
          <PageHeader
            title={identity.email}
            actions={
              <Button onClick={() => load(identity.email, identity.context)}>
                刷新进度
              </Button>
            }
          />
          {rows.map((row) => (
            <article key={row.id} className="tenant-card">
              <h2>
                {row.number} · <Badge>{statusLabel(row.status)}</Badge>
              </h2>
              <p className="tenant-muted">提交时间 {date(row.submitted_at)}</p>
              <ul className="tenant-timeline">
                {row.events?.map((e: Row) => (
                  <li key={e.id}>
                    {statusLabel(e.action)}
                    {e.reason && <p>{e.reason}</p>}
                    <small>{date(e.occurred_at)}</small>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </>
      )}
      <QueryState
        loading={loading}
        error={error}
        empty={!!identity && !rows.length}
      />
    </PublicShell>
  )
}

export function ActivationPage({ token }: { token: string }) {
  const [identity, setIdentity] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    send<Row>("/public/activations/inspect", "POST", { token })

      .then((v) => {
        if (active) setIdentity(v)
      })

      .catch((e) => {
        if (active) setError(e.message)
      })

    return () => {
      active = false
    }
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()

    setError("")

    if (password !== confirmation) return setError("两次密码不一致")

    if (new TextEncoder().encode(password).length > 72)
      return setError("密码不能超过 72 字节")

    setBusy(true)

    try {
      await send("/public/activations/accept", "POST", { token, password })

      setDone(true)

      setPassword("")

      setConfirmation("")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicShell title="设置密码并激活账号">
      {done ? (
        <>
          <p className="tenant-notice">账号已激活，请使用新密码登录。</p>
          <a href="/">返回登录</a>
        </>
      ) : identity ? (
        <form onSubmit={submit}>
          <p>
            {identity.name} · {identity.account}
          </p>
          <div className="tenant-form-grid">
            <Field label="新密码">
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                pattern="(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9]).{8,}"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="确认新密码">
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
          </div>
          <p className="tenant-muted">
            至少 8 位，包含大小写字母和数字，最多 72 字节。
          </p>
          <div className="tenant-public-actions">
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "正在激活…" : "激活账号"}
            </Button>
          </div>
        </form>
      ) : (
        !error && <p role="status">正在检查激活链接…</p>
      )}
      {error && (
        <p role="alert" className="api-inline-error">
          {error}
        </p>
      )}
    </PublicShell>
  )
}
