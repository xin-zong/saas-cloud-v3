import { useEffect, useMemo, useRef, useState } from "react"
import { MessageCircle, LoaderCircle, X } from "lucide-react"
import type { Station } from "@/App"
import type { AuthUser } from "@/auth/roles"
import { getPreferences } from "@/preferences/store"
import { acceptAgentMessage, agentContext } from "@/ems-agent/protocol"
import "./ems-agent-host.css"

export default function EmsAgentHost({
  user,
  stations,
  activeNav,
  stationId,
}: {
  user: AuthUser
  stations: Station[]
  activeNav: string
  stationId: string | null
}) {
  const [open, setOpen] = useState(false),
    [ready, setReady] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null),
    trigger = useRef<HTMLButtonElement>(null)
  const channel = useMemo(
    () =>
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
    [user.id, user.tenant?.tenantId],
  )
  const context = useMemo(
    () =>
      agentContext(
        user,
        stations,
        activeNav,
        stationId,
        getPreferences().language === "English" ? "en" : "zh-CN",
      ),
    [user, stations, activeNav, stationId],
  )
  const current = useRef(context)
  current.current = context
  function close() {
    setOpen(false)
    setReady(false)
    trigger.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    const receive = (event: MessageEvent) => {
      if (
        !acceptAgentMessage(event, {
          origin: location.origin,
          source: frame.current?.contentWindow ?? null,
          channel,
        })
      )
        return
      if (event.data.type === "ems-agent:close") {
        setOpen(false)
        setReady(false)
        trigger.current?.focus()
        return
      }
      frame.current?.contentWindow?.postMessage(
        { type: "ems-agent:init", channel, context: current.current },
        location.origin,
      )
      setReady(true)
    }
    window.addEventListener("message", receive)
    return () => window.removeEventListener("message", receive)
  }, [open, channel])
  useEffect(() => {
    if (open && ready)
      frame.current?.contentWindow?.postMessage(
        { type: "ems-agent:init", channel, context },
        location.origin,
      )
  }, [context, open, ready, channel])
  if (!context.sites.length) return null
  return (
    <div className="ems-agent-host">
      {!open && (
        <button
          ref={trigger}
          type="button"
          className="ems-agent-rail"
          aria-label="打开 EMS3.0 Agent 小助手"
          onClick={() => setOpen(true)}
        >
          <MessageCircle size={18} />
          <span>EMS3.0 Agent</span>
        </button>
      )}
      {open && (
        <div
          className="ems-agent-surface"
          role="dialog"
          aria-modal="true"
          aria-label="EMS3.0 Agent 小助手"
        >
          {!ready && (
            <div className="ems-agent-loading">
              <LoaderCircle className="auth-spin" size={20} />
              <span>正在加载 EMSAgent…</span>
              <button type="button" onClick={close} aria-label="关闭 EMSAgent">
                <X size={18} />
              </button>
            </div>
          )}
          <iframe
            ref={frame}
            title="一期 EMSAgent 完整助手"
            src={`/ems-agent.html?channel=${channel}`}
            sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-modals"
          />
        </div>
      )}
    </div>
  )
}
