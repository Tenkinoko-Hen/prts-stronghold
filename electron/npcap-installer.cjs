// 青逝痕 Tenkinoko 制作
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const NPCAP_DIST_URL = 'https://npcap.com/dist/';
const NPCAP_DOWNLOAD_PAGE = 'https://npcap.com/#download';
const MAX_HTML_BYTES = 512 * 1024;
const MAX_INSTALLER_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const LOG_TAIL_BYTES = 16 * 1024;
const MARKED_FOR_DELETE_RE = /0x80070430|marked for deletion|已标记为删除|\b1072\b/i;
const NPCAP_PROVIDER_RE = /nmap|insecure|npcap/i;
const CONFLICTING_APPS = new Map([
  ['clash for windows.exe', 'Clash for Windows'],
  ['clash-verge.exe', 'Clash Verge'],
  ['clash-nyanpasu.exe', 'Clash Nyanpasu'],
  ['mihomo.exe', 'Mihomo/Clash'],
  ['wireshark.exe', 'Wireshark'],
  ['dumpcap.exe', 'Wireshark'],
  ['uu.exe', 'UU 加速器'],
  ['uubooster.exe', 'UU 加速器'],
]);
const FALLBACK_CAPTURE_HINT = '未安装 Npcap 前仍可通过内置通道正常记录本路战报。';

function npcapDllPath() {
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return path.join(windir, 'System32', 'Npcap', 'wpcap.dll');
}

function legacyWinPcapDllPath() {
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return path.join(windir, 'System32', 'wpcap.dll');
}

function defaultHasLegacyWinPcap() {
  try {
    return fs.existsSync(legacyWinPcapDllPath());
  } catch {
    return false;
  }
}

function hasNpcap() {
  if (process.platform !== 'win32') return false;
  try {
    return fs.existsSync(npcapDllPath());
  } catch {
    return false;
  }
}

function compareVersion(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  const count = Math.max(left.length, right.length);
  for (let i = 0; i < count; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function pickLatestNpcapInstaller(html) {
  if (typeof html !== 'string' || !html) return null;
  const seen = new Map();
  const pattern = /\bnpcap-(\d+(?:\.\d+)+)\.exe\b/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    seen.set(match[1], match[0]);
  }
  if (!seen.size) return null;
  const latestVersion = [...seen.keys()].sort(compareVersion).at(-1);
  const filename = seen.get(latestVersion);
  return { version: latestVersion, filename, url: `${NPCAP_DIST_URL}${filename}` };
}

function assertNpcapUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'npcap.com') {
    throw new Error('非官方 Npcap 下载地址');
  }
  return parsed;
}

function fetchHttps(urlString, { maxBytes, destPath, redirects = 0 } = {}) {
  if (redirects > 3) return Promise.reject(new Error('下载重定向次数过多'));
  const url = assertNpcapUrl(urlString);
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'PRTS-Stronghold/1.0' },
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        fetchHttps(nextUrl, { maxBytes, destPath, redirects: redirects + 1 }).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`下载失败（HTTP ${res.statusCode ?? '未知'}）`));
        return;
      }
      let received = 0;
      if (destPath) {
        const out = fs.createWriteStream(destPath);
        const fail = (err) => {
          res.destroy();
          out.destroy();
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        };
        res.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) fail(new Error('安装包体积超出安全限制'));
        });
        res.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => resolve({ bytes: received }));
        res.pipe(out);
      } else {
        const chunks = [];
        res.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) {
            res.destroy();
            reject(new Error('版本目录体积超出限制'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    });
    req.on('timeout', () => {
      req.destroy(new Error('连接 npcap.com 超时，请检查网络或手动打开官网下载'));
    });
    req.on('error', reject);
  });
}

function parsePnputilNpcapDrivers(output) {
  if (typeof output !== 'string' || !output.trim()) return [];
  const drivers = new Set();
  let current = {};

  const flush = () => {
    const pubMatch = String(current.publishedName || '').trim().match(/^(oem\d+\.inf)$/i);
    const origName = String(current.originalName || '').trim().toLowerCase();
    const providerName = String(current.providerName || '').trim();
    if (pubMatch && origName === 'npcap.inf' && NPCAP_PROVIDER_RE.test(providerName)) {
      drivers.add(pubMatch[1].toLowerCase());
    }
    current = {};
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const match = line.match(/^([^:：]+?)\s*[:：]\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'published name' || key === '发布名称') {
      if (current.publishedName) flush();
      current.publishedName = value;
    } else if (key === 'original name' || key === '原始名称') {
      current.originalName = value;
    } else if (key === 'provider name' || key === '提供程序名称') {
      current.providerName = value;
    }
  }
  flush();
  return [...drivers];
}

