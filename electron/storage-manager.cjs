// 青逝痕 Tenkinoko 制作
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DISK_CACHE_LIMIT_BYTES = 64 * 1024 * 1024; // 64 MiB Chromium disk cache ceiling
const MIN_FREE_MARGIN_BYTES = 300 * 1024 * 1024; // 300 MiB safety margin

function productStorageKey(product) {
  return product?.id === 'telemetry' || product?.mode === 'telemetry' ? 'telemetry' : 'stronghold';
}

function getPointerFilePath(product, env = process.env) {
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const key = productStorageKey(product);
  const name = key === 'telemetry' ? 'storage-root-telemetry.ini' : 'storage-root.ini';
  return path.join(localAppData, 'PRTS-Stronghold', name);
}

function isSystemDrivePath(targetPath, env = process.env) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const sysDrive = (env.SystemDrive || 'C:').replace(/\\+$/, '').toLowerCase();
  const normalized = path.resolve(targetPath).toLowerCase();
  return normalized.startsWith(`${sysDrive}\\`) || normalized === sysDrive;
}

function readPointerIni(iniPath) {
  try {
    if (!iniPath || !fs.existsSync(iniPath)) return null;
    const raw = fs.readFileSync(iniPath, 'utf8').replace(/^\uFEFF/, '');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
      const m = /^dataRoot\s*=\s*(.+)$/i.exec(trimmed);
      if (m && m[1].trim()) {
        return path.resolve(m[1].trim().replace(/^"(.*)"$/, '$1'));
      }
    }
  } catch {
    // ignore malformed pointer
  }
  return null;
}

function writePointerIni(iniPath, dataRoot) {
  const dir = path.dirname(iniPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = `[storage]\r\ndataRoot=${path.resolve(dataRoot)}\r\n`;
  const tmp = `${iniPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, iniPath);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
}

function canWriteDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.prts-write-probe-${process.pid}-${crypto.randomBytes(3).toString('hex')}.tmp`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

function getFreeBytesForPath(targetPath) {
  try {
    let probe = path.resolve(targetPath);
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    if (typeof fs.statfsSync === 'function' && fs.existsSync(probe)) {
      const st = fs.statfsSync(probe);
      return Number(st.bavail) * Number(st.bsize);
    }
  } catch {
    // ignore statfs errors
  }
  return null;
}

function measureDirBytes(dirPath, maxEntries = 20000) {
  if (!dirPath || !fs.existsSync(dirPath)) return 0;
  let total = 0;
  let count = 0;
  const stack = [dirPath];
  while (stack.length > 0 && count < maxEntries) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++count > maxEntries) break;
      const full = path.join(current, entry.name);
      try {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          total += fs.statSync(full).size;
        }
      } catch {
        // ignore transient locked files
      }
    }
  }
  return total;
}

function isSameOrSubPath(childPath, parentPath) {
  if (!childPath || !parentPath) return false;
  const c = path.resolve(childPath).toLowerCase();
  const p = path.resolve(parentPath).toLowerCase();
  if (c === p) return true;
  const prefix = p.endsWith(path.sep) ? p : `${p}${path.sep}`;
  return c.startsWith(prefix);
}

/**
 * Bootstrap storage resolution executed BEFORE Electron app.requestSingleInstanceLock() / app.whenReady().
 * Follows user preference:
 *   1) Honor PRTS_DATA_ROOT env var (from NSIS launcher) or existing pointer INI (preserves path across updates)
 *   2) If running portable EXE on a writable non-C: drive with no pointer yet, auto-place in <EXEDIR>\PRTS-Data
 *   3) Otherwise keep legacy AppData until user migrates (or NSIS first-run picker chooses a path)
 */
