import { useState } from "react"

import { Button } from "../ui/Workspace"

import { Field } from "./Common"

import {
  createDevice,
  newNodeId,
  deviceLabels,
  deviceTypes,
  type Device,
  type DeviceType,
  type ProvisionDraft,
  type CommunicationPort,
} from "./model"

import "./topology-editor.css"

const icons: Record<DeviceType, string> = {
  电网: "grid",

  光伏: "pv",

  "光伏 DC/DC": "pv",

  PCS: "pcs",

  "电池 / BMS": "battery",

  负载: "load",

  电表: "meter",

  变压器: "transformer",

  交流母线: "bus",

  断路器: "breaker",

  EMS: "ems",
}

export function NodeIcon({ type }: { type: DeviceType }) {
  return (
    <img
      className="provision-node-icon"
      src={`/figma/provision-v2/${icons[type]}.svg`}
      alt=""
    />
  )
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
}

export default function TopologyEditor({
  draft,

  change,

  undo,

  redo,

  canUndo,

  canRedo,

  onClear,

  onExport,
}: Props) {
  const [library, setLibrary] = useState(true),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("")

  const [view, setView] = useState<"electrical" | "communication">(
      "electrical",
    ),
    [selected, setSelected] = useState("")

  const [connect, setConnect] = useState(false),
    [source, setSource] = useState(""),
    [kind, setKind] = useState<"AC" | "DC">("AC")

  const [zoom, setZoom] = useState(1),
    [expanded, setExpanded] = useState(false),
    [message, setMessage] = useState("")

  const device = draft.devices.find((d) => d.id === selected)

  const ports = draft.devices.flatMap((d) =>
    (d.ports ?? []).map((p) => ({
      device: d,

      port: p,

      value: `${d.id}/${p.id}`,
    })),
  )

  const patch = (v: Partial<Device>) =>
    change({
      devices: draft.devices.map((d) =>
        d.id === selected ? { ...d, ...v } : d,
      ),
    })

  const updatePort = (index: number, v: Partial<CommunicationPort>) =>
    patch({
      ports: device?.ports?.map((p, i) => (i === index ? { ...p, ...v } : p)),
    })

  function add(type: DeviceType) {
    const d = createDevice(
      type,

      draft.devices.filter((d) => d.type === type).length + 1,
    )

    d.x = 20 + (draft.devices.length % 4) * 20

    d.y = 20 + (Math.floor(draft.devices.length / 4) % 4) * 20

    change({
      devices: [...draft.devices, d],

      connections: draft.connections ?? [],
    })

    setSelected(d.id)
  }

  function remove() {
    if (!device) return

    change({
      devices: draft.devices

        .filter((d) => d.id !== device.id)

        .map((d) => ({
          ...d,

          gridId: d.gridId === device.id ? "" : d.gridId,

          ports: d.ports?.map((p) => ({
            ...p,

            targets: p.targets.filter((t) => !t.startsWith(device.id + "/")),
          })),
        })),

      connections: draft.connections?.filter(
        (e) => e.from !== device.id && e.to !== device.id,
      ),
    })

    setSelected("")

    setSource("")
  }

  function pick(d: Device) {
    setSelected(d.id)

    if (!connect || view !== "electrical") return

    if (!source) {
      setSource(d.id)

      setMessage("请选择连接的目标节点")

      return
    }

    if (source === d.id) {
      setSource("")

      return
    }

    if (
      draft.connections?.some(
        (e) =>
          (e.from === source && e.to === d.id) ||
          (e.to === source && e.from === d.id),
      )
    ) {
      setMessage("这两个节点已连接")

      return
    }

    change({
      connections: [
        ...(draft.connections ?? []),

        { id: newNodeId(), from: source, to: d.id, kind },
      ],
    })

    setSource("")

    setMessage("电气连接已加入草稿")
  }

  const position = (d: Device, index: number) => {
    if (view === 'communication') {
      if (d.type === 'EMS') return {x:d.commX??50,y:d.commY??13}
      const row=draft.devices.filter(n=>d.type==='电池 / BMS'?n.type==='电池 / BMS':!['电网','变压器','交流母线','断路器','负载','EMS','电池 / BMS'].includes(n.type))
      return {x:d.commX??(15+row.findIndex(n=>n.id===d.id)*70/Math.max(1,row.length-1)),y:d.commY??(d.type==='电池 / BMS'?82:48)}
    }
    return {x:d.x??20+(index%4)*20,y:d.y??20+Math.floor(index/4)*22}
  }

  const nodes =
    view === "communication"
      ? draft.devices.filter(
          (d) =>
            !["电网", "变压器", "交流母线", "断路器", "负载"].includes(d.type),
        )
      : draft.devices.filter((d) => d.type !== "EMS")

  const point = (id: string) => {
    const i = nodes.findIndex((d) => d.id === id)

    return i < 0 ? null : position(nodes[i], i)
  }

  const lines =
    view === "electrical"
      ? (draft.connections ?? []).map((e) => ({
          ...e,

          color: e.kind === "DC" ? "#d99a4c" : "#7da2d4",
        }))
      : ports.flatMap(({ device: d, port: p }) =>
          p.targets.map((t) => ({
            id: `${d.id}/${p.id}/${t}`,

            from: d.id,

            to: t.split("/")[0],

            color:
              p.protocol === "CAN"
                ? "#aa67fa"
                : p.protocol === "Modbus RTU"
                  ? "#e59635"
                  : "#5275f6",

            kind: p.protocol,
          })),
        )

  return (
    <div
      className={`topology-v2 ${expanded ? "topology-expanded" : ""}`}
      data-design-node="2136:8619"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setExpanded(false)

          setConnect(false)

          setSource("")
        }
      }}
    >
      <aside className="topology-library">
        <nav>
          <button aria-pressed={library} onClick={() => setLibrary(true)}>
            节点库
          </button>
          <button aria-pressed={!library} onClick={() => setLibrary(false)}>
            设备列表
          </button>
        </nav>
        <input
          aria-label="搜索设备或结构"
          placeholder="搜索设备或结构"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!library && (
          <select
            aria-label="筛选节点类型"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">全部类型</option>
            {deviceTypes.map((t) => (
              <option key={t} value={t}>
                {deviceLabels[t]}
              </option>
            ))}
          </select>
        )}
        {library ? (
          <>
            {[
              ["电气结构", ["电网", "电表", "变压器", "交流母线", "断路器"]],

              ["能源设备", ["PCS", "电池 / BMS", "光伏", "负载", "光伏 DC/DC"]],

              ["通信设备", ["EMS"]],
            ].map(([label, types]) => (
              <section key={label as string}>
                <p>{label}</p>
                <div className="node-library-grid">
                  {(types as DeviceType[])

                    .filter(
                      (t) =>
                        deviceLabels[t].includes(search) || t.includes(search),
                    )

                    .map((t) => (
                      <button key={t} onClick={() => add(t)}>
                        <NodeIcon type={t} />
                        {deviceLabels[t]}
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="node-list">
            {draft.devices

              .filter(
                (d) =>
                  (!filter || d.type === filter) &&
                  `${d.name} ${d.code}`.includes(search),
              )

              .map((d) => (
                <button
                  key={d.id}
                  aria-pressed={selected === d.id}
                  onClick={() => setSelected(d.id)}
                >
                  <NodeIcon type={d.type} />
                  <span>
                    {d.code}
                    <small>{d.name}</small>
                  </span>
                </button>
              ))}
            {!draft.devices.length && <p>暂无节点</p>}
          </div>
        )}
      </aside>
      <section className="topology-workspace">
        <nav>
          <button
            aria-pressed={view === "electrical"}
            onClick={() => {
              setView("electrical")

              setSource("")
            }}
          >
            电气拓扑
          </button>
          <button
            aria-pressed={view === "communication"}
            onClick={() => {
              setView("communication")

              setSource("")

              setConnect(false)
            }}
          >
            通信关系
          </button>
        </nav>
        <div className="topology-toolbar">
          <button
            aria-pressed={!connect}
            onClick={() => {
              setConnect(false)

              setSource("")
            }}
          >
            选择
          </button>
          <button
            disabled={view === "communication"}
            aria-pressed={connect}
            onClick={() => {
              setConnect(true)

              setMessage("依次点击源节点和目标节点")
            }}
          >
            连线
          </button>
          {connect && (
            <select
              aria-label="连线类型"
              value={kind}
              onChange={(e) => setKind(e.target.value as "AC" | "DC")}
            >
              <option>AC</option>
              <option>DC</option>
            </select>
          )}
          <button aria-label="撤销" disabled={!canUndo} onClick={undo}>
            ↶
          </button>
          <button aria-label="重做" disabled={!canRedo} onClick={redo}>
            ↷
          </button>
          <button
            onClick={() =>
              change({
                devices: draft.devices.map((d, i) => ({
                  ...d,

                  x: 18 + (i % 4) * 21,

                  y: 16 + Math.floor(i / 4) * 24,
                })),
              })
            }
          >
            整理布局
          </button>
          <button onClick={onClear}>清空</button>
          <span />
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起画布" : "展开画布"}
          </button>
          <button onClick={onExport}>导出</button>
        </div>
        <div className="topology-viewport">
          <div
            className="topology-surface"
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()

              const id = e.dataTransfer.getData("text/plain")

              const rect = e.currentTarget.getBoundingClientRect()

              change({
                devices: draft.devices.map((d) =>
                  d.id === id
                    ? {
                        ...d,

                        [view === 'communication' ? 'commX' : 'x']: Math.max(
                          10,

                          Math.min(
                            90,

                            ((e.clientX - rect.left) / rect.width) * 100,
                          ),
                        ),

                        [view === 'communication' ? 'commY' : 'y']: Math.max(
                          8,

                          Math.min(
                            92,

                            ((e.clientY - rect.top) / rect.height) * 100,
                          ),
                        ),
                      }
                    : d,
                ),
              })
            }}
          >
            <svg
              className="topology-v2-lines"
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              {lines.map((e) => {
                const a = point(e.from),
                  b = point(e.to)

                return a && b ? (
                  <line
                    key={e.id}
                    x1={`${
                      draft.devices.find((d) => d.id === e.from)?.type ===
                      "交流母线"
                        ? b.x
                        : a.x
                    }%`}
                    y1={`${a.y}%`}
                    x2={`${
                      draft.devices.find((d) => d.id === e.to)?.type ===
                      "交流母线"
                        ? a.x
                        : b.x
                    }%`}
                    y2={`${b.y}%`}
                    stroke={e.color}
                    strokeWidth="2"
                  />
                ) : null
              })}
            </svg>
            {nodes.map((d, i) => {
              const p = position(d, i)

              return (
                <button
                  key={d.id}
                  aria-label={`配置 ${d.name}`}
                  draggable={!connect}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", d.id)
                  }
                  onClick={() => pick(d)}
                  className={`topology-device topology-v2-device ${
                    d.id === selected ? "selected" : ""
                  } ${d.type === "交流母线" ? "bus-node" : d.type === "EMS" ? "ems-node" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                >
                  <NodeIcon type={d.type} />
                  <span>
                    {d.code}
                    <small>{d.name}</small>
                  </span>
                  {view === "communication" && (
                    <em>
                      {d.ports?.map((p) => p.id).join(" · ") || "未配置端口"}
                    </em>
                  )}
                </button>
              )
            })}
            {!nodes.length && (
              <div className="provision-empty">
                <strong>
                  {view === "communication" ? "暂无通信设备" : "从空白画布开始"}
                </strong>
                <p>从节点库添加设备与结构，再配置连接和属性。</p>
              </div>
            )}
          </div>
        </div>
        <footer>
          <span>
            {view === "electrical"
              ? "— AC 交流　 — DC 直流"
              : "— Modbus TCP　— Modbus RTU　— CAN"}
          </span>
          <button
            aria-label="缩小画布"
            onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
          >
            −
          </button>
          <button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button
            aria-label="放大画布"
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            ＋
          </button>
        </footer>
        {message && <small role="status">{message}</small>}
      </section>
      <aside className="topology-inspector">
        <nav>节点属性</nav>
        {device ? (
          <>
            <header>
              <NodeIcon type={device.type} />
              <div>
                <strong>{device.name}</strong>
                <small>{device.code}</small>
              </div>
            </header>
            <h3>设备选型</h3>
            <Field label="品牌 / 型号">
              <input
                placeholder="未指定 · 手动配置"
                value={device.model ?? ""}
                onChange={(e) => patch({ model: e.target.value })}
              />
            </Field>
            {view === "electrical" ? (
              <>
                <h3>设计属性</h3>
                <Field label="设计编号">
                  <input
                    value={device.code ?? ""}
                    onChange={(e) => patch({ code: e.target.value })}
                  />
                </Field>
                <Field label="节点名称">
                  <input
                    value={device.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </Field>
                {device.type === "电表" ? (
                  <>
                    <h3>计量配置</h3>
                    <Field label="计量角色">
                      <select
                        value={device.meteringRole ?? "并网计量"}
                        onChange={(e) =>
                          patch({ meteringRole: e.target.value })
                        }
                      >
                        {["并网计量", "发电计量", "储能计量", "负荷计量"].map(
                          (x) => (
                            <option key={x}>{x}</option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="所属并网点">
                      <select
                        value={device.gridId ?? ""}
                        onChange={(e) => patch({ gridId: e.target.value })}
                      >
                        <option value="">请选择公共电网节点</option>
                        {draft.devices

                          .filter((d) => d.type === "电网")

                          .map((d) => (
                            <option value={d.id} key={d.id}>
                              {d.code} · {d.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="node-property-row">
                      <Field label="额定值">
                        <input
                          type="number"
                          min="0"
                          value={device.rating ?? ""}
                          onChange={(e) => patch({ rating: e.target.value })}
                        />
                      </Field>
                      <Field label="额定单位">
                        <select
                          value={device.unit ?? "kW"}
                          onChange={(e) => patch({ unit: e.target.value })}
                        >
                          {["kW", "MW", "kWh", "MWh", "kVA", "A"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="node-property-row">
                      <Field label="额定电压">
                        <input
                          type="number"
                          min="0"
                          value={device.voltage ?? ""}
                          onChange={(e) => patch({ voltage: e.target.value })}
                        />
                      </Field>
                      <Field label="电压单位">
                        <select
                          value={device.voltageUnit ?? "V"}
                          onChange={(e) =>
                            patch({ voltageUnit: e.target.value })
                          }
                        >
                          <option>V</option>
                          <option>kV</option>
                        </select>
                      </Field>
                    </div>
                  </>
                )}
                <h3>连接端口</h3>
                <p className="topology-port-hint">
                  {device.type === "电池 / BMS"
                    ? "DC 直流"
                    : device.type === "PCS"
                      ? "AC 交流 / DC 直流"
                      : "AC 交流"}
                  {device.voltage
                    ? ` · ${device.voltage} ${device.voltageUnit ?? "V"}`
                    : ""}
                </p>
                {draft.connections

                  ?.filter((e) => e.from === device.id || e.to === device.id)

                  .map((e) => (
                    <div className="node-edge" key={e.id}>
                      <span>
                        {e.kind} ·{" "}
                        {draft.devices.find(
                          (d) =>
                            d.id === (e.from === device.id ? e.to : e.from),
                        )?.name ?? "失效节点"}
                      </span>
                      <button
                        aria-label="删除连接"
                        onClick={() =>
                          change({
                            connections: draft.connections?.filter(
                              (x) => x.id !== e.id,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </>
            ) : (
              <>
                <h3>
                  通信端口{" "}
                  <button
                    onClick={() => {
                      const p: CommunicationPort = {
                        id: `P${String(Math.max(0, ...(device.ports ?? []).map((p) => Number(p.id.slice(1)) || 0)) + 1).padStart(2, "0")}`,

                        interface: "LAN-1",

                        protocol: "Modbus TCP",

                        role: "服务端 / 从站",

                        ip: "",

                        port: "502",

                        address: "1",

                        version: "",

                        targets: [],
                      }

                      patch({ ports: [...(device.ports ?? []), p] })
                    }}
                  >
                    ＋ 添加端口
                  </button>
                </h3>
                {device.ports?.map((p, index) => (
                  <details className="communication-port" key={p.id} open>
                    <summary>
                      {p.id} {p.interface} · {p.protocol}
                    </summary>
                    <div className="node-property-row">
                      <Field label={`${p.id} 实际接口`}>
                        <select
                          value={p.interface}
                          onChange={(e) =>
                            updatePort(index, { interface: e.target.value })
                          }
                        >
                          {[
                            "LAN-1",

                            "LAN-2",

                            "COM-1",

                            "COM-2",

                            "CAN-1",

                            "CAN-BMS-1",
                          ].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={`${p.id} 协议类型`}>
                        <select
                          value={p.protocol}
                          onChange={(e) =>
                            updatePort(index, {
                              protocol: e.target.value,

                              targets: [],
                            })
                          }
                        >
                          {["Modbus TCP", "Modbus RTU", "CAN"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={`${p.id} 通信角色`}>
                        <select
                          value={p.role}
                          onChange={(e) =>
                            updatePort(index, { role: e.target.value })
                          }
                        >
                          <option>服务端 / 从站</option>
                          <option>客户端 / 主站</option>
                        </select>
                      </Field>
                      {p.protocol === "Modbus TCP" ? (
                        <>
                          <Field label={`${p.id} 设备 IP 地址`}>
                            <input
                              value={p.ip}
                              onChange={(e) =>
                                updatePort(index, { ip: e.target.value })
                              }
                            />
                          </Field>
                          <Field label={`${p.id} TCP 服务端口`}>
                            <input
                              value={p.port}
                              onChange={(e) =>
                                updatePort(index, { port: e.target.value })
                              }
                            />
                          </Field>
                        </>
                      ) : (
                        <Field label={`${p.id} 设备地址`}>
                          <input
                            value={p.address}
                            onChange={(e) =>
                              updatePort(index, { address: e.target.value })
                            }
                          />
                        </Field>
                      )}
                      <Field label={`${p.id} 协议 / 点表版本`}>
                        <input
                          value={p.version}
                          placeholder="待配置"
                          onChange={(e) =>
                            updatePort(index, { version: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <Field label={`${p.id} 目标端口`}>
                      <select
                        multiple
                        value={p.targets}
                        onChange={(e) =>
                          updatePort(index, {
                            targets: [...e.target.selectedOptions].map(
                              (o) => o.value,
                            ),
                          })
                        }
                      >
                        {ports

                          .filter(
                            (t) =>
                              t.device.id !== device.id &&
                              t.port.protocol === p.protocol,
                          )

                          .map((t) => (
                            <option value={t.value} key={t.value}>
                              {t.device.code} · {t.port.id}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <small>支持多选；先为目标设备添加相同协议的端口。</small>
                    <button
                      onClick={() => {
                        const removed = `${device.id}/${p.id}`

                        change({
                          devices: draft.devices.map((d) => ({
                            ...d,

                            ports: d.ports

                              ?.filter(
                                (q) => d.id !== device.id || q.id !== p.id,
                              )

                              .map((q) => ({
                                ...q,

                                targets: q.targets.filter((t) => t !== removed),
                              })),
                          })),
                        })
                      }}
                    >
                      删除端口
                    </button>
                  </details>
                ))}
                {!device.ports?.length && <p>暂无通信端口</p>}
              </>
            )}
            <div className="node-actions">
              <Button
                onClick={() => {
                  const copy = {
                    ...device,

                    id: newNodeId(),

                    code: `${device.code ?? "NODE"}-${draft.devices.length + 1}`,

                    name: `${device.name} 副本`,

                    ports: device.ports?.map((p) => ({ ...p, targets: [] })),

                    x: Math.min(88, (device.x ?? 30) + 10),
                  }

                  change({ devices: [...draft.devices, copy] })

                  setSelected(copy.id)
                }}
              >
                复制节点
              </Button>
              <Button onClick={remove}>删除节点</Button>
            </div>
          </>
        ) : (
          <p>选择节点查看属性，或从节点库添加设备。</p>
        )}
      </aside>
    </div>
  )
}
