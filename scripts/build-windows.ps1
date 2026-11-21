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
    $reportCheck = '' | & './work/windows-ocr/runtime/PRTS-OCR/PRTS-OCR.exe' '--battle-report-check'
    if ($LASTEXITCODE -ne 0 -or $reportCheck -notcontains 'PRTS_BATTLE_REPORT_READY') {
        throw '战报运行库未就绪，请先运行 ./scripts/build-windows-ocr.ps1。'
    }
    & node.exe './scripts/package-windows.cjs' $Version
    if ($LASTEXITCODE -ne 0) { throw "Windows 打包失败（$LASTEXITCODE）。" }
} finally {
    Pop-Location
}
