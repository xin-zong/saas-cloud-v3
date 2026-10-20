import { useEffect, useRef, useState, type FormEvent } from "react"

import LoginPage from "@/components/LoginPage"

import { ApiError, send } from "@/api/client"
import LoadingState from "@/components/LoadingState"
import {PublicRequestGate,progressGuidance,type VerifiedApplicationIdentity} from "./publicApplicationFlow"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import { useDisplayPreferences } from "@/preferences/PreferencesProvider"

import CompanyForm, { blankCompany } from "./CompanyForm"

import { Field, QueryState, useTenantQuery, date, statusLabel } from "./shared"

import type { Row } from "./types"

export default function PublicEntry() {
  const [progressIdentity,setProgressIdentity]=useState<VerifiedApplicationIdentity|null>(null)
  const [route, setRoute] = useState(() => location.hash),
    [token] = useState(() =>
      new URLSearchParams(location.hash.slice(1)).get("activate"),
    )

  useEffect(() => {
    if (token) history.replaceState(null, "", location.pathname)

    const changed = () => {setRoute(location.hash);if(location.hash!=="#application-progress")setProgressIdentity(null)}

    window.addEventListener("hashchange", changed)

    return () => window.removeEventListener("hashchange", changed)
  }, [])

  if (token) return <ActivationPage token={token} />

  if (route === "#register") return <RegistrationPage onProgress={identity=>{setProgressIdentity(identity);location.hash="application-progress"}}/>

  if (route === "#application-progress") return <ApplicationProgressPage initialIdentity={progressIdentity}/>

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
      <a href="/">Enerlution · 返回登录</a>
      <h1>{title}</h1>
      <div className="tenant-card">{children}</div>
    </main>
  )
}

export function EmailVerification({
  onVerified, initialEmail="",
}: {
  onVerified: (email: string, context: string) => void
  initialEmail?:string
}) {
  const { language } = useDisplayPreferences()

  const [email, setEmail] = useState(initialEmail),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("")

  const gate=useRef(new PublicRequestGate())
  const env=useTenantQuery<Row[]>("/public/environments")
  const mailUnavailable=env.data?.some(row=>row.mailAvailable===false)===true

  async function request() {
    if(mailUnavailable)return setError("邮件服务尚未配置，请联系平台管理员")
    return gate.current.run(async()=>{
    setBusy(true)

    setError("")

    try {
      const r = await send<{ challengeId: string ;mailStatus: string }>(
        "/public/registration/email-challenges",

        "POST",

        { email, language: language === "English" ? "en" : "zh-CN" },
      )

      setChallenge(r.challengeId)

      setCode("");setNotice("验证码已加入邮件队列，尚不代表已送达。有效期10分钟，请查收邮箱。")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
    })
  }

  async function deliveryStatus(){
    return gate.current.run(async()=>{
      setBusy(true);setError("")
      try{
        const result=await send<{mailStatus:string;expiresAt:string}>("/public/registration/email-challenges/status","POST",{challengeId:challenge,email})
        const labels:Record<string,string>={pending:'验证码邮件正在排队投递。',sending:'验证码邮件正在投递中。',sent:'邮件服务器已接收，请查看收件箱或垃圾邮件。',failed:'验证码邮件投递失败，请联系管理员或稍后重发。',cancelled:'验证码邮件已取消，请重新发送。',expired:'验证码已过期，请重新发送。'}
        setNotice(labels[result.mailStatus]??'邮件投递状态未知，请稍后重试。')
        if(result.mailStatus==='expired'){setChallenge("");setCode("")}
      }catch(cause){setError(cause instanceof Error?cause.message:'读取邮件投递状态失败')}
      finally{setBusy(false)}
    })
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    return gate.current.run(async()=>{

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
    })
  }

  return (
    <form onSubmit={verify}>
      {busy&&<LoadingState compact label="正在处理邮箱验证…"/>}
      {env.loading&&<LoadingState compact label="正在检查邮件服务…"/>}
      {mailUnavailable&&<p role="alert" className="api-inline-error">邮件服务尚未配置，请联系平台管理员。无法发送邮箱验证码。</p>}
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

              setChallenge("");setCode("");setError("")

              setNotice("")
            }}
          />
        </Field>
        <div style={{ alignSelf: "end" }}>
          <Button
            disabled={busy || env.loading || mailUnavailable || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
            onClick={request}
          >
            {challenge ? "重发验证码" : "发送验证码"}
          </Button>
          {challenge&&<Button disabled={busy} onClick={()=>void deliveryStatus()}>查询投递状态</Button>}
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

export function RegistrationPage({onProgress}:{onProgress?:(identity:VerifiedApplicationIdentity)=>void}={}) {
  const { language } = useDisplayPreferences()

  const env = useTenantQuery<Row[]>("/public/environments")

  const [company, setCompany] = useState<Row>({ ...blankCompany }),
    [step, setStep] = useState(1),
    [email, setEmail] = useState(""),
    [context, setContext] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Row | null>(null)

  const gate=useRef(new PublicRequestGate())
  const registrationUnavailable=env.data?.some(row=>row.available&&row.registrationAvailable===false)===true
  async function submit(e: FormEvent) {
    e.preventDefault()
    return gate.current.run(async()=>{

    setError("")
    if(registrationUnavailable)return setError("邮件服务尚未配置，暂时无法完成入驻申请，请联系平台管理员")

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
      if(e instanceof ApiError&&e.status===401)setContext("")
    } finally {
      setBusy(false)
    }
    })
  }

  return (
    <PublicShell title="企业入驻申请">
      {busy&&<LoadingState label="正在提交企业申请…"/>}
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
      <QueryState loading={false} error={env.error} />
      {env.loading&&<LoadingState compact label="正在读取数据中心…"/>}
      {registrationUnavailable&&<p role="alert" className="api-inline-error">邮件服务尚未配置，暂时无法完成入驻申请。已填写的企业资料会保留，请联系平台管理员。</p>}
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
                <p>申请邮箱：{email || "待验证"} {context&&<Button disabled={busy} onClick={()=>setContext("")}>更换邮箱 / 重新验证</Button>}</p>
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
                  !env.data?.some((e) => e.available) || registrationUnavailable ||
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
              <EmailVerification initialEmail={email}
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
          <Button onClick={()=>onProgress?onProgress({email,context}):location.hash="application-progress"}>查看申请进度</Button>
        </>
      )}
    </PublicShell>
  )
}

