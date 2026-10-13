param(
    [string]$HBuilderXPath = '',
    [string]$JavaPath = 'java',
    [switch]$CustomBase,
    [switch]$Submit
)
$ErrorActionPreference = 'Stop'
$widgetRoot = Split-Path $PSScriptRoot -Parent
if (-not $HBuilderXPath) {
    $widgetInstalledAbout = 'E:/HBuilderX/plugins/about/package.json'
    if ((Test-Path -LiteralPath $widgetInstalledAbout) -and [version](Get-Content -Raw -LiteralPath $widgetInstalledAbout | ConvertFrom-Json).version -ge [version]'5.26.2026091802') {
        $HBuilderXPath = 'E:/HBuilderX'
    } else { $HBuilderXPath = Join-Path $widgetRoot '.artifacts/hbuilderx-toolchain/5.26/HBuilderX' }
}
$widgetCli = Join-Path $HBuilderXPath 'cli.exe'
if (-not (Test-Path -LiteralPath $widgetCli)) { throw "HBuilderX not found at $HBuilderXPath; pass -HBuilderXPath." }
$widgetVersion = (Get-Content -Raw -LiteralPath (Join-Path $HBuilderXPath 'plugins/about/package.json') | ConvertFrom-Json).version
if ([version]$widgetVersion -lt [version]'5.26.2026091802') { throw "HBuilderX $widgetVersion is older than the project compiler; use 5.26.2026091802 or compatible newer." }
# A nested build project can be resolved as its already-open parent CLI project by HBuilderX.
# Keep the cloud build projection outside that project tree so native uni_modules sit at its root.
# Agent terminals may have a virtualized TEMP that the desktop HBuilderX cannot see.
# Use the user's normal local temp directory for this shared build projection.
$widgetBuildKind = if ($CustomBase) { 'Debug' } else { 'Release' }
$widgetBuildStamp = [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6)
$widgetProject = Join-Path $env:USERPROFILE "AppData/Local/Temp/LakesideWidget$widgetBuildKind-$widgetBuildStamp"
& node (Join-Path $PSScriptRoot 'prepare-widget-hbuilderx.cjs') --output $widgetProject
if ($LASTEXITCODE -ne 0) { throw 'HBuilderX source projection failed' }
# Use the same native cloud build route that produced the working custom base.
# A fresh projection avoids reusing the release APK/native-shell cache of the CLI project.
# This is a controlled workaround for this project's missing release plugin, not a claim
# that DCloud safe packaging generally cannot include UTS plugins.
$widgetSafeMode = 'false'
$widgetPackMode = if ($CustomBase) { 'DCloud traditional cloud packaging (custom debug base)' } else { 'DCloud traditional cloud packaging (release APK)' }
$widgetArguments = @('pack', '--project', $widgetProject, '--platform', 'android', '--iscustom', $CustomBase.IsPresent.ToString().ToLowerInvariant(), '--safemode', $widgetSafeMode, '--android.packagename', 'ucas.course.schedule', '--android.androidpacktype', '3', '--sourceMap', 'false', '--splashads', 'false', '--rpads', 'false', '--unimpads', 'false')
$widgetPlan = [ordered]@{
    project = $widgetProject; hbuilderx = $widgetVersion; packageName = 'ucas.course.schedule'
    appId = '__UNI__F1ADC35'; certificate = 'existing DCloud cloud certificate'; customBase = $CustomBase.IsPresent
    mode = $widgetPackMode; arguments = $widgetArguments
    sourceRoot = (Join-Path $widgetRoot 'src'); freshBuildDirectory = $true
    sourceInventory = (Join-Path $widgetProject 'lakeside-build-inputs.json')
    notice = 'Submission sends native plugin code and build inputs to DCloud. No passwords or private keys are included in this plan. Without -Submit this script only prepares local files.'
}
$widgetPlanPath = Join-Path $widgetRoot '.artifacts/widget-cloud-pack-plan.json'
$widgetPlan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $widgetPlanPath -Encoding UTF8
Write-Host "Prepared local build project and plan: $widgetPlanPath"
Write-Host "Open this fresh source project in HBuilderX: $widgetProject"
Write-Host "For manual packaging, first install Vue/Pinia with: npm install --prefix `"$widgetProject`" --ignore-scripts --no-audit --no-fund"
Write-Host "Choose Android, $(if ($CustomBase) { 'custom debug base' } else { 'release package' }), traditional packaging, and the existing cloud certificate."
if (-not $Submit) { Write-Host 'No cloud request sent. Use -Submit only after authorizing DCloud cloud packaging.'; exit 0 }
if (-not (Get-Command $JavaPath -ErrorAction SilentlyContinue)) { throw 'Java is needed for APK verification; pass -JavaPath pointing to java.exe.' }
& npm install --prefix $widgetProject --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Build project dependencies could not be installed.' }
function Invoke-WidgetCli([string[]]$Arguments) {
    $messages = [Collections.Generic.List[string]]::new()
    & $widgetCli @Arguments 2>&1 | ForEach-Object { $message=$_.ToString(); $messages.Add($message); Write-Host $message }
    # HBuilderX can report a rejected operation while returning process exit code 0.
    if ($LASTEXITCODE -ne 0 -or ($messages -join "`n") -match '此功能需要先登录|未检测到已打开的HBuilderX|当前运行的cli与正在运行的HBuilderX不匹配|项目导入失败|(?m)^-\d+:') {
        throw 'HBuilderX command failed; resolve the message above before retrying.'
    }
}
Invoke-WidgetCli @('project','open','--path',$widgetProject)
$widgetBuildStarted = [DateTime]::UtcNow
Invoke-WidgetCli $widgetArguments
$widgetApk = Get-ChildItem -LiteralPath (Join-Path $widgetProject 'unpackage') -Recurse -File -Filter '*.apk' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -ge $widgetBuildStarted } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $widgetApk) { throw 'No new APK was produced in the selected build project. Do not distribute an old APK or another project output.' }
if ($CustomBase) {
    & (Join-Path $PSScriptRoot 'use-widget-custom-base.ps1') -ApkPath $widgetApk.FullName -JavaPath $JavaPath -ApkSignerJar (Join-Path $HBuilderXPath 'plugins/app-safe-pack/apksigner.jar')
} else {
    & (Join-Path $PSScriptRoot 'verify-widget-apk.ps1') -ApkPath $widgetApk.FullName -JavaPath $JavaPath -ApkSignerJar (Join-Path $HBuilderXPath 'plugins/app-safe-pack/apksigner.jar')
}
if ($LASTEXITCODE -ne 0) { throw 'APK is missing the required widget implementation or signing identity.' }
Write-Host "Verified widget APK: $($widgetApk.FullName)"
