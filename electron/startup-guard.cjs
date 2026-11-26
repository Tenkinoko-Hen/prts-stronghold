// 青逝痕 Tenkinoko 制作
const fs = require('node:fs');
const path = require('node:path');

const MAX_STARTUP_LOG_BYTES = 32 * 1024;
const SAFE_GPU_RELAUNCH_FLAGS = [
  '--prts-safe-gpu',
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--no-sandbox',
];
const ALLOWED_DETAIL_KEYS = new Set([
  'type',
  'reason',
  'exitCode',
  'errorCode',
  'errorDescription',
  'name',
  'message',
  'code',
  'stack',
]);

function isSafeGpuMode({ argv = process.argv, commandLine } = {}) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--prts-safe-gpu') || args.includes('--disable-gpu')) {
    return true;
  }
  try {
    return Boolean(commandLine && typeof commandLine.hasSwitch === 'function' && commandLine.hasSwitch('disable-gpu'));
  } catch {
    return false;
  }
}

function applyStartupGpuWorkarounds({ app, platform = process.platform, argv = process.argv } = {}) {
  const commandLine = app?.commandLine;
  const safeGpuMode = isSafeGpuMode({ argv, commandLine });
  if (platform === 'win32') {
    try {
      commandLine?.appendSwitch?.('disable-gpu-sandbox');
    } catch {
      // ignore switch registration failures before ready
    }
  }
  if (safeGpuMode) {
    try {
      app?.disableHardwareAcceleration?.();
    } catch {
      // ignore if called outside full Electron runtime
    }
    for (const flag of ['disable-gpu', 'disable-gpu-sandbox', 'no-sandbox']) {
      try {
        commandLine?.appendSwitch?.(flag);
      } catch {
        // ignore switch registration failures
      }
    }
  }
  return safeGpuMode;
}

function buildSafeGpuRelaunchArgs(argv = process.argv) {
  const baseArgs = Array.isArray(argv) ? argv.slice(1).filter((arg) => typeof arg === 'string') : [];
  const merged = [...baseArgs];
  for (const flag of SAFE_GPU_RELAUNCH_FLAGS) {
    if (!merged.includes(flag)) merged.push(flag);
  }
  return merged;
}

function shouldRelaunchForChildProcessGone(
  details,
  { mainWindowShown = false, safeGpuMode = false, hasRelaunched = false, isQuitting = false } = {},
) {
  if (isQuitting || safeGpuMode || hasRelaunched) return false;
  if (details?.type !== 'GPU') return false;
  return !mainWindowShown || details?.reason !== 'clean-exit';
}

function truncateString(value, maxLen) {
  const str = String(value ?? '');
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

function formatErrorForLog(err) {
  if (err && typeof err === 'object') {
    const out = {};
    if (typeof err.name === 'string' && err.name) out.name = truncateString(err.name, 80);
    if (typeof err.code === 'string' || typeof err.code === 'number') out.code = truncateString(err.code, 64);
    if (err.message !== undefined) out.message = truncateString(err.message, 500);
    if (typeof err.stack === 'string' && err.stack) out.stack = truncateString(err.stack, 2000);
    if (Object.keys(out).length > 0) return out;
  }
  try {
    return { message: truncateString(err, 500) };
  } catch {
    return { message: 'Unknown error' };
  }
}

function sanitizeLogDetails(details) {
  if (details == null) return {};
  if (details instanceof Error) return formatErrorForLog(details);
  if (typeof details !== 'object') return { message: truncateString(details, 500) };
  if (typeof details.stack === 'string' || (typeof details.message === 'string' && details.type === undefined && details.reason === undefined)) {
    return formatErrorForLog(details);
  }
  const clean = {};
  for (const key of ALLOWED_DETAIL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(details, key)) continue;
    const val = details[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    } else if (typeof val === 'string') {
      clean[key] = truncateString(val, key === 'stack' ? 2000 : 500);
    } else {
      try {
        clean[key] = truncateString(String(val), 500);
      } catch {
        // skip unstringifiable field
      }
    }
  }
  return clean;
}

