param([Parameter(Mandatory=$true)][string]$RuntimeEnvFile)
$ErrorActionPreference='Stop'
$apiRoot=Split-Path -Parent $PSScriptRoot
foreach($line in Get-Content -LiteralPath $RuntimeEnvFile){
  if($line -match '^([A-Z][A-Z0-9_]*)=(.*)$'){
    [Environment]::SetEnvironmentVariable($Matches[1],$Matches[2],'Process')
  }
}
if($env:EMS_DATABASE_NAME -ne 'ems_cloud_saas_toyingzhen' -or
   $env:EMS_DB_URL -ne 'jdbc:postgresql://127.0.0.1:15435/ems_cloud_saas_toyingzhen' -or
   $env:EMS_DB_USERNAME -ne 'ems_toyingzhen_owner'){
  throw 'This branch requires the isolated toyingzhen database and dedicated account on tunnel port 15435'
}
$env:EMS_CH_URL='http://127.0.0.1:18126'
$env:EMS_CORS_ORIGINS='http://localhost:8444,http://127.0.0.1:8444'
$env:EMS_PORT='18091'
$env:EMS_BIND_ADDRESS='127.0.0.1'
if(!$env:EMS_DB_PASSWORD -or !$env:EMS_CH_PASSWORD){throw 'Runtime database credentials are required'}
# Run an immutable local copy so a later build does not overwrite/lock the running jar.
$runtimeRoot=Join-Path (Split-Path -Parent $apiRoot) '.local-tools/runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$runtimeJar=Join-Path $runtimeRoot ('ems-cloud-api-'+[guid]::NewGuid().ToString('N')+'.jar')
Copy-Item -LiteralPath (Join-Path $apiRoot 'target/ems-cloud-api-0.1.0.jar') -Destination $runtimeJar
& java -jar $runtimeJar
exit $LASTEXITCODE
