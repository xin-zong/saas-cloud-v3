import { DEMO_MODE } from "@/api/client"
import { useState, useEffect } from "react"
import { LogOut } from "lucide-react"
import { Button } from "./ui/Workspace"
import { ROLE_CONFIG, type AuthUser } from "@/auth/roles"

interface Props {
  immersive: boolean
  onToggleImmersive: () => void
  user: AuthUser
  onLogout: () => void
  showImmersive?: boolean
}
export default function Header({
  immersive,
  onToggleImmersive,
  user,
  onLogout,
  showImmersive = true,
}: Props) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <header className="workspace-topbar global-platform-header">
      <div className="global-platform-brand"><img src="/figma/overview/map/imgBrandMark.svg" alt="" /><strong>Enerlution</strong><span className="workspace-topbar-context">{DEMO_MODE ? "演示环境" : "测试环境"} · {DEMO_MODE ? "华东集群" : "授权站点数据"}</span></div>
      <div className="workspace-topbar-actions">
        <span className="global-role-label">{ROLE_CONFIG[user.role].shortLabel} · 基础版 V1</span>
        <span className="workspace-clock">
          系统时间 {time.toLocaleTimeString("zh-CN", { hour12: false })}
        </span>
        {showImmersive && <Button
          iconOnly
          variant="ghost"
          onClick={onToggleImmersive}
          title={immersive ? "退出沉浸模式" : "沉浸模式（隐藏导航）"}
          aria-label={immersive ? "退出沉浸模式" : "沉浸模式（隐藏导航）"}
        >
          <img src="/figma/overview/map/imgFullscreenIcon.svg" alt="" />
        </Button>}
        <span className="workspace-user">
          <span className="global-user-avatar">{user.name.slice(0, 1)}</span>
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
