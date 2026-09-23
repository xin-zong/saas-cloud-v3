param(
  [string]$SiteName = "Default Web Site",
  [int]$Port = 80,
  [string]$PublicHost = "47.99.70.238"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdministrator = $principal.IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdministrator) {
  throw "Run PowerShell as Administrator, then execute this script again."
}

$distPath = Join-Path $PSScriptRoot "dist"
$indexPath = Join-Path $distPath "index.html"
if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
  throw "dist\index.html is missing. Use the complete deployment package."
}
$distPath = (Resolve-Path -LiteralPath $distPath).Path

Import-Module ServerManager
$features = @(
  "Web-Server",
  "Web-Static-Content",
  "Web-Default-Doc",
  "Web-Http-Errors",
  "Web-Http-Logging",
  "Web-Stat-Compression",
  "Web-Mgmt-Console"
)
$missingFeatures = $features | Where-Object {
  -not (Get-WindowsFeature -Name $_).Installed
}
if ($missingFeatures) {
  Write-Host "Installing IIS features..."
  $installResult = Install-WindowsFeature `
    -Name $missingFeatures `
    -IncludeManagementTools
  if (-not $installResult.Success) {
    throw "IIS feature installation failed."
  }
}

Import-Module WebAdministration

if (Test-Path -LiteralPath "IIS:\Sites\$SiteName") {
  Set-ItemProperty `
    -LiteralPath "IIS:\Sites\$SiteName" `
    -Name physicalPath `
    -Value $distPath
} else {
  Write-Host "Creating IIS site '$SiteName'..."
  New-Website `
    -Name $SiteName `
    -Port $Port `
    -PhysicalPath $distPath `
    -Force | Out-Null
}

$httpBindings = Get-WebBinding -Name $SiteName -Protocol "http"
$hasRequestedPort = $httpBindings | Where-Object {
  ($_.bindingInformation -split ":")[1] -eq [string]$Port
}
if (-not $hasRequestedPort) {
  New-WebBinding `
    -Name $SiteName `
    -Protocol "http" `
    -Port $Port `
    -IPAddress "*" | Out-Null
}

& icacls.exe $distPath /grant "IIS_IUSRS:(OI)(CI)(RX)" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to grant IIS read access to the website directory."
}

$firewallRuleName = "Enerlution-HTTP-$Port"
if (-not (Get-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule `
    -Name $firewallRuleName `
    -DisplayName "Enerlution HTTP $Port" `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port | Out-Null
}

Set-Service -Name W3SVC -StartupType Automatic
Start-Service -Name W3SVC
if ((Get-Website -Name $SiteName).State -ne "Started") {
  Start-Website -Name $SiteName
}

$url = "http://127.0.0.1"
if ($Port -ne 80) {
  $url = "$url`:$Port"
}

$response = $null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $response -or $response.StatusCode -ne 200) {
  throw "IIS started, but the local HTTP health check did not return 200."
}

Write-Host ""
Write-Host "Enerlution deployment succeeded."
Write-Host "HTTP status: $($response.StatusCode)"
Write-Host "Website directory: $distPath"
Write-Host "Local URL: $url"
Write-Host "Public URL: http://$PublicHost$(if ($Port -ne 80) { ":$Port" })"
