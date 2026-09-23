# 开发交接说明

版本：`2026-09-21-source-handoff`

## 1. 交接范围

本包是 Enerlution 的源码开发包，不是直接上传到 IIS 的静态部署包。它包含：

- React/Vite/Tailwind 源码
- 三角色登录与页面权限
- 站点、运营、运维、设备和收益演示数据
- Playwright UI 测试和业务逻辑测试
- Figma Make 的开发配置
- Windows IIS、Docker/Nginx 部署脚本
- 数据接入说明和产品设计文档

不包含：

- `node_modules/`
- `dist/`
- `.figma/` 下的截图、调试产物和历史视觉验证文件
- 任何真实账号、真实接口地址或生产密钥

## 2. 启动项目

推荐环境：

- Windows、macOS 或 Linux
- Node.js 22
- pnpm 10

安装并启动：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Vite 默认端口来自 `PORT`，未配置时是 `8443`。项目配置在 `vite.config.ts`。

Windows PowerShell 示例：

```powershell
$env:PORT = "8443"
pnpm dev
```

## 3. 应用启动链

```text
index.html
  -> src/main.tsx
    -> AuthProvider
      -> App
        -> LoginPage 或 AuthenticatedApp
          -> Sidebar / Header / 业务页面
```

`src/App.tsx` 负责：

- 登录后的应用壳
- 当前一级导航和站点详情 tab 状态
- 当前用户可访问的站点过滤
- 角色菜单过滤
- 从地图、面板和告警进入站点详情
- 开发环境数据调试桥

## 4. 角色与权限

权限配置集中于 `src/auth/roles.ts`：

- `ROLE_CONFIG`：一级菜单、站点二级菜单、中心页 tab、报表类型和能力开关
- `DEMO_USERS`：演示账号、密码、MFA 要求、站点范围
- `canAccessStation`：站点范围判断

登录状态由 `src/auth/AuthContext.tsx` 管理，当前使用浏览器 `localStorage`：

- `enerlution-auth-session-v1`
- `enerlution-auth-account-v1`

正式接入后端时，建议保留 `AuthUser`、`UserRole` 和 `ROLE_CONFIG` 的页面契约，把 `login`、`verifyMfa`、`logout` 改为调用服务端接口，并在页面请求层增加接口级授权。

### 角色入口

| 角色 | 默认页面 | 主要页面 |
| --- | --- | --- |
| owner | 总览 | 资产与站点、运营中心、分析与报告、设置 |
| operator | 运维中心 | 总览、资产与站点、运维中心、工单与审批、分析与报告、设置 |
| integrator | 资产与站点 | 总览、资产与站点、运维中心、工单与审批、平台管理、设置 |

### 站点详情二级导航

- owner：站点概览、运营收益、告警信息、运行曲线、一次接线图、设备详情
- operator：站点概览、运行策略、告警信息、运行曲线、一次接线图、设备详情
- integrator：站点概览、运行策略、告警信息、运行曲线、一次接线图、设备详情、电价设置

## 5. 页面与数据模块

| 页面 | 组件入口 | 主要数据 |
| --- | --- | --- |
| 总览 | `src/App.tsx`、`src/components/MapView.tsx` | `Station[]` |
| 资产与站点 | `src/components/AssetsPage.tsx` | 站点基础字段 |
| 站点总览 | `src/components/StationDetailPage.tsx` | 快照、遥测、设备和告警 |
| 运营中心 | `src/components/OperationsCenterPage.tsx` | `src/data/operations.ts` |
| 运维中心 | `src/components/MaintenanceCenterPage.tsx` | `src/data/stationMaintenance.ts` |
| 工单与审批 | `src/components/WorkOrdersApprovalPage.tsx` | 运维工单和本地草稿 |
| 分析与报告 | `src/components/AnalyticsAiPage.tsx` | 站点快照、趋势和报告 |
| 平台管理 | `src/components/PlatformManagementPage.tsx` | 组织和成员本地演示 |
| 系统设置 | `src/components/SystemSettingsPage.tsx` | 浏览器本地设置 |

共享设计基础：

