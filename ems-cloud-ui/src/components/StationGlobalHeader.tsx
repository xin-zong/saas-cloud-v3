import { useEffect, useState } from "react"
import type { AuthUser } from "@/auth/roles"

const asset = (name: string) => `/figma/stations/overview/${name}.svg`

export default function StationGlobalHeader({
  user,
  onLogout,
  status,
  loading,
  onRefresh,
}: {
  user: AuthUser
  onLogout: () => void
  status?: string
  loading: boolean
  onRefresh: () => void
}) {
  const [now, setNow] = useState(() => new Date())
  const [menu, setMenu] = useState(false)
  const [notifications, setNotifications] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <header className="station-global-header">
      <a
        className="station-global-brand"
        href="#"
        onClick={(event) => event.preventDefault()}
        aria-label="Enerlution"
      >
        <img src={asset("imgEnerlutionMark")} alt="" />
        Enerlution
      </a>
      <div className="station-global-tools">
        <time dateTime={now.toISOString()}>{now.toLocaleString("sv-SE")}</time>
        <div className="station-header-popover">
          <button
            aria-label="通知与连接状态"
            aria-expanded={notifications}
            onClick={() => {
              setNotifications(!notifications)
              setMenu(false)
            }}
          >
            <img src={asset("imgIconNotifications")} alt="" />
          </button>
          {notifications && (
            <section role="status">
              <strong>连接状态</strong>
              <p>{status || "演示环境"}</p>
              <button disabled={loading} onClick={onRefresh}>
                刷新站点数据
              </button>
            </section>
          )}
        </div>
        <div className="station-header-popover">
          <button
            className="station-user-avatar"
            aria-label={`${user.name}，账户菜单`}
            aria-expanded={menu}
            onClick={() => {
              setMenu(!menu)
              setNotifications(false)
            }}
          >
            {user.name.slice(0, 1)}
          </button>
          {menu && (
            <section>
              <strong>{user.name}</strong>
              <button onClick={onLogout}>退出登录</button>
            </section>
          )}
        </div>
      </div>
    </header>
  )
}