function resolveBootstrapStorage({
  product,
  app,
  env = process.env,
  portableDir = env.PORTABLE_EXECUTABLE_DIR || '',
  platform = process.platform,
}) {
  const key = productStorageKey(product);
  const pointerFile = getPointerFilePath(product, env);
  const portableIni = portableDir ? path.join(path.resolve(portableDir), 'prts-portable.ini') : null;

  let dataRoot = null;
  let source = 'legacy-appdata';

  const envRoot = typeof env.PRTS_DATA_ROOT === 'string' && env.PRTS_DATA_ROOT.trim()
    ? path.resolve(env.PRTS_DATA_ROOT.trim())
    : null;
  const portableIniRoot = portableIni ? readPointerIni(portableIni) : null;
  const pointerIniRoot = readPointerIni(pointerFile);

  if (envRoot && canWriteDir(envRoot)) {
    dataRoot = envRoot;
    source = 'env';
  } else if (portableIniRoot && canWriteDir(portableIniRoot)) {
    dataRoot = portableIniRoot;
    source = 'portable-ini';
  } else if (pointerIniRoot && canWriteDir(pointerIniRoot)) {
    dataRoot = pointerIniRoot;
    source = 'pointer-ini';
  } else if (platform === 'win32' && portableDir && !isSystemDrivePath(portableDir, env)) {
    const autoCandidate = path.join(path.resolve(portableDir), 'PRTS-Data');
    if (canWriteDir(autoCandidate)) {
      dataRoot = autoCandidate;
      source = 'auto-exedir';
      try { writePointerIni(pointerFile, dataRoot); } catch {}
      if (portableIni) {
        try { writePointerIni(portableIni, dataRoot); } catch {}
      }
    }
  }

  let productDir = null;
  let profileDir = null;
  let runtimeCacheDir = null;
  let defaultReportDir = null;
  let crashDumpsDir = null;
  let initError = null;

  if (dataRoot) {
    productDir = path.join(dataRoot, key);
    profileDir = path.join(productDir, 'profile');
    runtimeCacheDir = path.join(productDir, 'runtime-cache');
    defaultReportDir = path.join(productDir, 'BattleReports');
    crashDumpsDir = path.join(productDir, 'crash-dumps');
    if (app) {
      try {
        fs.mkdirSync(profileDir, { recursive: true });
        fs.mkdirSync(crashDumpsDir, { recursive: true });
        app.setPath('userData', profileDir);
        app.setPath('sessionData', profileDir);
        app.setPath('crashDumps', crashDumpsDir);
      } catch (err) {
        initError = err;
      }
    }
  } else if (app && product?.desktop?.useIsolatedUserData) {
    try {
      const legacyIsolated = path.join(app.getPath('appData'), product.desktop.appId);
      fs.mkdirSync(legacyIsolated, { recursive: true });
      app.setPath('userData', legacyIsolated);
      app.setPath('sessionData', legacyIsolated);
      profileDir = legacyIsolated;
    } catch (err) {
      initError = err;
    }
  }

  if (app && app.commandLine && typeof app.commandLine.appendSwitch === 'function') {
    try {
      app.commandLine.appendSwitch('disk-cache-size', String(DISK_CACHE_LIMIT_BYTES));
    } catch {}
  }

  return {
    productKey: key,
    dataRoot,
    productDir,
    profileDir,
    runtimeCacheDir,
    defaultReportDir,
    crashDumpsDir,
    pointerFile,
    portableIni,
    portableDir: portableDir ? path.resolve(portableDir) : '',
    source,
    initError,
  };
}

