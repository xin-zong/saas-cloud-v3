param([Parameter(Mandatory=$true)][string]$RuntimeEnvFile)
$ErrorActionPreference='Stop'
$apiRoot=Split-Path -Parent $PSScriptRoot
foreach($line in Get-Content -LiteralPath $RuntimeEnvFile){
  if($line -match '^([A-Z][A-Z0-9_]*)=(.*)$'){
    [Environment]::SetEnvironmentVariable($Matches[1],$Matches[2],'Process')
  }
}
$env:EMS_DB_URL='jdbc:postgresql://127.0.0.1:15434/ems_cloud_v2_proto'
$env:EMS_CH_URL='http://127.0.0.1:18125'
$env:EMS_CORS_ORIGINS='http://localhost:8443,http://127.0.0.1:8443'
if(!$env:EMS_DB_PASSWORD -or !$env:EMS_CH_PASSWORD){throw 'Runtime database credentials are required'}
& java -jar (Join-Path $apiRoot 'target/ems-cloud-api-0.1.0.jar')
exit $LASTEXITCODE
