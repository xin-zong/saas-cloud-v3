import { useEffect, useState } from "react";
import type { Station } from "@/App";
import { DEMO_MODE } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { hasStationPermission } from "@/auth/apiPermissions";
import { ROLE_CONFIG } from "@/auth/roles";
import { Modal } from "./station-provision/Common";
import StationPriceSettingsPage from "./StationPriceSettingsPage";
import ModeEditor, { StrategyIcon } from "./strategy/ModeEditor";
import StrategyOverview from "./strategy/StrategyOverview";
import StrategyAssistant from "./strategy/StrategyAssistant";
import InternalPlans from "./strategy/InternalPlans";
import {
  copy,
  uid,
  newSlot,
  newStrategy,
  decodeWorkspace,
  validateStrategy,
  days,
  summary,
  type Strategy,
  type Slot,
  type Workspace,
} from "./strategy/model";
import "./strategy/strategy.css";

function initialWorkspace(key: string, station: Station): Workspace {
  const raw = localStorage.getItem(key);
  if (raw !== null) return decodeWorkspace(raw);
  if (!DEMO_MODE) return { plans: [], selected: "" };
  const plan = newStrategy(`snapshot-${station.id}`);
  plan.name = `${station.mode || "运行"} · 本地方案`;
  plan.description = "从站点交付计划复制的本地草稿，尚未提交";
  const date = station.operations?.plan
    ?.map((p) => p.date)
    .sort()
    .at(-1);
  plan.slots = (station.operations?.plan ?? [])
    .filter((p) => p.date === date)
    .map((row) => {
      const slot = newSlot();
      slot.id = row.id;
      slot.start = row.start;
      slot.end = row.end;
      slot.base = row.mode === "standby" ? "光伏自发自用" : "峰谷套利";
      if (row.mode !== "standby")
        slot[row.mode === "charge" ? "charge" : "discharge"] = [
          {
            id: uid(),
            start: row.start,
            end: row.end,
            power: String(row.power),
            enabled: true,
          },
        ];
      return slot;
    });
  return { plans: [plan], selected: plan.id };
}
function StrategyWorkspace({ station }: { station: Station }) {
  const { user } = useAuth();
  const demoAllowed =
    !!user && ROLE_CONFIG[user.role].stationSubNavs.includes("运行策略");
  const canRead = DEMO_MODE
    ? demoAllowed
    : hasStationPermission(user, station.id, "strategy.read");
  const canManage = DEMO_MODE
    ? demoAllowed
    : hasStationPermission(user, station.id, "strategy.manage");
  const key = `enerlution-strategy-workspace-v2:${DEMO_MODE ? "demo" : "api"}:${user?.id ?? "anonymous"}:${station.id}`;
  const [workspace, setWorkspace] = useState(() =>
    initialWorkspace(key, station),
  );
  const [editor, setEditor] = useState<Strategy | null>(null);
  const [base, setBase] = useState("");
  const [view, setView] = useState<"overview" | "editor" | "price">("overview");
  const [slot, setSlot] = useState<{
    value: Slot;
    isDefault: boolean;
    isNew: boolean;
  } | null>(null);
  const [form, setForm] = useState<{
    id: string;
    name: string;
    description: string;
    create: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    plan?: Strategy;
    slot?: Slot;
  } | null>(null);
  const [ai, setAi] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const dirty = !!editor && JSON.stringify(editor) !== base;
  useEffect(() => {
    if (!canManage) {
      setSlot(null);
      setForm(null);
      setDeleting(null);
      setAi(false);
    }
  }, [canManage]);
  function persist(next: Workspace) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setWorkspace(next);
      return true;
    } catch {
      setError("浏览器无法保存本地草稿，请检查可用存储空间");
      return false;
    }
  }
  function open(plan: Strategy) {
    setEditor(copy(plan));
    setBase(JSON.stringify(plan));
    setView("editor");
    setError("");
    setNotice("");
  }
  function leave() {
    if (dirty) {
      setLeaving(true);
      return;
    }
    setView("overview");
    setEditor(null);
    setNotice("");
    setError("");
  }
  function save() {
    if (!editor || !canManage) return;
    const issue = validateStrategy(editor, station.ratedPower);
    if (issue) {
      setError(issue);
      return;
    }
    if (
      persist({
        plans: workspace.plans.map((p) =>
          p.id === editor.id ? copy(editor) : p,
        ),
        selected: editor.id,
      })
    ) {
      setBase(JSON.stringify(editor));
      setError("");
      setNotice("本地草稿已保存；尚未提交审批或向 EMS 下发。");
    }
  }
  function saveForm() {
    if (!form || !canManage) return;
    if (!form.name.trim()) {
      setError("请填写方案名称");
      return;
    }
    const plan = form.create
      ? newStrategy(form.id)
      : copy(editor ?? workspace.plans.find((p) => p.id === form.id)!);
    plan.name = form.name.trim();
    plan.description = form.description.trim();
    if (form.create) {
      if (persist({ plans: [...workspace.plans, plan], selected: plan.id })) {
        setForm(null);
        open(plan);
      }
    } else {
      setEditor(plan);
      setForm(null);
      setError("");
    }
  }
  if (!canRead)
    return (
      <div className="strategy-workspace">
        <p role="alert">当前账号无策略读取权限</p>
      </div>
    );
  if (view === "price")
    return (
      <StationPriceSettingsPage
        station={station}
        onOpenStrategy={() => setView("overview")}
      />
    );
  return (
    <main
      className={`strategy-workspace ${view === "editor" ? "strategy-editing" : ""}`}
      data-strategy-view={view}
    >
      {error && (
        <p role="alert" className="strategy-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="strategy-notice">
          {notice}
        </p>
      )}
      {view === "overview" ? (
        <>
          <StrategyOverview
            station={station}
            workspace={workspace}
            canManage={canManage}
            onSelect={(id) => persist({ ...workspace, selected: id })}
            onEdit={open}
            onDelete={(plan) => setDeleting({ plan })}
            onCreate={() => {
              setError("");
              setForm({ id: uid(), name: "", description: "", create: true });
            }}
            onPrice={() => setView("price")}
          />
          {!DEMO_MODE && <InternalPlans key={station.id} station={station} />}
        </>
      ) : (
        editor && (
          <>
            <nav className="strategy-editor-nav">
              <button onClick={leave}>返回综合页</button>
              <button
                onClick={() => setForm({ ...editor, create: false })}
                disabled={!canManage}
              >
                方案设置
              </button>
            </nav>
            <header className="strategy-title">
              <h1>编辑运行策略</h1>
              <div>
                <span className="strategy-local-badge">
                  {dirty ? "未保存修改" : "本地草稿"}
                </span>
                <button onClick={leave}>取消</button>
                <button
                  className="primary"
                  disabled={!canManage}
                  onClick={save}
                >
                  保存策略
                </button>
              </div>
            </header>
            <section className="strategy-card strategy-name-fields">
              <label>
                策略名称
                <input
                  aria-label="策略名称"
                  value={editor.name}
                  disabled={!canManage}
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </label>
              <label>
                策略说明
                <input
                  aria-label="策略说明"
                  value={editor.description}
                  disabled={!canManage}
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                />
              </label>
            </section>
            <section className="strategy-card strategy-slot-table">
              <header>
                <h2>运行时段</h2>
                <span>{editor.slots.length} 个时段 · 1 个默认配置</span>
                <button
                  className="primary"
                  aria-label="新增时段"
                  disabled={!canManage}
                  onClick={() => {
                    const next = newSlot();
                    next.start =
                      editor.slots.at(-1)?.end === "24:00"
                        ? "00:00"
                        : (editor.slots.at(-1)?.end ?? "00:00");
                    setSlot({ value: next, isDefault: false, isNew: true });
                  }}
                >
                  + 新增时段
                </button>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>时段</th>
                    <th>生效日</th>
                    <th>基础模式</th>
                    <th>基础参数</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {editor.slots.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        {row.start}—{row.end}
                      </td>
                      <td>
                        {row.days.length === 7
                          ? "每天"
                          : row.days.map((d) => days[d]).join("、")}
                      </td>
                      <td>
                        <span
                          className={`strategy-mode-badge ${row.base === "峰谷套利" ? "accent" : ""}`}
                        >
                          {row.base}
                        </span>
                      </td>
                      <td>{summary(row)}</td>
                      <td>
                        <div className="strategy-table-actions">
                          <button
                            aria-label={`编辑时段${index + 1}`}
                            onClick={() =>
                              setSlot({
                                value: row,
                                isDefault: false,
                                isNew: false,
                              })
                            }
                          >
                            <StrategyIcon name="row-edit" />
                          </button>
                          <button
                            aria-label={`删除时段${index + 1}`}
                            disabled={!canManage}
                            onClick={() => setDeleting({ slot: row })}
                          >
                            <StrategyIcon name="row-delete" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>默认配置</td>
                    <td>未匹配时段</td>
                    <td>
                      <span className="strategy-mode-badge">
                        {editor.fallback.base}
                      </span>
                    </td>
                    <td>{summary(editor.fallback)}</td>
                    <td>
                      <button
                        aria-label="编辑默认配置"
                        onClick={() =>
                          setSlot({
                            value: editor.fallback,
                            isDefault: true,
                            isNew: false,
                          })
                        }
                      >
                        <StrategyIcon name="row-edit" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="strategy-table-tip">
                列表仅展示基础模式设置；覆盖模式和优先级在新增时段的高级设置中配置
              </p>
            </section>
            <p className="strategy-muted">
              模式参数保存在本机草稿中。现有服务器接口仅支持充电、放电、待机日计划及内部审批；高级模式和
              EMS 下发尚未接通。
            </p>
            <button
              className="strategy-ai-tab"
              onClick={() => setAi(true)}
              aria-label="AI 策略"
            >
              AI
              <br />策<br />略
            </button>
          </>
        )
      )}
      {slot && editor && (
        <ModeEditor
          key={slot.value.id}
          value={slot.value}
          others={editor.slots}
          rated={station.ratedPower}
          isDefault={slot.isDefault}
          isNew={slot.isNew}
          disabled={!canManage}
          onClose={() => setSlot(null)}
          onSave={(next) => {
            if (!canManage) return;
            setEditor(
              slot.isDefault
                ? { ...editor, fallback: next }
                : {
                    ...editor,
                    slots: slot.isNew
                      ? [...editor.slots, next]
                      : editor.slots.map((s) => (s.id === next.id ? next : s)),
                  },
            );
            setSlot(null);
          }}
        />
      )}
      {form && (
        <div className="strategy-form-dialog">
          <Modal
            title={form.create ? "新增策略方案" : "策略方案设置"}
            onClose={() => {
              setForm(null);
              setError("");
            }}
          >
            <p className="strategy-muted">
              {form.create
                ? "填写名称和说明，保存后再配置各星期的运行时段。"
                : "修改方案名称和说明，不会立即下发设备。"}
            </p>
            <label>
              方案名称
              <input
                aria-label="方案名称"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              说明
              <textarea
                aria-label="说明"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            {error && (
              <p role="alert" className="strategy-error">
                {error}
              </p>
            )}
            <div className="strategy-dialog-actions">
              {!form.create && (
                <button
                  className="danger"
                  onClick={() => {
                    setDeleting({ plan: editor! });
                    setForm(null);
                  }}
                >
                  删除方案
                </button>
              )}
              <button
                onClick={() => {
                  setForm(null);
                  setError("");
                }}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={!canManage}
                onClick={saveForm}
              >
                {form.create ? "创建并配置" : "保存设置"}
              </button>
            </div>
          </Modal>
        </div>
      )}
      {deleting && (
        <div className="strategy-confirm-dialog">
          <Modal
            title={deleting.plan ? "删除策略方案？" : "删除策略时段？"}
            onClose={() => setDeleting(null)}
          >
            <StrategyIcon name="delete" />
            <p>
              {deleting.plan
                ? `方案「${deleting.plan.name}」及其 ${deleting.plan.slots.length} 个时段配置将从本地删除。`
                : `${deleting.slot!.start}—${deleting.slot!.end} 的策略时段将从当前草稿移除。`}
            </p>
            <p className="strategy-muted">
              此操作不会删除服务器计划或影响设备运行。
            </p>
            <div className="strategy-dialog-actions">
              <button onClick={() => setDeleting(null)}>取消</button>
              <button
                className="danger"
                disabled={!canManage}
                onClick={() => {
                  if (!canManage) return;
                  if (deleting.plan) {
                    const plans = workspace.plans.filter(
                      (p) => p.id !== deleting.plan!.id,
                    );
                    if (
                      !persist({
                        plans,
                        selected:
                          workspace.selected === deleting.plan.id
                            ? (plans[0]?.id ?? "")
                            : workspace.selected,
                      })
                    )
                      return;
                    if (editor?.id === deleting.plan.id) {
                      setEditor(null);
                      setView("overview");
                    }
                  } else if (editor)
                    setEditor({
                      ...editor,
                      slots: editor.slots.filter(
                        (s) => s.id !== deleting.slot!.id,
                      ),
                    });
                  setDeleting(null);
                }}
              >
                {deleting.plan ? "删除方案" : "删除时段"}
              </button>
            </div>
          </Modal>
        </div>
      )}
      {ai && editor && (
        <StrategyAssistant
          plan={editor}
          rated={station.ratedPower}
          demo={DEMO_MODE}
          disabled={!canManage}
          onClose={() => setAi(false)}
          onInsert={(plan) => {
            if (!canManage) return;
            if (
              persist({ plans: [...workspace.plans, plan], selected: plan.id })
            ) {
              open(plan);
              setAi(false);
              setNotice("本地草案已插入为新方案，尚未提交；原方案未修改。");
            }
          }}
        />
      )}
      {leaving && (
        <Modal title="未保存的策略" onClose={() => setLeaving(false)}>
          <p>当前修改尚未保存，离开后会丢失。</p>
          <div className="strategy-dialog-actions">
            <button onClick={() => setLeaving(false)}>继续编辑</button>
            <button
              onClick={() => {
                setLeaving(false);
                setEditor(null);
                setView("overview");
              }}
            >
              放弃修改
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
export default function StationStrategyPage({ station }: { station: Station }) {
  const { user } = useAuth();
  return (
    <StrategyWorkspace key={`${user?.id}:${station.id}`} station={station} />
  );
}
