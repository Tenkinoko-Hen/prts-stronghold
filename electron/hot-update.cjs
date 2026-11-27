const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');

const DEFAULT_MANIFEST_URL = 'https://api.arknightsprts.ggff.net/v1/manifest.json';
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'cdn.arknightsprts.ggff.net', 'api.arknightsprts.ggff.net', 'github.com',
  'objects.githubusercontent.com', 'release-assets.githubusercontent.com',
]);
const MAX_PATCH_BYTES = 30 * 1024 * 1024;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-p(0|[1-9]\d*))?$/;

function compareVersions(a, b) {
  const left = typeof a === 'string' && VERSION.exec(a);
  const right = typeof b === 'string' && VERSION.exec(b);
  if (!left || !right || left[0] !== a || right[0] !== b) throw new Error('Invalid hot update version');
  for (let i = 1; i <= 4; i++) {
    const difference = BigInt(left[i] ?? -1) - BigInt(right[i] ?? -1);
    if (difference) return difference < 0n ? -1 : 1;
  }
  return 0;
}

function buildCanonicalSignPayload({ kind, product, version, minNativeVersion, sha256, size }) {
  return `prts-hot-update-v1\n${kind}\n${product}\n${version}\n${minNativeVersion || ''}\n${String(sha256).toLowerCase()}\n${Number(size)}`;
}

function verifyEd25519Payload(payloadStr, signatureBase64, publicKeyPem) {
  if (typeof payloadStr !== 'string' || typeof signatureBase64 !== 'string' || signatureBase64.length !== 88) return false;
  try {
    const signature = Buffer.from(signatureBase64, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== signatureBase64) return false;
    const key = crypto.createPublicKey(publicKeyPem);
    return key.asymmetricKeyType === 'ed25519'
      && crypto.verify(null, Buffer.from(payloadStr, 'utf8'), key, signature);
  } catch {
    return false;
  }
}

