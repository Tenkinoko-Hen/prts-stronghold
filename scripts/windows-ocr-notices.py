"""Keep the bundled runtimes' license notices with the portable distribution."""
from importlib.metadata import distributions
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
destination = ROOT / 'work/windows-ocr/runtime/PRTS-OCR/licenses'
destination.mkdir(parents=True, exist_ok=True)
for distribution in distributions():
    for file in distribution.files or []:
        if not any(word in file.name.lower() for word in ('license', 'notice', 'copying')):
            continue
        source = Path(distribution.locate_file(file))
        if source.is_file() and source.suffix not in {'.py', '.pyc', '.pyd'}:
            target = destination / distribution.metadata['Name'] / file
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
python_license = Path(sys.base_prefix) / 'LICENSE.txt'
if python_license.exists():
    shutil.copyfile(python_license, destination / 'Python-LICENSE.txt')
