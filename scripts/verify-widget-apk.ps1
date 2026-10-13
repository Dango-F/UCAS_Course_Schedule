param(
    [Parameter(Mandatory=$true)][string]$ApkPath,
    [string]$JavaPath = 'java',
    [string]$ApkSignerJar = 'E:/HBuilderX/plugins/app-safe-pack/apksigner.jar',
    [string]$ExpectedSigner = '4c6e0458bbd1f045fac39cec61f21eb132e49f4260fa4e4af437d94f593bdfa7',
    [switch]$CustomBase
)
$ErrorActionPreference = 'Stop'
$widgetRoot = Split-Path $PSScriptRoot -Parent
$widgetAapt = Join-Path $widgetRoot '.artifacts/widget-native/tools/aapt2/aapt2.exe'
if (-not (Test-Path -LiteralPath $widgetAapt)) { throw 'Run verify:widget-native first to prepare aapt2.' }
$widgetApk = (Resolve-Path -LiteralPath $ApkPath).Path
function Invoke-WidgetAapt([string[]]$Arguments) {
    $result = & $widgetAapt @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "aapt2 failed: $result" }
    return $result -join "`n"
}
$widgetBadging = Invoke-WidgetAapt @('dump','badging',$widgetApk)
$widgetManifest = Invoke-WidgetAapt @('dump','xmltree',$widgetApk,'--file','AndroidManifest.xml')
$widgetResources = Invoke-WidgetAapt @('dump','resources',$widgetApk)
$widgetChecks = [ordered]@{}
$widgetChecks['packageName'] = $widgetBadging.Contains("package: name='ucas.course.schedule'")
$widgetChecks['minSdk23'] = $widgetBadging.Contains("minSdkVersion:'23'")
$widgetChecks['nativeApiVersion2'] = $widgetManifest -match 'com\.lakeside\.widget\.API_VERSION[^\r\n]*\r?\n[^\r\n]*android:value[^\r\n]*=(?:\(type 0x10\))?(?:0x2|2)(?:\s|$)'
$widgetComponents = @('LargeWidgetProvider','SmallWidgetProvider','WidgetPinReceiver','WidgetEnvironmentReceiver','WidgetCollectionService','WidgetEntryActivity')
foreach ($component in $widgetComponents) { $widgetChecks["manifest.$component"] = $widgetManifest.Contains("com.lakeside.widget.$component") }
$widgetChecks['widgetMetadata'] = ([regex]::Matches($widgetManifest,'android.appwidget.provider').Count -eq 2)
$widgetChecks['bootPermission'] = $widgetManifest.Contains('android.permission.RECEIVE_BOOT_COMPLETED')
$widgetChecks['remoteViewsServicePermission'] = $widgetManifest.Contains('android.permission.BIND_REMOTEVIEWS')
foreach ($resource in @('layout/ls_widget_large','layout/ls_widget_small','layout/ls_widget_small_compact','layout/ls_widget_small_dense','layout/ls_widget_small_medium','layout/ls_widget_course','layout/ls_widget_status_active','layout/ls_widget_status_active_static','layout/ls_widget_status_pending','layout/ls_widget_status_ended','layout/ls_widget_status_active_small','layout/ls_widget_status_active_small_static','layout/ls_widget_status_pending_small','layout/ls_widget_status_ended_small','xml/ls_widget_large_info','xml/ls_widget_small_info','drawable/ls_widget_background','drawable/ls_widget_day_button','id/ls_widget_day','id/ls_small_second','id/ls_small_content_second','id/ls_small_status','id/ls_small_third','id/ls_small_fourth','id/ls_small_line_gap','id/ls_small_edge_gap_top','id/ls_small_edge_gap_bottom','id/ls_small_one_bottom_gap','id/ls_small_content_third','id/ls_small_content_fourth','id/ls_course_status','dimen/ls_widget_default_width')) {
    $widgetChecks["resource.$resource"] = $widgetResources.Contains($resource)
}

