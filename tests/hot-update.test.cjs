const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const {
  buildCanonicalSignPayload, compareVersions, createHotUpdateManager, extractSafeZip, isAllowedUpdateUrl,
  resolveActiveUiRoot, verifyEd25519Payload,
} = require('../electron/hot-update.cjs');
const { createZipBuffer } = require('../scripts/build-hot-patch.cjs');

const keys = crypto.generateKeyPairSync('ed25519');
const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
const productId = 'telemetry';
const nativeVersion = '2.1.0';
const origin = 'https://api.arknightsprts.ggff.net';

function workspace(t) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-hot-update-'));
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));
  const root = path.join(userDataDir, 'hot-update');
  const slots = path.join(root, 'slots');
  const stateFile = path.join(root, 'state.json');
  const builtinDistDir = path.join(userDataDir, 'dist');
  fs.mkdirSync(slots, { recursive: true });
  function makeSlot(version, id = productId, slotNativeVersion = nativeVersion) {
    const slotDir = path.join(slots, `ui-${version}`);
    fs.mkdirSync(slotDir, { recursive: true });
    fs.writeFileSync(path.join(slotDir, 'index.html'), '<h1>UI patch</h1>');
    fs.writeFileSync(path.join(slotDir, 'product.json'), JSON.stringify({ id }));
    return { slotDir, version, nativeVersion: slotNativeVersion, failures: 0 };
  }
  return {
    userDataDir, builtinDistDir, makeSlot, slots, root, stateFile,
    getSaved: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')),
    writeSaved: (state) => fs.writeFileSync(stateFile, JSON.stringify(state)),
  };
}

function signEntry(kind, version, bytes) {
  const entry = {
    kind, version, product: productId, minNativeVersion: nativeVersion,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
    url: `${origin}/${kind}/${version}`,
  };
  const payload = buildCanonicalSignPayload(entry);
  return { ...entry, signature: crypto.sign(null, Buffer.from(payload), keys.privateKey).toString('base64') };
}

test('native and patch versions sort numerically', () => {
  assert.equal(compareVersions('2.1.0-p1', '2.1.0'), 1);
  assert.equal(compareVersions('2.1.0-p10', '2.1.0-p2'), 1);
  assert.equal(compareVersions('2.1.0-p1', '2.1.0-p2'), -1);
  assert.equal(compareVersions('2.1.1', '2.1.0-p99'), 1);
  assert.equal(compareVersions('2.1.0', '2.1.0'), 0);
});

test('canonical Ed25519 signature binds all signed metadata', () => {
  const entry = signEntry('ui', '2.1.0-p1', Buffer.from('zip bytes'));
  const payload = buildCanonicalSignPayload(entry);
  assert.equal(payload, ['prts-hot-update-v1', 'ui', productId, '2.1.0-p1', nativeVersion, entry.sha256, '9'].join('\n'));
  assert.equal(buildCanonicalSignPayload({ ...entry, sha256: entry.sha256.toUpperCase() }), payload);
  assert.equal(verifyEd25519Payload(payload, entry.signature, publicKeyPem), true);
  for (const [key, value] of Object.entries({
    kind: 'data', version: '2.1.0-p2', product: 'stronghold', minNativeVersion: '2.1.1', sha256: '0'.repeat(64), size: 10,
  })) {
    assert.equal(verifyEd25519Payload(buildCanonicalSignPayload({ ...entry, [key]: value }), entry.signature, publicKeyPem), false, key);
  }
  assert.equal(verifyEd25519Payload(payload, ` ${entry.signature}`, publicKeyPem), false);
  assert.equal(verifyEd25519Payload(payload, entry.signature, 'bad key'), false);
});

