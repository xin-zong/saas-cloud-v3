import { localized as __locale } from '@/preferences/date'
import type { Station } from "@/App";

export type DeviceStatus = "online" | "warning" | "offline" | "unknown";
export type DevicePoint = {
  id: string;
  label: string;
  value: number | null;
  exactValue?: string;
  textValue?: string;
  lastKnownValue?: string;
  valueType?: string;
  sourceTime?: number | null;
  staleReason?: string;
  semanticKey?: string;
  sourceType?: string;
  sourceId?: number;
  metric?: string;
  unit: string;
  quality: "good" | "bad";
};
export type DeviceField = { label: string; value: string; pointId?: string };
export type StationDevice = {
  id: string;
  name: string;
  code: string;
  group: string;
  sourceType?: string;
  parentDeviceId?: string;
  manufacturer?: string;
  ratedPowerKw?: number | null;
  capacityKwh?: number | null;
  status: DeviceStatus;
  model: string;
  serial: string;
  firmware: string;
  commissionedAt: string;
  updatedAt: string;
  latencyMs: number | null;
  primaryPointId: string;
  points: DevicePoint[];
  trend: { at: string; value: number | null; target?: number | null }[];
  operation: DeviceField[];
  limits: DeviceField[];
  parameters: DeviceField[];
  upstream: string;
  downstream: string;
  alarms: { id: string; title: string; severity: "critical" | "warning"; active: boolean; at: string }[];
  versions: { version: string; at: string; note: string; current: boolean }[];
  logs: { at: string; action: string; operator: string; result: string }[];
};

