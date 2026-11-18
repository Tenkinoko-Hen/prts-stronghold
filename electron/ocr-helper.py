"""Local stdin/stdout OCR worker. No screenshot files or network requests."""
import base64
import contextlib
import json
import sys
import time

import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR

NAMES = ["炎", "萨尔贡", "阿戈尔", "叙拉古", "卡西米尔", "维多利亚", "谢拉格", "乌萨斯", "伊比利亚", "莱塔尼亚",
         "精准", "远见", "投资人", "突袭", "不屈", "调和", "协防干员", "独行", "绝技", "聚合", "奥术", "迅捷", "灵巧", "坚守", "助力", "奇迹"]
MAX_LINE = 32 * 1024 * 1024


def classify(image, box):
    """Reuse Android badge thresholds; locate by OCR text, never by list order."""
    points = np.asarray(box)
    left, top = points.min(axis=0)
    right, bottom = points.max(axis=0)
    height, width = image.shape[:2]
    text_height = bottom - top
    if text_height < 8 or text_height > height * .07:
        return 0
    cx, cy, radius = (left + right) / 2, top - 2.8 * text_height, 1.65 * text_height
    if cx - radius < 0 or cy - radius < 0 or cx + radius >= width or cy + radius >= height:
        return 0
    yy, xx = np.mgrid[int(cy-radius):int(cy+radius)+1:2, int(cx-radius):int(cx+radius)+1:2]
    pixels = image[yy, xx][(xx-cx)**2 + (yy-cy)**2 <= radius**2].astype(np.int16)
    if not len(pixels):
        return 0
    b, g, r = pixels.T
    green = np.mean((g > 110) & (g-r > 55) & (b-r > 35))
    neutral = np.mean((g > 55) & (pixels.max(axis=1)-pixels.min(axis=1) < 45))
    bright = np.mean((r > 110) & (g > 110) & (b > 110))
    if green > .20:
        return 1
    if green < .015 and neutral > .30 and bright > .035:
        return -1
    return 0


def name_boxes(record):
    box, text, confidence = record[:3]
    if confidence < .85:
        return []
    if text in NAMES:
        return [(text, box)]
    # OCR may merge adjacent names. Character boxes keep their real positions.
    if len(record) < 5 or ''.join(record[4]) != text:
        return []
    result, offset = [], 0
    while offset < len(text):
        name = next((n for n in sorted(NAMES, key=len, reverse=True) if text.startswith(n, offset)), None)
        if name is None:
            return []
        points = np.asarray(record[3][offset:offset+len(name)]).reshape(-1, 2)
        left, top = points.min(axis=0)
        right, bottom = points.max(axis=0)
        result.append((name, [[left, top], [right, top], [right, bottom], [left, bottom]]))
        offset += len(name)
    return result


def recognize(engine, image):
    started = time.perf_counter()
    records, _ = engine(image, use_cls=False, return_word_box=True)
    states = {}
    for record in records or []:
        for name, box in name_boxes(record):
            state = classify(image, box)
            if state:
                states.setdefault(name, set()).add(state)
    seen = [name for name in NAMES if len(states.get(name, set())) == 1]
    banned = [name for name in seen if -1 in states[name]]
    return {"seenCovenants": seen, "bannedCovenants": banned,
            "missingCovenants": [name for name in NAMES if name not in seen],
            "complete": len(seen) == len(NAMES), "elapsedMs": round((time.perf_counter()-started)*1000)}


def create_engine():
    return RapidOCR(det_limit_side_len=1920, det_limit_type="max", max_side_len=2560,
                    intra_op_num_threads=4, inter_op_num_threads=1)


def serve():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    engine = None
    while line := sys.stdin.readline(MAX_LINE+1):
        if len(line) > MAX_LINE:
            break
        request_id = ""
        try:
            request = json.loads(line)
            request_id = request["id"]
            if not isinstance(request_id, str) or len(request_id) > 100:
                raise ValueError("Invalid request ID")
            data = base64.b64decode(request["image"], validate=True)
            image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if image is None or image.size > 48_000_000 or min(image.shape[:2]) < 100:
                raise ValueError("Invalid image size")
            with contextlib.redirect_stdout(sys.stderr):
                if engine is None:
                    engine = create_engine()
                result = recognize(engine, image)
            response = {"id": request_id, **result}
        except Exception as error:
            print(type(error).__name__, file=sys.stderr, flush=True)
            response = {"id": request_id, "error": "本地识别失败，请换一张清晰的盟约总览截图。"}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    serve()