function parseSymlinkEvaluationDisabled(regOutput) {
  if (typeof regOutput !== 'string' || !regOutput) return false;
  for (const line of regOutput.split(/\r?\n/)) {
    const match = line.match(/^\s*SymlinkLocalTo(?:Local|Remote)Evaluation\s+REG_\w+\s+(\S+)\s*$/i);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value === 0) return true;
  }
  return false;
}

function parseNpcapInstallLog(logText) {
  const text = typeof logText === 'string' ? logText : '';
  return {
    symlinkDisabled: /0x800705b7|ERROR_SYMLINK_CLASS_DISABLED/i.test(text),
    filesInUse: /files in use|Cannot completely uninstall Npcap/i.test(text),
    markedForDelete: MARKED_FOR_DELETE_RE.test(text),
    serviceCreateFailed: /Failed to create the npcap service/i.test(text),
  };
}

function detectConflictingNetworkApps(tasklistOutput) {
  if (typeof tasklistOutput !== 'string' || !tasklistOutput.trim()) return [];
  const found = new Set();
  for (const rawLine of tasklistOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const csvMatch = line.match(/^"([^"]+)"/);
    const imageName = (csvMatch ? csvMatch[1] : line.split(',')[0]).trim().toLowerCase();
    const label = CONFLICTING_APPS.get(imageName);
    if (label) found.add(label);
  }
  return [...found];
}

function defaultRunCommand(file, args = []) {
  return new Promise((resolve) => {
    try {
      execFile(
        file,
        args,
        { windowsHide: true, timeout: 8000, maxBuffer: 2 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const out = typeof stdout === 'string' ? stdout : String(stdout || '');
          const errOut = typeof stderr === 'string' ? stderr : String(stderr || '');
          if (!err) {
            resolve({ code: 0, stdout: out, stderr: errOut });
            return;
          }
          const code = typeof err.code === 'number'
            ? err.code
            : typeof err.status === 'number'
              ? err.status
              : 1;
          resolve({ code, stdout: out, stderr: errOut || err.message || '' });
        },
      );
    } catch (err) {
      resolve({
        code: 1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err || ''),
      });
    }
  });
}

async function safeRunCommand(runCommand, file, args = []) {
  const runner = typeof runCommand === 'function' ? runCommand : defaultRunCommand;
  try {
    const res = await runner(file, args);
    return {
      code: typeof res?.code === 'number' ? res.code : 0,
      stdout: typeof res?.stdout === 'string' ? res.stdout : String(res?.stdout ?? ''),
      stderr: typeof res?.stderr === 'string' ? res.stderr : String(res?.stderr ?? ''),
    };
  } catch (err) {
    return {
      code: typeof err?.code === 'number' ? err.code : 1,
      stdout: typeof err?.stdout === 'string' ? err.stdout : '',
      stderr: typeof err?.stderr === 'string' ? err.stderr : (err instanceof Error ? err.message : String(err || '')),
    };
  }
}

function outputMarksDeletion(res) {
  return res?.code === 1072 || MARKED_FOR_DELETE_RE.test(`${res?.stdout || ''}\n${res?.stderr || ''}`);
}

async function cleanupResidualService(serviceName, { runCmd, sleep }) {
  const queryRes = await runCmd('sc.exe', ['query', serviceName]);
  if (queryRes.code !== 0) {
    return { cleaned: false, needsReboot: false };
  }
  let needsReboot = outputMarksDeletion(queryRes);
  const stopRes = await runCmd('sc.exe', ['stop', serviceName]);
  if (outputMarksDeletion(stopRes)) needsReboot = true;

  if (stopRes.code !== 1062) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(300);
      const poll = await runCmd('sc.exe', ['query', serviceName]);
      if (poll.code !== 0 || /\bSTOPPED\b/i.test(poll.stdout)) break;
    }
  }

  const delRes = await runCmd('sc.exe', ['delete', serviceName]);
  if (outputMarksDeletion(delRes)) needsReboot = true;
  return { cleaned: true, needsReboot };
}

