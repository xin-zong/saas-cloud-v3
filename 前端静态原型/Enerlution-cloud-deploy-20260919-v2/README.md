# Enerlution 云端一键部署包

本目录包含已经构建完成的网页文件。服务器不需要安装 Node.js，也不需要在服务器上重新编译。

## 文件说明

- `dist/`：最新生产网页
- `docker-compose.yml`：容器编排
- `nginx.conf`：静态站点、SPA 路由、缓存、压缩和安全响应头
- `deploy.sh`：已有 Docker 环境一键部署
- `install-and-deploy-ubuntu.sh`：全新 Ubuntu 服务器安装 Docker 并部署
- `deploy-iis.ps1`：阿里云 Windows Server / IIS 一键部署或更新
- `deploy.ps1`：Windows Docker Desktop 辅助部署
- `update.sh`：替换 `dist/` 后重新发布
- `stop.sh`：停止服务
- `logs.sh`：查看实时日志

## 阿里云 Windows Server 一键部署或更新

把完整压缩包上传到服务器并解压。然后用“以管理员身份运行”的 PowerShell 进入解压目录，执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\deploy-iis.ps1
```

脚本会自动：

- 安装并启动 IIS
- 将 `Default Web Site` 指向当前部署包的 `dist/`
- 授予 IIS 静态文件读取权限
- 开放 Windows 防火墙 TCP `80`
- 执行本机 HTTP 检查并确认返回 `200`

部署完成后访问：

```text
http://47.99.70.238
```

阿里云 ECS 安全组也必须放行入方向 TCP `80`。后续更新时，把新版压缩包解压到新目录，再次执行同一条 `.\deploy-iis.ps1` 即可切换到新版网页。

如需使用其他 IIS 站点名或端口：

```powershell
.\deploy-iis.ps1 -SiteName "Enerlution" -Port 8080 -PublicHost "服务器公网IP"
```

## 多角色演示账号

| 角色 | 登录账号 | 密码 | 动态验证码 |
| --- | --- | --- | --- |
| 电站业主 | `owner@enerlution.cn` | `Demo@2026` | 无需验证码 |
| 运维人员 | `operator@enerlution.cn` | `Demo@2026` | `246810` |
| 安装服务商 | `integrator@enerlution.cn` | `Demo@2026` | `246810` |

角色不具备的菜单与操作会直接隐藏。电站业主可以查看一次接线图和设备详情，但不能执行设备控制或修改参数。

## 全新 Ubuntu 服务器

上传并解压本包后，在包目录执行：

```bash
sudo bash install-and-deploy-ubuntu.sh
```

脚本会安装 Docker Engine 与 Docker Compose，拉取 Nginx 镜像，启动网页并等待健康检查通过。

## 已安装 Docker 的服务器

```bash
sudo bash deploy.sh
```

默认访问地址：

```text
http://服务器公网IP
```

云服务器安全组或防火墙需要放行 TCP `80`。如果修改了端口，也要放行对应端口。

## 修改端口

首次部署前：

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
APP_BIND=0.0.0.0
APP_PORT=8080
PUBLIC_HOST=服务器公网IP或域名
NGINX_IMAGE=nginx:1.27-alpine
```

然后执行：

```bash
sudo bash deploy.sh
```

## 更新网页

将新版本生产文件完整替换到 `dist/`，然后执行：

```bash
sudo bash update.sh
```

浏览器入口页不做长期缓存，带哈希的 JS/CSS 资源缓存一年，因此更新后会自动切换到新资源。

## 运维命令

```bash
# 查看容器状态
sudo docker compose ps

# 查看实时日志
sudo bash logs.sh

# 健康检查
curl http://127.0.0.1/healthz

# 停止服务
sudo bash stop.sh
```

## 域名与 HTTPS

正式公网访问建议把域名解析到服务器公网 IP，并在云负载均衡、CDN、Caddy 或现有 HTTPS 网关上配置证书，再反向代理到本服务端口。

如果站点地图需要正式高德 Key，`VITE_AMAP_KEY` 必须在前端执行 `npm run build` 前注入；它属于构建时变量，部署后修改 `.env` 不会写入已经生成的 JS。

## 上线前安全提示

当前项目的账号、角色和演示数据运行在前端，登录状态保存在浏览器本地存储中。这套发布包适合演示、验收和受控访问，不应被当作真实生产身份认证系统。正式接入真实业务前，应接入服务端登录、令牌校验、权限接口、审计日志和真实数据 API，并删除前端演示账号。