function isAllowedUpdateUrl(rawUrl, { allowLocalhost = false } = {}) {
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return false;
    return (url.protocol === 'https:' && ALLOWED_DOWNLOAD_HOSTS.has(url.hostname))
      || (allowLocalhost && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
  } catch {
    return false;
  }
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function extractSafeZip(zipBuffer, destDir, { maxFiles = 500, maxTotalBytes = MAX_PATCH_BYTES } = {}) {
  let end = zipBuffer.length - 22;
  const minEnd = Math.max(0, end - 0xffff);
  for (; end >= minEnd; end--) {
    if (zipBuffer.readUInt32LE(end) === 0x06054b50 && end + 22 + zipBuffer.readUInt16LE(end + 20) === zipBuffer.length) break;
  }
  if (end < minEnd) throw new Error('Invalid ZIP end record');
  const entryCount = zipBuffer.readUInt16LE(end + 10);
  const centralLength = zipBuffer.readUInt32LE(end + 12);
  let cursor = zipBuffer.readUInt32LE(end + 16);
  const centralStart = cursor;
  if (entryCount > maxFiles || entryCount === 0xffff) throw new Error('ZIP file limit exceeded');
  if (zipBuffer.readUInt32LE(end + 4) || zipBuffer.readUInt16LE(end + 8) !== entryCount || cursor + centralLength !== end) {
    throw new Error('Invalid ZIP central directory');
  }

  let totalBytes = 0;
  const entries = [];
  const names = new Set();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > end || zipBuffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const flags = zipBuffer.readUInt16LE(cursor + 8);
    const method = zipBuffer.readUInt16LE(cursor + 10);
    const crc = zipBuffer.readUInt32LE(cursor + 16);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const size = zipBuffer.readUInt32LE(cursor + 24);
    const nameSize = zipBuffer.readUInt16LE(cursor + 28);
    const unixType = (zipBuffer.readUInt32LE(cursor + 38) >>> 16) & 0xf000;
    const offset = zipBuffer.readUInt32LE(cursor + 42);
    const nameBytes = zipBuffer.subarray(cursor + 46, cursor + 46 + nameSize);
    const next = cursor + 46 + nameSize + zipBuffer.readUInt16LE(cursor + 30) + zipBuffer.readUInt16LE(cursor + 32);
    if (next > end || zipBuffer.readUInt16LE(cursor + 34) || (flags & ~0x080e)
      || (method !== 0 && method !== 8) || (unixType && unixType !== 0x8000 && unixType !== 0x4000)) {
      throw new Error('Unsupported ZIP entry');
    }
    cursor = next;

    const name = decoder.decode(nameBytes).replaceAll('\\', '/');
    const directory = name.endsWith('/');
    const parts = (directory ? name.slice(0, -1) : name).split('/');
    if (parts.some((part) => !part || part === '.' || part.includes('..')
      || /[\x00-\x1f:<>"|?*]|[. ]$|^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
      throw new Error('Unsafe ZIP path');
    }
    const normalizedName = parts.join('/').toLowerCase();
    if (names.has(normalizedName)) throw new Error('Duplicate ZIP path');
    names.add(normalizedName);
    totalBytes += size;
    if (totalBytes > maxTotalBytes) throw new Error('ZIP size limit exceeded');

    if (offset + 30 > centralStart || zipBuffer.readUInt32LE(offset) !== 0x04034b50
      || zipBuffer.readUInt16LE(offset + 6) !== flags || zipBuffer.readUInt16LE(offset + 8) !== method) {
      throw new Error('Invalid ZIP local header');
    }
    const localNameSize = zipBuffer.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + localNameSize + zipBuffer.readUInt16LE(offset + 28);
    if (dataStart + compressedSize > centralStart || localNameSize !== nameSize
      || !zipBuffer.subarray(offset + 30, offset + 30 + localNameSize).equals(nameBytes)) {
      throw new Error('Invalid ZIP file bounds');
    }
    if (!(flags & 8) && (zipBuffer.readUInt32LE(offset + 14) !== crc
      || zipBuffer.readUInt32LE(offset + 18) !== compressedSize || zipBuffer.readUInt32LE(offset + 22) !== size)) {
      throw new Error('ZIP local header does not match central directory');
    }
    const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);
    const bytes = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(size, 1) });
    if (bytes.length !== size || crc32(bytes) !== crc || (directory && size !== 0)) throw new Error('Invalid ZIP size or CRC32');
    entries.push({ parts, directory, bytes });
  }
  if (cursor !== end) throw new Error('Invalid ZIP central directory length');

  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.lstatSync(destDir).isDirectory()) throw new Error('Unsafe ZIP destination');
  for (const { parts, directory, bytes } of entries) {
    let folder = destDir;
    for (const part of directory ? parts : parts.slice(0, -1)) {
      folder = path.join(folder, part);
      try { fs.mkdirSync(folder); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      if (!fs.lstatSync(folder).isDirectory()) throw new Error('Unsafe ZIP destination directory');
    }
    if (!directory) fs.writeFileSync(path.join(folder, parts.at(-1)), bytes, { flag: 'wx' });
  }
}

