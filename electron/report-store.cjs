// 青逝痕 Tenkinoko 制作
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_STORED_REPORTS = 100;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const SAFE_FILE_RE = /^report-[A-Za-z0-9._-]{1,88}\.json$/;

function sanitizePart(raw, fallback = 'local') {
  const cleaned = String(raw ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return cleaned || fallback;
}

function storageIdFromRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const seenAt = Number(record.seenAt);
  if (!Number.isFinite(seenAt) || seenAt <= 0) return null;
  const matchRaw = record.report?.match;
  const matchPart = matchRaw === null || matchRaw === undefined ? 'local' : sanitizePart(matchRaw, 'local');
  return `report-${Math.trunc(seenAt)}-${matchPart}`;
}

function filenameFromStorageId(storageId) {
  const base = String(storageId ?? '').replace(/^saved:/, '');
  const candidate = base.endsWith('.json') ? base : `${base}.json`;
  if (!SAFE_FILE_RE.test(candidate) || candidate.includes('..')) return null;
  return candidate;
}

function resolveDefaultReportDir(app, product) {
  const folderName = (product?.desktop?.productName || 'PRTS Stronghold').replace(/[<>:"/\\|?*]/g, '').trim() || 'PRTS Stronghold';
  try {
    const docs = app.getPath('documents');
    if (docs) return path.join(docs, folderName, 'BattleReports');
  } catch {}
  return path.join(app.getPath('userData'), 'battle-reports');
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.rmSync(tmpPath, { force: true }); } catch {}
    throw err;
  }
}

function verifyWritableDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  const probe = path.join(dirPath, `.prts-probe-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(probe, 'ok', 'utf8');
  fs.rmSync(probe, { force: true });
}

function createReportStore({ userDataDir, defaultDir, maxReports = MAX_STORED_REPORTS }) {
  const configFile = path.join(userDataDir, 'report-storage.json');

  function readCustomDir() {
    try {
      if (!fs.existsSync(configFile)) return null;
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (parsed && typeof parsed.customDir === 'string' && parsed.customDir.trim()) {
        return path.resolve(parsed.customDir.trim());
      }
    } catch {}
    return null;
  }

  function writeCustomDir(customDir) {
    atomicWriteJson(configFile, {
      schemaVersion: 1,
      customDir: customDir ? path.resolve(customDir) : null,
      updatedAt: new Date().toISOString(),
    });
  }

  function activeDir() {
    const custom = readCustomDir();
    return custom || path.resolve(defaultDir);
  }

  function listReportFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && SAFE_FILE_RE.test(entry.name))
      .map((entry) => entry.name);
  }

  function getConfig() {
    const custom = readCustomDir();
    const dir = custom || path.resolve(defaultDir);
    let count = 0;
    try {
      count = listReportFiles(dir).length;
    } catch {}
    return {
      dir,
      defaultDir: path.resolve(defaultDir),
      isCustom: Boolean(custom && path.resolve(custom).toLowerCase() !== path.resolve(defaultDir).toLowerCase()),
      count,
      maxCount: maxReports,
    };
  }

  function loadRecords() {
    const dir = activeDir();
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const files = listReportFiles(dir);
    const records = [];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 0 || stat.size > MAX_RECORD_BYTES) continue;
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const rec = parsed && typeof parsed === 'object' && parsed.record ? parsed.record : parsed;
        if (!rec || typeof rec !== 'object' || !rec.report || typeof rec.report !== 'object') continue;
        const seenAt = Number(rec.seenAt);
        if (!Number.isFinite(seenAt) || seenAt <= 0) continue;
        const storageId = file.replace(/\.json$/, '');
        records.push({
          key: `saved:${storageId}`,
          storageId,
          label: typeof rec.label === 'string' && rec.label.trim() ? rec.label : '本地战报',
          seenAt: Math.trunc(seenAt),
          report: rec.report,
          ...(rec.manualNames && typeof rec.manualNames === 'object' ? { manualNames: rec.manualNames } : {}),
          ...(typeof rec.manualSelfSeat === 'number' ? { manualSelfSeat: rec.manualSelfSeat } : {}),
        });
      } catch {
        // Ignore corrupt individual record files so one bad file never breaks history loading.
      }
    }
    records.sort((a, b) => b.seenAt - a.seenAt);
    return {
      config: { ...getConfig(), count: records.length },
      records: records.slice(0, maxReports),
    };
  }

  function trimOldRecords(dir) {
    const files = listReportFiles(dir);
    if (files.length <= maxReports) return;
    const weighted = files.map((file) => {
      const fullPath = path.join(dir, file);
      let ts = 0;
      const m = /^report-(\d+)-/.exec(file);
      if (m) ts = Number(m[1]) || 0;
      if (!ts) {
        try { ts = fs.statSync(fullPath).mtimeMs; } catch {}
      }
      return { file, fullPath, ts };
    });
    weighted.sort((a, b) => b.ts - a.ts);
    for (const victim of weighted.slice(maxReports)) {
      try { fs.rmSync(victim.fullPath, { force: true }); } catch {}
    }
  }

  function saveRecord(record) {
    if (!record || typeof record !== 'object' || !record.report || typeof record.report !== 'object') {
      return { ok: false, error: 'invalid_record' };
    }
    if (typeof record.key === 'string' && record.key.startsWith('demo:')) {
      return { ok: false, error: 'demo_skipped' };
    }
    const rounds = Array.isArray(record.report.rounds) ? record.report.rounds : [];
    const ops = record.report.telemetry?.operators;
    if (rounds.length === 0 && (!Array.isArray(ops) || ops.length === 0)) {
      return { ok: false, error: 'empty_record' };
    }
    const storageId = (typeof record.storageId === 'string' && filenameFromStorageId(record.storageId))
      ? record.storageId.replace(/^saved:/, '').replace(/\.json$/, '')
      : storageIdFromRecord(record);
    const filename = filenameFromStorageId(storageId);
    if (!filename) return { ok: false, error: 'invalid_storage_id' };

    const dir = activeDir();
    const payload = {
      schemaVersion: 1,
      savedAt: Date.now(),
      record: {
        key: `saved:${storageId}`,
        storageId,
        label: typeof record.label === 'string' && record.label.trim() ? record.label : '本地战报',
        seenAt: Math.trunc(Number(record.seenAt)),
        report: record.report,
        ...(record.manualNames && typeof record.manualNames === 'object' ? { manualNames: record.manualNames } : {}),
        ...(typeof record.manualSelfSeat === 'number' ? { manualSelfSeat: record.manualSelfSeat } : {}),
      },
    };
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) {
      return { ok: false, error: 'record_too_large' };
    }
    const targetPath = path.join(dir, filename);
    atomicWriteJson(targetPath, payload);
    trimOldRecords(dir);
    return { ok: true, storageId, config: getConfig() };
  }

  function deleteRecord(keyOrId) {
    const filename = filenameFromStorageId(keyOrId);
    if (!filename) return { ok: false, config: getConfig() };
    const fullPath = path.join(activeDir(), filename);
    try {
      if (fs.existsSync(fullPath)) fs.rmSync(fullPath, { force: true });
      return { ok: true, config: getConfig() };
    } catch {
      return { ok: false, config: getConfig() };
    }
  }

  function setCustomDirectory(nextDir, { migrate = true } = {}) {
    if (typeof nextDir !== 'string' || !nextDir.trim()) {
      throw new Error('请选择有效的保存目录');
    }
    const prevDir = activeDir();
    const resolvedNext = path.resolve(nextDir.trim());
    verifyWritableDir(resolvedNext);

    let migratedCount = 0;
    if (migrate && prevDir.toLowerCase() !== resolvedNext.toLowerCase() && fs.existsSync(prevDir)) {
      for (const file of listReportFiles(prevDir)) {
        const src = path.join(prevDir, file);
        const dst = path.join(resolvedNext, file);
        if (!fs.existsSync(dst)) {
          try {
            fs.copyFileSync(src, dst);
            migratedCount += 1;
          } catch {}
        }
      }
    }
    const isDefault = resolvedNext.toLowerCase() === path.resolve(defaultDir).toLowerCase();
    writeCustomDir(isDefault ? null : resolvedNext);
    const loaded = loadRecords();
    return { ...loaded, migratedCount };
  }

  function resetDirectory() {
    writeCustomDir(null);
    return loadRecords();
  }

  return {
    getConfig,
    loadRecords,
    saveRecord,
    deleteRecord,
    setCustomDirectory,
    resetDirectory,
    activeDir,
  };
}

function installReportStore({ app, ipcMain, dialog, shell, mainWindow, product }) {
  const store = createReportStore({
    userDataDir: app.getPath('userData'),
    defaultDir: resolveDefaultReportDir(app, product),
  });

  ipcMain.handle('report-store-load', () => store.loadRecords());
  ipcMain.handle('report-store-save', (_event, record) => store.saveRecord(record));
  ipcMain.handle('report-store-delete', (_event, keyOrId) => store.deleteRecord(keyOrId));
  ipcMain.handle('report-store-reset-dir', () => store.resetDirectory());
  ipcMain.handle('report-store-open-dir', async () => {
    const dir = store.activeDir();
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const errMsg = await shell.openPath(dir);
    return !errMsg;
  });
  ipcMain.handle('report-store-choose-dir', async (_event, options = {}) => {
    const current = store.activeDir();
    try { fs.mkdirSync(current, { recursive: true }); } catch {}
    const res = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
      title: '选择本地战报保存目录',
      defaultPath: current,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) {
      return { canceled: true, ...store.loadRecords(), migratedCount: 0 };
    }
    try {
      const next = store.setCustomDirectory(res.filePaths[0], { migrate: options?.migrate !== false });
      return { canceled: false, ...next };
    } catch (err) {
      return {
        canceled: false,
        error: err instanceof Error ? err.message : '所选目录不可写入，请更换其他文件夹',
        ...store.loadRecords(),
        migratedCount: 0,
      };
    }
  });

  return store;
}

module.exports = {
  MAX_STORED_REPORTS,
  storageIdFromRecord,
  filenameFromStorageId,
  resolveDefaultReportDir,
  createReportStore,
  installReportStore,
};
