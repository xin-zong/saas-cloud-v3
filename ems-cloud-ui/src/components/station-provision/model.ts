export const PROVISION_KEY = "enerlution_station_provision_v1"

export function newNodeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()

  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")
}

export function provisionDraftKey(
  identity: string,

  demo: boolean,

  stationId?: string,
): string {
  return `${PROVISION_KEY}:${
    demo ? "demo" : "api"
  }:${encodeURIComponent(identity)}:${
    stationId === undefined ? "new" : `station:${encodeURIComponent(stationId)}`
  }`
}

export const deviceTypes = [
  "电网",

  "光伏",

  "光伏 DC/DC",

  "PCS",

  "电池 / BMS",

  "负载",

  "电表",

  "变压器",

  "交流母线",

  "断路器",

  "EMS",
] as const

export type DeviceType = typeof deviceTypes[number]

export type Device = {
  code?: string

  model?: string

  rating?: string

  unit?: string

  voltage?: string

  voltageUnit?: string

  meteringRole?: string

  gridId?: string

  commX?: number
  commY?: number
  x?: number

  y?: number

  ports?: CommunicationPort[]

  id: string

  type: DeviceType

  name: string

  protocol: string

  interface: string

  ip: string

  port: string

  address: string

  bus: string

  baud: string

  parity: string

  bits: string
}

export type ProvisionDraft = {
  template?: string

  connections?: Connection[]

  schema: 1

  customerId?: string | null

  name: string

  code: string

  organization: string

  region: string

  type: string

  timezone: string

  address: string

  imageUrl: string

  ratedPower: string

  storageCapacity: string

  devices: Device[]

  buses: string[]

  version: number

  stationId?: string
}

export type CommunicationPort = {
  id: string

  interface: string

  protocol: string

  role: string

  ip: string

  port: string

  address: string

  version: string

  targets: string[]
}

export type Connection = {
  id: string

  from: string

  to: string

  kind: "AC" | "DC"
}

export const templates = [
  "光储协同",

  "工商业储能",

  "光储充",

  "自定义空白拓扑",
] as const

export const deviceLabels: Record<DeviceType, string> = {
  电网: "公共电网",

  光伏: "光伏逆变器",

  "光伏 DC/DC": "光伏 DC/DC",

  PCS: "储能 PCS",

  "电池 / BMS": "电池系统",

  负载: "负荷",

  电表: "计量电表",

  变压器: "变压器",

  交流母线: "交流母线",

  断路器: "断路器",

  EMS: "站级 EMS",
}

export function createDevice(type: DeviceType, count: number): Device {
  const prefix: Record<DeviceType, string> = {
    电网: "GRID",

    光伏: "INV",

    "光伏 DC/DC": "DCDC",

    PCS: "PCS",

    "电池 / BMS": "BAT",

    负载: "LOAD",

    电表: "M",

    变压器: "T",

    交流母线: "BUS",

    断路器: "QF",

    EMS: "EMS",
  }

  return {
    id: newNodeId(),

    type,

    name: `${deviceLabels[type]} ${count}`,

    code: `${prefix[type]}-${String(count).padStart(2, "0")}`,

    model: "",

    rating: "",

    unit: type === "电池 / BMS" ? "kWh" : "kW",

    voltage: "",

    voltageUnit: "V",

    meteringRole: "并网计量",

    gridId: "",

    ports: [],

    protocol: "",

    interface: "LAN 1",

    ip: "",

    port: "502",

    address: String(count),

    bus: "",

    baud: "9600",

    parity: "无校验",

    bits: "8 / 1",
  }
}

