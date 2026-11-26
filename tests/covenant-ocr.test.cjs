const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  CORE_COVENANTS,
  SUB_COVENANTS,
  COVENANT_NAMES,
  PS_WINRT_OCR_SCRIPT,
  classifyBadgeBgra,
  looksLikeCovenantScreen,
  evaluateOcrLines,
  probeBottomSixSubBadges,
  mergeCovenantScanResult,
  createWinRtOcrRunner,
  installCovenantOcr,
} = require('../electron/covenant-ocr.cjs');

function createDarkBgra(width, height) {
  const bgra = Buffer.alloc(width * height * 4, 0);
  for (let i = 0; i < width * height; i++) {
    bgra[i * 4] = 24;
    bgra[i * 4 + 1] = 22;
    bgra[i * 4 + 2] = 18;
    bgra[i * 4 + 3] = 255;
  }
  return bgra;
}

function paintCircle(bgra, width, height, cx, cy, r, b, g, red) {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(width - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const off = (y * width + x) * 4;
        bgra[off] = b;
        bgra[off + 1] = g;
        bgra[off + 2] = red;
      }
    }
  }
}

function paintBadge(bgra, width, height, cx, cy, r, isBanned) {
  if (isBanned) {
    paintCircle(bgra, width, height, cx, cy, r, 78, 80, 76);
    paintCircle(bgra, width, height, cx, cy, Math.max(3, r * 0.32), 165, 165, 165);
  } else {
    paintCircle(bgra, width, height, cx, cy, r, 175, 225, 20);
  }
}

test('classifyBadgeBgra supports textHeight >= 6 and multi-offset sampling across 16:9 and 20:9 aspect ratios', () => {
  const width = 1600;
  const height = 720;
  for (const ratio of [2.25, 2.8, 3.15, 3.85, 4.35]) {
    for (const th of [6, 20]) {
      const bgra = createDarkBgra(width, height);
      const top = 360;
      const radius = th * 2.3;
      const cy = top - th * ratio;
      paintBadge(bgra, width, height, 300, cy, radius, false);
      paintBadge(bgra, width, height, 600, cy, radius, true);
      assert.equal(classifyBadgeBgra(bgra, width, height, { left: 280, top, right: 320, bottom: top + th }), 1);
      assert.equal(classifyBadgeBgra(bgra, width, height, { left: 580, top, right: 620, bottom: top + th }), -1);
      assert.equal(classifyBadgeBgra(bgra, width, height, { left: 900, top, right: 940, bottom: top + th }), 0);
    }
  }
  const small = createDarkBgra(400, 300);
  paintBadge(small, 400, 300, 100, 80, 12, false);
  assert.equal(classifyBadgeBgra(small, 400, 300, { left: 90, top: 94, right: 110, bottom: 99 }), 0);
});

test('probeBottomSixSubBadges infers uniform bottom 6 sub-badges and refuses mixed or blank rows', () => {
  const width = 1800;
  const height = 900;
  const x0 = 260;
  const dx = 120;
  const top1 = 520;
  const th = 22;
  const row1 = SUB_COVENANTS.slice(0, 10).map((name, i) => ({
    name,
    cx: x0 + i * dx,
    top: top1,
    th,
  }));
  const missing6 = SUB_COVENANTS.slice(10);
  const cy2 = top1 + th * 6.8;
  const r2 = th * 2.4;

  const greyBgra = createDarkBgra(width, height);
  for (let k = 0; k < 6; k++) paintBadge(greyBgra, width, height, x0 + k * dx, cy2, r2, true);
  const greyRes = probeBottomSixSubBadges(greyBgra, width, height, row1, missing6, x0);
  assert.equal(Object.keys(greyRes).length, 6);
  assert.equal(greyRes['奥术'], -1);
  assert.equal(greyRes['奇迹'], -1);

  const greenBgra = createDarkBgra(width, height);
  for (let k = 0; k < 6; k++) paintBadge(greenBgra, width, height, x0 + k * dx, cy2, r2, false);
  const greenRes = probeBottomSixSubBadges(greenBgra, width, height, row1, missing6, x0);
  assert.equal(Object.keys(greenRes).length, 6);
  assert.equal(greenRes['迅捷'], 1);

  const mixedBgra = Buffer.from(greyBgra);
  paintBadge(mixedBgra, width, height, x0 + 2 * dx, cy2, r2, false);
  assert.deepEqual(probeBottomSixSubBadges(mixedBgra, width, height, row1, missing6, x0), {});
  assert.deepEqual(probeBottomSixSubBadges(createDarkBgra(width, height), width, height, row1, missing6, x0), {});
});

