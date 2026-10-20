param(
  [string]$Release,
  [string]$ExpectedSource,
  [switch]$Inspect,
  [switch]$CheckTools,
  [string]$Node = (Join-Path $HOME ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"),
  [string]$JavaHome = "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot",
  [string]$MavenHome = (Join-Path $PSScriptRoot "../../ems-cloud-api/.tools/apache-maven-3.9.11"),
  [string]$Python = (Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),
  [string]$Pnpm = (Join-Path $HOME '.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd')
)
$ErrorActionPreference='Stop'
$buildArgs=@((Join-Path $PSScriptRoot 'build.py'),'--pnpm',$Pnpm,'--node',$Node,'--java-home',$JavaHome,'--maven-home',$MavenHome)
if($CheckTools){$buildArgs+='--check-tools'}elseif($Inspect){$buildArgs+='--inspect'}else{$buildArgs+=@('--release',$Release,'--expected-source',$ExpectedSource)}
& $Python @buildArgs
if($LASTEXITCODE -ne 0){throw 'Isolated build failed; no upload or activation was attempted'}
