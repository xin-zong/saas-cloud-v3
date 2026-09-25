import { useState } from "react";
import { Modal } from "../station-provision/Common";
import { copy, uid, summary, validateStrategy, type Strategy } from "./model";
export default function StrategyAssistant({
  plan,
  rated,
  demo,
  disabled,
  onInsert,
  onClose,
}: {
  plan: Strategy;
  rated: number;
  demo: boolean;
  disabled: boolean;
  onInsert: (plan: Strategy) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [reserve, setReserve] = useState("30");
  const [preview, setPreview] = useState<Strategy | null>(null);
  const [diff, setDiff] = useState(false);
  const [error, setError] = useState("");
  const generate = () => {
    if (disabled || !demo) return;
    const next = copy(plan);
    next.id = uid();
    next.name = `${plan.name} · 本地预览`;
    next.description = prompt || "基于现有方案的本地规则预览，非 AI 服务生成";
    next.fallback.base = "光伏自发自用";
    next.fallback.params["光伏自发自用"].reserve = reserve;
    const issue = validateStrategy(next, rated);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setPreview(next);
  };
  return (
    <div className="strategy-ai-dialog">
      <Modal title="AI 策略助手" onClose={onClose}>
        <h3>{preview ? "策略草案待确认" : "对话生成策略方案"}</h3>
        <div className="strategy-ai-context">
          当前方案　{plan.name}
          <small>仅生成草案，人工确认后才能提交内部审批</small>
        </div>
        <p className="strategy-ai-message">
          {demo
            ? "演示模式：可按下方参数预览本地规则草案。此预览不调用 AI，不预测收益，不会直接修改当前方案。"
            : "AI 生成服务未接通，暂无服务端生成内容。现有方案保持不变。"}
        </p>
        {preview ? (
          <>
            <section className="strategy-ai-preview">
              <h3>草案 · {preview.name}</h3>
              {preview.slots.map((slot) => (
                <p key={slot.id}>
                  <strong>
                    {slot.start}—{slot.end}
                  </strong>
                  <span>
                    基础：{slot.base} · {summary(slot)}
                  </span>
                </p>
              ))}
              <p>
                <strong>默认设置</strong>
                <span>{summary(preview.fallback)}</span>
              </p>
              <small>本地草稿 · 尚未提交</small>
            </section>
            {diff && (
              <div className="strategy-ai-diff">
                <p>原方案不会被修改；确认后插入一份独立本地方案。</p>
                <p>
                  默认最低保留电量：
                  {plan.fallback.params["光伏自发自用"].reserve}% → {reserve}%
                </p>
                <p>
                  时段数量：{plan.slots.length} → {preview.slots.length}
                </p>
              </div>
            )}
            <div className="strategy-dialog-actions">
              <button onClick={() => setDiff(!diff)}>查看差异</button>
              <button
                className="primary"
                disabled={disabled}
                onClick={() => onInsert(preview)}
              >
                插入为新方案
              </button>
              <button onClick={() => setPreview(null)}>继续调整</button>
            </div>
          </>
        ) : (
          <div className="strategy-ai-input">
            <label>
              目标或约束
              <textarea
                aria-label="目标或约束"
                value={prompt}
                disabled={disabled}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="补充目标或约束…"
              />
            </label>
            <label>
              默认最低保留电量（%）
              <input
                aria-label="预览最低保留电量"
                type="number"
                min="0"
                max="100"
                value={reserve}
                disabled={disabled || !demo}
                onChange={(e) => setReserve(e.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={disabled || !demo}
              onClick={generate}
            >
              {demo ? "预览本地草案" : "生成草案（未接通）"}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="strategy-error">
            {error}
          </p>
        )}
        <p className="strategy-muted">
          所有草案均需参数校验与人工确认；本页面不向 EMS 下发。
        </p>
      </Modal>
    </div>
  );
}