export function buildTemplate(
  template: string,
): Pick<ProvisionDraft, "devices" | "buses" | "connections" | "template"> {
  if (template === "自定义空白拓扑")
    return { template, devices: [], buses: [], connections: [] }

  const types: DeviceType[] = [
    "电网",

    "电表",

    "变压器",

    "交流母线",

    ...(template === "工商业储能" ? [] : ["光伏" as DeviceType]),

    "PCS",

    "PCS",

    "负载",

    "电池 / BMS",

    "电池 / BMS",
  ]

  const devices = types.map((type, i) =>
    createDevice(type, types.slice(0, i).filter((t) => t === type).length + 1),
  )

  const get = (type: DeviceType) => devices.filter((d) => d.type === type)

  get("电网")[0].x = 50

  get("电网")[0].y = 9

  get("电表")[0].x = 50

  get("电表")[0].y = 27

  get("电表")[0].gridId = get("电网")[0].id

  get("变压器")[0].x = 50

  get("变压器")[0].y = 45

  get("交流母线")[0].x = 50

  get("交流母线")[0].y = 57

  const lower = devices.filter((d) => ["光伏", "PCS", "负载"].includes(d.type))

  lower.forEach((d, i) => {
    d.x = 14 + (i * 72) / Math.max(1, lower.length - 1)

    d.y = 70
  })

  get("电池 / BMS").forEach((d, i) => {
    d.x = get("PCS")[i].x

    d.y = 90
  })

  if (template === "光储充") get("负载")[0].name = "充电设施"

  const connections: Connection[] = []

  const link = (a: Device, b: Device, kind: "AC" | "DC" = "AC") =>
    connections.push({ id: newNodeId(), from: a.id, to: b.id, kind })

  link(get("电网")[0], get("电表")[0])

  link(get("电表")[0], get("变压器")[0])

  link(get("变压器")[0], get("交流母线")[0])

  lower.forEach((d) => link(get("交流母线")[0], d))

  get("PCS").forEach((d, i) => link(d, get("电池 / BMS")[i], "DC"))

  return { template, devices, buses: [], connections }
}

export function validateGraph(draft: ProvisionDraft): string[] {
  if (!draft.connections) return validateTopology(draft.devices)

  const errors: string[] = []

  const ids = new Set(draft.devices.map((d) => d.id))

  const codes = new Set<string>()

  const addresses = new Set<string>()

  if (!draft.devices.length) errors.push("请添加至少一个节点并配置连接")

  for (const edge of draft.connections) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)
      errors.push("电气连接端点失效")

    const types = [
      draft.devices.find((d) => d.id === edge.from)?.type,

      draft.devices.find((d) => d.id === edge.to)?.type,
    ]

    if (edge.kind === "AC" && types.includes("电池 / BMS"))
      errors.push("电池系统应连接 DC 直流端口")

    if (
      edge.kind === "DC" &&
      types.some((t) => t && ["电网", "交流母线", "变压器"].includes(t))
    )
      errors.push("交流结构不能连接 DC 直流端口")
  }

  for (const d of draft.devices) {
    if (!d.name.trim() || !d.code?.trim())
      errors.push(`${d.name}：请填写名称与设计编号`)

    if (d.code && codes.has(d.code.trim()))
      errors.push(`${d.name}：设计编号重复`)

    if (d.code) codes.add(d.code.trim())

    if (
      d.type !== "EMS" &&
      !draft.connections.some((e) => e.from === d.id || e.to === d.id)
    )
      errors.push(`${d.name}：未连接电气拓扑`)

    if (
      d.type === "电表" &&
      d.meteringRole === "并网计量" &&
      !draft.devices.some((g) => g.id === d.gridId && g.type === "电网")
    )
      errors.push(`${d.name}：请选择有效所属并网点`)

    for (const [value, label] of [
      [d.rating, "额定值"],

      [d.voltage, "额定电压"],
    ])
      if (value && (!Number.isFinite(Number(value)) || Number(value) < 0))
        errors.push(`${d.name}：${label}必须为非负数`)

    if (
      !["电网", "负载", "变压器", "交流母线", "断路器", "EMS"].includes(
        d.type,
      ) &&
      !d.ports?.length
    )
      errors.push(`${d.name}：请配置通信端口`)

    for (const p of d.ports ?? []) {
      if (!p.targets.length && d.type !== "EMS")
        errors.push(`${d.name}/${p.id}：请选择目标端口`)

      if (!["Modbus TCP", "Modbus RTU", "CAN"].includes(p.protocol))
        errors.push(`${d.name}/${p.id}：请选择有效通信协议`)

      if (
        (p.protocol === "Modbus TCP" && !p.interface.startsWith("LAN")) ||
        (p.protocol === "Modbus RTU" && !p.interface.startsWith("COM")) ||
        (p.protocol === "CAN" && !p.interface.startsWith("CAN"))
      )
        errors.push(`${d.name}/${p.id}：接口与协议不兼容`)

      for (const target of p.targets) {
        const [id, port] = target.split("/")

        const dest = draft.devices

          .find((n) => n.id === id)

          ?.ports?.find((q) => q.id === port)

        if (!dest || id === d.id) errors.push(`${d.name}/${p.id}：目标端口失效`)
        else if (dest.protocol !== p.protocol)
          errors.push(`${d.name}/${p.id}：目标协议不兼容`)
      }

      if (
        p.protocol === "Modbus TCP" &&
        (!/^(\d{1,3}\.){3}\d{1,3}$/.test(p.ip) ||
          p.ip.split(".").some((n) => +n > 255) ||
          !/^\d+$/.test(p.port) ||
          +p.port < 1 ||
          +p.port > 65535)
      )
        errors.push(`${d.name}/${p.id}：IP 或 TCP 端口无效`)

      if (
        p.protocol === "Modbus RTU" &&
        (!/^\d+$/.test(p.address) || +p.address < 1 || +p.address > 247)
      )
        errors.push(`${d.name}/${p.id}：设备地址应为 1–247`)

      const key =
        p.protocol === "Modbus TCP"
          ? `${p.ip.split(".").map(Number).join(".")}:${+p.port}`
          : `${p.targets.slice().sort().join(",")}:${p.address}`

      if (p.protocol !== "CAN" && p.targets.length && addresses.has(key))
        errors.push(`${d.name}/${p.id}：通信地址冲突`)

      addresses.add(key)
    }
  }

  return [...new Set(errors)]
}

