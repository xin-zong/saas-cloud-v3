# Toyingzhen 独立部署工具

此目录只管理 `ems-cloud-toyingzhen`。构建、上传/暂存、激活是分开的动作；没有执行即不发布。生产 `/opt/ems-cloud-v3`、`/var/www/ems-cloud-v3` 及两个 v3 服务只读核对，不写入或停止。配置固定新库、独立账号、API 回环18091、Nginx18086；不启动采集器、不隐式迁移数据库，告警检测关闭。SMTP 与 Agent 使用可选、完整且严格校验的私有配置。

## 来源与秘密

- 本机来源：被忽略的 `ems-cloud-api/.env`、`ems-cloud-ui/.env.local`；不加入制品。
- 云端现有新库来源：`/etc/ems-cloud-toyingzhen/database.env`（root:root0600），不覆盖。
- 云端新完整运行配置：`/etc/ems-cloud-toyingzhen/runtime.env`（root:root0600）。systemd PID1读取后再降权，不必放宽现有目录700权限。
- 发布状态/生产基线：`/var/lib/ems-cloud-toyingzhen/production-baseline.json`；回退记录在 `rollback/RELEASE.json`，不包含运行配置或密码。
- `audit-config.py` 通过严格SSH与运行中服务比较MFA、ClickHouse配置，以及新库密码。仅输出布尔值。确认现有ClickHouse账户仅有SELECT/SHOW/USAGE授权；不会尝试写入验证。
- 当前入口为HTTP IP端口；18086的云安全组需要单独放行。域名/HTTPS尚未指定，脚本不会改80/443。

## 1. 本地最终验收后冻结构建

在本分支根目录运行。`-Inspect`不构建；本目录或业务源码有任何变化均须重新获取摘要。

```powershell
$py = Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
./deployment/toyingzhen/build.ps1 -CheckTools
& $py deployment/toyingzhen/audit-config.py
& $py -m unittest discover -s deployment/toyingzhen/tests
$sourceHash = (./deployment/toyingzhen/build.ps1 -Inspect | Select-Object -Last 1).Trim()
# 仅在最终UI确认后执行下一行。每次使用新的发布ID。
./deployment/toyingzhen/build.ps1 -Release toyingzhen-20261019-r1 -ExpectedSource $sourceHash
```

构建在 `.local-tools/deploy-toyingzhen/RELEASE/source` 中冻结当前跟踪和未忽略源码，包括未提交更改；双重比对冻结前后文件SHA，防止冻结时修改。安装锁定依赖，执行tsc、六个纯 Node 回归测试（Agent proxy/transport/bridge、auth restore、public API session isolation、reference workspace integration）、部署测试和API/protocol Maven package（不跳过测试），再构建前端。Node 仅用于本地构建和测试，云端 Agent 由既有 Java API 进程代理。强制`api`模式、同源`/api`及根路径，读取本机现有地图配置。源码环境文件、证据和node_modules不进入制品。输出 `.local-tools/deploy-toyingzhen/RELEASE/bundle`，包括API jar、web、固定部署工具、release.json与完整SHA256清单；不上传。

## 2. 私有运行配置准备（与制品分开）

```powershell
& $py deployment/toyingzhen/prepare-runtime.py
```

输出仅在忽略目录 `.local-tools/deploy-toyingzhen/runtime.env`，拒绝覆盖。来源已核对后复用既有MFA/只读历史身份、新库账号密码；改为云端回环PG5432、CH18123和新公网入口。严格白名单拒绝旧库、其他端口及额外Spring配置；可选 SMTP 须提供完整十项并启用认证和 TLS（见 `SMTP.md`），可另带 `EMS_MAIL_HELO`。文件不打印、不打包。若值需要特殊引号，工具会停止，须在云端安全准备等价配置。

Agent 可不配置；启用时只允许完整非空的 `EMS_AGENT_URL`、`EMS_AGENT_API_KEY` 两项。URL 固定为已审核上游 `http://47.99.70.238:18080`，两项均拒绝空白、换行、引号、反斜线与 NUL。凭据只进入私有 runtime，不进入源码快照、jar、前端或发布制品；更新云端 runtime 时保留既有 DB、ClickHouse、MFA、SMTP 值，不重新生成或覆盖其他配置。

独立 Nginx 将 `/ems-agent-api/v1/*` 重写至 `http://127.0.0.1:18091/api/agent/v1/*`；保留 Authorization，覆盖客户端 X-Forwarded-For 为 `$remote_addr`，关闭响应/请求缓冲及缓存，读写超时 190 秒，请求体上限 21 MiB（20 MiB 文件加 multipart 开销）。原 `/api/` 路由保持原行为。升级只接受候选模板或当前完整制品哈希验证通过的模板，拒绝未知配置；预检要求数据库版本与冻结制品完整连续序列精确一致，不自动运行 V69 或任何迁移。

