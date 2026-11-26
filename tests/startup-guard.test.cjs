const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  MAX_STARTUP_LOG_BYTES,
  SAFE_GPU_RELAUNCH_FLAGS,
  readStartupPrefs,
  writeStartupPrefs,
  isSafeGpuMode,
  applyStartupGpuWorkarounds,
  buildSafeGpuRelaunchArgs,
  shouldRelaunchForChildProcessGone,
  shouldRelaunchForRenderProcessGone,
  appendStartupLog,
  createStartupLogger,
} = require('../electron/startup-guard.cjs');
const { patchPortableNsiTemplate } = require('../scripts/package-windows.cjs');

test('isSafeGpuMode and applyStartupGpuWorkarounds configure Windows GPU sandbox and safe fallback flags', () => {
  assert.equal(isSafeGpuMode({ argv: ['app.exe'] }), false);
  assert.equal(isSafeGpuMode({ argv: ['app.exe', '--prts-safe-gpu'] }), true);
  assert.equal(isSafeGpuMode({ argv: ['app.exe', '--disable-gpu'] }), true);
  assert.equal(isSafeGpuMode({ argv: ['app.exe'], commandLine: { hasSwitch: (s) => s === 'disable-gpu' } }), true);

  const switchesNormal = [];
  let hwDisabledNormal = false;
  const normalResult = applyStartupGpuWorkarounds({
    platform: 'win32',
    argv: ['app.exe'],
    app: {
      disableHardwareAcceleration: () => { hwDisabledNormal = true; },
      commandLine: {
        hasSwitch: () => false,
        appendSwitch: (s) => switchesNormal.push(s),
      },
    },
  });
  assert.equal(normalResult, false);
  assert.equal(hwDisabledNormal, false);
  assert.deepEqual(switchesNormal, ['disable-gpu-sandbox']);

  const switchesSafe = [];
  let hwDisabledSafe = false;
  const safeResult = applyStartupGpuWorkarounds({
    platform: 'win32',
    argv: ['app.exe', '--prts-safe-gpu'],
    app: {
      disableHardwareAcceleration: () => { hwDisabledSafe = true; },
      commandLine: {
        hasSwitch: () => false,
        appendSwitch: (s) => switchesSafe.push(s),
      },
    },
  });
  assert.equal(safeResult, true);
  assert.equal(hwDisabledSafe, true);
  assert.ok(switchesSafe.includes('disable-gpu'));
  assert.ok(switchesSafe.includes('disable-gpu-sandbox'));
  assert.ok(switchesSafe.includes('no-sandbox'));
});

test('buildSafeGpuRelaunchArgs preserves existing args without duplicating safe GPU switches', () => {
  assert.deepEqual(
    buildSafeGpuRelaunchArgs(['C:\\app.exe', '--foo', '--disable-gpu']),
    ['--foo', '--disable-gpu', '--prts-safe-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
  );
  for (const flag of SAFE_GPU_RELAUNCH_FLAGS) {
    assert.ok(buildSafeGpuRelaunchArgs(['app.exe']).includes(flag));
  }
});

test('shouldRelaunchForChildProcessGone allows single GPU recovery relaunch and prevents loops', () => {
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'GPU', reason: 'abnormal-exit', exitCode: -2147483645 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: false },
    ),
    true,
  );
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'GPU', reason: 'clean-exit', exitCode: 0 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: false },
    ),
    true,
  );
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'GPU', reason: 'clean-exit', exitCode: 0 },
      { mainWindowShown: true, safeGpuMode: false, hasRelaunched: false, isQuitting: false },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'GPU', reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: true, hasRelaunched: false, isQuitting: false },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'GPU', reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: true, isQuitting: false },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'Utility', reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: false },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForChildProcessGone(
      { type: 'GPU', reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: true },
    ),
    false,
  );
});