test('download URLs require a trusted HTTPS host or opt-in localhost', () => {
  assert.equal(isAllowedUpdateUrl(`${origin}/ui`), true);
  const local = 'http://127.0.0.1:8080/ui';
  assert.equal(isAllowedUpdateUrl(local), false);
  assert.equal(isAllowedUpdateUrl(local, { allowLocalhost: true }), true);
  assert.equal(isAllowedUpdateUrl('https://github.com.example/ui'), false);
  assert.equal(isAllowedUpdateUrl('https://example@github.com/ui'), false);
});

test('ZIP round trips stored and deflated files with nested Unicode names', (t) => {
  const { root } = workspace(t);
  const files = [
    { name: 'index.html', data: '<p>ok</p>', compress: false },
    { name: 'assets/子目录/战报.txt', data: '战报'.repeat(200) },
  ];
  const zip = createZipBuffer(files);
  assert.equal(zip.readUInt16LE(8), 0);
  const secondHeader = 30 + Buffer.byteLength(files[0].name) + Buffer.byteLength(files[0].data);
  assert.equal(zip.readUInt16LE(secondHeader + 8), 8);
  extractSafeZip(zip, root);
  for (const file of files) assert.equal(fs.readFileSync(path.join(root, file.name), 'utf8'), file.data);
});

test('ZIP rejects invalid names, too many files, oversized output and corrupt CRC', (t) => {
  const { root } = workspace(t);
  for (const name of ['../escape.txt', '/escape.txt', '\\escape.txt', 'C:/escape.txt', 'x/..\\escape.txt', 'bad\0.txt']) {
    assert.throws(() => extractSafeZip(createZipBuffer([{ name, data: 'x' }]), root), /Unsafe ZIP path/);
  }
  const bomb = createZipBuffer([{ name: 'bomb.txt', data: Buffer.alloc(30 * 1024 * 1024 + 1) }]);
  assert.throws(() => extractSafeZip(bomb, root), /size limit/);
  const zip = createZipBuffer([{ name: 'bad.txt', data: 'x' }]);
  assert.throws(() => extractSafeZip(zip, root, { maxFiles: 0 }), /file limit/);
  zip[30 + 'bad.txt'.length] ^= 1;
  assert.throws(() => extractSafeZip(zip, root), /CRC32/);
  assert.equal(fs.existsSync(path.join(root, 'bad.txt')), false);
});

test('startup rolls back the third attempt to stable, or to builtin when it has no stable UI', (t) => {
  const fixture = workspace(t);
  const select = () => resolveActiveUiRoot({ ...fixture, productId, nativeVersion });
  const pendingUi = fixture.makeSlot('2.1.0-p2');
  const activeUi = fixture.makeSlot('2.1.0-p1');
  fixture.writeSaved({ pendingUi, activeUi });
  assert.equal(select().activeKind, 'pending');
  assert.equal(fixture.getSaved().pendingUi.failures, 1);
  assert.equal(select().activeKind, 'pending');
  assert.equal(fixture.getSaved().pendingUi.failures, 2);
  assert.equal(select().uiRoot, activeUi.slotDir);
  assert.equal(fixture.getSaved().pendingUi, undefined);
  assert.equal(fixture.getSaved().lastRollbackReason, 'startup-failure-limit');
  fixture.writeSaved({ pendingUi: { ...pendingUi, failures: 2 } });
  assert.deepEqual(select(), { uiRoot: fixture.builtinDistDir, activeKind: 'builtin', uiVersion: nativeVersion, rolledBack: true });
});

test('startup discards old-native, outside-slot and cross-product references and reads corrupt state safely', (t) => {
  const fixture = workspace(t);
  const select = () => resolveActiveUiRoot({ ...fixture, productId, nativeVersion });
  const old = fixture.makeSlot('2.0.0-p1', productId, '2.0.0');
  const mismatched = fixture.makeSlot('2.1.0-p2', 'stronghold');
  fixture.writeSaved({ activeUi: old, pendingUi: mismatched });
  assert.equal(select().uiRoot, fixture.builtinDistDir);
  assert.deepEqual(fixture.getSaved(), {});
  fixture.writeSaved({ pendingUi: { ...old, nativeVersion, slotDir: path.dirname(fixture.slots) } });
  assert.equal(select().activeKind, 'builtin');
  assert.deepEqual(fixture.getSaved(), {});
  fs.writeFileSync(fixture.stateFile, '{invalid');
  assert.equal(select().activeKind, 'builtin');
});