async function prepareNpcapEnvironment({
  platform = process.platform,
  runCommand,
  hasNpcapFn = hasNpcap,
  hasLegacyWinPcapFn = defaultHasLegacyWinPcap,
  sleepFn,
  onProgress,
} = {}) {
  const result = {
    cleanedServices: [],
    cleanedDrivers: [],
    repairedSymlink: false,
    needsReboot: false,
  };
  if (platform !== 'win32' || hasNpcapFn()) {
    return result;
  }

  const runCmd = (file, args) => safeRunCommand(runCommand, file, args);
  const sleep = typeof sleepFn === 'function' ? sleepFn : (ms) => new Promise((r) => setTimeout(r, ms));
  void onProgress;

  // A. 修复被组策略/精简系统关闭的本地符号链接评估策略（仅恢复 L2L/L2R 默认值）
  const regRes = await runCmd('reg.exe', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem']);
  if (parseSymlinkEvaluationDisabled(regRes.stdout)) {
    const fsutilRes = await runCmd('fsutil.exe', ['behavior', 'set', 'SymlinkEvaluation', 'L2L:1', 'L2R:1']);
    if (fsutilRes.code === 0) {
      result.repairedSymlink = true;
    }
  }

  // B. 清理 wpcap.dll 缺失但内核仍残留的 npcap 服务
  const npcapCleanup = await cleanupResidualService('npcap', { runCmd, sleep });
  if (npcapCleanup.cleaned) {
    result.cleanedServices.push('npcap');
    if (npcapCleanup.needsReboot) result.needsReboot = true;
  }

  // C. 仅在系统未安装传统 WinPcap 时清理残留 npf 服务
  if (!hasLegacyWinPcapFn()) {
    const npfCleanup = await cleanupResidualService('npf', { runCmd, sleep });
    if (npfCleanup.cleaned) {
      result.cleanedServices.push('npf');
      if (npfCleanup.needsReboot) result.needsReboot = true;
    }
  }

  // D. 严格白名单清理残留 npcap.inf 驱动包
  const enumRes = await runCmd('pnputil.exe', ['/enum-drivers']);
  const oemDrivers = parsePnputilNpcapDrivers(enumRes.stdout);
  for (const oemInf of oemDrivers) {
    const delDriverRes = await runCmd('pnputil.exe', ['/delete-driver', oemInf, '/uninstall', '/force']);
    result.cleanedDrivers.push(oemInf);
    if (outputMarksDeletion(delDriverRes)) {
      result.needsReboot = true;
    }
  }

  return result;
}

function formatNpcapFailureMessage({ prep, logDiag, conflicts = [], exitCode } = {}) {
  const conflictList = Array.isArray(conflicts) ? conflicts.filter(Boolean) : [];
  if (prep?.needsReboot || logDiag?.markedForDelete) {
    return `已自动清理旧版残留，但旧驱动服务被 Windows 内核锁定待重启释放（1072），请重启电脑一次后再点「一键安装 Npcap」即可一次成功；${FALLBACK_CAPTURE_HINT}`;
  }
  if ((logDiag?.filesInUse || logDiag?.symlinkDisabled || logDiag?.serviceCreateFailed) && conflictList.length > 0) {
    return `安装未能完成（检测到可能占用网卡过滤驱动的程序：${conflictList.join('、')}）。已自动清理残留并校准符号链接策略，请先退出这些程序（如仍受锁可重启一次电脑）后再点「一键安装 Npcap」；${FALLBACK_CAPTURE_HINT}`;
  }
  if (logDiag?.symlinkDisabled || logDiag?.serviceCreateFailed) {
    const codeTag = logDiag?.symlinkDisabled ? '（如 0x800705b7）' : '';
    return `Npcap 驱动服务注册失败${codeTag}，已自动修复系统符号链接策略并清理残留驱动，请重启电脑一次或放行安全软件驱动拦截后重试；${FALLBACK_CAPTURE_HINT}`;
  }
  const exitTag = Number.isFinite(exitCode) && exitCode !== 0 ? `（退出码 ${exitCode}）` : '';
  return `安装向导已关闭但未检测到 Npcap${exitTag}，如被安全软件拦截请放行后重试；${FALLBACK_CAPTURE_HINT}`;
}

function readFileTailUtf8(filePath, minMtimeMs, maxBytes = LOG_TAIL_BYTES) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.mtimeMs < minMtimeMs || stat.size <= 0) return '';
    const readLen = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(readLen);
      const bytesRead = fs.readSync(fd, buf, 0, readLen, stat.size - readLen);
      return buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

