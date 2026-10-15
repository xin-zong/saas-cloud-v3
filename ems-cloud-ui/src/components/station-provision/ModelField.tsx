import { Field } from './Common'
import type { Device } from './model'
import { modelsForDevice, type ProvisionModel } from './deviceConfiguration'

export default function ModelField({ device, models, patch, cooling = false }: {
  device: Device; models: ProvisionModel[]; patch: (id: string, values: Partial<Device>) => void; cooling?: boolean
}) {
  const key = cooling ? 'coolingModel' : 'model'
  const value = device[key] ?? ''
  const separate = !cooling && ['柴油发电机', '可控负载'].includes(device.type)
  const choices = modelsForDevice(models, device.type, cooling)
  const manufacturers = [...new Set(choices.map(m => m.manufacturer))]
  const options = separate ? choices.filter(m => m.manufacturer === device.manufacturer) : choices
  const label = cooling ? '液冷厂家 / 型号' : separate || ['电表', '光伏侧电表', '光伏', '充电桩'].includes(device.type) ? '型号' : '厂家 / 型号'
  const title = (m: ProvisionModel) => `${m.manufacturer} / ${m.name}`
  return <>
    {separate && <Field label="厂家"><select value={device.manufacturer ?? ''} onChange={e => patch(device.id, { manufacturer: e.target.value, model: '' })}>
      <option value="">请选择厂家</option>
      {device.manufacturer && !manufacturers.includes(device.manufacturer) && <option>{device.manufacturer}</option>}
      {manufacturers.map(name => <option key={name}>{name}</option>)}
    </select></Field>}
    <Field label={label}><select data-device-field={`${device.id}:${key}`} value={value} onChange={e => {
      const chosen = options.find(m => title(m) === e.target.value)
      patch(device.id, { [key]: e.target.value, ...(!cooling && chosen ? { manufacturer: chosen.manufacturer } : {}) })
    }}>
      <option value="">{choices.length ? '请选择已登记型号' : '暂无已登记型号'}</option>
      {value && !options.some(m => title(m) === value) && <option value={value}>{value}（草稿值，未核验）</option>}
      {options.map(m => <option key={m.id} value={title(m)}>{title(m)}</option>)}
    </select></Field>
    {!choices.length && <p className="model-catalog-hint">此类别暂无型号记录，未填充原型示例型号。</p>}
    <details className="model-manual"><summary>手填草稿型号</summary><Field label={`${label}（草稿，未核验）`}><input value={value} onChange={e => patch(device.id, { [key]: e.target.value })}/></Field><p>仅保存设计输入，不代表 EMS 已适配此型号。</p></details>
  </>
}