function buildStandardScreen(bannedSet, { header = '1/3 确认本局信息', includeBottomSix = true, subset = null } = {}) {
  const width = 1800;
  const height = 960;
  const bgra = createDarkBgra(width, height);
  const th = 22;
  const x0 = 220;
  const dx = 130;
  const coreY = 260;
  const subRow1Y = 520;
  const subRow2Y = 670;
  const lines = [[{ t: header, x: 100, y: 40, w: 220, h: 24 }]];

  const isIncluded = (name) => !subset || subset.includes(name);
  const addItems = (names, y) => {
    const words = [];
    names.forEach((name, idx) => {
      if (!isIncluded(name)) return;
      const cx = x0 + idx * dx;
      const banned = bannedSet.has(name);
      paintBadge(bgra, width, height, cx, y - 2.8 * th, 1.65 * th, banned);
      const w = name.length * 20;
      words.push({ t: name, x: cx - w / 2, y, w, h: th });
    });
    if (words.length) lines.push(words);
  };

  addItems(CORE_COVENANTS, coreY);
  addItems(SUB_COVENANTS.slice(0, 10), subRow1Y);
  if (includeBottomSix) {
    addItems(SUB_COVENANTS.slice(10), subRow2Y);
  }
  return { bgra, width, height, lines };
}

test('evaluateOcrLines handles standard 26-covenant scan, quick-mode 18/18 auto-completion, and solo bottom-6 probe', () => {
  // 1. Standard 26-covenant scan
  const stdBans = new Set(['萨尔贡', '维多利亚', '奥术', '奇迹']);
  const std = buildStandardScreen(stdBans);
  const stdRes = evaluateOcrLines(std.lines, std.bgra, std.width, std.height);
  assert.equal(stdRes.complete, true);
  assert.equal(stdRes.seenCovenants.length, 26);
  assert.deepEqual(stdRes.missingCovenants, []);
  assert.deepEqual(stdRes.bannedCovenants, ['萨尔贡', '维多利亚', '奥术', '奇迹']);

  // 2. Quick mode (极速模拟): 8 core + 10 sub = 18 visible -> complete: true and missing 8 marked banned
  const quickPool = [...CORE_COVENANTS.slice(0, 8), ...SUB_COVENANTS.slice(0, 10)];
  const quickBansOnScreen = new Set(['乌萨斯', '精准']);
  const quick = buildStandardScreen(quickBansOnScreen, { header: '极速模拟 1/3 确认本局信息', subset: quickPool });
  const quickRes = evaluateOcrLines(quick.lines, quick.bgra, quick.width, quick.height);
  assert.equal(quickRes.isQuickMode, true);
  assert.equal(quickRes.complete, true);
  assert.equal(quickRes.seenCovenants.length, 26);
  assert.deepEqual(quickRes.missingCovenants, []);
  for (const name of ['乌萨斯', '精准', '伊比利亚', '莱塔尼亚', '奥术', '迅捷', '灵巧', '坚守', '助力', '奇迹']) {
    assert.ok(quickRes.bannedCovenants.includes(name), `${name} should be banned in quick mode`);
  }
  assert.ok(!quickRes.bannedCovenants.includes('炎'));

  // 3. Solo mode (单人模拟 / 规程等级): top 20 recognized + bottom 6 uniform badges without text labels -> auto-completed to 26!
  const soloBans = new Set(['炎', '奥术', '迅捷', '灵巧', '坚守', '助力', '奇迹']);
  const soloWithCircles = buildStandardScreen(soloBans, { header: '单人模拟 规程等级15', includeBottomSix: false });
  const bottomY = 520 + 22 * 6.8;
  for (let k = 0; k < 6; k++) {
    paintBadge(soloWithCircles.bgra, soloWithCircles.width, soloWithCircles.height, 220 + k * 130, bottomY, 22 * 2.4, true);
  }
  const soloProbedRes = evaluateOcrLines(soloWithCircles.lines, soloWithCircles.bgra, soloWithCircles.width, soloWithCircles.height);
  assert.equal(soloProbedRes.isSoloMode, true);
  assert.equal(soloProbedRes.complete, true);
  assert.equal(soloProbedRes.seenCovenants.length, 26);
  assert.deepEqual(soloProbedRes.bannedCovenants, ['炎', '奥术', '迅捷', '灵巧', '坚守', '助力', '奇迹']);
});

