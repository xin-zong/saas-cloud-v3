param(
  [string]$SshHost = '120.27.23.229',
  [string]$SshUser = 'root',
  [string]$IdentityFile = (Join-Path $HOME '.ssh/codex_chuneng_shared_test_20260915')
)
$ErrorActionPreference = 'Stop'
Write-Host 'Toyingzhen forwards: PostgreSQL 15435, read-only ClickHouse 18126. Keep this terminal running.'
& ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 `
  -i $IdentityFile -L '127.0.0.1:15435:127.0.0.1:5432' -L '127.0.0.1:18126:127.0.0.1:18123' "$SshUser@$SshHost"
exit $LASTEXITCODE