- 令牌和工作台壳：`src/styles/workspace.css`
- 复用控件：`src/components/ui/Workspace.tsx`
- 全局 CSS：`src/index.css`

## 6. 数据更新调试

开发环境登录后，可在浏览器控制台使用：

```js
window.__ENERLUTION_DATA__.getStations()

window.__ENERLUTION_DATA__.patchStation("1", {
  activePower: 620,
  soc: 71.5,
})
```

也可以发送事件：

```js
window.dispatchEvent(new CustomEvent("enerlution:patch-station", {
  detail: {
    id: "1",
    patch: {
      status: "fault",
      runStatus: "异常",
    },
  },
}))
```

注意：

- 调试 API 仅在开发服务器或 `localhost` / `127.0.0.1` 预览可用。
- `patchStation` 是浅合并。
- 更新 `operations` 或 `maintenance` 时应传入完整领域对象，避免无意丢字段。
- 正式数据接入应改为 API/状态层，不要把调试桥当成生产通信机制。

## 7. 数据接入原则

### 运营数据

入口：`src/data/operations.ts` 和 `docs/operations-data.md`。

支持：

- 遥测采样和 SOC
- 日内计划和计划执行
- 市场服务、能力和价格
- 收益结算、成本和对账

真实数据标记为 `source: "connected"`。显式空数组表示真实无数据，不应生成演示替代值。

### 运维数据

入口：`src/data/stationMaintenance.ts` 和 `docs/maintenance-data.md`。

支持：

- 活动告警和历史告警
- SLA 和工单
- 今日巡检
- 健康度和通信状态
- 固件任务

时间戳应携带时区偏移。未来时间、非法时间和过期健康度不能直接当作当前有效状态。

## 8. 地图注意事项

`src/components/MapView.tsx` 使用 Leaflet 和高德瓦片。地图组件被总览页隐藏/显示切换复用，因此不能只在初始化时读取容器尺寸：

- `ResizeObserver` 监听容器变化
- 显示后调用 `map.invalidateSize()`
- 重新按当前区域设置视角

如果修改总览布局、角色默认页或地图父容器的 `display` 行为，需要回归运维和服务商从默认页切换到总览的场景。对应测试位于 `tests/role-access-ui.test.cjs` 的 `assertOverviewMap`。

## 9. 测试与发布前检查

```powershell
pnpm exec tsc --noEmit
pnpm build
node --test tests/operations.test.cjs
node --test tests/workspace-ui.test.cjs
node --test tests/role-access-ui.test.cjs
node --test tests/centers-ui.test.cjs
node --test tests/operations-redesign-ui.test.cjs
```

UI 测试需要 Playwright 浏览器可用。默认测试服务为 `http://localhost:8443/`；验证生产产物时先启动：

```powershell
pnpm preview -- --host 127.0.0.1 --port 4175
$env:PREVIEW_URL = "http://127.0.0.1:4175/"
node --test tests/role-access-ui.test.cjs
```

重点回归：

- 三个角色登录、MFA 和退出
- 角色不需要的菜单直接隐藏
- 业主站点详情显示“一次接线图”和“设备详情”
- 运维/服务商从默认页切换到总览后地图有瓦片和站点标记
- 移动端无页面级横向溢出
- 数据导出、报告生成、工单和成员管理交互

## 10. 构建与部署边界

源码开发包不能直接作为 IIS 网站目录。正确流程：

```text
源码包
  -> pnpm install --frozen-lockfile
  -> pnpm build
  -> dist/
  -> IIS / Docker / Nginx
```

已有 Windows ECS 的发布脚本为 `deployment/deploy-iis.ps1`。部署包说明在 `deployment/README.md`。如果同事只需要发布，不需要源码，应使用单独的云端部署包。

## 11. 后续建议

1. 建立后端身份认证、MFA、RBAC 和审计服务。
2. 将 `Station` 及领域数据拆为 API DTO 与前端 ViewModel，避免页面直接依赖演示字段。
3. 为告警确认、工单流转、设备控制和固件升级增加服务端状态机。
4. 接入统一业务时区、数据更新时间和断线状态。
5. 继续拆分 `App.tsx` 的页面状态和导航状态，保留现有角色配置作为单一权限入口。
