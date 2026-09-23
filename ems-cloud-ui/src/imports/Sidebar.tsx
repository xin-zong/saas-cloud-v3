import {
  LayoutGrid, MapPin, Activity, Wrench, FileText, BarChart2,
  Settings2, Settings, ChevronLeft, ChevronRight, Zap
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  grid: <LayoutGrid size={16} />,
  "map-pin": <MapPin size={16} />,
  activity: <Activity size={16} />,
  wrench: <Wrench size={16} />,
  "file-text": <FileText size={16} />,
  "bar-chart-2": <BarChart2 size={16} />,
  "settings-2": <Settings2 size={16} />,
  settings: <Settings size={16} />,
};

type NavItem = { icon: string; label: string; active?: boolean };

interface Props {
  collapsed: boolean;
  onCollapse: () => void;
  navItems: NavItem[];
  activeNav: string;
  onNavChange: (label: string) => void;
}

export default function Sidebar({ collapsed, onCollapse, navItems, activeNav, onNavChange }: Props) {
  return (
    <aside
      className="flex flex-col h-full flex-shrink-0 transition-all duration-300"
      style={{
        width: collapsed ? 56 : 160,
        background: "#fff",
        borderRight: "1px solid #dbe6df",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #dbe6df" }}>
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 28, height: 28, background: "linear-gradient(135deg, #1f7a68, #5fae9d)" }}
        >
          <Zap size={14} color="#fff" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm" style={{ color: "#1d2f2a", letterSpacing: "-0.02em" }}>
            Enerlution
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = activeNav === item.label;
          return (
            <button
              key={item.label}
              onClick={() => onNavChange(item.label)}
              className="flex items-center gap-3 w-full text-left transition-colors"
              style={{
                padding: collapsed ? "8px 16px" : "8px 16px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: isActive ? "#eaf5ef" : "transparent",
                borderRight: isActive ? "2px solid #1f7a68" : "2px solid transparent",
                color: isActive ? "#1f7a68" : "#61716b",
              }}
            >
              <span>{iconMap[item.icon]}</span>
              {!collapsed && (
                <span className="text-xs font-medium">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onCollapse}
        className="flex items-center justify-center py-3 transition-colors"
        style={{
          borderTop: "1px solid #dbe6df",
          color: "#76857f",
          fontSize: 12,
          gap: 4,
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : (
          <>
            <ChevronLeft size={14} />
            <span className="text-xs">收起导航</span>
          </>
        )}
      </button>
    </aside>
  );
}
