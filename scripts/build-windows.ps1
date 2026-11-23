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
    $probe = '' | & './work/windows-ocr/runtime/PRTS-OCR/PRTS-OCR.exe' '--battle-report-check'
    if ($LASTEXITCODE -ne 0 -or $probe -notcontains 'PRTS_BATTLE_REPORT_READY') { throw '请重新构建带战报模块的 OCR 运行库。' }
    & node.exe './scripts/package-windows.cjs' $Version
    if ($LASTEXITCODE -ne 0) { throw "Windows 打包失败（$LASTEXITCODE）。" }
} finally {
    Pop-Location
}