test('installCovenantOcr accumulates solo two-screen scans, prompts to scroll, and resets cleanly on reset/new-match/rescan', async () => {
  const screen1 = buildStandardScreen(new Set(['炎', '精准']), { header: '单人模拟 规程等级15', includeBottomSix: false });
  const screen2 = buildStandardScreen(new Set(['炎', '精准', '奥术', '奇迹']), {
    header: '附加盟约',
    subset: SUB_COVENANTS.slice(10),
  });
  const match2Full = buildStandardScreen(new Set(['萨尔贡', '卡西米尔']), { header: '1/3 确认本局信息' });

  let currentScreen = screen1;
  const makeFakeImg = (scr) => ({
    isEmpty: () => false,
    getSize: () => ({ width: scr.width, height: scr.height }),
    toBitmap: () => scr.bgra,
    toPNG: () => Buffer.from(JSON.stringify({ id: scr === screen1 ? 1 : scr === screen2 ? 2 : 3 })),
  });

  const sent = [];
  const handlers = new Map();
  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.getMediaSourceId = () => 'window:99:0';
  fakeMain.webContents = {
    mainFrame: { url: 'prts://app/' },
    send: (ch, payload) => { if (ch === 'covenant-ocr-state') sent.push(payload); },
  };
  const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };

  const ocr = installCovenantOcr({
    mainWindow: fakeMain,
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    desktopCapturer: {
      getSources: async ({ types }) => {
        if (types.includes('window')) {
          return [{ id: 'window:2:0', name: '明日方舟', thumbnail: makeFakeImg(currentScreen) }];
        }
        return [];
      },
    },
    clipboard: { readImage: () => makeFakeImg(currentScreen) },
    globalShortcut: null,
    ocrRunner: {
      recognizePng: async (pngBuf) => {
        const key = JSON.parse(pngBuf.toString('utf8')).id;
        return { lines: key === 1 ? screen1.lines : key === 2 ? screen2.lines : match2Full.lines };
      },
      stop: () => {},
    },
    autoPollMs: 60_000,
  });

  try {
    // 1. Scan screen 1 (20/26) -> incomplete with scroll guidance
    const res1 = await handlers.get('covenant-ocr-window')(senderEvent);
    assert.equal(res1.status, 'incomplete');
    assert.equal(res1.complete, false);
    assert.equal(res1.seenCovenants.length, 20);
    assert.deepEqual(res1.missingCovenants, SUB_COVENANTS.slice(10));
    assert.match(res1.message, /已识别 20\/26.*向下滚动/);

    // 2. Scroll down and scan screen 2 (6/26) -> merges to 26/26 ready!
    currentScreen = screen2;
    const res2 = await handlers.get('covenant-ocr-window')(senderEvent);
    assert.equal(res2.status, 'ready');
    assert.equal(res2.complete, true);
    assert.equal(res2.seenCovenants.length, 26);
    assert.deepEqual(res2.bannedCovenants, ['炎', '精准', '奥术', '奇迹']);

    // 3. Re-scan after complete with screen 1 -> resets previous complete state cleanly!
    currentScreen = screen1;
    const res3 = await handlers.get('covenant-ocr-window')(senderEvent);
    assert.equal(res3.status, 'incomplete');
    assert.equal(res3.complete, false);
    assert.equal(res3.seenCovenants.length, 20);
    assert.deepEqual(res3.bannedCovenants, ['炎', '精准']);

    // 4. New match conflicts (>= 2 flips or complete+conflict) -> resets accumulated state cleanly!
    currentScreen = match2Full;
    const res4 = await handlers.get('covenant-ocr-window')(senderEvent);
    assert.equal(res4.status, 'ready');
    assert.deepEqual(res4.bannedCovenants, ['萨尔贡', '卡西米尔']);

    // 5. Explicit reset clears state
    const cleared = handlers.get('covenant-ocr-reset')(senderEvent);
    assert.equal(cleared.status, 'idle');
    assert.deepEqual(cleared.seenCovenants, []);

    // Direct merge helper conflict-reset check when incomplete -> new match screen 1
    const acc = new Map(Object.entries(evaluateOcrLines(screen1.lines, screen1.bgra, screen1.width, screen1.height).stateByName));
    const altMatchPart = buildStandardScreen(new Set(['萨尔贡', '卡西米尔']), { header: '单人模拟', includeBottomSix: false });
    const altEval = evaluateOcrLines(altMatchPart.lines, altMatchPart.bgra, altMatchPart.width, altMatchPart.height);
    const mergedAlt = mergeCovenantScanResult(acc, altEval);
    assert.equal(mergedAlt.seenCovenants.length, 20);
    assert.deepEqual(mergedAlt.bannedCovenants, ['萨尔贡', '卡西米尔']);
  } finally {
    ocr.dispose();
  }
});

