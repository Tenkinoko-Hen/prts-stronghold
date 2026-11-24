const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const NPCAP_DIST_URL = 'https://npcap.com/dist/';
const NPCAP_DOWNLOAD_PAGE = 'https://npcap.com/#download';
const MAX_HTML_BYTES = 512 * 1024;
const MAX_INSTALLER_BYTES = 20 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;

function npcapDllPath() {
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return path.join(windir, 'System32', 'Npcap', 'wpcap.dll');
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

async function runNpcapInstaller({ onProgress } = {}) {
  if (hasNpcap()) {
    return { installed: true, version: '', exitCode: 0 };
  }
  onProgress?.('downloading', '正在从 npcap.com 获取最新官方安装程序…');
  const listing = await fetchHttps(NPCAP_DIST_URL, { maxBytes: MAX_HTML_BYTES });
  const target = pickLatestNpcapInstaller(listing);
  if (!target) {
    throw new Error('未能从 npcap.com/dist 解析到最新安装包，请打开官网手动下载');
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prts-npcap-'));
  const installerPath = path.join(tempDir, target.filename);
  try {
    onProgress?.('downloading', `正在下载官方 ${target.filename}…`);
    await fetchHttps(target.url, { maxBytes: MAX_INSTALLER_BYTES, destPath: installerPath });
    onProgress?.('installing', `已打开 ${target.filename} 官方安装向导，请按提示完成安装（建议勾选 WinPcap 兼容模式）…`);
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(installerPath, [], { cwd: tempDir, windowsHide: false, stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 0));
    });
    return { installed: hasNpcap(), version: target.version, exitCode };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = {
  NPCAP_DOWNLOAD_PAGE,
  hasNpcap,
  npcapDllPath,
  pickLatestNpcapInstaller,
  runNpcapInstaller,
};
