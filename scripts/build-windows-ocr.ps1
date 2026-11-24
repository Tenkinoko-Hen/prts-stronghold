param(
    [string]$Python = 'python',
    [ValidateSet('stronghold', 'telemetry')]
    [string]$Product = 'stronghold'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $productConfig = Get-Content -LiteralPath "products/$Product/product.json" -Raw | ConvertFrom-Json
    $venv = Join-Path $root 'work/windows-ocr/venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $venv)) {
        & $Python -m venv 'work/windows-ocr/venv'
        if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.12 x64 environment.' }
    }
    & $venv -m pip install --index-url https://pypi.org/simple --require-hashes -r 'electron/ocr-requirements.txt'
    if ($LASTEXITCODE -ne 0) { throw 'Worker dependency installation failed.' }

    $reportCatalog = Join-Path $root 'electron/prts_battle_core/enemy_power.json'
    $workerName = $productConfig.desktop.workerName

    if ($productConfig.desktop.workerKind -eq 'report-only') {
        $distDir = 'work/windows-telemetry/runtime'
        & $venv -m PyInstaller --noconfirm --onedir --console --name $workerName `
            --distpath $distDir --workpath 'work/windows-telemetry/pyinstaller' --specpath 'work/windows-telemetry' `
            --paths (Join-Path $root 'electron') `
            --add-data "$($reportCatalog):prts_battle_core" `
            --exclude-module cv2 --exclude-module numpy --exclude-module onnxruntime `
            --exclude-module rapidocr_onnxruntime --exclude-module PIL --exclude-module shapely `
            --exclude-module yaml --exclude-module sympy --exclude-module tkinter `
            --exclude-module matplotlib --exclude-module pyclipper --exclude-module tqdm `
            'electron/battle-report-worker.py'
        if ($LASTEXITCODE -ne 0) { throw 'Telemetry worker build failed.' }
        $licenseDir = Join-Path $root "$distDir/$workerName/licenses"
        New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
        & $venv -c "import shutil, sys; from pathlib import Path; src = Path(sys.base_prefix) / 'LICENSE.txt'; dst = Path(r'$licenseDir') / 'Python-LICENSE.txt'; src.exists() and shutil.copyfile(src, dst)"
        $workerExe = Join-Path $root "$distDir/$workerName/$workerName.exe"
    } else {
        & $venv -m PyInstaller --noconfirm --onedir --console --name $workerName `
            --distpath 'work/windows-ocr/runtime' --workpath 'work/windows-ocr/pyinstaller' --specpath 'work/windows-ocr' `
            --paths (Join-Path $root 'electron') `
            --collect-data rapidocr_onnxruntime --collect-binaries onnxruntime --copy-metadata rapidocr-onnxruntime `
            --copy-metadata onnxruntime --exclude-module tkinter --exclude-module matplotlib --exclude-module sympy `
            --add-data "$($reportCatalog):prts_battle_core" `
            'electron/ocr-helper.py'
        if ($LASTEXITCODE -ne 0) { throw 'OCR runtime build failed.' }
        & $venv 'scripts/windows-ocr-notices.py'
        if ($LASTEXITCODE -ne 0) { throw 'OCR license collection failed.' }
        $workerExe = Join-Path $root "work/windows-ocr/runtime/$workerName/$workerName.exe"
    }

    $probe = '' | & $workerExe '--battle-report-check'
    if ($LASTEXITCODE -ne 0 -or $probe -notcontains 'PRTS_BATTLE_REPORT_READY') {
        throw "运行库自检失败：$workerExe"
    }
    Write-Output "Worker 就绪：$workerExe"
} finally {
    Pop-Location
}
