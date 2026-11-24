param(
    [Parameter(Mandatory)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,
    [ValidateSet('stronghold', 'telemetry')]
    [string]$Product = 'stronghold',
    [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$previousProduct = $env:PRTS_PRODUCT
Push-Location $root
try {
    $productConfig = Get-Content -LiteralPath "products/$Product/product.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $SkipWebBuild) {
        $env:PRTS_PRODUCT = $Product
        & npm.cmd run lint
        if ($LASTEXITCODE -ne 0) { throw "类型检查失败（$LASTEXITCODE）。" }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "前端构建失败（$LASTEXITCODE）。" }
    }

    $workerExe = "$($productConfig.desktop.workerRuntimeDir)/$($productConfig.desktop.workerName).exe"
    $required = @(
        'dist/index.html',
        'dist/product.json',
        'node_modules/electron/dist/electron.exe',
        $workerExe,
        "products/$Product/electron/app.ico",
        "products/$Product/electron/startup.bmp"
    )
    if ($productConfig.desktop.useTray) {
        $required += "products/$Product/electron/tray.ico"
    }
    foreach ($file in $required) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少打包输入：$file" }
    }

    $builtProduct = Get-Content -LiteralPath 'dist/product.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($builtProduct.id -ne $Product) {
        throw "dist/ 构建产物属于 $($builtProduct.id)，与目标产品 $Product 不一致；请勿跳过前端构建或重新设置 PRTS_PRODUCT=$Product。"
    }

    $probe = '' | & $workerExe '--battle-report-check'
    if ($LASTEXITCODE -ne 0 -or $probe -notcontains 'PRTS_BATTLE_REPORT_READY') {
        throw "战报运行库未就绪，请先运行 ./scripts/build-windows-worker.ps1 -Product $Product。"
    }

    & node.exe './scripts/package-windows.cjs' $Product $Version
    if ($LASTEXITCODE -ne 0) { throw "Windows 打包失败（$LASTEXITCODE）。" }
} finally {
    $env:PRTS_PRODUCT = $previousProduct
    Pop-Location
}
