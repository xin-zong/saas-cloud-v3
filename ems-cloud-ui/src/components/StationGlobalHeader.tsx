import { localized as __locale } from '@/preferences/date'
import { useEffect, useState } from "react"
import type { AuthUser } from "@/auth/roles"
import MachineTranslationStatus from '@/i18n/MachineTranslationStatus'

const asset = (name: string) => `/figma/stations/overview/${name}.svg`

export default function StationGlobalHeader({
  user,
  onLogout,
  status,
  loading,
  onRefresh,
  onSettings,
}: {
  user: AuthUser
  onLogout: () => void
  status?: string
  loading: boolean
  onRefresh: () => void
  onSettings?:()=>void
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
        <MachineTranslationStatus />
        {onSettings&&<button aria-label="设置" title="设置" onClick={onSettings}><img src="/figma/overview/navigation/imgIcon6.svg" alt="" width="20" height="20"/></button>}
        <time dateTime={now.toISOString()}>{__locale(now, 'toLocaleString', "sv-SE")}</time>
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
            data-i18n-initial={user.name}
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
