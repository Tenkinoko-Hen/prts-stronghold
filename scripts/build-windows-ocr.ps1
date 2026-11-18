param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $venv = Join-Path $root 'work/windows-ocr/venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $venv)) {
        & $Python -m venv 'work/windows-ocr/venv'
        if ($LASTEXITCODE -ne 0) { throw 'Could not create Python 3.12 x64 environment.' }
    }
    & $venv -m pip install --index-url https://pypi.org/simple --require-hashes -r 'electron/ocr-requirements.txt'
    if ($LASTEXITCODE -ne 0) { throw 'OCR dependency installation failed.' }
    & $venv -m PyInstaller --noconfirm --onedir --console --name PRTS-OCR `
        --distpath 'work/windows-ocr/runtime' --workpath 'work/windows-ocr/pyinstaller' --specpath 'work/windows-ocr' `
        --collect-data rapidocr_onnxruntime --collect-binaries onnxruntime --copy-metadata rapidocr-onnxruntime `
        --copy-metadata onnxruntime --exclude-module tkinter --exclude-module matplotlib --exclude-module sympy `
        'electron/ocr-helper.py'
    if ($LASTEXITCODE -ne 0) { throw 'OCR runtime build failed.' }
    & $venv 'scripts/windows-ocr-notices.py'
    if ($LASTEXITCODE -ne 0) { throw 'OCR license collection failed.' }
} finally { Pop-Location }
