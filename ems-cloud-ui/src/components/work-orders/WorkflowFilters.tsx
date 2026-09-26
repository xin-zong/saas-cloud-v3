import {useState} from 'react'
export type WorkflowFilterValues=Record<string,string>
export const orderFilters=['站点','设备','工单类型','状态','负责人','优先级','来源','创建人','创建时间','完成期限','完成时间','是否超时']
export const approvalFilters=['审批类型','审批状态','关联站点','申请人','当前审批人','所属组织','申请时间','审批时间','是否超时']
export const todoFilters=['事项类型','处理状态','关联站点','优先级','发起人','创建时间','截止时间','是否超时']
export function matchesWorkflowFilters(filters:WorkflowFilterValues,values:Record<string,string|undefined>){return Object.entries(filters).every(([field,value])=>!value||(values[field]||'').toLowerCase().includes(value.toLowerCase()))}
export function WorkflowFilters({fields,values,onChange,options}:{fields:string[];values:WorkflowFilterValues;onChange:(next:WorkflowFilterValues)=>void;options:Record<string,string[]>}){
 const [field,setField]=useState('')
 return <div className="wo-filter-picker"><div className="wo-filter-menu" aria-label="添加筛选条件">{fields.map(name=><button key={name} className="operations-button" aria-pressed={field===name} onClick={()=>setField(name)}>{name}</button>)}</div>{field&&<label>{field}{options[field]?.length?<select aria-label={`筛选${field}`} value={values[field]||''} onChange={e=>onChange({...values,[field]:e.target.value})}><option value="">全部</option>{options[field].map(value=><option key={value}>{value}</option>)}</select>:<input aria-label={`筛选${field}`} type={/时间|期限/.test(field)?'date':'text'} value={values[field]||''} onChange={e=>onChange({...values,[field]:e.target.value})} placeholder="请输入筛选值"/>}<small>仅匹配已提供的数据；缺失数据不匹配。</small></label>}<div className="wo-filter-chips">{Object.entries(values).filter(([,v])=>v).map(([name,value])=><button key={name} className="operations-button" onClick={()=>{const next={...values};delete next[name];onChange(next)}}>{name}：{value} ×</button>)}</div></div>
}