export function ApplicationProgressPage({initialIdentity=null}:{initialIdentity?:VerifiedApplicationIdentity|null}={}) {
  const [identity,setIdentity]=useState<VerifiedApplicationIdentity|null>(initialIdentity),[rows,setRows]=useState<Row[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false)
  const gate=useRef(new PublicRequestGate()),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  async function load(email:string,context:string){
    return gate.current.run(async()=>{
      setIdentity({email,context});setLoading(true);setError("")
      try{const result=await send<Row[]>("/public/company-applications/progress","POST",{email,context});if(!alive.current)return;setRows(result);setIdentity({email,context})}
      catch(e){if(!alive.current)return;setError((e as Error).message);if(e instanceof ApiError&&e.status===401){setRows([]);setIdentity(null)}}
      finally{if(alive.current)setLoading(false)}
    })
  }
  useEffect(()=>{if(initialIdentity)void load(initialIdentity.email,initialIdentity.context)},[])
  return <PublicShell title="企业申请进度">
    {!identity?<EmailVerification onVerified={load}/>:<>
      <PageHeader title={identity.email} actions={<><Button disabled={loading} onClick={()=>void load(identity.email,identity.context)}>刷新进度</Button><Button disabled={loading} onClick={()=>{setIdentity(null);setRows([]);setError("")}}>更换邮箱 / 重新验证</Button></>}/>
      {rows.map(row=><article key={row.id} className="tenant-card">
        <h2>{row.number} · <Badge>{statusLabel(row.status)}</Badge></h2>
        {row.name&&<p>{row.name}</p>}
        <p className="tenant-muted">提交时间 {date(row.submitted_at)}</p>
        <ul className="tenant-timeline">{row.events?.map((event:Row)=><li key={event.id}>{statusLabel(event.action)}{event.reason&&<p>{event.reason}</p>}<small>{date(event.occurred_at)}</small></li>)}</ul>
        <p role="status">{progressGuidance(row)}</p>
        {(row.nextAction==='reapply'||row.status==='rejected')&&<a href="#register">补充资料重新申请</a>}
        {row.nextAction==='sign_in'&&<a href="#">返回登录</a>}
      </article>)}
    </>}
    {loading&&<LoadingState label="正在查询申请进度…"/>}
    <QueryState loading={false} error={error} empty={!loading&&!!identity&&!rows.length}/>
  </PublicShell>
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

  const activationGate=useRef(new PublicRequestGate())
  async function submit(e: FormEvent) {
    e.preventDefault()
    return activationGate.current.run(async()=>{

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
    })
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
