export const PROVISION_KEY = "enerlution_station_provision_v1"
export const deviceTypes = [
  "电网",
  "光伏",
  "光伏 DC/DC",
  "PCS",
  "电池 / BMS",
  "负载",
  "电表",
] as const
export type DeviceType = typeof deviceTypes[number]
export type Device = {
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
  schema: 1
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
export function emptyProvision(): ProvisionDraft {
  return {
    schema: 1,
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
      d.interface.startsWith("LAN") ? `${d.ip}:${d.port}` : "",
      d.address,
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
        typeof value !== "string"
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
    return { ...base, ...d }
  } catch {
    return null
  }
}
