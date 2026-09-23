import { useEffect, useRef, useState } from "react"
import {
  Activity,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/Workspace"

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

interface Props {
  onSimulateDataChange?: () => void
}

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

export default function LivePreview({ onSimulateDataChange }: Props) {
  const [status, setStatus] = useState<LiveStatus>(
    import.meta.hot ? "ready" : "disconnected",
  )
  const [revision, setRevision] = useState(readStoredRevision)
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [errorMessage, setErrorMessage] = useState("")
  const [expanded, setExpanded] = useState(false)
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
      setExpanded(true)
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
      className="live-preview"
      data-live-preview
      data-live-status={status}
      data-expanded={expanded}
      data-live-preview-version="1"
    >
      <div className="live-preview-heading">
        {expanded && <strong>实时热视图</strong>}
        <Button
          iconOnly
          variant="ghost"
          title={`${copy.label} · ${expanded ? "收起" : "展开"}热视图状态`}
          aria-label={expanded ? "收起热视图状态" : "展开热视图状态"}
          aria-expanded={expanded}
          aria-controls="live-preview-details"
          onClick={() => setExpanded(!expanded)}
          style={{ color: copy.color }}
        >
          {expanded ? <X /> : <StatusIcon status={status} />}
        </Button>
      </div>
      <div id="live-preview-details" hidden={!expanded}>
        <div className="live-preview-status" role="status">
          <span style={{ color: copy.color }}>{copy.label}</span>
          <span>更新 {revision} 次</span>
        </div>
        <p className="live-preview-message">
          {status === "error" && errorMessage
            ? errorMessage
            : `最近更新 ${formatTime(updatedAt)}`}
        </p>
        <div className="live-preview-actions">
          {onSimulateDataChange && (
            <Button
              iconOnly
              variant="ghost"
              title="模拟数据变更"
              aria-label="模拟数据变更"
              onClick={onSimulateDataChange}
            >
              <Activity aria-hidden="true" />
            </Button>
          )}
          <Button
            iconOnly
            variant="ghost"
            title="刷新预览"
            aria-label="刷新预览"
            onClick={() => window.location.reload()}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