export function emptyProvision(): ProvisionDraft {
  return {
    schema: 1,

    template: "自定义空白拓扑",

    connections: [],

    name: "",

    code: "",

    organization: "",

    region: "",

    type: "工商业储能",

    timezone: "Asia/Shanghai (UTC+08:00)",

    address: "",

    imageUrl: "",

    ratedPower: "",

    storageCapacity: "",

    devices: [],

    buses: [],

    version: 1,
  }
}

export function validateBasics(d: ProvisionDraft) {
  const errors: string[] = []

  if (!d.name.trim()) errors.push("请填写站点名称")

  if (!d.code.trim()) errors.push("请填写站点 ID")

  if (!d.organization.trim()) errors.push("请填写所属组织")

  if (!d.region.trim()) errors.push("请选择所在地区")

  if (!d.address.trim()) errors.push("请填写详细地址")

  for (const [value, label] of [
    [d.ratedPower, "额定功率"],

    [d.storageCapacity, "储能容量"],
  ])
    if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))
      errors.push(`${label}必须为非负数`)

  return errors
}

export function validateTopology(devices: Device[]) {
  const errors: string[] = []

  const addresses = new Set<string>()

  if (!devices.length) errors.push("请添加至少一个设备并连接母线")

  for (const d of devices) {
    if (!d.name.trim()) errors.push("逻辑设备名称不能为空")

    if (!d.bus) errors.push(`${d.name}：未连接母线`)

    if (["电网", "光伏", "负载"].includes(d.type)) continue

    if (!d.protocol) errors.push(`${d.name}：请选择协议`)

    if (!d.interface) errors.push(`${d.name}：请选择 EMS 接口`)

    if (
      !/^\d+$/.test(d.address) ||
      Number(d.address) < 1 ||
      Number(d.address) > 247
    )
      errors.push(`${d.name}：设备地址应为 1–247`)

    if (d.interface.startsWith("LAN")) {
      if (
        !/^(\d{1,3}\.){3}\d{1,3}$/.test(d.ip) ||
        d.ip.split(".").some((n) => Number(n) > 255)
      )
        errors.push(`${d.name}：请输入有效 IP 地址`)

      if (!/^\d+$/.test(d.port) || Number(d.port) < 1 || Number(d.port) > 65535)
        errors.push(`${d.name}：端口应为 1–65535`)
    }

    const key = [
      d.interface,

      d.interface.startsWith("LAN")
        ? `${d.ip.split(".").map(Number).join(".")}:${Number(d.port)}`
        : "",

      Number(d.address),
    ].join("/")

    if (addresses.has(key)) errors.push(`${d.name}：通信地址冲突`)

    addresses.add(key)
  }

  return errors
}

