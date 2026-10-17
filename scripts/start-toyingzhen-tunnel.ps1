param(
  [string]$SshHost = '120.27.23.229',
  [string]$SshUser = 'root',
  [string]$IdentityFile = (Join-Path $HOME '.ssh/codex_chuneng_shared_test_20260915'),
  [switch]$Once
)
$ErrorActionPreference = 'Stop'
Write-Host 'Toyingzhen forwards: PostgreSQL 15435, read-only ClickHouse 18126. Keep this terminal running.'
do {
  & ssh -N -T -o BatchMode=yes -o ConnectTimeout=10 -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 `
    -i $IdentityFile -L '127.0.0.1:15435:127.0.0.1:5432' -L '127.0.0.1:18126:127.0.0.1:18123' "$SshUser@$SshHost"
  $tunnelExitCode = $LASTEXITCODE
  if ($Once -or $tunnelExitCode -eq 0) { exit $tunnelExitCode }
  Write-Warning 'Isolated database tunnel disconnected; reconnecting in 5 seconds. Ctrl+C stops it.'
  Start-Sleep -Seconds 5
} while ($true)
