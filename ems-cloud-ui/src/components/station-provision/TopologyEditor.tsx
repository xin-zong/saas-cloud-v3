import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { api, DEMO_MODE } from "@/api/client"
import { assignEms, type ProvisionModel } from "./deviceConfiguration"
import {
  createDevice,
  deviceLabels,
  type Device,
  type DeviceType,
  type ProvisionDraft,
} from "./model"
import {
  cabinetNodes,
  isStructure,
  removeNode,
  validateSiteTopology,
  splitCabinet,
  cloneNode,
  arrangeNodes,
  type TopologyIssue,
} from "./topologyModel"
import DeviceInspector from "./DeviceInspector"
import LegacyTopologyEditor from "./LegacyTopologyEditor"
import TopologyCanvas, { nodeIcon } from "./TopologyCanvas"
import {
  electricalPorts,
  communicationEdges,
  arrangeCommunication,
  communicationDraft,
  persistCanvasPatch,
  type CanvasMode,
  type Point,
} from "./topologyCanvasModel"
import "./topology-editor.css"
import "./topology-studio.css"
import "./topology-editor-polish.css"
export function NodeIcon({ type }: { type: DeviceType }) {
  return <img className="provision-node-icon" src={nodeIcon(type)} alt="" />
}
type Props = {
  draft: ProvisionDraft
  change: (patch: Partial<ProvisionDraft>) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  onClear: () => void
  onExport: () => void
  validationTrigger?: number
  readOnly?: boolean
  exportPanel?: ReactNode
  onDismissExport?: () => void
}
const groups: { label: string; types: DeviceType[] }[] = [
  {
    label: "储能与控制",
    types: ["标准柜", "PCS", "电池 / BMS", "光伏 DC/DC", "EMS", "温控设备"],
  },
  {
    label: "电气结构",
    types: ["电网", "交流母线", "直流母线", "ATS"],
  },
  { label: "计量与发电", types: ["电表", "光伏侧电表", "光伏", "柴油发电机"] },
  {
    label: "用电设备",
    types: ["AC充电桩", "DC充电桩", "可控负载", "不可控负载"],
  },
]
export default function TopologyEditor(props: Props) {
  const {
    draft,
    change,
    undo,
    redo,
    canUndo,
    canRedo,
    onClear,
    onExport,
    validationTrigger = 0,
    readOnly = false,
  } = props
  const [mode, setMode] = useState<CanvasMode>("electrical"),
    [tab, setTab] = useState<"library" | "list">("library"),
    [selected, setSelected] = useState(
      draft.devices.find((n) => n.type === "标准柜")?.id ??
        draft.devices[0]?.id ??
        "",
    ),
    [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState(false),
    [checked, setChecked] = useState(false),
    [legacy, setLegacy] = useState(false),
    [message, setMessage] = useState(""),
    [zoom, setZoom] = useState(1),
    [fitRevision, setFitRevision] = useState(0),
    [focusRevision, setFocusRevision] = useState(0),
    [models, setModels] = useState<ProvisionModel[]>([]),
    [catalogError, setCatalogError] = useState(""),
    [catalogLoading, setCatalogLoading] = useState(false),
    [catalogRevision, setCatalogRevision] = useState(0)
  const fullButton = useRef<HTMLButtonElement>(null),
    lastActive = useRef<HTMLElement | null>(null)
  const projected = communicationDraft(draft)
  const device = projected.devices.find((d) => d.id === selected),
    container =
      device?.type === "标准柜"
        ? device
        : draft.devices.find((n) => n.id === device?.cabinetId),
    issues = checked ? validateSiteTopology(draft) : []
  const query=search.trim().toLowerCase()
  const libraryGroups=groups.map(g=>({...g,types:g.types.filter(t=>`${deviceLabels[t]} ${t}`.toLowerCase().includes(query))})).filter(g=>g.types.length)
  const listedDevices=projected.devices.filter(n=>`${n.name} ${n.code}`.toLowerCase().includes(query))
  const issueGroups=new Map<string,TopologyIssue[]>()
  for(const issue of issues) issueGroups.set(issue.nodeId,[...(issueGroups.get(issue.nodeId)??[]),issue])

  useEffect(() => {
    if (DEMO_MODE) {
      setCatalogError("演示环境未连接型号目录")
      return
    }
    const controller = new AbortController()
    setCatalogLoading(true)
    setCatalogError("")
    api<ProvisionModel[]>("/provision-models", { signal: controller.signal })
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("型号目录响应无效")
        if (!controller.signal.aborted) setModels(rows)
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setCatalogError(
            error instanceof Error ? error.message : "无法读取型号目录",
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false)
      })
    return () => controller.abort()
  }, [catalogRevision])
  useEffect(() => {
    if (selected && !projected.devices.some((n) => n.id === selected))
      setSelected("")
  }, [draft.devices, selected])
  useEffect(() => {
    if (validationTrigger) setChecked(true)
  }, [validationTrigger])
  useEffect(() => {
    if (!expanded) return
    lastActive.current = (document.activeElement as HTMLElement)
    const before = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const timer = setTimeout(
      () =>
        document
          .querySelector<HTMLButtonElement>(
            '.topology-studio-fullscreen [aria-label="退出全屏"]',
          )
          ?.focus(),
      0,
    )
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = before
      fullButton.current?.focus()
    }
  }, [expanded])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if(e.defaultPrevented) return
      if (e.key === "Escape") {
        setExpanded(false)
        return
      }
      const input = (e.target as HTMLElement)?.closest(
        'input,textarea,select,[contenteditable="true"]',
      )
      if (!input && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault()
        if(!readOnly) redo()
      }
      if (!input && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (!readOnly) (e.shiftKey ? redo : undo)()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [undo, redo, readOnly])
  const patch = (id: string, values: Partial<Device>) => {
    if (!readOnly)
      change(
        persistCanvasPatch(draft, {
          devices: projected.devices.map((d) =>
            d.id === id ? { ...d, ...values } : d,
          ),
        }),
      )
  }
  function add(type: DeviceType, p?: Point) {
    if (readOnly) return
    props.onDismissExport?.()
    let number = draft.devices.filter((d) => d.type === type).length + 1
    while (
      draft.devices.some((d) => d.code === createDevice(type, number).code)
    )
      number++
    if (type === "标准柜") {
      const group = cabinetNodes(
        number,
        true,
        draft.devices.find((n) => n.type === "EMS")?.id ?? "",
      )
      group.cabinet.x = p?.x ?? 48
      group.cabinet.y = p?.y ?? 53
      change({
        devices: [...draft.devices, ...group.devices],
        connections: [...(draft.connections ?? []), ...group.connections],
      })
      setSelected(group.cabinet.id)
    } else {
      const d = createDevice(type, number)
      d.enabled = true
      if (type === "光伏 DC/DC") d.dcPvConfigured = true
      d.access = type === "光伏 DC/DC" ? "EMU" : "EMS"
      d.emsId = draft.devices.find((n) => n.type === "EMS")?.id ?? ""
      Object.assign(
        d,
        mode === "communication"
          ? { commX: p?.x ?? 45, commY: p?.y ?? 45 }
          : {
              x: p?.x ?? 40 + (draft.devices.length % 3) * 15,
              y: p?.y ?? 25 + (draft.devices.length % 3) * 20,
            },
      )
      change({ devices: [...draft.devices, d] })
      setSelected(d.id)
    }
    setChecked(false)
  }
  function connectionPort(e:NonNullable<ProvisionDraft['connections']>[number],side:'from'|'to') {
    const endpoint=draft.devices.find(n=>n.id===e[side]),key=side==='from'?'fromPort':'toPort'
    if(!endpoint)return null
    return <label className="topo-connection-port">{side==='from'?'起点':'终点'} · {endpoint.code}<select disabled={readOnly} data-device-field={endpoint.id+':'+key} aria-label={'连接 '+e.id+' '+(side==='from'?'起点':'终点')+'端口'} value={e[key]??''} onChange={event=>change({connections:draft.connections?.map(n=>n.id===e.id?{...n,[key]:event.target.value}:n)})}><option value="">请选择明确端口</option>{electricalPorts(endpoint).filter(p=>p.kind===e.kind).map(p=><option key={p.id} value={p.id}>{p.id} · {p.label}</option>)}</select></label>
  }
  function locate(id: string) {
    props.onDismissExport?.()
    setSelected(id)
    setFocusRevision((n) => n + 1)
  }
  function locateIssue(issue: TopologyIssue) {
    setChecked(false)
    if (issue.view)
      setMode(issue.view === "communication" ? "communication" : "electrical")
    locate(issue.targetNodeId ?? issue.nodeId)
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-device-field="${issue.targetNodeId ?? issue.nodeId}:${issue.field}"]`,
        )
        ?.focus(),
    )
  }
  if (legacy)
    return (
      <div>
        <button
          className="station-text-button"
          onClick={() => setLegacy(false)}
        >
          返回统一拓扑画布
        </button>
        <LegacyTopologyEditor {...props} />
      </div>
    )
  const action = (
    label: string,
    asset: string,
    fn: () => void,
    disabled = false,
  ) => (
    <button
      key={label}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={fn}
    >
      <img
        src={`/figma/topology-current/figmaElectrical-${asset}.svg`}
        alt=""
      />
    </button>
  )
  const content = (
    <div
      className={`topology-studio ${
        expanded ? "topology-studio-fullscreen" : ""
      }`}
      data-design-node={expanded ? "3643:19518" : mode === "communication" ? "3689:103565" : "3689:97748"}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "拓扑全屏编辑" : undefined}
      onKeyDown={(e) => {
        if (!expanded || e.key !== "Tab") return
        const elements = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,[tabindex="0"]',
          ),
        ).filter((el) => el.offsetParent !== null)
        const first = elements[0],
          last = elements[elements.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }}
    >
      {expanded && (
        <header className="topo-full-header">
          <strong>拓扑与设备</strong>
          <span>{draft.name || "新建站点"}</span>
          <button aria-label="退出全屏" onClick={() => setExpanded(false)}>
            退出全屏　×
          </button>
        </header>
      )}
      <aside className="topo-library">
        <nav aria-label="拓扑节点目录">
          <button
            aria-pressed={tab === "library"}
            onClick={() => setTab("library")}
          >
            {mode === "communication" ? "通信节点" : "节点库"}
          </button>
          <button aria-pressed={tab === "list"} onClick={() => setTab("list")}>
            设备列表
          </button>
        </nav>
        <input
          type="search"
          aria-label="搜索设备或结构"
          placeholder={mode === "communication" ? "搜索通信节点" : "搜索节点名称"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {mode === "communication" && tab === "library" ? (
          <div className="topo-device-list topo-communication-list">
            <button className="topo-comm-add" disabled={readOnly} aria-label="新增 EMS" onClick={()=>add("EMS")}><NodeIcon type="EMS"/><span>新增 EMS</span><b>＋</b></button>
            {listedDevices.filter(n=>n.type!=="标准柜"&&!isStructure(n)).map(n=><button key={n.id} aria-pressed={selected===n.id} onClick={()=>{setChecked(false);locate(n.id)}}><NodeIcon type={n.type}/><span>{n.code}<small>{n.name}</small></span></button>)}
            {!listedDevices.some(n=>n.type!=="标准柜"&&!isStructure(n))&&<p className="topo-library-empty" role="status">{query ? "未找到匹配设备" : "暂无通信设备，请先添加 EMS 和设备"}</p>}
          </div>
        ) : tab === "library" ? (
          <>{!libraryGroups.length && <p className="topo-library-empty" role="status">未找到匹配节点</p>}{libraryGroups.map((g) => (
            <section key={g.label}>
              <h3>{g.label}</h3>
              <div>
                {g.types

                  .map((t) => (
                    <button
                      key={t}
                      draggable={!readOnly}
                      disabled={readOnly}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/enerlution-node", t)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      onClick={() => add(t)}
                      title={`拖入画布或点击添加${deviceLabels[t]}`}
                    >
                      <NodeIcon type={t} />
                      <span>
                        {({PCS:"PCS", "电池 / BMS":"电池系统", "光伏 DC/DC":"DC/DC", "电表":"电网侧电表"} as Partial<Record<DeviceType,string>>)[t] ?? deviceLabels[t]}
                      </span>
                      <b>＋</b>
                    </button>
                  ))}
              </div>
            </section>
          ))}</>
        ) : (
          <div className="topo-device-list">
            {listedDevices.map((n) => (
                <button
                  key={n.id}
                  aria-pressed={selected === n.id}
                  onClick={() => { if(mode==="communication"&&(n.type==="标准柜"||isStructure(n)))setMode("electrical");else if(mode==="electrical"&&n.type==="EMS")setMode("communication");locate(n.id) }}
                >
                  <NodeIcon type={n.type} />
                  <span>
                    {n.code}
                    <small>{n.name}</small>
                  </span>
                  <span>⌖</span>
                </button>
              ))}
            {!listedDevices.length && <p className="topo-library-empty" role="status">{draft.devices.length ? "未找到匹配设备" : "暂无设备，从节点库添加"}</p>}
          </div>
        )}
      </aside>
      <section className="topo-workspace">
        <header className="topo-toolbar">
          <nav aria-label="拓扑视图">
            <button
              aria-pressed={mode === "electrical" && !checked}
              onClick={() => {
                props.onDismissExport?.()
                setMode("electrical")
                setChecked(false)
              }}
            >
              电气拓扑
            </button>
            <button
              aria-pressed={mode === "communication" && !checked}
              onClick={() => {
                props.onDismissExport?.()
                setMode("communication")
                setChecked(false)
              }}
            >
              通信拓扑
            </button>
            <button
              aria-pressed={checked}
              onClick={() => {
                props.onDismissExport?.()
                setChecked(true)
              }}
            >
              校验{checked && issues.length ? ` ${issues.length}` : ""}
            </button>
          </nav>
          <div className="topo-actions" role="toolbar" aria-label="画布操作">
            {action("撤销", "imgIcon", undo, !canUndo || readOnly)}
            {action("重做", "imgIcon1", redo, !canRedo || readOnly)}
            {action(
              "整理布局",
              "imgIcon2",
              () => {
                change(
                  mode === "electrical"
                    ? arrangeNodes(draft)
                    : arrangeCommunication(draft),
                )
                setFitRevision((n) => n + 1)
              },
              readOnly,
            )}
            {action("缩小画布", "imgIcon3", () =>
              setZoom(Math.max(0.25, zoom - 0.1)),
            )}
            <button
              aria-label="重置缩放"
              title="重置为 100%"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            {action("放大画布", "imgIcon4", () =>
              setZoom(Math.min(2.5, zoom + 0.1)),
            )}
            {action("适应画布", "imgIcon5", () => setFitRevision((n) => n + 1))}
            <button
              ref={fullButton}
              title={expanded ? "退出全屏" : "展开画布"}
              aria-label={expanded ? "收起画布" : "展开画布"}
              onClick={() => setExpanded((v) => !v)}
            >
              <img
                src="/figma/topology-current/figmaElectrical-imgIcon6.svg"
                alt=""
              />
            </button>
          </div>
        </header>
        <TopologyCanvas
          draft={draft}
          mode={mode}
          selected={selected}
          select={(id) => {
            props.onDismissExport?.()
            setSelected(id)
          }}
          change={change}
          add={add}
          focusRevision={focusRevision}
          status={setMessage}
          zoom={zoom}
          setZoom={setZoom}
          fitRevision={fitRevision}
          readOnly={readOnly}
        />
        <footer className="topo-footer">
          <small role="status">
            {message || "拖入节点 · 拖动设备或端口 · 滚轮缩放 · 空白处平移"}
          </small>
          <button onClick={onExport}>生成 XML</button>
          <button
            disabled={readOnly || !draft.devices.length}
            onClick={onClear}
          >
            清空
          </button>
        </footer>
      </section>
      <aside className="topo-inspector">
        {props.exportPanel ?? (
          <>
            <header>
              <h3>{checked ? "配置校验" : device?.name || "节点配置"}</h3>
              {!checked && device && <small>{device.code}</small>}
            </header>
            {checked ? (
              <>
                <div
                  className={`topo-validation-summary ${
                    issues.length ? "pending" : ""
                  }`}
                >
                  <strong>
                    {issues.length
                      ? `${issues.length} 项待完善`
                      : "本地拓扑校验通过"}
                  </strong>
                  <p>校验电气结构与通信配置，修正后可重新校验。</p>
                  <button onClick={() => setChecked(true)}>重新校验</button>
                </div>
                {[...issueGroups].map(([nodeId,group])=>{
                  const code=projected.devices.find(n=>n.id===nodeId)?.code||"全站"
                  return <section className="topo-issue-group" key={nodeId}>
                    <h4>{code}<small>{group.length} 项</small></h4>
                    {group.map((issue,i)=><div className="topo-issue" key={`${issue.field}:${i}`}>
                      <p>{issue.message.startsWith(`${code} · `)?issue.message.slice(code.length+3):issue.message}</p>
                      <button onClick={()=>locateIssue(issue)}>定位设备与字段 →</button>
                    </div>)}
                  </section>
                })}
              </>
            ) : (
              <>
                {catalogLoading && <p role="status">正在读取型号目录…</p>}
                {catalogError && (
                  <div className="topo-catalog-error">
                    <p>{catalogError}</p>
                    <button onClick={() => setCatalogRevision((n) => n + 1)}>
                      重试型号目录
                    </button>
                  </div>
                )}
                {device ? (
                  <>
                    <fieldset
                      disabled={readOnly}
                      className="topo-inspector-fields"
                    >
                      {device.type === "标准柜" && container ? (
                        <>
                          <label>
                            机柜编号
                            <input
                              aria-label="机柜编号"
                              value={container.nodeId ?? container.id}
                              readOnly
                            />
                          </label>
                          <label>柜号<input aria-label="柜号" data-device-field={container.id+':cabinetNumber'} value={container.cabinetNumber??''} onChange={e=>patch(container.id,{cabinetNumber:e.target.value})}/></label>
                          <label>
                            机柜名称
                            <input
                              aria-label="机柜名称"
                              value={container.name}
                              onChange={(e) =>
                                patch(container.id, { name: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            所属 EMS
                            <select
                              aria-label="机柜所属 EMS"
                              value={container.emsId ?? ""}
                              onChange={(e) =>
                                change(
                                  assignEms(
                                    draft,
                                    container.id,
                                    e.target.value,
                                  ),
                                )
                              }
                            >
                              <option value="">请选择 EMS</option>
                              {draft.devices
                                .filter((n) => n.type === "EMS")
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.code}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <h3>柜内成员</h3>
                          {draft.devices
                            .filter((n) => n.cabinetId === container.id)
                            .map((n) => (
                              <button
                                key={n.id}
                                className="topo-member"
                                onClick={() => { if(mode==="communication"&&(n.type==="标准柜"||isStructure(n)))setMode("electrical");else if(mode==="electrical"&&n.type==="EMS")setMode("communication");locate(n.id) }}
                              >
                                <NodeIcon type={n.type} />
                                <span>
                                  {n.code} · {n.name}
                                </span>
                                →
                              </button>
                            ))}
                          <label>
                            加入独立设备
                            <select
                              aria-label="加入机柜成员"
                              value=""
                              onChange={(e) => {
                                if (e.target.value)
                                  patch(e.target.value, {
                                    cabinetId: container.id,
                                    emsId: container.emsId,
                                  })
                              }}
                            >
                              <option value="">请选择可加入的设备</option>
                              {draft.devices
                                .filter(
                                  (n) =>
                                    !n.cabinetId &&
                                    [
                                      "PCS",
                                      "电池 / BMS",
                                      "光伏 DC/DC",
                                    ].includes(n.type),
                                )
                                .map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.code}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <DeviceInspector
                          device={device}
                          draft={projected}
                          patch={patch}
                          change={(values) =>
                            change(persistCanvasPatch(draft, values))
                          }
                          models={models}
                          mode={mode}
                        />
                      )}
                    </fieldset>
                    {!device.id.includes(":") && (
                      <div className="topo-node-actions">
                        {container && (
                          <button
                            disabled={readOnly}
                            onClick={() => {
                              change(splitCabinet(draft, container.id))
                              setSelected(
                                draft.devices.find(
                                  (n) => n.cabinetId === container.id,
                                )?.id ?? "",
                              )
                            }}
                          >
                            拆分标准柜
                          </button>
                        )}
                        {device.cabinetId && (
                          <button
                            disabled={readOnly}
                            onClick={() =>
                              patch(device.id, { cabinetId: undefined })
                            }
                          >
                            移出机柜
                          </button>
                        )}
                        <button
                          disabled={readOnly}
                          onClick={() => {
                            const { selectedId, ...values } = cloneNode(
                              draft,
                              device.id,
                            )
                            change(values)
                            setSelected(selectedId)
                          }}
                        >
                          复制节点
                        </button>
                        <button
                          disabled={readOnly}
                          onClick={() => {
                            change(removeNode(draft, device.id))
                            setSelected("")
                          }}
                        >
                          删除节点
                        </button>
                      </div>
                    )}
                    <details className="topo-connections" open tabIndex={-1} data-device-field={device.id+':connections'}>
                      <summary>
                        {mode === "electrical" ? "电气连接" : "通信连接"}
                      </summary>
                      {mode === "electrical"
                        ? (draft.connections ?? [])
                            .filter(
                              (e) => e.from === device.id || e.to === device.id,
                            )
                            .map((e) => (
                              <div key={e.id} className="topo-electrical-connection">
                                <span>
                                  {e.kind} ·{" "}
                                  {
                                    draft.devices.find(
                                      (n) =>
                                        n.id ===
                                        (e.from === device.id ? e.to : e.from),
                                    )?.code
                                  }
                                </span>
                                {connectionPort(e,'from')}{connectionPort(e,'to')}
                                <button
                                  disabled={readOnly}
                                  aria-label="删除连接"
                                  onClick={() =>
                                    change({
                                      connections: draft.connections?.filter(
                                        (n) => n.id !== e.id,
                                      ),
                                    })
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))
                        : communicationEdges(projected)
                            .filter(
                              (e) =>
                                e.from.node === device.id ||
                                e.to.node === device.id,
                            )
                            .map((e) => (
                              <div key={e.id}>
                                <span>
                                  {e.from.port} →{" "}
                                  {
                                    draft.devices.find(
                                      (n) => n.id === e.to.node,
                                    )?.code
                                  }
                                  {e.legacy ? "（旧草稿）" : ""}
                                </span>
                                {!e.legacy && (
                                  <button
                                    disabled={readOnly}
                                    aria-label="删除通信连接"
                                    onClick={() =>
                                      patch(e.to.node, {
                                        access: "不接入",
                                        emsId: undefined,
                                        emuId: undefined,
                                        forwardDeviceId: undefined,
                                      })
                                    }
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                    </details>
                  </>
                ) : (
                  <div className="topo-empty-inspector">
                    <h2>选择节点开始配置</h2>
                    <p>从左侧拖入节点，或选择画布中的设备。</p>
                    <button disabled={readOnly} onClick={() => add("标准柜")}>
                      添加标准柜
                    </button>
                  </div>
                )}
              </>
            )}
            {draft.devices.some((n) =>
              n.ports?.some((p) => p.targets?.length),
            ) && (
              <button
                className="station-text-button"
                disabled={readOnly}
                onClick={() => setLegacy(true)}
              >
                编辑旧草稿通信端口
              </button>
            )}
          </>
        )}
      </aside>
    </div>
  )
  return expanded ? createPortal(content, document.body) : content
}
