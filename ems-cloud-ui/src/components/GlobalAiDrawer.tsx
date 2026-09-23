import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bot,
  ChevronRight,
  PanelRightClose,
  Send,
  Sparkles,
  X,
} from "lucide-react"
import type { Station } from "@/App"
import type { UserRole } from "@/auth/roles"
import { Badge, Button, Select } from "./ui/Workspace"
import "./global-ai-drawer.css"

type Message = {
  role: "user" | "assistant"
  text: string
}

const QUICK_PROMPTS: Record<"owner" | "operator", string[]> = {
  owner: [
    "今日负荷与收益如何？",
    "当前告警最多的站点？",
    "分析储能充放电效率",
    "给出资产安全建议",
  ],
  operator: [
    "当前告警最多的站点？",
    "列出优先处置风险",
    "分析储能充放电效率",
    "给出设备安全建议",
  ],
}

function formatPower(value: number) {
  return `${Math.round(value).toLocaleString("zh-CN")} kW`
}

function parseCurrency(value: string) {
  if (!value || value.trim() === "—") return 0
  const parsed = Number(value.replace(/[^\d.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function buildAssistantAnswer(
  text: string,
  selectedStation: Station,
  stations: Station[],
  activeNav: string,
  role: "owner" | "operator",
) {
  const totalPower = stations.reduce(
    (sum, station) => sum + station.activePower,
    0,
  )
  const alarmCount = stations.reduce(
    (sum, station) => sum + station.alerts.length,
    0,
  )
  const avgSoc = stations.length
    ? stations.reduce((sum, station) => sum + station.soc, 0) / stations.length
    : 0
  const topAlarmStation = [...stations].sort(
    (a, b) => b.alerts.length - a.alerts.length,
  )[0]
  const revenueValue = parseCurrency(selectedStation.revenue)

  if (role === "owner" && text.includes("收益")) {
    return `${selectedStation.name} 当前有功功率 ${formatPower(
      selectedStation.activePower,
    )}，累计收益快照为 ${
      revenueValue ? `¥${revenueValue.toLocaleString("zh-CN")}` : "暂无"
    }。收益判断仍需结合所选时段的电价、计量和结算记录，当前回答不会替代正式核算。`
  }

  if (text.includes("告警")) {
    return `当前在运站点快照共有 ${alarmCount} 条告警。${
      topAlarmStation?.alerts.length
        ? `${topAlarmStation.name} 告警最多，共 ${topAlarmStation.alerts.length} 条。`
        : "当前无站点告警。"
    }建议按告警级别、发生时间和处理状态继续复核。`
  }

  if (text.includes("效率")) {
    return `当前站点平均 SOC 为 ${avgSoc.toFixed(1)}%，合计有功功率 ${formatPower(
      totalPower,
    )}。充放电效率需要同一时间范围内的充电量、放电量和损耗数据，不能仅由功率与 SOC 快照推断。`
  }

  if (text.includes("安全") || text.includes("风险")) {
    return `${selectedStation.name} 当前有 ${selectedStation.alerts.length} 条告警、${selectedStation.devices.fault} 台故障设备。建议先核对通信状态、故障设备和 SOC 边界，再决定是否调整运行策略。`
  }

  return `当前位于「${activeNav}」页面，已选站点为 ${selectedStation.name}。该站点有功功率 ${formatPower(
    selectedStation.activePower,
  )}，SOC ${selectedStation.soc.toFixed(1)}%，当前告警 ${
    selectedStation.alerts.length
  } 条。此处为本地规则分析，不会下发策略或创建工单。`
}

export default function GlobalAiDrawer({
  stations,
  activeNav,
  role,
}: {
  stations: Station[]
  activeNav: string
  role: UserRole
}) {
  const supportedRole = role === "owner" ? "owner" : "operator"
  const quickPrompts = QUICK_PROMPTS[supportedRole]
  const availableStations = useMemo(
    () => stations.filter((station) => station.status !== "building"),
    [stations],
  )
  const [open, setOpen] = useState(false)
  const [selectedStationId, setSelectedStationId] = useState(
    availableStations[0]?.id ?? "",
  )
  const [prompt, setPrompt] = useState("")
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text:
        supportedRole === "owner"
          ? "选择站点后可以询问负荷、收益、告警、效率和资产安全。当前为本地规则预览，不连接外部 AI 服务。"
          : "选择站点后可以询问告警、设备异常、效率和处置优先级。当前为本地规则预览，不连接外部 AI 服务。",
    },
  ])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)

  const selectedStation =
    availableStations.find((station) => station.id === selectedStationId) ??
    availableStations[0]

  useEffect(() => {
    if (
      availableStations.length &&
      !availableStations.some((station) => station.id === selectedStationId)
    ) {
      setSelectedStationId(availableStations[0].id)
    }
  }, [availableStations, selectedStationId])

  useEffect(() => {
    if (!open) return
    promptRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    })
  }, [messages, open])

  const ask = useCallback(
    (question = prompt) => {
      const text = question.trim()
      if (!text || !selectedStation) return
      const answer = buildAssistantAnswer(
        text,
        selectedStation,
        availableStations,
        activeNav,
        supportedRole,
      )
      setMessages((current) => [
        ...current,
        { role: "user", text },
        { role: "assistant", text: answer },
      ])
      setPrompt("")
      setOpen(true)
    },
    [activeNav, availableStations, prompt, selectedStation, supportedRole],
  )

  return (
    <div
      className="global-ai-shell"
      data-open={open}
      data-active-nav={activeNav}
    >
      <button
        ref={triggerRef}
        type="button"
        className="global-ai-trigger"
        aria-label={open ? "收起AI助手" : "展开AI助手"}
        aria-expanded={open}
        aria-controls="global-ai-drawer"
        title={open ? "收起AI助手" : "展开AI助手"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <PanelRightClose size={18} aria-hidden="true" />
        ) : (
          <Bot size={18} aria-hidden="true" />
        )}
        <span>AI助手</span>
      </button>

      <aside
        id="global-ai-drawer"
        className="global-ai-drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby="global-ai-title"
        hidden={!open}
      >
        <header className="global-ai-drawer__header">
          <div>
            <div className="global-ai-drawer__label">
              <Sparkles size={13} aria-hidden="true" />
              全局悬挂工具
            </div>
            <h2 id="global-ai-title">Enerlution AI 助手</h2>
          </div>
          <Button
            variant="ghost"
            iconOnly
            aria-label="关闭AI助手"
            title="关闭AI助手"
            onClick={() => {
              setOpen(false)
              triggerRef.current?.focus()
            }}
          >
            <X size={16} />
          </Button>
        </header>

        <div className="global-ai-drawer__scope">
          <label>
            分析站点
            <Select
              aria-label="AI分析站点"
              value={selectedStation?.id ?? ""}
              disabled={!availableStations.length}
              onChange={(event) => setSelectedStationId(event.target.value)}
            >
              {!availableStations.length && <option value="">暂无站点</option>}
              {availableStations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          </label>
          <Badge>本地规则预览</Badge>
        </div>

        <div
          ref={conversationRef}
          className="global-ai-conversation"
          role="log"
          aria-label="AI分析对话"
          aria-live="polite"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`global-ai-message global-ai-message--${message.role}`}
            >
              <span>{message.role === "assistant" ? "规则分析" : "你"}</span>
              <p>{message.text}</p>
            </div>
          ))}
        </div>

        <div className="global-ai-quick" aria-label="常用AI问题">
          {quickPrompts.map((question) => (
            <button
              key={question}
              type="button"
              disabled={!selectedStation}
              onClick={() => ask(question)}
            >
              {question}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </div>

        <footer className="global-ai-composer">
          <label className="ui-muted" htmlFor="global-ai-question">
            分析问题
          </label>
          <textarea
            ref={promptRef}
            id="global-ai-question"
            aria-label="输入自然语言分析问题"
            placeholder="输入分析问题"
            maxLength={2000}
            value={prompt}
            disabled={!selectedStation}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault()
                ask()
              }
            }}
          />
          <div>
            <span className="ui-muted">不会下发策略或创建工单</span>
            <Button
              variant="primary"
              iconOnly
              aria-label="发送问题"
              title="发送问题"
              onClick={() => ask()}
              disabled={!prompt.trim() || !selectedStation}
            >
              <Send size={16} />
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
