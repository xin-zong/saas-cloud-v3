import { useEffect, useState } from "react";
import { Save, Send, Plus } from "lucide-react";
import type { Station } from "@/App";
import { api, send, type ApiRow } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { hasStationPermission } from "@/auth/apiPermissions";
import { planPeriods, validatePlan, type PlanPeriod } from "@/api/planning";
const card = {
  border: "1px solid #dce3e8",
  borderRadius: 12,
  background: "white",
};
const secondaryButton = {
  padding: "7px 12px",
  border: "1px solid #dce3e8",
  borderRadius: 6,
  background: "white",
  fontSize: 12,
  display: "inline-flex",
  gap: 6,
  alignItems: "center",
};
const primaryButton = {
  ...secondaryButton,
  background: "#176e5b",
  color: "white",
};
export default function InternalPlans({ station }: { station: Station }) {
  const { user } = useAuth();
  const canRead = hasStationPermission(user, station.id, "strategy.read");
  const canManage = hasStationPermission(user, station.id, "strategy.manage");
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }),
  );
  const [kind, setKind] = useState<"dayAhead" | "intraday">("dayAhead");
  const [plans, setPlans] = useState<ApiRow[]>([]);
  const [selected, setSelected] = useState("");
  const [periods, setPeriods] = useState<PlanPeriod[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const current = plans.find((plan) => String(plan.id) === selected);
  const choose = (plan?: ApiRow) => {
    setSelected(plan ? String(plan.id) : "");
    setPeriods(planPeriods((plan?.periods ?? []) as ApiRow[]));
    setKind(plan?.kind === "intraday" ? "intraday" : "dayAhead");
    setDirty(false);
  };
  useEffect(() => {
    const controller = new AbortController();
    setPlans([]);
    choose();
    if (!canRead) {
      setNotice("当前账号无策略读取权限");
      return;
    }
    setBusy(true);
    api<ApiRow[]>(`/stations/${station.id}/plans?date=${date}`, {
      signal: controller.signal,
    })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setPlans(rows);
          choose(rows[0]);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [station.id, date, canRead, revision]);
  const change = (id: string, patch: Partial<PlanPeriod>) => {
    setPeriods((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
    setDirty(true);
  };
  async function savePlan() {
    if (busy || !canManage) return;
    setBusy(true);
    setNotice("");
    try {
      if (!Number.isFinite(station.ratedPower) || station.ratedPower < 0) {
        throw new Error("站点额定功率不可用，无法校验计划功率");
      }
      const payload = validatePlan(periods, station.ratedPower);
      const result = await send<{ id: number; version: number }>(
        "/plans",
        "POST",
        { stationId: Number(station.id), date, kind, periods: payload },
      );
      setNotice(`草稿版本 ${result.version} 已保存至服务器；尚未审批或执行`);
      setRevision((v) => v + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function submitPlan() {
    if (busy || !canManage || dirty || current?.status !== "draft") return;
    setBusy(true);
    setNotice("");
    try {
      await send(`/plans/${selected}/submit`, "POST");
      setNotice("已提交内部审批；未向 EMS 下发，未执行");
      setRevision((v) => v + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    draft: "服务器草稿",
    submitted: "待内部审批",
    approved: "已审批（未表示执行）",
    rejected: "审批驳回",
  };
  return (
    <div
      className="station-strategy-page"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        padding: "14px 20px 22px",
        background: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div>
            <p style={{ color: "#61716b", fontSize: 11 }}>
              {station.name} · UTC+8 · 内部计划
            </p>
            <h1 style={{ fontSize: 19, fontWeight: 800 }}>服务器内部计划</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={secondaryButton}
              disabled={!canManage || busy}
              onClick={() => {
                choose();
                setNotice("新版本草稿尚未保存");
              }}
            >
              新建空白计划
            </button>
            <button
              style={secondaryButton}
              disabled={!canManage || busy || !periods.length}
              onClick={savePlan}
            >
              <Save size={13} />
              保存新版本草稿
            </button>
            <button
              style={primaryButton}
              disabled={
                !canManage || busy || dirty || current?.status !== "draft"
              }
              onClick={submitPlan}
            >
              <Send size={13} />
              提交内部审批
            </button>
          </div>
        </header>
        <p style={{ fontSize: 12, color: "#61716b" }}>
          保存会创建新版本，不覆盖历史版本。审批通过不表示设备执行。AI优化、约束下发、仿真和
          EMS 执行暂未接入。
        </p>
        <div role="status" style={{ color: "#9a5b1a" }}>
          {busy ? "正在与服务器同步…" : notice}
        </div>
        <section style={{ ...card, padding: 16 }}>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label>
              计划日期{" "}
              <input
                aria-label="策略计划日期"
                type="date"
                value={date}
                disabled={busy}
                onChange={(e) => {
                  setDate(e.target.value);
                  setNotice("");
                }}
              />
            </label>
            <label>
              版本{" "}
              <select
                aria-label="策略版本"
                value={selected}
                disabled={busy}
                onChange={(e) =>
                  choose(plans.find((p) => String(p.id) === e.target.value))
                }
              >
                <option value="">未保存草稿</option>
                {plans.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    V{String(p.version)} ·{" "}
                    {labels[String(p.status)] || String(p.status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              计划类型{" "}
              <select
                aria-label="策略计划类型"
                value={kind}
                disabled={!canManage || busy}
                onChange={(e) => {
                  setKind(e.target.value as "dayAhead" | "intraday");
                  setDirty(true);
                }}
              >
                <option value="dayAhead">日前计划</option>
                <option value="intraday">日内计划</option>
              </select>
            </label>
            <span>
              {current ? labels[String(current.status)] : "未保存"}
              {dirty ? " · 有未保存修改" : ""}
            </span>
          </div>
          {!periods.length && <p>该日期暂无计划时段。不会自动生成演示计划。</p>}
        </section>
        <section style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>日计划时段</h2>
            <button
              style={secondaryButton}
              disabled={!canManage || busy}
              onClick={() => {
                setPeriods((rows) => [
                  ...rows,
                  {
                    id: `draft-${Date.now()}`,
                    start: "00:00",
                    end: "01:00",
                    mode: "standby",
                    power: 0,
                  },
                ]);
                setDirty(true);
              }}
            >
              <Plus size={13} />
              新增时段
            </button>
          </div>
          <fieldset
            disabled={!canManage || busy}
            style={{ border: 0, padding: 0 }}
          >
            <table style={{ width: "100%", marginTop: 16 }}>
              <thead>
                <tr>
                  <th>开始时间</th>
                  <th>结束时间</th>
                  <th>模式</th>
                  <th>计划功率 kW</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        aria-label="计划开始时间"
                        value={p.start}
                        onChange={(e) =>
                          change(p.id, { start: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label="计划结束时间"
                        value={p.end}
                        onChange={(e) => change(p.id, { end: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="计划时段模式"
                        value={p.mode}
                        onChange={(e) =>
                          change(p.id, {
                            mode: e.target.value as PlanPeriod["mode"],
                          })
                        }
                      >
                        <option value="charge">充电</option>
                        <option value="discharge">放电</option>
                        <option value="standby">待机</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label="计划功率"
                        type="number"
                        min="0"
                        max={
                          Number.isFinite(station.ratedPower)
                            ? station.ratedPower
                            : undefined
                        }
                        value={p.power}
                        onChange={(e) =>
                          change(p.id, { power: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <button
                        style={secondaryButton}
                        onClick={() => {
                          setPeriods((rows) =>
                            rows.filter((row) => row.id !== p.id),
                          );
                          setDirty(true);
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
        </section>
      </div>
    </div>
  );
}
