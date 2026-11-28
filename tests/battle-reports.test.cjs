const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const {
  diagnosticsDialogTitle,
  installBattleReports,
  latestSelfFinish,
  parseBondDetails,
  parseSourceMessage,
  parseUnknownDetails,
} = require('../electron/battle-reports.cjs');
const {
  detectConflictingNetworkApps,
  formatNpcapFailureMessage,
  inspectNpcapFailure,
  isWindows10OrOlder,
  parseMaxNumFilters,
  parseNpcapInstallLog,
  parsePnputilNpcapDrivers,
  parseSymlinkEvaluationDisabled,
  pickLatestNpcapInstaller,
  pickNpcapInstallerForOs,
  prepareNpcapEnvironment,
  runNpcapInstaller,
} = require('../electron/npcap-installer.cjs');
const {
  classifyBadgeBgra,
  evaluateOcrLines,
  extractCovenantBoxesFromLine,
  isArknightsWindowName,
  isLdplayerEmulatorWindowName,
  isMumuEmulatorWindowName,
  looksLikeCovenantScreen,
  pickGameCaptureWindow,
} = require('../electron/covenant-ocr.cjs');
const { installLanSync, isPrivateLanIp, verifyPin } = require('../electron/lan-sync.cjs');
const { computeMumuDrawerBounds, computeMumuHudBounds } = require('../electron/mumu-layout.cjs');
const { HUD_SCALES, defaultHudScaleForWorkArea, installHudOverlay, resolveHudDisplayWorkArea } = require('../electron/hud-overlay.cjs');

const loadProduct = (id) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'products', id, 'product.json'), 'utf8'));

test('diagnostic formats the latest local leak count as a number', () => {
  const finish = latestSelfFinish({
    5: { self_leaks: 2 },
    6: { self_leaks: 4, self_leak_enemies: [] },
  });

  assert.equal(finish.summary, 'R6 / 漏怪 4');
  assert.equal(finish.row.self_leaks, 4);
});

test('diagnostic leaves an unknown local settlement unclaimed', () => {
  assert.equal(latestSelfFinish({ 6: { self_leaks: null } }), undefined);
});

test('diagnostic parses message IDs and counts without packet contents', () => {
  assert.deepEqual(parseUnknownDetails('PRTS_REPORT_UNKNOWN 0 302 12 1 399 2'), [
    { direction: 'down', id: 302, count: 12 },
    { direction: 'up', id: 399, count: 2 },
  ]);
  assert.equal(parseUnknownDetails('PRTS_REPORT_UNKNOWN names are not diagnostic data'), undefined);
});

test('diagnostic parses PRTS_REPORT_BONDS 7B hex samples and renders them in diagnostics dialog', async () => {
  assert.deepEqual(
    parseBondDetails('PRTS_REPORT_BONDS 1:00000000001100,01020304050607 3:AABBCCDDEEFF00'),
    [
      { seat: 1, bonds: ['00000000001100', '01020304050607'] },
      { seat: 3, bonds: ['aabbccddeeff00'] },
    ],
  );
  assert.equal(parseBondDetails('PRTS_REPORT_BONDS 1:PlayerName'), undefined);
  assert.equal(parseBondDetails('PRTS_REPORT_BONDS 5:00000000001100'), undefined);

  const Module = require('node:module');
  const origLoad = Module._load;
  const dialogCalls = [];
  const handlers = new Map();
  let fakeChild;
  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'prts://app/' },
    send: () => {},
  });

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        clipboard: { writeText: () => {} },
        dialog: {
          showMessageBox: async (_win, opts) => {
            dialogCalls.push(opts);
            return { response: 1 };
          },
        },
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  const br = installBattleReports({
    app: { isPackaged: false, getAppPath: () => path.resolve(__dirname, '..') },
    mainWindow: fakeMain,
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    product: loadProduct('stronghold'),
    screenApi: null,
    spawnFn: () => {
      fakeChild = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => {},
      });
      return fakeChild;
    },
  });

  try {
    br.start();
    const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };
    // Before PRTS_REPORT_BONDS arrives -> no 盟约协议样本 line
    handlers.get('battle-reports-diagnostics')(senderEvent);
    assert.ok(dialogCalls.length === 1);
    assert.ok(!dialogCalls[0].detail.includes('盟约协议样本（7B hex）'));

    fakeChild.stderr.write('PRTS_REPORT_DIAG 5 4 10 8 3 0 0 0\n');
    fakeChild.stderr.write('PRTS_REPORT_BONDS 1:00000000001100,02000000000c01 2:00000000000000\n');
    await new Promise(r => setTimeout(r, 25));

    handlers.get('battle-reports-diagnostics')(senderEvent);
    assert.ok(dialogCalls.length === 2);
    assert.ok(dialogCalls[1].detail.includes('盟约协议样本（7B hex）：1号:00000000001100,02000000000c01 | 2号:00000000000000'));
  } finally {
    Module._load = origLoad;
    br.dispose();
  }
});

test('product manifests isolate stronghold and pure telemetry branding, IDs and workers', () => {
  const stronghold = loadProduct('stronghold');
  const telemetry = loadProduct('telemetry');

  assert.equal(stronghold.mode, 'full');
  assert.equal(telemetry.mode, 'telemetry');
  assert.notEqual(stronghold.desktop.appId, telemetry.desktop.appId);
  assert.notEqual(stronghold.android.package, telemetry.android.package);
  assert.equal(diagnosticsDialogTitle(stronghold), 'PRTS · 战报诊断');
  assert.equal(diagnosticsDialogTitle(telemetry), '卫戍战报仪 · 战报诊断');
  assert.equal(stronghold.reportBrand.exportPrefix, 'PRTS战报');
  assert.equal(telemetry.reportBrand.exportPrefix, '卫戍战报仪');
  assert.equal(stronghold.desktop.workerKind, 'report-only');
  assert.equal(stronghold.desktop.workerName, 'PRTS-Worker');
  assert.equal(telemetry.desktop.workerKind, 'report-only');
  assert.ok(!telemetry.publicAssetDirs.desktop.includes('community'));
  assert.ok(!telemetry.publicAssetDirs.desktop.includes('boss-routes'));
  assert.ok(!telemetry.publicAssetDirs.desktop.includes('strategies'));
  assert.ok(telemetry.publicAssetDirs.desktop.includes('avatars'));
  assert.ok(!telemetry.publicAssetDirs.android.includes('boss-routes'));
});

test('npcap installer picker selects highest numeric version from official directory HTML', () => {
  const html = `
    <a href="npcap-1.9.exe">npcap-1.9.exe</a>
    <a href="npcap-1.89.exe">npcap-1.89.exe</a>
    <a href="npcap-1.100.exe">npcap-1.100.exe</a>
    <a href="npcap-1.90.exe">npcap-1.90.exe</a>
  `;
  const latest = pickLatestNpcapInstaller(html);
  assert.deepEqual(latest, {
    version: '1.100',
    filename: 'npcap-1.100.exe',
    url: 'https://npcap.com/dist/npcap-1.100.exe',
  });
  assert.equal(pickLatestNpcapInstaller('no installers here'), null);
});