function appendStartupLog(logPath, entry, maxBytes = MAX_STARTUP_LOG_BYTES) {
  if (!logPath) return false;
  const limit = Number.isFinite(maxBytes) && maxBytes >= 512 ? Math.floor(maxBytes) : MAX_STARTUP_LOG_BYTES;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    let line = `${JSON.stringify(entry)}\n`;
    let newBuf = Buffer.from(line, 'utf8');
    if (newBuf.length > limit) {
      const compactEntry = {
        ts: entry?.ts || new Date().toISOString(),
        event: entry?.event || 'unknown',
        product: entry?.product || 'unknown',
        version: entry?.version || 'unknown',
        safeGpu: Boolean(entry?.safeGpu),
        message: truncateString(entry?.message || entry?.errorDescription || 'log entry truncated', 200),
      };
      line = `${JSON.stringify(compactEntry)}\n`;
      newBuf = Buffer.from(line, 'utf8');
      if (newBuf.length > limit) {
        newBuf = Buffer.from(`${line.slice(0, Math.max(1, Math.floor(limit / 4)))}\n`, 'utf8');
      }
    }

    let existingSize = 0;
    try {
      if (fs.existsSync(logPath)) {
        existingSize = fs.statSync(logPath).size;
      }
    } catch {
      existingSize = 0;
    }

    if (existingSize + newBuf.length <= limit) {
      fs.appendFileSync(logPath, newBuf);
      return true;
    }

    let prevBuf = Buffer.alloc(0);
    if (existingSize > 0) {
      const readLen = Math.min(existingSize, limit);
      const fd = fs.openSync(logPath, 'r');
      try {
        const buf = Buffer.allocUnsafe(readLen);
        const bytesRead = fs.readSync(fd, buf, 0, readLen, existingSize - readLen);
        prevBuf = buf.subarray(0, bytesRead);
      } finally {
        fs.closeSync(fd);
      }
    }

    const combined = Buffer.concat([prevBuf, newBuf]);
    let finalBuf = combined;
    if (combined.length > limit) {
      const cutFrom = combined.length - limit;
      const nl = combined.indexOf(0x0a, Math.max(0, cutFrom - 1));
      if (nl !== -1 && nl + 1 < combined.length && combined.length - (nl + 1) <= limit) {
        finalBuf = combined.subarray(nl + 1);
      } else {
        finalBuf = newBuf;
      }
    }
    fs.writeFileSync(logPath, finalBuf);
    return true;
  } catch {
    return false;
  }
}

function safeGetVersion(app) {
  try {
    if (app && typeof app.getVersion === 'function') {
      return app.getVersion() || 'unknown';
    }
  } catch {
    // ignore version lookup failures
  }
  return 'unknown';
}

function createStartupLogger({ app, product, safeGpuMode = false, maxBytes = MAX_STARTUP_LOG_BYTES } = {}) {
  const resolveLogPath = () => {
    try {
      const userData = app?.getPath?.('userData');
      return userData ? path.join(userData, 'startup.log') : null;
    } catch {
      return null;
    }
  };

  return function logStartup(event, details) {
    try {
      const logPath = resolveLogPath();
      if (!logPath) return false;
      const extra = sanitizeLogDetails(details);
      const entry = {
        ts: new Date().toISOString(),
        event: truncateString(event || 'unknown', 64),
        product: product?.id || 'unknown',
        version: safeGetVersion(app),
        electron: process.versions?.electron || 'unknown',
        chromium: process.versions?.chrome || 'unknown',
        safeGpu: Boolean(safeGpuMode),
        ...extra,
      };
      return appendStartupLog(logPath, entry, maxBytes);
    } catch {
      return false;
    }
  };
}

module.exports = {
  MAX_STARTUP_LOG_BYTES,
  SAFE_GPU_RELAUNCH_FLAGS,
  isSafeGpuMode,
  applyStartupGpuWorkarounds,
  buildSafeGpuRelaunchArgs,
  shouldRelaunchForChildProcessGone,
  formatErrorForLog,
  sanitizeLogDetails,
  appendStartupLog,
  createStartupLogger,
};
