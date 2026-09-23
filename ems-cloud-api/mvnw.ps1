$ErrorActionPreference = 'Stop'
$mavenVersion = '3.9.11'
$toolsDirectory = Join-Path $PSScriptRoot '.tools'
$mavenCommand = Join-Path $toolsDirectory "apache-maven-$mavenVersion/bin/mvn.cmd"
if (-not (Test-Path -LiteralPath $mavenCommand)) {
    New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
    $archivePath = Join-Path $toolsDirectory "apache-maven-$mavenVersion-bin.zip"
    Invoke-WebRequest "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$mavenVersion/apache-maven-$mavenVersion-bin.zip" -OutFile $archivePath
    $expectedHash = '03E2D65D4483A3396980629F260E25CAC0D8B6F7F2791E4DC20BC83F9514DB8D0F05B0479E699A5F34679250C49C8E52E961262DED468A20DE0BE254D8207076'
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA512).Hash -ne $expectedHash) { throw 'Maven distribution checksum mismatch' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDirectory -Force
}
& $mavenCommand @args
exit $LASTEXITCODE
