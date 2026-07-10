Param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-Dir($Path) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $PSScriptRoot '{{app}}'
$nwDir = Join-Path $appDir 'nw'
$nodeDir = Join-Path $appDir 'node'

Ensure-Dir $nodeDir

$nodeVersion = 'v20.11.0'
$zipUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
$tmpZip = Join-Path $env:TEMP "node-$nodeVersion-win-x64.zip"
$tmpExtract = Join-Path $env:TEMP "node-$nodeVersion-win-x64"

Write-Host "Downloading Node $nodeVersion ..." 
Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip

if (Test-Path -LiteralPath $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpExtract

$srcNodeRoot = Join-Path $tmpExtract "node-$nodeVersion-win-x64"
$srcExe = Join-Path $srcNodeRoot "node.exe"
if (-not (Test-Path -LiteralPath $srcExe)) { throw "node.exe not found in archive" }

[System.IO.File]::Copy($srcExe, (Join-Path $nodeDir 'node.exe'), $true)

# Install watchdog dependencies using downloaded Node/npm
$npmCli = Join-Path $srcNodeRoot "node_modules\npm\bin\npm-cli.js"
if (-not (Test-Path -LiteralPath $npmCli)) { throw "npm CLI not found in node distribution" }
$watchdogDir = Join-Path $root "service\watchdog"
Write-Host "Installing watchdog dependencies with Node $nodeVersion ..."
try {
  Push-Location $watchdogDir
  & $srcExe $npmCli ci --ignore-scripts
  & $srcExe $npmCli prune --production --ignore-scripts
} catch {
  Write-Warning "Dependency installation failed or skipped. Proceeding with existing node_modules."
} finally {
  Pop-Location
}

Remove-Item -LiteralPath $tmpZip -Force
Remove-Item -LiteralPath $tmpExtract -Recurse -Force

$nodeExe = Join-Path $nodeDir 'node.exe'
$size = (Get-Item -LiteralPath $nodeExe).Length
# SHA256 without Get-FileHash (PS 4 / older Windows)
$sha = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.IO.File]::ReadAllBytes($nodeExe)
$hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()

$watchdogJson = Join-Path $nwDir 'watchdog.json'
$json = Get-Content -LiteralPath $watchdogJson -Raw | ConvertFrom-Json

if ($null -eq $json.fileCheck -or $json.fileCheck.Count -lt 1) {
  $json.fileCheck = @()
}

$json.fileCheck[0] = @{
  sum = $hash
  size = $size
}

# Also update watchdog.js checksum
$watchdogJs = Join-Path $root "service\watchdog\watchdog.js"
if (Test-Path -LiteralPath $watchdogJs) {
  $watchdogBytes = [System.IO.File]::ReadAllBytes($watchdogJs)
  $watchdogHash = [BitConverter]::ToString($sha.ComputeHash($watchdogBytes)).Replace('-','').ToLowerInvariant()
  $watchdogSize = $watchdogBytes.Length
  if ($null -eq $json.fileCheck[1]) {
    $json.fileCheck += @{}
  }
  $json.fileCheck[1] = @{
    file = "../watchdog/watchdog.js"
    sum = $watchdogHash
    size = $watchdogSize
  }
  Write-Host "Updated watchdog.js checksum: $watchdogSize bytes, sha256=$watchdogHash"
}

$json | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $watchdogJson -Encoding UTF8

$sha.Dispose()
Write-Host "Prepared watcher runtime: $nodeExe ($size bytes, sha256=$hash)"
