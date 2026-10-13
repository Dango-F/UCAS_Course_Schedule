param(
    [Parameter(Mandatory=$true)][string]$ApkPath,
    [string]$JavaPath = 'E:/Java/jdk-17/bin/java.exe',
    [string]$ApkSignerJar = 'E:/HBuilderX/plugins/app-safe-pack/apksigner.jar'
)
$ErrorActionPreference = 'Stop'
$widgetRoot = Split-Path $PSScriptRoot -Parent
$widgetApk = (Resolve-Path -LiteralPath $ApkPath).Path
# Never switch the project to a stale custom base without verifying its actual native contents.
& (Join-Path $PSScriptRoot 'verify-widget-apk.ps1') -ApkPath $widgetApk -JavaPath $JavaPath -ApkSignerJar $ApkSignerJar -CustomBase
if ($LASTEXITCODE -ne 0) { throw 'Custom base verification failed; run configuration was not changed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$widgetArchive = [IO.Compression.ZipFile]::OpenRead($widgetApk)
try {
    $widgetDebugEntry = $widgetArchive.GetEntry('assets/data/dcloud_control.xml')
    if (-not $widgetDebugEntry) { throw 'Not a DCloud custom debug base; create a custom debug base instead of selecting a release APK.' }
    $widgetReader = [IO.StreamReader]::new($widgetDebugEntry.Open())
    try { $widgetControl = $widgetReader.ReadToEnd() } finally { $widgetReader.Dispose() }
    if ($widgetControl -notmatch 'debug\s*=\s*["'']true["'']') { throw 'APK is not marked as a debug base; run configuration was not changed.' }
} finally { $widgetArchive.Dispose() }
# HBuilderX's CLI-project launcher resolves the local custom base under dist/debug.
$widgetBaseFolder = Join-Path $widgetRoot 'dist/debug'
New-Item -ItemType Directory -Force -Path $widgetBaseFolder | Out-Null
$widgetBaseTarget = Join-Path $widgetBaseFolder 'android_debug.apk'
if ($widgetApk -ne [IO.Path]::GetFullPath($widgetBaseTarget)) { Copy-Item -LiteralPath $widgetApk -Destination $widgetBaseTarget -Force }
$widgetLaunchPath = Join-Path $widgetRoot '.hbuilderx/launch.json'
$widgetLaunch = if (Test-Path -LiteralPath $widgetLaunchPath) { Get-Content -LiteralPath $widgetLaunchPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{ version='1.0'; configurations=@() } }
$widgetBackupFolder = Join-Path $widgetRoot '.artifacts/backups'
New-Item -ItemType Directory -Force -Path $widgetBackupFolder | Out-Null
if (Test-Path -LiteralPath $widgetLaunchPath) { Copy-Item -LiteralPath $widgetLaunchPath -Destination (Join-Path $widgetBackupFolder ('widget-launch-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')) }
$widgetConfigs = @($widgetLaunch.configurations)
$widgetAndroid = $widgetConfigs | Where-Object { $_.type -eq 'uni-app:app-android' } | Select-Object -First 1
if (-not $widgetAndroid) { $widgetAndroid = [pscustomobject]@{type='uni-app:app-android'}; $widgetConfigs += $widgetAndroid }
$widgetAndroid | Add-Member -NotePropertyName playground -NotePropertyValue 'custom' -Force
$widgetAndroid | Add-Member -NotePropertyName customPlaygroundType -NotePropertyValue 'local' -Force
$widgetLaunch | Add-Member -NotePropertyName configurations -NotePropertyValue $widgetConfigs -Force
New-Item -ItemType Directory -Force -Path (Split-Path $widgetLaunchPath -Parent) | Out-Null
[IO.File]::WriteAllText($widgetLaunchPath, ($widgetLaunch | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
Write-Host "Verified custom base copied to: $widgetBaseTarget"
Write-Host 'Android run configuration now selects custom / local. Stop the current standard-base session and run the project again in HBuilderX.'
