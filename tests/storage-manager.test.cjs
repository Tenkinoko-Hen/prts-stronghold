// 青逝痕 Tenkinoko 制作
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildMigrationScript,
  buildUninstallCleanupScript,
  discoverCDriveResidues,
  isSameOrSubPath,
  isSystemDrivePath,
  readPointerIni,
  resolveBootstrapStorage,
  validateMigrationTarget,
  writePointerIni,
} = require('../electron/storage-manager.cjs');

test('pointer INI round-trips paths including Chinese characters and spaces', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-storage-ini-'));
  try {
    const ini = path.join(tmp, 'sub', 'storage-root.ini');
    const target = path.join(tmp, '卫戍 协议 Data');
    writePointerIni(ini, target);
    assert.equal(readPointerIni(ini), path.resolve(target));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveBootstrapStorage auto-places next to EXE on non-C drive and preserves pointer across updates', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-storage-boot-'));
  try {
    const fakeLocalAppData = path.join(tmp, 'local');
    const fakeNonCExeDir = path.join(tmp, 'non-c-drive');
    fs.mkdirSync(fakeNonCExeDir, { recursive: true });

    const setPaths = {};
    const switches = [];
    const fakeApp = {
      setPath: (k, v) => { setPaths[k] = v; },
      getPath: (k) => path.join(tmp, k),
      commandLine: { appendSwitch: (k, v) => switches.push([k, v]) },
    };
    const product = { id: 'stronghold', mode: 'stronghold', desktop: { appId: 'com.test', useIsolatedUserData: false } };

    // Use synthetic SystemDrive="Z:" so tmp (on C:) behaves as a non-system drive
    const env = { LOCALAPPDATA: fakeLocalAppData, SystemDrive: 'Z:' };
    const boot1 = resolveBootstrapStorage({
      product,
      app: fakeApp,
      env,
      portableDir: fakeNonCExeDir,
      platform: 'win32',
    });

    assert.equal(boot1.source, 'auto-exedir');
    assert.equal(boot1.dataRoot, path.join(fakeNonCExeDir, 'PRTS-Data'));
    assert.equal(setPaths.userData, path.join(fakeNonCExeDir, 'PRTS-Data', 'stronghold', 'profile'));
    assert.ok(fs.existsSync(boot1.pointerFile));
    assert.ok(fs.existsSync(path.join(fakeNonCExeDir, 'prts-portable.ini')));
    assert.ok(switches.some(([k]) => k === 'disk-cache-size'));

    // Next update EXE placed in a different directory still inherits the saved pointer!
    const otherDir = path.join(tmp, 'new-version-folder');
    fs.mkdirSync(otherDir, { recursive: true });
    const boot2 = resolveBootstrapStorage({
      product,
      app: fakeApp,
      env,
      portableDir: otherDir,
      platform: 'win32',
    });
    assert.equal(boot2.source, 'pointer-ini');
    assert.equal(boot2.dataRoot, path.join(fakeNonCExeDir, 'PRTS-Data'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validateMigrationTarget rejects drive roots, system paths, recursive child dirs, and warns on C:/OneDrive', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-storage-val-'));
  try {
    const current = path.join(tmp, 'current');
    const nested = path.join(current, 'nested');
    const clean = path.join(tmp, 'OneDrive', 'PRTS-Data');
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(clean, { recursive: true });

    assert.equal(validateMigrationTarget({ currentRoot: current, targetDir: 'D:\\' }).ok, false);
    assert.equal(validateMigrationTarget({ currentRoot: current, targetDir: 'C:\\Windows\\PRTS', env: { SystemDrive: 'C:' } }).ok, false);
    assert.equal(validateMigrationTarget({ currentRoot: current, targetDir: current }).ok, false);
    assert.equal(validateMigrationTarget({ currentRoot: current, targetDir: nested }).ok, false);

    const okRes = validateMigrationTarget({
      currentRoot: current,
      targetDir: clean,
      requiredBytes: 1024,
      env: { SystemDrive: 'Z:' },
    });
    assert.equal(okRes.ok, true);
    assert.match(okRes.warning, /OneDrive/);
    assert.equal(isSameOrSubPath(nested, current), true);
    assert.equal(isSystemDrivePath('C:\\Users\\test', { SystemDrive: 'C:' }), true);
    assert.equal(isSystemDrivePath('D:\\PRTS-Data', { SystemDrive: 'C:' }), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('discoverCDriveResidues distinguishes active vs cleanable directories and scripts escape paths safely', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-storage-clean-'));
  try {
    const fakeLocal = path.join(tmp, 'Local');
    const fakeRoaming = path.join(tmp, 'Roaming');
    const fakeTemp = path.join(tmp, 'Temp');
    const fullCache = path.join(fakeLocal, 'PRTS-Cache', 'PRTS Stronghold');
    const liteCache = path.join(fakeLocal, 'PRTS-Cache', 'PRTS Stronghold Lite');
    fs.mkdirSync(fullCache, { recursive: true });
    fs.mkdirSync(liteCache, { recursive: true });
    fs.writeFileSync(path.join(fullCache, 'bin.dat'), Buffer.alloc(1024));
    fs.writeFileSync(path.join(liteCache, 'bin.dat'), Buffer.alloc(2048));

    const sysDrive = path.parse(tmp).root.replace(/\\+$/, '');
    const items = discoverCDriveResidues({
      env: { LOCALAPPDATA: fakeLocal, APPDATA: fakeRoaming, TEMP: fakeTemp, SystemDrive: sysDrive },
      activeRuntimeCacheDir: fullCache,
      execPath: path.join(fullCache, 'app.exe'),
    });
    const fullItem = items.find((i) => i.id === 'prts-cache-full');
    const liteItem = items.find((i) => i.id === 'prts-cache-lite');
    assert.ok(fullItem);
    assert.ok(liteItem);
    assert.equal(fullItem.isActive, true);
    assert.equal(fullItem.canCleanNow, false);
    assert.equal(liteItem.isActive, false);
    assert.equal(liteItem.canCleanNow, true);
    assert.equal(liteItem.bytes, 2048);

    const migScript = buildMigrationScript({
      waitPid: 1234,
      oldProfileDir: "C:\\Users\\a'b\\AppData",
      newProfileDir: 'D:\\PRTS-Data\\stronghold\\profile',
      oldReportsDir: '',
      newReportsDir: '',
      includeReports: false,
      oldRuntimeCacheDir: fullCache,
      pointerFile: path.join(fakeLocal, 'PRTS-Stronghold', 'storage-root.ini'),
      portableIni: null,
      newDataRoot: 'D:\\PRTS-Data',
      relaunchExe: 'D:\\PRTS.exe',
      relaunchArgs: [],
    });
    assert.match(migScript, /a''b/);
    assert.match(migScript, /robocopy/);

    const uninstallScript = buildUninstallCleanupScript({ waitPid: 1234, pathsToDelete: [fullCache, liteCache] });
    assert.match(uninstallScript, /Stop-Process/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