function downsampleBgra(srcBgra, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4, 0);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * srcH / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * srcW / dstW));
      const sOff = (sy * srcW + sx) * 4;
      const dOff = (y * dstW + x) * 4;
      out[dOff] = srcBgra[sOff];
      out[dOff + 1] = srcBgra[sOff + 1];
      out[dOff + 2] = srcBgra[sOff + 2];
      out[dOff + 3] = srcBgra[sOff + 3];
    }
  }
  return out;
}

test('looksLikeCovenantScreen supports 320x180 thumbnail gating and two-stage capture skips 1080p on non-covenant frames', async () => {
  const std = buildStandardScreen(new Set(['萨尔贡', '维多利亚']));
  const thumb320 = downsampleBgra(std.bgra, std.width, std.height, 320, 180);
  const thumb240 = downsampleBgra(std.bgra, std.width, std.height, 240, 135);
  const thumb480 = downsampleBgra(std.bgra, std.width, std.height, 480, 270);
  const dark320 = createDarkBgra(320, 180);

  assert.equal(looksLikeCovenantScreen(thumb320, 320, 180).match, true);
  assert.equal(looksLikeCovenantScreen(thumb240, 240, 135).match, true);
  assert.equal(looksLikeCovenantScreen(thumb480, 480, 270).match, true);
  assert.equal(looksLikeCovenantScreen(std.bgra, std.width, std.height).match, true);
  assert.equal(looksLikeCovenantScreen(dark320, 320, 180).match, false);
  assert.equal(looksLikeCovenantScreen(thumb240, 239, 135).match, false);
  assert.equal(looksLikeCovenantScreen(createDarkBgra(200, 120), 200, 120).match, false);

  const captureRequests = [];
  let recognizeCalls = 0;
  let activeIsCovenant = false;

  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.getMediaSourceId = () => 'window:99:0';
  fakeMain.webContents = {
    mainFrame: { url: 'prts://app/' },
    send: () => {},
  };
  const handlers = new Map();

  const ocr = installCovenantOcr({
    mainWindow: fakeMain,
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    desktopCapturer: {
      getSources: async ({ thumbnailSize }) => {
        captureRequests.push(thumbnailSize);
        const w = thumbnailSize.width;
        const h = thumbnailSize.height;
        const bgra = activeIsCovenant
          ? (w === std.width && h === std.height ? std.bgra : downsampleBgra(std.bgra, std.width, std.height, w, h))
          : createDarkBgra(w, h);
        return [{
          id: 'window:2:0',
          name: '明日方舟',
          thumbnail: {
            isEmpty: () => false,
            getSize: () => ({ width: w, height: h }),
            toBitmap: () => bgra,
            toPNG: () => Buffer.from('hd'),
          },
        }];
      },
    },
    clipboard: { readImage: () => ({ isEmpty: () => true }) },
    globalShortcut: null,
    ocrRunner: {
      recognizePng: async () => {
        recognizeCalls++;
        return { lines: std.lines };
      },
      stop: () => {},
    },
    autoPollMs: 60_000,
  });

  try {
    // 1. Non-covenant frame: only 320x180 requested, 1920x1080 & WinRT OCR skipped
    await ocr.pollOnce();
    assert.deepEqual(captureRequests, [{ width: 320, height: 180 }]);
    assert.equal(recognizeCalls, 0);

    // 2. Covenant frame appears: 320x180 gate hits -> upgrades to 1920x1080 -> 1 OCR call
    activeIsCovenant = true;
    await ocr.pollOnce();
    assert.deepEqual(captureRequests, [
      { width: 320, height: 180 },
      { width: 320, height: 180 },
      { width: 1920, height: 1080 },
    ]);
    assert.equal(recognizeCalls, 1);

    // 3. Unchanged screen on next poll: only 320x180 requested, skips 1920x1080 & OCR
    await ocr.pollOnce();
    assert.deepEqual(captureRequests.slice(3), [{ width: 320, height: 180 }]);
    assert.equal(recognizeCalls, 1);

    // 4. Manual window scan goes directly to 1920x1080
    const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };
    await handlers.get('covenant-ocr-window')(senderEvent);
    assert.deepEqual(captureRequests.slice(4), [{ width: 1920, height: 1080 }]);
    assert.equal(recognizeCalls, 2);
  } finally {
    ocr.dispose();
  }
});

