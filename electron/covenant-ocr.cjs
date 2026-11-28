// 青逝痕 Tenkinoko 制作
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const CORE_COVENANTS = [
  '炎', '萨尔贡', '阿戈尔', '叙拉古', '卡西米尔', '维多利亚', '谢拉格', '乌萨斯', '伊比利亚', '莱塔尼亚',
];
const SUB_COVENANTS = [
  '精准', '远见', '投资人', '突袭', '不屈', '调和', '协防干员', '独行', '绝技', '聚合',
  '奥术', '迅捷', '灵巧', '坚守', '助力', '奇迹',
];
const COVENANT_NAMES = [...CORE_COVENANTS, ...SUB_COVENANTS];
const CORE_SET = new Set(CORE_COVENANTS);
const SUB_SET = new Set(SUB_COVENANTS);
const BADGE_OFFSET_RATIOS = [2.8, 2.25, 3.15, 3.85, 4.35];
const SORTED_NAMES = [...COVENANT_NAMES].sort((a, b) => b.length - a.length);
const SHORTCUT = 'CommandOrControl+Shift+F8';
const AUTO_POLL_MS = 2400;
const MAX_STDOUT = 2 * 1024 * 1024;

const PS_WINRT_OCR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Foundation, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation')
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
$engine = $null
foreach ($tag in @('zh-Hans-CN', 'zh-Hans', 'zh-CN')) {
  $lang = New-Object Windows.Globalization.Language($tag)
  if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($lang)) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    if ($engine) { break }
  }
}
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }

