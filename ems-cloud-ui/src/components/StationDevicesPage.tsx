import { localized as __locale } from '@/preferences/date'
import {ReferenceDeviceSamples} from './ReferenceDeviceSamples'
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { DEMO_MODE } from "@/api/client"
import {loadDeviceDetail,loadDeviceRealtime,loadDeviceHistory,loadDeviceCells,loadDeviceAlarms,saveDeviceConfiguration} from '@/api/deviceDetails'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {adaptHistoryBucket,type HistoryBucket} from './apiAnalytics'
import "./station-devices-figma.css"
import {
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  Search,
  Server,
  X,
} from "lucide-react"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { Station } from "@/App"

import { stationDataNow } from "@/data/dataClock"

import {
  DEVICE_STATUS_LABEL,
  demoStationDevices,
  formatPoint,
  pointValue,
  type DeviceField,
  type DevicePoint,
  type DeviceStatus,
  type StationDevice,
  DEVICE_TYPES,DEVICE_SCHEMAS,deviceTypeFromSource,detailPoint,cellGroups,deviceHistoryChart,
  type DeviceType,type DeviceDetail,type DeviceConfiguration,
} from "@/data/stationDevices"

const archiveText=(value:unknown)=>value==null||value===''||value==='—'||value==='--'?'未采集':String(value)

type DeviceTab = "概况" | "参数" | "告警" | "版本" | "操作记录"

const TABS: DeviceTab[] = ["概况", "告警", "操作记录"]
const timeText = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? __locale(new Date(value), 'toLocaleTimeString', "zh-CN", { hour12: false })
    : "--"

const dateText = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? __locale(new Date(value), 'toLocaleString', "zh-CN", { hour12: false })
    : "--"

function StatusBadge({ status }: { status: DeviceStatus }) {
  return (
    <span className={`device-status device-status--${status}`}>
      <i />
      {DEVICE_STATUS_LABEL[status]}
    </span>
  )
}

