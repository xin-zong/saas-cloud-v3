import {useEffect,useRef,useState} from 'react'
import type {Station} from '@/App'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {ApiError} from '@/api/client'
import {useConfigurationLeaveGuard} from './useConfigurationLeaveGuard'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'
import {loadBasicElectricity,saveBasicElectricity,basicElectricityDraft,emptyBasicElectricity,type BasicElectricityConfig,type BasicElectricityDraft} from '@/api/stationBasicElectricity'
import './station-modules.css'

export default function StationBasicElectricityPage({station,registerLeaveGuard}:{station:Station;registerLeaveGuard?:RegisterLeaveGuard}){
 const {user}=useAuth(),allowed=hasStationPermission(user,station.id,'asset.read')&&hasStationPermission(user,station.id,'tariff.manage')
 const scope=JSON.stringify([station.id,user?.id,allowed]),current=useRef(scope);current.current=scope
 const [config,setConfig]=useState<BasicElectricityConfig|null>(null),[draft,setDraft]=useState<BasicElectricityDraft>(emptyBasicElectricity),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false)
 const closeAction=useRef<'cancel'|'refresh'>('cancel')
 const dirty=editing&&JSON.stringify(draft)!==JSON.stringify(basicElectricityDraft(config))
 function reset(){setDraft(basicElectricityDraft(config));setEditing(false);setError('');setConflict(false)}
 const leave=useConfigurationLeaveGuard({dirty,busy,registerLeaveGuard,onDiscard:reset,onClose:()=>{reset();if(closeAction.current==='refresh')void reload()}})
 function close(action:'cancel'|'refresh'){if(busy)return;closeAction.current=action;void leave.close()}
 function fail(e:unknown){setError((e as Error).message);if(e instanceof ApiError&&(e.status===401||e.status===403)){setConfig(null);setDraft(emptyBasicElectricity());setEditing(false);setLoaded(false);setNotice('');setConflict(false)}}
 useEffect(()=>{if(!dirty&&!busy)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty,busy])
 function check(value:BasicElectricityConfig|null){if(value&&value.stationId!==station.id)throw Error('返回配置不属于当前场站');return value}
 async function reload(signal?:AbortSignal){setBusy(true);setLoaded(false);setError('');try{const value=check(await loadBasicElectricity(station.id,signal));if(current.current!==scope||signal?.aborted)return;setConfig(value);setDraft(basicElectricityDraft(value));setEditing(false);setConflict(false);setLoaded(true)}catch(e){if(current.current===scope&&!signal?.aborted)fail(e)}finally{if(current.current===scope&&!signal?.aborted)setBusy(false)}}
 useEffect(()=>{const controller=new AbortController();setConfig(null);setDraft(emptyBasicElectricity());setEditing(false);setLoaded(false);setError('');setNotice('');setConflict(false);if(allowed)void reload(controller.signal);return()=>{controller.abort();current.current='unmounted'}},[scope])
 async function save(){if(!allowed||!loaded||busy||conflict)return;setBusy(true);setError('');setNotice('');try{const value=check(await saveBasicElectricity(station.id,draft,config?.version??0));if(current.current!==scope)return;setConfig(value);setDraft(basicElectricityDraft(value));setEditing(false);setNotice('配置已保存并记录审计；未接入账单计算。')}catch(e){if(current.current===scope){fail(e);if(e instanceof ApiError&&e.status===409)setConflict(true)}}finally{if(current.current===scope)setBusy(false)}}
 if(!allowed)return <section className="station-module">无当前场站的基本电费配置权限</section>
 const value=editing?draft:basicElectricityDraft(config)
 return <section className="station-module" aria-label="基本电费配置"><header><div><h2>{station.name} · 基本电费</h2><p>保存电价政策、变压器容量或合同需量及户号。</p></div><div className="module-actions"><button disabled={busy} onClick={()=>close('refresh')}>刷新配置</button>{!editing&&<button disabled={!loaded||busy} onClick={()=>{setDraft(basicElectricityDraft(config));setEditing(true);setNotice('');setError('')}}>{config?'编辑配置':'配置基本电费'}</button>}</div></header>
 <p>本页仅保存配置，不启用或重算账单。实际需量账单算法尚未接入。</p>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">正在处理…</p>}{conflict&&<p role="alert">配置版本已变化，草稿未覆盖服务器。请刷新配置后重新编辑。</p>}
 {loaded&&!config&&!editing&&<p>尚未配置基本电费。请选择电价政策后显式保存。</p>}
 {(editing||config)&&<><p>配置版本：{config?`v${config.version}`:'未保存'}</p><fieldset className="module-form" disabled={!editing||busy||conflict}>
 <label>电价政策<select aria-label="电价政策" value={value.pricePolicy} onChange={e=>setDraft({...draft,pricePolicy:e.target.value as BasicElectricityDraft['pricePolicy'],priceType:'',transformerCapacityKva:'',contractDemandKw:''})}><option value="">请选择</option><option value="single">单一制</option><option value="two-part">两部制</option></select></label>
 {value.pricePolicy==='two-part'&&<label>基本电费类型<select aria-label="基本电费类型" value={value.priceType} onChange={e=>setDraft({...draft,priceType:e.target.value as BasicElectricityDraft['priceType'],transformerCapacityKva:'',contractDemandKw:''})}><option value="">请选择</option><option value="capacity">按容量</option><option value="contract-demand">按合同需量</option><option value="actual-demand">按实际需量</option></select></label>}
 {value.pricePolicy==='two-part'&&value.priceType==='capacity'&&<label>变压器容量（kVA）<input inputMode="decimal" value={value.transformerCapacityKva} onChange={e=>setDraft({...draft,transformerCapacityKva:e.target.value})}/></label>}
 {value.pricePolicy==='two-part'&&value.priceType==='contract-demand'&&<label>合同需量（kW）<input inputMode="decimal" value={value.contractDemandKw} onChange={e=>setDraft({...draft,contractDemandKw:e.target.value})}/></label>}
 <label>户号<input maxLength={50} value={value.consumerNumber} onChange={e=>setDraft({...draft,consumerNumber:e.target.value})}/></label>
 </fieldset>{editing&&<><p>容量/需量范围0–65535，最多两位小数；0会原样保存。切换类型仅修改草稿。</p><div className="module-actions"><button disabled={busy} onClick={()=>close('cancel')}>取消编辑</button><button disabled={busy||conflict||!loaded} onClick={()=>void save()}>保存配置</button></div></>}</>}
 {leave.confirmation}</section>
}
