# Main 前后端发布（18085）

- 发布源码：`7a71d7b440cd249885a5d21115131c13c3bb3d04`，已推送 origin/main。
- 访问入口：http://120.27.23.229:18085/，现有 Nginx 配置保持不变，/api/ 代理至本机 18090。
- 前端：`/var/www/ems-cloud-v3/releases/main-7a71d7b440cd`，current 链接已切换。构建为 API 模式，API 地址 /api。
- API：`/opt/ems-cloud-v3/releases/main-7a71d7b440cd/ems-cloud-api.jar`，使用 `ems-cloud-v3-api.service.d/20-main-release.conf` 指定本次发布。保留原受管运行环境与服务安全选项。
- API SHA256：`acdf39da52dcdb0485cd3816dfff0bce7524b7ae72f53f80c4e852f161aeca13`。
- 前端压缩包 SHA256：`4e4eef43585e3d9bb6a80057bcc121701f86b16457cd2ca048d81170f9bce1a1`。
- 旧前端：`/var/www/ems-cloud-v3/releases/maintenance-20260928-2117`。旧 API：`/opt/ems-cloud-v3/current/ems-cloud-api.jar`；该共享 current 链接未更改。
- 发布目录的 release.json 与 previous-api-override.txt 保存回滚依据。回滚时移除本次新增的 API drop-in、daemon-reload 并重启 API，将前端 current 原子切回旧目录。
- 无数据库迁移（现有 schema version 16），未修改数据库凭据、MQTT 或采集服务；采集服务 PID 保持不变。

## 验证

- 前端 18 项浏览器回归全部通过，包含总览布局、权限边界、真实地图、业务页面移除诊断面板、3D 与 WebGL 降级。
- TypeScript 检查与生产构建通过；保留既有大 chunk 警告。
- 协议 26 项测试通过；API 141 项测试中 52 项通过、89 项依赖专用集成环境而跳过，0 失败。未将跳过项计作通过。
- 最初 API 打包因本地 Java 占用 JAR 失败；停止本地 API 后完成强制重打包，并恢复本地 API。已按字节核对 API 内嵌协议包与新构建协议包一致。
- 上传后验证产物 SHA256；云端 API active/running，NRestarts=0。
- 公网登录页面加载正常，无 pageerror；公网 /api/health 返回 UP。页面入口引用的 JS/CSS 与本地发布文件逐字节哈希一致。
- 本次未执行真实账号登录及写业务验收；API 使用内存会话，重启后用户需重新登录。
