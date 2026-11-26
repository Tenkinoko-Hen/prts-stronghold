# 青逝痕 Tenkinoko 制作
param(
    [ValidateSet('stronghold', 'telemetry')]
    [string]$Product = 'stronghold',
    [string]$Version = '',
    [int]$VersionCode = 0,
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$JavaHome = "$env:USERPROFILE\.jdks\jbr-17.0.14",
    [switch]$SkipWebBuild,
    [string]$WebRoot = ''
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\prepare-android-ocr.ps1"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildTools = Join-Path $SdkRoot 'build-tools\35.0.0'
$androidJar = Join-Path $SdkRoot 'platforms\android-36\android.jar'
$buildRoot = "work\android\build-$Product-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
if (-not $WebRoot) { $WebRoot = "work\android\web-$Product" }
$releaseRoot = Join-Path $projectRoot 'release'

foreach ($required in @($androidJar, "$JavaHome\bin\javac.exe", "$buildTools\aapt2.exe", "$buildTools\d8.bat", "$buildTools\apksigner.bat")) {
    if (!(Test-Path -LiteralPath $required)) { throw "缺少现有构建工具：$required" }
}
function Invoke-BuildTool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "构建失败：$Executable，退出码 $LASTEXITCODE" }
}
function Get-RelPath([string]$BaseDir, [string]$FullPath) {
    $normBase = [IO.Path]::GetFullPath($BaseDir).TrimEnd('\', '/') + '\'
    $normFull = [IO.Path]::GetFullPath($FullPath)
    if ($normFull.StartsWith($normBase, [StringComparison]::OrdinalIgnoreCase)) {
        return $normFull.Substring($normBase.Length).Replace('\', '/')
    }
    return ([Uri]$normBase).MakeRelativeUri([Uri]$normFull).ToString()
}

$previousJavaHome = $env:JAVA_HOME
$previousProduct = $env:PRTS_PRODUCT
$env:JAVA_HOME = $JavaHome
Push-Location $projectRoot
try {
    $productConfig = Get-Content -LiteralPath "products\$Product\product.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    $androidConfig = $productConfig.android
    $targetVersion = if ($Version) { $Version } else { [string]$androidConfig.versionName }
    $targetVersionCode = if ($VersionCode -gt 0) { $VersionCode } else { [int]$androidConfig.versionCode }
    $targetPackage = [string]$androidConfig.package

    if (!$SkipWebBuild) {
        $env:PRTS_PRODUCT = $Product
        Invoke-BuildTool 'npm.cmd' @('run', 'lint')
        Invoke-BuildTool '.\node_modules\.bin\vite.cmd' @('build', '--mode', 'android', '--outDir', $WebRoot)
    }
    if (!(Test-Path -LiteralPath "$WebRoot\index.html") -or !(Test-Path -LiteralPath "$WebRoot\product.json")) {
        throw "缺少手机网页构建产物：$WebRoot"
    }
    $builtProduct = Get-Content -LiteralPath "$WebRoot\product.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($builtProduct.id -ne $Product) {
        throw "手机网页产物属于 $($builtProduct.id)，与目标产品 $Product 不一致。"
    }

    foreach ($directory in @($buildRoot, "$buildRoot\generated", "$buildRoot\src-adapted", "$buildRoot\classes", "$buildRoot\dex", $releaseRoot)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $renderedManifest = [IO.File]::ReadAllText((Join-Path $projectRoot 'android\AndroidManifest.template.xml'))
    $renderedManifest = $renderedManifest.Replace('${package}', $targetPackage)
    $renderedManifest = $renderedManifest.Replace('${versionCode}', [string]$targetVersionCode)
    $renderedManifest = $renderedManifest.Replace('${versionName}', $targetVersion)
    $renderedManifest = $renderedManifest.Replace('${icon}', [string]$androidConfig.icon)
    $renderedManifest = $renderedManifest.Replace('${roundIcon}', [string]$androidConfig.roundIcon)
    $manifestInput = Join-Path $projectRoot "$buildRoot\AndroidManifest.input.xml"
    [IO.File]::WriteAllText($manifestInput, $renderedManifest, [Text.UTF8Encoding]::new($false))

    Invoke-BuildTool "$buildTools\aapt2.exe" @('compile', '--dir', "products\$Product\android\res", '-o', "$buildRoot\resources.zip")
    $ocr = Prepare-OcrDependencies $projectRoot $buildRoot $buildTools $manifestInput
    $linkArgs = @('link', '-o', "$buildRoot\base.apk", '-I', $androidJar, '--manifest', $ocr.Manifest, '--java', "$buildRoot\generated", '--extra-packages', ($ocr.Packages -join ':'), '--auto-add-overlay')
    foreach ($resource in $ocr.Resources) { $linkArgs += @('-R', $resource) }
    $linkArgs += @('-R', "$buildRoot\resources.zip")
    Invoke-BuildTool "$buildTools\aapt2.exe" $linkArgs

    # 源码保持单一包名 com.prts.stronghold.mobile；构建其他产品包时在临时目录适配包名，不污染工作树。
    $canonicalPackage = 'com.prts.stronghold.mobile'
    $canonicalDeclaration = "package $canonicalPackage;"
    $javaRoot = Join-Path $projectRoot 'android\src\com\prts\stronghold\mobile'
    $adaptedDir = Join-Path $projectRoot "$buildRoot\src-adapted"
    foreach ($file in Get-ChildItem -LiteralPath $javaRoot -Filter '*.java') {
        $source = [IO.File]::ReadAllText($file.FullName)
        if ($targetPackage -ne $canonicalPackage) {
            if (!$source.StartsWith($canonicalDeclaration)) { throw "Java 源码包声明不匹配：$($file.Name)" }
            $source = "package $targetPackage;" + $source.Substring($canonicalDeclaration.Length)
        }
        [IO.File]::WriteAllText((Join-Path $adaptedDir $file.Name), $source, [Text.UTF8Encoding]::new($false))
    }

    $sources = @(Get-ChildItem -LiteralPath $adaptedDir, "$projectRoot\$buildRoot\generated" -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName)
    $javacArgs = @('-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-classpath', (($androidJar + ';') + ($ocr.Jars -join ';')), '-d', "$buildRoot\classes") + $sources
    [IO.File]::WriteAllLines((Join-Path $projectRoot "$buildRoot\javac.args"), @($javacArgs | ForEach-Object { '"' + $_.Replace('\','/') + '"' }), [Text.UTF8Encoding]::new($false))
    Invoke-BuildTool "$JavaHome\bin\javac.exe" @('-J-Dfile.encoding=UTF-8', "@$buildRoot\javac.args")
    Invoke-BuildTool "$JavaHome\bin\jar.exe" @('cf', "$buildRoot\classes.jar", '-C', "$buildRoot\classes", '.')
    $dexArgs = @('--lib', $androidJar, '--min-api', '26', '--output', "$buildRoot\dex", "$buildRoot\classes.jar") + $ocr.Jars
    [IO.File]::WriteAllLines((Join-Path $projectRoot "$buildRoot\dex.args"), @($dexArgs | ForEach-Object { $_.Replace('\','/') }), [Text.UTF8Encoding]::new($false))
    Invoke-BuildTool "$JavaHome\bin\java.exe" @('-Dfile.encoding=UTF-8', '-cp', "$buildTools\lib\d8.jar", 'com.android.tools.r8.D8', "@$buildRoot\dex.args")

    Copy-Item -LiteralPath "$buildRoot\base.apk" -Destination "$buildRoot\unsigned.apk"
    $archive = [IO.Compression.ZipFile]::Open((Join-Path $projectRoot "$buildRoot\unsigned.apk"), [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($dex in Get-ChildItem -LiteralPath "$buildRoot\dex" -Filter '*.dex') {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $dex.FullName, $dex.Name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        # aapt2 的 Windows 文件枚举不能正确处理中文头像名，使用 UTF-8 ZIP 条目打包资产。
        foreach ($asset in Get-ChildItem -LiteralPath $WebRoot -File -Recurse) {
            if ($asset.Name -eq 'product.json') { continue }
            $entryName = 'assets/' + (Get-RelPath (Join-Path $projectRoot $WebRoot) $asset.FullName)
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $asset.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        $enemyCatalogPath = Join-Path $projectRoot 'electron\prts_battle_core\enemy_power.json'
        if ((Test-Path -LiteralPath $enemyCatalogPath) -and !$archive.GetEntry('assets/enemy_power.json')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $enemyCatalogPath, 'assets/enemy_power.json', [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        $strongholdCatalogPath = Join-Path $projectRoot 'electron\prts_battle_core\stronghold_catalog.json'
        if ((Test-Path -LiteralPath $strongholdCatalogPath) -and !$archive.GetEntry('assets/stronghold_catalog.json')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $strongholdCatalogPath, 'assets/stronghold_catalog.json', [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        $operatorRefPath = Join-Path $projectRoot 'src\data\operatorReference.json'
        if ((Test-Path -LiteralPath $operatorRefPath) -and !$archive.GetEntry('assets/operator_reference.json')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $operatorRefPath, 'assets/operator_reference.json', [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        $enemyAtlasWebp = Join-Path $projectRoot 'src\desktop\enemyPortraits.webp'
        $enemyAtlasJson = Join-Path $projectRoot 'src\desktop\enemyPortraits.json'
        if ((Test-Path -LiteralPath $enemyAtlasWebp) -and !$archive.GetEntry('assets/enemy_portraits.webp')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $enemyAtlasWebp, 'assets/enemy_portraits.webp', [IO.Compression.CompressionLevel]::NoCompression) | Out-Null
        }
        if ((Test-Path -LiteralPath $enemyAtlasJson) -and !$archive.GetEntry('assets/enemy_portraits.json')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $enemyAtlasJson, 'assets/enemy_portraits.json', [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        foreach ($assetRoot in $ocr.Assets) {
            foreach ($asset in Get-ChildItem -LiteralPath $assetRoot -File -Recurse) {
                $entryName = 'assets/' + (Get-RelPath $assetRoot $asset.FullName)
                if ($archive.GetEntry($entryName)) { throw "重复模型资产：$entryName" }
                # OCR 模型允许 AssetManager.openFd / mmap 读取，必须以 STORED 条目打包。
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $asset.FullName, $entryName, [IO.Compression.CompressionLevel]::NoCompression) | Out-Null
            }
        }
        foreach ($nativeRoot in $ocr.Native) {
            foreach ($library in Get-ChildItem -LiteralPath $nativeRoot -Filter '*.so' -File -Recurse) {
                $entryName = 'lib/' + (Get-RelPath $nativeRoot $library.FullName)
                if ($archive.GetEntry($entryName)) { throw "重复原生库：$entryName" }
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $library.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        }
    } finally { $archive.Dispose() }
    Invoke-BuildTool "$buildTools\zipalign.exe" @('-p', '-f', '4', "$buildRoot\unsigned.apk", "$buildRoot\aligned.apk")

    $signing = $androidConfig.signing
    $signingRoot = Join-Path $env:LOCALAPPDATA $signing.dir
    $keyStore = Join-Path $signingRoot $signing.file
    $alias = [string]$signing.alias
    if ($signing.mode -eq 'pkcs12') {
        $secret = Import-Clixml -LiteralPath (Join-Path $signingRoot $signing.clixml)
        $env:PRTS_STORE_PASSWORD = ([Management.Automation.PSCredential]::new($alias, $secret)).GetNetworkCredential().Password
    } else {
        # 私钥留在当前用户配置目录，绝不放入项目或 APK；以后更新沿用同一签名。
        New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $acl.SetAccessRuleProtection($true, $false)
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        $propagation = [Security.AccessControl.PropagationFlags]::None
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', $inherit, $propagation, 'Allow'))
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', $inherit, $propagation, 'Allow'))
        [IO.Directory]::SetAccessControl($signingRoot, $acl)
        $passwordFile = Join-Path $signingRoot $signing.passwordFile
        if (!(Test-Path -LiteralPath $passwordFile)) {
            if (Test-Path -LiteralPath $keyStore) { throw '签名密码文件缺失，请恢复原签名资料；不会覆盖已有私钥。' }
            $bytes = New-Object byte[] 36
            $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
            try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
            [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($bytes))
        }
        $env:PRTS_STORE_PASSWORD = [IO.File]::ReadAllText($passwordFile)
        if (!(Test-Path -LiteralPath $keyStore)) {
            Invoke-BuildTool "$JavaHome\bin\keytool.exe" @('-genkeypair', '-keystore', $keyStore, '-storetype', 'JKS', '-alias', $alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=PRTS Stronghold, OU=Personal, O=PRTS, C=CN', '-storepass:env', 'PRTS_STORE_PASSWORD', '-keypass:env', 'PRTS_STORE_PASSWORD')
        }
    }

    $subdir = ([string]$androidConfig.releaseSubdir).Replace('${version}', $targetVersion)
    $outputDir = if ($subdir) { Join-Path $releaseRoot $subdir } else { $releaseRoot }
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    $apkName = ([string]$androidConfig.apkTemplate).Replace('${version}', $targetVersion)
    $apk = Join-Path $outputDir $apkName
    Invoke-BuildTool "$buildTools\apksigner.bat" @('sign', '--ks', $keyStore, '--ks-key-alias', $alias, '--ks-pass', 'env:PRTS_STORE_PASSWORD', '--key-pass', 'env:PRTS_STORE_PASSWORD', '--out', $apk, "$buildRoot\aligned.apk")
    Invoke-BuildTool "$buildTools\apksigner.bat" @('verify', '--verbose', $apk)
    Invoke-BuildTool "$buildTools\zipalign.exe" @('-c', '4', $apk)
    $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$apk.sha256", "$hash  $apkName`n")
    Write-Output "APK：$apk"
    Write-Output "大小：$((Get-Item -LiteralPath $apk).Length) 字节"
    Write-Output "SHA-256：$hash"
} finally {
    $env:PRTS_STORE_PASSWORD = $null
    $env:JAVA_HOME = $previousJavaHome
    $env:PRTS_PRODUCT = $previousProduct
    Pop-Location
}