export const DEVICE_TYPES = ['inverter','cabinet','pcs','battery-cluster','battery-stack','air-conditioner','meter','logger','ems'] as const;
export type DeviceType = typeof DEVICE_TYPES[number] | 'other';
export function deviceTypeFromSource(source?:string,category?:string):DeviceType {
  const names:Record<string,DeviceType>={inverter:'inverter','1':'inverter',energystoragecabinet:'cabinet','66':'cabinet',pcs:'pcs','46':'pcs',batterycluster:'battery-cluster','31001':'battery-cluster',batterystack:'battery-stack','31002':'battery-stack',airconditioner:'air-conditioner','6':'air-conditioner',smartmeter:'meter',meter:'meter','5':'meter',logger:'logger','18':'logger','185000':'logger',ems:'ems','185001':'ems'};
  return names[(source??'').toLowerCase().replace(/[ _-]/g,'')]??({PV:'inverter',BESS:'cabinet',PCS:'pcs',HVAC:'air-conditioner',MTR:'meter'} as Record<string,DeviceType>)[category??'']??'other';
}
export const DEVICE_SCHEMAS: Record<DeviceType, {label:string; sections:string[]; match:RegExp[]}> = {
  inverter: {label:'逆变器',sections:['交流侧','直流与组串','发电量'],match:[/交流|AC|功率|频率|power|frequency/i,/直流|DC|组串|String|MPPT/i,/发电|电量|energy|production/i]},
  cabinet: {label:'储能柜',sections:['储能运行','电池状态','温控与安全'],match:[/功率|充|放|power|charge/i,/SOC|SOH|电池|battery/i,/温|消防|绝缘|temperature|insulation/i]},
  pcs: {label:'PCS',sections:['交流侧','直流侧','运行状态'],match:[/交流|AC|频率|frequency/i,/直流|DC/i,/状态|效率|功率|state|power|efficiency/i]},
  'battery-cluster': {label:'电池簇',sections:['簇状态','单体电压','单体温度','铜排与BCMS'],match:[/SOC|SOH|功率|充|放|绝缘|power|charge|insulation/i,/单体.*电压|cell.*voltage|monomer.*voltage/i,/单体.*温|cell.*temp|monomer.*temp/i,/铜排|copper|BCMS/i]},
  'battery-stack': {label:'电池堆',sections:['堆状态','下属电池簇','单体极值'],match:[/SOC|SOH|功率|充|放|power|charge/i,/簇|cluster/i,/最高|最低|极|均值|max|min|average|range/i]},
  'air-conditioner': {label:'空调',sections:['温湿度','运行与供电'],match:[/温|湿|temp|humidity/i,/状态|功率|电压|电流|风|mode|state|power|voltage|current|fan/i]},
  meter: {label:'智能电表',sections:['三相电气量','电能计量'],match:[/功率|电压|电流|频率|因数|power|voltage|current|frequency|factor/i,/电量|电能|energy|import|export/i]},
  logger: {label:'采集器',sections:['通信与采集','系统状态'],match:[/通信|采集|在线|网络|延迟|communication|network|latency|collect/i,/状态|版本|时间|state|version|time/i]},
  ems: {label:'EMS',sections:['能量管理','网关与系统'],match:[/功率|能量|策略|SOC|power|energy|strategy/i,/通信|网关|版本|状态|communication|gateway|version|state/i]},
  other: {label:'其他设备',sections:['已登记测点'],match:[/.*/]},
};
export type DeviceConfiguration = {version:number;selectedPointIds:number[];theoryValues:Record<string,number>};
export type DeviceDetail = {type:DeviceType;archive:Record<string,unknown>;points:Record<string,unknown>[];configuration:DeviceConfiguration;theoryFields:string[];connections:Record<string,unknown>[];logs:Record<string,unknown>[];firmwareRecords:Record<string,unknown>[]};
export function detailPoint(point:Record<string,unknown>,observation?:Record<string,unknown>):DevicePoint {
  const exact=observation?.value == null ? undefined : String(observation.value);
  const value=observation?.valueType==='number' && observation.quality==='valid' && !observation.staleReason && exact!==undefined ? Number(exact) : null;
  const typed=observation && observation.quality==='valid' && !observation.staleReason && observation.value!=null && ['text','boolean','u16_words'].includes(String(observation.valueType));
  return {id:String(point.id),label:String(point.name??point.code??point.id),unit:String(point.unit??''),
    valueType:String(observation?.valueType??''),
    lastKnownValue:observation?.sourceType==='stored_device' && observation.quality==='valid' ? exact : undefined,
    sourceTime:typeof observation?.sourceTime==='number'?observation.sourceTime:null,
    staleReason:observation?.staleReason?String(observation.staleReason):undefined,
    semanticKey:String(observation?.semanticKey??point.semanticKey??''),sourceType:String(observation?.sourceType??point.sourceType??''),
    value:value!==null && Number.isFinite(value)?value:null,
    textValue:typed?(Array.isArray(observation.value)?JSON.stringify(observation.value):String(observation.value)):undefined,
    exactValue:value!==null && Number.isFinite(value)?exact:undefined,quality:(typed||value!==null && Number.isFinite(value))?'good':'bad'};
}
export function cellGroups(row:Record<string,unknown>):{slot:string;values:string[]}[] {
  if(row.quality!=='valid'||row.staleReason||!Array.isArray(row.value))return [];
  const slots=Array.isArray(row.bmuSlots)?row.bmuSlots:[];
  return row.value.flatMap((values,index)=>Array.isArray(values)?[{slot:String(slots[index]??index+1),values:values.map(v=>v==null?'—':String(v))}]:[]);
}
export function deviceHistoryChart(rows:{timestamp:number;value:number|null}[]):{timestamp:number;value:number|null}[] {
  const ordered=rows.filter(r=>Number.isFinite(r.timestamp)).sort((a,b)=>a.timestamp-b.timestamp);
  const result:{timestamp:number;value:number|null}[]=[];
  for(const row of ordered){const previous=result.at(-1);if(previous)for(let t=previous.timestamp+900000;t<row.timestamp&&result.length<3000;t+=900000)result.push({timestamp:t,value:null});result.push({timestamp:row.timestamp,value:row.value});}
  return result;
}

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = { online: "在线", warning: "告警", offline: "离线", unknown: "未知" };

export function pointValue(point?: DevicePoint) {
  return point?.quality === "good" && typeof point.value === "number" && Number.isFinite(point.value) ? point.value : null;
}

export function formatPoint(point?: DevicePoint) {
  if(point?.lastKnownValue!==undefined && point.staleReason)return [point.lastKnownValue, point.unit].filter(Boolean).join(' ')+'（最后采样 · 已过期）';
  if(point?.quality==='good'&&point.textValue!==undefined)return point.textValue;
  const value = pointValue(point);
  if (point?.quality === 'good' && point.exactValue !== undefined) return `${point.exactValue} ${point.unit}`.trim();
  return value === null ? "--" : `${__locale(value, 'toLocaleString', "zh-CN", { maximumFractionDigits: point?.id === "powerFactor" ? 3 : 2 })} ${point?.unit ?? ""}`.trim();
}

