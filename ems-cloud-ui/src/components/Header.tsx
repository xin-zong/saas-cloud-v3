import { DEMO_MODE } from "@/api/client"
import { useState, useEffect } from "react"
import { Clock3, LogOut, Maximize2, Minimize2, User } from "lucide-react"
import { Button } from "./ui/Workspace"
import { ROLE_CONFIG, type AuthUser } from "@/auth/roles"

interface Props {
  immersive: boolean
  onToggleImmersive: () => void
  user: AuthUser
  onLogout: () => void
}
export default function Header({
  immersive,
  onToggleImmersive,
  user,
  onLogout,
}: Props) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <header className="workspace-topbar">
      <span className="workspace-topbar-context">{DEMO_MODE ? "演示环境" : "测试环境"} · {DEMO_MODE ? "华东集群" : "授权站点数据"}</span>
      <div className="workspace-topbar-actions">
        <span className="workspace-clock">
          <Clock3 size={14} />
          系统时间 {time.toLocaleTimeString("zh-CN", { hour12: false })}
        </span>
        <Button
          iconOnly
          variant="ghost"
          onClick={onToggleImmersive}
          title={immersive ? "退出沉浸模式" : "沉浸模式（隐藏导航）"}
          aria-label={immersive ? "退出沉浸模式" : "沉浸模式（隐藏导航）"}
        >
          {immersive ? <Minimize2 /> : <Maximize2 />}
        </Button>
        <span className="workspace-user">
          <User size={16} />
          <span>
            {user.name}
            <small>{ROLE_CONFIG[user.role].shortLabel}</small>
          </span>
        </span>
        <Button
          iconOnly
          variant="ghost"
          onClick={onLogout}
          title="退出登录"
          aria-label="退出登录"
        >
          <LogOut />
        </Button>
      </div>
    </header>
  )
}
