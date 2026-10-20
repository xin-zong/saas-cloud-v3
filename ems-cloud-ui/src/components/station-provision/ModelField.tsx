import { Field } from './Common';
import type { Device } from './model';
import { modelsForDevice, type ProvisionModel } from './deviceConfiguration';
export default function ModelField({ device, models, patch, cooling = false }: {
    device: Device;
    models: ProvisionModel[];
    patch: (id: string, values: Partial<Device>) => void;
    cooling?: boolean;
}) {
    const choices = modelsForDevice(models, device.type, cooling), selected = choices.find(m => String(m.id) === String(device.modelId)) ?? choices.find(m => m.manufacturer === device.manufacturer && (m.modelCode ?? m.name) === device.modelCode);
    return <div className="inspector-model-catalog">
  <div className="inspector-pair"><Field label="厂家（目录身份）"><input readOnly value={device.manufacturer ?? ''}/></Field><Field label="型号编码（目录身份）"><input readOnly value={device.modelCode ?? ''}/></Field></div>
  <Field label={cooling ? '选择已登记温控型号' : '选择已登记型号'}><select data-device-field={`${device.id}:model`} value={selected ? String(selected.id) : ''} onChange={e => {
            const chosen = choices.find(m => String(m.id) === e.target.value);
            if (chosen)
                patch(device.id, {
                    modelId: chosen.id, modelCode: chosen.modelCode ?? chosen.name, manufacturer: chosen.manufacturer, model: chosen.manufacturer + ' / ' + chosen.name
                });
        }}><option value="">{choices.length ? '请选择适配目录中的型号' : '暂无已登记型号'}</option>{choices.map(m => <option key={m.id} value={String(m.id)}>{m.manufacturer} / {m.name}</option>)}</select></Field>
  {!selected && (device.manufacturer || device.modelCode) && <p className="model-catalog-hint">当前身份来自导入或旧草稿，尚未与在线适配目录核验；不代表设备已适配。</p>}
  {!choices.length && <p className="model-catalog-hint">此类别暂无已登记型号，保留真实空态。</p>}
 </div>;
}
