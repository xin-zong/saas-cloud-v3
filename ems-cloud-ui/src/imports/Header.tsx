import { useState, useEffect } from "react";
import { ChevronDown, Maximize2, Minimize2, RefreshCw, User } from "lucide-react";

interface Props {
  immersive: boolean;
  onToggleImmersive: () => void;
}

export default function Header({ immersive, onToggleImmersive }: Props) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${fmt(time.getHours())}:${fmt(time.getMinutes())}:${fmt(time.getSeconds())}`;

  return (
    <header
      className="flex items-center justify-between flex-shrink-0 px-5"
      style={{ height: 48, background: "#fff", borderBottom: "1px solid #dbe6df" }}
    >
      <div className="flex items-center gap-1 text-xs" style={{ color: "#61716b" }}>
        <span>生产环境</span>
        <span style={{ color: "#cbd8d0" }}>·</span>
        <span>华东集群</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium"
          style={{ background: "#e8f0eb", color: "#24423b", border: "1px solid #d8e3dc" }}
        >
          华东集群 <ChevronDown size={11} />
        </button>

        <div className="flex items-center gap-2 text-xs" style={{ color: "#61716b" }}>
          <span>全视图展示</span>
          <span style={{ color: "#cbd8d0" }}>·</span>
          <span>基础版 V1</span>
        </div>

        <div className="flex items-center gap-1 text-xs" style={{ color: "#76857f", fontFamily: "'JetBrains Mono', monospace" }}>
          <RefreshCw size={11} style={{ color: "#10b981" }} />
          <span>数据更新 {timeStr}</span>
        </div>

        <button
          onClick={onToggleImmersive}
          title={immersive ? "退出沉浸模式" : "沉浸模式（隐藏导航）"}
          className="flex items-center justify-center rounded transition-colors hover:bg-slate-100"
          style={{ width: 28, height: 28, color: immersive ? "#1f7a68" : "#61716b" }}
        >
          {immersive ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center rounded" style={{ width: 24, height: 24, background: "#1f7a68" }}>
            <User size={12} color="#fff" />
          </div>
          <span className="text-xs font-medium" style={{ color: "#24423b" }}>周新岸</span>
        </div>
      </div>
    </header>
  );
}