export function demoStationDevices(station: Station, now: number): StationDevice[] {
  const eventDay = new Date(now);
  eventDay.setDate(eventDay.getDate() - 1);
  eventDay.setHours(14, 21, 6, 0);
  const seeds = [
    { id: "PCS-01", name: "PCS-01", group: "PCS 系统", kind: "pcs", model: "PCS-125K-TL" },
    { id: "PCS-02", name: "PCS-02", group: "PCS 系统", kind: "pcs", model: "PCS-125K-TL" },
    { id: "BMS-01", name: "BMS-01", group: "储能系统", kind: "battery", model: "BMS-1500-M" },
    { id: "RACK-01", name: "电池簇 01", group: "储能系统", kind: "battery", model: "LFP-280Ah" },
    { id: "RACK-02", name: "电池簇 02", group: "储能系统", kind: "battery", model: "LFP-280Ah" },
    { id: "MTR-01", name: "并网电表", group: "计量与负荷", kind: "meter", model: "DTSU-666" },
    { id: "MTR-02", name: "园区负荷表", group: "计量与负荷", kind: "meter", model: "DTSU-666" },
    { id: "FSS-01", name: "消防控制器", group: "安全与环境", kind: "fire", model: "FSS-200" },
    { id: "HVAC-01", name: "温控系统", group: "安全与环境", kind: "hvac", model: "HVAC-30" },
  ];
  return seeds.map((seed, index) => {
    const wave = Math.sin(now / 21000 + index);
    const power = (station.activePower * (index === 1 ? 0.48 : 0.52)) + wave * 8;
    const point = (id: string, label: string, value: number, unit: string): DevicePoint => ({ id, label, value: Number(value.toFixed(id === "powerFactor" ? 3 : 2)), unit, quality: "good" });
    const electrical = [
      point("dcVoltage", "直流电压", 768 + wave * 2, "V"),
      point("dcCurrent", "直流电流", power * 1000 / (768 + wave * 2), "A"),
      point("voltageA", "A相电压", 400.8 + wave * 0.8, "V"),
      point("voltageB", "B相电压", 399.9 + wave * 0.6, "V"),
      point("voltageC", "C相电压", 400.2 + wave * 0.7, "V"),
      point("temperature", "内部温度", 31.6 + wave * 0.3, "°C"),
      point("insulation", "绝缘阻抗", 1.86 + wave * 0.02, "MΩ"),
      point("powerFactor", "功率因数", 0.996, ""),
      point("power", "有功功率", power, "kW"),
      point("reactive", "无功功率", power * 0.08, "kvar"),
      point("frequency", "交流频率", 50 + wave * 0.02, "Hz"),
      point("efficiency", "转换效率", 97.8 + wave * 0.1, "%"),
    ];
    let points: DevicePoint[];
    if (seed.kind === "battery") {
      points = [point("soc", "SOC", Math.max(0, Math.min(100, station.soc + wave)), "%"), point("soh", "SOH", 98.2, "%"), ...electrical.slice(0, 2), point("temperature", "最高单体温度", 34.6 + wave * 0.6, "°C"), point("tempDelta", "电芯温差", seed.id === "RACK-02" ? 6.8 + wave * 0.1 : 2.4 + wave * 0.1, "°C"), point("cellVoltage", "最高单体电压", 3.32 + wave * 0.02, "V"), point("insulation", "绝缘阻抗", 1.86, "MΩ"), point("power", "充放电功率", power, "kW"), point("cycles", "循环次数", 386 + index, "次")];
    } else if (seed.kind === "fire") {
      points = [point("temperature", "舱内温度", 26.4 + wave * 0.2, "°C"), point("smoke", "烟雾浓度", 0.02, "%/m"), point("co", "CO 浓度", 2.1 + wave * 0.2, "ppm"), point("h2", "H2 浓度", 1.2, "ppm"), point("pressure", "消防瓶压力", 5.6, "MPa"), point("voltage", "供电电压", 24.1, "V"), point("humidity", "相对湿度", 46 + wave, "%"), point("loop", "回路电阻", 2.3, "Ω")];
    } else if (seed.kind === "hvac") {
      points = [point("temperature", "送风温度", 22.4 + wave * 0.2, "°C"), point("returnTemperature", "回风温度", 27.2 + wave * 0.3, "°C"), point("humidity", "相对湿度", 48 + wave, "%"), point("pressure", "制冷剂压力", 1.25, "MPa"), point("speed", "风机转速", 1450 + wave * 12, "rpm"), point("power", "输入功率", 4.2 + wave * 0.1, "kW"), point("current", "输入电流", 6.4, "A"), point("voltage", "供电电压", 400 + wave, "V")];
    } else if (seed.kind === "meter") {
      points = [point("power", "有功功率", station.activePower * (index === 5 ? 0.84 : 1) + wave * 5, "kW"), ...electrical.slice(2, 5), point("currentA", "A相电流", station.activePower * 1000 / (Math.sqrt(3) * 400), "A"), point("frequency", "电网频率", 50 + wave * 0.02, "Hz"), point("powerFactor", "功率因数", 0.986, ""), point("energy", "正向有功电量", 128650 + index * 100, "kWh")];
    } else points = electrical;
    const primaryPointId = seed.kind === "battery" ? "soc" : ["fire", "hvac"].includes(seed.kind) ? "temperature" : "power";
    const primary = points.find((item) => item.id === primaryPointId)!;
    const rated = seed.kind === "pcs" ? station.ratedPower / 2 : seed.kind === "battery" ? station.storageCapacity * 1000 / 2 : seed.kind === "meter" ? station.ratedPower : seed.kind === "hvac" ? 30 : 24;
    const alarms: StationDevice["alarms"] = station.alarmHistory !== undefined
      ? station.alarmHistory.filter((alarm) => alarm.device === seed.id).map((alarm) => ({ id: alarm.id, title: alarm.title, severity: alarm.severity, active: alarm.status === "active", at: alarm.occurredAt }))
      : seed.id === "RACK-02" ? [{ id: "ALM-2048", title: "电池簇温差偏高", severity: "warning", active: true, at: eventDay.toISOString() }]
        : seed.id === "PCS-01" ? [{ id: "ALM-2026", title: "PCS 通信抖动", severity: "warning", active: false, at: eventDay.toISOString() }] : [];
    const offline = station.status === "offline" || station.dataStatus === "disconnected";
    const status: DeviceStatus = offline ? "offline" : alarms.some((alarm) => alarm.active) ? "warning" : "online";
    const lookup = (id: string) => formatPoint(points.find((item) => item.id === id));
    return {
      id: seed.id, name: seed.name, code: `DEV-${station.code}-${seed.id}`, group: seed.group, status,
      model: seed.model, serial: `SN-${seed.id}-${station.id.padStart(3, "0")}-8826`, firmware: seed.kind === "pcs" ? "V3.8.2" : "V2.6.1",
      commissionedAt: "2026-03-16", updatedAt: new Date(offline ? now - 7200000 : now).toISOString(), latencyMs: offline ? null : 26 + index * 3,
      primaryPointId,
      points: offline ? points.map((item) => ({ ...item, value: null, quality: "bad" })) : points,
      trend: offline ? [] : Array.from({ length: 31 }, (_, sample) => ({ at: new Date(now - (30 - sample) * 2000).toISOString(), value: Number((primary.value! + Math.sin((sample - 30) / 2.5) * (primary.unit === "kW" ? 24 : 0.8)).toFixed(2)), target: primary.unit === "kW" ? Math.round(station.activePower * 0.5) : primary.value })),
      operation: offline ? [{ label: "工作状态", value: "离线" }] : [{ label: "工作状态", value: seed.kind === "pcs" ? "并网运行" : seed.kind === "hvac" ? "自动制冷" : seed.kind === "fire" ? "自动监测" : "正常运行" }, ...points.filter((item) => [primaryPointId, "reactive", "voltageA", "dcVoltage", "efficiency", "soh", "smoke", "humidity", "powerFactor"].includes(item.id)).slice(0, 5).map((item) => ({ label: item.label, value: formatPoint(item), pointId: item.id }))],
      limits: [{ label: seed.kind === "battery" ? "额定容量" : seed.kind === "fire" ? "额定电压" : "额定功率", value: `${Number(rated.toFixed(2))} ${seed.kind === "battery" ? "kWh" : seed.kind === "fire" ? "V" : "kW"}` }, { label: "当前冗余", value: seed.kind === "pcs" ? `${Math.max(0, rated - power).toFixed(2)} kW` : "--" }, { label: "运行温度", value: "-20 ~ 55 °C" }, { label: "防护等级", value: "IP54" }, { label: "当前限制", value: status === "warning" ? "告警保护监测中" : "无" }, { label: "控制来源", value: seed.kind === "pcs" ? "运行策略 V3.8" : "本地自动控制" }],
      parameters: [{ label: "设备地址", value: String(index + 1) }, { label: "通信协议", value: "Modbus TCP" }, { label: "采集周期", value: "2 s" }, { label: "通信超时", value: "5 s" }, { label: "设备额定值", value: `${Number(rated.toFixed(2))}` }, { label: "额定频率", value: ["fire", "battery"].includes(seed.kind) ? "不适用" : "50 Hz" }, { label: "当前测量值", value: offline ? "--" : lookup(primaryPointId) }, { label: "控制权限", value: "远程 / 本地互锁" }],
      upstream: seed.kind === "battery" ? "PCS-01 / PCS-02" : seed.kind === "pcs" ? "站点交流母线 / PCC" : "站点辅助配电系统",
      downstream: seed.kind === "pcs" ? "BMS-01 / 电池簇 01-02" : seed.kind === "battery" ? "电池模组 / 单体电芯" : seed.kind === "meter" ? "计量采集网关" : "储能舱",
      alarms,
      versions: [{ version: seed.kind === "pcs" ? "V3.8.2" : "V2.6.1", at: "2026-08-26T10:30:00+08:00", note: "优化通信稳定性与采集质量", current: true }, { version: seed.kind === "pcs" ? "V3.8.1" : "V2.6.0", at: "2026-06-18T09:00:00+08:00", note: "设备运行参数更新", current: false }],
      logs: [{ at: "2026-08-26T10:30:00+08:00", action: "固件升级", operator: station.manager || "系统管理员", result: "成功" }, { at: "2026-08-25T15:12:00+08:00", action: "同步设备参数", operator: "采集服务", result: "成功" }, { at: "2026-03-16T08:00:00+08:00", action: "设备投运", operator: station.manager || "系统管理员", result: "成功" }],
    };
  });
}

