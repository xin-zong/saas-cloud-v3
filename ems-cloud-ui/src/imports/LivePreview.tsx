import { useEffect, useRef, useState } from "react"
import {
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react"

type LiveStatus = "ready" | "updating" | "error" | "disconnected"

type HmrErrorEvent = {
  err?: {
    message?: string
  }
}

type StatusCopy = {
  label: string
  color: string
}

const STATUS_COPY: Record<LiveStatus, StatusCopy> = {
  ready: { label: "HMR 已连接", color: "#059669" },
  updating: { label: "正在更新", color: "#176b5d" },
  error: { label: "编译错误", color: "#dc2626" },
  disconnected: { label: "连接断开", color: "#61716b" },
}

const REVISION_STORAGE_KEY = "enerlution-live-preview-revision"

function formatTime(value: Date) {
  return value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function StatusIcon({ status }: { status: LiveStatus }) {
  if (status === "updating") {
    return (
      <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
    )
  }
  if (status === "error") {
    return <TriangleAlert size={13} aria-hidden="true" />
  }
  if (status === "disconnected") {
    return <WifiOff size={13} aria-hidden="true" />
  }
  return <CircleCheck size={13} aria-hidden="true" />
}

function readStoredRevision() {
  const value = Number(window.sessionStorage.getItem(REVISION_STORAGE_KEY) ?? 0)
  return Number.isFinite(value) ? value : 0
}

function storeNextRevision() {
  const value = readStoredRevision() + 1
  window.sessionStorage.setItem(REVISION_STORAGE_KEY, String(value))
  return value
}

export default function LivePreview() {
  const [status, setStatus] = useState<LiveStatus>(
    import.meta.hot ? "ready" : "disconnected",
  )
  const [revision, setRevision] = useState(readStoredRevision)
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [errorMessage, setErrorMessage] = useState("")
  const settleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return

    const clearSettleTimer = () => {
      if (settleTimerRef.current === null) return
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
    const markReady = () => {
      clearSettleTimer()
      setStatus("ready")
      setUpdatedAt(new Date())
    }
    const handleBeforeUpdate = () => {
      setStatus("updating")
      setRevision(storeNextRevision())
      setErrorMessage("")
      clearSettleTimer()
      settleTimerRef.current = window.setTimeout(markReady, 900)
    }
    const handleAfterUpdate = () => markReady()
    const handleError = (event: HmrErrorEvent) => {
      clearSettleTimer()
      setStatus("error")
      setErrorMessage(event.err?.message ?? "请查看 Vite 错误提示")
    }
    const handleConnect = () => setStatus("ready")
    const handleDisconnect = () => setStatus("disconnected")

    hot.on("vite:beforeUpdate", handleBeforeUpdate)
    hot.on("vite:afterUpdate", handleAfterUpdate)
    hot.on("vite:error", handleError)
    hot.on("vite:ws:connect", handleConnect)
    hot.on("vite:ws:disconnect", handleDisconnect)

    return () => {
      hot.off("vite:beforeUpdate", handleBeforeUpdate)
      hot.off("vite:afterUpdate", handleAfterUpdate)
      hot.off("vite:error", handleError)
      hot.off("vite:ws:connect", handleConnect)
      hot.off("vite:ws:disconnect", handleDisconnect)
    }
  }, [])

  if (!import.meta.env.DEV) return null

  const copy = STATUS_COPY[status]

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 right-3 z-[1300] w-[218px] rounded-lg border bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm"
      style={{ borderColor: "#dbe3ec", color: "#24423b" }}
      data-live-preview
      data-live-preview-version="1"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${copy.color}15`, color: copy.color }}
          >
            <StatusIcon status={status} />
          </span>
          <span className="truncate text-[11px] font-semibold">实时热视图</span>
        </div>

        <button
          type="button"
          title="刷新预览"
          aria-label="刷新预览"
          onClick={() => window.location.reload()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span style={{ color: copy.color }}>{copy.label}</span>
        <span className="text-slate-400">更新 {revision} 次</span>
      </div>

      <div className="mt-1 truncate font-mono text-[9px] text-slate-400">
        {status === "error" && errorMessage
          ? errorMessage
          : `最近更新 ${formatTime(updatedAt)}`}
      </div>
    </div>
  )
}