function Run-OcrOnBitmap([System.Drawing.Bitmap]$bmp, [double]$invScale, [double]$offsetX, [double]$offsetY, [double]$padLeft) {
  $ms = [System.IO.MemoryStream]::new()
  $ras = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
  $writer = [Windows.Storage.Streams.DataWriter]::new($ras)
  $decoder = $null
  $soft = $null
  try {
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $writer.WriteBytes($ms.ToArray())
    $null = Await ($writer.StoreAsync()) ([uint32])
    $ras.Seek(0)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $soft = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($soft)) ([Windows.Media.Ocr.OcrResult])
    $out = @()
    foreach ($line in $res.Lines) {
      $words = @()
      foreach ($w in $line.Words) {
        $rx = ($w.BoundingRect.X - $padLeft) * $invScale + $offsetX
        $ry = $w.BoundingRect.Y * $invScale + $offsetY
        $rw = $w.BoundingRect.Width * $invScale
        $rh = $w.BoundingRect.Height * $invScale
        if ($rx + $rw -gt 0 -and $rw -gt 1 -and $rh -gt 1) {
          $words += @{ t = $w.Text; x = [math]::Round($rx, 1); y = [math]::Round($ry, 1); w = [math]::Round($rw, 1); h = [math]::Round($rh, 1) }
        }
      }
      if ($words.Count -gt 0) { $out += ,$words }
    }
    return $out
  } finally {
    if ($soft) { $soft.Dispose() }
    if ($decoder -is [System.IDisposable]) { $decoder.Dispose() }
    $writer.Dispose()
    $ras.Dispose()
    $ms.Dispose()
  }
}

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if (-not $line.Trim()) { continue }
  $reqId = ''
  try {
    $req = $line | ConvertFrom-Json
    $reqId = [string]$req.id
    if (-not $engine) { throw '系统未安装简体中文 OCR 语言组件。' }
    $raw = [Convert]::FromBase64String([string]$req.image)
    $inStream = [System.IO.MemoryStream]::new($raw)
    $src = [System.Drawing.Bitmap]::new($inStream)
    $scaled = $null
    $leftBmp = $null
    $g = $null
    $lg = $null
    try {
      # 裁掉右侧 20% 无效地图预览区，仅保留左侧 0..80% 宽度与全高度（含顶部模式标题）
      $mainCropW = [Math]::Max(1, [int]($src.Width * 0.80))
      $scale = if ($src.Width -lt 1800) { 2.0 } else { 1.0 }
      $scaled = [System.Drawing.Bitmap]::new([int]($mainCropW * $scale), [int]($src.Height * $scale))
      $g = [System.Drawing.Graphics]::FromImage($scaled)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $scaled.Width, $scaled.Height), [System.Drawing.Rectangle]::new(0, 0, $mainCropW, $src.Height), [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $g = $null
      $lines = @(Run-OcrOnBitmap $scaled (1.0 / $scale) 0 0 0)
      $scaled.Dispose()
      $scaled = $null

      # 智能跳过第二遍左列补扫：仅在第一遍文本确实缺失左边缘关键盟约字时才对最左列放大补扫
      $sb = [System.Text.StringBuilder]::new()
      foreach ($ln in $lines) {
        foreach ($w in $ln) {
          $null = $sb.Append([string]$w.t)
        }
      }
      $firstText = $sb.ToString() -replace '\s+', ''
      $hasYan = $firstText.Contains('炎')
      $hasPreci = $firstText.Contains('精准')
      $hasDoc = $firstText.Contains('聚合')
      $isQuickTitle = $firstText.Contains('极速模拟')
      $skipLeftRescue = $hasYan -and $hasPreci -and ($hasDoc -or $isQuickTitle)

      $extra = @()
      if (-not $skipLeftRescue) {
        $cropW = [Math]::Min($src.Width, [Math]::Max(40, [int]($src.Width * 0.16)))
        $cropY = [int]($src.Height * 0.28)
        $cropH = [Math]::Max(40, [int]($src.Height * 0.68))
        if ($cropY + $cropH -gt $src.Height) { $cropH = [Math]::Max(1, $src.Height - $cropY) }
        $subScale = if ($src.Width -lt 1800) { 3.0 } else { 2.0 }
        $pad = 48
        $leftBmp = [System.Drawing.Bitmap]::new([int]($cropW * $subScale + $pad * 2), [int]($cropH * $subScale))
        $lg = [System.Drawing.Graphics]::FromImage($leftBmp)
        $lg.Clear([System.Drawing.Color]::FromArgb(18, 22, 24))
        $lg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $destRect = [System.Drawing.Rectangle]::new($pad, 0, [int]($cropW * $subScale), [int]($cropH * $subScale))
        $srcRect = [System.Drawing.Rectangle]::new(0, $cropY, $cropW, $cropH)
        $lg.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $lg.Dispose()
        $lg = $null
        $extra = @(Run-OcrOnBitmap $leftBmp (1.0 / $subScale) 0 $cropY $pad)
        $leftBmp.Dispose()
        $leftBmp = $null
      }

      $allLines = @($lines) + @($extra)
      $resp = @{ id = $reqId; width = $src.Width; height = $src.Height; lines = $allLines } | ConvertTo-Json -Compress -Depth 6
      [Console]::Out.WriteLine($resp)
    } finally {
      if ($lg) { $lg.Dispose() }
      if ($leftBmp) { $leftBmp.Dispose() }
      if ($g) { $g.Dispose() }
      if ($scaled -and ($scaled -ne $src)) { $scaled.Dispose() }
      $src.Dispose()
      $inStream.Dispose()
    }
  } catch {
    $err = @{ id = $reqId; error = $_.Exception.Message } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($err)
  }
}
`;

function classifyCircleBgra(bgra, width, height, cx, cy, radius) {
  if (!bgra || width <= 0 || height <= 0 || bgra.length < width * height * 4) return 0;
  if (radius < 6 || cx - radius < 0 || cy - radius < 0 || cx + radius >= width || cy + radius >= height) return 0;
  const r2 = radius * radius;
  let count = 0;
  let green = 0;
  let neutral = 0;
  let bright = 0;
  const yStart = Math.floor(cy - radius);
  const yEnd = Math.ceil(cy + radius);
  const xStart = Math.floor(cx - radius);
  const xEnd = Math.ceil(cx + radius);
  for (let y = yStart; y <= yEnd; y += 2) {
    const dy = y - cy;
    for (let x = xStart; x <= xEnd; x += 2) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;
      const offset = (y * width + x) * 4;
      const b = bgra[offset];
      const g = bgra[offset + 1];
      const r = bgra[offset + 2];
      count++;
      if (g > 110 && g - r > 55 && b - r > 35) green++;
      if (g > 55 && Math.max(r, g, b) - Math.min(r, g, b) < 45) neutral++;
      if (r > 110 && g > 110 && b > 110) bright++;
    }
  }
  if (!count) return 0;
  if (green > count * 0.20) return 1;
  if (green < count * 0.015 && neutral > count * 0.30 && bright > count * 0.035) return -1;
  return 0;
}

function classifyBadgeBgra(bgra, width, height, box) {
  const textHeight = box.bottom - box.top;
  if (textHeight < 6 || textHeight > height * 0.085) return 0;
  const cx = (box.left + box.right) / 2;
  const radius = 1.65 * textHeight;
  for (const ratio of BADGE_OFFSET_RATIOS) {
    const state = classifyCircleBgra(bgra, width, height, cx, box.top - ratio * textHeight, radius);
    if (state !== 0) return state;
  }
  return 0;
}

function looksLikeCovenantScreen(bgra, width, height) {
  if (!bgra || width < 240 || height < 135 || bgra.length < width * height * 4) return { match: false, fingerprint: '' };
  let total = 0;
  let emerald = 0;
  let dark = 0;
  let hash = 2166136261;
  const stepX = Math.max(2, Math.floor(width / 96));
  const stepY = Math.max(2, Math.floor(height / 54));
  const xMin = Math.max(2, Math.floor(width * 0.01));
  const yMin = Math.floor(height * 0.16);
  const yMax = Math.floor(height * 0.88);
  const xMax = Math.floor(width * 0.78);
  for (let y = yMin; y < yMax; y += stepY) {
    for (let x = xMin; x < xMax; x += stepX) {
      const offset = (y * width + x) * 4;
      const b = bgra[offset];
      const g = bgra[offset + 1];
      const r = bgra[offset + 2];
      total++;
      if (g > 110 && g - r > 55 && b - r > 35) emerald++;
      if (r < 52 && g < 60 && b < 62) dark++;
      hash = Math.imul(hash ^ ((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)), 16777619) >>> 0;
    }
  }
  if (!total) return { match: false, fingerprint: '' };
  const emeraldRatio = emerald / total;
  const darkRatio = dark / total;
  return {
    match: emeraldRatio >= 0.02 && emeraldRatio <= 0.42 && darkRatio >= 0.32,
    fingerprint: `${width}x${height}:${hash.toString(16)}`,
  };
}

function uniqueFuzzyCovenant(token) {
  if (COVENANT_NAMES.includes(token)) return token;
  if (token.length < 2 || token.length > 4) return null;
  const matches = COVENANT_NAMES.filter(target => {
    if (target.length !== token.length) return false;
    let diff = 0;
    for (let i = 0; i < target.length; i++) {
      if (target[i] !== token[i]) diff++;
    }
    // 2 字盟约要求高可信同音形近字表；3~4 字盟约允许最多 1 字形近误差且唯一命中
    if (target.length >= 3) return diff === 1;
    return false;
  });
  if (matches.length === 1) return matches[0];
  const nearTwo = {
    '迅漣': '迅捷', '迅连': '迅捷', '迅建': '迅捷', '谌和': '调和', '周和': '调和',
    '精淮': '精准', '精难': '精准', '奇迹': '奇迹', '聚台': '聚合', '独仃': '独行',
    '不居': '不屈', '助カ': '助力', '奥木': '奥术', '坚宁': '坚守',
    '灵污': '灵巧', '灵功': '灵巧', '远觅': '远见', '炎国': '炎',
  };
  return nearTwo[token] ?? null;
}

function extractCovenantBoxesFromLine(words) {
  if (!Array.isArray(words) || !words.length) return [];
  const chars = [];
  for (const w of words) {
    const text = String(w?.t ?? '').trim();
    if (!text) continue;
    const len = [...text].length;
    const cw = Number(w.w) / Math.max(1, len);
    [...text].forEach((ch, idx) => {
      chars.push({
        ch,
        left: Number(w.x) + idx * cw,
        top: Number(w.y),
        right: Number(w.x) + (idx + 1) * cw,
        bottom: Number(w.y) + Number(w.h),
      });
    });
  }
  chars.sort((a, b) => a.left - b.left);

  // 将同行字按水平间距拆成紧凑词组（同一盟约相邻字间距通常 < 0.9 * 字高）
  const clusters = [];
  for (const item of chars) {
    const prev = clusters[clusters.length - 1];
    const h = Math.max(6, item.bottom - item.top);
    if (prev && Math.abs(item.top - prev[0].top) <= h * 0.65 && item.left - prev[prev.length - 1].right <= h * 1.45) {
      prev.push(item);
    } else {
      clusters.push([item]);
    }
  }

  const found = [];
  for (const cluster of clusters) {
    const joined = cluster.map(c => c.ch).join('');
    let i = 0;
    while (i < cluster.length) {
      let matchedName = null;
      let matchedLen = 0;
      for (const name of SORTED_NAMES) {
        if (joined.startsWith(name, i)) {
          matchedName = name;
          matchedLen = name.length;
          break;
        }
      }
      if (!matchedName && i === 0 && cluster.length >= 2 && cluster.length <= 4) {
        const fuzzy = uniqueFuzzyCovenant(joined);
        if (fuzzy) {
          matchedName = fuzzy;
          matchedLen = cluster.length;
        }
      }
      // 处理中间漏掉 1 个字的情况，如“谢 格”（x 跨度约 3 个字）或“叙 古”
      if (!matchedName && i === 0 && cluster.length === 2) {
        const span = cluster[1].right - cluster[0].left;
        const h = Math.max(10, cluster[0].bottom - cluster[0].top);
        if (span >= h * 2.4 && span <= h * 4.2) {
          const gapped = COVENANT_NAMES.filter(n => n.length === 3 && n[0] === cluster[0].ch && n[2] === cluster[1].ch);
          if (gapped.length === 1) {
            matchedName = gapped[0];
            matchedLen = 2;
          }
        }
      }
      if (matchedName) {
        const slice = cluster.slice(i, i + matchedLen);
        found.push({
          name: matchedName,
          box: {
            left: Math.min(...slice.map(c => c.left)),
            top: Math.min(...slice.map(c => c.top)),
            right: Math.max(...slice.map(c => c.right)),
            bottom: Math.max(...slice.map(c => c.bottom)),
          },
        });
        i += matchedLen;
      } else {
        i += 1;
      }
    }
  }
  return found;
}

function probeBottomSixSubBadges(bgra, width, height, subHits, missingSub, coreLeftCx) {
  if (!bgra || !Array.isArray(subHits) || !Array.isArray(missingSub) || missingSub.length !== 6 || subHits.length < 6) {
    return {};
  }
  let minTop = Infinity;
  for (const b of subHits) {
    if (b.top < minTop) minTop = b.top;
  }
  const row1 = subHits
    .filter(b => Math.abs(b.top - minTop) <= Math.max(12, b.th * 1.4))
    .sort((a, b) => a.cx - b.cx);
  if (row1.length < 6) return {};

  let sumTh = 0;
  let sumTop = 0;
  for (const b of row1) {
    sumTh += b.th;
    sumTop += b.top;
  }
  const avgTh = sumTh / row1.length;
  const row1Top = sumTop / row1.length;
  if (avgTh < 6) return {};

  const gaps = [];
  let minGap = Infinity;
  for (let i = 0; i + 1 < row1.length; i++) {
    const g = row1[i + 1].cx - row1[i].cx;
    if (g >= avgTh * 3.0 && g <= avgTh * 10.5) {
      gaps.push(g);
      if (g < minGap) minGap = g;
    }
  }
  if (!gaps.length) return {};

  let gapSum = 0;
  let gapCnt = 0;
  for (const g of gaps) {
    if (g <= minGap * 1.45) {
      gapSum += g;
      gapCnt++;
    }
  }
  if (!gapCnt) return {};
  const dx = gapSum / gapCnt;
  if (dx < avgTh * 3.0 || dx > width * 0.25) return {};

  const firstCx = row1[0].cx;
  const lastCx = row1[row1.length - 1].cx;
  const spanCols = Math.round((lastCx - firstCx) / dx);
  let baseX0 = firstCx;
  if (row1.length < 10 && spanCols < 9 && Number.isFinite(coreLeftCx)) {
    const shiftCols = Math.round((firstCx - coreLeftCx) / dx);
    if (shiftCols >= 0 && shiftCols <= 4) {
      baseX0 = firstCx - shiftCols * dx;
    }
  }
  let x0Sum = 0;
  let x0Cnt = 0;
  for (const b of row1) {
    const col = Math.round((b.cx - baseX0) / dx);
    if (col >= 0 && col <= 9) {
      x0Sum += b.cx - col * dx;
      x0Cnt++;
    }
  }
  const x0 = x0Cnt > 0 ? x0Sum / x0Cnt : baseX0;

  const py1 = row1Top + avgTh * 6.8;
  const py2 = row1Top + avgTh * 6.1;
  const r1 = avgTh * 1.95;
  const r2 = avgTh * 1.65;
  let unified = 0;
  for (let k = 0; k < 6; k++) {
    const px = x0 + dx * k;
    let s = classifyCircleBgra(bgra, width, height, px, py1, r1);
    if (s === 0) s = classifyCircleBgra(bgra, width, height, px, py2, r2);
    if (s === 0) return {};
    if (unified === 0) unified = s;
    else if (s !== unified) return {};
  }
  const out = {};
  for (const name of missingSub) {
    out[name] = unified;
  }
  return out;
}

function evaluateOcrLines(lines, bgra, width, height) {
  const states = new Map();
  const flatText = (lines || []).map(words => (words || []).map(w => w.t).join('')).join(' ');
  const compactText = flatText.replace(/\s+/g, '');
  const isQuickMode = /极速模拟/.test(compactText);
  const isSoloMode = !isQuickMode && /单人模拟|规程等级/.test(compactText);
  const headerConfirmed = /确认.?局信息|核心盟约|附加盟约|极速模拟|单人模拟|规程等级|激活的盟约/.test(compactText);

  const subHitByName = new Map();
  let coreLeftCx = NaN;

  for (const words of lines || []) {
    for (const { name, box } of extractCovenantBoxesFromLine(words)) {
      const state = classifyBadgeBgra(bgra, width, height, box);
      if (state !== 0) {
        if (!states.has(name)) states.set(name, new Set());
        states.get(name).add(state);
        const cx = (box.left + box.right) / 2;
        if (CORE_SET.has(name)) {
          coreLeftCx = Number.isNaN(coreLeftCx) ? cx : Math.min(coreLeftCx, cx);
        } else if (SUB_SET.has(name) && !subHitByName.has(name)) {
          subHitByName.set(name, { name, cx, top: box.top, th: box.bottom - box.top });
        }
      }
    }
  }

  const cleanSet = new Set(COVENANT_NAMES.filter(name => states.get(name)?.size === 1));
  const cleanCoreCount = CORE_COVENANTS.filter(name => cleanSet.has(name)).length;
  if (!isQuickMode && (isSoloMode || cleanCoreCount >= 9) && cleanCoreCount >= 8) {
    const missingSub = SUB_COVENANTS.filter(name => !cleanSet.has(name));
    if (missingSub.length === 6) {
      const cleanSubHits = [...subHitByName.values()].filter(hit => cleanSet.has(hit.name));
      const inferred = probeBottomSixSubBadges(bgra, width, height, cleanSubHits, missingSub, coreLeftCx);
      for (const [name, inferredState] of Object.entries(inferred)) {
        states.set(name, new Set([inferredState]));
      }
    }
  }

  let seenCovenants = COVENANT_NAMES.filter(name => states.get(name)?.size === 1);
  const seenCoreCount = CORE_COVENANTS.filter(name => seenCovenants.includes(name)).length;
  const seenSubCount = SUB_COVENANTS.filter(name => seenCovenants.includes(name)).length;
  const quickAutoComplete = isQuickMode && (
    (seenCovenants.length >= 16 && seenCovenants.length <= 18)
    || (seenCoreCount >= 8 && seenSubCount >= 10 && seenCovenants.length >= 18)
  );
  if (quickAutoComplete) {
    for (const name of COVENANT_NAMES) {
      if (states.get(name)?.size !== 1) {
        states.set(name, new Set([-1]));
      }
    }
    seenCovenants = [...COVENANT_NAMES];
  }

  const bannedCovenants = seenCovenants.filter(name => states.get(name).has(-1));
  const missingCovenants = COVENANT_NAMES.filter(name => !seenCovenants.includes(name));
  const stateByName = {};
  for (const name of seenCovenants) {
    stateByName[name] = states.get(name).has(-1) ? -1 : 1;
  }

  return {
    headerConfirmed,
    isQuickMode,
    isSoloMode,
    seenCovenants,
    bannedCovenants,
    missingCovenants,
    complete: seenCovenants.length === COVENANT_NAMES.length,
    stateByName,
  };
}

function mergeCovenantScanResult(accumulatedStates, nextResult, { forceReset = false } = {}) {
  const nextEntries = Object.entries(nextResult?.stateByName || {});
  if (forceReset) {
    accumulatedStates.clear();
  }
  let conflicts = 0;
  let added = 0;
  for (const [name, val] of nextEntries) {
    const prev = accumulatedStates.get(name);
    if (prev === undefined) added++;
    else if (prev !== val) conflicts++;
  }
  if (!forceReset && accumulatedStates.size > 0 && (conflicts >= 2 || (nextResult?.complete && conflicts >= 1))) {
    accumulatedStates.clear();
    conflicts = 0;
    added = nextEntries.length;
  }
  for (const [name, val] of nextEntries) {
    accumulatedStates.set(name, val);
  }
  const seenCovenants = COVENANT_NAMES.filter(name => accumulatedStates.has(name));
  const bannedCovenants = seenCovenants.filter(name => accumulatedStates.get(name) === -1);
  const missingCovenants = COVENANT_NAMES.filter(name => !accumulatedStates.has(name));
  const coreCount = CORE_COVENANTS.filter(name => accumulatedStates.has(name)).length;
  return {
    headerConfirmed: Boolean(nextResult?.headerConfirmed),
    isQuickMode: Boolean(nextResult?.isQuickMode),
    isSoloMode: Boolean(nextResult?.isSoloMode),
    seenCovenants,
    bannedCovenants,
    missingCovenants,
    complete: seenCovenants.length === COVENANT_NAMES.length,
    coreCount,
    added,
    conflicts,
  };
}

function createWinRtOcrRunner(options = {}) {
  const spawnFn = options.spawnFn || spawn;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 20_000;
  let child;
  let activeJob = null;
  const queue = [];
  const encoded = Buffer.from(PS_WINRT_OCR_SCRIPT, 'utf16le').toString('base64');

  function stop() {
    const prev = child;
    child = undefined;
    try { prev?.kill(); } catch { /* ignore */ }
    const toReject = [];
    if (activeJob) {
      toReject.push(activeJob);
      activeJob = null;
    }
    while (queue.length > 0) {
      toReject.push(queue.shift());
    }
    for (const job of toReject) {
      clearTimeout(job.timer);
      job.reject(new Error('OCR 进程已停止'));
    }
  }

  function pumpQueue() {
    if (activeJob || queue.length === 0) return;
    let proc;
    try {
      proc = ensure();
    } catch (err) {
      const failed = queue.shift();
      failed?.reject(err instanceof Error ? err : new Error(String(err)));
      pumpQueue();
      return;
    }
    const job = queue.shift();
    activeJob = job;
    job.timer = setTimeout(() => {
      if (activeJob !== job) return;
      activeJob = null;
      job.reject(new Error('本机 OCR 识别超时，请重试。'));
      stop();
    }, timeoutMs);
    try {
      const payload = (Buffer.isBuffer(job.pngBuffer) ? job.pngBuffer : Buffer.from(job.pngBuffer)).toString('base64');
      proc.stdin.write(JSON.stringify({ id: job.id, image: payload }) + '\n');
    } catch (err) {
      if (activeJob === job) {
        activeJob = null;
        clearTimeout(job.timer);
        job.reject(err instanceof Error ? err : new Error(String(err)));
        stop();
      }
    }
  }

  function ensure() {
    if (child) return child;
    const proc = spawnFn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    child = proc;
    let buf = '';
    proc.stdout.setEncoding('utf8');
    const onExit = () => { if (child === proc) stop(); };
    proc.on('error', onExit);
    proc.on('close', onExit);
    proc.stdin.on('error', onExit);
    proc.stdout.on('data', chunk => {
      if (child !== proc) return;
      buf += chunk;
      if (buf.length > MAX_STDOUT) return stop();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (!activeJob || msg.id !== activeJob.id) continue;
        const job = activeJob;
        activeJob = null;
        clearTimeout(job.timer);
        if (msg.error) job.reject(new Error(msg.error));
        else job.resolve(msg);
        pumpQueue();
      }
    });
    return proc;
  }

  function recognizePng(pngBuffer) {
    if (!Buffer.isBuffer(pngBuffer) && !(pngBuffer instanceof Uint8Array)) {
      return Promise.reject(new Error('无效的 OCR 图像缓冲区'));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      queue.push({ id, pngBuffer, resolve, reject, timer: null });
      pumpQueue();
    });
  }

  return { recognizePng, stop };
}

function isArknightsWindowName(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  return text === '明日方舟'
    || /^Arknights\b/i.test(text)
    || /(?:明日方舟|Arknights).*(?:MuMu|雷电|LDPlayer)|(?:MuMu|雷电|LDPlayer).*(?:明日方舟|Arknights)/i.test(text);
}

function isMumuEmulatorWindowName(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  if (/(?:多开器|游戏中心|应用中心|模拟器中心|Multi[-\s]?Instance|App\s*Center)/i.test(text)) {
    return false;
  }
  return /(?:MuMu安卓设备|MuMu模拟器|MuMu\s*Player|NemuPlayer)/i.test(text);
}

function isLdplayerEmulatorWindowName(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  if (/(?:多开器|游戏中心|应用中心|模拟器中心|雷电圈|Multi[-\s]?Instance|App\s*Center|LDMultiPlayer|LDStore)/i.test(text)) {
    return false;
  }
  return /(?:雷电模拟器|LDPlayer)/i.test(text);
}

function pickGameCaptureWindow(windows, ownHandle) {
  const external = (Array.isArray(windows) ? windows : []).filter(
    s => s && !(s.id?.startsWith('window:') && s.id.split(':')[1] === ownHandle),
  );
  return external.find(s => isArknightsWindowName(s.name))
    || external.find(s => isMumuEmulatorWindowName(s.name))
    || external.find(s => isLdplayerEmulatorWindowName(s.name))
    || null;
}

function installCovenantOcr({
  mainWindow,
  ipcMain,
  desktopCapturer,
  clipboard,
  globalShortcut,
  ocrRunner,
  setHudTemporarilyHidden,
  captureSettleMs = 80,
  autoPollMs = AUTO_POLL_MS,
}) {
  const runner = ocrRunner || createWinRtOcrRunner();
  let disposed = false;
  let busy = false;
  let autoPollEnabled = true;
  let lastAutoFingerprint = '';
  let lastAutoAppliedSignature = '';
  const accumulatedStates = new Map();
  let pollTimer;

  let state = {
    id: '',
    status: 'idle',
    source: 'none',
    message: '',
    progress: 0,
    stageLabel: '',
    complete: false,
    bannedCovenants: [],
    seenCovenants: [],
    missingCovenants: [],
    shortcutAvailable: false,
  };

  function publish(patch) {
    state = { ...state, ...patch };
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('covenant-ocr-state', state);
    return state;
  }

  async function captureWithHudHidden(allowScreenFallback, thumbnailSize = { width: 1920, height: 1080 }) {
    let hidHud = false;
    try {
      if (typeof setHudTemporarilyHidden === 'function') {
        hidHud = Boolean(await setHudTemporarilyHidden(true));
        if (hidHud && captureSettleMs > 0) {
          await new Promise(resolve => setTimeout(resolve, captureSettleMs));
        }
      }
      return await captureGameOrScreen(allowScreenFallback, thumbnailSize);
    } finally {
      if (hidHud && typeof setHudTemporarilyHidden === 'function') {
        try {
          await setHudTemporarilyHidden(false);
        } catch {
          // ignore HUD restore errors
        }
      }
    }
  }

  async function captureGameOrScreen(allowScreenFallback, thumbnailSize = { width: 1920, height: 1080 }) {
    const ownHandle = mainWindow.getMediaSourceId().split(':')[1];
    const windows = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize,
    });
    const gameWin = pickGameCaptureWindow(windows, ownHandle);
    if (gameWin && !gameWin.thumbnail.isEmpty()) {
      return { image: gameWin.thumbnail, label: gameWin.name, isWindow: true };
    }
    if (!allowScreenFallback) return null;
    const screens = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize,
    });
    const first = screens.find(s => !s.thumbnail.isEmpty());
    return first ? { image: first.thumbnail, label: '当前屏幕', isWindow: false } : null;
  }

  async function recognizeNativeImage(nativeImg) {
    const size = nativeImg.getSize();
    if (Math.min(size.width, size.height) < 120) {
      throw new Error('画面尺寸过小，请展开游戏窗口后重试。');
    }
    const bgra = nativeImg.toBitmap();
    const png = nativeImg.toPNG();
    const ocr = await runner.recognizePng(png);
    return evaluateOcrLines(ocr.lines, bgra, size.width, size.height);
  }

  async function pollOnce() {
    if (disposed || busy || !autoPollEnabled || mainWindow.isDestroyed()) return;
    busy = true;
    try {
      // Stage 1：极轻量 320×180 缩略图门控，日常带宽降低 ~97%，未命中时不抓 1080p
      const thumbCaptured = await captureGameOrScreen(false, { width: 320, height: 180 });
      if (!thumbCaptured || disposed || !autoPollEnabled || mainWindow.isDestroyed()) return;
      const thumbSize = thumbCaptured.image.getSize();
      if (thumbSize.width < 240 || thumbSize.height < 135) return;
      const thumbBgra = thumbCaptured.image.toBitmap();
      const gate = looksLikeCovenantScreen(thumbBgra, thumbSize.width, thumbSize.height);
      if (!gate.match || gate.fingerprint === lastAutoFingerprint) return;
      lastAutoFingerprint = gate.fingerprint;

      // Stage 2：门控命中且指纹变化后，暂时隐藏悬浮窗防遮挡，仅抓一次 1920×1080 高清画面送 WinRT OCR
      const captured = await captureWithHudHidden(false, { width: 1920, height: 1080 });
      if (!captured || disposed || !autoPollEnabled || mainWindow.isDestroyed()) return;
      const size = captured.image.getSize();
      if (Math.min(size.width, size.height) < 200) return;
      const bgra = captured.image.toBitmap();

      const ocr = await runner.recognizePng(captured.image.toPNG());
      if (disposed || !autoPollEnabled || mainWindow.isDestroyed()) return;
      const result = evaluateOcrLines(ocr.lines, bgra, size.width, size.height);
      const canMergePartial = accumulatedStates.size > 0 && !state.complete && result.seenCovenants.length >= 4;
      const validOpening = result.complete || (result.headerConfirmed && result.seenCovenants.length >= 16) || canMergePartial;
      if (!validOpening) return;

      let conflictsBefore = 0;
      for (const [name, val] of Object.entries(result.stateByName || {})) {
        const prev = accumulatedStates.get(name);
        if (prev !== undefined && prev !== val) conflictsBefore++;
      }
      if (state.complete && !result.complete && conflictsBefore === 0) return;

      const merged = mergeCovenantScanResult(accumulatedStates, result, {
        forceReset: state.complete && (result.complete || conflictsBefore > 0),
      });
      if (!result.complete && canMergePartial && merged.added === 0 && conflictsBefore === 0) return;

      const signature = `${merged.complete ? 1 : 0}:${merged.seenCovenants.length}:${merged.bannedCovenants.join(',')}`;
      if (signature === lastAutoAppliedSignature) return;
      lastAutoAppliedSignature = signature;

      publish({
        id: `ocr-auto-${Date.now()}`,
        status: merged.complete ? 'ready' : 'incomplete',
        source: 'auto',
        progress: merged.complete ? 100 : Math.min(96, Math.round((merged.seenCovenants.length / 26) * 100)),
        stageLabel: merged.complete
          ? (merged.isQuickMode ? '已读全 18/18' : '已读全 26/26')
          : `已识别 ${merged.seenCovenants.length}/26`,
        complete: merged.complete,
        bannedCovenants: merged.bannedCovenants,
        seenCovenants: merged.seenCovenants,
        missingCovenants: merged.missingCovenants,
        message: merged.complete
          ? (merged.isQuickMode
            ? `极速模拟已读全 18 项（其余 8 项自动标记受限），识别到 ${merged.bannedCovenants.length} 项受限盟约（${merged.bannedCovenants.join('、') || '本局无受限'}）。`
            : `已从开局画面自动识别 ${merged.bannedCovenants.length} 项受限盟约（${merged.bannedCovenants.join('、') || '本局无受限'}）。`)
          : `已识别 ${merged.seenCovenants.length}/26（受限 ${merged.bannedCovenants.length} 项），请向下滚动查看其余附加盟约后再次扫描（待补：${merged.missingCovenants.slice(0, 6).join('、')}${merged.missingCovenants.length > 6 ? '…' : ''}）。`,
      });
    } catch {
      // 后台静默探测忽略瞬时失败，不影响前台体验
    } finally {
      busy = false;
    }
  }

  async function manualScan(mode) {
    if (disposed) return state;
    if (busy) return state;
    busy = true;
    const id = randomUUID();
    publish({
      id,
      status: 'scanning',
      source: mode === 'clipboard' ? 'clipboard' : 'manual',
      progress: 18,
      stageLabel: mode === 'clipboard' ? '读取剪贴板截图' : '暂时隐藏悬浮窗并截取画面',
      message: mode === 'clipboard' ? '正在识别剪贴板截图中的盟约…' : '已暂时隐藏悬浮窗，正在截取游戏画面…',
    });
    try {
      let image;
      if (mode === 'clipboard') {
        image = clipboard.readImage();
        if (!image || image.isEmpty()) {
          throw new Error('剪贴板中没有截图，请先按 Win+Shift+S 截图后再粘贴识别。');
        }
      } else {
        const captured = await captureWithHudHidden(true, { width: 1920, height: 1080 });
        if (!captured) throw new Error('未找到明日方舟窗口或可用屏幕画面。');
        image = captured.image;
      }
      publish({
        id,
        status: 'scanning',
        progress: 56,
        stageLabel: 'OCR 文字识别与图标采样',
        message: '正在识别画面中的盟约文字与灰态受限标记…',
      });
      const result = await recognizeNativeImage(image);
      if (result.seenCovenants.length === 0) {
        throw new Error('未在画面中识别到盟约总览，请确认游戏处于「1/3 确认本局信息」界面且未被遮挡。');
      }
      publish({
        id,
        status: 'scanning',
        progress: 88,
        stageLabel: '合并与校验盟约状态',
        message: `已提取 ${result.seenCovenants.length} 项盟约，正在校验合并结果…`,
      });
      const merged = mergeCovenantScanResult(accumulatedStates, result, { forceReset: state.complete });
      lastAutoAppliedSignature = `${merged.complete ? 1 : 0}:${merged.seenCovenants.length}:${merged.bannedCovenants.join(',')}`;
      return publish({
        id,
        status: merged.complete ? 'ready' : 'incomplete',
        source: mode === 'clipboard' ? 'clipboard' : 'manual',
        progress: merged.complete ? 100 : Math.min(96, Math.round((merged.seenCovenants.length / 26) * 100)),
        stageLabel: merged.complete
          ? (merged.isQuickMode ? '已读全 18/18' : '已读全 26/26')
          : `已识别 ${merged.seenCovenants.length}/26`,
        complete: merged.complete,
        bannedCovenants: merged.bannedCovenants,
        seenCovenants: merged.seenCovenants,
        missingCovenants: merged.missingCovenants,
        message: merged.complete
          ? (merged.isQuickMode
            ? `极速模拟已读全 18 项（其余 8 项自动标记受限），识别到 ${merged.bannedCovenants.length} 项受限盟约（${merged.bannedCovenants.join('、') || '无受限'}）。`
            : `OCR 已读全 26 项，识别到 ${merged.bannedCovenants.length} 项受限盟约（${merged.bannedCovenants.join('、') || '无受限'}）。`)
          : `已识别 ${merged.seenCovenants.length}/26，请向下滚动查看其余附加盟约后再次扫描（受限 ${merged.bannedCovenants.length} 项；待补：${merged.missingCovenants.slice(0, 6).join('、')}${merged.missingCovenants.length > 6 ? '…' : ''}）。`,
      });
    } catch (err) {
      return publish({
        id,
        status: 'error',
        source: mode === 'clipboard' ? 'clipboard' : 'manual',
        progress: 0,
        stageLabel: '识别未完成',
        message: err instanceof Error ? err.message : 'OCR 识别失败，请重试或手动点选。',
      });
    } finally {
      busy = false;
    }
  }

  function setAutoPoll(enabled) {
    autoPollEnabled = Boolean(enabled);
    if (autoPollEnabled) {
      lastAutoFingerprint = '';
    }
    return state;
  }

  function reset() {
    lastAutoFingerprint = '';
    lastAutoAppliedSignature = '';
    accumulatedStates.clear();
    return publish({
      id: '',
      status: 'idle',
      source: 'none',
      message: '',
      progress: 0,
      stageLabel: '',
      complete: false,
      bannedCovenants: [],
      seenCovenants: [],
      missingCovenants: [],
    });
  }

  const handlers = {
    'covenant-ocr-get': () => state,
    'covenant-ocr-window': () => manualScan('window'),
    'covenant-ocr-clipboard': () => manualScan('clipboard'),
    'covenant-ocr-auto': (flag) => setAutoPoll(flag),
    'covenant-ocr-reset': () => reset(),
  };

  for (const [channel, handle] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, value) => {
      if (mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || !event.senderFrame.url.startsWith('prts://app/')) throw new Error('Forbidden');
      return handle(value);
    });
  }

  if (globalShortcut) {
    try {
      state.shortcutAvailable = globalShortcut.register(SHORTCUT, () => { void manualScan('window'); });
    } catch {
      state.shortcutAvailable = false;
    }
  }

  pollTimer = setInterval(() => { void pollOnce(); }, autoPollMs);
  pollTimer.unref?.();

  return {
    pollOnce,
    dispose() {
      disposed = true;
      clearInterval(pollTimer);
      runner.stop();
      try { globalShortcut?.unregister(SHORTCUT); } catch { /* ignore */ }
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    },
  };
}

module.exports = {
  CORE_COVENANTS,
  SUB_COVENANTS,
  COVENANT_NAMES,
  PS_WINRT_OCR_SCRIPT,
  classifyCircleBgra,
  classifyBadgeBgra,
  looksLikeCovenantScreen,
  extractCovenantBoxesFromLine,
  probeBottomSixSubBadges,
  evaluateOcrLines,
  mergeCovenantScanResult,
  createWinRtOcrRunner,
  isArknightsWindowName,
  isMumuEmulatorWindowName,
  isLdplayerEmulatorWindowName,
  pickGameCaptureWindow,
  installCovenantOcr,
};
