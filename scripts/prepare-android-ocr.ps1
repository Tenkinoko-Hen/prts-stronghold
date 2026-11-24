# 使用已锁定的官方 AAR/JAR，合并资源和初始化组件；不引入联网权限。
function Prepare-OcrDependencies(
    [string]$ProjectRoot,
    [string]$BuildRoot,
    [string]$BuildTools,
    [string]$ManifestSource = 'android\AndroidManifest.xml'
) {
    $lock = Get-Content -LiteralPath 'android\ocr-dependencies.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $jars = [Collections.Generic.List[string]]::new()
    $resources = [Collections.Generic.List[string]]::new()
    $packages = [Collections.Generic.List[string]]::new()
    $assetRoots = [Collections.Generic.List[string]]::new()
    $nativeRoots = [Collections.Generic.List[string]]::new()
    [xml]$manifest = Get-Content -LiteralPath $ManifestSource -Raw -Encoding UTF8
    $androidNs = 'http://schemas.android.com/apk/res/android'
    $toolsNs = 'http://schemas.android.com/tools'
    $application = $manifest.manifest.application
    $index = 0
    foreach ($artifact in $lock.artifacts) {
        $file = Join-Path $ProjectRoot $artifact.file
        if (!(Test-Path -LiteralPath $file)) {
            New-Item -ItemType Directory -Force -Path (Split-Path $file) | Out-Null
            Invoke-WebRequest -Uri $artifact.url -OutFile $file
        }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $artifact.sha256) { throw "OCR 依赖校验失败：$($artifact.coordinate)" }
        if ($file.EndsWith('.jar')) { $jars.Add($file); continue }
        $unpacked = Join-Path $BuildRoot "aar-$index"
        [IO.Compression.ZipFile]::ExtractToDirectory($file, (Join-Path $ProjectRoot $unpacked))
        $classJar = Join-Path $unpacked 'classes.jar'
        if (Test-Path -LiteralPath $classJar) { $jars.Add((Join-Path $ProjectRoot $classJar)) }
        if (Test-Path -LiteralPath "$unpacked\libs") {
            foreach ($jar in Get-ChildItem -LiteralPath "$unpacked\libs" -Filter '*.jar') { $jars.Add($jar.FullName) }
        }
        [xml]$library = Get-Content -LiteralPath "$unpacked\AndroidManifest.xml" -Raw -Encoding UTF8
        if ($library.manifest.package) { $packages.Add($library.manifest.package) }
        if (Test-Path -LiteralPath "$unpacked\res") {
            $resource = "$unpacked\compiled.zip"
            Invoke-BuildTool "$BuildTools\aapt2.exe" @('compile','--dir',"$unpacked\res",'-o',$resource) | Out-Host
            $resources.Add($resource)
        }
        if (Test-Path -LiteralPath "$unpacked\assets") { $assetRoots.Add((Join-Path $ProjectRoot "$unpacked\assets")) }
        if (Test-Path -LiteralPath "$unpacked\jni") { $nativeRoots.Add((Join-Path $ProjectRoot "$unpacked\jni")) }
        if ($library.manifest.application) {
            foreach ($node in $library.manifest.application.ChildNodes) {
                if ($node -isnot [Xml.XmlElement]) { continue }
                $name = $node.GetAttribute('name',$androidNs)
                $existing = @($application.ChildNodes | Where-Object { $_ -is [Xml.XmlElement] -and $_.LocalName -eq $node.LocalName -and $_.GetAttribute('name',$androidNs) -eq $name })
                if ($existing.Count -eq 0) { $null=$application.AppendChild($manifest.ImportNode($node,$true)) }
                else {
                    foreach ($meta in $node.ChildNodes) {
                        if ($meta -is [Xml.XmlElement]) {
                            $metaName=$meta.GetAttribute('name',$androidNs)
                            $same=@($existing[0].ChildNodes | Where-Object { $_ -is [Xml.XmlElement] -and $_.GetAttribute('name',$androidNs) -eq $metaName })
                            if ($same.Count -eq 0) { $null=$existing[0].AppendChild($manifest.ImportNode($meta,$true)) }
                        }
                    }
                }
            }
        }
        $index++
    }
    foreach ($element in $manifest.SelectNodes('//*')) {
        foreach ($attribute in @($element.Attributes)) {
            if ($attribute.NamespaceURI -eq $toolsNs) { $null=$element.RemoveAttributeNode($attribute) }
            elseif ($attribute.Value.Contains('${applicationId}')) { $attribute.Value=$attribute.Value.Replace('${applicationId}', $manifest.manifest.GetAttribute('package')) }
        }
    }
    $manifestPath=Join-Path $ProjectRoot "$BuildRoot\AndroidManifest.xml"
    $manifest.Save($manifestPath)
    return [PSCustomObject]@{ Jars=$jars.ToArray(); Resources=$resources.ToArray(); Packages=$packages.ToArray(); Assets=$assetRoots.ToArray(); Native=$nativeRoots.ToArray(); Manifest=$manifestPath }
}
