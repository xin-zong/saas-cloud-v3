import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { Station } from "@/App";
import { api, DEMO_MODE, type ApiRow } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { hasStationPermission } from "@/auth/apiPermissions";
import { StrategyIcon } from "./ModeEditor";
import {
  minute,
  days,
  shanghaiCalendar,
  effectiveTariff,
  tariffUnit,
  type Workspace,
  type Strategy,
} from "./model";
export default function StrategyOverview({
  station,
  workspace,
  canManage,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
  onPrice,
}: {
  station: Station;
  workspace: Workspace;
  canManage: boolean;
  onSelect: (id: string) => void;
  onEdit: (p: Strategy) => void;
  onDelete: (p: Strategy) => void;
  onCreate: () => void;
  onPrice: () => void;
}) {
  const { user } = useAuth();
  const [tariffs, setTariffs] = useState<ApiRow[]>([]);
  const [error, setError] = useState("");
  const now = new Date();
  const calendar = shanghaiCalendar(now);
  const date = calendar.date;
  const [weekday, setWeekday] = useState(calendar.weekday);
  const readPrice =
    DEMO_MODE ||
    hasStationPermission(user, station.id, "tariff.read") ||
    hasStationPermission(user, station.id, "tariff.manage");
  useEffect(() => {
    const controller = new AbortController();
    setTariffs([]);
    setError("");
    if (!DEMO_MODE && readPrice)
      api<ApiRow[]>(`/stations/${encodeURIComponent(station.id)}/tariffs`, {
        signal: controller.signal,
      })
        .then((rows) => {
          if (!controller.signal.aborted) setTariffs(rows);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    return () => controller.abort();
  }, [station.id, readPrice]);
  const active = workspace.plans.find((p) => p.id === workspace.selected);
  const tariff = effectiveTariff(tariffs, date);
  const unit = tariffUnit(tariff);
  const rows = ((tariff?.periods ?? []) as ApiRow[])
    .flatMap((row) => [
      { minute: Number(row.start_minute), price: Number(row.price_per_kwh) },
      { minute: Number(row.end_minute), price: Number(row.price_per_kwh) },
    ])
    .filter((r) => Number.isFinite(r.minute) && Number.isFinite(r.price));
  const slots =
    active?.slots
      .filter((s) => s.days.includes(weekday))
      .sort((a, b) => minute(a.start) - minute(b.start)) ?? [];
  return (
    <>
      <section className="strategy-card strategy-overview-chart">
        <header>
          <h2>今日电价与运行模式</h2>
          <span>{date}</span>
          <div className="strategy-legend">
            <span>{tariff ? "购电电价" : "暂无有效电价"}</span>
            <span>━ 购电</span>
            <span>━ 售电 · 未接入</span>
          </div>
          <button aria-label="编辑电价" disabled={!readPrice} onClick={onPrice}>
            <StrategyIcon name="edit" />
          </button>
        </header>
        <div className="strategy-chart-label">电价（{unit}）</div>
        <div className="strategy-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 12, right: 26, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e8ecee" />
              <XAxis
                type="number"
                dataKey="minute"
                domain={[0, 1440]}
                ticks={[0, 240, 480, 720, 960, 1200, 1440]}
                hide
              />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#62727b" }}
                domain={rows.length ? ["auto", "auto"] : [0, 1.2]}
              />
              <Tooltip
                formatter={(value) => [`${value} ${unit}`, "购电"]}
                labelFormatter={(v) =>
                  `${String(Math.floor(Number(v) / 60)).padStart(2, "0")}:${String(Number(v) % 60).padStart(2, "0")}`
                }
              />
              <Line
                type="stepAfter"
                dataKey="price"
                name="购电"
                stroke="#1e6656"
                strokeWidth={3}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          {!rows.length && (
            <div className="strategy-chart-empty">
              {error ||
                (!readPrice ? "无电价读取权限" : "暂无当前日期的有效电价数据")}
            </div>
          )}
        </div>
        <div className="strategy-timeline">
          {slots.map((slot) => (
            <button
              key={slot.id}
              style={{
                left: `${minute(slot.start) / 14.4}%`,
                width: `${(minute(slot.end) - minute(slot.start)) / 14.4}%`,
              }}
              title={`${slot.base} ${slot.start}—${slot.end}`}
              onClick={() => active && onEdit(active)}
            >
              <span>{slot.base}</span>
              <small>
                {slot.start}—{slot.end}
              </small>
            </button>
          ))}
          {!slots.length && (
            <span>
              未匹配时段 ·{" "}
              {active ? `默认配置：${active.fallback.base}` : "暂无策略草稿"}
            </span>
          )}
        </div>
        <div className="strategy-chart-ticks">
          {["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"].map(
            (time) => (
              <span key={time}>{time}</span>
            ),
          )}
        </div>
      </section>
      <section className="strategy-card">
        <header>
          <h2>运行策略</h2>
          <span>本地草稿 · 选择仅预览，不代表设备执行</span>
          <select
            aria-label="运行模式生效日"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {days.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
          <button
            aria-label="新增策略方案"
            disabled={!canManage}
            onClick={onCreate}
          >
            +
          </button>
        </header>
        <div className="strategy-plan-grid">
          {workspace.plans.map((plan) => (
            <article
              key={plan.id}
              className={plan.id === workspace.selected ? "selected" : ""}
            >
              <h3>{plan.name}</h3>
              <button
                className="strategy-plan-switch"
                role="switch"
                aria-label={`预览${plan.name}`}
                aria-checked={plan.id === workspace.selected}
                onClick={() => onSelect(plan.id)}
              >
                <StrategyIcon
                  name={
                    plan.id === workspace.selected ? "switch-on" : "switch-off"
                  }
                />
              </button>
              <p>{plan.description || "尚未填写策略说明"}</p>
              <div className="strategy-plan-actions">
                <button
                  aria-label={`编辑${plan.name}`}
                  onClick={() => onEdit(plan)}
                >
                  <StrategyIcon name="edit" />
                </button>
                <button
                  aria-label={`删除${plan.name}`}
                  disabled={!canManage}
                  onClick={() => onDelete(plan)}
                >
                  <StrategyIcon name="delete" />
                </button>
              </div>
            </article>
          ))}
          {!workspace.plans.length && (
            <p className="strategy-empty">暂无策略方案，点击 + 创建本地草稿</p>
          )}
        </div>
      </section>
    </>
  );
}