function validateMigrationTarget({
  currentRoot,
  currentProfileDir,
  targetDir,
  requiredBytes = 0,
  env = process.env,
}) {
  if (!targetDir || typeof targetDir !== 'string' || !targetDir.trim()) {
    return { ok: false, error: '请选择有效的目标目录。' };
  }
  const normalized = path.resolve(targetDir.trim());
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return { ok: false, error: '不能直接选择磁盘根目录，请新建或选择一个子文件夹（例如 D:\\PRTS-Data）。' };
  }
  const sysDrive = (env.SystemDrive || 'C:').replace(/\\+$/, '').toLowerCase();
  const lower = normalized.toLowerCase();
  const forbiddenPrefixes = [
    `${sysDrive}\\windows`,
    `${sysDrive}\\program files`,
    `${sysDrive}\\program files (x86)`,
    `${sysDrive}\\programdata`,
  ];
  for (const prefix of forbiddenPrefixes) {
    if (lower === prefix || lower.startsWith(`${prefix}\\`)) {
      return { ok: false, error: '不能选择系统目录作为数据存储路径，请改选其他可写目录。' };
    }
  }
  if (currentRoot && path.resolve(currentRoot).toLowerCase() === lower) {
    return { ok: false, error: '新路径与当前存储路径相同，无需迁移。' };
  }
  if (currentRoot && isSameOrSubPath(normalized, currentRoot)) {
    return { ok: false, error: '目标路径不能位于当前数据目录内部，请选一个并列的新目录。' };
  }
  if (currentProfileDir && isSameOrSubPath(normalized, currentProfileDir)) {
    return { ok: false, error: '目标路径不能位于当前配置目录内部，请选一个独立目录。' };
  }
  if (!canWriteDir(normalized)) {
    return { ok: false, error: '所选目录不可写或无权限访问，请换一个目录。' };
  }
  const freeBytes = getFreeBytesForPath(normalized);
  const needed = Math.max(MIN_FREE_MARGIN_BYTES, Math.round(requiredBytes * 1.5) + 150 * 1024 * 1024);
  if (freeBytes !== null && freeBytes < needed) {
    const needMb = Math.ceil(needed / (1024 * 1024));
    const freeMb = Math.floor(freeBytes / (1024 * 1024));
    return {
      ok: false,
      error: `目标磁盘可用空间不足（需要至少 ${needMb} MB，当前剩余 ${freeMb} MB）。`,
      freeBytes,
    };
  }
  const warnings = [];
  if (isSystemDrivePath(normalized, env)) {
    warnings.push('所选目录仍位于 C 盘，建议选择 D / E / J 等非系统盘。');
  }
  if (/onedrive/i.test(normalized)) {
    warnings.push('检测到 OneDrive 同步目录，云同步可能锁定数据库文件导致异常，建议避开 OneDrive。');
  }
  return {
    ok: true,
    normalizedPath: normalized,
    freeBytes,
    warning: warnings.join(' '),
  };
}

