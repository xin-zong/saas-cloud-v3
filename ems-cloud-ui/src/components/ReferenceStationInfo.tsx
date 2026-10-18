import type {LifecycleStation} from '@/api/referenceLifecycle'
import {coordinateToDms} from '@/data/referenceLifecycle'
import {emptyText} from './reference-settings-shared'
type Field=[string,unknown]
function Fields({items}:{items:Field[]}){return <dl className="rq-info">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{emptyText(value)}</dd></div>)}</dl>}
function coordinate(value:string|number|null|undefined){if(value==null||String(value).trim()==='')return '未采集';const d=coordinateToDms(value);return d.degrees===''?'未采集':`${d.degrees}° ${d.minutes}′ ${d.seconds}″`}
export default function ReferenceStationInfo({info,canEdit,onEdit,onDelete}:{info:LifecycleStation|null;canEdit:boolean;onEdit:()=>void;onDelete:()=>void}){
 return <><header className="rq-title"><h3>场站信息</h3><button className="rq-primary" disabled={!canEdit||!info} onClick={onEdit}>编辑</button><button className="rq-danger" disabled={!canEdit||!info} onClick={onDelete}>删除</button></header><div className="rq-station-info">
 <section className="rq-sheet"><h4>基本信息</h4><div className="rq-profile-summary"><Fields items={[
 ['地址',info?.address],['区域',info?.region],['时区',info?.timezone],['经纬度',info?`${coordinate(info.longitude)}, ${coordinate(info.latitude)}`:null],
 ['系统组合',info?.systems.map(s=>({PV:'光伏系统',BESS:'储能系统',EV:'充电系统'} as Record<string,string>)[s]??s).join('、')],['场站类型',({commercial:'工商业',residential:'户用',ground:'地面'} as Record<string,string>)[info?.siteType??'']]
 ]}/><div className="rq-cover-empty"><span>暂无场站照片</span><small>未取得照片数据与已核验上传接口</small></div></div></section>
 <section className="rq-sheet"><h4>光伏系统</h4><Fields items={[
 ['光伏装机容量(kWp)',info?.solarCapacityKw],['电压等级(kV)',info?.voltageLevelKv],['组件方位角(°)',info?.moduleAzimuth],['组件倾角(°)',info?.moduleTilt],['发电户号',info?.generationAccount],['光伏消纳方式',info?.solarConsumptionMode],['投产/并网日期',info?.gridConnectionDate],['并网/投产状态',info?.solarGridStatus]
 ]}/></section>
 <section className="rq-sheet"><h4>储能系统</h4><Fields items={[
 ['储能额定功率(kW)',info?.ratedPowerKw],['储能额定容量(kWh)',info?.capacityKwh],['投产日期',info?.commissionedOn],['投产状态',info?.storageGridStatus]
 ]}/></section>
 <section className="rq-sheet"><h4>关联方</h4>{info?.relatedParties.length?info.relatedParties.map((party,index)=><div key={index} className="rq-party"><Fields items={[
 ['关联方类型',party.type],['联系人姓名',party.name],['电话',party.phone],['邮箱',party.email],['所属企业',party.company]
 ]}/></div>):<p className="rq-empty">暂无关联方数据</p>}</section>
 </div></>
}
