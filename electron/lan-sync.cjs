const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');

const DEFAULT_LAN_PORT = 39527;
const MAX_AUTH_FAILURES = 8;
const AUTH_WINDOW_MS = 60_000;

function normalizeIpv4(rawAddress) {
  if (typeof rawAddress !== 'string' || !rawAddress) return '';
  const trimmed = rawAddress.trim();
  if (trimmed === '::1') return '127.0.0.1';
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

function isPrivateLanIp(rawAddress) {
  const ip = normalizeIpv4(rawAddress);
  if (!ip) return false;
  if (ip === '127.0.0.1') return true;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map(part => (/^\d{1,3}$/.test(part) ? Number(part) : -1));
  if (octets.some(n => n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Local CGNAT / Tailscale LAN
  return false;
}

function listLanAddresses() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    const lower = name.toLowerCase();
    const virtualHint = /vmware|vbox|virtual|wsl|hyper-v|vethernet|docker|loopback/.test(lower);
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      if (!isPrivateLanIp(entry.address)) continue;
      const priority = virtualHint ? 3 : entry.address.startsWith('192.168.') ? 0 : entry.address.startsWith('10.') ? 1 : 2;
      candidates.push({ name, address: entry.address, priority });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.address.localeCompare(b.address));
  return [...new Set(candidates.map(item => item.address))];
}

function generatePin() {
  return String(crypto.randomInt(1000, 10000));
}

function verifyPin(expectedPin, providedPin) {
  if (typeof expectedPin !== 'string' || typeof providedPin !== 'string') return false;
  const cleanExpected = expectedPin.trim();
  const cleanProvided = providedPin.trim();
  if (cleanExpected.length !== 4 || cleanProvided.length !== 4) return false;
  return crypto.timingSafeEqual(Buffer.from(cleanExpected, 'utf8'), Buffer.from(cleanProvided, 'utf8'));
}

function installLanSync({ mainWindow, ipcMain, product }) {
  let server = null;
  let disposed = false;
  let seq = 1;
  const authFailures = new Map();
  const activePeers = new Map();

  let payload = {
    status: 'starting',
    report: null,
    reportEnded: false,
    guide: {
      bannedCovenants: [],
      currentRound: 1,
      selectedCompId: '',
      compTitle: '',
      paceTip: '',
    },
  };

  let state = {
    enabled: false,
    port: DEFAULT_LAN_PORT,
    pin: generatePin(),
    addresses: listLanAddresses(),
    peerCount: 0,
    lastSyncAt: null,
    error: '',
  };

  function prunePeers(now = Date.now()) {
    for (const [ip, seenAt] of activePeers.entries()) {
      if (now - seenAt > 15_000) activePeers.delete(ip);
    }
    return activePeers.size;
  }

  function publish(patch = {}) {
    state = {
      ...state,
      ...patch,
      addresses: listLanAddresses(),
      peerCount: prunePeers(),
    };
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lan-sync-state', state);
    }
    return state;
  }

  function isRateLimited(ip, now = Date.now()) {
    const rec = authFailures.get(ip);
    if (!rec) return false;
    if (now - rec.firstAt > AUTH_WINDOW_MS) {
      authFailures.delete(ip);
      return false;
    }
    return rec.count >= MAX_AUTH_FAILURES;
  }

  function recordAuthFailure(ip, now = Date.now()) {
    const rec = authFailures.get(ip);
    if (!rec || now - rec.firstAt > AUTH_WINDOW_MS) {
      authFailures.set(ip, { firstAt: now, count: 1 });
    } else {
      rec.count += 1;
    }
  }

  function sendJson(res, statusCode, body) {
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(raw.length),
      'Cache-Control': 'no-store',
      Connection: 'close',
    });
    res.end(raw);
  }

  function handleRequest(req, res) {
    const remoteIp = normalizeIpv4(req.socket.remoteAddress || '');
    if (!isPrivateLanIp(remoteIp)) {
      return sendJson(res, 403, { ok: false, error: '仅允许同一局域网私有地址访问' });
    }
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    }
    if (isRateLimited(remoteIp)) {
      return sendJson(res, 429, { ok: false, error: '配对码尝试过多，请稍后再试' });
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Bad Request' });
    }
    const providedPin = parsedUrl.searchParams.get('pin') || req.headers['x-prts-pin'] || '';
    if (!verifyPin(state.pin, String(providedPin))) {
      recordAuthFailure(remoteIp);
      return sendJson(res, 401, { ok: false, error: '4位配对码不正确' });
    }
    authFailures.delete(remoteIp);
    const now = Date.now();
    const prevPeers = activePeers.size;
    activePeers.set(remoteIp, now);

    if (parsedUrl.pathname === '/api/v1/pair') {
      publish({ lastSyncAt: now });
      return sendJson(res, 200, {
        ok: true,
        product: product.id,
        productName: product.name,
        seq,
        at: now,
      });
    }
    if (parsedUrl.pathname === '/api/v1/state') {
      if (activePeers.size !== prevPeers) publish({ lastSyncAt: now });
      else state.lastSyncAt = now;
      return sendJson(res, 200, {
        ok: true,
        seq,
        at: now,
        product: product.id,
        productName: product.name,
        status: payload.status,
        reportEnded: payload.reportEnded,
        guide: payload.guide,
        report: payload.report,
      });
    }
    return sendJson(res, 404, { ok: false, error: 'Not Found' });
  }

  function stopServer() {
    if (!server) return Promise.resolve(publish({ enabled: false, error: '' }));
    const closing = server;
    server = null;
    activePeers.clear();
    return new Promise(resolve => {
      closing.close(() => resolve(publish({ enabled: false, peerCount: 0, error: '' })));
    });
  }

  function startServer(preferredPort = DEFAULT_LAN_PORT) {
    if (disposed) return Promise.resolve(state);
    if (server) return Promise.resolve(publish({ enabled: true }));
    return new Promise(resolve => {
      const nextServer = http.createServer(handleRequest);
      nextServer.keepAliveTimeout = 2000;
      nextServer.headersTimeout = 4000;
      const tryListen = (portToTry) => {
        nextServer.once('error', (err) => {
          if (err && err.code === 'EADDRINUSE' && portToTry !== 0) {
            tryListen(0);
            return;
          }
          resolve(publish({
            enabled: false,
            error: err instanceof Error ? err.message : '无法启动局域网无线副屏端口',
          }));
        });
        nextServer.listen(portToTry, '0.0.0.0', () => {
          server = nextServer;
          const addr = nextServer.address();
          const boundPort = typeof addr === 'object' && addr ? addr.port : portToTry;
          resolve(publish({ enabled: true, port: boundPort, error: '' }));
        });
      };
      tryListen(preferredPort);
    });
  }

  function updateBattleFeed(feed) {
    if (!feed || disposed) return;
    seq += 1;
    const hasIncomingReport = feed.report !== undefined && feed.report !== null;
    payload = {
      ...payload,
      status: feed.status || payload.status,
      // Keep last finished report on secondary display until a brand-new live match arrives
      report: hasIncomingReport ? feed.report : payload.report,
      reportEnded: hasIncomingReport ? false : Boolean(payload.report),
    };
  }

  function updateGuideState(guidePatch) {
    if (!guidePatch || typeof guidePatch !== 'object' || disposed) return state;
    seq += 1;
    payload = {
      ...payload,
      guide: {
        bannedCovenants: Array.isArray(guidePatch.bannedCovenants)
          ? guidePatch.bannedCovenants.filter(x => typeof x === 'string').slice(0, 26)
          : payload.guide.bannedCovenants,
        currentRound: Number.isInteger(guidePatch.currentRound) && guidePatch.currentRound >= 1 && guidePatch.currentRound <= 15
          ? guidePatch.currentRound
          : payload.guide.currentRound,
        selectedCompId: typeof guidePatch.selectedCompId === 'string'
          ? guidePatch.selectedCompId.slice(0, 80)
          : payload.guide.selectedCompId,
        compTitle: typeof guidePatch.compTitle === 'string'
          ? guidePatch.compTitle.slice(0, 80)
          : payload.guide.compTitle,
        paceTip: typeof guidePatch.paceTip === 'string'
          ? guidePatch.paceTip.slice(0, 600)
          : payload.guide.paceTip,
      },
    };
    return state;
  }

  function ensureMainSender(event) {
    if (
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      !event.senderFrame.url.startsWith('prts://app/')
    ) {
      throw new Error('Forbidden');
    }
  }

  ipcMain.handle('lan-sync-get', (event) => {
    ensureMainSender(event);
    return publish();
  });
  ipcMain.handle('lan-sync-enable', async (event, enabled) => {
    ensureMainSender(event);
    return enabled ? startServer() : stopServer();
  });
  ipcMain.handle('lan-sync-refresh-pin', (event) => {
    ensureMainSender(event);
    activePeers.clear();
    return publish({ pin: generatePin(), peerCount: 0 });
  });
  ipcMain.handle('lan-sync-guide', (event, guidePatch) => {
    ensureMainSender(event);
    return updateGuideState(guidePatch);
  });

  return {
    getState: () => state,
    updateBattleFeed,
    updateGuideState,
    dispose() {
      disposed = true;
      if (server) {
        try { server.close(); } catch {}
        server = null;
      }
      activePeers.clear();
    },
  };
}

module.exports = {
  DEFAULT_LAN_PORT,
  installLanSync,
  isPrivateLanIp,
  listLanAddresses,
  normalizeIpv4,
  verifyPin,
};