test('covenant OCR line extractor and BGRA badge classifier distinguish available and banned covenants', () => {
  const width = 500;
  const height = 300;
  const bgra = Buffer.alloc(width * height * 4, 0);
  // Fill dark slate background
  for (let i = 0; i < width * height; i++) {
    bgra[i * 4] = 24;
    bgra[i * 4 + 1] = 22;
    bgra[i * 4 + 2] = 18;
    bgra[i * 4 + 3] = 255;
  }
  const paintCircle = (cx, cy, r, b, g, red) => {
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
  };
  // “炎” at (60, 120, 14x14) -> badge center at (67, 80.8), glowing emerald
  paintCircle(67, 81, 28, 175, 225, 20);
  paintCircle(280, 180, 28, 175, 225, 20);
  // “维多利亚” at (160..216, 120, h=14) -> badge center at (188, 80.8), grey banned with white strokes
  paintCircle(188, 81, 26, 78, 80, 76);
  paintCircle(188, 81, 8, 160, 160, 160);

  const line = [
    { t: '炎', x: 60, y: 120, w: 14, h: 14 },
    { t: '维', x: 160, y: 120, w: 14, h: 14 },
    { t: '多', x: 174, y: 120, w: 14, h: 14 },
    { t: '利', x: 188, y: 120, w: 14, h: 14 },
    { t: '亚', x: 202, y: 120, w: 14, h: 14 },
  ];
  const boxes = extractCovenantBoxesFromLine(line);
  assert.deepEqual(boxes.map(b => b.name), ['炎', '维多利亚']);
  assert.equal(classifyBadgeBgra(bgra, width, height, boxes[0].box), 1);
  assert.equal(classifyBadgeBgra(bgra, width, height, boxes[1].box), -1);

  const evaluated = evaluateOcrLines([
    [{ t: '1/3确认本局信息', x: 100, y: 16, w: 120, h: 16 }],
    line,
  ], bgra, width, height);
  assert.equal(evaluated.headerConfirmed, true);
  assert.deepEqual(evaluated.seenCovenants, ['炎', '维多利亚']);
  assert.deepEqual(evaluated.bannedCovenants, ['维多利亚']);
  assert.equal(looksLikeCovenantScreen(bgra, width, height).match, true);
});

test('LAN sync restricts access to RFC1918/loopback IPs and enforces 4-digit PIN pairing', async () => {
  assert.equal(isPrivateLanIp('127.0.0.1'), true);
  assert.equal(isPrivateLanIp('::ffff:192.168.31.18'), true);
  assert.equal(isPrivateLanIp('10.0.4.12'), true);
  assert.equal(isPrivateLanIp('172.20.1.5'), true);
  assert.equal(isPrivateLanIp('8.8.8.8'), false);
  assert.equal(isPrivateLanIp('172.32.0.1'), false);
  assert.equal(isPrivateLanIp('192.169.0.1'), false);
  assert.equal(verifyPin('4829', '4829'), true);
  assert.equal(verifyPin('4829', '4820'), false);
  assert.equal(verifyPin('4829', '12'), false);

  const handlers = new Map();
  const fakeMain = {
    isDestroyed: () => false,
    mainFrame: { url: 'prts://app/' },
    webContents: {
      mainFrame: { url: 'prts://app/' },
      send: () => {},
    },
  };
  const fakeIpc = {
    handle: (name, fn) => handlers.set(name, fn),
  };
  const lan = installLanSync({ mainWindow: fakeMain, ipcMain: fakeIpc, product: loadProduct('stronghold') });
  const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };
  try {
    lan.updateGuideState({ bannedCovenants: ['炎', '奥术'], currentRound: 6, compTitle: '杜遥夜四本炎' });
    const started = await handlers.get('lan-sync-enable')(senderEvent, true);
    assert.equal(started.enabled, true);

    const badRes = await fetch(`http://127.0.0.1:${started.port}/api/v1/state?pin=0000`);
    assert.equal(badRes.status, 401);

    const okRes = await fetch(`http://127.0.0.1:${started.port}/api/v1/state?pin=${started.pin}`);
    assert.equal(okRes.status, 200);
    const body = await okRes.json();
    assert.equal(body.ok, true);
    assert.equal(body.guide.currentRound, 6);
    assert.deepEqual(body.guide.bannedCovenants, ['炎', '奥术']);
  } finally {
    lan.dispose();
  }
});

test('parseSourceMessage validates client source and converts MuMu coordinates to DIP with fallback', () => {
  assert.equal(parseSourceMessage({ kind: 'source', client: 'bad' }), null);
  assert.deepEqual(parseSourceMessage({ kind: 'source', client: 'pc', mumuWindow: { x: 1, y: 1, width: 800, height: 600 } }), {
    clientSource: 'pc',
    mumuWindow: null,
  });

  const dip = parseSourceMessage(
    {
      kind: 'source',
      client: 'mumu',
      mumuWindow: { title: '明日方舟 - MuMu模拟器12', x: 150, y: 90, width: 1920, height: 1080 },
    },
    {
      screenToDipRect: (_win, r) => ({
        x: Math.round(r.x / 1.5),
        y: Math.round(r.y / 1.5),
        width: Math.round(r.width / 1.5),
        height: Math.round(r.height / 1.5),
      }),
    },
  );
  assert.deepEqual(dip, {
    clientSource: 'mumu',
    mumuWindow: { title: '明日方舟 - MuMu模拟器12', x: 100, y: 60, width: 1280, height: 720 },
  });

  const fallback = parseSourceMessage(
    {
      kind: 'source',
      client: 'mumu',
      mumuWindow: { title: 'Arknights', x: 50, y: 40, width: 1280, height: 720 },
    },
    {
      screenToDipRect: () => { throw new Error('no screen'); },
    },
  );
  assert.deepEqual(fallback, {
    clientSource: 'mumu',
    mumuWindow: { title: 'Arknights', x: 50, y: 40, width: 1280, height: 720 },
  });
});

test('installBattleReports syncs worker source events and resets clientSource on pause', async () => {
  const published = [];
  const sentStates = [];
  const handlers = new Map();
  let fakeChild;

  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'prts://app/' },
    send: (channel, payload) => {
      if (channel === 'battle-reports-state') sentStates.push(payload);
    },
  });

  const br = installBattleReports({
    app: { isPackaged: false, getAppPath: () => path.resolve(__dirname, '..') },
    mainWindow: fakeMain,
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    product: loadProduct('stronghold'),
    onPublish: (state) => published.push(state),
    screenApi: null,
    spawnFn: () => {
      fakeChild = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => {},
      });
      return fakeChild;
    },
  });

  try {
    br.start();
    fakeChild.stdout.write(JSON.stringify({ kind: 'status', status: 'connecting' }) + '\n');
    fakeChild.stdout.write(JSON.stringify({
      kind: 'source',
      client: 'mumu',
      mumuWindow: { title: '明日方舟 - MuMu模拟器12', x: 10, y: 20, width: 1280, height: 720 },
    }) + '\n');
    await new Promise(r => setTimeout(r, 20));

    const latest = published.at(-1);
    assert.equal(latest.clientSource, 'mumu');
    assert.deepEqual(latest.mumuWindow, { title: '明日方舟 - MuMu模拟器12', x: 10, y: 20, width: 1280, height: 720 });
    assert.equal(sentStates.at(-1).clientSource, 'mumu');

    const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };
    const paused = handlers.get('battle-reports-enable')(senderEvent, false);
    assert.equal(paused.status, 'paused');
    assert.equal(paused.clientSource, 'none');
    assert.equal(paused.mumuWindow, null);
  } finally {
    br.dispose();
  }
});

