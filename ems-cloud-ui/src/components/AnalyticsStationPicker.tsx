import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"

export default function AnalyticsStationPicker({ stations, value, onChange }: { stations: Station[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])
  return <div className="analytics-station-picker" ref={root} onKeyDown={event => { if (event.key === "Escape") setOpen(false) }}>
    <button type="button" className="analysis-button" aria-label="分析站点" aria-haspopup="listbox" aria-expanded={open} disabled={!stations.length} onClick={() => { setOpen(!open); setSearch("") }}>{stations.find(s => s.id === value)?.name ?? "暂无授权站点"} ▾</button>
    {open && <div className="analytics-station-popover"><label className="analysis-search"><img src="/figma/analytics/search.svg" alt="" /><input autoFocus placeholder="搜索站点名称" value={search} onChange={e => setSearch(e.target.value)} /></label><div role="listbox" aria-label="分析站点列表">{stations.filter(s => s.name.includes(search.trim())).map(s => <button type="button" role="option" aria-selected={s.id === value} key={s.id} onClick={() => { onChange(s.id); setOpen(false) }}>{s.name}{s.id === value ? " ✓" : ""}</button>)}{!stations.some(s => s.name.includes(search.trim())) && <p>没有匹配站点</p>}</div></div>}
  </div>
}