function readJsonObject(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  return null;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function isUiForProduct(dir, productId) {
  try {
    const productFile = path.join(dir, 'product.json');
    return fs.lstatSync(path.join(dir, 'index.html')).isFile()
      && fs.lstatSync(productFile).isFile() && readJsonObject(productFile)?.id === productId;
  } catch {
    return false;
  }
}

function validSlot(entry, slotsDir, productId, nativeVersion) {
  if (!entry || entry.nativeVersion !== nativeVersion) return null;
  try {
    compareVersions(entry.version, entry.version);
    const candidate = path.resolve(slotsDir, entry.slotDir);
    const relative = path.relative(slotsDir, candidate);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    if (!fs.lstatSync(slotsDir).isDirectory()) return null;
    const real = fs.realpathSync(candidate);
    if (real !== path.join(fs.realpathSync(slotsDir), relative) || !isUiForProduct(real, productId)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function resolveActiveUiRoot({ userDataDir, builtinDistDir, productId, nativeVersion }) {
  const stateFile = path.join(userDataDir, 'hot-update', 'state.json');
  const slotsDir = path.join(userDataDir, 'hot-update', 'slots');
  const state = readJsonObject(stateFile) || {};
  let changed = false;
  let rolledBack = false;
  const pendingRoot = validSlot(state.pendingUi, slotsDir, productId, nativeVersion);
  const stableRoot = validSlot(state.activeUi, slotsDir, productId, nativeVersion);
  for (const [key, root] of [['pendingUi', pendingRoot], ['activeUi', stableRoot]]) {
    if (state[key] && !root) {
      delete state[key];
      changed = true;
    }
  }
  if (state.previousUi && !validSlot(state.previousUi, slotsDir, productId, nativeVersion)) {
    delete state.previousUi;
    changed = true;
  }
  if (pendingRoot) {
    const failures = Number.isSafeInteger(state.pendingUi.failures) && state.pendingUi.failures > 0 ? state.pendingUi.failures : 0;
    if (failures < 2) {
      state.pendingUi.failures = failures + 1;
      writeJson(stateFile, state);
      return { uiRoot: pendingRoot, activeKind: 'pending', uiVersion: state.pendingUi.version, rolledBack: false };
    }
    delete state.pendingUi;
    state.lastRollbackReason = 'startup-failure-limit';
    changed = rolledBack = true;
  }
  if (changed) writeJson(stateFile, state);
  if (stableRoot) return { uiRoot: stableRoot, activeKind: 'stable', uiVersion: state.activeUi.version, rolledBack: false };
  return { uiRoot: builtinDistDir, activeKind: 'builtin', uiVersion: nativeVersion, rolledBack };
}

function createHotUpdateManager({
  product, userDataDir, builtinDistDir, nativeVersion, publicKeyPem,
  manifestUrl = DEFAULT_MANIFEST_URL, fetchImpl = globalThis.fetch, openExternal,
  getMainWindow = () => null, relaunchApp, logStartup = () => {}, watchdogMs = 15000, allowLocalhost = false,
}) {
  const root = path.join(userDataDir, 'hot-update');
  const stateFile = path.join(root, 'state.json');
  const slotsDir = path.join(root, 'slots');
  const dataDir = path.join(root, 'data');
  const selection = { userDataDir, builtinDistDir, productId: product.id, nativeVersion };
  let current = resolveActiveUiRoot(selection);
  let state = readJsonObject(stateFile) || {};
  const lifetime = new AbortController();
  let watchdog;
  let inFlight;
  let activeData = null;
  if (state.activeData?.product === product.id && VERSION.test(state.activeData.version)) {
    try {
      if (compareVersions(nativeVersion, state.activeData.minNativeVersion) >= 0) {
        const data = readJsonObject(path.join(dataDir, `${state.activeData.version}.json`));
        if (data) activeData = { ...data, version: state.activeData.version };
      }
    } catch {}
  }
  const update = {
    status: state.pendingUi && current.activeKind !== 'pending' ? 'ready-to-restart' : 'idle',
    downloadProgress: 0,
    error: null,
    lastCheckedAt: null,
    availableUi: null,
    nativeUpdate: null,
  };

  function save(nextState) {
    writeJson(stateFile, nextState);
    state = nextState;
  }

  function getPublicState() {
    return {
      nativeVersion, uiVersion: current.uiVersion, activeKind: current.activeKind, ...update,
      lastRollbackReason: state.lastRollbackReason ?? null,
      stagedUiVersion: state.pendingUi?.version ?? null,
      activeData, announcement: activeData?.announcement ?? null,
    };
  }

  function publish() {
    const snapshot = getPublicState();
    const window = getMainWindow();
    if (window && !window.isDestroyed?.() && !window.webContents?.isDestroyed?.()) {
      try { window.webContents?.send('hot-update-state', snapshot); }
      catch (error) { logStartup('hot-update-state-send-failed', error); }
    }
    return snapshot;
  }

  const allowed = (url) => isAllowedUpdateUrl(url, { allowLocalhost });

  async function getBytes(rawUrl, limit, timeoutMs, onProgress) {
    let url = new URL(rawUrl);
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeoutMs)]);
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!allowed(url)) throw new Error('Hot update URL is not allowed');
      const response = await fetchImpl(url.href, { redirect: 'manual', signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('Invalid hot update redirect');
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || Number(response.headers.get('content-length')) > limit) {
        await response.body?.cancel();
        throw new Error(response.ok ? 'Hot update download size limit exceeded' : `Hot update request failed (HTTP ${response.status})`);
      }
      const chunks = [];
      let length = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          signal.throwIfAborted();
          length += chunk.byteLength;
          if (length > limit) throw new Error('Hot update download size limit exceeded');
          chunks.push(Buffer.from(chunk));
          onProgress?.(length);
        }
      }
      signal.throwIfAborted();
      return Buffer.concat(chunks, length);
    }
    throw new Error('Too many hot update redirects');
  }

  function validPatch(entry, kind) {
    try {
      if (!entry || entry.product !== product.id || (entry.kind !== undefined && entry.kind !== kind)
        || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256)
        || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > MAX_PATCH_BYTES
        || typeof entry.url !== 'string' || !allowed(entry.url)
        || compareVersions(nativeVersion, entry.minNativeVersion) < 0
        || (entry.maxNativeVersion && compareVersions(nativeVersion, entry.maxNativeVersion) > 0)) return false;
      compareVersions(entry.version, entry.version);
      return verifyEd25519Payload(buildCanonicalSignPayload({ ...entry, kind }), entry.signature, publicKeyPem);
    } catch {
      return false;
    }
  }

  async function downloadPatch(entry, kind, onProgress) {
    if (!validPatch(entry, kind)) throw new Error('Invalid hot update signature or metadata');
    const bytes = await getBytes(entry.url, entry.size, 60_000, onProgress);
    if (bytes.length !== entry.size || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256.toLowerCase()) {
      throw new Error('Hot update size or SHA-256 mismatch');
    }
    return bytes;
  }

  function run(status, operation) {
    if (inFlight || lifetime.signal.aborted) return inFlight || Promise.resolve(getPublicState());
    update.status = status;
    update.error = null;
    inFlight = Promise.resolve().then(operation).catch((error) => {
      update.status = 'error';
      update.error = error.message;
    }).then(() => {
      inFlight = null;
      return publish();
    });
    publish();
    return inFlight;
  }

  function checkForUpdates() {
    return run('checking', async () => {
      const url = new URL(process.env.PRTS_HOT_UPDATE_MANIFEST_URL || manifestUrl);
      url.searchParams.set('product', product.id);
      url.searchParams.set('platform', process.platform === 'win32' ? 'win' : process.platform);
      url.searchParams.set('native', nativeVersion);
      const manifest = JSON.parse((await getBytes(url, 1024 * 1024, 10_000)).toString('utf8'));
      if (!manifest || manifest.schemaVersion !== 1 || manifest.product !== product.id) throw new Error('Invalid hot update manifest');
      const { ui, native, data } = manifest;
      update.lastCheckedAt = new Date().toISOString();
      const staged = state.pendingUi?.version;
      const effective = staged && compareVersions(staged, current.uiVersion) > 0 ? staged : current.uiVersion;
      update.availableUi = validPatch(ui, 'ui') && compareVersions(ui.version, effective) > 0 ? ui : null;
      update.nativeUpdate = null;
      if (native && (!native.product || native.product === product.id) && allowed(native.downloadUrl)) {
        try {
          const isNewer = compareVersions(native.version, nativeVersion) > 0;
          if (isNewer || (ui && compareVersions(nativeVersion, ui.minNativeVersion) < 0)) update.nativeUpdate = native;
        } catch {}
      }
      if (validPatch(data, 'data') && (!activeData || compareVersions(data.version, activeData.version) > 0)) {
        const payload = JSON.parse((await downloadPatch(data, 'data')).toString('utf8'));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid hot update data');
        writeJson(path.join(dataDir, `${data.version}.json`), payload);
        save({ ...state, activeData: { product: product.id, version: data.version, minNativeVersion: data.minNativeVersion } });
        activeData = { ...payload, version: data.version };
      }
      update.status = staged && current.activeKind !== 'pending' ? 'ready-to-restart'
        : (update.availableUi || update.nativeUpdate ? 'available' : 'up-to-date');
    });
  }

  function downloadAndStageUi() {
    const entry = update.availableUi;
    if (!entry || current.activeKind === 'pending') return Promise.resolve(getPublicState());
    return run('downloading', async () => {
      update.downloadProgress = 0;
      const zip = await downloadPatch(entry, 'ui', (length) => {
        const progress = Math.floor(100 * length / entry.size);
        if (progress === update.downloadProgress) return;
        update.downloadProgress = progress;
        publish();
      });
      fs.mkdirSync(slotsDir, { recursive: true });
      if (!fs.lstatSync(slotsDir).isDirectory()) throw new Error('Unsafe hot update slots directory');
      const safeVersion = entry.version.replace(/[^a-z0-9.-]/gi, '_');
      const slotDir = fs.mkdtempSync(path.join(slotsDir, `ui-${safeVersion}-${Date.now()}-`));
      try {
        extractSafeZip(zip, slotDir);
        if (!isUiForProduct(slotDir, product.id)) throw new Error('Invalid UI patch product or entry point');
        save({ ...state, pendingUi: { slotDir, nativeVersion, version: entry.version, failures: 0 } });
      } catch (error) {
        fs.rmSync(slotDir, { recursive: true, force: true });
        throw error;
      }
      update.availableUi = null;
      update.status = 'ready-to-restart';
    });
  }

  function rollbackPending(reason) {
    if (current.activeKind !== 'pending') return false;
    clearTimeout(watchdog);
    const { pendingUi, ...rest } = state;
    save({ ...rest, lastRollbackReason: reason });
    current = resolveActiveUiRoot(selection);
    update.status = update.availableUi || update.nativeUpdate ? 'available' : 'idle';
    logStartup('hot-update-rollback', { reason, version: pendingUi.version });
    const window = getMainWindow();
    if (window && !window.isDestroyed?.()) {
      Promise.resolve(window.loadURL('prts://app/')).catch((error) => logStartup('hot-update-reload-failed', error));
    }
    publish();
    return true;
  }

  if (current.activeKind === 'pending') {
    watchdog = setTimeout(() => rollbackPending('watchdog-timeout'), watchdogMs);
    watchdog.unref();
  }

  function confirmHealthy() {
    if (current.activeKind !== 'pending' || !state.pendingUi) return getPublicState();
    const { pendingUi, activeUi, previousUi, ...rest } = state;
    const next = { ...rest, activeUi: { ...pendingUi, status: 'stable', failures: 0 } };
    if (activeUi) next.previousUi = activeUi;
    save(next);
    clearTimeout(watchdog);
    current = { ...current, activeKind: 'stable' };
    const keep = new Set([pendingUi, activeUi].filter(Boolean)
      .map(({ slotDir }) => path.relative(slotsDir, path.resolve(slotsDir, slotDir)).split(path.sep)[0]));
    try {
      for (const entry of fs.readdirSync(slotsDir, { withFileTypes: true })) {
        const dir = path.join(slotsDir, entry.name);
        if (entry.isDirectory() && entry.name.startsWith('ui-') && !keep.has(entry.name)) fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (error) {
      logStartup('hot-update-cleanup-failed', error);
    }
    return publish();
  }

  function applyAndRestart() {
    if (current.activeKind !== 'pending' && validSlot(state.pendingUi, slotsDir, product.id, nativeVersion)) return relaunchApp();
  }

  function rollbackToBuiltin() {
    const { pendingUi, activeUi, previousUi, ...rest } = state;
    save({ ...rest, lastRollbackReason: 'manual-rollback' });
    clearTimeout(watchdog);
    lifetime.abort();
    current = { uiRoot: builtinDistDir, activeKind: 'builtin', uiVersion: nativeVersion };
    update.status = update.availableUi || update.nativeUpdate ? 'available' : 'idle';
    publish();
    return relaunchApp();
  }

  function openNativeDownload() {
    const url = update.nativeUpdate?.downloadUrl;
    if (url && allowed(url)) return openExternal(url);
  }

  const handleRendererGone = () => rollbackPending('renderer-gone');
  function installHotUpdateIpc(ipcMain, isTrustedMainSender) {
    const handlers = {
      'hot-update-get': getPublicState,
      'hot-update-check': checkForUpdates,
      'hot-update-download-ui': downloadAndStageUi,
      'hot-update-apply-restart': applyAndRestart,
      'hot-update-confirm-healthy': confirmHealthy,
      'hot-update-rollback': rollbackToBuiltin,
      'hot-update-open-native': openNativeDownload,
    };
    for (const [channel, handler] of Object.entries(handlers)) {
      ipcMain.handle(channel, (event) => isTrustedMainSender(event) ? handler() : undefined);
    }
  }

  return {
    getUiRoot: () => current.uiRoot, getPublicState, checkForUpdates, downloadAndStageUi,
    applyAndRestart, confirmHealthy, handleRendererGone, rollbackToBuiltin,
    openNativeDownload, installHotUpdateIpc,
    dispose() {
      clearTimeout(watchdog);
      lifetime.abort();
    },
  };
}

module.exports = {
  DEFAULT_MANIFEST_URL, ALLOWED_DOWNLOAD_HOSTS, compareVersions, buildCanonicalSignPayload,
  verifyEd25519Payload, isAllowedUpdateUrl, crc32, extractSafeZip, resolveActiveUiRoot, createHotUpdateManager,
};