test('mumu-layout computes outside-right, inside-right 28%, screen-right fallback, and HUD bounds', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

  // 1. Enough room on right -> outside-right
  const out = computeMumuDrawerBounds({
    mumuWindow: { x: 80, y: 60, width: 1280, height: 720 },
    workArea,
  });
  assert.equal(out.placement, 'outside-right');
  assert.deepEqual(out.bounds, { x: 1364, y: 60, width: 416, height: 720 });

  // 2. Full-width or edge-hugging MuMu -> inside-right 28% (clamped 390..440)
  const inside = computeMumuDrawerBounds({
    mumuWindow: { x: 0, y: 0, width: 1920, height: 1040 },
    workArea,
  });
  assert.equal(inside.placement, 'inside-right');
  assert.deepEqual(inside.bounds, { x: 1480, y: 0, width: 440, height: 1040 });

  const insideNarrow = computeMumuDrawerBounds({
    mumuWindow: { x: 640, y: 100, width: 1280, height: 720 },
    workArea,
  });
  assert.equal(insideNarrow.placement, 'inside-right');
  assert.deepEqual(insideNarrow.bounds, { x: 1530, y: 100, width: 390, height: 720 });

  // 3. Lite (460px drawer, minWidth 440) computes outside-right and inside-right 440px clamp
  const liteOut = computeMumuDrawerBounds({
    mumuWindow: { x: 40, y: 80, width: 1280, height: 720 },
    workArea,
    drawerWidth: 460,
    minWidth: 440,
    minHeight: 560,
  });
  assert.equal(liteOut.placement, 'outside-right');
  assert.deepEqual(liteOut.bounds, { x: 1324, y: 80, width: 460, height: 720 });

  const liteInside = computeMumuDrawerBounds({
    mumuWindow: { x: 0, y: 0, width: 1920, height: 1040 },
    workArea,
    drawerWidth: 460,
    minWidth: 440,
    minHeight: 560,
  });
  assert.equal(liteInside.placement, 'inside-right');
  assert.deepEqual(liteInside.bounds, { x: 1480, y: 0, width: 440, height: 1040 });

  // 4. No MuMu window -> screen-right fallback
  const fallback = computeMumuDrawerBounds({ mumuWindow: null, workArea });
  assert.equal(fallback.placement, 'screen-right');
  assert.deepEqual(fallback.bounds, { x: 1504, y: 0, width: 416, height: 1040 });

  // 4. HUD strip positioned near top center-right of MuMu, clamped inside workArea
  const hud = computeMumuHudBounds({
    mumuWindow: { x: 100, y: 40, width: 1280, height: 720 },
    workArea,
  });
  assert.equal(hud.width, 460);
  assert.equal(hud.height, 188);
  assert.ok(hud.x >= 100 && hud.x + hud.width <= 1920);
  assert.ok(hud.y >= 40 && hud.y + hud.height <= 1040);

  // 5. Window title recognition handles Arknights & MuMu 12 instance titles
  assert.equal(isArknightsWindowName('明日方舟'), true);
  assert.equal(isArknightsWindowName('MuMu模拟器12 - 明日方舟'), true);
  assert.equal(isArknightsWindowName('明日方舟 - MuMu模拟器'), true);
  assert.equal(isArknightsWindowName('MuMu Player 12 - Arknights'), true);
  assert.equal(isArknightsWindowName('MuMu模拟器12'), false);
  assert.equal(isMumuEmulatorWindowName('MuMu安卓设备-1'), true);
  assert.equal(isMumuEmulatorWindowName('MuMu模拟器12'), true);
  assert.equal(isMumuEmulatorWindowName('MuMu多开器'), false);
  assert.equal(isMumuEmulatorWindowName('MuMu游戏中心'), false);
  assert.equal(
    pickGameCaptureWindow([
      { id: 'window:1:0', name: 'PRTS Stronghold' },
      { id: 'window:2:0', name: 'MuMu多开器' },
      { id: 'window:3:0', name: 'MuMu安卓设备-1' },
    ], '1')?.name,
    'MuMu安卓设备-1',
  );
  assert.equal(
    pickGameCaptureWindow([
      { id: 'window:3:0', name: 'MuMu安卓设备-1' },
      { id: 'window:4:0', name: '明日方舟' },
    ], '1')?.name,
    '明日方舟',
  );
});

test('windows portable launcher patches away CopyFiles double-copy and uses versioned cache + single-instance lock', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const nsis = require('app-builder-lib/out/targets/nsis/nsisUtil.js');
  const { patchPortableNsiTemplate } = require('../scripts/package-windows.cjs');

  const stock = fs.readFileSync(path.join(nsis.nsisTemplatesDir, 'portable.nsi'), 'utf8');
  const patched = patchPortableNsiTemplate(stock);
  assert.ok(patched.includes('!include "prts-startup.nsh"'));
  assert.ok(patched.includes('!insertmacro PrtsPrepareApp'));
  assert.ok(patched.includes('Call PrtsRunApp'));
  assert.ok(!patched.includes('!insertmacro extractEmbeddedAppPackage'), 'should bypass stock 7z-out + CopyFiles loop');
  assert.ok(patched.includes('${If} $prtsCleanupInstDir == "1"'), 'keeps persistent cache dir on normal exit');

  const startupNsh = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'windows-startup.nsh'), 'utf8');
  assert.ok(startupNsh.includes('Nsis7z::Extract'));
  assert.ok(!/^\s*CopyFiles\b/m.test(startupNsh), 'must not call SHFileOperation CopyFiles');
  assert.ok(startupNsh.includes('GetDiskFreeSpaceExW'));
  assert.ok(startupNsh.includes('.prts-ready'));
  assert.ok(startupNsh.includes('ffmpeg.dll'), 'verifies core Chromium runtime DLL before trusting cache');
  assert.ok(startupNsh.includes('$9 < 3500') && startupNsh.includes('Delete "$INSTDIR\\.prts-ready"'), 'auto-invalidates cache marker when Electron crashes within 3.5s');

  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.ok(mainSource.includes('app.requestSingleInstanceLock()'));
  assert.ok(mainSource.includes("app.on('second-instance'"));
  assert.ok(mainSource.includes("render-process-gone"), 'recovers automatically on renderer crash');
  assert.ok(mainSource.includes("process.on('uncaughtException'"), 'prevents unhandled main-process crash popups');
  assert.ok(mainSource.includes('safeDisplayWorkArea'), 'guards screen display rect queries');

  const hudSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'hud-overlay.cjs'), 'utf8');
  assert.ok(hudSource.includes("render-process-gone"), 'HUD overlay recovers or closes cleanly without blocking game');
  assert.ok(hudSource.includes('readyShowTimer') && hudSource.includes('did-finish-load') && hudSource.includes('revealHudWindow'), 'HUD overlay has fallback reveal guard when ready-to-show is delayed');
});

test('worker supervisor auto-restarts on startup timeout and crash, then recovers cleanly via 1-click restart', async () => {
  const published = [];
  const handlers = new Map();
  const children = [];

  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'prts://app/' },
    send: () => {},
  });

  const br = installBattleReports({
    app: { isPackaged: false, getAppPath: () => path.resolve(__dirname, '..') },
    mainWindow: fakeMain,
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    product: loadProduct('stronghold'),
    onPublish: (state) => published.push({ ...state }),
    screenApi: null,
    startupTimeoutMs: 35,
    restartBaseDelayMs: 15,
    maxAutoRestarts: 2,
    healthyResetMs: 40,
    spawnFn: () => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        killed: false,
        kill() { this.killed = true; },
      });
      children.push(child);
      return child;
    },
  });

  const waitFor = async (predicate, timeoutMs = 500) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 15));
    }
  };

  try {
    // 1. Child #1 hangs during startup -> startupTimeoutMs triggers auto-restart #1
    br.start();
    assert.equal(children.length, 1);
    await waitFor(() => children.length >= 2);
    assert.equal(children[0].killed, true, 'hung child #1 should be terminated');
    assert.equal(children.length, 2, 'supervisor should spawn child #2');
    assert.ok(published.some(s => s.restarting === true && s.autoRestartCount === 1));

    // 2. Child #2 logs a stderr error and crashes -> triggers auto-restart #2
    children[1].stderr.write('RuntimeError: raw socket bind failed\n');
    await new Promise(r => setTimeout(r, 15));
    children[1].emit('close', 1);
    await waitFor(() => children.length >= 3);
    assert.equal(children.length, 3, 'supervisor should spawn child #3');
    assert.ok(published.some(s => s.restarting === true && s.autoRestartCount === 2));

    // 3. Child #3 also crashes -> exhausts maxAutoRestarts (2) -> enters failed with clear Chinese prompt
    children[2].stderr.write('WinError 10013 socket conflict\n');
    await new Promise(r => setTimeout(r, 15));
    children[2].emit('close', 1);
    const failedState = published.at(-1);
    assert.equal(failedState.status, 'failed');
    assert.equal(failedState.restarting, false);
    assert.ok(failedState.failureReason.includes('立即重启采集'), `unexpected failureReason: ${failedState.failureReason}`);
    assert.ok(failedState.failureReason.includes('WinError 10013'), `should include stderr tail: ${failedState.failureReason}`);

    // 4. User clicks 1-click restart (battle-reports-restart IPC) -> resets counter and recovers to listening
    const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };
    const restarted = handlers.get('battle-reports-restart')(senderEvent);
    assert.equal(children.length, 4, 'manual 1-click restart spawns child #4');
    assert.equal(restarted.status, 'starting');
    assert.equal(restarted.restarting, false);
    assert.equal(restarted.failureReason, '');

    children[3].stdout.write(JSON.stringify({ kind: 'status', status: 'listening' }) + '\n');
    await waitFor(() => published.at(-1)?.status === 'listening' && published.at(-1)?.autoRestartCount === 0);
    const healthy = published.at(-1);
    assert.equal(healthy.status, 'listening');
    assert.equal(healthy.autoRestartCount, 0);
    assert.equal(healthy.restarting, false);
    assert.equal(healthy.failureReason, '');
  } finally {
    br.dispose();
  }
});

