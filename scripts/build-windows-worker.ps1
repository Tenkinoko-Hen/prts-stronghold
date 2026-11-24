# 青逝痕 Tenkinoko 制作
param(
    [string]$Python = 'python',
    [ValidateSet('stronghold', 'telemetry')]
    [string]$Product = 'stronghold'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $productConfig = Get-Content -LiteralPath "products/$Product/product.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    $venv = Join-Path $root 'work/windows-worker/venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $venv)) {
        & $Python -m venv 'work/windows-worker/venv'
        if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.12 x64 environment.' }
    }
    & $venv -m pip install --index-url https://pypi.org/simple --require-hashes -r 'electron/worker-requirements.txt'
    if ($LASTEXITCODE -ne 0) { throw 'Worker build dependency installation failed.' }

    $reportCatalog = Join-Path $root 'electron/prts_battle_core/enemy_power.json'
    $strongholdCatalog = Join-Path $root 'electron/prts_battle_core/stronghold_catalog.json'
    $workerName = $productConfig.desktop.workerName
    $runtimeDir = $productConfig.desktop.workerRuntimeDir
    $distDir = Split-Path -Parent $runtimeDir
    $buildRoot = Split-Path -Parent $distDir

    & $venv -m PyInstaller --noconfirm --onedir --console --name $workerName `
        --distpath $distDir --workpath "$buildRoot/pyinstaller" --specpath $buildRoot `
        --paths (Join-Path $root 'electron') `
        --add-data "$($reportCatalog):prts_battle_core" `
        --add-data "$($strongholdCatalog):prts_battle_core" `
        --exclude-module cv2 --exclude-module numpy --exclude-module onnxruntime `
        --exclude-module rapidocr_onnxruntime --exclude-module PIL --exclude-module shapely `
        --exclude-module yaml --exclude-module sympy --exclude-module tkinter `
        --exclude-module matplotlib --exclude-module pyclipper --exclude-module tqdm `
        'electron/battle-report-worker.py'
    if ($LASTEXITCODE -ne 0) { throw 'Battle report worker build failed.' }

    $licenseDir = Join-Path $root "$runtimeDir/licenses"
    New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
    & $venv -c "import shutil, sys; from pathlib import Path; src = Path(sys.base_prefix) / 'LICENSE.txt'; dst = Path(r'$licenseDir') / 'Python-LICENSE.txt'; src.exists() and shutil.copyfile(src, dst)"
    $workerExe = Join-Path $root "$runtimeDir/$workerName.exe"

    $probe = '' | & $workerExe '--battle-report-check'
    if ($LASTEXITCODE -ne 0 -or $probe -notcontains 'PRTS_BATTLE_REPORT_READY') {
        throw "运行库自检失败：$workerExe"
    }
    Write-Output "Worker 就绪：$workerExe"
} finally {
    Pop-Location
}
