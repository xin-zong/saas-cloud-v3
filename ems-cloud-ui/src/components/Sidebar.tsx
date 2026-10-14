import { DEMO_MODE } from "@/api/client"

import {
  LayoutGrid,
  MapPin,
  Activity,
  Wrench,
  FileText,
  BarChart2,
  Settings2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserRound,
  Zap,
} from "lucide-react"

import { ROLE_CONFIG, type AuthUser } from "@/auth/roles"
import { usePermissionLabels } from '@/tenant/usePermissionLabels'

const icons = {
  grid: LayoutGrid,

  "map-pin": MapPin,

  activity: Activity,

  wrench: Wrench,

  "file-text": FileText,

  "bar-chart-2": BarChart2,

  "settings-2": Settings2,

  settings: Settings,
}

type NavItem = {
  icon: string

  label: string

  active?: boolean
}

interface Props {
  collapsed: boolean

  onCollapse: () => void

  navItems: NavItem[]

  activeNav: string

  onNavChange: (label: string) => void

  user: AuthUser

  onLogout: () => void
}

export default function Sidebar({
  collapsed,

  onCollapse,

  navItems,

  activeNav,

  onNavChange,

  user,

  onLogout,
}: Props) {
  const { labelText, language } = usePermissionLabels([], user.roleNames ?? [])
  const roleLabel = user.tenant ? user.roleNames?.map(name => labelText(name)).join(language === 'English' ? ', ' : '、') || '未分配角色' : ROLE_CONFIG[user.role].shortLabel
  return (
    <aside className="app-sidebar workspace-sidebar">
      <div className="workspace-brand">
        <span className="workspace-brand-mark">
          <Zap size={16} />
        </span>
        {!collapsed && <span className="workspace-brand-name">Enerlution</span>}
      </div>
      <nav className="workspace-nav" aria-label="一级导航">
        {navItems.map((item) => {
          const label=item.label==='资产与站点'&&!DEMO_MODE?'电站管理':item.label
          const Icon = icons[(item.icon as keyof typeof icons)] ?? LayoutGrid

          return (
            <button
              key={item.label}
              type="button"
              className="workspace-nav-item"
              aria-label={label}
              title={label}
              aria-current={activeNav === item.label ? "page" : undefined}
              onClick={() => onNavChange(item.label)}
            >
              {<img src={`/figma/overview/navigation/${({ grid: "imgIconNavigationOverview", "map-pin": "imgIcon", activity: "imgIcon1", wrench: "imgIcon2", "file-text": "imgIcon3", "bar-chart-2": "imgIcon4", "settings-2": "imgIcon5", settings: "imgIcon6" } as Record<string, string>)[item.icon] || "imgIconNavigationOverview"}.svg`} alt="" />}
              {!collapsed && (
                <span className="workspace-nav-label">{label}</span>
              )}
            </button>
          )
        })}
      </nav>
      <div
        className="workspace-account"
        data-role-account={user.role}
        title={`${user.name} · ${roleLabel}`}
      >
        <span className="workspace-account-avatar">
          <UserRound size={16} />
        </span>
        {!collapsed && (
          <span className="workspace-account-copy">
            <strong>{user.name}</strong>
            <small>{roleLabel}</small>
          </span>
        )}
        <button
          type="button"
          aria-label="退出登录"
          title="退出登录"
          onClick={onLogout}
        >
          <LogOut size={15} />
        </button>
      </div>
      <button
        type="button"
        className="workspace-nav-toggle"
        aria-label={collapsed ? "展开导航" : "收起导航"}
        title={collapsed ? "展开导航" : "收起导航"}
        aria-expanded={!collapsed}
        onClick={onCollapse}
      >
        {collapsed ? (
          <img src="/figma/overview/navigation/imgToggleIcon.svg" alt="" />
        ) : (
          <>
            <img src="/figma/overview/navigation/imgToggleIcon.svg" alt="" style={{ transform: "rotate(180deg)" }} />
            <span>收起导航</span>
          </>
        )}
      </button>
    </aside>
  )
}