test('worker supervisor fails fast without useless retries when antivirus quarantines PRTS-Worker.exe (ENOENT)', () => {
  const published = [];
  let spawnCalls = 0;
  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'prts://app/' },
    send: () => {},
  });

  const br = installBattleReports({
    app: { isPackaged: true, getAppPath: () => path.resolve(__dirname, '..') },
    mainWindow: fakeMain,
    ipcMain: { handle: () => {}, removeHandler: () => {} },
    product: loadProduct('stronghold'),
    onPublish: (state) => published.push({ ...state }),
    screenApi: null,
    restartBaseDelayMs: 10,
    maxAutoRestarts: 3,
    spawnFn: () => {
      spawnCalls += 1;
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => {},
      });
      process.nextTick(() => {
        const err = Object.assign(new Error('spawn PRTS-Worker.exe ENOENT'), { code: 'ENOENT' });
        child.emit('error', err);
      });
      return child;
    },
  });

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        assert.equal(spawnCalls, 1, 'ENOENT should not loop retries');
        const last = published.at(-1);
        assert.equal(last.status, 'failed');
        assert.equal(last.restarting, false);
        assert.equal(last.autoRestartCount, 0);
        assert.ok(last.failureReason.includes('PRTS-Worker.exe'));
        assert.ok(last.failureReason.includes('信任区'));
        br.dispose();
        resolve();
      } catch (err) {
        br.dispose();
        reject(err);
      }
    }, 45);
    br.start();
  });
});

test('corrupted worker stdout chunks and extreme window coordinates never throw or break state', async () => {
  const published = [];
  let fakeChild;
  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'prts://app/' },
    send: () => {},
  });

  const br = installBattleReports({
    app: { isPackaged: false, getAppPath: () => path.resolve(__dirname, '..') },
    mainWindow: fakeMain,
    ipcMain: { handle: () => {}, removeHandler: () => {} },
    product: loadProduct('stronghold'),
    onPublish: (state) => published.push({ ...state }),
    screenApi: null,
    spawnFn: () => {
      fakeChild = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => {},
      });
      return fakeChild;
    },
  });

  try {
    br.start();
    // Feed corrupted JSON, primitives, arrays, partial split chunks, and valid status
    fakeChild.stdout.write('not-json-at-all\nnull\n[]\n{"kind":"unknown"}\n{"kind":"status","status":"bogus"}\n');
    fakeChild.stdout.write('{"kind":"status","stat');
    fakeChild.stdout.write('us":"listening"}\n');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(published.at(-1).status, 'listening');

    // Extreme / malformed MuMu window rects
    assert.deepEqual(
      parseSourceMessage({ kind: 'source', client: 'mumu', mumuWindow: { x: NaN, y: 0, width: -50, height: 0 } }),
      { clientSource: 'mumu', mumuWindow: null },
    );
    const extremeDrawer = computeMumuDrawerBounds({
      mumuWindow: { x: -5000, y: -3000, width: 99999, height: 99999 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    });
    assert.ok(extremeDrawer.bounds.width >= 390 && extremeDrawer.bounds.width <= 1920);
    assert.ok(extremeDrawer.bounds.height >= 500 && extremeDrawer.bounds.height <= 1040);

    const extremeHud = computeMumuHudBounds({
      mumuWindow: { x: 99999, y: 99999, width: 200, height: 100 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    });
    assert.ok(extremeHud.x >= 0 && extremeHud.x + extremeHud.width <= 1920);
    assert.ok(extremeHud.y >= 0 && extremeHud.y + extremeHud.height <= 1040);
  } finally {
    br.dispose();
  }
});

test('HUD overlay exposes sm/md/lg presets, picks md on 2K displays, and persists scale changes', async () => {
  const os = require('node:os');
  assert.deepEqual(HUD_SCALES, {
    sm: { width: 500, height: 248 },
    md: { width: 580, height: 280 },
    lg: { width: 660, height: 316 },
  });
  assert.equal(defaultHudScaleForWorkArea({ width: 2560, height: 1400 }), 'md');
  assert.equal(defaultHudScaleForWorkArea({ width: 1440, height: 900 }), 'sm');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-hud-prefs-'));
  const handlers = {};
  const fakeMain = {
    isDestroyed: () => false,
    webContents: { mainFrame: { url: 'prts://app/' }, send: () => {} },
  };
  const overlay = installHudOverlay({
    app: { getPath: () => tmpDir },
    mainWindow: fakeMain,
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    globalShortcut: null,
    product: loadProduct('stronghold'),
  });
  try {
    const res = await handlers['hud-overlay-scale'](
      { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame },
      'lg',
    );
    assert.equal(res.scale, 'lg');
    assert.deepEqual(overlay.getScaleBounds(), { width: 660, height: 316 });
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'hud-prefs.json'), 'utf8'));
    assert.equal(saved.scale, 'lg');
  } finally {
    overlay.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Multi-monitor anchoring: HUD defaults to the monitor where mainWindow lives instead of always jumping to primary display
  const secondaryWorkArea = { x: 2048, y: 0, width: 1280, height: 672 };
  const primaryWorkArea = { x: 0, y: 0, width: 2048, height: 1104 };
  const fakeScreen = {
    getPrimaryDisplay: () => ({ workArea: primaryWorkArea }),
    getDisplayMatching: (rect) => ({ workArea: rect.x >= 2048 ? secondaryWorkArea : primaryWorkArea }),
  };
  const fakeSecondaryMain = {
    isDestroyed: () => false,
    getBounds: () => ({ x: 2100, y: 60, width: 1180, height: 600 }),
  };
  assert.deepEqual(
    resolveHudDisplayWorkArea({ screenApi: fakeScreen, mainWindow: fakeSecondaryMain }),
    secondaryWorkArea,
  );
  assert.deepEqual(
    resolveHudDisplayWorkArea({ screenApi: fakeScreen, mainWindow: null }),
    primaryWorkArea,
  );
});

test('parsePnputilNpcapDrivers handles EN/ZH pnputil output with strict Npcap allowlist and deduplication', () => {
  const sample = `
Microsoft PnP Utility

Published Name:     oem12.inf
Original Name:      npcap.inf
Provider Name:      Insecure.Com LLC.
Class Name:         NetService

Published Name:     oem14.inf
Original Name:      npcap.inf
Provider Name:      Nmap Project
Class Name:         NetService

Published Name:     oem15.inf
Original Name:      wintun.inf
Provider Name:      WireGuard LLC

Published Name:     oem16.inf
Original Name:      npcap.inf
Provider Name:      SomeOtherVendor Inc.

Published Name:     oem17.inf
Original Name:      custom-net.inf
Provider Name:      Npcap Helper ThirdParty

Microsoft PnP 工具

发布名称:           OEM12.INF
原始名称:           Npcap.INF
提供程序名称:       Npcap

发布名称:           oem21.inf
原始名称:           npcap.inf
提供程序名称:       Insecure.Com LLC.
`;
  assert.deepEqual(parsePnputilNpcapDrivers(sample), ['oem12.inf', 'oem14.inf', 'oem21.inf']);
  assert.deepEqual(parsePnputilNpcapDrivers(''), []);
});

