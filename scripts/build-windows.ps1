param(
    [Parameter(Mandatory)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    foreach ($file in @('dist/index.html', 'node_modules/electron/dist/electron.exe', 'work/windows-ocr/runtime/PRTS-OCR/PRTS-OCR.exe', 'electron/branding/app.ico', 'electron/branding/startup.bmp')) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少打包输入：$file" }
    }
    & node.exe './scripts/package-windows.cjs' $Version
    if ($LASTEXITCODE -ne 0) { throw "Windows 打包失败（$LASTEXITCODE）。" }
} finally {
    Pop-Location
}