test('createStartupLogger records diagnostic events and rotates strictly under 32 KB without throwing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-startup-log-'));
  try {
    const logStartup = createStartupLogger({
      app: {
        getPath: (name) => {
          assert.equal(name, 'userData');
          return tmpDir;
        },
        getVersion: () => '2.0.9',
      },
      product: { id: 'telemetry' },
      safeGpuMode: true,
    });

    assert.equal(logStartup('child-process-gone', { type: 'GPU', reason: 'crashed', exitCode: -2147483645 }), true);
    assert.equal(logStartup('render-process-gone', { reason: 'oom' }), true);
    assert.equal(logStartup('did-fail-load', { errorCode: -2, errorDescription: 'ERR_FAILED' }), true);
    assert.equal(logStartup('tray-init-failed', new Error('tray icon failed')), true);

    const logPath = path.join(tmpDir, 'startup.log');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 4);
    assert.equal(lines[0].product, 'telemetry');
    assert.equal(lines[0].version, '2.0.9');
    assert.equal(lines[0].safeGpu, true);
    assert.equal(lines[0].type, 'GPU');
    assert.equal(lines[0].exitCode, -2147483645);
    assert.equal(lines[1].reason, 'oom');
    assert.equal(lines[2].errorCode, -2);
    assert.equal(lines[2].errorDescription, 'ERR_FAILED');
    assert.ok(lines[3].stack.includes('tray icon failed'));

    // Rotate over 32 KB limit and verify newest entry survives and size <= MAX_STARTUP_LOG_BYTES
    for (let i = 0; i < 240; i += 1) {
      appendStartupLog(logPath, {
        ts: new Date().toISOString(),
        event: 'burst',
        product: 'stronghold',
        version: '2.0.9',
        safeGpu: false,
        message: `entry-${i}-${'x'.repeat(180)}`,
      });
    }
    const stat = fs.statSync(logPath);
    assert.ok(stat.size <= MAX_STARTUP_LOG_BYTES, `expected <= ${MAX_STARTUP_LOG_BYTES}, got ${stat.size}`);
    const rotatedLines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    const lastEntry = JSON.parse(rotatedLines.at(-1));
    assert.ok(lastEntry.message.startsWith('entry-239-'));
    // Every retained line must remain valid JSON after truncation
    for (const line of rotatedLines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }

    // Never throws when app.getPath fails or target directory is invalid
    const badLogger = createStartupLogger({
      app: { getPath: () => { throw new Error('no userData'); } },
      product: { id: 'stronghold' },
    });
    assert.equal(badLogger('startup'), false);
    const blockedPath = path.join(logPath, 'cannot-be-file');
    assert.equal(appendStartupLog(blockedPath, { event: 'fail' }), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('electron/*.cjs modules pass Node syntax check and main.cjs includes all startup guards', () => {
  const root = path.resolve(__dirname, '..');
  const electronDir = path.join(root, 'electron');
  const cjsFiles = fs.readdirSync(electronDir).filter((f) => f.endsWith('.cjs'));
  assert.ok(cjsFiles.length >= 6);
  for (const file of cjsFiles) {
    execFileSync(process.execPath, ['--check', path.join(electronDir, file)], { stdio: 'pipe' });
  }

  const mainSource = fs.readFileSync(path.join(electronDir, 'main.cjs'), 'utf8');
  assert.ok(mainSource.includes('applyStartupGpuWorkarounds'));
  assert.ok(mainSource.includes('readStartupPrefs'));
  assert.ok(mainSource.includes('writeStartupPrefs'));
  assert.ok(mainSource.includes('shouldRelaunchForRenderProcessGone'));
  assert.ok(mainSource.includes("once('did-finish-load'"));
  assert.ok(mainSource.includes("logStartup('safe-gpu-pref-saved')"));
  assert.ok(mainSource.includes("logStartup('renderer-safe-relaunch'"));
  assert.ok(mainSource.indexOf('desktop.useIsolatedUserData') < mainSource.indexOf('applyStartupGpuWorkarounds('));
  assert.ok(!/\bapp\.relaunch\(\s*\)/.test(mainSource), 'must not call bare app.relaunch() without args');
  assert.ok(!mainSource.includes('显存或系统资源压力'), 'must not show misleading VRAM pressure dialog text');
  assert.ok(mainSource.includes('终端渲染进程意外中断（《明日方舟》运行不受影响）。'));
  assert.ok(mainSource.includes('sandbox: !safeGpuMode'));
  assert.ok(mainSource.includes("app.on('child-process-gone'"));
  assert.ok(mainSource.includes("mainWindow.webContents.on('did-fail-load'"));
  assert.ok(mainSource.includes('ready-to-show-timeout'));
  assert.ok(mainSource.includes('8000'));
  assert.ok(mainSource.includes("logStartup('tray-init-failed'"));
  assert.ok(mainSource.includes("logStartup('userdata-init-failed'"));
  assert.ok(!mainSource.includes('PRTS Stronghold') && !mainSource.includes('卫戍战报仪'), 'must not hardcode a single product name');
});

test('readStartupPrefs and writeStartupPrefs tolerate missing/corrupt files and persist safe GPU preference', () => {
  assert.deepEqual(readStartupPrefs(''), {});
  assert.equal(writeStartupPrefs('', { preferSafeGpu: true }), false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-startup-prefs-'));
  try {
    const nestedDir = path.join(tmpDir, 'nested', 'profile');
    assert.deepEqual(readStartupPrefs(nestedDir), {});

    // Corrupted JSON & non-object JSON fall back cleanly
    fs.mkdirSync(nestedDir, { recursive: true });
    const prefsFile = path.join(nestedDir, 'startup-prefs.json');
    fs.writeFileSync(prefsFile, '{not-valid-json', 'utf8');
    assert.deepEqual(readStartupPrefs(nestedDir), {});
    fs.writeFileSync(prefsFile, '[1, 2, 3]', 'utf8');
    assert.deepEqual(readStartupPrefs(nestedDir), {});

    // Write + read roundtrip creates dir automatically
    const freshDir = path.join(tmpDir, 'auto', 'created');
    assert.equal(
      writeStartupPrefs(freshDir, {
        preferSafeGpu: true,
        reason: 'auto-recovery',
        updatedAt: '2026-11-26T00:00:00.000Z',
      }),
      true,
    );
    assert.deepEqual(readStartupPrefs(freshDir), {
      preferSafeGpu: true,
      reason: 'auto-recovery',
      updatedAt: '2026-11-26T00:00:00.000Z',
    });

    // Clear preference
    assert.equal(writeStartupPrefs(freshDir, { preferSafeGpu: false, reason: 'manual-normal-gpu' }), true);
    const cleared = readStartupPrefs(freshDir);
    assert.equal(cleared.preferSafeGpu, false);
    assert.equal(cleared.reason, 'manual-normal-gpu');
    assert.ok(typeof cleared.updatedAt === 'string' && cleared.updatedAt.length > 0);

    // IO failure returns false without throwing
    const blockedFile = path.join(tmpDir, 'blocked-as-file');
    fs.writeFileSync(blockedFile, 'x', 'utf8');
    assert.equal(writeStartupPrefs(blockedFile, { preferSafeGpu: true }), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('isSafeGpuMode honors startupPrefs and --prts-normal-gpu override, and buildSafeGpuRelaunchArgs strips --prts-normal-gpu', () => {
  assert.equal(isSafeGpuMode({ argv: ['app.exe'], startupPrefs: { preferSafeGpu: true } }), true);
  assert.equal(
    isSafeGpuMode({
      argv: ['app.exe', '--prts-normal-gpu', '--prts-safe-gpu', '--disable-gpu'],
      commandLine: { hasSwitch: () => true },
      startupPrefs: { preferSafeGpu: true },
    }),
    false,
  );

  const switchesNormalOverride = [];
  let hwDisabledOverride = false;
  const overrideResult = applyStartupGpuWorkarounds({
    platform: 'win32',
    argv: ['app.exe', '--prts-normal-gpu'],
    startupPrefs: { preferSafeGpu: true },
    app: {
      disableHardwareAcceleration: () => { hwDisabledOverride = true; },
      commandLine: {
        hasSwitch: () => false,
        appendSwitch: (s) => switchesNormalOverride.push(s),
      },
    },
  });
  assert.equal(overrideResult, false);
  assert.equal(hwDisabledOverride, false);
  assert.deepEqual(switchesNormalOverride, ['disable-gpu-sandbox']);

  const switchesPrefSafe = [];
  let hwDisabledPrefSafe = false;
  const prefSafeResult = applyStartupGpuWorkarounds({
    platform: 'win32',
    argv: ['app.exe'],
    startupPrefs: { preferSafeGpu: true },
    app: {
      disableHardwareAcceleration: () => { hwDisabledPrefSafe = true; },
      commandLine: {
        hasSwitch: () => false,
        appendSwitch: (s) => switchesPrefSafe.push(s),
      },
    },
  });
  assert.equal(prefSafeResult, true);
  assert.equal(hwDisabledPrefSafe, true);
  assert.ok(switchesPrefSafe.includes('disable-gpu'));
  assert.ok(switchesPrefSafe.includes('no-sandbox'));

  assert.deepEqual(
    buildSafeGpuRelaunchArgs(['C:\\app.exe', '--prts-normal-gpu', '--foo']),
    ['--foo', '--prts-safe-gpu', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
  );
});

test('shouldRelaunchForRenderProcessGone prevents popup loops and allows single in-game reload', () => {
  // Startup crash before main window shown -> immediate safe relaunch
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'crashed', exitCode: -1073741819 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 0 },
    ),
    true,
  );
  // Sandbox launch-failed even if window marked shown -> immediate safe relaunch
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'launch-failed', exitCode: 18 },
      { mainWindowShown: true, safeGpuMode: false, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 0 },
    ),
    true,
  );
  // First in-game transient crash -> allow one in-place reload first
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'oom', exitCode: -536870904 },
      { mainWindowShown: true, safeGpuMode: false, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 0 },
    ),
    false,
  );
  // Second crash within 60s -> escalate to safe GPU relaunch
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'crashed', exitCode: 1 },
      { mainWindowShown: true, safeGpuMode: false, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 1 },
    ),
    true,
  );
  // Guards: clean-exit, missing details, already safeGpuMode, already relaunched, or quitting
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'clean-exit', exitCode: 0 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 2 },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      null,
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 0 },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: true, hasRelaunched: false, isQuitting: false, rendererRecoverCount: 0 },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: true, isQuitting: false, rendererRecoverCount: 0 },
    ),
    false,
  );
  assert.equal(
    shouldRelaunchForRenderProcessGone(
      { reason: 'crashed', exitCode: 1 },
      { mainWindowShown: false, safeGpuMode: false, hasRelaunched: false, isQuitting: true, rendererRecoverCount: 0 },
    ),
    false,
  );
});

