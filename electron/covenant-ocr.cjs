// 青逝痕 Tenkinoko 制作
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const COVENANT_NAMES = [
  '炎', '萨尔贡', '阿戈尔', '叙拉古', '卡西米尔', '维多利亚', '谢拉格', '乌萨斯', '伊比利亚', '莱塔尼亚',
  '精准', '远见', '投资人', '突袭', '不屈', '调和', '协防干员', '独行', '绝技', '聚合', '奥术', '迅捷', '灵巧', '坚守', '助力', '奇迹',
];
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
  try {
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
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
    try {
      $scale = if ($src.Width -lt 1800) { 2.0 } else { 1.0 }
      $scaled = if ($scale -gt 1.0) {
        $b = [System.Drawing.Bitmap]::new([int]($src.Width * $scale), [int]($src.Height * $scale))
        $g = [System.Drawing.Graphics]::FromImage($b)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($src, 0, 0, $b.Width, $b.Height)
        $g.Dispose()
        $b
      } else { $src }
      $lines = @(Run-OcrOnBitmap $scaled (1.0 / $scale) 0 0 0)
      if ($scaled -ne $src) { $scaled.Dispose() }

      # 补扫最左列单字/双字盟约（如“炎”、“精准”、“聚合”在紧贴左边缘时易被整页版面切掉）
      $cropW = [Math]::Max(40, [int]($src.Width * 0.16))
      $cropY = [int]($src.Height * 0.28)
      $cropH = [Math]::Max(40, [int]($src.Height * 0.68))
      if ($cropY + $cropH -gt $src.Height) { $cropH = $src.Height - $cropY }
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
      $extra = @(Run-OcrOnBitmap $leftBmp (1.0 / $subScale) 0 $cropY $pad)
      $leftBmp.Dispose()

      $allLines = @($lines) + @($extra)
      $resp = @{ id = $reqId; width = $src.Width; height = $src.Height; lines = $allLines } | ConvertTo-Json -Compress -Depth 6
      [Console]::Out.WriteLine($resp)
    } finally {
      $src.Dispose()
      $inStream.Dispose()
    }
  } catch {
    $err = @{ id = $reqId; error = $_.Exception.Message } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($err)
  }
}
`;

function classifyBadgeBgra(bgra, width, height, box) {
  const textHeight = box.bottom - box.top;
  if (textHeight < 8 || textHeight > height * 0.075) return 0;
  const cx = (box.left + box.right) / 2;
  const cy = box.top - 2.8 * textHeight;
  const radius = 1.65 * textHeight;
  if (cx - radius < 0 || cy - radius < 0 || cx + radius >= width || cy + radius >= height) return 0;
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

function looksLikeCovenantScreen(bgra, width, height) {
  if (width < 480 || height < 270) return { match: false, fingerprint: '' };
  let total = 0;
  let emerald = 0;
  let dark = 0;
  let hash = 2166136261;
  const stepX = Math.max(8, Math.floor(width / 96));
  const stepY = Math.max(8, Math.floor(height / 54));
  const yMin = Math.floor(height * 0.16);
  const yMax = Math.floor(height * 0.88);
  const xMax = Math.floor(width * 0.78);
  for (let y = yMin; y < yMax; y += stepY) {
    for (let x = 16; x < xMax; x += stepX) {
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
    '迅漣': '迅捷', '迅连': '迅捷', '谌和': '调和', '周和': '调和',
    '精淮': '精准', '奇迹': '奇迹', '聚台': '聚合', '独仃': '独行',
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
    const h = Math.max(8, item.bottom - item.top);
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

function evaluateOcrLines(lines, bgra, width, height) {
  const states = new Map();
  let headerConfirmed = false;
  const flatText = (lines || []).map(words => (words || []).map(w => w.t).join('')).join(' ');
  if (/确认.?局信息|核心盟约|附加盟约/.test(flatText)) headerConfirmed = true;

  for (const words of lines || []) {
    for (const { name, box } of extractCovenantBoxesFromLine(words)) {
      const state = classifyBadgeBgra(bgra, width, height, box);
      if (state !== 0) {
        if (!states.has(name)) states.set(name, new Set());
        states.get(name).add(state);
      }
    }
  }
  const seenCovenants = COVENANT_NAMES.filter(name => states.get(name)?.size === 1);
  const bannedCovenants = seenCovenants.filter(name => states.get(name).has(-1));
  const missingCovenants = COVENANT_NAMES.filter(name => !seenCovenants.includes(name));
  return {
    headerConfirmed,
    seenCovenants,
    bannedCovenants,
    missingCovenants,
    complete: seenCovenants.length === COVENANT_NAMES.length,
  };
}

function createWinRtOcrRunner() {
  let child;
  let pending;
  const encoded = Buffer.from(PS_WINRT_OCR_SCRIPT, 'utf16le').toString('base64');

  function stop() {
    const prev = child;
    child = undefined;
    prev?.kill();
    if (pending) {
      const job = pending;
      pending = undefined;
      clearTimeout(job.timer);
      job.reject(new Error('OCR 进程已停止'));
    }
  }

  function ensure() {
    if (child) return child;
    const proc = spawn('powershell.exe', [
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
        if (!pending || msg.id !== pending.id) continue;
        const job = pending;
        pending = undefined;
        clearTimeout(job.timer);
        if (msg.error) job.reject(new Error(msg.error));
        else job.resolve(msg);
      }
    });
    return proc;
  }

  function recognizePng(pngBuffer) {
    const proc = ensure();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { stop(); reject(new Error('本机 OCR 识别超时，请重试。')); }, 20_000);
      pending = { id, resolve, reject, timer };
      proc.stdin.write(JSON.stringify({ id, image: pngBuffer.toString('base64') }) + '\n');
    });
  }

  return { recognizePng, stop };
}

function isArknightsWindowName(name) {
  const text = String(name || '').trim();
  return text === '明日方舟' || /^Arknights\b/i.test(text) || /明日方舟.*MuMu|MuMu.*明日方舟/i.test(text);
}

function installCovenantOcr({ mainWindow, ipcMain, desktopCapturer, clipboard, globalShortcut }) {
  const runner = createWinRtOcrRunner();
  let disposed = false;
  let busy = false;
  let autoPollEnabled = true;
  let lastAutoFingerprint = '';
  let lastAutoAppliedSignature = '';
  let pollTimer;

  let state = {
    id: '',
    status: 'idle',
    source: 'none',
    message: '',
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

  async function captureGameOrScreen(allowScreenFallback) {
    const ownHandle = mainWindow.getMediaSourceId().split(':')[1];
    const windows = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    const gameWin = windows.find(s => !(s.id.startsWith('window:') && s.id.split(':')[1] === ownHandle) && isArknightsWindowName(s.name));
    if (gameWin && !gameWin.thumbnail.isEmpty()) {
      return { image: gameWin.thumbnail, label: gameWin.name, isWindow: true };
    }
    if (!allowScreenFallback) return null;
    const screens = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
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
      const captured = await captureGameOrScreen(false);
      if (!captured) return;
      const size = captured.image.getSize();
      if (Math.min(size.width, size.height) < 200) return;
      const bgra = captured.image.toBitmap();
      const gate = looksLikeCovenantScreen(bgra, size.width, size.height);
      if (!gate.match || gate.fingerprint === lastAutoFingerprint) return;
      lastAutoFingerprint = gate.fingerprint;

      const ocr = await runner.recognizePng(captured.image.toPNG());
      const result = evaluateOcrLines(ocr.lines, bgra, size.width, size.height);
      const validOpening = result.complete || (result.headerConfirmed && result.seenCovenants.length >= 16);
      if (!validOpening) return;

      const signature = `${result.seenCovenants.length}:${result.bannedCovenants.join(',')}`;
      if (signature === lastAutoAppliedSignature) return;
      lastAutoAppliedSignature = signature;

      publish({
        id: `ocr-auto-${Date.now()}`,
        status: result.complete ? 'ready' : 'incomplete',
        source: 'auto',
        complete: result.complete,
        bannedCovenants: result.bannedCovenants,
        seenCovenants: result.seenCovenants,
        missingCovenants: result.missingCovenants,
        message: result.complete
          ? `已从开局画面自动识别 ${result.bannedCovenants.length} 项受限盟约（${result.bannedCovenants.join('、') || '本局无受限'}）。`
          : `已从开局画面自动识别 ${result.bannedCovenants.length} 项受限盟约（读到 ${result.seenCovenants.length}/26 项，建议核对未遮挡项）。`,
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
      message: mode === 'clipboard' ? '正在识别剪贴板截图中的盟约…' : '正在截取游戏画面识别本局禁选…',
    });
    try {
      let image;
      if (mode === 'clipboard') {
        image = clipboard.readImage();
        if (!image || image.isEmpty()) {
          throw new Error('剪贴板中没有截图，请先按 Win+Shift+S 截图后再粘贴识别。');
        }
      } else {
        const captured = await captureGameOrScreen(true);
        if (!captured) throw new Error('未找到明日方舟窗口或可用屏幕画面。');
        image = captured.image;
      }
      const result = await recognizeNativeImage(image);
      if (result.seenCovenants.length === 0) {
        throw new Error('未在画面中识别到盟约总览，请确认游戏处于「1/3 确认本局信息」界面且未被遮挡。');
      }
      lastAutoAppliedSignature = `${result.seenCovenants.length}:${result.bannedCovenants.join(',')}`;
      return publish({
        id,
        status: result.complete ? 'ready' : 'incomplete',
        source: mode === 'clipboard' ? 'clipboard' : 'manual',
        complete: result.complete,
        bannedCovenants: result.bannedCovenants,
        seenCovenants: result.seenCovenants,
        missingCovenants: result.missingCovenants,
        message: result.complete
          ? `OCR 已读全 26 项，识别到 ${result.bannedCovenants.length} 项受限盟约（${result.bannedCovenants.join('、') || '无受限'}）。`
          : `OCR 已识别 ${result.bannedCovenants.length} 项受限盟约（已读 ${result.seenCovenants.length}/26 项；待核对：${result.missingCovenants.slice(0, 6).join('、')}${result.missingCovenants.length > 6 ? '…' : ''}）。`,
      });
    } catch (err) {
      return publish({
        id,
        status: 'error',
        source: mode === 'clipboard' ? 'clipboard' : 'manual',
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
    return publish({
      id: '',
      status: 'idle',
      source: 'none',
      message: '',
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

  pollTimer = setInterval(() => { void pollOnce(); }, AUTO_POLL_MS);
  pollTimer.unref?.();

  return {
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
  COVENANT_NAMES,
  classifyBadgeBgra,
  looksLikeCovenantScreen,
  extractCovenantBoxesFromLine,
  evaluateOcrLines,
  createWinRtOcrRunner,
  installCovenantOcr,
};