async function inspectNpcapFailure({
  startedAt = Date.now(),
  prep,
  runCommand,
  hasNpcapFn = hasNpcap,
  programFilesDir,
  prepareEnvFn = prepareNpcapEnvironment,
} = {}) {
  const programFiles = programFilesDir || process.env.ProgramFiles || 'C:\\Program Files';
  const npcapDir = path.join(programFiles, 'Npcap');
  const minMtimeMs = startedAt - 5000;
  const combinedLog = [
    readFileTailUtf8(path.join(npcapDir, 'install.log'), minMtimeMs),
    readFileTailUtf8(path.join(npcapDir, 'NPFInstall.log'), minMtimeMs),
  ].filter(Boolean).join('\n');
  const logDiag = parseNpcapInstallLog(combinedLog);

  let postPrep = null;
  if (logDiag.symlinkDisabled || logDiag.serviceCreateFailed || logDiag.filesInUse) {
    postPrep = await prepareEnvFn({ platform: process.platform, runCommand, hasNpcapFn });
    if (logDiag.symlinkDisabled) {
      const fsutilRes = await safeRunCommand(runCommand, 'fsutil.exe', ['behavior', 'set', 'SymlinkEvaluation', 'L2L:1', 'L2R:1']);
      if (fsutilRes.code === 0) {
        postPrep = { ...(postPrep || {}), repairedSymlink: true };
      }
    }
  }

  const taskRes = await safeRunCommand(runCommand, 'tasklist.exe', ['/FO', 'CSV', '/NH']);
  const conflicts = detectConflictingNetworkApps(taskRes.stdout);
  const mergedPrep = {
    cleanedServices: [...new Set([...(prep?.cleanedServices || []), ...(postPrep?.cleanedServices || [])])],
    cleanedDrivers: [...new Set([...(prep?.cleanedDrivers || []), ...(postPrep?.cleanedDrivers || [])])],
    repairedSymlink: Boolean(prep?.repairedSymlink || postPrep?.repairedSymlink),
    needsReboot: Boolean(prep?.needsReboot || postPrep?.needsReboot),
  };
  return { prep: mergedPrep, logDiag, conflicts };
}

async function runNpcapInstaller({
  onProgress,
  prepareEnvFn = prepareNpcapEnvironment,
  inspectFailureFn,
  hasNpcapFn = hasNpcap,
  fetchFn = fetchHttps,
  spawnFn = spawn,
} = {}) {
  if (hasNpcapFn()) {
    return { installed: true, version: '', exitCode: 0 };
  }
  onProgress?.('installing', '正在检查并自动清理残留 Npcap 驱动与安装环境…');
  const prep = await prepareEnvFn({ platform: process.platform, hasNpcapFn, onProgress });
  if (prep?.needsReboot) {
    return {
      installed: false,
      version: '',
      exitCode: 1072,
      needsReboot: true,
      failureMessage: formatNpcapFailureMessage({ prep, logDiag: {}, conflicts: [], exitCode: 1072 }),
    };
  }

  onProgress?.('downloading', '正在从 npcap.com 获取最新官方安装程序…');
  const listing = await fetchFn(NPCAP_DIST_URL, { maxBytes: MAX_HTML_BYTES });
  const target = pickLatestNpcapInstaller(listing);
  if (!target) {
    throw new Error('未能从 npcap.com/dist 解析到最新安装包，请打开官网手动下载');
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-npcap-'));
  const installerPath = path.join(tempDir, target.filename);
  try {
    onProgress?.('downloading', `正在下载官方 ${target.filename}…`);
    await fetchFn(target.url, { maxBytes: MAX_INSTALLER_BYTES, destPath: installerPath });
    onProgress?.('installing', `已打开 ${target.filename} 官方安装向导，请按提示完成安装（建议勾选 WinPcap 兼容模式）…`);
    const startedAt = Date.now();
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawnFn(installerPath, [], { cwd: tempDir, windowsHide: false, stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 0));
    });
    if (hasNpcapFn()) {
      return { installed: true, version: target.version, exitCode };
    }
    const inspectFn = typeof inspectFailureFn === 'function' ? inspectFailureFn : inspectNpcapFailure;
    const diag = (await inspectFn({ startedAt, prep, exitCode, hasNpcapFn })) || {};
    const effectivePrep = diag.prep || prep;
    const logDiag = diag.logDiag || {};
    const conflicts = diag.conflicts || [];
    const needsReboot = Boolean(effectivePrep?.needsReboot || logDiag?.markedForDelete);
    return {
      installed: false,
      version: target.version,
      exitCode,
      needsReboot,
      failureMessage: diag.failureMessage || formatNpcapFailureMessage({
        prep: effectivePrep,
        logDiag,
        conflicts,
        exitCode,
      }),
    };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = {
  NPCAP_DOWNLOAD_PAGE,
  hasNpcap,
  npcapDllPath,
  pickLatestNpcapInstaller,
  parsePnputilNpcapDrivers,
  parseSymlinkEvaluationDisabled,
  parseNpcapInstallLog,
  detectConflictingNetworkApps,
  prepareNpcapEnvironment,
  formatNpcapFailureMessage,
  inspectNpcapFailure,
  runNpcapInstaller,
};