function discoverCDriveResidues({
  env = process.env,
  activeProfileDir = '',
  activeRuntimeCacheDir = '',
  activeReportDir = '',
  execPath = process.execPath,
}) {
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const appData = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const tempDir = env.TEMP || os.tmpdir();
  const docsDir = path.join(os.homedir(), 'Documents');

  const candidates = [
    {
      id: 'prts-cache-full',
      label: 'C 盘 Full 运行解包缓存',
      description: '旧版便携 EXE 在 C 盘释放的 Electron 运行时与采集内核（~500 MB）',
      dir: path.join(localAppData, 'PRTS-Cache', 'PRTS Stronghold'),
      category: 'cache',
    },
    {
      id: 'prts-cache-lite',
      label: 'C 盘 Lite 运行解包缓存',
      description: '旧版 Lite 便携 EXE 在 C 盘释放的运行时缓存（~390 MB）',
      dir: path.join(localAppData, 'PRTS-Cache', 'PRTS Stronghold Lite'),
      category: 'cache',
    },
    {
      id: 'prts-temp-cache',
      label: 'C 盘临时目录解包缓存',
      description: '临时目录中的 PRTS 历史解包残留',
      dir: path.join(tempDir, 'PRTS-Cache'),
      category: 'cache',
    },
    {
      id: 'appdata-full',
      label: 'C 盘 Full 配置 / 热更 / BGM 数据',
      description: 'AppData\\Roaming 下的热更槽位、浏览器缓存与本地电台配置',
      dir: path.join(appData, 'PRTS Stronghold'),
      category: 'profile',
    },
    {
      id: 'appdata-dev',
      label: 'C 盘历史/开发配置目录',
      description: 'AppData\\Roaming\\prts-stronghold 遗留缓存',
      dir: path.join(appData, 'prts-stronghold'),
      category: 'profile',
    },
    {
      id: 'appdata-lite',
      label: 'C 盘 Lite 配置目录',
      description: 'AppData\\Roaming\\com.stronghold.telemetry 配置文件',
      dir: path.join(appData, 'com.stronghold.telemetry'),
      category: 'profile',
    },
    {
      id: 'docs-reports-full',
      label: '我的文档 · Full 历史战报',
      description: 'Documents\\PRTS Stronghold 中保存的对局战报 JSON',
      dir: path.join(docsDir, 'PRTS Stronghold'),
      category: 'reports',
    },
    {
      id: 'docs-reports-lite',
      label: '我的文档 · Lite 历史战报',
      description: 'Documents\\PRTS Stronghold Lite 中保存的对局战报 JSON',
      dir: path.join(docsDir, 'PRTS Stronghold Lite'),
      category: 'reports',
    },
    {
      id: 'pointer-dir',
      label: '路径引导指针（仅彻底卸载时清理）',
      description: '仅占约 150 字节，用于新版 EXE 记住你选择的数据盘位置',
      dir: path.join(localAppData, 'PRTS-Stronghold'),
      category: 'pointer',
    },
  ];

  const items = [];
  for (const c of candidates) {
    if (!isSystemDrivePath(c.dir, env)) continue;
    if (!fs.existsSync(c.dir)) continue;
    const isActive = isSameOrSubPath(activeProfileDir, c.dir)
      || isSameOrSubPath(activeRuntimeCacheDir, c.dir)
      || isSameOrSubPath(activeReportDir, c.dir)
      || isSameOrSubPath(execPath, c.dir);
    const bytes = measureDirBytes(c.dir);
    items.push({
      id: c.id,
      label: c.label,
      description: c.description,
      path: c.dir,
      category: c.category,
      bytes,
      isActive,
      canCleanNow: !isActive && c.category !== 'pointer',
    });
  }
  return items;
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildMigrationScript({
  waitPid,
  oldProfileDir,
  newProfileDir,
  oldReportsDir,
  newReportsDir,
  includeReports,
  oldRuntimeCacheDir,
  pointerFile,
  portableIni,
  newDataRoot,
  relaunchExe,
  relaunchArgs,
}) {
  const lines = [
    '$ErrorActionPreference = "Stop"',
    `$waitPid = ${Number(waitPid) || 0}`,
    'if ($waitPid -gt 0) {',
    '  for ($i = 0; $i -lt 60; $i++) {',
    '    if (-not (Get-Process -Id $waitPid -ErrorAction SilentlyContinue)) { break }',
    '    Start-Sleep -Milliseconds 250',
    '  }',
    '}',
    'Get-Process -Name "PRTS-Worker" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 300',
    'function SafeCopyDir([string]$src, [string]$dst) {',
    '  if (-not $src -or -not (Test-Path $src)) { return }',
    '  New-Item -ItemType Directory -Force -Path $dst | Out-Null',
    '  & robocopy $src $dst /E /COPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null',
    '  if ($LASTEXITCODE -ge 8) { throw "Robocopy failed ($LASTEXITCODE): $src -> $dst" }',
    '}',
    `SafeCopyDir ${psQuote(oldProfileDir)} ${psQuote(newProfileDir)}`,
  ];
  if (includeReports && oldReportsDir && newReportsDir && path.resolve(oldReportsDir).toLowerCase() !== path.resolve(newReportsDir).toLowerCase()) {
    lines.push(`SafeCopyDir ${psQuote(oldReportsDir)} ${psQuote(newReportsDir)}`);
  }
  const writeIniLines = (targetIni) => [
    `$iniDir = Split-Path -Parent ${psQuote(targetIni)}`,
    'New-Item -ItemType Directory -Force -Path $iniDir | Out-Null',
    `[System.IO.File]::WriteAllText(${psQuote(targetIni)}, "[storage]\`r\`ndataRoot=" + ${psQuote(newDataRoot)} + "\`r\`n", (New-Object System.Text.UTF8Encoding($false)))`,
  ];
  lines.push(...writeIniLines(pointerFile));
  if (portableIni) {
    lines.push(...writeIniLines(portableIni));
  }
  // Remove old profile and old runtime cache ONLY after copy & pointer switch succeeded
  lines.push(
    `if (${psQuote(oldProfileDir)} -and (Test-Path ${psQuote(oldProfileDir)})) { Remove-Item -Path ${psQuote(oldProfileDir)} -Recurse -Force -ErrorAction SilentlyContinue }`,
  );
  if (oldRuntimeCacheDir) {
    lines.push(
      `if (${psQuote(oldRuntimeCacheDir)} -and (Test-Path ${psQuote(oldRuntimeCacheDir)})) { Remove-Item -Path ${psQuote(oldRuntimeCacheDir)} -Recurse -Force -ErrorAction SilentlyContinue }`,
    );
  }
  lines.push(
    `$env:PRTS_DATA_ROOT = ${psQuote(newDataRoot)}`,
    `$argList = @(${(relaunchArgs || []).map(psQuote).join(', ')})`,
    `if ($argList.Count -gt 0) { Start-Process -FilePath ${psQuote(relaunchExe)} -ArgumentList $argList } else { Start-Process -FilePath ${psQuote(relaunchExe)} }`,
    'Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue',
  );
  return `${lines.join('\r\n')}\r\n`;
}

function buildUninstallCleanupScript({ waitPid, pathsToDelete }) {
  const safePaths = pathsToDelete.filter(Boolean);
  const lines = [
    `$waitPid = ${Number(waitPid) || 0}`,
    'if ($waitPid -gt 0) {',
    '  for ($i = 0; $i -lt 60; $i++) {',
    '    if (-not (Get-Process -Id $waitPid -ErrorAction SilentlyContinue)) { break }',
    '    Start-Sleep -Milliseconds 250',
    '  }',
    '}',
    'Get-Process -Name "PRTS-Worker","PRTS Stronghold","PRTS Stronghold Lite" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 400',
    `$targets = @(${safePaths.map(psQuote).join(', ')})`,
    '$removed = 0',
    'foreach ($p in $targets) {',
    '  if ($p -and (Test-Path $p)) {',
    '    Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue',
    '    if (-not (Test-Path $p)) { $removed++ }',
    '  }',
    '}',
    'Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue',
    '[System.Windows.Forms.MessageBox]::Show("已完成 PRTS C 盘残留文件清理（已清除 $removed 个目录）。`r`n`r`n若需彻底卸载软件，直接删除主程序 EXE 即可。", "PRTS Stronghold 清理完成", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null',
    'Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function installStorageManager({
  app,
  ipcMain,
  dialog,
  shell,
  session,
  getMainWindow,
  isTrustedSender,
  bootstrap,
  product,
  reportStore,
  onBeforeQuitForMigration,
}) {
  const key = bootstrap.productKey;
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  function resolveCurrentRuntimeCacheDir() {
    if (bootstrap.runtimeCacheDir && fs.existsSync(bootstrap.runtimeCacheDir)) {
      return bootstrap.runtimeCacheDir;
    }
    const legacyName = product?.desktop?.productName || (key === 'telemetry' ? 'PRTS Stronghold Lite' : 'PRTS Stronghold');
    const legacyCache = path.join(localAppData, 'PRTS-Cache', legacyName);
    if (fs.existsSync(legacyCache)) return legacyCache;
    return null;
  }

  function buildOverview() {
    const profileDir = app.getPath('userData');
    const reportCfg = reportStore?.getConfig ? reportStore.getConfig() : null;
    const reportDir = reportCfg?.dir || bootstrap.defaultReportDir || '';
    const runtimeCacheDir = resolveCurrentRuntimeCacheDir();
    const effectiveRoot = bootstrap.dataRoot || profileDir;

    const runtimeCacheBytes = runtimeCacheDir ? measureDirBytes(runtimeCacheDir) : 0;
    const profileBytes = measureDirBytes(profileDir);
    const hotUpdateBytes = measureDirBytes(path.join(profileDir, 'hot-update'));
    const browserCacheBytes =
      measureDirBytes(path.join(profileDir, 'Cache'))
      + measureDirBytes(path.join(profileDir, 'Code Cache'))
      + measureDirBytes(path.join(profileDir, 'GPUCache'));
    const reportsBytes = reportDir ? measureDirBytes(reportDir) : 0;

    const cDriveResidues = discoverCDriveResidues({
      env: process.env,
      activeProfileDir: profileDir,
      activeRuntimeCacheDir: runtimeCacheDir || '',
      activeReportDir: reportDir,
      execPath: process.execPath,
    });
    const cDriveTotalBytes = cDriveResidues.reduce((s, item) => s + item.bytes, 0);
    const cDriveCleanableBytes = cDriveResidues.filter((i) => i.canCleanNow).reduce((s, item) => s + item.bytes, 0);

    const sysDriveRoot = `${(process.env.SystemDrive || 'C:').replace(/\\+$/, '')}\\`;
    return {
      productKey: key,
      dataRoot: bootstrap.dataRoot,
      effectiveRoot,
      profileDir,
      runtimeCacheDir,
      reportDir,
      portableDir: bootstrap.portableDir,
      source: bootstrap.source,
      isOnSystemDrive: isSystemDrivePath(effectiveRoot),
      freeBytesOnDataDrive: getFreeBytesForPath(effectiveRoot),
      freeBytesOnCDrive: getFreeBytesForPath(sysDriveRoot),
      sizes: {
        runtimeCacheBytes,
        profileBytes,
        hotUpdateBytes,
        browserCacheBytes,
        reportsBytes,
        totalBytes: runtimeCacheBytes + profileBytes + (isSameOrSubPath(reportDir, profileDir) ? 0 : reportsBytes),
      },
      cDriveResidues,
      cDriveTotalBytes,
      cDriveCleanableBytes,
    };
  }

  ipcMain.handle('storage-get-overview', (event) => {
    if (!isTrustedSender(event)) return null;
    return buildOverview();
  });

  ipcMain.handle('storage-choose-root', async (event) => {
    if (!isTrustedSender(event)) return { canceled: true };
    const overview = buildOverview();
    const win = getMainWindow?.();
    const res = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
      title: '选择应用数据存储根目录（建议非 C 盘，如 D:\\PRTS-Data）',
      defaultPath: overview.effectiveRoot,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { canceled: true };
    }
    const chosen = res.filePaths[0];
    const check = validateMigrationTarget({
      currentRoot: overview.dataRoot,
      currentProfileDir: overview.profileDir,
      targetDir: chosen,
      requiredBytes: overview.sizes.profileBytes + overview.sizes.reportsBytes,
    });
    return {
      canceled: false,
      targetDir: chosen,
      ...check,
    };
  });

  ipcMain.handle('storage-migrate-root', async (event, options) => {
    if (!isTrustedSender(event)) return { ok: false, error: '未受信任的调用来源。' };
    const targetDir = typeof options?.targetDir === 'string' ? options.targetDir : '';
    const includeReports = options?.includeReports !== false;
    const overview = buildOverview();
    const check = validateMigrationTarget({
      currentRoot: overview.dataRoot,
      currentProfileDir: overview.profileDir,
      targetDir,
      requiredBytes: overview.sizes.profileBytes + (includeReports ? overview.sizes.reportsBytes : 0),
    });
    if (!check.ok) {
      return { ok: false, error: check.error };
    }

    const newDataRoot = check.normalizedPath;
    const newProductDir = path.join(newDataRoot, key);
    const newProfileDir = path.join(newProductDir, 'profile');
    const newReportsDir = path.join(newProductDir, 'BattleReports');
    const relaunchExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const relaunchArgs = process.env.PORTABLE_EXECUTABLE_FILE ? [] : process.argv.slice(1);

    const script = buildMigrationScript({
      waitPid: process.pid,
      oldProfileDir: overview.profileDir,
      newProfileDir,
      oldReportsDir: overview.reportDir,
      newReportsDir,
      includeReports,
      oldRuntimeCacheDir: overview.runtimeCacheDir,
      pointerFile: bootstrap.pointerFile,
      portableIni: bootstrap.portableIni,
      newDataRoot,
      relaunchExe,
      relaunchArgs,
    });

    const scriptPath = path.join(os.tmpdir(), `prts-migrate-${process.pid}-${Date.now()}.ps1`);
    fs.writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8');

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', scriptPath,
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    setTimeout(() => {
      try { onBeforeQuitForMigration?.(); } catch {}
      try { app.releaseSingleInstanceLock(); } catch {}
      app.exit(0);
    }, 180);

    return { ok: true, newDataRoot, restarting: true };
  });

  ipcMain.handle('storage-open-dir', async (event, targetPath) => {
    if (!isTrustedSender(event)) return false;
    const overview = buildOverview();
    const dir = typeof targetPath === 'string' && targetPath.trim() ? targetPath.trim() : overview.effectiveRoot;
    if (!dir || !fs.existsSync(dir)) return false;
    const err = await shell.openPath(dir);
    return !err;
  });

  ipcMain.handle('storage-clear-cache', async (event) => {
    if (!isTrustedSender(event)) return { ok: false, freedBytes: 0 };
    const before = buildOverview().sizes.browserCacheBytes;
    try {
      if (session?.defaultSession?.clearCache) {
        await session.defaultSession.clearCache();
      }
      if (session?.defaultSession?.clearCodeCaches) {
        await session.defaultSession.clearCodeCaches({});
      }
    } catch {}
    const after = buildOverview().sizes.browserCacheBytes;
    return { ok: true, freedBytes: Math.max(0, before - after), overview: buildOverview() };
  });

  ipcMain.handle('storage-clean-c-residues', async (event, options) => {
    if (!isTrustedSender(event)) return { ok: false, error: '未受信任的调用来源。' };
    const overview = buildOverview();
    const uninstallAll = Boolean(options?.uninstallAll);
    const includeReports = Boolean(options?.includeReports);

    if (uninstallAll) {
      const pathsToDelete = overview.cDriveResidues
        .filter((item) => includeReports || item.category !== 'reports')
        .map((item) => item.path);
      if (pathsToDelete.length === 0) {
        return { ok: true, freedBytes: 0, cleanedCount: 0, exiting: false, overview };
      }
      const script = buildUninstallCleanupScript({ waitPid: process.pid, pathsToDelete });
      const scriptPath = path.join(os.tmpdir(), `prts-uninstall-clean-${process.pid}-${Date.now()}.ps1`);
      fs.writeFileSync(scriptPath, `\uFEFF${script}`, 'utf8');
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      setTimeout(() => {
        try { onBeforeQuitForMigration?.(); } catch {}
        try { app.releaseSingleInstanceLock(); } catch {}
        app.exit(0);
      }, 180);

      return { ok: true, exiting: true, scheduledCount: pathsToDelete.length };
    }

    const wantedIds = Array.isArray(options?.ids) ? new Set(options.ids.map(String)) : null;
    let freedBytes = 0;
    let cleanedCount = 0;
    const failed = [];
    for (const item of overview.cDriveResidues) {
      if (!item.canCleanNow) continue;
      if (wantedIds && !wantedIds.has(item.id)) continue;
      if (!wantedIds && item.category === 'reports' && !includeReports) continue;
      try {
        fs.rmSync(item.path, { recursive: true, force: true });
        if (!fs.existsSync(item.path)) {
          freedBytes += item.bytes;
          cleanedCount += 1;
        } else {
          failed.push(item.label);
        }
      } catch {
        failed.push(item.label);
      }
    }
    return {
      ok: failed.length === 0,
      freedBytes,
      cleanedCount,
      failed,
      exiting: false,
      overview: buildOverview(),
    };
  });

  return { buildOverview };
}

module.exports = {
  DISK_CACHE_LIMIT_BYTES,
  buildMigrationScript,
  buildUninstallCleanupScript,
  discoverCDriveResidues,
  getPointerFilePath,
  installStorageManager,
  isSameOrSubPath,
  isSystemDrivePath,
  measureDirBytes,
  productStorageKey,
  readPointerIni,
  resolveBootstrapStorage,
  validateMigrationTarget,
  writePointerIni,
};