test('manager applies data live, stages UI on demand, promotes healthy UI and rolls back a crashed patch', async (t) => {
  const fixture = workspace(t);
  const data = Buffer.from(JSON.stringify({ announcement: '维护公告', bossRoutes: ['R1'] }));
  const zip = createZipBuffer([
    { name: 'index.html', data: '<p>patch</p>' },
    { name: 'product.json', data: JSON.stringify({ id: productId }) },
    { name: 'assets/ui.js', data: 'true;' },
  ]);
  const makeUi = (patch) => signEntry('ui', `2.1.0-p${patch}`, zip);
  const native = { version: '2.1.1', downloadUrl: 'https://github.com/owner/repo/releases/download/v2.1.1/app.exe' };
  const manifest = { schemaVersion: 1, product: productId, data: signEntry('data', '1.0.0', data), ui: makeUi(2), native };
  let dataFetches = 0;
  let restarts = 0;
  const reloads = [];
  const events = [];
  const opened = [];
  const prior = fixture.makeSlot('2.1.0-p1');
  const obsolete = fixture.makeSlot('2.1.0-p0');
  fixture.writeSaved({ activeUi: prior, previousUi: obsolete });
  const options = {
    ...fixture, product: { id: productId }, nativeVersion, publicKeyPem,
    openExternal: (url) => opened.push(url), relaunchApp: () => restarts++,
    getMainWindow: () => ({
      loadURL: (url) => reloads.push(url),
      webContents: { send: (channel, state) => events.push([channel, state]) },
    }),
    fetchImpl: async (request) => {
      const url = new URL(request);
      if (url.pathname === '/v1/manifest.json') {
        assert.equal(url.searchParams.get('product'), productId);
        assert.equal(url.searchParams.get('platform'), process.platform === 'win32' ? 'win' : process.platform);
        assert.equal(url.searchParams.get('native'), nativeVersion);
        return Response.json(manifest);
      }
      if (url.pathname.startsWith('/data/')) {
        dataFetches++;
        return new Response(data);
      }
      assert.equal(url.href, manifest.ui.url);
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(zip.subarray(0, 32));
        controller.enqueue(zip.subarray(32));
        controller.close();
      } }));
    },
  };
  const start = () => {
    const manager = createHotUpdateManager(options);
    t.after(() => manager.dispose());
    return manager;
  };
  let manager = start();
  const handlers = new Map();
  manager.installHotUpdateIpc({ handle: (name, handle) => handlers.set(name, handle) }, (event) => event.trusted);
  assert.equal(handlers.size, 7);
  for (const handler of handlers.values()) assert.equal(handler({ trusted: false }), undefined);
  assert.equal(handlers.get('hot-update-get')({ trusted: true }).activeKind, 'stable');
  manager.applyAndRestart();
  assert.equal(restarts, 0);
  const checked = await manager.checkForUpdates();
  assert.equal(checked.status, 'available');
  assert.equal(checked.announcement, '维护公告');
  assert.equal(checked.activeData.version, '1.0.0');
  assert.equal(checked.availableUi.version, '2.1.0-p2');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.root, 'data', '1.0.0.json'))), JSON.parse(data));
  manager.openNativeDownload();
  assert.deepEqual(opened, [native.downloadUrl]);
  assert.equal((await manager.downloadAndStageUi()).status, 'ready-to-restart');
  assert.equal(restarts, 0);
  assert.equal(manager.getUiRoot(), prior.slotDir);
  assert.deepEqual(fixture.getSaved().pendingUi.failures, 0);
  assert.ok(events.some(([channel, { downloadProgress }]) => channel === 'hot-update-state' && downloadProgress > 0 && downloadProgress < 100));
  manager.applyAndRestart();
  assert.equal(restarts, 1);
  manager.dispose();

  manager = start();
  assert.equal(manager.getPublicState().activeKind, 'pending');
  assert.equal(fixture.getSaved().pendingUi.failures, 1);
  assert.equal(fs.readFileSync(path.join(manager.getUiRoot(), 'assets', 'ui.js'), 'utf8'), 'true;');
  const stableRoot = manager.getUiRoot();
  assert.equal(manager.confirmHealthy().activeKind, 'stable');
  assert.equal(fixture.getSaved().previousUi.slotDir, prior.slotDir);
  assert.equal(fixture.getSaved().activeUi.failures, 0);
  assert.equal(fs.existsSync(obsolete.slotDir), false);
  assert.equal(manager.handleRendererGone(), false);
  manifest.ui = makeUi(3);
  await manager.checkForUpdates();
  assert.equal(dataFetches, 1);
  await manager.downloadAndStageUi();
  manager.dispose();

  manager = start();
  assert.equal(manager.getPublicState().activeKind, 'pending');
  assert.equal(manager.handleRendererGone(), true);
  assert.equal(manager.getUiRoot(), stableRoot);
  assert.equal(manager.getPublicState().lastRollbackReason, 'renderer-gone');
  assert.equal(fixture.getSaved().pendingUi, undefined);
  assert.deepEqual(reloads, ['prts://app/']);
  manager.rollbackToBuiltin();
  assert.equal(manager.getUiRoot(), fixture.builtinDistDir);
  assert.equal(restarts, 2);
});

