import { DEMO_MODE, send } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleAlert, Download, FilePlus2, RefreshCw, Search, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Station } from "@/App";
import { stationDataNow } from "@/data/dataClock";
import { alarmDate, alarmRange, demoStationAlarms, type StationAlarm } from "@/data/stationAlarms";
import { buildMaintenanceStation, type MaintenanceAlarm } from "@/data/stationMaintenance";

type AlarmView = Omit<StationAlarm, "metric" | "severity" | "category"> & {
  metric?: StationAlarm["metric"];
  severity: MaintenanceAlarm["severity"];
  category: string;
};
const levelLabel = { critical: "严重", warning: "重要", info: "一般" };
const statusLabel = { active: "活动", recovered: "已恢复" };
const timeFormat = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
function dateTime(value: string) {
  const date = new Date(value);
  return `${alarmDate(date)} ${timeFormat.format(date)}`;
}

function AlarmTrend({ alarm, expanded = false }: { alarm: AlarmView; expanded?: boolean }) {
  const samples = alarm.samples.filter((point) => Number.isFinite(point.offsetMinutes) && Number.isFinite(point.value)).sort((a, b) => a.offsetMinutes - b.offsetMinutes);
  if (!samples.length || !alarm.metric) return <div className="alarm-empty">暂无关联测点数据</div>;
  return (
    <div className={`alarm-trend-chart${expanded ? " alarm-trend-chart--expanded" : ""}`} data-alarm-chart={alarm.id} aria-label={`${alarm.title}，${alarm.metric.name}趋势`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={samples} margin={{ top: 14, right: 18, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e8edef" />
          <XAxis dataKey="offsetMinutes" type="number" domain={[-30, 30]} ticks={[-30, 0, 30]} tickFormatter={(value) => value === 0 ? "发生时刻" : value < 0 ? "告警前 30 min" : "告警后 30 min"} tick={{ fontSize: 10, fill: "#63737b" }} tickLine={false} stroke="#d5dfe2" padding={{ left: 20, right: 20 }} />
          <YAxis width={42} tick={{ fontSize: 10, fill: "#63737b" }} axisLine={false} tickLine={false} domain={[0, "auto"]} />
          <Tooltip labelFormatter={(value) => `${Number(value) < 0 ? "告警前" : "告警后"} ${Math.abs(Number(value))} min`} formatter={(value) => [`${value} ${alarm.metric?.unit}`, alarm.metric?.name]} contentStyle={{ borderRadius: 6, fontSize: 12, borderColor: "#d8e3dc" }} />
          <ReferenceLine x={0} stroke="#e8989c" strokeDasharray="4 4" />
          <ReferenceLine y={alarm.metric.threshold} stroke="#dda345" strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Line dataKey="value" name={alarm.metric.name} stroke={alarm.severity === "critical" ? "#dc3545" : "#cd8a14"} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AlarmDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="alarm-dialog" aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h2>{title}</h2><button className="alarm-icon-button" title="关闭" aria-label="关闭" onClick={onClose}><X size={17} /></button></header>
    {children}
  </dialog>;
}

function Timeline({ alarms, selected, range, rollingEnd, onSelect }: { alarms: AlarmView[]; selected: AlarmView | null; range: { start: string; end: string }; rollingEnd?: number; onSelect: (id: string) => void }) {
  const start = rollingEnd ? rollingEnd - 86400000 : new Date(`${range.start}T00:00:00`).getTime();
  const end = rollingEnd ?? new Date(`${range.end}T23:59:59.999`).getTime();
  const ordered = [...alarms].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const count = rollingEnd ? 5 : Math.min(7, Math.max(2, Math.round((end - start) / 86400000)));
  const lanes: number[] = [];
  const markers = ordered.map((alarm) => {
    const position = Math.max(0, Math.min(100, ((Date.parse(alarm.occurredAt) - start) / Math.max(1, end - start)) * 100));
    let lane = lanes.findIndex((last) => position - last >= 4);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = position;
    return { alarm, position, lane };
  });
  const height = Math.max(112, lanes.length * 30 + 80);
  return <div className="alarm-timeline-scroll">
    <div className="alarm-timeline" style={{ height }} aria-label="告警时间轴">
      <div className="alarm-timeline-track">
        {Array.from({ length: count }, (_, index) => {
          const date = new Date(start + (end - start) * index / (count - 1));
          return <div className="alarm-timeline-tick" key={index} style={{ left: `${index / (count - 1) * 100}%` }}>
            <i /><span>{rollingEnd || range.start === range.end ? timeFormat.format(date).slice(0, 5) : `${date.toLocaleDateString("zh-CN", { weekday: "short" })} ${alarmDate(date).slice(5).replace("-", "/")}`}</span>
          </div>;
        })}
        {markers.map(({ alarm, position, lane }) => <button key={alarm.id} className={`alarm-pin alarm-pin--${alarm.severity}`} style={{ left: `${position}%`, bottom: 3 + lane * 30 }} onClick={() => onSelect(alarm.id)} aria-label={`${alarm.id} ${alarm.title}`} aria-pressed={selected?.id === alarm.id} title={`${dateTime(alarm.occurredAt)} · ${alarm.title}`}>
          <CircleAlert size={19} fill="currentColor" strokeWidth={1.7} />
          {selected?.id === alarm.id && <span className="alarm-pin-label" style={{ transform: position > 85 ? "translateX(-85%)" : position < 15 ? "translateX(-15%)" : undefined }}>{timeFormat.format(new Date(alarm.occurredAt)).slice(0, 5)} · {levelLabel[alarm.severity]}告警</span>}
        </button>)}
      </div>
      {!alarms.length && <div className="alarm-timeline-empty">当前条件下无告警</div>}
    </div>
  </div>;
}

type WorkOrderDraft = { alarmId: string; title: string; assignee: string; priority: string; note: string };

export default function StationAlarmsPage({
  station,
  canCreateOrder = true,
}: {
  station: Station;
  canCreateOrder?: boolean;
}) {
  const { user } = useAuth();
  const hasConnectedAlarmSource = station.maintenance?.alarms !== undefined || station.maintenance?.source === "connected" || station.alarmHistory !== undefined;
  const currentAlarmNow = () => hasConnectedAlarmSource ? stationDataNow(station) : new Date();
  const [days, setDays] = useState<number | null>(7);
  const [range, setRange] = useState(() => alarmRange(7, currentAlarmNow()));
  const [level, setLevel] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("ALM-2048");
  const [notice, setNotice] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(currentAlarmNow);
  const [trendOpen, setTrendOpen] = useState(false);
  const [order, setOrder] = useState<WorkOrderDraft | null>(null);
  const [orderSaved, setOrderSaved] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const hasMaintenanceAlarms = station.maintenance?.alarms !== undefined || station.maintenance?.source === "connected";
  const isDemo = hasMaintenanceAlarms ? station.maintenance?.source === "demo" : station.alarmHistory === undefined;
  const alarms = useMemo<AlarmView[]>(() => {
    if (!hasMaintenanceAlarms) return station.alarmHistory ?? demoStationAlarms(station.id, refreshedAt);
    return buildMaintenanceStation(station, refreshedAt).alarms.map(alarm => {
      const history = station.alarmHistory?.find(item => item.id === alarm.id);
      return { ...alarm, occurredAt: alarm.occurredAt ?? "", category: alarm.category ?? history?.category ?? "未分类", location: history?.location ?? station.name, metric: history?.metric, samples: history?.samples ?? [], events: history?.events ?? [] };
    });
  }, [station, hasMaintenanceAlarms, refreshedAt]);
  useEffect(() => {
    if (!hasMaintenanceAlarms) return;
    const timer = window.setInterval(() => { const now = currentAlarmNow(); setRefreshedAt(now); if (days && days !== 1) setRange(alarmRange(days, now)); }, 30000);
    return () => window.clearInterval(timer);
  }, [hasMaintenanceAlarms, days, station]);
  const invalidRange = !range.start || !range.end || range.start > range.end;
  const filtered = useMemo(() => alarms.filter((alarm) => {
    const occurred = new Date(alarm.occurredAt).getTime();
    const start = days === 1 ? refreshedAt.getTime() - 86400000 : new Date(`${range.start}T00:00:00`).getTime();
    const end = days === 1 ? refreshedAt.getTime() : new Date(`${range.end}T23:59:59.999`).getTime();
    const search = query.trim().toLowerCase();
    return !invalidRange && occurred >= start && occurred <= end &&
      (level === "all" || alarm.severity === level) && (category === "all" || alarm.category === category) &&
      (status === "all" || alarm.status === status) &&
      (!search || `${alarm.id} ${alarm.title} ${alarm.device} ${alarm.location}`.toLowerCase().includes(search));
  }), [alarms, range, level, category, status, query, days, refreshedAt, invalidRange]);
  const selected = filtered.find((alarm) => alarm.id === selectedId) ?? filtered[0] ?? null;
  const peak = selected?.samples.length ? Math.max(...selected.samples.map((sample) => sample.value)) : null;
  const duration = selected ? Math.max(0, Math.floor((Date.parse(selected.recoveredAt ?? refreshedAt.toISOString()) - Date.parse(selected.occurredAt)) / 1000)) : 0;
  const durationLabel = duration >= 86400 ? `${Math.floor(duration / 86400)} 天 ${Math.floor(duration % 86400 / 3600)} 小时` : duration >= 3600 ? `${Math.floor(duration / 3600)} 小时 ${Math.floor(duration % 3600 / 60)} 分` : `${Math.floor(duration / 60)} 分 ${duration % 60} 秒`;

  function chooseDays(value: number) {
    const now = currentAlarmNow();
    setDays(value); setRefreshedAt(now);
    setRange(value === 1 ? { start: alarmDate(new Date(now.getTime() - 86400000)), end: alarmDate(now) } : alarmRange(value, now));
  }
  function exportAlarms() {
    const rows = [["编号", "发生时间", "类型", "告警内容", "设备", "等级", "状态"], ...filtered.map((alarm) => [alarm.id, dateTime(alarm.occurredAt), alarm.category, alarm.title, alarm.device, levelLabel[alarm.severity], statusLabel[alarm.status]])];
    const csv = rows.map((row) => row.map((value) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${station.code}-告警-${range.start}-${range.end}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`已导出 ${filtered.length} 条告警`);
  }
  function openOrder() {
    if (!selected) return;
    setOrderError(""); setOrderSaved(false);
    const initial = { alarmId: selected.id, title: `${selected.title}排查`, assignee: DEMO_MODE ? station.manager || "" : user?.id || "", priority: levelLabel[selected.severity], note: `${station.name} / ${selected.device} / ${selected.id}\n发生时间：${dateTime(selected.occurredAt)}` };
    if (!DEMO_MODE) { setOrder(initial); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(`alarm-order:${station.id}:${selected.id}`) || "null");
      setOrder(saved && ["alarmId", "title", "assignee", "priority", "note"].every((key) => typeof saved[key] === "string") ? saved : initial);
    } catch { setOrder(initial); }
  }

  return <div className="station-alarms-page">
    <section className="alarm-filters" aria-label="告警筛选">
      <h1>历史告警</h1>
      <div className="alarm-periods" role="group" aria-label="时间范围">{[[1, "近24小时"], [7, "近7天"], [30, "近30天"]].map(([value, label]) => <button key={value} aria-pressed={days === value} onClick={() => chooseDays(Number(value))}>{label}</button>)}</div>
      <div className="alarm-date-range"><CalendarDays size={14} /><input type="date" aria-label="开始日期" value={range.start} onChange={(event) => { setDays(null); setRange({ ...range, start: event.target.value }); }} /><span>至</span><input type="date" aria-label="结束日期" value={range.end} min={range.start} onChange={(event) => { setDays(null); setRange({ ...range, end: event.target.value }); }} /></div>
      <select aria-label="告警级别" value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">全部级别</option><option value="critical">严重告警</option><option value="warning">重要告警</option><option value="info">一般告警</option></select>
      <select aria-label="告警类型" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部类型</option>{["安全", "设备", "环境", "通信"].map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="告警状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="active">活动</option><option value="recovered">已恢复</option></select>
      <label className="alarm-search"><Search size={14} /><input aria-label="搜索告警" placeholder="搜索告警、设备或编号" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="alarm-icon-button" aria-label="清空搜索" title="清空搜索" onClick={() => setQuery("")}><X size={13} /></button>}</label>
      <button className="alarm-icon-button" title="导出告警 CSV" aria-label="导出告警 CSV" disabled={!filtered.length} onClick={exportAlarms}><Download size={16} /></button>
      <button className="alarm-icon-button" title="刷新告警" aria-label="刷新告警" onClick={() => { const now = currentAlarmNow(); setRefreshedAt(now); if (days) chooseDays(days); setNotice(`已刷新当前${isDemo ? "示例" : "接入"}数据 · ${timeFormat.format(now)}`); }}><RefreshCw size={16} /></button>
    </section>
    <div className="alarm-data-status"><span>{station.name} · {isDemo ? "示例历史数据" : station.maintenance?.alarms === undefined && station.alarmHistory === undefined ? "告警历史未接入" : "已接入历史数据"}</span><span role="status">{invalidRange ? "请选择有效日期，结束日期不能早于开始日期" : notice || `更新于 ${timeFormat.format(refreshedAt)}`}</span></div>

    <section className="alarm-overview" aria-label="告警回溯">
      <header className="alarm-section-heading"><h2>告警时间轴</h2><div className="alarm-legend">{Object.entries(levelLabel).map(([value,label]) => <span key={value} className={`alarm-badge alarm-badge--${value}`}><i />{label}告警 {filtered.filter(alarm => alarm.severity === value).length}</span>)}</div></header>
      <Timeline alarms={filtered} selected={selected} range={range} rollingEnd={days === 1 ? refreshedAt.getTime() : undefined} onSelect={setSelectedId} />
      <div className="alarm-trend">
        <header><span>{selected?.metric ? `${selected.metric.name} / ${selected.metric.unit}` : "关联测点趋势"}</span>{selected?.metric && <span className="alarm-threshold">阈值 {selected.metric.threshold} {selected.metric.unit}</span>}<button className="alarm-action" disabled={!selected?.metric || !selected.samples.length} onClick={() => setTrendOpen(true)}>进入数据分析<ArrowUpRight size={13} /></button></header>
        {selected ? <AlarmTrend alarm={selected} /> : <div className="alarm-empty">暂无关联趋势</div>}
      </div>
    </section>

    <div className="alarm-workspace">
      <section className="alarm-list" aria-label="告警列表">
        <header className="alarm-section-heading"><h2>告警列表</h2><span>共 {filtered.length} 条</span></header>
        <div className="alarm-table-scroll"><table><thead><tr>{["编号", "发生时间", "类型", "告警内容", "设备", "等级", "状态", "操作"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{filtered.map((alarm) => <tr key={alarm.id} className={selected?.id === alarm.id ? "is-selected" : ""} onClick={() => setSelectedId(alarm.id)} aria-selected={selected?.id === alarm.id}>
            <td>{alarm.id}</td><td>{dateTime(alarm.occurredAt).slice(5, 16).replace(/-/g, "/")}</td><td className={`alarm-category--${alarm.severity}`}>{alarm.category}</td><td className="alarm-title-cell">{alarm.title}</td><td>{alarm.device}</td><td><span className={`alarm-text--${alarm.severity}`}>{levelLabel[alarm.severity]}</span></td><td><span className={alarm.status === "active" ? "alarm-text--critical" : "alarm-text--recovered"}>{statusLabel[alarm.status]}</span></td><td><button className="alarm-text-button" onClick={() => setSelectedId(alarm.id)} aria-label={`查看 ${alarm.id}`}>查看</button></td>
          </tr>)}</tbody>
        </table>{!filtered.length && <div className="alarm-empty"><CircleAlert size={22} /><p>暂无符合条件的告警</p><button className="alarm-action" onClick={() => { setLevel("all"); setCategory("all"); setStatus("all"); setQuery(""); chooseDays(7); }}>重置筛选</button></div>}</div>
      </section>

      <aside className="alarm-detail" aria-label="告警详情">
        <header className="alarm-section-heading"><h2>告警详情</h2>{selected && <span className={`alarm-badge alarm-badge--${selected.severity}`}>{levelLabel[selected.severity]} · {statusLabel[selected.status]}</span>}</header>
        {selected ? <>
          <h3>{selected.title}</h3><p className="alarm-detail-subtitle">{selected.id} · {selected.device} / {selected.location}</p>
          <dl className="alarm-facts"><div><dt>发生时间</dt><dd>{dateTime(selected.occurredAt)}</dd></div><div><dt>持续时间</dt><dd>{durationLabel}</dd></div><div><dt>最高{selected.metric?.name ?? "测点值"}</dt><dd className="alarm-text--critical">{peak === null ? "暂无数据" : `${peak} ${selected.metric?.unit ?? ""}`}</dd></div><div><dt>阈值</dt><dd>{selected.metric ? `${selected.metric.threshold} ${selected.metric.unit}${selected.metric.holdSeconds ? ` / ${selected.metric.holdSeconds}s` : ""}` : "未接入"}</dd></div></dl>
          <h4>处理记录</h4><ol className="alarm-events">{selected.events.map((event, index) => <li key={`${event.at}-${index}`}><time dateTime={event.at} title={dateTime(event.at)}>{timeFormat.format(new Date(event.at))}</time><span>{event.text}</span></li>)}</ol>
          {!selected.events.length && <p className="alarm-detail-subtitle">暂无处理记录</p>}
          {canCreateOrder && (
            <footer><button disabled={!DEMO_MODE && !user?.permissions.includes("workorder.manage")} className="alarm-action" onClick={openOrder}><FilePlus2 size={14} />基于该告警开单<ChevronRight size={13} /></button></footer>
          )}
        </> : <div className="alarm-empty">暂无告警详情</div>}
      </aside>
    </div>

    {trendOpen && selected?.metric && <AlarmDialog title="告警数据分析" onClose={() => setTrendOpen(false)}><div className="alarm-analysis-body"><div className="alarm-analysis-title"><Activity size={17} /><strong>{selected.title}</strong><span>{selected.device} · {selected.metric.name} / {selected.metric.unit}</span></div><AlarmTrend alarm={selected} expanded /><div className="alarm-analysis-footer">{dateTime(selected.occurredAt)} · 阈值 {selected.metric.threshold} {selected.metric.unit} · {selected.samples.length} 个采样点</div></div></AlarmDialog>}
    {canCreateOrder && order && <AlarmDialog title="新建告警工单" onClose={() => setOrder(null)}><form className="alarm-order-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!order.title.trim() || !order.assignee.trim()) { setOrderError("请填写工单标题和负责人"); return; }
      if (!DEMO_MODE) {
        if (orderBusy) return;
        if (!/^\d+$/.test(order.alarmId) || !/^\d+$/.test(station.id) || !/^\d+$/.test(order.assignee)) { setOrderError("告警、站点或负责人编号无效"); return; }
        if (!order.note.trim()) { setOrderError("请填写处理说明"); return; }
        setOrderBusy(true);
        try {
          const result = await send<{id:number}>("/work-orders", "POST", {stationId:Number(station.id), alarmId:Number(order.alarmId), title:order.title.trim(), description:order.note.trim(), assignedTo:Number(order.assignee), dueAt:null});
          setOrderSaved(true); setOrderError(""); setNotice(`工单 ${result.id} 已由服务器创建`);
        } catch(error) {setOrderError(error instanceof Error ? error.message : "创建工单失败");}
        finally {setOrderBusy(false);}
        return;
      }
      try { localStorage.setItem(`alarm-order:${station.id}:${order.alarmId}`, JSON.stringify(order)); setOrderSaved(true); setOrderError(""); } catch { setOrderError("本地保存失败，请检查浏览器存储权限后重试"); }
    }}>
      <p>{station.name} · {order.alarmId}</p>
      <label>工单标题<input required value={order.title} onChange={(event) => { setOrder({ ...order, title: event.target.value }); setOrderSaved(false); }} /></label>
      <div className="alarm-order-fields"><label>负责人{DEMO_MODE ? <input required value={order.assignee} onChange={(event) => { setOrder({ ...order, assignee: event.target.value }); setOrderSaved(false); }} /> : <strong>{user?.name || user?.id}（当前用户）</strong>}</label><label>优先级<select value={order.priority} onChange={(event) => { setOrder({ ...order, priority: event.target.value }); setOrderSaved(false); }}><option>严重</option><option>重要</option><option>一般</option></select></label></div>
      <label>处理说明<textarea rows={4} value={order.note} onChange={(event) => { setOrder({ ...order, note: event.target.value }); setOrderSaved(false); }} /></label>
      <p className="alarm-order-note">{DEMO_MODE ? "工单服务未连接，草稿保存在本机。" : "工单将关联该告警并由服务器保存；优先级仅作页面参考。"}</p>
      {orderError && <p role="alert" className="alarm-text--critical">{orderError}</p>}
      {orderSaved && <p role="status" className="alarm-save-success"><Check size={15} />{DEMO_MODE ? "工单草稿已保存" : notice}</p>}
      <footer><button type="button" className="alarm-action" onClick={() => setOrder(null)}>关闭</button><button type="submit" className="alarm-action alarm-action--primary" disabled={orderSaved || orderBusy}>{DEMO_MODE ? "保存草稿" : "创建工单"}</button></footer>
    </form></AlarmDialog>}
  </div>;
}