# Read DEX class definitions, rather than merely looking for referenced class names.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$widgetClasses = [Collections.Generic.HashSet[string]]::new()
$widgetSuperclasses = @{}
$widgetZip = [IO.Compression.ZipFile]::OpenRead($widgetApk)
try {
    foreach ($entry in $widgetZip.Entries | Where-Object { $_.FullName -match '^classes\d*\.dex$' }) {
        $inputStream = $entry.Open(); $memory = [IO.MemoryStream]::new()
        try { $inputStream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $inputStream.Dispose(); $memory.Dispose() }
        if ($bytes.Length -lt 112 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne "dex`n") { throw 'Invalid DEX header' }
        $stringsOffset = [BitConverter]::ToUInt32($bytes,60)
        $typesOffset = [BitConverter]::ToUInt32($bytes,68)
        $classesCount = [BitConverter]::ToUInt32($bytes,96)
        $classesOffset = [BitConverter]::ToUInt32($bytes,100)
        function Get-WidgetDexType([uint32]$TypeIndex) {
            if ($TypeIndex -eq [uint32]::MaxValue) { return '' }
            $stringIndex = [BitConverter]::ToUInt32($bytes,$typesOffset+4*$TypeIndex)
            $cursor = [BitConverter]::ToUInt32($bytes,$stringsOffset+4*$stringIndex)
            do { $value=$bytes[$cursor]; $cursor++ } while (($value -band 128) -ne 0)
            $start=$cursor
            while ($bytes[$cursor] -ne 0) { $cursor++ }
            return [Text.Encoding]::UTF8.GetString($bytes,$start,$cursor-$start)
        }
        for ($index=0; $index -lt $classesCount; $index++) {
            $typeIndex = [BitConverter]::ToUInt32($bytes,$classesOffset+32*$index)
            $descriptor = Get-WidgetDexType $typeIndex
            [void]$widgetClasses.Add($descriptor)
            $widgetSuperclasses[$descriptor] = Get-WidgetDexType ([BitConverter]::ToUInt32($bytes,$classesOffset+32*$index+8))
        }
    }
    # A custom base receives JS assets from HBuilderX at run time. A release APK must bundle them.
    if (-not $CustomBase) { $widgetChecks['appAssets'] = $null -ne $widgetZip.GetEntry('assets/apps/__UNI__F1ADC35/www/app-service.js') }
    # Renaming or copying android_debug.apk into release/ does not create a release APK.
    $widgetControlEntry = $widgetZip.GetEntry('assets/data/dcloud_control.xml')
    $widgetChecks['appControlConfig'] = $null -ne $widgetControlEntry
    if ($widgetControlEntry) {
        $widgetControlReader = [IO.StreamReader]::new($widgetControlEntry.Open())
        try { [xml]$widgetControlConfig = $widgetControlReader.ReadToEnd() } finally { $widgetControlReader.Dispose() }
        $widgetIsDebugBase = $widgetControlConfig.DocumentElement.GetAttribute('debug') -eq 'true' -or $widgetControlConfig.DocumentElement.GetAttribute('syncDebug') -eq 'true'
        $widgetChecks['packageMode'] = if ($CustomBase) { $widgetIsDebugBase } else { -not $widgetIsDebugBase }
    } else { $widgetChecks['packageMode'] = $false }
} finally { $widgetZip.Dispose() }
foreach ($component in ($widgetComponents + @('WidgetRefreshWorker','LakesideWidgetBridge'))) {
    $widgetChecks["dex.$component"] = $widgetClasses.Contains("Lcom/lakeside/widget/$component;")
}
# R8 may rename AndroidX classes. Check that the actual worker superclass is packaged.
$widgetWorkerParent = $widgetSuperclasses['Lcom/lakeside/widget/WidgetRefreshWorker;']
$widgetChecks['dex.workerSuperclassPackaged'] = $widgetWorkerParent -and $widgetWorkerParent -ne 'Ljava/lang/Object;' -and $widgetClasses.Contains($widgetWorkerParent)
if (-not (Test-Path -LiteralPath $ApkSignerJar)) { throw 'Pass -ApkSignerJar pointing to Android apksigner.jar.' }
$widgetSignature = & $JavaPath -jar $ApkSignerJar verify --print-certs $widgetApk 2>&1
$widgetSignatureOk = $LASTEXITCODE -eq 0
$widgetSignatureText = $widgetSignature -join "`n"
$widgetSignerMatch = [regex]::Match($widgetSignatureText,'certificate SHA-256 digest: ([0-9a-f]+)')
$widgetChecks['signature.valid'] = $widgetSignatureOk
$widgetChecks['signature.upgradeCompatible'] = $widgetSignatureOk -and $widgetSignerMatch.Success -and $widgetSignerMatch.Groups[1].Value -eq $ExpectedSigner
$widgetFailed = @($widgetChecks.Keys | Where-Object { -not $widgetChecks[$_] })
$widgetReport = [ordered]@{ apk=$widgetApk; customBase=$CustomBase.IsPresent; sha256=(Get-FileHash -LiteralPath $widgetApk -Algorithm SHA256).Hash; checkedAt=[DateTime]::UtcNow.ToString('o'); passed=$widgetFailed.Count -eq 0; checks=$widgetChecks; failed=$widgetFailed; notice='Static artifact inspection only; does not validate launcher display, UTS calls or background scheduling.' }
$widgetReportPath = Join-Path $widgetRoot '.artifacts/widget-apk-verification.json'
$widgetReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $widgetReportPath -Encoding UTF8
Write-Host "APK verification report: $widgetReportPath"
if ($widgetFailed.Count) {
    Write-Host 'APK verification failed. The command ran successfully, but this APK did not pass the release checks.' -ForegroundColor Red
    if (-not $widgetChecks['manifest.LargeWidgetProvider'] -and -not $widgetChecks['manifest.SmallWidgetProvider'] -and -not $widgetChecks['dex.LakesideWidgetBridge'] -and -not $widgetChecks['resource.layout/ls_widget_large']) {
        Write-Host 'The native widget plugin is absent: Provider registrations, native classes and layouts are missing. Inspect the native packaging inputs and build log before installing this APK.' -ForegroundColor Red
    }
    Write-Host ('Failed checks: ' + ($widgetFailed -join ', ')) -ForegroundColor Red
    exit 1
}
Write-Host 'Package identity, signing, widget components, DEX classes and resources passed static inspection.'