test('createWinRtOcrRunner serializes concurrent recognizePng requests and rejects all on stop()', async () => {
  const written = [];
  let killed = 0;
  let fakeProc = null;

  const runner = createWinRtOcrRunner({
    timeoutMs: 5_000,
    spawnFn: () => {
      fakeProc = new EventEmitter();
      fakeProc.stdout = new EventEmitter();
      fakeProc.stdout.setEncoding = () => {};
      fakeProc.stdin = new EventEmitter();
      fakeProc.stdin.write = (line) => {
        written.push(JSON.parse(line.trim()));
        return true;
      };
      fakeProc.kill = () => {
        killed++;
      };
      return fakeProc;
    },
  });

  // 1. Concurrent calls queue serially instead of clobbering pending
  const p1 = runner.recognizePng(Buffer.from('img1'));
  const p2 = runner.recognizePng(Buffer.from('img2'));
  const p3 = runner.recognizePng(Buffer.from('img3'));

  assert.equal(written.length, 1);
  assert.equal(Buffer.from(written[0].image, 'base64').toString('utf8'), 'img1');

  // Mismatched reqId line must be ignored
  fakeProc.stdout.emit('data', JSON.stringify({ id: 'wrong-id', lines: [] }) + '\n');
  assert.equal(written.length, 1);

  // Resolve req1 -> dispatches req2
  fakeProc.stdout.emit('data', JSON.stringify({ id: written[0].id, lines: [[{ t: '炎', x: 1, y: 1, w: 10, h: 10 }]] }) + '\n');
  const r1 = await p1;
  assert.equal(r1.lines[0][0].t, '炎');
  assert.equal(written.length, 2);
  assert.equal(Buffer.from(written[1].image, 'base64').toString('utf8'), 'img2');

  // Calling stop() rejects both active (p2) and queued (p3) promises cleanly
  runner.stop();
  assert.equal(killed, 1);
  await assert.rejects(p2, /OCR 进程已停止/);
  await assert.rejects(p3, /OCR 进程已停止/);
});

test('PS_WINRT_OCR_SCRIPT disposes SoftwareBitmap/IDisposable decoder, encodes BMP, crops 0.80, and smart-skips rescue', () => {
  assert.match(PS_WINRT_OCR_SCRIPT, /\$soft\s*=\s*\$null[\s\S]*try[\s\S]*finally[\s\S]*if \(\$soft\) \{ \$soft\.Dispose\(\) \}/);
  assert.match(PS_WINRT_OCR_SCRIPT, /\$decoder\s*-is\s*\[System\.IDisposable\]/);
  assert.match(PS_WINRT_OCR_SCRIPT, /ImageFormat\]::Bmp/);
  assert.doesNotMatch(PS_WINRT_OCR_SCRIPT, /ImageFormat\]::Png/);
  assert.match(PS_WINRT_OCR_SCRIPT, /\$src\.Width\s*\*\s*0\.80/);
  assert.match(PS_WINRT_OCR_SCRIPT, /\$skipLeftRescue\s*=/);
});
