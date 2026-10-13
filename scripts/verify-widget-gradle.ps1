param([string]$JavaHome = 'E:/Java/jdk-17')
$ErrorActionPreference = 'Stop'
$widgetRoot = Split-Path $PSScriptRoot -Parent
$widgetEnvironment = Join-Path $widgetRoot '.artifacts/android-environment'
$widgetProject = Join-Path $widgetEnvironment 'dependency-check'
$widgetGradle = Join-Path $widgetEnvironment 'gradle-8.7/bin/gradle.bat'
$widgetSdk = Join-Path $widgetEnvironment 'sdk'
if (-not (Test-Path -LiteralPath $widgetGradle)) { throw 'Run setup-widget-android-environment.ps1 first.' }
New-Item -ItemType Directory -Force -Path $widgetProject | Out-Null
function Save-WidgetGradleText([string]$Name, [string]$Content) {
    # Windows PowerShell 5's UTF8 encoding writes a BOM that Groovy rejects.
    [IO.File]::WriteAllText((Join-Path $widgetProject $Name), $Content, [Text.UTF8Encoding]::new($false))
}
$widgetConfig = Get-Content -LiteralPath (Join-Path $widgetRoot 'src/uni_modules/lakeside-widget/utssdk/app-android/config.json') -Raw | ConvertFrom-Json
$widgetDependencies = ($widgetConfig.dependencies | ForEach-Object {
    if ($_ -notmatch '^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+:[0-9.]+$') { throw 'Unexpected dependency coordinate' }
    "    implementation '$_'"
}) -join "`n"
# Match the Android UTS extension's Gradle 8 dependency resolver, rather than supplying jars by hand.
@'
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = 'lakeside-widget-dependency-check'
'@ | ForEach-Object { Save-WidgetGradleText 'settings.gradle' $_ }
@"
plugins { id 'com.android.application' version '8.2.2' }
android {
    namespace 'com.lakeside.widget.dependencycheck'
    compileSdk 34
    defaultConfig { minSdk 23; targetSdk 34 }
    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
}
dependencies {
$widgetDependencies
}
tasks.register('verifyWidgetDependencies') {
    doLast {
        def files = configurations.debugRuntimeClasspath.resolve()
        def names = files.collect { it.name }.sort()
        if (!names.any { it.startsWith('annotation-jvm-') }) throw new GradleException('Missing JVM Keep annotation dependency')
        if (!names.contains('work-runtime-2.11.2.aar')) throw new GradleException('Missing WorkManager AAR')
        file('resolved-dependencies.txt').text = files.collect { it.absolutePath }.sort().join('\n')
        println('Resolved ' + files.size() + ' runtime artifacts including Keep, WorkManager and all transitive dependencies.')
    }
}
"@ | ForEach-Object { Save-WidgetGradleText 'build.gradle' $_ }
Save-WidgetGradleText 'local.properties' ('sdk.dir=' + $widgetSdk.Replace('\', '/'))
Save-WidgetGradleText 'gradle.properties' "android.useAndroidX=true`norg.gradle.daemon=false`norg.gradle.jvmargs=-Xmx2048m`n"
$widgetPreviousJava = $env:JAVA_HOME
$widgetPreviousTemp = $env:TEMP
$widgetPreviousTmp = $env:TMP
try {
    $env:JAVA_HOME = $JavaHome
    # IDE/agent terminals can inherit a virtualized Windows package temp folder.
    # Keep Java's local IPC sockets in a normal, short project-owned directory.
    $widgetTemp = Join-Path $widgetEnvironment 'tmp'
    New-Item -ItemType Directory -Force -Path $widgetTemp | Out-Null
    $env:TEMP = $widgetTemp
    $env:TMP = $widgetTemp
    # Use the default cache so HBuilderX can reuse the same downloaded artifacts.
    & $widgetGradle -p $widgetProject --console=plain verifyWidgetDependencies
    if ($LASTEXITCODE -ne 0) { throw 'Gradle dependency resolution failed. Do not treat standalone Kotlin compilation as passing this check.' }
} finally {
    $env:JAVA_HOME = $widgetPreviousJava
    $env:TEMP = $widgetPreviousTemp
    $env:TMP = $widgetPreviousTmp
}
Write-Host "Dependency report: $widgetProject/resolved-dependencies.txt"
Write-Host 'This verifies dependency resolution, not native registration in an APK. Run verify-widget-apk.ps1 on the new package as well.'
