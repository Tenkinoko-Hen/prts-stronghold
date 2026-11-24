const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { diagnosticsDialogTitle, latestSelfFinish, parseUnknownDetails } = require('../electron/battle-reports.cjs');
const { pickLatestNpcapInstaller } = require('../electron/npcap-installer.cjs');
const { classifyBadgeBgra, evaluateOcrLines, extractCovenantBoxesFromLine, looksLikeCovenantScreen } = require('../electron/covenant-ocr.cjs');
const { installLanSync, isPrivateLanIp, verifyPin } = require('../electron/lan-sync.cjs');

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
