import { useEffect, useState, type FormEvent } from "react"

import { send } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { Button, Badge } from "@/components/ui/Workspace"

import { Field, QueryState, useTenantQuery } from "./shared"

import type { Row } from "./types"

export default function PersonalCenterPage() {
  const { user } = useAuth(),
    profile = useTenantQuery<Row>("/me/profile")

  const [name, setName] = useState(user?.name ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("")

  useEffect(() => {
    if (profile.data) setName(profile.data.display_name)
  }, [profile.data])

  async function save(e: FormEvent) {
    e.preventDefault()

    setBusy(true)

    setError("")

    setNotice("")

    try {
      await send("/me/profile", "PUT", { name })

      setNotice("显示名称已保存，头像和全局身份展示已刷新。")

      profile.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="tenant-card">
      <h2>账户资料</h2>
      <QueryState loading={profile.loading} error={profile.error} />
      <form onSubmit={save}>
        <div className="tenant-form-grid">
          <Field label="显示名称">
            <input
              required
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="登录邮箱">
            <input readOnly value={user?.account ?? ""} />
          </Field>
          <Field label="联系电话">
            <input readOnly value={profile.data?.phone ?? ""} placeholder="—" />
          </Field>
        </div>
        <p className="tenant-muted">
          {profile.data?.tenant_name} ·{" "}
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
          disabled={busy || name === user?.name}
        >
          {busy ? "正在保存…" : "保存账户资料"}
        </Button>
      </form>
    </section>
  )
}

export function PersonalSecurity() {
  const { logout } = useAuth(),
    profile = useTenantQuery<Row>("/me/profile")

  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")

  async function submit(e: FormEvent) {
    e.preventDefault()

    setError("")

    if (password !== confirmation) return setError("两次新密码不一致")

    if (new TextEncoder().encode(password).length > 72)
      return setError("密码不能超过 72 字节")

    setBusy(true)

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
      setBusy(false)
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
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
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
    </section>
  )
}
