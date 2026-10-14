import { useEffect, useState } from "react"
import { Button } from "../ui/Workspace"
import { Field, Modal } from "./Common"
import {
  parseRuntime,
  validateRuntime,
  type RuntimeParameters,
  type TimePeriod,
  type RuntimeIssue,
} from "./runtimeModel"
export function Switch({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className="provision-switch"
      role="switch"
      aria-label={label}
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  )
}
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
export default function RuntimeParametersPage({
  value,
  onChange,
  validationTrigger,
}: {
  value: RuntimeParameters
  onChange: (value: RuntimeParameters) => void
  validationTrigger: number
}) {
  const [tab, setTab] = useState(0),
    [checked, setChecked] = useState(false),
    [slot, setSlot] = useState<{
      key: "gridPeriods" | "peakPeriods"
      index: number
      value: TimePeriod
    } | null>(null),
    [slotError, setSlotError] = useState("")
  const r = parseRuntime(value),
    issues = checked ? validateRuntime(r) : []
  useEffect(() => {
    if (validationTrigger) setChecked(true)
  }, [validationTrigger])
  const change = (key: keyof RuntimeParameters, v: string | boolean) =>
    onChange({ ...r, [key]: v })
  const locate = (issue: RuntimeIssue) => {
    setTab(issue.tab)
    if (issue.period !== undefined) {
      const key = issue.field as "gridPeriods" | "peakPeriods"
      setSlot({
        key,
        index: issue.period,
        value: {
          ...r[key][issue.period],
          days: [...r[key][issue.period].days],
        },
      })
    } else
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-runtime-field="${issue.field}"]`)
          ?.focus(),
      )
  }
  const input = (
    key: keyof RuntimeParameters,
    label: string,
    disabled = false,
  ) => (
    <Field label={label}>
      <input
        data-runtime-field={key}
        aria-invalid={issues.some((x) => x.field === key)}
        type="number"
        min="0"
        max={key.toLowerCase().includes("soc") ? 100 : undefined}
        disabled={disabled}
        value={String(r[key])}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  )
  const toggle = (key: keyof RuntimeParameters, label: string) => (
    <Field label={label}>
      <Switch
        label={label}
        value={Boolean(r[key])}
        onChange={(v) => change(key, v)}
      />
    </Field>
  )
  function periods(key: "gridPeriods" | "peakPeriods") {
    return (
      <section className="runtime-periods station-panel">
        <h2>{key === "gridPeriods" ? "市电充电时段" : "削峰填谷时段"}</h2>
        <div className="provision-table-scroll">
          <table className="station-table">
            <thead>
              <tr>
                {[
                  "时段",
                  "状态",
                  "时间",
                  key === "gridPeriods" ? "市电充电" : "模式",
                  "最大功率(kW)",
                  ...(key === "peakPeriods"
                    ? ["调峰功率(kW)", "售电功率(kW)"]
                    : []),
                  "SOC(%)",
                  "生效星期",
                  "操作",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r[key].map((p, i) => (
                <tr key={i}>
                  <td>{String(i + 1).padStart(2, "0")}</td>
                  <td>{p.enabled ? "已启用" : "未启用"}</td>
                  <td>
                    {p.start}—{p.end}
                  </td>
                  <td>
                    {key === "gridPeriods"
                      ? p.gridCharge
                        ? "允许"
                        : "关闭"
                      : p.mode}
                  </td>
                  <td>{p.maxPower}</td>
                  {key === "peakPeriods" && (
                    <>
                      <td>{p.peakPower}</td>
                      <td>{p.exportPower}</td>
                    </>
                  )}
                  <td>{p.soc}</td>
                  <td>
                    {p.days.length
                      ? p.days.map((d) => weekdays[d - 1]).join("、")
                      : "未选择"}
                  </td>
                  <td>
                    <Button
                      aria-label={`编辑时段 ${String(i + 1).padStart(2, "0")}`}
                      onClick={() => {
                        setSlotError("")
                        setSlot({
                          key,
                          index: i,
                          value: { ...p, days: [...p.days] },
                        })
                      }}
                    >
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }
  return (
    <section
      className="provision-runtime"
      data-design-node={["3223:23087", "3223:24240", "3223:25393"][tab]}
    >
      <nav className="runtime-tabs" aria-label="运行参数分类">
        {["基础配置", "自发自用配置", "削峰填谷配置"].map((name, i) => (
          <button key={name} aria-pressed={i === tab} onClick={() => setTab(i)}>
            {name}
          </button>
        ))}
      </nav>
      {tab === 0 && (
        <div className="runtime-fields">
          <Field label="运行模式">
            <select
              data-runtime-field="mode"
              value={r.mode}
              onChange={(e) => change("mode", e.target.value)}
            >
              <option>自发自用</option>
              <option>削峰填谷</option>
            </select>
          </Field>
          <Field label="PCS 功率调度方式">
            <select
              value={r.dispatch}
              onChange={(e) => change("dispatch", e.target.value)}
            >
              <option>EMS 调度</option>
              <option>PCS 自主</option>
            </select>
          </Field>
          {toggle("noGridMeter", "无需电网侧电表运行")}
          {toggle("meterFilter", "电网侧电表滤波")}
          {input("transformerCapacity", "变压器可用容量（kVA）")}
          {input("dischargeSoc", "放电截止 SOC（%）")}
          {toggle("reserveEnabled", "强制保电")}
          {input("reserveSoc", "强制保电 SOC（%）", !r.reserveEnabled)}
          {input("forceStartSoc", "强充触发 SOC（%）")}
          {input("forceEndSoc", "强充解除 SOC（%）")}
        </div>
      )}
      {tab === 1 && (
        <>
          <div className="runtime-fields">
            {input("peakPower", "调峰功率（kW）")}
            {input("exportPower", "售电功率（kW）")}
            {toggle("chargeLimitEnabled", "启用充电 SOC 上限")}
            {input(
              "chargeLimitSoc",
              "充电 SOC 上限（%）",
              !r.chargeLimitEnabled,
            )}
          </div>
          {periods("gridPeriods")}
        </>
      )}
      {tab === 2 && periods("peakPeriods")}
      {checked && (
        <div
          role={issues.length ? "alert" : "status"}
          className={
            issues.length
              ? "runtime-validation-error"
              : "runtime-validation-success"
          }
        >
          <strong>
            {issues.length
              ? `校验未通过 · ${issues.length} 项错误`
              : "运行参数本地校验通过"}
          </strong>
          {issues.map((x, i) => (
            <div key={i}>
              <p>{x.message}</p>
              <Button onClick={() => locate(x)}>定位参数 {i + 1}</Button>
            </div>
          ))}
          {!issues.length && <p>本地校验不代表现场参数已应用。</p>}
        </div>
      )}
      {slot && (
        <Modal
          title={`编辑${
            slot.key === "peakPeriods" ? "削峰填谷" : "市电充电"
          }时段 ${String(slot.index + 1).padStart(2, "0")}`}
          onClose={() => setSlot(null)}
          actions={
            <>
              <Button onClick={() => setSlot(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const copy = {
                      ...r,
                      [slot.key]: r[slot.key].map((p, i) =>
                        i === slot.index ? slot.value : p,
                      ),
                    },
                    invalid = validateRuntime(copy).filter(
                      (x) => x.field === slot.key && x.period === slot.index,
                    )
                  if (invalid.length) {
                    setSlotError(invalid.map((x) => x.message).join("；"))
                    return
                  }
                  onChange(copy)
                  setSlot(null)
                }}
              >
                保存
              </Button>
            </>
          }
        >
          <div className="runtime-slot-form">
            <Field label="启用此时段">
              <Switch
                label="启用此时段"
                value={slot.value.enabled}
                onChange={(v) =>
                  setSlot({ ...slot, value: { ...slot.value, enabled: v } })
                }
              />
            </Field>
            <div className="runtime-slot-pair">
              {(["start", "end"] as const).map((key, i) => (
                <Field key={key} label={i ? "结束时间" : "开始时间"}>
                  <input
                    type="time"
                    value={slot.value[key]}
                    onChange={(e) =>
                      setSlot({
                        ...slot,
                        value: { ...slot.value, [key]: e.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <div>
              <p>生效星期</p>
              <div className="runtime-weekdays">
                {weekdays.map((name, i) => (
                  <button
                    key={name}
                    aria-pressed={slot.value.days.includes(i + 1)}
                    onClick={() =>
                      setSlot({
                        ...slot,
                        value: {
                          ...slot.value,
                          days: slot.value.days.includes(i + 1)
                            ? slot.value.days.filter((d) => d !== i + 1)
                            : [...slot.value.days, i + 1].sort(),
                        },
                      })
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            {slot.key === "peakPeriods" ? (
              <Field label="充放电模式">
                <select
                  value={slot.value.mode}
                  onChange={(e) =>
                    setSlot({
                      ...slot,
                      value: { ...slot.value, mode: e.target.value },
                    })
                  }
                >
                  <option>充电</option>
                  <option>放电</option>
                  <option>待机</option>
                </select>
              </Field>
            ) : (
              <Field label="允许市电充电">
                <Switch
                  label="允许市电充电"
                  value={slot.value.gridCharge}
                  onChange={(v) =>
                    setSlot({
                      ...slot,
                      value: { ...slot.value, gridCharge: v },
                    })
                  }
                />
              </Field>
            )}
            <div className="runtime-slot-pair">
              {[
                ["maxPower", "最大功率（kW）"],
                ...(slot.key === "peakPeriods"
                  ? [
                      ["peakPower", "调峰功率（kW）"],
                      ["exportPower", "售电功率（kW）"],
                    ]
                  : []),
                ["soc", "SOC 限值（%）"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    min="0"
                    value={String(slot.value[(key as keyof TimePeriod)])}
                    onChange={(e) =>
                      setSlot({
                        ...slot,
                        value: { ...slot.value, [key]: e.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            {slotError && (
              <p role="alert" className="station-danger">
                {slotError}
              </p>
            )}
          </div>
        </Modal>
      )}
    </section>
  )
}
