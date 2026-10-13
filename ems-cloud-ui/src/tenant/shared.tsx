import { labeledControl } from "@/i18n/labeledControl"
import { createPortal } from "react-dom"

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react"

import { api, CAPABILITIES_CHANGED } from "@/api/client"

import { Button } from "@/components/ui/Workspace"

import { localized } from "@/preferences/date"

import type { Row } from "./types"

import "./tenant.css"

export function useTenantQuery<T>(path: string | null, revision = 0) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(!!path),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const clear = () => {
      setData(null)

      setEpoch((n) => n + 1)
    }

    window.addEventListener(CAPABILITIES_CHANGED, clear)

    return () => window.removeEventListener(CAPABILITIES_CHANGED, clear)
  }, [])

  useEffect(() => {
    const c = new AbortController()

    setData(null)

    setError("")

    if (!path) {
      setLoading(false)
      return
    }

    setLoading(true)

    api<T>(path, { signal: c.signal })

      .then((v) => {
        if (!c.signal.aborted) setData(v)
      })

      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })

      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })

    return () => c.abort()
  }, [path, revision, epoch])

  return { data, loading, error, reload: () => setEpoch((n) => n + 1) }
}

export function QueryState({
  loading,

  error,

  empty,
}: {
  loading: boolean

  error: string

  empty?: boolean
}) {
  return loading ? (
    <p role="status" className="tenant-empty">
      正在加载…
    </p>
  ) : error ? (
    <p role="alert" className="api-inline-error">
      {error}
    </p>
  ) : empty ? (
    <p className="tenant-empty">暂无记录</p>
  ) : null
}

export function Field({
  label,

  children,

  wide = false,
}: {
  label: string

  children: ReactNode

  wide?: boolean
}) {
  return (
    <label
      className={wide ? "tenant-field tenant-field--wide" : "tenant-field"}
    >
      <span>{label}</span>
      {labeledControl(children,label)}
    </label>
  )
}

export function CheckList({
  options,

  value,

  onChange,

  label,
}: {
  options: ReadonlyArray<readonly [string, string]>

  value: string[]

  onChange: (v: string[]) => void

  label: string
}) {
  return (
    <fieldset className="tenant-checklist">
      <legend>{label}</legend>
      {options.map(([id, name]) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={value.includes(id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, id]
                  : value.filter((x) => x !== id),
              )
            }
          />
          {name}
        </label>
      ))}
    </fieldset>
  )
}

export function TenantDialog({
  title,

  onClose,

  onSave,

  children,

  saveLabel = "保存",

  wide = false,
}: {
  title: string

  onClose: () => void

  onSave?: () => Promise<void>

  children: ReactNode

  saveLabel?: string

  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null

    const d = ref.current

    d?.showModal()

    return () => {
      d?.close()

      previous?.focus()
    }
  }, [])

  const close = () => {
    if (busy) return

    if (dirty && onSave) setDiscard(true)
    else onClose()
  }

  async function save(e: FormEvent) {
    e.preventDefault()

    if (!onSave || busy) return

    setBusy(true)

    setError("")

    try {
      await onSave()

      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，输入已保留")
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <dialog
      ref={ref}
      aria-label={title}
      className={`tenant-dialog ${wide ? "tenant-dialog--wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault()

        close()
      }}
    >
      <form onSubmit={save} onChangeCapture={() => setDirty(true)}>
        <header>
          <h2>{title}</h2>
          <Button aria-label="关闭" disabled={busy} onClick={close}>
            <img src="/figma/platform/close.svg" alt="" />
          </Button>
        </header>
        <div className="tenant-dialog-body">
          {discard ? (
            <section role="alert">
              <h3>放弃尚未保存的修改？</h3>
              <p>本次输入将丢弃。</p>
              <Button onClick={() => setDiscard(false)}>继续编辑</Button>
              <Button onClick={onClose}>放弃修改</Button>
            </section>
          ) : (
            children
          )}
          {error && (
            <p role="alert" className="api-inline-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <Button disabled={busy} onClick={close}>
            取消
          </Button>
          {onSave && !discard && (
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "正在提交…" : saveLabel}
            </Button>
          )}
        </footer>
      </form>
    </dialog>,

    document.body,
  )
}

export function Pagination({
  total,

  offset,

  onChange,
}: {
  total: number

  offset: number

  onChange: (v: number) => void
}) {
  return (
    <div className="tenant-pagination">
      <span>共 {total} 条</span>
      <Button
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - 20))}
      >
        上一页
      </Button>
      <span>{Math.floor(offset / 20) + 1}</span>
      <Button
        disabled={offset + 20 >= total}
        onClick={() => onChange(offset + 20)}
      >
        下一页
      </Button>
    </div>
  )
}

export const date = (value: unknown) =>
  value ? localized(new Date(String(value)), "toLocaleString", "zh-CN") : "—"

export const statusLabel = (status: string) =>
  ({
    active: "启用",

    invited: "待激活",

    disabled: "停用",

    pending: "待审批",

    approved: "已通过",

    rejected: "已拒绝",

    sent: "已发送",

    failed: "发送失败",

    cancelled: "已取消",
  })[status] ?? status

export function DetailGrid({
  row,

  fields,
}: {
  row: Row

  fields: [string, string][]
}) {
  return (
    <dl className="tenant-detail-grid">
      {fields.map(([key, name]) => (
        <div key={key}>
          <dt>{name}</dt>
          <dd>{row[key] ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}
