import { useState } from 'react'
import { bands, modeNames, validatePeriods, type TariffTemplate, type TariffPeriod } from './model'

export function TariffIcon({ name }: { name: string }) {
  return <img src={`/figma/tariff/${name}.svg`} alt="" />
}
export default function TariffTemplateEditor({ value, onChange, disabled }: {
  value: TariffTemplate
  onChange: (next: TariffTemplate) => void
  disabled: boolean
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [token, setToken] = useState('')
  const [notice, setNotice] = useState('')
  const update = (patch: Partial<TariffTemplate>) => onChange({ ...value, ...patch })
  const source = (patch: Partial<TariffTemplate['source']>) => update({source:{...value.source,...patch}})
  const updatePeriod = (index: number, patch: Partial<TariffPeriod>) => update({[side]:value[side].map((row,i)=>i===index?{...row,...patch}:row)})
  const changeMode = (mode: TariffTemplate['mode']) => {
    const fixed = (rows: TariffPeriod[]): TariffPeriod[] => [{start:'00:00',end:'24:00',band:'flat',price:rows.length===1?rows[0].price:''}]
    update(mode==='fixed' ? {mode,buy:fixed(value.buy),sell:fixed(value.sell)} : {mode})
  }
  const problem = value.mode==='dynamic' ? '' : validatePeriods(value.buy) || validatePeriods(value.sell)
  const sellerUnconfigured = value.mode !== 'dynamic' && value.sell.every(period => !period.price.trim())
  return <>
    <section className="tariff-card tariff-template-heading">
      <label>模板名称<input aria-label="模板名称" value={value.name} disabled={disabled} onChange={e=>update({name:e.target.value})} /></label>
      <span>电价类型</span>
      <div className="tariff-mode-buttons">
        {(Object.keys(modeNames) as TariffTemplate['mode'][]).map(mode=><button key={mode} disabled={disabled} aria-pressed={value.mode===mode} onClick={()=>changeMode(mode)}>{modeNames[mode]}</button>)}
      </div>
      <label>币种<select aria-label="模板币种" disabled={disabled} value={value.currency} onChange={e=>update({currency:e.target.value})}><option>CNY</option><option>EUR</option><option>USD</option></select></label>
      {value.mode==='tou' && <div className="tariff-side-select">{(['buy','sell'] as const).map(key=><button key={key} aria-pressed={side===key} onClick={()=>setSide(key)}><strong>{key==='buy'?'购电电价':'售电电价'}</strong><small>{value[key].length} 个时段 · {key==='sell' && sellerUnconfigured?'售电价格未配置':validatePeriods(value[key])?'待完善':'已完整'}</small></button>)}</div>}
    </section>
    {value.mode==='fixed' && <section className="tariff-card">
      <h2>固定电价</h2><div className="tariff-fixed-fields">
        {(['buy','sell'] as const).map(key=><label key={key}>{key==='buy'?'购电固定价':'售电固定价'}<div><input aria-label={key==='buy'?'购电固定价':'售电固定价'} type="number" step="any" disabled={disabled} value={value[key][0]?.price??''} onChange={e=>update({[key]:[{start:'00:00',end:'24:00',band:'flat',price:e.target.value}]})}/><span>{value.currency} / kWh</span></div></label>)}
      </div><div className="tariff-validity"><span>全天生效</span><span>00:00—24:00</span><span>{sellerUnconfigured?'售电价格未配置':problem?'待完善':'配置完整'}</span></div>
    </section>}
    {value.mode==='tou' && <section className="tariff-card">
      <header><h2>{side==='buy'?'购电电价':'售电电价'}</h2><span>单位：{value.currency} / kWh</span><button aria-label="新增电价时段" disabled={disabled} onClick={()=>update({[side]:[...value[side],{start:value[side].at(-1)?.end==='24:00'?'':value[side].at(-1)?.end??'00:00',end:'24:00',band:'flat',price:''}]})}><TariffIcon name="add"/></button></header>
      <div className="tariff-periods"><div className="tariff-period-row tariff-period-labels"><span>开始时间</span><span>结束时间</span><span>时段类型</span><span>{side==='buy'?'购电价':'售电价'}</span><span/></div>
        {value[side].map((row,index)=><div className="tariff-period-row" key={index}>
          <input aria-label={`时段${index+1}开始时间`} placeholder="00:00" disabled={disabled} value={row.start} onChange={e=>updatePeriod(index,{start:e.target.value})}/>
          <input aria-label={`时段${index+1}结束时间`} placeholder="24:00" disabled={disabled} value={row.end} onChange={e=>updatePeriod(index,{end:e.target.value})}/>
          <select aria-label={`时段${index+1}类型`} disabled={disabled} value={row.band} onChange={e=>updatePeriod(index,{band:e.target.value as TariffPeriod['band']})}>{Object.entries(bands).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
          <label className="tariff-price-input"><input aria-label={`时段${index+1}电价`} type="number" step="any" disabled={disabled} value={row.price} onChange={e=>updatePeriod(index,{price:e.target.value})}/><span>{value.currency} / kWh</span></label>
          <button aria-label={`删除时段${index+1}`} disabled={disabled} onClick={()=>update({[side]:value[side].filter((_,i)=>i!==index)})}><TariffIcon name="remove"/></button>
        </div>)}
      </div><div className="tariff-validity"><span>{validatePeriods(value[side]) || '全天 00:00—24:00 已覆盖，无空缺、无重叠'}</span><span>{value[side].length} 个时段</span></div>
    </section>}
    {value.mode==='dynamic' && <>
      <div className="tariff-dynamic-grid">
        <section className="tariff-card"><h2>连接设置</h2>
          <label>接口名称<input disabled={disabled} value={value.source.name} onChange={e=>source({name:e.target.value})}/></label>
          <label>请求地址<input aria-label="动态电价请求地址" placeholder="https://" disabled={disabled} value={value.source.url} onChange={e=>source({url:e.target.value})}/></label>
          <div className="tariff-three-fields"><label>请求方式<select disabled={disabled} value={value.source.method} onChange={e=>source({method:e.target.value})}><option>GET</option><option>POST</option></select></label><label>认证方式<select disabled={disabled} value={value.source.auth} onChange={e=>source({auth:e.target.value})}><option>Bearer Token</option><option>API Key</option><option>无</option></select></label><label>更新频率<select disabled={disabled} value={value.source.frequency} onChange={e=>source({frequency:e.target.value})}>{[1,5,15,30,60].map(n=><option key={n} value={n}>{n} 分钟</option>)}</select></label></div>
          <label>访问令牌（仅本次输入，不持久保存）<input autoComplete="off" type="password" disabled={disabled || value.source.auth==='无'} value={token} onChange={e=>setToken(e.target.value)}/></label>
        </section>
        <section className="tariff-card"><h2>字段映射</h2><div className="tariff-two-fields">
          <label>时间字段<input disabled={disabled} value={value.source.timeField} onChange={e=>source({timeField:e.target.value})}/></label>
          <label>购电价格字段<input disabled={disabled} value={value.source.buyField} onChange={e=>source({buyField:e.target.value})}/></label>
          <label>售电价格字段<input disabled={disabled} value={value.source.sellField} onChange={e=>source({sellField:e.target.value})}/></label>
          <label>电价单位<select disabled={disabled} value={value.source.unit} onChange={e=>source({unit:e.target.value})}><option>元 / kWh</option><option>元 / MWh</option><option>EUR / MWh</option><option>USD / kWh</option></select></label>
          <label>时区<select disabled={disabled} value={value.source.timezone} onChange={e=>source({timezone:e.target.value})}><option>Asia/Shanghai</option><option>UTC</option><option>Europe/Berlin</option></select></label>
          <label>时间粒度<input readOnly value={`${value.source.frequency} 分钟`}/></label>
        </div><button className="tariff-fallback" role="switch" aria-checked={value.source.fallback} disabled={disabled} onClick={()=>source({fallback:!value.source.fallback})}><span>缺失数据处理<small>使用上一有效时段（待服务接入）</small></span>{value.source.fallback?<TariffIcon name="switch-on"/>:<span>关闭</span>}</button></section>
      </div>
      <section className="tariff-card"><header><h2>连接测试与数据预览</h2><button disabled={disabled} onClick={()=>setNotice('动态电价服务未接通，无法测试连接或读取价格；未发送外部请求。')}><TariffIcon name="test"/>测试连接</button></header><table><thead><tr><th>时间</th><th>购电价</th><th>售电价</th><th>状态</th></tr></thead><tbody><tr><td colSpan={4} className="tariff-empty">尚未接通动态电价服务，暂无价格数据</td></tr></tbody></table>{notice&&<p role="status">{notice}</p>}</section>
    </>}
    <footer className="tariff-card tariff-editor-status"><span>{value.mode==='dynamic'?'动态接口参数仅保存为本地草稿':sellerUnconfigured?'售电价格未配置，可保存为本地草稿':problem || '购电与售电规则配置完整'}</span><span>保存后可在本机电价日历中分配；不会自动发布</span></footer>
  </>
}