test('parseSymlinkEvaluationDisabled, parseNpcapInstallLog, and detectConflictingNetworkApps parse Windows diagnostics accurately', () => {
  assert.equal(
    parseSymlinkEvaluationDisabled(`
HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\FileSystem
    SymlinkLocalToLocalEvaluation    REG_DWORD    0x0
    SymlinkLocalToRemoteEvaluation    REG_DWORD    0x1
`),
    true,
  );
  assert.equal(
    parseSymlinkEvaluationDisabled(`
HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\FileSystem
    SymlinkLocalToLocalEvaluation    REG_DWORD    0x1
    SymlinkLocalToRemoteEvaluation    REG_DWORD    0
`),
    true,
  );
  assert.equal(
    parseSymlinkEvaluationDisabled(`
HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\FileSystem
    SymlinkLocalToLocalEvaluation    REG_DWORD    0x1
    SymlinkLocalToRemoteEvaluation    REG_DWORD    0x1
    SymlinkRemoteToLocalEvaluation    REG_DWORD    0x0
    SymlinkRemoteToRemoteEvaluation    REG_DWORD    0x0
`),
    false,
  );

  assert.deepEqual(
    parseNpcapInstallLog('Error 0x800705b7 ERROR_SYMLINK_CLASS_DISABLED\nFailed to create the npcap service\nCannot completely uninstall Npcap, files in use\n0x80070430 marked for deletion 1072'),
    {
      symlinkDisabled: true,
      filesInUse: true,
      markedForDelete: true,
      serviceCreateFailed: true,
      alreadyExists: false,
    },
  );
  assert.deepEqual(
    parseNpcapInstallLog('Failed to create the npcap service: 0x800700b7 ERROR_ALREADY_EXISTS'),
    {
      symlinkDisabled: false,
      filesInUse: false,
      markedForDelete: false,
      serviceCreateFailed: true,
      alreadyExists: true,
    },
  );
  assert.deepEqual(parseNpcapInstallLog('Npcap installed cleanly'), {
    symlinkDisabled: false,
    filesInUse: false,
    markedForDelete: false,
    serviceCreateFailed: false,
    alreadyExists: false,
  });

  const tasklistCsv = [
    '"System Idle Process","0","Services","0","8 K"',
    '"Clash for Windows.exe","4120","Console","1","92,000 K"',
    '"clash-verge.exe","4200","Console","1","80,000 K"',
    '"clash-nyanpasu.exe","4300","Console","1","70,000 K"',
    '"mihomo.exe","4400","Console","1","40,000 K"',
    '"Wireshark.exe","4500","Console","1","120,000 K"',
    '"dumpcap.exe","4504","Console","1","10,000 K"',
    '"uu.exe","4600","Console","1","55,000 K"',
    '"UUBooster.exe","4604","Console","1","30,000 K"',
  ].join('\n');
  assert.deepEqual(detectConflictingNetworkApps(tasklistCsv), [
    'Clash for Windows',
    'Clash Verge',
    'Clash Nyanpasu',
    'Mihomo/Clash',
    'Wireshark',
    'UU 加速器',
  ]);
});