export const deploymentStages = [
  "配置发布",

  "手机下载",

  "绑定 EMS",

  "传输与校验",

  "设备关联",

  "结果回传",
].map((label) => ({ label, status: "unavailable" as const }))

export function parseDraft(raw: string | null): ProvisionDraft | null {
  try {
    const d = JSON.parse(raw ?? "null")

    if (
      d?.schema !== 1 ||
      typeof d.name !== "string" ||
      !Array.isArray(d.devices) ||
      !Array.isArray(d.buses)
    )
      return null

    const base = emptyProvision()

    for (const key of Object.keys(base)) {
      const value = d[key]

      if (
        typeof base[(key as keyof ProvisionDraft)] === "string" &&
        typeof value !== "string" &&
        key !== "template"
      )
        return null
    }

    if (
      d.devices.some(
        (v: Device) =>
          !v ||
          typeof v.id !== "string" ||
          !deviceTypes.includes(v.type) ||
          [
            "name",

            "protocol",

            "interface",

            "ip",

            "port",

            "address",

            "bus",

            "baud",

            "parity",

            "bits",
          ].some((k) => typeof v[(k as keyof Device)] !== "string"),
      )
    )
      return null

    if (
      d.customerId !== undefined &&
      d.customerId !== null &&
      (typeof d.customerId !== "string" || !/^[1-9]\d*$/.test(d.customerId))
    )
      return null

    if (
      d.connections !== undefined &&
      (!Array.isArray(d.connections) ||
        d.connections.some(
          (e: Connection) =>
            !e ||
            typeof e.id !== "string" ||
            typeof e.from !== "string" ||
            typeof e.to !== "string" ||
            !["AC", "DC"].includes(e.kind),
        ))
    )
      return null

    if (
      d.devices.some(
        (n: Device) =>
          n.ports !== undefined &&
          (!Array.isArray(n.ports) ||
            n.ports.some(
              (p) =>
                !p ||
                [
                  "id",

                  "interface",

                  "protocol",

                  "role",

                  "ip",

                  "port",

                  "address",

                  "version",
                ].some(
                  (k) => typeof p[(k as keyof CommunicationPort)] !== "string",
                ) ||
                !Array.isArray(p.targets) ||
                p.targets.some((t) => typeof t !== "string"),
            )),
      )
    )
      return null

    if (d.connections === undefined) {
      const devices: Device[] = d.devices.map((n: Device, i: number) => ({
        ...createDevice(n.type, i + 1),

        ...n,
      }))

      const buses: Device[] = d.buses.map((name: string, i: number) => ({
        ...createDevice("交流母线", i + 1),

        name,

        x: 50,

        y: 40 + i * 25,
      }))

      const connections: Connection[] = devices.flatMap((n) => {
        const bus = buses.find((b) => b.name === n.bus)

        return bus
          ? [
              {
                id: newNodeId(),

                from: bus.id,

                to: n.id,

                kind: (n.bus.includes("直流") ? "DC" : "AC") as "AC" | "DC",
              },
            ]
          : []
      })

      const communicating = devices.filter((n) => n.protocol)

      if (communicating.length) {
        const ems = createDevice("EMS", 1)

        ems.name = "站级 EMS（旧草稿通信配置）"

        for (const n of communicating) {
          const targetId = `P${String((ems.ports?.length ?? 0) + 1).padStart(2, "0")}`

          const port: CommunicationPort = {
            id: "P01",
            interface: n.interface.replace(" ", "-"),
            protocol: n.protocol,
            role: "服务端 / 从站",
            ip: n.ip,
            port: n.port,
            address: n.address,
            version: "",
            targets: [`${ems.id}/${targetId}`],
          }

          n.ports = [port]

          ems.ports?.push({
            ...port,
            id: targetId,
            role: "客户端 / 主站",
            ip: "",
            targets: [],
          })
        }

        devices.push(ems)
      }

      return {
        ...base,

        ...d,

        devices: [...devices, ...buses],

        buses: [],

        connections,
      }
    }

    return { ...base, ...d }
  } catch {
    return null
  }
}
