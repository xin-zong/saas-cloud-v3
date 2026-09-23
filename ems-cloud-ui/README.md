# Enerlution 能源资产管理平台

这是 Enerlution 当前可交互页面的源码交接版本，供团队继续开发、接入真实数据和迭代多角色工作台。

## 技术栈

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4
- Leaflet 地图
- Recharts 图表
- React Three Fiber / Three.js 3D 能源流
- pnpm 锁文件：`pnpm-lock.yaml`

建议使用 Node.js 22 和 pnpm 10。项目根目录的 `.mise.toml` 已记录推荐版本。

## 快速开始

在项目根目录执行：

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

默认开发地址：

```text
http://127.0.0.1:8443/
```

如果 8443 已被占用，可以指定其他端口：

```powershell
$env:PORT = "5173"
pnpm dev
```

## 常用命令

```powershell
# 类型检查
pnpm exec tsc --noEmit

# 生产构建
pnpm build

# 本地预览生产构建
pnpm preview -- --host 127.0.0.1 --port 4175

# 格式化
pnpm format

# 业务逻辑测试
node --test tests/operations.test.cjs

# UI 测试，要求先启动开发服务器
node --test tests/workspace-ui.test.cjs
node --test tests/role-access-ui.test.cjs
node --test tests/centers-ui.test.cjs
node --test tests/operations-redesign-ui.test.cjs
```

UI 测试默认访问 `http://localhost:8443/`，也可以覆盖：

```powershell
$env:PREVIEW_URL = "http://127.0.0.1:4175/"
node --test tests/role-access-ui.test.cjs
```

## 目录说明

```text
src/
  App.tsx                         应用壳、一级导航、角色过滤、页面路由状态
  auth/                           登录会话、演示账号、角色权限配置
  components/                     当前生产使用的页面和复用组件
  data/                           演示站点、遥测、告警、运维、运营数据模型
  dev/                            仅开发环境显示的实时预览工具
  imports/                        Figma 导入的旧版/参考组件和静态资源
  styles/                         全局工作台设计令牌和共享样式

tests/                            Node test runner + Playwright 测试
docs/                             数据接入、开发交接和边界说明
.figma/make/                      Figma Make 的开发、构建和站点配置
deployment/                       已构建网页的 IIS / Docker 部署脚本
```

当前实际入口为：

- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`

`src/imports/` 仍作为设计导入和历史参考保留。新增生产页面时，优先使用 `src/components/`、`src/data/` 和 `src/styles/workspace.css` 中的现有模式。

## 登录演示账号

| 角色 | 账号 | 密码 | 动态验证码 |
| --- | --- | --- | --- |
| 电站业主 / 能源投资商 | `owner@enerlution.cn` | `Demo@2026` | 不需要 |
| 运维人员 / 运维操作员 | `operator@enerlution.cn` | `Demo@2026` | `246810` |
| 安装商 / 服务商 / 系统集成商 | `integrator@enerlution.cn` | `Demo@2026` | `246810` |

当前登录、角色和演示数据均在前端运行，仅用于演示和交互验收，不是真实身份认证系统。

## 三种角色

角色配置集中在 `src/auth/roles.ts`：

- 业主：总览、资产、运营、分析、设置；可以查看收益、一次接线图和设备详情，不可修改设备和下发指令。
- 运维：总览、资产、运维、工单、分析、设置；重点处理告警、设备健康、巡检和工单。
- 服务商：总览、资产、运维、工单、平台管理、设置；重点负责建站、设备接入、固件升级和成员权限。

没有权限的一级菜单、站点二级入口和角色操作会在页面中直接隐藏。修改角色功能时，应同步更新：

1. `src/auth/roles.ts`
2. `tests/role-access-ui.test.cjs`
3. 涉及页面的角色参数和操作保护

## 数据接入

演示站点入口为 `src/data/demoStations.ts`，基础站点快照为 `src/data/demoStations.json`。页面通过 `Station` 类型承载站点基础信息，并按领域挂载：

- `operations`：运营、计划、市场服务、收益结算
- `maintenance`：告警、工单、巡检、健康、通信、固件
- `telemetryHistory`：历史遥测
- `deviceInventory`：设备清单
- `alarmHistory`：告警证据和测点历史

详细字段、统计口径和真实数据边界见：

- `docs/operations-data.md`
- `docs/maintenance-data.md`
- `docs/DEVELOPMENT_HANDOFF.md`

开发环境还提供 `window.__ENERLUTION_DATA__` 和自定义事件桥，用于验证数据变化。它们不会在公网生产环境启用，不能替代后端接口。

## 地图 Key

地图组件读取构建时环境变量 `VITE_AMAP_KEY`：

```powershell
$env:VITE_AMAP_KEY = "你的高德地图 Key"
pnpm build
```

如果不配置，地图容器、站点标记和交互仍可运行，但高德底图瓦片可能不可用。环境变量会被写入前端构建产物，请不要把生产密钥提交到源码仓库。

## 生产部署

源码包不包含 `node_modules`，也不把源码直接作为 IIS 静态目录。部署前先构建：

```powershell
pnpm install --frozen-lockfile
pnpm build
```

然后可以：

- 将 `dist/` 复制到现有发布包，再使用 `deployment/deploy-iis.ps1`
- 使用 `deployment/deploy.ps1` 或 `deployment/deploy.sh` 运行 Docker/Nginx 部署

Windows IIS 的完整说明见 `deployment/README.md`。

## 迭代约定

1. 先确认页面属于哪一个角色和业务域，再修改对应组件。
2. 数据模型变更同时更新数据说明和逻辑测试。
3. 角色菜单变化必须补权限 UI 测试。
4. 修改地图、布局或隐藏容器中的图表后，至少检查桌面和移动端。
5. 提交前执行类型检查、生产构建和相关 UI 测试。
6. 不要把 `node_modules/`、`dist/`、`.figma/` 下的截图和测试输出提交到源码仓库。

## 已知边界

- 当前登录和权限只在前端演示，正式系统需要后端会话、令牌校验、接口级授权和审计。
- 运营、运维、市场和结算页面支持接入数据模型，但没有连接真实 EMS、SCADA、计量、工单或市场接口。
- 页面中的本地草稿、备注和设置保存在当前浏览器，不会同步到服务器。
- `npm` 也可以运行项目，但团队建议统一使用 `pnpm install --frozen-lockfile`，保证依赖版本一致。
