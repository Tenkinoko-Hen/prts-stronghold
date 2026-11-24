"""Regenerate telemetry launcher assets from products/telemetry/app-icon.svg (PyMuPDF and Pillow)."""
import io
import os
import shutil
from pathlib import Path
from xml.etree import ElementTree

import pymupdf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT / "products/telemetry"
SOURCE = PRODUCT / "app-icon.svg"
BRANDING = PRODUCT / "electron"
PUBLIC = PRODUCT / "public"
RES = PRODUCT / "android/res"
SIZES = (16, 24, 32, 48, 64, 128, 256)


def resized(image, side):
    return image.resize((side, side), Image.Resampling.LANCZOS)


def render():
    with pymupdf.open(stream=SOURCE.read_bytes(), filetype="svg") as document:
        pix = document[0].get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=True)
        icon = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    PUBLIC.mkdir(parents=True, exist_ok=True)
    BRANDING.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, PUBLIC / "favicon.svg")

    sizes = [(side, side) for side in SIZES]
    resized(icon, 256).save(BRANDING / "app.ico", sizes=sizes)
    resized(icon.crop((64, 64, 960, 960)), 48).save(BRANDING / "tray.ico", sizes=sizes[:4])

    mask = Image.new("L", icon.size)
    ImageDraw.Draw(mask).ellipse((0, 0, icon.width - 1, icon.height - 1), fill=255)
    rounded = icon.copy()
    rounded.putalpha(mask)
    for density, side in zip(("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"), (48, 72, 96, 144, 192)):
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        resized(icon, side).save(folder / "ic_launcher.png")
        resized(rounded, side).save(folder / "ic_launcher_round.png")
        # 108dp adaptive layer with an 18% transparent inset on all four sides.
        layer_size = side * 108 // 48
        mark_size = round(layer_size * 0.64)
        inset = (layer_size - mark_size) // 2
        foreground = Image.new("RGBA", (layer_size, layer_size))
        foreground.paste(resized(icon, mark_size), (inset, inset))
        foreground.save(folder / "ic_launcher_foreground.png")

    pulse = ElementTree.parse(SOURCE).find("{*}polyline")
    path = "M" + "L".join(pulse.attrib["points"].split())
    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    (drawable / "ic_notification.xml").write_text(
        '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" '
        'android:height="24dp" android:viewportWidth="352" android:viewportHeight="352">\n'
        '    <group android:translateX="-80" android:translateY="-84">\n'
        f'        <path android:pathData="{path}" android:strokeColor="#ffffff" '
        f'android:strokeWidth="{pulse.attrib["stroke-width"]}" android:strokeLineCap="square" />\n'
        '    </group>\n</vector>\n', encoding="utf-8")

    splash = Image.new("RGB", (480, 280), "#0c0e11")
    mark = resized(icon, 90)
    splash.paste(mark, (195, 43), mark)
    draw = ImageDraw.Draw(splash)
    fonts = Path(os.environ["WINDIR"]) / "Fonts"
    for y, label, font, size, color in (
        (157, "卫戍战报仪", "msyhbd.ttc", 30, "#eceff4"),
        (194, "Stronghold Telemetry", "consola.ttf", 15, "#e6c828"),
    ):
        draw.text((240, y), label, font=ImageFont.truetype(str(fonts / font), size), anchor="mm", fill=color)
    splash.save(BRANDING / "startup.bmp")


if __name__ == "__main__":
    render()