test('unconfirmed pending UI times out and reloads the builtin UI', async (t) => {
  const fixture = workspace(t);
  fixture.writeSaved({ pendingUi: fixture.makeSlot('2.1.0-p1') });
  const reloads = [];
  const manager = createHotUpdateManager({
    ...fixture, product: { id: productId }, nativeVersion, publicKeyPem, watchdogMs: 5,
    getMainWindow: () => ({ loadURL: (url) => reloads.push(url) }),
  });
  t.after(() => manager.dispose());
  assert.equal(manager.getPublicState().activeKind, 'pending');
  await delay(25);
  assert.equal(manager.getUiRoot(), fixture.builtinDistDir);
  assert.equal(manager.getPublicState().lastRollbackReason, 'watchdog-timeout');
  assert.deepEqual(reloads, ['prts://app/']);
});

test('an incompatible UI offers the native update and modified download bytes cannot be staged', async (t) => {
  const fixture = workspace(t);
  const bytes = Buffer.from('original');
  const entry = signEntry('ui', '2.1.1-p1', bytes);
  const manifest = {
    schemaVersion: 1, product: productId, ui: { ...entry, minNativeVersion: '2.1.1' },
    native: { version: nativeVersion, downloadUrl: 'https://github.com/owner/repo/releases/download/v2.1.0/app.exe' },
  };
  let downloads = 0;
  const manager = createHotUpdateManager({
    ...fixture, product: { id: productId }, nativeVersion, publicKeyPem,
    fetchImpl: async (url) => {
      if (new URL(url).pathname === '/v1/manifest.json') return Response.json(manifest);
      downloads++;
      return new Response('modified');
    },
  });
  t.after(() => manager.dispose());
  let state = await manager.checkForUpdates();
  assert.equal(state.availableUi, null);
  assert.deepEqual(state.nativeUpdate, manifest.native);
  assert.equal(downloads, 0);
  manifest.ui = entry;
  state = await manager.checkForUpdates();
  assert.equal(state.availableUi.version, entry.version);
  state = await manager.downloadAndStageUi();
  assert.equal(state.status, 'error');
  assert.match(state.error, /SHA-256 mismatch/);
  assert.equal(state.stagedUiVersion, null);
  assert.deepEqual(fs.readdirSync(fixture.slots), []);
});
