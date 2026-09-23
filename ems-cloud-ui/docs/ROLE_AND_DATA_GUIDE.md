# 角色与数据接入速查

## 角色职责

### 电站业主 / 能源投资商

关注资产收益、成本、安全和组合表现。

- 可查看总览、资产与站点、运营中心、分析与报告、设置
- 可查看运营收益、一次接线图、设备详情
- 不可修改设备参数、下发充放电指令或执行运维动作

### 运维人员 / 运维操作员

关注实时状态、告警、设备健康和工单闭环。

- 可查看总览、资产与站点、运维中心、工单与审批、分析与报告、设置
- 可确认告警、转工单、查看设备健康、维护和固件任务
- 关键保护定值和真实设备指令仍需后端受控授权

### 安装商 / 服务商 / 系统集成商

关注建站、设备接入、调试、升级和账号交付。

- 可查看总览、资产与站点、运维中心、工单与审批、平台管理、设置
- 可创建站点、维护资产、组织成员和固件交付演示
- 运营收益和业主专属分析入口不显示

## 权限修改位置

只修改 `src/auth/roles.ts` 不一定足够。完整变更需要检查：

1. `ROLE_CONFIG.nav`
2. `ROLE_CONFIG.stationSubNavs`
3. `operationsTabs`、`maintenanceTabs`、`workOrderViews`、`analysisTabs`
4. 页面内的 `canEdit`、`showRevenue`、`role` 参数
5. `tests/role-access-ui.test.cjs`

## 站点数据主结构

`Station` 类型定义在 `src/App.tsx`。基础字段包括：

```ts
{
  id, name, shortName, code,
  status, runStatus,
  devices,
  activePower, ratedPower, loadRate,
  pvOutput, storageCapacity, soc, generator,
  alerts,
  type, region, project, address,
  lng, lat, mode, runtime, revenue,
  revenueHistory, imageUrl, dataStatus,
  updateTime, updateSub,
  manager, email, phone, role, remark,
}
```

领域字段：

- `operations`
- `maintenance`
- `telemetryHistory`
- `deviceInventory`
- `alarmHistory`

## 接入数据的最低要求

- 所有时间戳带时区偏移。
- 真实来源使用 `source: "connected"`。
- 真实空数据使用显式空数组，不用 `undefined` 伪造“未知”或触发演示数据。
- 未来数据不能直接计入当前统计。
- 缺少字段显示未知，不要自动补成 0。
- 单位在接口文档中明确：功率 kW、能量 kWh、收益 CNY、SOC 0-100。

详细统计口径请看 `docs/operations-data.md` 和 `docs/maintenance-data.md`。

## 本地演示数据

入口：

- `src/data/demoStations.json`：原始站点快照
- `src/data/demoStations.ts`：构建运营、市场和结算演示数据
- `src/data/dataClock.ts`：演示日期时钟

修改演示数据后，至少验证：

```powershell
pnpm exec tsc --noEmit
pnpm build
node --test tests/operations.test.cjs
```

## 前端状态持久化

当前浏览器本地保存的主要键包括：

- `enerlution-auth-session-v1`
- `enerlution-auth-account-v1`
- `enerlution-system-settings-v1`
- `enerlution-dispatch-drafts-v1`
- `enerlution-dispatch-handover-v1`
- `enerlution-market-applications-v1`
- `enerlution-market-qualification-notes-v1`
- `enerlution-settlement-review-notes-v1`
- `enerlution-maintenance-notes-v1`

这些键仅用于演示。正式接入时应由服务端保存并按用户、组织、电站和审计范围隔离。
