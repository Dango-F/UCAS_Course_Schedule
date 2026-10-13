param(
    [string]$JavaHome = 'E:/Java/jdk-17',
    [switch]$ConfigureHBuilderX
)
$ErrorActionPreference = 'Stop'
$widgetRoot = Split-Path $PSScriptRoot -Parent
$widgetTools = Join-Path $widgetRoot '.artifacts/android-environment'
$widgetDownloads = Join-Path $widgetTools 'downloads'
$widgetSdk = Join-Path $widgetTools 'sdk'
New-Item -ItemType Directory -Force -Path $widgetDownloads, $widgetSdk | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/javac.exe'))) { throw 'Pass -JavaHome pointing to an installed JDK 17.' }
$widgetJavaVersion = (& (Join-Path $JavaHome 'bin/java.exe') --version | Out-String)
if ($LASTEXITCODE -ne 0 -or $widgetJavaVersion -notmatch '(java|openjdk) 17\.') { throw 'This environment uses JDK 17.' }

function Get-VerifiedArchive([string]$Url, [string]$Name, [string]$Hash, [string]$Algorithm) {
    $target = Join-Path $widgetDownloads $Name
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "Downloading $Name"
        & curl.exe --fail --location --retry 2 --connect-timeout 20 --max-time 600 --silent --show-error $Url --output $target
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url. Remove the incomplete archive before retrying." }
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm $Algorithm).Hash -ne $Hash) { throw "Checksum mismatch: $target. Remove the incomplete archive before retrying." }
    return $target
}

$widgetGradleHash = (Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-8.7-bin.zip.sha256' -UseBasicParsing).Content
if ($widgetGradleHash -is [byte[]]) { $widgetGradleHash = [Text.Encoding]::UTF8.GetString($widgetGradleHash) }
$widgetGradleHash = $widgetGradleHash.Trim()
if ($widgetGradleHash -notmatch '^[0-9a-fA-F]{64}$') { throw 'Invalid checksum from Gradle distribution server.' }
$widgetGradleZip = Get-VerifiedArchive 'https://services.gradle.org/distributions/gradle-8.7-bin.zip' 'gradle-8.7-bin.zip' $widgetGradleHash 'SHA256'
$widgetGradle = Join-Path $widgetTools 'gradle-8.7/bin/gradle.bat'
if (-not (Test-Path -LiteralPath $widgetGradle)) { [IO.Compression.ZipFile]::ExtractToDirectory($widgetGradleZip, $widgetTools) }

$widgetRepositoryPath = Join-Path $widgetDownloads 'repository2-3.xml'
Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-3.xml' -OutFile $widgetRepositoryPath -UseBasicParsing
[xml]$widgetRepository = Get-Content -LiteralPath $widgetRepositoryPath
foreach ($widgetPackage in @('platforms;android-34', 'platforms;android-35', 'build-tools;35.0.0')) {
    $widgetPackageNode = $widgetRepository.SelectNodes('//*[local-name()="remotePackage"]') |
        Where-Object { $_.path -eq $widgetPackage -and $_.channelRef.ref -eq 'channel-0' } | Select-Object -First 1
    if (-not $widgetPackageNode) { throw "Official Android repository does not contain $widgetPackage" }
    $widgetArchive = $widgetPackageNode.archives.archive | Where-Object { $_.'host-os' -eq 'windows' -or -not $_.'host-os' } | Select-Object -First 1
    $widgetName = [string]$widgetArchive.complete.url
    $widgetHash = $widgetArchive.complete.checksum.InnerText
    $widgetZipPath = Get-VerifiedArchive "https://dl.google.com/android/repository/$widgetName" $widgetName $widgetHash 'SHA1'
    $widgetTarget = Join-Path $widgetSdk ($widgetPackage.Replace(';', '/'))
    if (-not (Test-Path -LiteralPath (Join-Path $widgetTarget 'source.properties'))) {
        # SDK archives use a version-independent top-level folder. Extract beneath the exact SDK package path.
        New-Item -ItemType Directory -Force -Path $widgetTarget | Out-Null
        $widgetZip = [IO.Compression.ZipFile]::OpenRead($widgetZipPath)
        try {
            foreach ($widgetEntry in $widgetZip.Entries) {
                $widgetRelative = $widgetEntry.FullName -replace '^[^/]+/', ''
                if (-not $widgetRelative -or $widgetEntry.FullName.EndsWith('/')) { continue }
                $widgetDestination = [IO.Path]::GetFullPath((Join-Path $widgetTarget $widgetRelative))
                if (-not $widgetDestination.StartsWith([IO.Path]::GetFullPath($widgetTarget) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe SDK archive entry' }
                New-Item -ItemType Directory -Force -Path (Split-Path $widgetDestination -Parent) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($widgetEntry, $widgetDestination, $true)
            }
        } finally { $widgetZip.Dispose() }
    }
}

$widgetValues = [ordered]@{
    'uts-development-android.gradleHome' = $widgetGradle
    'uts-development-android.javaHome' = [IO.Path]::GetFullPath($JavaHome)
    'uts-development-android.sdkDir' = $widgetSdk
}
$widgetValues | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $widgetTools 'hbuilderx-settings.json') -Encoding UTF8
if ($ConfigureHBuilderX) {
    $widgetSettingsPath = Join-Path $env:APPDATA 'HBuilder X/user/settings.json'
    $widgetSettings = if (Test-Path -LiteralPath $widgetSettingsPath) { Get-Content -LiteralPath $widgetSettingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
    if (Test-Path -LiteralPath $widgetSettingsPath) { Copy-Item -LiteralPath $widgetSettingsPath -Destination (Join-Path $widgetTools ('hbuilderx-settings-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')) }
    foreach ($widgetKey in $widgetValues.Keys) { $widgetSettings | Add-Member -NotePropertyName $widgetKey -NotePropertyValue $widgetValues[$widgetKey] -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path $widgetSettingsPath -Parent) | Out-Null
    $widgetSettings | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $widgetSettingsPath -Encoding UTF8
    Write-Host 'Updated only the three Android UTS environment settings; previous settings backed up locally.'
}
$widgetPreviousJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = $JavaHome
    & $widgetGradle --version
    if ($LASTEXITCODE -ne 0) { throw 'Gradle environment check failed' }
} finally { $env:JAVA_HOME = $widgetPreviousJavaHome }
Write-Host "Android environment ready: $widgetTools"
Write-Host 'This configures local dependency compilation only. Native Manifest additions still require a new APK/custom base.'