/** Only an unambiguous explicit role may supply stored energy-flow values. */
export function semanticPoint(devices: StationDevice[], semanticKey: string): DevicePoint | undefined {
  const matches=devices.flatMap(device=>device.points.filter(point=>point.semanticKey===semanticKey).map(point=>({device,point})));
  if(matches.length===1)return matches[0].point;
  if(['soc','soh','batteryPower'].includes(semanticKey)){
    const stacks=matches.filter(({device})=>deviceTypeFromSource(device.sourceType)==='battery-stack');
    if(stacks.length===1&&matches.every(({device})=>device.id===stacks[0].device.id||deviceTypeFromSource(device.sourceType)==='battery-cluster'&&device.parentDeviceId===stacks[0].device.id))return stacks[0].point;
  }
  return undefined;
}
export function lastKnownNumber(point?: DevicePoint): number | null {
  const fresh=pointValue(point);
  if(fresh!==null)return fresh;
  if(point?.valueType && point.valueType!=='number')return null;
  if(point?.sourceType!=='stored_device'||point.lastKnownValue===undefined||point.lastKnownValue.trim()==='')return null;
  const value=Number(point.lastKnownValue);return Number.isFinite(value)?value:null;
}

/** Resolve overview fields within the selected physical device, never by a label guess. */
export function deviceMetricPoint(device: StationDevice | undefined, metric: string): DevicePoint | undefined {
  if(!device)return undefined;
  const native=device.points.find(point=>point.metric===metric||point.id===metric);
  if(native)return native;
  const dcDevice=['battery-cluster','battery-stack','pcs','cabinet'].includes(deviceTypeFromSource(device.sourceType));
  const key=dcDevice?({dcVoltage:'voltage',dcCurrent:'current'} as Record<string,string>)[metric]??metric:metric;
  const matches=device.points.filter(point=>point.semanticKey===key||metric==='power'&&['pcsPower','batteryPower','gridPower','loadPower','pvPower'].includes(point.semanticKey??''));
  return matches.length===1?matches[0]:undefined;
}
