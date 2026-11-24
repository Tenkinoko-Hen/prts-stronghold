# 青逝痕 Tenkinoko 制作
"""Build the offline battle report portraits from the public Closure Wiki CDN."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SIZE = 64
COLUMNS = 16
CDN = "https://static.closure.wiki/v3/enemies"


def download(enemy_id: str) -> Image.Image | None:
    try:
        request = Request(f"{CDN}/{enemy_id}.webp", headers={"User-Agent": "PRTS-Stronghold/1.4 (offline battle portraits)"})
        with urlopen(request, timeout=20) as response:
            data = response.read(160_001)
    except HTTPError as error:
        if error.code in (404, 410):
            return None
        raise
    if len(data) > 160_000:
        raise ValueError(f"Portrait too large: {enemy_id}")
    with Image.open(BytesIO(data), formats=("WEBP",)) as image:
        if not 16 <= min(image.size) <= max(image.size) <= 512:
            raise ValueError(f"Invalid portrait dimensions: {enemy_id}")
        return ImageOps.contain(image.convert("RGBA"), (SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    source = ROOT / "electron/prts_battle_core/enemy_power.json"
    ids = sorted(json.loads(source.read_text(encoding="utf-8"))["enemies"])
    with ThreadPoolExecutor(max_workers=8) as pool:
        portraits = [(enemy_id, image) for enemy_id, image in zip(ids, pool.map(download, ids)) if image is not None]
    if not portraits:
        raise RuntimeError("No enemy portraits were downloaded")

    rows = (len(portraits) + COLUMNS - 1) // COLUMNS
    atlas = Image.new("RGBA", (COLUMNS * SIZE, rows * SIZE))
    for index, (_, image) in enumerate(portraits):
        x, y = (index % COLUMNS) * SIZE, (index // COLUMNS) * SIZE
        atlas.paste(image, (x + (SIZE - image.width) // 2, y + (SIZE - image.height) // 2))
    target = ROOT / "src/desktop"
    atlas.save(target / "enemyPortraits.webp", quality=84, method=6)
    (target / "enemyPortraits.json").write_text(
        json.dumps({"columns": COLUMNS, "ids": [enemy_id for enemy_id, _ in portraits]}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Enemy portraits: {len(portraits)}/{len(ids)}")


if __name__ == "__main__":
    main()
