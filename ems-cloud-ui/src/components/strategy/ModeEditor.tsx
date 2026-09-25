import { useState } from "react";
import { Modal } from "../station-provision/Common";
import {
  bases,
  overlays,
  fields,
  days,
  copy,
  uid,
  validateSlot,
  movePriority,
  type Slot,
  type Mode,
  type Overlay,
  type Period,
} from "./model";
export function StrategyIcon({ name }: { name: string }) {
  return <img src={`/figma/strategy/${name}.svg`} alt="" draggable={false} />;
}
export default function ModeEditor({
  value,
  others,
  rated,
  isDefault = false,
  isNew = false,
  disabled,
  onSave,
  onClose,
}: {
  value: Slot;
  others: Slot[];
  rated: number;
  isDefault?: boolean;
  isNew?: boolean;
  disabled: boolean;
  onSave: (s: Slot) => void;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState(() => copy(value));
  const [tab, setTab] = useState("基础模式");
  const [mode, setMode] = useState<Mode>(value.base);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(-1);
  const unavailable =
    ["VPP", "AGC", "调峰", "AVC"].includes(mode) && tab === "覆盖模式";
  const update = (patch: Partial<Slot>) => {
    setSlot({ ...slot, ...patch });
    setError("");
  };
  const toggle = (name: Overlay) =>
    update({
      overlays: slot.overlays.includes(name)
        ? slot.overlays.filter((x) => x !== name)
        : [...slot.overlays, name],
    });
  const title = isDefault
    ? "默认策略设置"
    : isNew
      ? "新增策略时段"
      : "编辑策略时段";
  const save = () => {
    const issue = validateSlot(slot, others, rated, isDefault);
    if (issue) {
      setError(issue);
      return;
    }
    onSave(slot);
  };
  function periodRows(key: "charge" | "discharge") {
    const label = key === "charge" ? "充电" : "放电";
    const patch = (index: number, changes: Partial<Period>) =>
      update({
        [key]: slot[key].map((row, i) =>
          i === index ? { ...row, ...changes } : row,
        ),
      });
    return (
      <section className="strategy-period-section">
        <header>
          <span>{label}时段</span>
          <button
            aria-label={`新增${label}时段`}
            disabled={disabled}
            onClick={() =>
              update({
                [key]: [
                  ...slot[key],
                  {
                    id: uid(),
                    start: "00:00",
                    end: "01:00",
                    power: "0",
                    enabled: true,
                  },
                ],
              })
            }
          >
            +
          </button>
        </header>
        {slot[key].map((row, index) => (
          <div className="strategy-power-row" key={row.id}>
            <input
              aria-label={`${label}${index + 1}开始`}
              value={row.start}
              disabled={disabled}
              onChange={(e) => patch(index, { start: e.target.value })}
            />
            <span>—</span>
            <input
              aria-label={`${label}${index + 1}结束`}
              value={row.end}
              disabled={disabled}
              onChange={(e) => patch(index, { end: e.target.value })}
            />
            <span>→</span>
            <input
              type="number"
              aria-label={`${label}${index + 1}功率`}
              min="0"
              max={rated}
              value={row.power}
              disabled={disabled}
              onChange={(e) => patch(index, { power: e.target.value })}
            />
            <span>kW</span>
            <label>
              <input
                type="checkbox"
                checked={row.enabled}
                disabled={disabled}
                onChange={(e) => patch(index, { enabled: e.target.checked })}
              />
              启用
            </label>
            <button
              aria-label={`删除${label}时段${index + 1}`}
              disabled={disabled}
              onClick={() =>
                update({ [key]: slot[key].filter((_, i) => i !== index) })
              }
            >
              <StrategyIcon name="period-delete" />
            </button>
          </div>
        ))}
        {!slot[key].length && (
          <p className="strategy-empty-small">暂无{label}时段</p>
        )}
      </section>
    );
  }
  return (
    <div className="strategy-mode-dialog">
      <Modal title={title} onClose={onClose}>
        <span className="strategy-modal-divider">
          <StrategyIcon name="divider" />
        </span>
        {!isDefault && (
          <div className="strategy-time-settings">
            <strong>时段设置</strong>
            <div>
              <span>生效日期（可多选）</span>
              <div className="strategy-weekdays">
                {days.map((day, index) => (
                  <button
                    key={day}
                    aria-pressed={slot.days.includes(index)}
                    disabled={disabled}
                    onClick={() =>
                      update({
                        days: slot.days.includes(index)
                          ? slot.days.filter((x) => x !== index)
                          : [...slot.days, index].sort(),
                      })
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <label>
              开始时间
              <input
                aria-label="开始时间"
                value={slot.start}
                disabled={disabled}
                onChange={(e) => update({ start: e.target.value })}
              />
            </label>
            <label>
              结束时间
              <input
                aria-label="结束时间"
                value={slot.end}
                disabled={disabled}
                onChange={(e) => update({ end: e.target.value })}
              />
            </label>
          </div>
        )}
        <div className="strategy-mode-heading">
          <span>模式设置</span>
          <label>
            高级模式设置
            <button
              className="strategy-advanced-switch"
              role="switch"
              aria-label="高级模式设置"
              aria-checked={slot.advanced}
              disabled={disabled}
              onClick={() => {
                update({ advanced: !slot.advanced });
                setTab("基础模式");
                setMode(slot.base);
              }}
            >
              <StrategyIcon name="knob" />
            </button>
          </label>
        </div>
        <div className="strategy-mode-tabs">
          {[
            "基础模式",
            ...(slot.advanced ? ["覆盖模式", "模式优先级"] : []),
          ].map((item) => (
            <button
              key={item}
              aria-pressed={tab === item}
              onClick={() => {
                setTab(item);
                setMode(item === "覆盖模式" ? "需量控制" : slot.base);
              }}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "模式优先级" ? (
          <div className="strategy-priority">
            <h3>模式优先级</h3>
            <p className="strategy-muted">
              仅对已启用的覆盖模式排序；未触发时回退基础模式。
            </p>
            {slot.priority
              .filter((name) => slot.overlays.includes(name))
              .map((name, visibleIndex, enabled) => {
                const index = slot.priority.indexOf(name);
                return (
                  <div
                    key={name}
                    draggable={!disabled}
                    onDragStart={() => setDrag(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!disabled && drag >= 0)
                        update({
                          priority: movePriority(slot.priority, drag, index),
                        });
                      setDrag(-1);
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                    <span>
                      <small>{name === "VPP" ? "外部调度" : "条件模式"}</small>
                      {name}
                    </span>
                    <button
                      aria-label={`上移${name}`}
                      disabled={disabled || visibleIndex === 0}
                      onClick={() =>
                        update({
                          priority: movePriority(
                            slot.priority,
                            index,
                            slot.priority.indexOf(enabled[visibleIndex - 1]),
                          ),
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`下移${name}`}
                      disabled={disabled || visibleIndex === enabled.length - 1}
                      onClick={() =>
                        update({
                          priority: movePriority(
                            slot.priority,
                            index,
                            slot.priority.indexOf(enabled[visibleIndex + 1]),
                          ),
                        })
                      }
                    >
                      ↓
                    </button>
                    <small>拖动排序</small>
                  </div>
                );
              })}
            {!slot.overlays.length && (
              <p className="strategy-empty-small">
                请先在覆盖模式中启用条件模式
              </p>
            )}
          </div>
        ) : (
          <div className="strategy-mode-columns">
            <aside>
              <h3>{tab === "基础模式" ? "基础运行模式" : "覆盖模式"}</h3>
              {tab === "覆盖模式" && <small>条件触发</small>}
              {(tab === "基础模式" ? bases : overlays).map((name, index) => (
                <div key={name}>
                  {tab === "覆盖模式" && index === 4 && <small>外部调度</small>}
                  <button
                    className={mode === name ? "selected" : ""}
                    aria-label={name}
                    onClick={() => {
                      setMode(name);
                      if (tab === "基础模式" && !disabled)
                        update({ base: name as Slot["base"] });
                    }}
                  >
                    <StrategyIcon
                      name={
                        (
                          tab === "基础模式"
                            ? slot.base === name
                            : slot.overlays.includes(name as Overlay)
                        )
                          ? "radio-on"
                          : "radio-off"
                      }
                    />
                    {name}
                    {["VPP", "AGC", "调峰", "AVC"].includes(name) && (
                      <small>未接入</small>
                    )}
                  </button>
                </div>
              ))}
            </aside>
            <section className="strategy-mode-parameters">
              <h3>{mode}</h3>
              {mode === "峰谷套利" && (
                <div className="strategy-parameter-divider">
                  <StrategyIcon name="mode-divider" />
                </div>
              )}
              {mode === "峰谷套利" ? (
                <>
                  <small>模式内部时间</small>
                  {periodRows("charge")}
                  {periodRows("discharge")}
                </>
              ) : (
                <>
                  <small>模式参数</small>
                  <div className="strategy-parameter-grid">
                    {fields[mode].map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <div>
                          {field.options ? (
                            <select
                              aria-label={field.label}
                              value={
                                field.readonly
                                  ? field.initial
                                  : slot.params[mode][field.key]
                              }
                              disabled={disabled}
                              onChange={(e) =>
                                update({
                                  params: {
                                    ...slot.params,
                                    [mode]: {
                                      ...slot.params[mode],
                                      [field.key]: e.target.value,
                                    },
                                  },
                                })
                              }
                            >
                              {field.options.map((option) => (
                                <option key={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              aria-label={field.label}
                              type={field.readonly ? "text" : "number"}
                              step="any"
                              value={
                                field.readonly
                                  ? field.initial
                                  : slot.params[mode][field.key]
                              }
                              disabled={disabled || field.readonly}
                              onChange={(e) =>
                                update({
                                  params: {
                                    ...slot.params,
                                    [mode]: {
                                      ...slot.params[mode],
                                      [field.key]: e.target.value,
                                    },
                                  },
                                })
                              }
                            />
                          )}
                          <span>{field.unit}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
              {tab === "覆盖模式" && (
                <label className="strategy-enable">
                  <input
                    type="checkbox"
                    aria-label={
                      unavailable ? `纳入本地预览：${mode}` : `启用${mode}`
                    }
                    disabled={disabled}
                    checked={slot.overlays.includes(mode as Overlay)}
                    onChange={() => toggle(mode as Overlay)}
                  />
                  {unavailable ? `纳入本地预览：${mode}` : `启用${mode}`}
                </label>
              )}
              {unavailable && (
                <p className="strategy-muted">
                  外部调度服务未接入。参数和授权意向仅保存为本地草稿，不会连接服务或下发设备。
                </p>
              )}
            </section>
          </div>
        )}
        {error && (
          <p className="strategy-error" role="alert">
            {error}
          </p>
        )}
        <div className="strategy-dialog-actions">
          {unavailable && <button disabled>下发（未接入）</button>}
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={disabled} onClick={save}>
            {isDefault ? "保存默认设置" : "保存设置"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
