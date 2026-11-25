// 青逝痕 Tenkinoko 制作
const DEFAULT_WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeWorkArea(workArea) {
  if (
    workArea
    && Number.isFinite(workArea.x)
    && Number.isFinite(workArea.y)
    && Number.isFinite(workArea.width)
    && Number.isFinite(workArea.height)
    && workArea.width > 0
    && workArea.height > 0
  ) {
    return {
      x: Math.round(workArea.x),
      y: Math.round(workArea.y),
      width: Math.round(workArea.width),
      height: Math.round(workArea.height),
    };
  }
  return { ...DEFAULT_WORK_AREA };
}

function isValidRect(rect) {
  return Boolean(
    rect
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0,
  );
}

function computeMumuDrawerBounds({
  mumuWindow,
  workArea,
  drawerWidth = 416,
  minWidth = 380,
  minHeight = 560,
} = {}) {
  const wa = normalizeWorkArea(workArea);
  const safeMinW = Math.min(minWidth, wa.width);
  const safeMinH = Math.min(minHeight, wa.height);

  if (isValidRect(mumuWindow)) {
    const winX = Math.round(mumuWindow.x);
    const winY = Math.round(mumuWindow.y);
    const winW = Math.round(mumuWindow.width);
    const winH = Math.round(mumuWindow.height);
    const rightSpace = (wa.x + wa.width) - (winX + winW);

    if (rightSpace >= drawerWidth + 4) {
      const width = clamp(Math.round(drawerWidth), safeMinW, wa.width);
      const height = clamp(winH, safeMinH, wa.height);
      const x = clamp(winX + winW + 4, wa.x, wa.x + wa.width - width);
      const y = clamp(winY, wa.y, wa.y + wa.height - height);
      return { bounds: { x, y, width, height }, placement: 'outside-right' };
    }

    const maxInsideW = Math.min(440, wa.width);
    const minInsideW = Math.min(Math.max(390, safeMinW), maxInsideW);
    const width = clamp(Math.round(winW * 0.28), minInsideW, maxInsideW);
    const height = clamp(winH, safeMinH, wa.height);
    const x = clamp(winX + winW - width, wa.x, wa.x + wa.width - width);
    const y = clamp(winY, wa.y, wa.y + wa.height - height);
    return { bounds: { x, y, width, height }, placement: 'inside-right' };
  }

  const width = clamp(Math.round(drawerWidth), safeMinW, wa.width);
  const height = clamp(wa.height, safeMinH, wa.height);
  return {
    bounds: {
      x: wa.x + wa.width - width,
      y: wa.y,
      width,
      height,
    },
    placement: 'screen-right',
  };
}

function computeMumuHudBounds({
  mumuWindow,
  workArea,
  hudWidth = 460,
  hudHeight = 188,
} = {}) {
  const wa = normalizeWorkArea(workArea);
  const width = Math.min(Math.round(hudWidth), wa.width);
  const height = Math.min(Math.round(hudHeight), wa.height);

  if (isValidRect(mumuWindow)) {
    const winX = Math.round(mumuWindow.x);
    const winY = Math.round(mumuWindow.y);
    const winW = Math.round(mumuWindow.width);
    const winH = Math.round(mumuWindow.height);
    const rawX = Math.round(winX + winW * 0.56 - width / 2);
    const topOffset = Math.min(48, Math.max(16, Math.round(winH * 0.05)));
    const rawY = Math.round(winY + topOffset);
    return {
      x: clamp(rawX, wa.x, wa.x + wa.width - width),
      y: clamp(rawY, wa.y, wa.y + wa.height - height),
      width,
      height,
    };
  }

  return {
    x: clamp(wa.x + Math.round((wa.width - width) / 2), wa.x, wa.x + wa.width - width),
    y: clamp(wa.y + 16, wa.y, wa.y + wa.height - height),
    width,
    height,
  };
}

module.exports = { computeMumuDrawerBounds, computeMumuHudBounds };
