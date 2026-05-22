# ScanSplit installer for Windows.
# Usage: irm https://7174andy.github.io/scansplit/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$repo = '7174Andy/scansplit'
Write-Host 'Installing ScanSplit…'

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    Write-Error "Only x64 Windows is supported. Detected: $env:PROCESSOR_ARCHITECTURE"
    exit 1
}

$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like '*_x64_en-US.msi' } | Select-Object -First 1
if (-not $asset) {
    Write-Error "No .msi asset found in latest release. Has a release been published?"
    exit 1
}

$out = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name)…"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out

Write-Host 'Launching installer…'
Start-Process msiexec.exe -ArgumentList "/i `"$out`" /qb" -Wait

Write-Host 'ScanSplit installed.'
Write-Host "SmartScreen may warn on first launch — click 'More info' -> 'Run anyway' once and it stops asking."
