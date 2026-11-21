param(
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$JavaHome = "$env:USERPROFILE\.jdks\jbr-17.0.14",
    [switch]$SkipWebBuild,
    [string]$WebRoot = 'work\android\web'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\prepare-android-ocr.ps1"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$buildTools = Join-Path $SdkRoot 'build-tools\35.0.0'
$androidJar = Join-Path $SdkRoot 'platforms\android-36\android.jar'
$buildRoot = 'work\android\build-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$releaseRoot = Join-Path $projectRoot 'release'
$signingRoot = Join-Path $env:LOCALAPPDATA 'PRTSStronghold\signing'
foreach ($required in @($androidJar, "$JavaHome\bin\javac.exe", "$buildTools\aapt2.exe", "$buildTools\d8.bat", "$buildTools\apksigner.bat")) {
    if (!(Test-Path -LiteralPath $required)) { throw "缺少现有构建工具：$required" }
}
function Invoke-BuildTool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "构建失败：$Executable，退出码 $LASTEXITCODE" }
}
$previousJavaHome = $env:JAVA_HOME
$env:JAVA_HOME = $JavaHome
Push-Location $projectRoot
try {
    if (!$SkipWebBuild) {
        Invoke-BuildTool 'npm.cmd' @('run', 'lint')
        Invoke-BuildTool '.\node_modules\.bin\vite.cmd' @('build', '--mode', 'android', '--outDir', $WebRoot)
    }
    if (!(Test-Path -LiteralPath "$webRoot\index.html")) { throw '缺少手机网页构建产物。' }
    foreach ($directory in @($buildRoot, "$buildRoot\generated", "$buildRoot\classes", "$buildRoot\dex", $releaseRoot)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }
    Invoke-BuildTool "$buildTools\aapt2.exe" @('compile', '--dir', 'android\res', '-o', "$buildRoot\resources.zip")
    $ocr=Prepare-OcrDependencies $projectRoot $buildRoot $buildTools
    $linkArgs=@('link', '-o', "$buildRoot\base.apk", '-I', $androidJar, '--manifest', $ocr.Manifest, '--java', "$buildRoot\generated", '--extra-packages', ($ocr.Packages -join ':'), '--auto-add-overlay')
    foreach($resource in $ocr.Resources) { $linkArgs += @('-R',$resource) }
    $linkArgs += @('-R',"$buildRoot\resources.zip")
    Invoke-BuildTool "$buildTools\aapt2.exe" $linkArgs
    $sources = @(Get-ChildItem -LiteralPath "$projectRoot\android\src", "$buildRoot\generated" -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName)
    $javacArgs=@('-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-classpath', (($androidJar + ';') + ($ocr.Jars -join ';')), '-d', "$buildRoot\classes") + $sources
    [IO.File]::WriteAllLines((Join-Path $projectRoot "$buildRoot\javac.args"), @($javacArgs | ForEach-Object { '"' + $_.Replace('\','/') + '"' }), [Text.UTF8Encoding]::new($false))
    Invoke-BuildTool "$JavaHome\bin\javac.exe" @('-J-Dfile.encoding=UTF-8',"@$buildRoot\javac.args")
    Invoke-BuildTool "$JavaHome\bin\jar.exe" @('cf', "$buildRoot\classes.jar", '-C', "$buildRoot\classes", '.')
    $dexArgs=@('--lib', $androidJar, '--min-api', '26', '--output', "$buildRoot\dex", "$buildRoot\classes.jar") + $ocr.Jars
    [IO.File]::WriteAllLines((Join-Path $projectRoot "$buildRoot\dex.args"), @($dexArgs | ForEach-Object { $_.Replace('\','/') }), [Text.UTF8Encoding]::new($false))
    Invoke-BuildTool "$JavaHome\bin\java.exe" @('-Dfile.encoding=UTF-8','-cp',"$buildTools\lib\d8.jar",'com.android.tools.r8.D8',"@$buildRoot\dex.args")
    Copy-Item -LiteralPath "$buildRoot\base.apk" -Destination "$buildRoot\unsigned.apk"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::Open((Join-Path $projectRoot "$buildRoot\unsigned.apk"), [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($dex in Get-ChildItem -LiteralPath "$buildRoot\dex" -Filter '*.dex') {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $dex.FullName, $dex.Name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        # aapt2 的 Windows 文件枚举不能正确处理中文头像名，使用 UTF-8 ZIP 条目打包资产。
        foreach ($asset in Get-ChildItem -LiteralPath $webRoot -File -Recurse) {
            $entryName = 'assets/' + [IO.Path]::GetRelativePath((Join-Path $projectRoot $webRoot), $asset.FullName).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $asset.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        foreach ($assetRoot in $ocr.Assets) {
            foreach ($asset in Get-ChildItem -LiteralPath $assetRoot -File -Recurse) {
                $entryName='assets/' + [IO.Path]::GetRelativePath($assetRoot,$asset.FullName).Replace('\','/')
                if($archive.GetEntry($entryName)) { throw "重复模型资产：$entryName" }
                # OCR 模型允许 AssetManager.openFd / mmap 读取，必须以 STORED 条目打包。
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$asset.FullName,$entryName,[IO.Compression.CompressionLevel]::NoCompression) | Out-Null
            }
        }
        foreach ($nativeRoot in $ocr.Native) {
            foreach ($library in Get-ChildItem -LiteralPath $nativeRoot -Filter '*.so' -File -Recurse) {
                $entryName='lib/' + [IO.Path]::GetRelativePath($nativeRoot,$library.FullName).Replace('\','/')
                if($archive.GetEntry($entryName)) { throw "重复原生库：$entryName" }
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$library.FullName,$entryName,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        }
    } finally { $archive.Dispose() }
    Invoke-BuildTool "$buildTools\zipalign.exe" @('-p', '-f', '4', "$buildRoot\unsigned.apk", "$buildRoot\aligned.apk")

    # 私钥留在当前用户配置目录，绝不放入项目或 APK；以后更新沿用同一签名。
    New-Item -ItemType Directory -Force -Path $signingRoot | Out-Null
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagation = [Security.AccessControl.PropagationFlags]::None
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', $inherit, $propagation, 'Allow'))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', $inherit, $propagation, 'Allow'))
    [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($signingRoot), $acl)
    $keyStore = Join-Path $signingRoot 'prts-mobile.jks'
    $passwordFile = Join-Path $signingRoot 'password.txt'
    if (!(Test-Path -LiteralPath $passwordFile)) {
        if (Test-Path -LiteralPath $keyStore) { throw '签名密码文件缺失，请恢复原签名资料；不会覆盖已有私钥。' }
        $bytes = New-Object byte[] 36
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        [IO.File]::WriteAllText($passwordFile, [Convert]::ToBase64String($bytes))
    }
    $env:PRTS_STORE_PASSWORD = [IO.File]::ReadAllText($passwordFile)
    if (!(Test-Path -LiteralPath $keyStore)) {
        Invoke-BuildTool "$JavaHome\bin\keytool.exe" @('-genkeypair', '-keystore', $keyStore, '-storetype', 'JKS', '-alias', 'prts', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=PRTS Stronghold, OU=Personal, O=PRTS, C=CN', '-storepass:env', 'PRTS_STORE_PASSWORD', '-keypass:env', 'PRTS_STORE_PASSWORD')
    }
    [xml]$manifest = Get-Content -LiteralPath 'android\AndroidManifest.xml' -Raw
    $version = $manifest.manifest.GetAttribute('versionName', 'http://schemas.android.com/apk/res/android')
    $apk = Join-Path $releaseRoot "PRTS-Stronghold-$version-Android.apk"
    Invoke-BuildTool "$buildTools\apksigner.bat" @('sign', '--ks', $keyStore, '--ks-key-alias', 'prts', '--ks-pass', 'env:PRTS_STORE_PASSWORD', '--key-pass', 'env:PRTS_STORE_PASSWORD', '--out', $apk, "$buildRoot\aligned.apk")
    Invoke-BuildTool "$buildTools\apksigner.bat" @('verify', '--verbose', $apk)
    Invoke-BuildTool "$buildTools\zipalign.exe" @('-c', '4', $apk)
    $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$apk.sha256", "$hash  $([IO.Path]::GetFileName($apk))`n")
    Write-Output "APK：$apk"
    Write-Output "大小：$((Get-Item -LiteralPath $apk).Length) 字节"
    Write-Output "SHA-256：$hash"
} finally {
    $env:PRTS_STORE_PASSWORD = $null
    $env:JAVA_HOME = $previousJavaHome
    Pop-Location
}
