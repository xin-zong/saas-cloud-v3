import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"

import { api, send } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { Button, Badge } from "@/components/ui/Workspace"
import SettingsDialog from "@/components/SettingsDialog"
import LoadingState from "@/components/LoadingState"
import { useEditorLeaveGuard, type RegisterLeaveGuard } from "@/components/useEditorLeaveGuard"

import { Field, QueryState, useTenantQuery } from "./shared"

import type { Row } from "./types"

const SAVING_PROFILE_NOTICE = "正在保存账户资料，请等待完成后再离开。"

// Settings 1077:1794 → R7 personal preferences 1146:810 (latest context/screenshot).
export default function PersonalCenterPage({ registerLeaveGuard }: { registerLeaveGuard?: RegisterLeaveGuard }) {
  const { user } = useAuth()
  return <PersonalProfileEditor key={user?.id ?? "anonymous"} registerLeaveGuard={registerLeaveGuard} />
}

function PersonalProfileEditor({ registerLeaveGuard }: { registerLeaveGuard?: RegisterLeaveGuard }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Row | null>(null)
  const [name, setName] = useState("")
  const [baseline, setBaseline] = useState("")
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [loadVersion, setLoadVersion] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const alive = useRef(false)
  const busyRef = useRef(false)
  const dirty = name !== baseline
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setLoadError("")
    api<Row>("/me/profile", { signal: controller.signal }).then(next => {
      if (controller.signal.aborted) return
      setProfile(next); setBaseline(next.display_name)
      if (!dirtyRef.current) setName(next.display_name)
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [loadVersion])
  const { requestLeave: requestDraftLeave, settleLeave } = useEditorLeaveGuard({
    dirty, onConfirm: () => setLeaving(true), onCancel: () => setLeaving(false),
  })
  const requestLeave = useCallback(async () => {
    if (busyRef.current) { setError(SAVING_PROFILE_NOTICE); return false }
    return requestDraftLeave()
  }, [requestDraftLeave])
  useEffect(() => { registerLeaveGuard?.(requestLeave); return () => registerLeaveGuard?.(null) }, [registerLeaveGuard, requestLeave])
  useEffect(() => {
    if (!dirty && !busy) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [dirty, busy])
  function decideLeave(allow: boolean) {
    if (allow) { setName(baseline); setError(""); setNotice("") }
    setLeaving(false); settleLeave(allow)
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current || loading || !profile || loadError || !dirty) return
    const nextName = name.trim()
    if (!nextName || name.length > 120) { setError("显示名称须为 1–120 个字符，不能仅包含空白。"); return }
    busyRef.current = true; setBusy(true); setError(""); setNotice("")
    try {
      await send("/me/profile", "PUT", { name: nextName })
      if (!alive.current) return
      setName(nextName); setBaseline(nextName)
      try {
        const next = await api<Row>("/me/profile")
        if (!alive.current) return
        setProfile(next); setName(next.display_name); setBaseline(next.display_name)
        setLoadError(""); setNotice("显示名称已保存。")
      } catch (error) {
        if (alive.current) setLoadError(`姓名已写入，但资料回读失败，请重试读取。${error instanceof Error ? error.message : ""}`)
      }
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : "显示名称保存失败，请重试。")
    } finally {
      busyRef.current = false
      if (alive.current) { setBusy(false); setError(current => current === SAVING_PROFILE_NOTICE ? "" : current) }
    }
  }

  return (
    <section className="tenant-card">
      <h2>账户资料</h2>
      {loading ? <LoadingState label="正在加载账户资料…" /> : <QueryState loading={false} error={loadError} />}
      {loadError && <Button disabled={busy || loading} onClick={() => setLoadVersion(version => version + 1)}>重试读取账户资料</Button>}
      <form onSubmit={save}>
        <div className="tenant-form-grid">
          <Field label="显示名称">
            <input
              required
              maxLength={120}
              value={name}
              disabled={busy || loading || !profile || !!loadError}
              onChange={(e) => { setName(e.target.value); setError(""); setNotice("") }}
            />
          </Field>
          <Field label="登录邮箱">
            <input readOnly value={user?.account ?? ""} />
          </Field>
        </div>
        <p className="tenant-muted">
          {profile?.tenant_name} ·{" "}
          {user?.roleNames?.join("、") || "未分配角色"}{" "}
          {user?.tenant?.administrator && <Badge>受保护管理员</Badge>}
        </p>
        {error && (
          <p role="alert" className="api-inline-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="tenant-notice">
            {notice}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={busy || loading || !profile || !!loadError || !dirty}
        >
          {busy ? "正在保存…" : "保存账户资料"}
        </Button>
      </form>
      {leaving && <SettingsDialog title="未保存的账户姓名" onClose={() => decideLeave(false)}>
        <p>离开将放弃未保存的姓名修改，不会自动保存。</p>
        <footer><Button onClick={() => decideLeave(false)}>继续编辑</Button><Button variant="primary" onClick={() => decideLeave(true)}>放弃修改</Button></footer>
      </SettingsDialog>}
    </section>
  )
}

export function PersonalSecurity({ registerLeaveGuard }: { registerLeaveGuard?: RegisterLeaveGuard } = {}) {
  const { logout } = useAuth(),
    profile = useTenantQuery<Row>("/me/profile")

  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const [leaving, setLeaving] = useState(false)
  const busyRef = useRef(false)
  const dirty = !!(current || password || confirmation)
  const { requestLeave: requestDraftLeave, settleLeave } = useEditorLeaveGuard({
    dirty, onConfirm: () => setLeaving(true), onCancel: () => setLeaving(false),
  })
  const requestLeave = useCallback(async () => {
    if (busyRef.current) { setError("正在提交密码变更，请等待完成后再离开。"); return false }
    return requestDraftLeave()
  }, [requestDraftLeave])
  useEffect(() => { registerLeaveGuard?.(requestLeave); return () => registerLeaveGuard?.(null) }, [registerLeaveGuard, requestLeave])
  useEffect(() => {
    if (!dirty && !busy) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", prevent)
    return () => window.removeEventListener("beforeunload", prevent)
  }, [dirty, busy])
  function decideLeave(allow: boolean) {
    if (allow && busyRef.current) return
    if (allow) { setCurrent(""); setPassword(""); setConfirmation(""); setError("") }
    setLeaving(false); settleLeave(allow)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busyRef.current) return

    setError("")

    if (password !== confirmation) return setError("两次新密码不一致")

    if (new TextEncoder().encode(password).length > 72)
      return setError("密码不能超过 72 字节")

    busyRef.current = true; setBusy(true)

    try {
      await send("/me/password", "PUT", {
        currentPassword: current,

        newPassword: password,
      })

      setCurrent("")

      setPassword("")

      setConfirmation("")

      logout()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      busyRef.current = false; setBusy(false)
    }
  }

  return (
    <section className="tenant-card">
      <h2>登录与安全</h2>
      <p className="tenant-muted">
        登录账户：{profile.data?.account} · 多因素认证：
        {profile.data?.mfa_enabled ? "已配置" : "未配置"}
      </p>
      <form onSubmit={submit}>
        <div className="tenant-form-grid">
          <Field label="当前密码">
            <input
              required
              type="password"
              disabled={busy}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="新密码">
            <input
              required
              type="password"
              disabled={busy}
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
              disabled={busy}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
        </div>
        <p className="tenant-notice">
          新密码至少 8
          位，含大小写字母和数字。保存后撤销所有设备会话，需要重新登录。
        </p>
        {error && (
          <p role="alert" className="api-inline-error">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "正在提交…" : "修改密码并退出全部设备"}
        </Button>
      </form>
      {leaving && <SettingsDialog title="未保存的安全输入" onClose={() => decideLeave(false)}>
        <p>离开将清空本次密码输入，不会提交密码变更。</p>
        <footer><Button onClick={() => decideLeave(false)}>继续编辑</Button><Button variant="primary" onClick={() => decideLeave(true)}>放弃修改</Button></footer>
      </SettingsDialog>}
    </section>
  )
}