function DeviceFields({
  fields,
  points,
}: {
  fields: DeviceField[]
  points?: DevicePoint[]
}) {
  return (
    <dl className="device-fields">
      {fields.map((field, index) => (
        <div key={`${field.label}-${index}`}>
          <dt>{field.label}</dt>
          <dd>
            {field.pointId
              ? formatPoint(points?.find((point) => point.id === field.pointId))
              : field.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function DeviceDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      className="device-dialog"
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="device-icon-button"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="device-dialog-body">{children}</div>
    </dialog>
  )
}

function PointsTable({ points }: { points: DevicePoint[] }) {
  return (
    <div className="device-points-table">
      <table>
        <thead>
          <tr>
            <th>测点</th>
            <th>当前值</th>
            <th>质量</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const valid = point.quality === 'good'

            return (
              <tr key={point.id}>
                <td>{point.label}</td>
                <td>{formatPoint(point)}</td>
                <td className={valid ? "device-good" : "device-bad"}>
                  {valid ? "有效" : "无效 / 缺失"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!points.length && <div className="device-empty">暂无测点数据</div>}
    </div>
  )
}

function DeviceDetails({
  device,
  station,
  isDemo,
}: {
  device: StationDevice
  station: Station
  isDemo: boolean
}) {
  const [tab, setTab] = useState<DeviceTab>("概况")

  const [archiveOpen, setArchiveOpen] = useState(false)

  const [alarmPreview, setAlarmPreview] =
    useState<StationDevice["alarms"][number] | null>(null)

  const good = device.points.filter(
    (point) => pointValue(point) !== null,
  ).length

  const quality = device.points.length
    ? `${((good / device.points.length) * 100).toFixed(1)}%`
    : "--"

  const activeAlarms = device.alarms.filter((alarm) => alarm.active)

  const identity: DeviceField[] = [
    { label: "型号", value: device.model },
    { label: "序列号", value: device.serial },
    { label: "固件", value: device.firmware },
    { label: "投运日期", value: device.commissionedAt },
  ]

  return (
    <section className="device-details" aria-label="所选设备详情">
      <header className="device-detail-heading">
        <h2>{device.name}</h2>
        <StatusBadge status={device.status} />
      </header>
      <p className="device-sync">
        最近采集 {timeText(device.updatedAt)}{" "}
        <span>
          · 延迟 {device.latencyMs === null ? "--" : `${device.latencyMs} ms`}
        </span>
        <span>· 质量 {quality}</span>
      </p>
      <div className="device-tabs" role="tablist" aria-label="设备信息标签">
        {TABS.map((item) => (
          <button
            type="button"
            key={item}
            role="tab"
            aria-selected={item === tab}
            aria-controls="device-tab-panel"
            id={`device-tab-${item}`}
            onClick={() => setTab(item)}
          >
            {item === "操作记录" ? "控制记录" : item}
            {item === "告警" && activeAlarms.length > 0 && (
              <span>{activeAlarms.length}</span>
            )}
          </button>
        ))}
      </div>
      <div
        id="device-tab-panel"
        role="tabpanel"
        aria-labelledby={`device-tab-${tab}`}
        className="device-tab-content"
      >
        {tab === "概况" && (
          <>
            <section className="device-info-band device-info-band--tinted">
              <h3>设备档案</h3>
              <DeviceFields
                fields={[
                  {
                    label: "生产厂家",
                    value:
                      device.parameters.find((item) =>
                        /厂家|制造商/.test(item.label),
                      )?.value || "—",
                  },
                  ...identity,
                  { label: "设备编号", value: device.code },
                ]}
              />
            </section>
            <section className="device-info-band device-info-band--tinted">
              <h3>厂家额定参数</h3>
              <DeviceFields
                fields={
                  device.limits.length
                    ? device.limits
                    : [
                        { label: "额定功率", value: "—" },
                        { label: "额定电压", value: "—" },
                        { label: "额定电流", value: "—" },
                        { label: "额定频率", value: "—" },
                      ]
                }
              />
            </section>
          </>
        )}
        {tab === "参数" && (
          <section className="device-info-band">
            <div className="device-section-title">
              <h3>设备运行参数</h3>
              <span>共 {device.parameters.length} 项</span>
            </div>
            <div className="device-table-scroll">
              <table className="device-record-table">
                <thead>
                  <tr>
                    <th>参数名称</th>
                    <th>当前值</th>
                  </tr>
                </thead>
                <tbody>
                  {device.parameters.map((parameter, index) => (
                    <tr key={index}>
                      <td>{parameter.label}</td>
                      <td>{parameter.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!device.parameters.length && (
              <div className="device-empty">暂无参数数据</div>
            )}
          </section>
        )}
        {tab === "告警" && (
          <section className="device-info-band">
            <div className="device-table-scroll">
              <table className="device-record-table">
                <thead>
                  <tr>
                    {["等级", "告警内容", "发生时间", "状态", "操作"].map(
                      (label) => (
                        <th key={label}>{label}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {device.alarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>{alarm.severity === "critical" ? "严重" : "一般"}</td>
                      <td>{alarm.title}</td>
                      <td>{dateText(alarm.at)}</td>
                      <td>{alarm.active ? "活动" : "已恢复"}</td>
                      <td>
                        <button
                          className="device-link"
                          onClick={() => setAlarmPreview(alarm)}
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!device.alarms.length && (
                <div className="device-empty">暂无关联告警</div>
              )}
            </div>
          </section>
        )}
        {tab === "版本" && (
          <section className="device-info-band">
            <h3>固件版本记录</h3>
            {device.versions.length ? (
              <ol className="device-version-list">
                {device.versions.map((version) => (
                  <li key={`${version.version}-${version.at}`}>
                    <div>
                      <strong>{version.version}</strong>
                      {version.current && (
                        <span className="device-version-current">当前版本</span>
                      )}
                      <time>{dateText(version.at)}</time>
                    </div>
                    <p>{version.note}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="device-empty">暂无版本记录</div>
            )}
          </section>
        )}
        {tab === "操作记录" && (
          <section className="device-info-band">
            <h3>操作记录</h3>
            <div className="device-table-scroll">
              <table className="device-record-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作</th>
                    <th>操作人</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {device.logs.map((log, index) => (
                    <tr key={index}>
                      <td>{dateText(log.at)}</td>
                      <td>{log.action}</td>
                      <td>{log.operator}</td>
                      <td>{log.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!device.logs.length && (
              <div className="device-empty">暂无操作记录</div>
            )}
          </section>
        )}
      </div>
      <footer>
        <button
          type="button"
          className="device-action"
          onClick={() => setArchiveOpen(true)}
        >
          查看完整设备档案
          <ArrowRight size={14} />
        </button>
      </footer>
      {alarmPreview && (
        <DeviceDialog
          title="设备告警详情"
          onClose={() => setAlarmPreview(null)}
        >
          <h3>{alarmPreview.title}</h3>
          <DeviceFields
            fields={[
              { label: "告警编号", value: alarmPreview.id },
              { label: "设备", value: device.name },
              { label: "发生时间", value: dateText(alarmPreview.at) },
              {
                label: "级别",
                value: alarmPreview.severity === "critical" ? "严重" : "一般",
              },
              { label: "状态", value: alarmPreview.active ? "活动" : "已恢复" },
            ]}
          />
        </DeviceDialog>
      )}
      {archiveOpen && (
        <DeviceDialog
          title={`${device.name} · 完整设备档案`}
          onClose={() => setArchiveOpen(false)}
        >
          <p className="device-archive-source">
            {station.name} · {isDemo ? "示例设备档案" : "已接入设备档案"}
          </p>
          <DeviceFields
            fields={[
              ...identity,
              { label: "设备编号", value: device.code },
              { label: "所属系统", value: device.group },
              { label: "运行状态", value: DEVICE_STATUS_LABEL[device.status] },
              { label: "站点", value: station.name },
              { label: "安装地址", value: station.address || "--" },
              { label: "负责人", value: station.manager || "--" },
              { label: "联系电话", value: station.phone || "--" },
              { label: "最近采集", value: dateText(device.updatedAt) },
            ]}
          />
          <h3 className="device-archive-heading">能力与运行边界</h3>
          <DeviceFields fields={device.limits} />
          <h3 className="device-archive-heading">运行参数</h3>
          <DeviceFields fields={device.parameters} />
          <h3 className="device-archive-heading">实时测点</h3>
          <PointsTable points={device.points} />
          <h3 className="device-archive-heading">固件版本记录</h3>
          {device.versions.length ? (
            device.versions.map((version) => (
              <p key={version.version + version.at}>
                {version.version} · {dateText(version.at)} · {version.note}
              </p>
            ))
          ) : (
            <p>暂无版本记录</p>
          )}
        </DeviceDialog>
      )}
    </section>
  )
}

const THEORY_LABELS:Record<string,string>={ratedPowerKw:'额定功率 (kW)',capacityKwh:'额定容量 (kWh)',loopNum:'理论循环次数',theorySoh:'理论 SOH (%)'}
function LiveDeviceDetails({device,station}:{device:StationDevice;station:Station}) {
  const {user}=useAuth()
  const [detail,setDetail]=useState<DeviceDetail|null>(null)
  const [observations,setObservations]=useState<Record<string,unknown>[]>([])
  const [cells,setCells]=useState<{known:boolean;unknownReason:string;values:Record<string,unknown>[]}|null>(null)
  const [cellError,setCellError]=useState('')
  const [error,setError]=useState(''),[telemetryError,setTelemetryError]=useState(''),[notice,setNotice]=useState('')
  const [tab,setTab]=useState('概况'),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false)
  const [configuration,setConfiguration]=useState<DeviceConfiguration>({version:0,selectedPointIds:[],theoryValues:{}})
  const [from,setFrom]=useState(()=>new Date(Date.now()-86400000).toISOString().slice(0,16))
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,16))
  const [histories,setHistories]=useState<{point:DevicePoint;rows:HistoryBucket[]}[]>([])
  const [historyBusy,setHistoryBusy]=useState(false),[historyError,setHistoryError]=useState('')
  const [alarms,setAlarms]=useState<{items:Record<string,unknown>[];total:number}|null>(null)
  const [alarmOffset,setAlarmOffset]=useState(0),[alarmError,setAlarmError]=useState(''),[alarmBusy,setAlarmBusy]=useState(false)
  const [revision,setRevision]=useState(0)
  const canTelemetry=hasStationPermission(user,station.id,'telemetry.read')
  const canEdit=hasStationPermission(user,station.id,'asset.edit')
  const canAlarm=hasStationPermission(user,station.id,'alarm.read')
  const historyAbort=useRef<AbortController|null>(null)
  useEffect(()=>{
    const controller=new AbortController();setAlarms(null);setAlarmError('')
    if(tab!=='告警'||!canAlarm)return ()=>controller.abort()
    setAlarmBusy(true);loadDeviceAlarms(station.id,device.id,alarmOffset,controller.signal).then(value=>{if(!controller.signal.aborted)setAlarms(value)})
      .catch(e=>{if(!controller.signal.aborted)setAlarmError(e.message)}).finally(()=>{if(!controller.signal.aborted)setAlarmBusy(false)})
    return ()=>controller.abort()
  },[station.id,device.id,tab,canAlarm,alarmOffset,user])
  useEffect(()=>{
    const controller=new AbortController();setCells(null);setCellError('')
    if(!canTelemetry||!detail||!['battery-cluster','battery-stack'].includes(detail.type))return ()=>controller.abort()
    loadDeviceCells(device.id,controller.signal).then(value=>{if(!controller.signal.aborted)setCells(value)})
      .catch(e=>{if(!controller.signal.aborted)setCellError(e.message)})
    return ()=>controller.abort()
  },[device.id,canTelemetry,detail?.type,user])
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setDetail(null);setError('');setHistories([]);setHistoryError('')
    loadDeviceDetail(station.id,device.id,controller.signal).then(value=>{if(controller.signal.aborted)return;setDetail(value);setConfiguration(value.configuration)})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>{controller.abort();historyAbort.current?.abort()}
  },[station.id,device.id,revision,user])
  useEffect(()=>{
    const controller=new AbortController();setObservations([]);setTelemetryError('')
    if(!canTelemetry)return ()=>controller.abort()
    let inFlight=false
    const refresh=async()=>{if(inFlight)return;inFlight=true;try{const value=await loadDeviceRealtime(station.id,device.id,controller.signal);if(!controller.signal.aborted){setObservations(value.items);setTelemetryError('')}}catch(e){if(!controller.signal.aborted){setObservations([]);setTelemetryError(e instanceof Error?e.message:'实时查询失败')}}finally{inFlight=false}}
    void refresh();const timer=window.setInterval(refresh,15000)
    return ()=>{controller.abort();window.clearInterval(timer)}
  },[station.id,device.id,canTelemetry,user])
  async function save(){
    if(saving)return;setSaving(true);setNotice('')
    try{await saveDeviceConfiguration(station.id,device.id,configuration);const value=await loadDeviceDetail(station.id,device.id);setDetail(value);setConfiguration(value.configuration);setNotice('本地配置已保存并回读')}
    catch(e){setNotice(e instanceof Error?e.message:'保存失败')}finally{setSaving(false)}
  }
  async function queryHistory(){
    historyAbort.current?.abort();const controller=new AbortController();historyAbort.current=controller
    setHistoryBusy(true);setHistoryError('');setHistories([])
    try{const selected=points.filter(p=>configuration.selectedPointIds.includes(Number(p.id)));if(!selected.length)throw new Error('请先选择历史曲线参数')
      if(new Set(selected.map(p=>p.unit).filter(Boolean)).size>4)throw new Error('历史参数最多包含4种单位')
      const values=await Promise.all(selected.map(async point=>({point,rows:(await loadDeviceHistory(point.id,new Date(from+'Z'),new Date(to+'Z'),controller.signal)).map(adaptHistoryBucket)})))
      if(!controller.signal.aborted)setHistories(values)
    }catch(e){if(!controller.signal.aborted)setHistoryError(e instanceof Error?e.message:'历史查询失败')}finally{if(!controller.signal.aborted)setHistoryBusy(false)}
  }
  if(loading)return <section className="device-details"><div role="status" className="device-empty">正在读取设备档案…</div></section>
  if(error||!detail)return <section className="device-details"><p role="alert">{error||'设备档案不可用'}</p><button className="device-action" onClick={()=>setRevision(v=>v+1)}>重试</button></section>
  const schema=DEVICE_SCHEMAS[detail.type]??DEVICE_SCHEMAS.other
  const points=detail.points.map(p=>detailPoint(p,observations.find(o=>String(o.pointId)===String(p.id))))
  const archive=detail.archive
  const archiveValue=(key:string)=>archiveText(archive[key])
  const tabs=['概况',...(canTelemetry?['实时参数','历史曲线']:[]),'连接关系',...(canAlarm?['告警']:[]),'版本','操作记录','本地配置']
  const selectedPoints=new Set(configuration.selectedPointIds)
  const matched=new Set(schema.match.flatMap(regex=>points.filter(p=>regex.test(p.label)).map(p=>p.id)))
  return <section className="device-details" aria-label="所选设备详情">
    <header className="device-detail-heading"><h2>{device.name}</h2><StatusBadge status={device.status}/><span>{schema.label}</span></header>
    <p className="device-sync">{archiveValue('manufacturer')} · {archiveValue('model')} · 本系统最近上报 {archive.observed_at?dateText(String(archive.observed_at)):'未接入'}；QUDEOX 导入值见实时参数和历史曲线。</p>
    <div className="device-tabs" style={{overflowX:'auto',flexShrink:0}} role="tablist" aria-label="设备信息标签">{tabs.map(item=><button key={item} role="tab" aria-selected={tab===item} onClick={()=>setTab(item)}>{item}</button>)}</div>
    <div className="device-tab-content" role="tabpanel" aria-label={tab}>
      {tab==='概况'&&<>
        <section className="device-info-band device-info-band--tinted"><h3>{schema.label}档案</h3><DeviceFields fields={[
          {label:'所属站点',value:station.name},{label:'设备类型',value:schema.label},{label:'生产厂家',value:archiveValue('manufacturer')},{label:'型号',value:archiveValue('model')},{label:'设备序列号',value:archiveValue('serial_number')},
          {label:'设备编号',value:archiveValue('code')},{label:'来源类型',value:archiveValue('source_type')},{label:'当前固件',value:archiveValue('firmware_version')},
        ]}/></section>
        <section className="device-info-band device-info-band--tinted"><h3>厂家额定参数</h3><DeviceFields fields={[
          {label:'额定功率',value:archive.rated_power_kw==null?'未采集':`${archive.rated_power_kw} kW`},{label:'额定容量',value:archive.capacity_kwh==null?'未采集':`${archive.capacity_kwh} kWh`},
        ]}/></section>
        <section className="device-info-band"><h3>分类数据范围</h3><p>{schema.sections.join(' · ')}</p><p className="device-sync">未接入的测点与采样保留空态。硬件控制、固件下发与完整电芯分析尚未接入。</p></section>
      </>}
      {tab==='实时参数'&&<>
        {canTelemetry&&<ReferenceDeviceSamples key={`${station.id}/${device.id}`} station={station.id} device={device.id} battery={['battery-cluster','battery-stack'].includes(detail.type)}/>}
        <h3>本系统实时采集</h3>
        {telemetryError&&<p role="alert">{telemetryError}</p>}
        {schema.sections.map((section,index)=><section className="device-info-band" key={section}><h3>{section}</h3><PointsTable points={points.filter(p=>schema.match[index].test(p.label))}/>
          {section==='下属电池簇'&&<DeviceFields fields={detail.connections.filter(c=>c.direction==='downstream').map(c=>({label:String(c.name),value:String(c.serial_number??'—')}))}/>}</section>)}
        {['battery-cluster','battery-stack'].includes(detail.type)&&<section className="device-info-band"><h3>单体数组采样</h3>{cellError&&<p role="alert">{cellError}</p>}
          {!cells?.known&&<div className="device-empty">暂无已确认布局与单体采样{cells?.unknownReason?` (${cells.unknownReason})`:''}</div>}
          {cells?.values.map((row,index)=><div key={index}><h4>{String(row.kind)} · {String(row.quality)}{row.staleReason?' · 采样已过期':''}</h4>{cellGroups(row).map(group=><div key={group.slot}><p>BMU {group.slot}</p><div className="grid grid-cols-6 gap-2 my-2">{group.values.map((value,i)=><div key={i} className="border rounded p-2 text-xs"><span>{i+1}</span><strong className="block">{value}</strong></div>)}</div></div>)}</div>)}
        </section>}
        {points.some(p=>!matched.has(p.id))&&<section className="device-info-band"><h3>其他已登记参数</h3><PointsTable points={points.filter(p=>!matched.has(p.id))}/></section>}
      </>}
      {tab==='历史曲线'&&<section className="device-info-band">
        {canTelemetry&&<ReferenceDeviceSamples key={`${station.id}/${device.id}/history`} station={station.id} device={device.id} history/>}
        <h3>本系统历史曲线参数</h3>
        <p className="device-sync">选择最多12项、4种单位；保存后再次登录仍可使用。时间使用 UTC，范围最多31天；显示最后采样及数据质量。</p>
        <div className="flex flex-wrap gap-3 my-3">{points.map(p=><label key={p.id} className="flex items-center gap-1"><input type="checkbox" checked={selectedPoints.has(Number(p.id))} onChange={e=>{setHistories([]);setConfiguration(c=>({...c,selectedPointIds:e.target.checked?[...c.selectedPointIds,Number(p.id)].slice(0,12):c.selectedPointIds.filter(id=>id!==Number(p.id))}))}}/>{p.label} ({p.unit||'无单位'})</label>)}</div>
        {!points.length&&<div className="device-empty">暂无已登记测点，无法查询历史</div>}
        <div className="flex flex-wrap gap-3 my-3"><label>起始时间 (UTC)<input aria-label="历史起始时间 UTC" type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>结束时间 (UTC)<input aria-label="历史结束时间 UTC" type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label>
          <button className="device-action" disabled={historyBusy||!configuration.selectedPointIds.length} onClick={queryHistory}>{historyBusy?'查询中…':'查询历史'}</button>
          {canEdit&&<button className="device-action" disabled={saving} onClick={save}>保存参数选择</button>}</div>
        {historyError&&<p role="alert">{historyError}</p>}
        {histories.map(({point,rows})=><section className="device-info-band" key={point.id}><h3>{point.label} ({point.unit||'无单位'})</h3>
          {rows.some(r=>r.value!==null)&&<div style={{height:220}}><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={deviceHistoryChart(rows)}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="timestamp" tickFormatter={v=>timeText(new Date(v).toISOString())}/><YAxis/><Tooltip labelFormatter={v=>dateText(new Date(Number(v)).toISOString())}/><Line dataKey="value" stroke="#267d68" dot={false} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>}
          {rows.length?<div className="device-table-scroll"><table className="device-record-table"><thead><tr><th>采样时间</th><th>原始值</th><th>质量</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{dateText(new Date(r.timestamp).toISOString())}</td><td>{String(r.exactValue??'—')}</td><td>{r.quality??'unknown'}</td></tr>)}</tbody></table></div>:<div className="device-empty">所选范围暂无历史采样</div>}
        </section>)}
      </section>}
      {tab==='连接关系'&&<section className="device-info-band"><h3>已登记连接关系</h3>{detail.connections.length?<div className="device-table-scroll"><table className="device-record-table"><thead><tr><th>方向</th><th>设备</th><th>序列号</th><th>依据</th></tr></thead><tbody>{detail.connections.map((c,i)=><tr key={i}><td>{c.direction==='upstream'?'上级':'下级'}</td><td>{String(c.name)}</td><td>{String(c.serial_number??'—')}</td><td>{c.source==='imported_inventory'?'导入档案关系（非实时连接）':'站点连接档案'}</td></tr>)}</tbody></table></div>:<div className="device-empty">暂无已登记连接关系</div>}</section>}
      {tab==='告警'&&<section className="device-info-band"><h3>关联告警</h3>{alarmBusy&&<p role="status">正在读取告警…</p>}{alarmError&&<p role="alert">{alarmError}</p>}
        {!!alarms?.items.length&&<div className="device-table-scroll"><table className="device-record-table"><thead><tr><th>等级</th><th>告警内容</th><th>来源</th><th>发生时间</th><th>生命周期</th><th>确认</th></tr></thead><tbody>{alarms.items.map(a=><tr key={String(a.id)}><td>{a.severity==='critical'?'严重':a.severity==='warning'?'一般':'提示'}</td><td>{String(a.title)}</td><td>{a.source==='rule'?'规则':'设备'}</td><td>{dateText(String(a.occurred_at))}</td><td>{a.lifecycle==='closed'?'人工关闭':a.lifecycle==='recovered'?'已恢复':'活动'}</td><td>{a.acknowledged_at?'已确认':'未确认'}</td></tr>)}</tbody></table></div>}
        {!alarmBusy&&!alarmError&&alarms&&!alarms.items.length&&<div className="device-empty">暂无关联告警</div>}
        {alarms&&<div className="flex items-center gap-3 my-3"><span>共 {alarms.total} 条</span><button className="device-action" disabled={alarmBusy||alarmOffset===0} onClick={()=>setAlarmOffset(v=>Math.max(0,v-20))}>上一页</button><button className="device-action" disabled={alarmBusy||alarmOffset+20>=alarms.total} onClick={()=>setAlarmOffset(v=>v+20)}>下一页</button></div>}
      </section>}
      {tab==='版本'&&<section className="device-info-band"><h3>固件版本记录</h3><p>当前上报版本：{archiveValue('firmware_version')}</p>{detail.firmwareRecords.map(f=><p key={String(f.id)}>{String(f.target_version)} · {String(f.status)} · {dateText(String(f.updated_at))}</p>)}{!detail.firmwareRecords.length&&<div className="device-empty">暂无固件任务记录</div>}<p className="device-sync">固件下发能力尚未接入。</p></section>}
      {tab==='操作记录'&&<section className="device-info-band"><h3>本地配置记录</h3>{detail.logs.length?<div className="device-table-scroll"><table className="device-record-table"><thead><tr><th>时间</th><th>操作</th><th>操作人 ID</th><th>版本</th><th>结果</th></tr></thead><tbody>{detail.logs.map(log=><tr key={String(log.id)}><td>{dateText(String(log.occurred_at))}</td><td>{String(log.action)}</td><td>{String(log.actor_id)}</td><td>{String(log.version)}</td><td>{String(log.result)}</td></tr>)}</tbody></table></div>:<div className="device-empty">暂无本地配置记录</div>}<p className="device-sync">真实设备控制日志尚未接入。</p></section>}
      {tab==='本地配置'&&<section className="device-info-band"><h3>本地档案与分析参数</h3><p className="device-sync">仅保存平台本地配置；不会向设备下发，不改变设备实际参数。当前版本 {configuration.version}。</p>
        {detail.theoryFields.map(key=><label key={key} className="flex items-center gap-3 my-3">{THEORY_LABELS[key]??key}<input aria-label={THEORY_LABELS[key]??key} type="number" disabled={!canEdit||saving} min={key==='loopNum'?1000:0} max={key==='loopNum'?20000:key==='theorySoh'?100:1000000000} step={key==='loopNum'?1:0.01} value={configuration.theoryValues[key]??''} onChange={e=>setConfiguration(c=>{const values={...c.theoryValues};if(e.target.value==='')delete values[key];else values[key]=Number(e.target.value);return {...c,theoryValues:values}})}/></label>)}
        {!detail.theoryFields.length&&<p>该类型暂无已明确的可编辑本地档案参数，可在历史曲线选择测点。</p>}
        {canEdit?<button className="device-action" disabled={saving} onClick={save}>{saving?'保存中…':'保存本地配置'}</button>:<p>当前账号仅可查看配置。</p>}
      </section>}
    </div><p role="status">{notice}</p>
  </section>
}

function RealtimePoints({
  device,
  now,
}: {
  device: StationDevice
  now: number
}) {
  const [allOpen, setAllOpen] = useState(false)

  const [query, setQuery] = useState("")

  const primary = device.points.find(
    (point) => point.id === device.primaryPointId,
  )

  const rows = device.trend
    .map((sample) => ({
      timestamp: Date.parse(sample.at),
      value:
        typeof sample.value === "number" && Number.isFinite(sample.value)
          ? sample.value
          : null,
      target:
        typeof sample.target === "number" && Number.isFinite(sample.target)
          ? sample.target
          : null,
    }))
    .filter((sample) => Number.isFinite(sample.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)

  const age = Number.isFinite(Date.parse(device.updatedAt))
    ? Math.max(0, Math.round((now - Date.parse(device.updatedAt)) / 1000))
    : null

  return (
    <aside className="device-realtime" aria-label="实时测点">
      <header className="device-section-title">
        <h2>实时测点</h2>
        <span>
          {age === null
            ? "暂无采样"
            : age < 3
              ? "刚刚更新"
              : age < 60
                ? `${age} 秒前`
                : `${Math.floor(age / 60)} 分钟前`}
        </span>
      </header>
      <div className="device-power-chart">
        <div className="device-primary-reading">
          <div>
            <h3>{primary?.label ?? "运行趋势"}</h3>
            <strong data-device-primary>{formatPoint(primary)}</strong>
          </div>
          <span>
            {device.status === "offline"
              ? "离线"
              : rows.length > 1
                ? `${Math.round((rows[rows.length - 1].timestamp - rows[0].timestamp) / 1000)} 秒趋势`
                : "采样趋势"}
          </span>
        </div>
        {rows.some((row) => row.value !== null) ? (
          <div className="device-sparkline" data-device-chart={device.id}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={rows}
                margin={{ top: 8, left: 0, right: 0, bottom: 4 }}
              >
                <CartesianGrid vertical={false} stroke="#e5ecef" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  hide
                />
                <YAxis domain={["auto", "auto"]} hide />
                <Tooltip
                  labelFormatter={(value) =>
                    timeText(new Date(Number(value)).toISOString())
                  }
                  formatter={(value, name) => [
                    `${value} ${primary?.unit ?? ""}`,
                    name === "value" ? "实测值" : "参考值",
                  ]}
                  contentStyle={{ fontSize: 11, borderRadius: 5 }}
                />
                <Line
                  dataKey="value"
                  stroke="#4386b3"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="target"
                  stroke="#82949d"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="device-trend-empty">暂无趋势数据</div>
        )}
      </div>
      <PointsTable points={device.points.slice(0, 8)} />
      <footer>
        <button
          type="button"
          className="device-link"
          disabled={!device.points.length}
          onClick={() => {
            setQuery("")
            setAllOpen(true)
          }}
        >
          查看全部 {device.points.length} 个测点
          <ArrowRight size={13} />
        </button>
      </footer>
      {allOpen && (
        <DeviceDialog
          title={`${device.name} · 全部测点`}
          onClose={() => setAllOpen(false)}
        >
          <label className="device-search">
            <Search size={14} />
            <input
              aria-label="搜索测点"
              placeholder="搜索测点名称或编号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <PointsTable
            points={device.points.filter((point) =>
              `${point.id}${point.label}`
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
            )}
          />
        </DeviceDialog>
      )}
    </aside>
  )
}

export default function StationDevicesPage({
  station,
  initialDeviceId,
}: {
  station: Station
  initialDeviceId?: string
}) {
  const {user}=useAuth()
  const [view,setView]=useState<'list'|'detail'>('detail')
  const canExport=DEMO_MODE||hasStationPermission(user,station.id,'report.export')
  const [filter, setFilter] = useState<"all" | DeviceStatus>("all")

  const [search, setSearch] = useState("")

  const [selectedId, setSelectedId] = useState(initialDeviceId ?? "PCS-01")
  const [deviceType,setDeviceType]=useState<DeviceType|'all'>('all')
  const [now, setNow] = useState(() => stationDataNow(station).getTime())

  const [notice, setNotice] = useState("")

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(stationDataNow(station).getTime()),
      2000,
    )
    return () => window.clearInterval(timer)
  }, [station])

  const isDemo = DEMO_MODE && station.deviceInventory === undefined
  const devices = useMemo(
    () =>
      station.deviceInventory ??
      (DEMO_MODE ? demoStationDevices(station, now) : []),
    [station, now],
  )
  const filtered = devices.filter(
    (device) =>
      (filter === "all" || device.status === filter) &&
      (deviceType==='all'||deviceTypeFromSource(device.sourceType,device.group)===deviceType) &&
      `${device.name} ${device.code} ${device.serial}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  )

  const selected =
    filtered.find((device) => device.id === selectedId) ?? filtered[0] ?? null

  const directoryGroup=(device:StationDevice)=>isDemo?device.group:DEVICE_SCHEMAS[deviceTypeFromSource(device.sourceType,device.group)].label
  const groups = [...new Set(filtered.map(directoryGroup))]

  const filters: { id: "all" | DeviceStatus; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "online", label: "在线" },
    { id: "warning", label: "告警" },
    { id: "offline", label: "离线" },
    { id: "unknown", label: "未知" },
  ]

  function exportDevices() {
    if(!canExport)return
    const rows = [
      [
        "设备名称",
        "设备编号",
        "系统",
        "状态",
        "型号",
        "厂家",
        "额定功率(kW)",
        "额定容量(kWh)",
        "序列号",
        "固件",
        "投运日期",
        "采集时间",
        "测点",
        "当前值",
        "单位",
        "质量",
      ],
      ...filtered.flatMap((device) =>
        (device.points.length ? device.points : [null]).map((point) => [
          device.name,
          device.code,
          device.group,
          DEVICE_STATUS_LABEL[device.status],
          device.model,
          device.manufacturer??"",
          device.ratedPowerKw==null?"":String(device.ratedPowerKw),
          device.capacityKwh==null?"":String(device.capacityKwh),
          device.serial,
          device.firmware,
          device.commissionedAt,
          device.updatedAt,
          point?.label ?? "",
          pointValue(point ?? undefined) === null ? "" : String(point?.value),
          point?.unit ?? "",
          pointValue(point ?? undefined) === null ? "无效 / 缺失" : "有效",
        ]),
      ),
    ]

    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              `"${(/^[=+@\t\r]/.test(value) || (/^-/.test(value) && !Number.isFinite(Number(value))) ? "'" + value : value).replace(/"/g, '""')}"`,
          )
          .join(","),
      )
      .join("\r\n")

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    )

    const link = document.createElement("a")
    link.href = url
    link.download = `${station.code}-设备测点.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    setNotice(`已导出 ${filtered.length} 台设备及关联测点`)
  }

  return (
    <div className="station-devices-page">

      <header className="device-toolbar">
        <h1>设备列表与详情</h1><button className="device-action" aria-pressed={view==='list'} onClick={()=>setView('list')}>设备列表视图</button><button className="device-action" aria-pressed={view==='detail'} onClick={()=>setView('detail')}>设备目录与详情</button>
        <div className="device-filters" role="group" aria-label="设备状态筛选">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>
                {item.id === "all"
                  ? devices.length
                  : devices.filter((device) => device.status === item.id)
                      .length}
              </span>
            </button>
          ))}
        </div>
        <label className="device-search">
          <Search size={14} />
          <input
            aria-label="搜索设备"
            placeholder="搜索设备名称、编号或序列号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="device-icon-button"
              title="清空搜索"
              aria-label="清空搜索"
              onClick={() => setSearch("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
        <button
          type="button"
          className="device-action device-export"
          onClick={exportDevices}
          disabled={!filtered.length||!canExport}
        >
          <Download size={14} />
          导出设备数据
        </button>
      </header>
      <div className="device-data-source">
        <span>
          {station.name} ·{" "}
          {isDemo ? "示例设备数据 · 2 s 刷新" : "已登记设备档案 · 实时采样缺失时明确留空"}
        </span>
        <span role="status">{notice}</span>
      </div>
      {view==='list'&&<section className="device-inventory-list" aria-label="设备列表"><label>列表设备类型 <select aria-label="列表设备类型" value={deviceType} onChange={e=>setDeviceType(e.target.value as DeviceType|'all')}><option value="all">全部类型</option>{[...DEVICE_TYPES,'other' as const].map(type=><option key={type} value={type}>{DEVICE_SCHEMAS[type].label}</option>)}</select></label><p>共 {filtered.length} 台 · 通信状态来自当前系统，未知不等于离线；无设备采样时不使用站点快照代替。</p><div className="device-table-scroll"><table className="device-record-table" aria-label="设备档案列表"><thead><tr>{['设备名称','设备类型','所属站点','通信状态','厂家','型号','序列号','额定功率(kW)','额定容量(kWh)','固件','最近采集','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(d=><tr key={d.id} data-device-id={d.id}><td>{d.name}</td><td>{DEVICE_SCHEMAS[deviceTypeFromSource(d.sourceType,d.group)].label}</td><td>{station.name}</td><td>{DEVICE_STATUS_LABEL[d.status]}</td><td>{archiveText(d.manufacturer)}</td><td>{archiveText(d.model)}</td><td>{archiveText(d.serial)}</td><td>{archiveText(d.ratedPowerKw)}</td><td>{archiveText(d.capacityKwh)}</td><td>{archiveText(d.firmware)}</td><td>{d.updatedAt?dateText(d.updatedAt):'未采集'}</td><td><button className="device-action" aria-label={`查看设备 ${d.name}`} onClick={()=>{setSelectedId(d.id);setView('detail')}}>查看详情</button></td></tr>)}</tbody></table></div>{!filtered.length&&<p>暂无符合条件的设备</p>}</section>}
      <div className="device-workspace" style={view==='list'?{display:'none'}:undefined}>
        <aside className="device-directory" aria-label="设备目录">
          <header>
            <h2>设备目录</h2>
            <span>按系统与设备层级</span>
          </header>
          {!isDemo&&<label className="block mb-3 text-xs">设备类型<select aria-label="设备类型" className="block w-full mt-2 border rounded p-2" value={deviceType} onChange={e=>setDeviceType(e.target.value as DeviceType|'all')}><option value="all">全部类型 ({devices.length})</option>{[...DEVICE_TYPES,'other' as const].map(type=><option key={type} value={type}>{DEVICE_SCHEMAS[type].label} ({devices.filter(d=>deviceTypeFromSource(d.sourceType,d.group)===type).length})</option>)}</select></label>}
          {groups.map((group) => (
            <section key={group}>
              <h3>
                {group}
                <span>
                  {filtered.filter((device) => directoryGroup(device) === group).length}
                </span>
              </h3>
              {filtered
                .filter((device) => directoryGroup(device) === group)
                .map((device) => (
                  <button
                    type="button"
                    key={device.id}
                    className={`device-directory-item${
                      selected?.id === device.id ? " is-selected" : ""
                    }`}
                    aria-pressed={selected?.id === device.id}
                    aria-label={`选择 ${device.name}`}
                    onClick={() => setSelectedId(device.id)}
                  >
                    <i className={`device-dot--${device.status}`} />
                    <span>
                      <strong>{device.name}</strong>
                      <small title={device.code}>{device.code}</small>
                    </span>
                  </button>
                ))}
            </section>
          ))}
        </aside>
        {selected ? (
          <>
            {isDemo?<DeviceDetails
              key={selected.id}
              device={selected}
              station={station}
              isDemo={isDemo}
            />:<LiveDeviceDetails key={`${station.id}-${selected.id}`} device={selected} station={station}/>}
            <RealtimePoints
              key={`points-${selected.id}`}
              device={selected}
              now={now}
            />
          </>
        ) : (
          <div className="device-no-selection">
            <Server size={28} />
            <h2>{devices.length ? "暂无符合条件的设备" : "暂无设备数据"}</h2>
            {devices.length > 0 && (
              <button
                type="button"
                className="device-action"
                onClick={() => {
                  setFilter("all")
                  setDeviceType("all")
                  setSearch("")
                }}
              >
                重置筛选
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