test('createStartupLogger preserves mainWindowShown and rendererRecoverCount fields', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-startup-fields-'));
  try {
    const logStartup = createStartupLogger({
      app: { getPath: () => tmpDir, getVersion: () => '2.0.1' },
      product: { id: 'stronghold' },
      safeGpuMode: false,
    });
    assert.equal(
      logStartup('renderer-safe-relaunch', {
        reason: 'launch-failed',
        exitCode: 18,
        mainWindowShown: false,
        rendererRecoverCount: 0,
      }),
      true,
    );
    const [entry] = fs.readFileSync(path.join(tmpDir, 'startup.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(entry.mainWindowShown, false);
    assert.equal(entry.rendererRecoverCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('NSIS portable startup script retries once in safe GPU mode, preserves splash, and alerts on failure', () => {
  const root = path.resolve(__dirname, '..');
  const nsis = require('app-builder-lib/out/targets/nsis/nsisUtil.js');
  const stock = fs.readFileSync(path.join(nsis.nsisTemplatesDir, 'portable.nsi'), 'utf8');
  const patched = patchPortableNsiTemplate(stock);

  assert.ok(patched.includes('StrCpy $prtsSawWindow "0"'));
  assert.ok(patched.includes('StrCpy $prtsRetriedSafe "0"'));

  const startupNsh = fs.readFileSync(path.join(root, 'scripts', 'windows-startup.nsh'), 'utf8');
  assert.ok(startupNsh.includes('Var prtsSawWindow'));
  assert.ok(startupNsh.includes('Var prtsRetriedSafe'));
  assert.ok(startupNsh.includes('StrCpy $prtsSawWindow "1"'));
  assert.ok(startupNsh.includes('--prts-safe-gpu --disable-gpu --disable-gpu-sandbox --no-sandbox'));
  assert.ok(startupNsh.includes('Push $0') && startupNsh.includes('Pop $0'));
  assert.ok(startupNsh.includes('退出码：$0'));
  assert.ok(startupNsh.includes('ToDesk'));
  assert.ok(startupNsh.includes('startup.log'));
  assert.ok(startupNsh.includes('Delete "$INSTDIR\\.prts-ready"'));
});
