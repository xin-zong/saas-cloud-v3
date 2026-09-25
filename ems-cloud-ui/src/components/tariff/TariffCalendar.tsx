import { useState } from 'react'
import type { ApiRow } from '@/api/client'
import { calendarDays, dateKey, type TariffWorkspace } from './model'

export default function TariffCalendar({workspace,onChange,serverRows,disabled}: {
  workspace:TariffWorkspace
  onChange:(next:TariffWorkspace)=>void
  serverRows:ApiRow[]
  disabled:boolean
}) {
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1))
  const today=dateKey(new Date())
  return <>
    <section className="tariff-card tariff-month">
      <button aria-label="上个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button>
      <strong>{month.getFullYear()}年{String(month.getMonth()+1).padStart(2,'0')}月</strong>
      <button aria-label="下个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button>
      <button onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>本月</button>
    </section>
    <section className="tariff-calendar" aria-label="电价月历">
      {['周一','周二','周三','周四','周五','周六','周日'].map(day=><div key={day} className="tariff-weekday">{day}</div>)}
      {calendarDays(month.getFullYear(),month.getMonth()).map(day=>{
        const effective=serverRows.find(row=>day.date>=String(row.valid_from)&&day.date<String(row.valid_until))
        return <div key={day.date} className="tariff-day" data-current={day.current} data-past={day.date<today}>
          <span className={day.date===today?'tariff-today':''}>{String(day.day).padStart(2,'0')}</span>
          <select aria-label={`${day.date}日模板`} disabled={!day.current||day.date<today||disabled||!workspace.templates.length} value={workspace.assignments[day.date]??''} onChange={e=>onChange({...workspace,assignments:{...workspace.assignments,[day.date]:e.target.value}})}>
            <option value="">未分配模板</option>{workspace.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {effective&&<small title="服务器已保存的生效期间">已生效：{String(effective.name)}</small>}
        </div>
      })}
    </section>
    <p className="tariff-footnote">日模板与日历分配为本机草稿。服务器已生效期间单独显示；保存设置不会改变已生效电价。</p>
  </>
}
