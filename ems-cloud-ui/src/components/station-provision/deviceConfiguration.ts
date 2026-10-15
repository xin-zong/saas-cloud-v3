import type { CommunicationPort, Device, ProvisionDraft } from './model'

// Legacy DCDC drafts used enabled for whether DC PV existed at all.
export const hasDcPv = (device: Device) => device.dcPvConfigured ?? device.enabled !== false
export const configureDcPv = (device: Device, value: boolean): Partial<Device> => ({
  dcPvConfigured: value,
  enabled: device.dcPvConfigured === undefined ? true : device.enabled,
})
export const setOperationEnabled = (device: Device, value: boolean): Partial<Device> => ({
  enabled: value,
  ...(device.type === '光伏 DC/DC' ? { dcPvConfigured: hasDcPv(device) } : {}),
})
export const portKind = (port: CommunicationPort) => port.kind ?? (
  port.interface.startsWith('ETH') ? 'ETH' : port.interface.startsWith('RS485') ? 'RS485' : ''
)
export function availableEmus(draft: ProvisionDraft, device: Device) {
  return draft.devices.filter(n => n.type === '电池 / BMS' && n.id !== device.id &&
    !!device.emsId && n.emsId === device.emsId && n.enabled !== false)
}
export function setEmsPortType(draft: ProvisionDraft, emsId: string, index: number, kind: '' | 'ETH' | 'RS485') {
  const ems = draft.devices.find(n => n.id === emsId)
  const before = ems?.ports?.[index]
  if (!ems || !before) return { devices: draft.devices }
  const names = new Set(ems.ports?.filter((_, i) => i !== index).map(p => p.id))
  let number = 1
  while (names.has(`${kind || '接口'}-${number}`)) number++
  const next = `${kind || '接口'}-${number}`
  return { devices: draft.devices.map(n => n.id === emsId ? {
    ...n, ports: n.ports?.map((p, i) => i === index ? {
      ...p, id: next, kind, interface: kind ? next : '',
      protocol: kind === 'ETH' ? 'Modbus TCP' : kind === 'RS485' ? 'Modbus RTU' : '',
    } : p),
  } : n.emsId === emsId && n.interface === before.id ? { ...n, interface: '' } : n) }
}
export function assignEms(draft: ProvisionDraft, id: string, emsId: string) {
  const affected = new Set(draft.devices.filter(n => n.id === id || n.cabinetId === id).map(n => n.id))
  return { devices: draft.devices.map(n => {
    if (!affected.has(n.id) || n.emsId === emsId) return n
    const emu = draft.devices.find(b => b.id === n.emuId)
    return { ...n, emsId, interface: '', emuId: emu && (affected.has(emu.id) || emu.emsId === emsId) ? emu.id : '' }
  }) }
}

export type ProvisionModel = { id: number | string; manufacturer: string; name: string; category: string }
const categories: Partial<Record<Device['type'], string>> = {
  PCS: 'PCS', '电池 / BMS': 'BMS', 电表: 'MTR', 光伏侧电表: 'MTR', 光伏: 'PV',
  '光伏 DC/DC': 'DCDC', 柴油发电机: 'DG', 充电桩: 'EV', 可控负载: 'LOAD',
}
export function modelsForDevice(models: ProvisionModel[], type: Device['type'], cooling = false) {
  return models.filter(model => model.category === (cooling ? 'HVAC' : categories[type]))
}
