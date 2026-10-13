param([string]$JavaPath = 'java', [string]$AndroidJar = '', [string]$HBuilderXPath = '')
$ErrorActionPreference = 'Stop'
$widgetRoot = Split-Path $PSScriptRoot -Parent
$widgetOutput = Join-Path $widgetRoot '.artifacts/widget-native'
$widgetCache = Join-Path $widgetOutput 'tools'
New-Item -ItemType Directory -Force -Path $widgetCache | Out-Null
function Get-WidgetArtifact([string]$Url, [string]$Name) {
    $target = Join-Path $widgetCache $Name
    if (-not (Test-Path -LiteralPath $target)) { Write-Host "Downloading $Name"; Invoke-WebRequest -Uri $Url -OutFile $target }
    return $target
}
function Get-WidgetMavenJar([string]$Coordinate) {
    $parts = $Coordinate.Split(':')
    $name = "$($parts[1])-$($parts[2]).jar"
    return Get-WidgetArtifact "https://repo.maven.apache.org/maven2/$($parts[0].Replace('.', '/'))/$($parts[1])/$($parts[2])/$name" $name
}
if (-not $AndroidJar) {
    $platform = Get-WidgetArtifact 'https://dl.google.com/android/repository/platform-35_r02.zip' 'platform-35.zip'
    $AndroidJar = Join-Path $widgetCache 'android-35.jar'
    if (-not (Test-Path -LiteralPath $AndroidJar)) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [System.IO.Compression.ZipFile]::OpenRead($platform)
        try {
            $entry = $archive.Entries | Where-Object { $_.FullName -match '^[^/]+/android.jar$' } | Select-Object -First 1
            if (-not $entry) { throw 'Official SDK package did not contain android.jar' }
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $AndroidJar)
        } finally { $archive.Dispose() }
    }
}
$compiler = @(
    'org.jetbrains.kotlin:kotlin-compiler-embeddable:2.1.20', 'org.jetbrains.kotlin:kotlin-stdlib:2.1.20',
    'org.jetbrains.kotlin:kotlin-script-runtime:2.1.20', 'org.jetbrains.kotlin:kotlin-reflect:1.6.10',
    'org.jetbrains.kotlin:kotlin-daemon-embeddable:2.1.20', 'org.jetbrains.intellij.deps:trove4j:1.0.20200330',
    'org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm:1.8.0', 'org.jetbrains:annotations:13.0'
) | ForEach-Object { Get-WidgetMavenJar $_ }
$jsonJar = Get-WidgetMavenJar 'org.json:json:20240303'
$futureJar = Get-WidgetMavenJar 'com.google.guava:listenablefuture:1.0'
$workAar = Get-WidgetArtifact 'https://dl.google.com/dl/android/maven2/androidx/work/work-runtime/2.11.2/work-runtime-2.11.2.aar' 'work-runtime-2.11.2.aar'
$workJar = Join-Path $widgetCache 'work-runtime-2.11.2.jar'
if (-not (Test-Path -LiteralPath $workJar)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($workAar)
    try { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($archive.GetEntry('classes.jar'), $workJar) } finally { $archive.Dispose() }
}
$annotationJar = Get-WidgetArtifact 'https://dl.google.com/dl/android/maven2/androidx/annotation/annotation-jvm/1.9.1/annotation-jvm-1.9.1.jar' 'annotation-jvm-1.9.1.jar'
$stdlib = $compiler | Where-Object { (Split-Path $_ -Leaf) -eq 'kotlin-stdlib-2.1.20.jar' }
$plugin = Join-Path $widgetRoot 'src/uni_modules/lakeside-widget/utssdk/app-android'
# Compile and link XML with Google's real resource compiler, not an XML syntax-only check.
$aaptArchive = Get-WidgetArtifact 'https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/8.6.1-11315950/aapt2-8.6.1-11315950-windows.jar' 'aapt2-windows.jar'
$aaptDirectory = Join-Path $widgetCache 'aapt2'
if (-not (Test-Path -LiteralPath (Join-Path $aaptDirectory 'aapt2.exe'))) {
    New-Item -ItemType Directory -Force -Path $aaptDirectory | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($aaptArchive)
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '^[^/]+\.(exe|dll)$') { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $aaptDirectory $entry.FullName), $true) }
        }
    } finally { $archive.Dispose() }
}
$aapt = Join-Path $aaptDirectory 'aapt2.exe'
$resourceZip = Join-Path $widgetOutput 'compiled-resources.zip'
& $aapt compile --dir (Join-Path $plugin 'res') -o $resourceZip
if ($LASTEXITCODE -ne 0) { throw 'Widget XML resource compilation failed' }
[xml]$manifest = Get-Content -LiteralPath (Join-Path $plugin 'AndroidManifest.xml')
if (-not $manifest.manifest.GetAttribute('package')) { throw 'UTS plugin Manifest needs a package attribute for HBuilderX resource linking.' }
$validationManifest = Join-Path $widgetOutput 'AndroidManifest.xml'
$manifest.Save($validationManifest)
$resourceJava = Join-Path $widgetOutput 'resource-java'
New-Item -ItemType Directory -Force -Path $resourceJava | Out-Null
& $aapt link -I $AndroidJar --manifest $validationManifest --min-sdk-version 23 --target-sdk-version 35 --java $resourceJava -o (Join-Path $widgetOutput 'widget-resources.ap_') $resourceZip
if ($LASTEXITCODE -ne 0) { throw 'Widget Manifest/resource linking failed' }
Write-Host 'All widget layouts, drawables, provider metadata and Manifest linked with aapt2.'
$nativeSources = Get-ChildItem -LiteralPath $plugin -Filter '*.kt' | Select-Object -ExpandProperty FullName
$classpath = @($AndroidJar, $workJar, $annotationJar, $stdlib, $futureJar) -join [IO.Path]::PathSeparator
$compilerClasspath = $compiler -join [IO.Path]::PathSeparator
& $JavaPath -cp $compilerClasspath org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 1.8 -classpath $classpath -d (Join-Path $widgetOutput 'widget-native.jar') @nativeSources
if ($LASTEXITCODE -ne 0) { throw 'Native Kotlin compilation failed' }
Write-Host 'All widget Kotlin sources compiled against official Android API 35 and WorkManager 2.11.2.'
if (-not $HBuilderXPath) {
    $widgetInstalledAbout = 'E:/HBuilderX/plugins/about/package.json'
    if ((Test-Path -LiteralPath $widgetInstalledAbout) -and [version](Get-Content -Raw -LiteralPath $widgetInstalledAbout | ConvertFrom-Json).version -ge [version]'5.26.2026091802') {
        $HBuilderXPath = 'E:/HBuilderX'
    } else { $HBuilderXPath = Join-Path $widgetRoot '.artifacts/hbuilderx-toolchain/5.26/HBuilderX' }
}
$utsRuntime = Join-Path $HBuilderXPath 'plugins/uniapp-runextension'
if (Test-Path -LiteralPath (Join-Path $utsRuntime 'kotlinc/lib/kotlin-compiler.jar')) {
    $utsEntry = Join-Path $widgetRoot 'dist/build/app/uni_modules/lakeside-widget/utssdk/app-android/src/index.kt'
    if (-not (Test-Path -LiteralPath $utsEntry)) { throw 'Run npm run build:app to generate the UTS bridge before native verification.' }
    $utsCompiler = (Get-ChildItem -LiteralPath (Join-Path $utsRuntime 'kotlinc/lib') -Filter '*.jar' | Select-Object -ExpandProperty FullName) -join [IO.Path]::PathSeparator
    $utsLibraries = @(Get-ChildItem -LiteralPath (Join-Path $utsRuntime 'lib') -Filter '*.jar' | Select-Object -ExpandProperty FullName)
    $resourceClasses = Join-Path $widgetOutput 'resource-classes'
    New-Item -ItemType Directory -Force -Path $resourceClasses | Out-Null
    $javacPath = if (Test-Path -LiteralPath $JavaPath) { Join-Path (Split-Path $JavaPath -Parent) 'javac.exe' } else { 'javac' }
    $resourceSources = @(Get-ChildItem -LiteralPath $resourceJava -Recurse -Filter 'R.java' | Select-Object -ExpandProperty FullName)
    & $javacPath --release 8 -d $resourceClasses @resourceSources
    if ($LASTEXITCODE -ne 0) { throw 'Generated Android R.java compilation failed' }
    $utsClasspath = (@($utsLibraries) + @($workJar, $annotationJar, $futureJar, $resourceClasses)) -join [IO.Path]::PathSeparator
    & $JavaPath -cp $utsCompiler org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 1.8 -classpath $utsClasspath -d (Join-Path $widgetOutput 'widget-uts-native.jar') @nativeSources $utsEntry
    if ($LASTEXITCODE -ne 0) { throw 'Generated UTS bridge compilation against official HBuilderX Android runtime failed' }
    Write-Host 'Generated UTS bridge and all native sources compiled together against official HBuilderX Android runtime.'
} else { Write-Host 'UTS runtime unavailable; generated bridge compilation skipped. Hand-written Kotlin compilation is not a UTS runtime check.' }
& node (Join-Path $PSScriptRoot 'export-widget-fixture.cjs')
if ($LASTEXITCODE -ne 0) { throw 'TypeScript fixture export failed' }
$modelSources = @((Join-Path $plugin 'WidgetModels.kt'), (Join-Path $widgetRoot 'tests/native/WidgetModelTest.kt'))
& $JavaPath -cp $compilerClasspath org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 1.8 -classpath (@($jsonJar, $stdlib) -join [IO.Path]::PathSeparator) -d (Join-Path $widgetOutput 'widget-model-tests.jar') @modelSources
if ($LASTEXITCODE -ne 0) { throw 'Native model test compilation failed' }
& $JavaPath -cp (@((Join-Path $widgetOutput 'widget-model-tests.jar'), $jsonJar, $stdlib) -join [IO.Path]::PathSeparator) com.lakeside.widget.WidgetModelTestKt (Join-Path $widgetOutput 'snapshot.json')
if ($LASTEXITCODE -ne 0) { throw 'Native model contract tests failed' }
Write-Host 'This verifies native compilation and business logic; it does not verify APK packaging or a launcher.'
