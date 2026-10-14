import { DEMO_MODE } from "@/api/client"
import type { AuthUser, UserRole } from "@/auth/roles"
export function overviewPresentationRole(user: AuthUser): UserRole {
  if (DEMO_MODE) return user.role
  if (user.roleNames?.some((n) => /^Installer$/i.test(n))) return "integrator"
  if (user.permissions.includes("revenue.read")) return "owner"
  return "operator"
}
export function overviewCardNames(user: AuthUser): string[] {
  const role = overviewPresentationRole(user),
    has = (p: string) => DEMO_MODE || user.permissions.includes(p),
    cards: string[] = []
  if (has("asset.read"))
    cards.push("站点运营概况", "在线运行容量", "能源供应与构成")
  if (role === "integrator") {
    if (has("ems.read") || has("asset.create"))
      cards.push("建站与接入进度", "设备接入概况", "交付就绪度")
  } else {
    if (has("telemetry.read")) cards.push("储能充放趋势")
    if (role === "owner" && has("revenue.read"))
      cards.push("社会与环境效益", "收益概览")
    if (role === "operator" && has("alarm.read"))
      cards.push("当班处置态势", "运行健康")
  }
  if (has("alarm.read")) cards.push("异常与告警实时监控")
  if (has("telemetry.read")) cards.push("子系统可用性与出力")
  return cards
}