## 3. 上传与暂存（后续明确执行时）

以下为操作命令，工具准备阶段没有运行。SSH使用现有已知主机密钥和专用identity；上传目录需为全新root私有目录。不要使用scp到任何v3路径。

```powershell
$rel = 'toyingzhen-20261019-r1'
$identity = Join-Path $HOME '.ssh/codex_chuneng_shared_test_20260915'
$sshArgs = @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-i',$identity)
& ssh @sshArgs root@120.27.23.229 "umask 077 && mkdir /root/$rel"
& scp @sshArgs -r ".local-tools/deploy-toyingzhen/$rel/bundle" "root@120.27.23.229:/root/$rel/"
& scp @sshArgs .local-tools/deploy-toyingzhen/runtime.env "root@120.27.23.229:/root/$rel/runtime.env"
```

服务器以root执行：

```bash
rel=toyingzhen-20261019-r1
# 首次运行配置安装：保留数据库来源文件，不覆盖已存在runtime。
test ! -e /etc/ems-cloud-toyingzhen/runtime.env
install -o root -g root -m 0600 /root/$rel/runtime.env /etc/ems-cloud-toyingzhen/runtime.env
rm -- /root/$rel/runtime.env
python3 /root/$rel/bundle/deploy/release.py baseline
bash /root/$rel/bundle/deploy/stage-release.sh "$rel" --bundle "/root/$rel/bundle"
bash /opt/ems-cloud-toyingzhen/releases/$rel/deploy/preflight.sh "$rel"
```

`baseline`首次记录生产current实际目标、两个服务PID/启动时间/active状态；若已有基线则只核对，不更新。生产发生任何独立发布后工具会拒绝旧基线，须人工查明并归档旧基线，不能直接绕过。暂存独立不可覆盖的release目录，不改current/unit/Nginx。预检核对每个制品（包含单独web目录）、严格runtime权限/字段、PG真实身份及完整连续迁移序列、只读CH授权、Java21、unit/Nginx语法和端口占用。缺迁移时停止，不执行迁移。

## 4. 激活（必须等最终UI集成验收后）

```bash
rel=toyingzhen-20261019-r1
bash /opt/ems-cloud-toyingzhen/releases/$rel/deploy/activate.sh "$rel"
```

自动重跑预检并保存仅新环境的回退信息，创建专用无登录运行账号，安装独立unit，切换两个独立current，启动独立API，等待真实`UP`，添加独立Nginx配置并检查后reload。验证公网API及首页SHA256，再核对生产基线。任一步失败即尝试恢复独立环境；不自动修复/重启生产。只有成功后才enable独立unit。日志仅显示摘要，不回显环境或DB错误。

后续验收应包括：新入口真实登录/权限、本站点列表与采样、历史查询和XLSX、参数模板、一次接线图保存再读取；复核原入口及生产基线。脚本健康检查不等于这些业务验收已完成。新环境和本地共享已指定的新库，不复制或重置数据。

## 5. 回退

```bash
rel=toyingzhen-20261019-r1
bash /opt/ems-cloud-toyingzhen/releases/$rel/deploy/rollback.sh "$rel"
```

仅当该release仍拥有当前两个独立链接且生产基线一致时允许；恢复前一独立unit/config/链接并重启独立API，首次发布则disable/stop独立unit并移除新Nginx配置。Nginx检查后reload。数据库和私有runtime不回滚、不删除。保存/业务写入始终保留。

## 本目录验证

```powershell
& $py -m unittest discover -s deployment/toyingzhen/tests
& $py -m py_compile deployment/toyingzhen/release.py deployment/toyingzhen/build.py deployment/toyingzhen/prepare-runtime.py deployment/toyingzhen/audit-config.py
```

Linux远端脚本需要已存在的Python3、psql、ss、systemd、Nginx和Java21。Windows构建使用现有Maven3.9.11（ems-cloud-api/.tools/apache-maven-3.9.11）、Temurin21（C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot）与Codex Node24/Python/pnpm。先校验Maven ZIP固定SHA512及解压文件，再验证运行版本；直接Java调用Maven launcher，不调用快照mvnw.ps1、不依赖Get-FileHash或在线bootstrap。Node使用绝对路径，子进程PATH显式优先Node/Java/Maven，清除外部注入的Java/Node/Maven启动选项。参数可覆盖安装路径但版本校验仍强制。工具信息写入release.json。r1失败目录保留，修正后使用全新r2（或以后递增），不在旧snapshot补丁重试。没有自动安装/变更服务器软件、防火墙或安全组的操作。