test('prepareNpcapEnvironment skips when installed or non-win32, repairs symlink/services/drivers safely, and detects 1072 reboot', async () => {
  let commandCount = 0;
  const skippedNonWin = await prepareNpcapEnvironment({
    platform: 'linux',
    hasNpcapFn: () => false,
    runCommand: async () => { commandCount += 1; return { code: 0, stdout: '', stderr: '' }; },
  });
  assert.deepEqual(skippedNonWin, { cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false });
  assert.equal(commandCount, 0);

  const skippedInstalled = await prepareNpcapEnvironment({
    platform: 'win32',
    hasNpcapFn: () => true,
    runCommand: async () => { commandCount += 1; return { code: 0, stdout: '', stderr: '' }; },
  });
  assert.deepEqual(skippedInstalled, { cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false });
  assert.equal(commandCount, 0);

  // Full cleanup: repairs L2L/L2R, stops & deletes npcap, preserves npf when legacy WinPcap exists, deletes only allowlisted oem drivers
  const callsWithWinPcap = [];
  let npcapPolls = 0;
  const resWithWinPcap = await prepareNpcapEnvironment({
    platform: 'win32',
    hasNpcapFn: () => false,
    hasLegacyWinPcapFn: () => true,
    removePathFn: () => {},
    sleepFn: async () => {},
    runCommand: async (file, args) => {
      callsWithWinPcap.push([file, ...args]);
      if (file === 'reg.exe' && args[0] === 'query' && args[1].endsWith('FileSystem')) {
        return { code: 0, stdout: '    SymlinkLocalToLocalEvaluation    REG_DWORD    0x0\n', stderr: '' };
      }
      if (file === 'reg.exe' && args[0] === 'query' && args[1].endsWith('Network')) {
        return { code: 0, stdout: '    MaxNumFilters    REG_DWORD    0xe\n', stderr: '' };
      }
      if (file === 'sc.exe' && args[0] === 'query' && args[1] === 'npcap') {
        npcapPolls += 1;
        return npcapPolls === 1
          ? { code: 0, stdout: 'STATE : 4 RUNNING', stderr: '' }
          : { code: 0, stdout: 'STATE : 1 STOPPED', stderr: '' };
      }
      if (file === 'pnputil.exe' && args[0] === '/enum-drivers') {
        return {
          code: 0,
          stdout: 'Published Name: oem9.inf\nOriginal Name: npcap.inf\nProvider Name: Nmap Project\n\nPublished Name: oem10.inf\nOriginal Name: realtek.inf\nProvider Name: Realtek\n',
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  assert.deepEqual(resWithWinPcap, {
    cleanedServices: ['npcap'],
    cleanedDrivers: ['oem9.inf'],
    repairedSymlink: true,
    repairedMaxFilters: false,
    needsReboot: false,
  });
  assert.ok(callsWithWinPcap.some((c) => c.join(' ') === 'fsutil.exe behavior set SymlinkEvaluation L2L:1 L2R:1'));
  assert.ok(!callsWithWinPcap.some((c) => c.join(' ').includes('npf')), 'must preserve legacy WinPcap npf service');
  assert.ok(!callsWithWinPcap.some((c) => c.join(' ').includes('oem10.inf')), 'must never delete non-Npcap driver');

  // When legacy WinPcap is absent and delete hits 1072 -> cleans npf and marks needsReboot
  const res1072 = await prepareNpcapEnvironment({
    platform: 'win32',
    hasNpcapFn: () => false,
    hasLegacyWinPcapFn: () => false,
    removePathFn: () => {},
    sleepFn: async () => {},
    runCommand: async (file, args) => {
      if (file === 'reg.exe' && args[0] === 'query' && args[1].endsWith('FileSystem')) {
        return { code: 0, stdout: '    SymlinkLocalToLocalEvaluation    REG_DWORD    0x1\n', stderr: '' };
      }
      if (file === 'reg.exe' && args[0] === 'query' && args[1].endsWith('Network')) {
        return { code: 0, stdout: '    MaxNumFilters    REG_DWORD    0x8\n', stderr: '' };
      }
      if (file === 'sc.exe' && args[0] === 'query' && args[1] === 'npcap') return { code: 1060, stdout: '', stderr: '' };
      if (file === 'sc.exe' && args[0] === 'query' && args[1] === 'npf') return { code: 0, stdout: 'STATE : 1 STOPPED', stderr: '' };
      if (file === 'sc.exe' && args[0] === 'stop' && args[1] === 'npf') return { code: 1062, stdout: '', stderr: '' };
      if (file === 'sc.exe' && args[0] === 'delete' && args[1] === 'npf') {
        return { code: 1072, stdout: '', stderr: '[SC] DeleteService FAILED 1072: The specified service has been marked for deletion.' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  assert.deepEqual(res1072, {
    cleanedServices: ['npf'],
    cleanedDrivers: [],
    repairedSymlink: false,
    repairedMaxFilters: true,
    needsReboot: true,
  });
});

test('formatNpcapFailureMessage and runNpcapInstaller diagnose 1072 reboot, conflicting apps, 0x800705b7, and fallback', async () => {
  const os = require('node:os');
  const m1 = formatNpcapFailureMessage({ prep: { needsReboot: true }, logDiag: {}, conflicts: ['Clash Verge'], exitCode: 1072 });
  assert.ok(m1.includes('1072') && m1.includes('重启电脑'));
  assert.ok(m1.includes('未安装 Npcap 前仍可通过内置通道正常记录本路战报'));

  const m2 = formatNpcapFailureMessage({
    prep: { needsReboot: false },
    logDiag: { filesInUse: true },
    conflicts: ['Clash for Windows', 'Wireshark'],
    exitCode: 1,
  });
  assert.ok(m2.includes('Clash for Windows') && m2.includes('Wireshark'));
  assert.ok(m2.includes('未安装 Npcap 前仍可通过内置通道正常记录本路战报'));

  const m3 = formatNpcapFailureMessage({
    prep: { needsReboot: false },
    logDiag: { symlinkDisabled: true, serviceCreateFailed: true },
    conflicts: [],
    exitCode: 1,
  });
  assert.ok(m3.includes('0x800705b7') && m3.includes('符号链接'));
  assert.ok(m3.includes('未安装 Npcap 前仍可通过内置通道正常记录本路战报'));

  const m4 = formatNpcapFailureMessage({ prep: {}, logDiag: {}, conflicts: [], exitCode: 2 });
  assert.ok(m4.includes('安装向导已关闭') && m4.includes('未安装 Npcap 前仍可通过内置通道正常记录本路战报'));

  // runNpcapInstaller short-circuits before downloading if prep.needsReboot is true
  let fetched = false;
  const progressEvents = [];
  const rebootResult = await runNpcapInstaller({
    hasNpcapFn: () => false,
    onProgress: (status, message) => progressEvents.push({ status, message }),
    prepareEnvFn: async () => ({ cleanedServices: ['npcap'], cleanedDrivers: [], repairedSymlink: false, needsReboot: true }),
    fetchFn: async () => { fetched = true; return ''; },
  });
  assert.equal(fetched, false);
  assert.equal(rebootResult.installed, false);
  assert.equal(rebootResult.exitCode, 1072);
  assert.equal(rebootResult.needsReboot, true);
  assert.ok(rebootResult.failureMessage.includes('1072'));
  assert.ok(progressEvents.some((e) => e.status === 'installing' && e.message.includes('残留')));

  // runNpcapInstaller inspects failure logs & conflicts when installer closes without wpcap.dll
  const failedResult = await runNpcapInstaller({
    hasNpcapFn: () => false,
    prepareEnvFn: async () => ({ cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, needsReboot: false }),
    fetchFn: async (url, opts) => {
      if (opts?.destPath) {
        fs.writeFileSync(opts.destPath, 'stub', 'utf8');
        return { bytes: 4 };
      }
      assert.ok(url.includes('npcap.com/dist'));
      return '<a href="npcap-1.80.exe">npcap-1.80.exe</a>';
    },
    spawnFn: () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 1));
      return child;
    },
    inspectFailureFn: async () => ({
      prep: { cleanedServices: [], cleanedDrivers: [], repairedSymlink: true, needsReboot: false },
      logDiag: { symlinkDisabled: true, filesInUse: false, markedForDelete: false, serviceCreateFailed: true },
      conflicts: ['Clash Verge'],
    }),
  });
  assert.equal(failedResult.installed, false);
  assert.equal(failedResult.version, '1.80');
  assert.equal(failedResult.exitCode, 1);
  assert.equal(failedResult.needsReboot, false);
  assert.ok(failedResult.failureMessage.includes('Clash Verge'));

  // inspectNpcapFailure reads fresh install.log tail, runs fsutil on 0x800705b7, and reads tasklist
  const tmpProgFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-progfiles-'));
  try {
    const npcapLogDir = path.join(tmpProgFiles, 'Npcap');
    fs.mkdirSync(npcapLogDir, { recursive: true });
    fs.writeFileSync(path.join(npcapLogDir, 'NPFInstall.log'), 'Failed to create the npcap service: 0x800705b7\n', 'utf8');
    const cmds = [];
    const diag = await inspectNpcapFailure({
      startedAt: Date.now(),
      programFilesDir: tmpProgFiles,
      hasNpcapFn: () => false,
      prepareEnvFn: async () => ({ cleanedServices: [], cleanedDrivers: ['oem1.inf'], repairedSymlink: false, needsReboot: false }),
      runCommand: async (file, args) => {
        cmds.push([file, ...args]);
        if (file === 'tasklist.exe') {
          return { code: 0, stdout: '"Clash for Windows.exe","99","Console","1","50 K"\n', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    assert.equal(diag.logDiag.symlinkDisabled, true);
    assert.equal(diag.logDiag.serviceCreateFailed, true);
    assert.equal(diag.prep.repairedSymlink, true);
    assert.deepEqual(diag.conflicts, ['Clash for Windows']);
    assert.ok(cmds.some((c) => c.join(' ') === 'fsutil.exe behavior set SymlinkEvaluation L2L:1 L2R:1'));
    assert.ok(cmds.some((c) => c.join(' ') === 'tasklist.exe /FO CSV /NH'));
  } finally {
    fs.rmSync(tmpProgFiles, { recursive: true, force: true });
  }
});

test('battle-reports-install-npcap stops worker before install, surfaces failureMessage, auto-resumes on failure, and respects pause', async () => {
  const published = [];
  const handlers = new Map();
  const children = [];
  let npcapPresent = false;
  let workerRunningDuringInstall = null;
  let nextInstallResult = {
    installed: false,
    version: '1.80',
    exitCode: 1072,
    needsReboot: true,
    failureMessage: '已自动清理旧版残留（1072），请重启电脑一次后再试；未安装 Npcap 前仍可通过内置通道正常记录本路战报。',
  };

  const fakeMain = new EventEmitter();
  fakeMain.isDestroyed = () => false;
  fakeMain.webContents = Object.assign(new EventEmitter(), {
    mainFrame: { url: 'prts://app/' },
    send: () => {},
  });

  const br = installBattleReports({
    app: { isPackaged: false, getAppPath: () => path.resolve(__dirname, '..') },
    mainWindow: fakeMain,
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    product: loadProduct('stronghold'),
    onPublish: (state) => published.push({ ...state }),
    screenApi: null,
    hasNpcapFn: () => npcapPresent,
    runNpcapInstallerFn: async () => {
      workerRunningDuringInstall = children.some((c) => !c.killed);
      if (nextInstallResult.installed) {
        npcapPresent = true;
      }
      return nextInstallResult;
    },
    spawnFn: () => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        killed: false,
        kill() {
          this.killed = true;
          process.nextTick(() => this.emit('close', 0));
        },
      });
      children.push(child);
      return child;
    },
  });

  try {
    const senderEvent = { sender: fakeMain.webContents, senderFrame: fakeMain.webContents.mainFrame };
    br.start();
    children[0].stdout.write(JSON.stringify({ kind: 'status', status: 'listening' }) + '\n');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(children.length, 1);

    // 1. Install fails -> worker stopped before installer, failureMessage published, and worker auto-resumed in finally
    const failState = await handlers.get('battle-reports-install-npcap')(senderEvent);
    assert.equal(children[0].killed, true);
    assert.equal(workerRunningDuringInstall, false, 'worker must be stopped before Npcap installer runs');
    assert.equal(failState.npcapInstall.status, 'error');
    assert.ok(failState.npcapInstall.message.includes('1072'));
    assert.equal(children.length, 2, 'worker must be automatically resumed after failed/cancelled install');

    // 2. When paused before install, failure does not auto-resume worker
    handlers.get('battle-reports-enable')(senderEvent, false);
    assert.equal(children[1].killed, true);
    const pausedFailState = await handlers.get('battle-reports-install-npcap')(senderEvent);
    assert.equal(pausedFailState.status, 'paused');
    assert.equal(children.length, 2, 'paused capture must stay paused after install failure');

    // 3. When paused and installer succeeds -> hot-switches npcapInstalled without starting worker
    nextInstallResult = { installed: true, version: '1.80', exitCode: 0 };
    const pausedOkState = await handlers.get('battle-reports-install-npcap')(senderEvent);
    assert.equal(pausedOkState.npcapInstalled, true);
    assert.equal(pausedOkState.npcapInstall.status, 'installed');
    assert.equal(children.length, 2, 'paused capture must stay paused after install success');

    // 4. When running and installer succeeds -> stops worker before install, hot-switches, and starts new worker
    npcapPresent = false;
    handlers.get('battle-reports-enable')(senderEvent, true);
    assert.equal(children.length, 3);
    workerRunningDuringInstall = null;
    const okState = await handlers.get('battle-reports-install-npcap')(senderEvent);
    assert.equal(children[2].killed, true);
    assert.equal(workerRunningDuringInstall, false, 'worker must be stopped before Npcap installer runs');
    assert.equal(okState.npcapInstalled, true);
    assert.equal(okState.npcapInstall.status, 'installed');
    assert.ok(okState.npcapInstall.message.includes('v1.80'));
    assert.equal(children.length, 4);

    // 5. stopAndWait resolves promptly on timeout even if a hung child never emits close/exit
    children[3].kill = () => {};
    const t0 = Date.now();
    await br.stopAndWait(25);
    assert.ok(Date.now() - t0 < 400);
  } finally {
    br.dispose();
  }
});

test('isWindows10OrOlder and pickNpcapInstallerForOs select Npcap 1.80 on Win10 and latest on Win11', async () => {
  assert.equal(isWindows10OrOlder('10.0.19045', 'win32'), true);
  assert.equal(isWindows10OrOlder('10.0.10240', 'win32'), true);
  assert.equal(isWindows10OrOlder('6.1.7601', 'win32'), true);
  assert.equal(isWindows10OrOlder('6.3.9600', 'win32'), true);
  assert.equal(isWindows10OrOlder('10.0.22000', 'win32'), false);
  assert.equal(isWindows10OrOlder('10.0.22631', 'win32'), false);
  assert.equal(isWindows10OrOlder('11.0.26100', 'win32'), false);
  assert.equal(isWindows10OrOlder('10.0.19045', 'linux'), false);
  assert.equal(isWindows10OrOlder('invalid', 'win32'), false);
  assert.equal(isWindows10OrOlder('', 'win32'), false);

  const fullHtml = `
    <a href="npcap-1.79.exe">npcap-1.79.exe</a>
    <a href="npcap-1.80.exe">npcap-1.80.exe</a>
    <a href="npcap-1.89.exe">npcap-1.89.exe</a>
    <a href="npcap-1.100.exe">npcap-1.100.exe</a>
  `;
  assert.deepEqual(
    pickNpcapInstallerForOs(fullHtml, { platform: 'win32', release: '10.0.19045' }),
    {
      version: '1.80',
      filename: 'npcap-1.80.exe',
      url: 'https://npcap.com/dist/npcap-1.80.exe',
      reason: 'win10-compat',
    },
  );
  assert.deepEqual(
    pickNpcapInstallerForOs(fullHtml, { platform: 'win32', release: '10.0.22631' }),
    {
      version: '1.100',
      filename: 'npcap-1.100.exe',
      url: 'https://npcap.com/dist/npcap-1.100.exe',
      reason: 'latest',
    },
  );
  // Fallback on Win10 when 1.80 is missing: highest <= 1.80, then latest
  const no180Html = '<a href="npcap-1.78.exe"></a><a href="npcap-1.79.exe"></a><a href="npcap-1.85.exe"></a>';
  assert.equal(pickNpcapInstallerForOs(no180Html, { platform: 'win32', release: '10.0.19045' }).version, '1.79');
  const onlyNewerHtml = '<a href="npcap-1.85.exe"></a><a href="npcap-1.90.exe"></a>';
  assert.equal(pickNpcapInstallerForOs(onlyNewerHtml, { platform: 'win32', release: '10.0.19045' }).version, '1.90');

  // runNpcapInstaller uses Win10 compat download message & picks 1.80 on Win10
  const progress = [];
  const win10Run = await runNpcapInstaller({
    platform: 'win32',
    osRelease: '10.0.19045',
    hasNpcapFn: () => false,
    prepareEnvFn: async () => ({ cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false }),
    onProgress: (status, message) => progress.push({ status, message }),
    fetchFn: async (_url, opts) => {
      if (opts?.destPath) {
        fs.writeFileSync(opts.destPath, 'stub', 'utf8');
        return { bytes: 4 };
      }
      return fullHtml;
    },
    spawnFn: () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 1));
      return child;
    },
    inspectFailureFn: async () => ({
      prep: { cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false },
      logDiag: {},
      conflicts: [],
    }),
  });
  assert.equal(win10Run.version, '1.80');
  assert.equal(win10Run.canFallbackCompat180, false);
  assert.ok(progress.some((p) => p.status === 'downloading' && p.message.includes('Windows 10') && p.message.includes('npcap-1.80.exe')));

  // Win11 explicit preferCompat180 picks 1.80 with manual-compat reason
  assert.deepEqual(
    pickNpcapInstallerForOs(fullHtml, { platform: 'win32', release: '10.0.22631', preferCompat180: true }),
    {
      version: '1.80',
      filename: 'npcap-1.80.exe',
      url: 'https://npcap.com/dist/npcap-1.80.exe',
      reason: 'manual-compat',
    },
  );

  // Win11 download failure of latest automatically falls back to 1.80
  const fetchedUrls = [];
  const fallbackProgress = [];
  let win11Installed = false;
  const win11FallbackRun = await runNpcapInstaller({
    platform: 'win32',
    osRelease: '10.0.22631',
    hasNpcapFn: () => win11Installed,
    prepareEnvFn: async () => ({ cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false }),
    onProgress: (status, message) => fallbackProgress.push({ status, message }),
    fetchFn: async (url, opts) => {
      fetchedUrls.push(url);
      if (opts?.destPath) {
        if (url.includes('npcap-1.100.exe')) {
          throw new Error('HTTP 503');
        }
        fs.writeFileSync(opts.destPath, 'stub', 'utf8');
        return { bytes: 4 };
      }
      return fullHtml;
    },
    spawnFn: () => {
      win11Installed = true;
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 0));
      return child;
    },
  });
  assert.equal(win11FallbackRun.installed, true);
  assert.equal(win11FallbackRun.version, '1.80');
  assert.ok(fetchedUrls.some((u) => u.includes('npcap-1.100.exe')));
  assert.ok(fetchedUrls.some((u) => u.includes('npcap-1.80.exe')));
  assert.ok(fallbackProgress.some((p) => p.status === 'downloading' && p.message.includes('自动切换') && p.message.includes('npcap-1.80.exe')));

  // Win11 latest install failure without reboot surfaces canFallbackCompat180=true
  const win11InstallFail = await runNpcapInstaller({
    platform: 'win32',
    osRelease: '10.0.22631',
    hasNpcapFn: () => false,
    prepareEnvFn: async () => ({ cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false }),
    fetchFn: async (_url, opts) => {
      if (opts?.destPath) {
        fs.writeFileSync(opts.destPath, 'stub', 'utf8');
        return { bytes: 4 };
      }
      return fullHtml;
    },
    spawnFn: () => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('close', 1));
      return child;
    },
    inspectFailureFn: async () => ({
      prep: { cleanedServices: [], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: false, needsReboot: false },
      logDiag: {},
      conflicts: [],
    }),
  });
  assert.equal(win11InstallFail.installed, false);
  assert.equal(win11InstallFail.version, '1.100');
  assert.equal(win11InstallFail.canFallbackCompat180, true);
});

test('parseMaxNumFilters, 0x800700b7 cleanup in prepareNpcapEnvironment, and failure diagnostics work accurately', async () => {
  const os = require('node:os');
  assert.equal(parseMaxNumFilters('    MaxNumFilters    REG_DWORD    0x8\n'), 8);
  assert.equal(parseMaxNumFilters('    MaxNumFilters    REG_DWORD    0xe\n'), 14);
  assert.equal(parseMaxNumFilters('    MaxNumFilters    REG_DWORD    14\n'), 14);
  assert.equal(parseMaxNumFilters('ERROR: The system was unable to find the specified registry key or value.'), null);

  const commands = [];
  const removedPaths = [];
  const prepRes = await prepareNpcapEnvironment({
    platform: 'win32',
    hasNpcapFn: () => false,
    hasLegacyWinPcapFn: () => false,
    sleepFn: async () => {},
    removePathFn: (p) => {
      removedPaths.push(p);
      throw new Error('EPERM');
    },
    runCommand: async (file, args) => {
      commands.push([file, ...args]);
      if (file === 'reg.exe' && args[0] === 'query' && args[1].endsWith('Network')) {
        return { code: 0, stdout: '    MaxNumFilters    REG_DWORD    0x8\n', stderr: '' };
      }
      if (file === 'sc.exe' && args[0] === 'query') return { code: 1060, stdout: '', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  assert.equal(prepRes.repairedMaxFilters, true);
  assert.ok(commands.some((c) => c.join(' ') === 'reg.exe delete HKLM\\SYSTEM\\CurrentControlSet\\Services\\npcap /f'));
  assert.ok(commands.some((c) => c.join(' ') === 'reg.exe delete HKLM\\SYSTEM\\CurrentControlSet\\Services\\npf /f'));
  assert.ok(commands.some((c) => c.join(' ') === 'reg.exe add HKLM\\SYSTEM\\CurrentControlSet\\Control\\Network /v MaxNumFilters /t REG_DWORD /d 14 /f'));
  assert.ok(removedPaths.some((p) => p.endsWith('npcap.sys')));
  assert.ok(removedPaths.some((p) => /Npcap$/i.test(p)));
  assert.equal(removedPaths.length, 3);

  const noConflictMsg = formatNpcapFailureMessage({
    prep: { needsReboot: false, repairedMaxFilters: true },
    logDiag: { alreadyExists: true, serviceCreateFailed: true },
    conflicts: [],
    exitCode: 1,
  });
  assert.ok(noConflictMsg.includes('0x800700b7'));
  assert.ok(noConflictMsg.includes('MaxNumFilters'));
  assert.ok(noConflictMsg.includes('14'));
  assert.ok(noConflictMsg.includes('重启'));
  assert.ok(noConflictMsg.includes('未安装 Npcap 前仍可通过内置通道正常记录本路战报'));

  const conflictMsg = formatNpcapFailureMessage({
    prep: { needsReboot: false },
    logDiag: { alreadyExists: true },
    conflicts: ['Clash Verge'],
    exitCode: 1,
  });
  assert.ok(conflictMsg.includes('Clash Verge'));
  assert.ok(conflictMsg.includes('占用网卡过滤驱动'));

  const tmpProgFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-progfiles-b7-'));
  try {
    const npcapLogDir = path.join(tmpProgFiles, 'Npcap');
    fs.mkdirSync(npcapLogDir, { recursive: true });
    fs.writeFileSync(path.join(npcapLogDir, 'NPFInstall.log'), 'CreateService failed 0x800700b7 ERROR_ALREADY_EXISTS\n', 'utf8');
    let prepareCalled = false;
    const diag = await inspectNpcapFailure({
      startedAt: Date.now(),
      programFilesDir: tmpProgFiles,
      hasNpcapFn: () => false,
      prepareEnvFn: async () => {
        prepareCalled = true;
        return { cleanedServices: ['npcap'], cleanedDrivers: [], repairedSymlink: false, repairedMaxFilters: true, needsReboot: false };
      },
      runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
    });
    assert.equal(prepareCalled, true);
    assert.equal(diag.logDiag.alreadyExists, true);
    assert.equal(diag.prep.repairedMaxFilters, true);
  } finally {
    fs.rmSync(tmpProgFiles, { recursive: true, force: true });
  }
});

test('LDPlayer source parsing and OCR window recognition support LDPlayer with priority PC > MuMu > LDPlayer', () => {
  const ldDip = parseSourceMessage(
    {
      kind: 'source',
      client: 'ldplayer',
      mumuWindow: { title: '雷电模拟器', x: 150, y: 90, width: 1920, height: 1080 },
    },
    {
      screenToDipRect: (_win, r) => ({
        x: Math.round(r.x / 1.5),
        y: Math.round(r.y / 1.5),
        width: Math.round(r.width / 1.5),
        height: Math.round(r.height / 1.5),
      }),
    },
  );
  assert.deepEqual(ldDip, {
    clientSource: 'ldplayer',
    mumuWindow: { title: '雷电模拟器', x: 100, y: 60, width: 1280, height: 720 },
  });
  assert.deepEqual(
    parseSourceMessage({ kind: 'source', client: 'ldplayer', mumuWindow: null }),
    { clientSource: 'ldplayer', mumuWindow: null },
  );

  assert.equal(isArknightsWindowName('雷电模拟器 - 明日方舟'), true);
  assert.equal(isArknightsWindowName('LDPlayer - Arknights'), true);
  assert.equal(isArknightsWindowName('雷电模拟器'), false);

  assert.equal(isLdplayerEmulatorWindowName('雷电模拟器'), true);
  assert.equal(isLdplayerEmulatorWindowName('雷电模拟器-1'), true);
  assert.equal(isLdplayerEmulatorWindowName('LDPlayer-9'), true);
  assert.equal(isLdplayerEmulatorWindowName('雷电多开器'), false);
  assert.equal(isLdplayerEmulatorWindowName('雷电游戏中心'), false);
  assert.equal(isLdplayerEmulatorWindowName('雷电圈'), false);
  assert.equal(isLdplayerEmulatorWindowName('LDMultiPlayer'), false);
  assert.equal(isLdplayerEmulatorWindowName('LDStore'), false);

  assert.equal(
    pickGameCaptureWindow([
      { id: 'window:1:0', name: 'PRTS Stronghold' },
      { id: 'window:2:0', name: '雷电多开器' },
      { id: 'window:3:0', name: '雷电模拟器' },
      { id: 'window:4:0', name: 'MuMu安卓设备-1' },
    ], '1')?.name,
    'MuMu安卓设备-1',
  );
  assert.equal(
    pickGameCaptureWindow([
      { id: 'window:1:0', name: 'PRTS Stronghold' },
      { id: 'window:2:0', name: 'LDMultiPlayer' },
      { id: 'window:3:0', name: '雷电模拟器-1' },
    ], '1')?.name,
    '雷电模拟器-1',
  );
  assert.equal(
    pickGameCaptureWindow([
      { id: 'window:3:0', name: '雷电模拟器' },
      { id: 'window:4:0', name: 'MuMu安卓设备-1' },
      { id: 'window:5:0', name: '明日方舟' },
    ], '1')?.name,
    '明日方舟',
  );
});
