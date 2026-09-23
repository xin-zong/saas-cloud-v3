$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker Desktop is not installed or docker.exe is not on PATH."
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose v2 is not available."
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker is not running."
}

if (-not (Test-Path -LiteralPath "dist\index.html")) {
  throw "dist\index.html is missing. Use the complete deployment package."
}

if (-not (Test-Path -LiteralPath ".env")) {
  Copy-Item -LiteralPath ".env.example" -Destination ".env"
}

Write-Host "Pulling the web server image..."
& docker compose pull
if ($LASTEXITCODE -ne 0) {
  throw "Failed to pull the web server image."
}

Write-Host "Starting Enerlution..."
& docker compose up -d --remove-orphans --force-recreate
if ($LASTEXITCODE -ne 0) {
  throw "Failed to start Enerlution."
}

$containerId = (& docker compose ps -q web).Trim()
if (-not $containerId) {
  throw "The web container was not created."
}

$healthy = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $containerId).Trim()
  if ($health -in @("healthy", "running")) {
    $healthy = $true
    break
  }
  if ($health -in @("unhealthy", "exited", "dead")) {
    & docker compose logs --tail=100 web
    throw "The web container failed its health check."
  }
  Start-Sleep -Seconds 2
}

if (-not $healthy) {
  & docker compose logs --tail=100 web
  throw "Timed out while waiting for the web container."
}

$port = "80"
$portLine = Get-Content -LiteralPath ".env" |
  Where-Object { $_ -match "^\s*APP_PORT\s*=" } |
  Select-Object -Last 1
if ($portLine) {
  $configuredPort = ($portLine -split "=", 2)[1].Trim()
  if ($configuredPort) {
    $port = $configuredPort
  }
}

$url = if ($port -eq "80") { "http://localhost" } else { "http://localhost:$port" }
Write-Host ""
Write-Host "Enerlution is running."
Write-Host "URL: $url"
Write-Host "Health: $url/healthz"
