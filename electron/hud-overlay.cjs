// 青逝痕 Tenkinoko 制作
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { BrowserWindow, screen } = electron && typeof electron === 'object' ? electron : {};
const { isSafeGpuMode } = require('./startup-guard.cjs');

const HUD_SHORTCUT = 'CommandOrControl+Shift+F10';

const HUD_SCALES = {
  sm: { width: 500, height: 248 },
  md: { width: 580, height: 280 },
  lg: { width: 660, height: 316 },
};

function normalizeHudScale(scale) {
  return scale === 'sm' || scale === 'md' || scale === 'lg' ? scale : null;
}

function defaultHudScaleForWorkArea(workArea) {
  return Number(workArea?.width) >= 1800 ? 'md' : 'sm';
}

function getHudDimensions(scale) {
  return HUD_SCALES[normalizeHudScale(scale) || 'md'];
}

function clampHudBoundsToWorkArea(bounds, workArea) {
  const waX = Number(workArea?.x) || 0;
  const waY = Number(workArea?.y) || 0;
  const waW = Math.max(360, Number(workArea?.width) || 1280);
  const waH = Math.max(120, Number(workArea?.height) || 720);
  const width = Math.min(bounds.width, waW);
  const height = Math.min(bounds.height, waH);
  const x = Math.max(waX, Math.min(waX + waW - width, bounds.x));
  const y = Math.max(waY, Math.min(waY + waH - height, bounds.y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function readPersistedHudPrefs(prefsPath) {
  if (!prefsPath) return {};
  try {
    if (!fs.existsSync(prefsPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePersistedHudPrefs(prefsPath, prefs) {
  if (!prefsPath) return;
  try {
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');
  } catch {
    // ignore preference persistence errors
  }
}

function resolveHudDisplayWorkArea({ screenApi, mainWindow, initialBounds }) {
  const fallback = { x: 0, y: 0, width: 1920, height: 1080 };
  if (!screenApi) return fallback;
  try {
    if (
      initialBounds
      && Number.isFinite(initialBounds.x)
      && Number.isFinite(initialBounds.y)
    ) {
      const target = {
        x: Math.round(initialBounds.x),
        y: Math.round(initialBounds.y),
        width: Math.max(1, Math.round(initialBounds.width || 500)),
        height: Math.max(1, Math.round(initialBounds.height || 248)),
      };
      return screenApi.getDisplayMatching(target)?.workArea || screenApi.getPrimaryDisplay()?.workArea || fallback;
    }
    if (mainWindow && typeof mainWindow.isDestroyed === 'function' && !mainWindow.isDestroyed() && typeof mainWindow.getBounds === 'function') {
      const mainBounds = mainWindow.getBounds();
      if (mainBounds && Number.isFinite(mainBounds.x) && Number.isFinite(mainBounds.y) && mainBounds.width > 0 && mainBounds.height > 0) {
        return screenApi.getDisplayMatching(mainBounds)?.workArea || screenApi.getPrimaryDisplay()?.workArea || fallback;
      }
    }
    return screenApi.getPrimaryDisplay()?.workArea || fallback;
  } catch {
    return fallback;
  }
}

function installHudOverlay({ app, mainWindow, ipcMain, globalShortcut, product, onExpandDrawer }) {
  let hudWindow = null;
  let readyShowTimer = null;
  let tempHidden = false;
  let disposed = false;
  const prefsPath = app && typeof app.getPath === 'function'
    ? path.join(app.getPath('userData'), 'hud-prefs.json')
    : null;
  const savedPrefs = readPersistedHudPrefs(prefsPath);
  const primaryWorkArea = (() => {
    try {
      return screen.getPrimaryDisplay()?.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
    } catch {
      return { x: 0, y: 0, width: 1920, height: 1080 };
    }
  })();
  const initialScale = normalizeHudScale(savedPrefs.scale) || defaultHudScaleForWorkArea(primaryWorkArea);

  let state = {
    open: false,
    locked: false,
    scale: initialScale,
    shortcut: 'Ctrl+Shift+F10',
    shortcutAvailable: false,
    status: 'starting',
    clientSource: 'none',
    drawerCollapsed: false,
    report: null,
    guide: {
      round: 1,
      compTitle: '',
      paceTip: '',
      suggestedOperators: [],
    },
  };

  function isTrustedSender(event) {
    const sender = event.sender;
    const frame = event.senderFrame;
    if (!frame || !frame.url.startsWith('prts://app/')) return false;
    if (!mainWindow.isDestroyed() && sender === mainWindow.webContents && frame === mainWindow.webContents.mainFrame) {
      return true;
    }
    if (hudWindow && !hudWindow.isDestroyed() && sender === hudWindow.webContents && frame === hudWindow.webContents.mainFrame) {
      return true;
    }
    return false;
  }

  function broadcast() {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hud-overlay-state', state);
    }
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.webContents.send('hud-overlay-state', state);
    }
    return state;
  }

  function applyLockState(locked) {
    state = { ...state, locked: Boolean(locked) };
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.setIgnoreMouseEvents(state.locked, { forward: true });
      hudWindow.setFocusable(!state.locked);
      hudWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    return broadcast();
  }

  function getScaleBounds() {
    return getHudDimensions(state.scale);
  }

  function clearReadyShowTimer() {
    if (readyShowTimer) {
      clearTimeout(readyShowTimer);
      readyShowTimer = null;
    }
  }

  function revealHudWindow() {
    clearReadyShowTimer();
    if (disposed || tempHidden || !hudWindow || hudWindow.isDestroyed() || !state.open) return;
    try {
      const current = hudWindow.getBounds();
      const workArea = resolveHudDisplayWorkArea({ screenApi: screen, mainWindow, initialBounds: current });
      const clamped = clampHudBoundsToWorkArea(current, workArea);
      if (clamped.x !== current.x || clamped.y !== current.y || clamped.width !== current.width || clamped.height !== current.height) {
        hudWindow.setBounds(clamped);
      }
    } catch {
      // ignore bounds query errors
    }
    if (!hudWindow.isVisible()) {
      hudWindow.showInactive();
    }
    applyLockState(state.locked);
    try {
      hudWindow.moveTop();
    } catch {
      // ignore z-order errors
    }
  }

  function ensureHudWindow(initialBounds) {
    if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;
    const workArea = resolveHudDisplayWorkArea({ screenApi: screen, mainWindow, initialBounds });
    const preset = getScaleBounds();
    // 严格克制悬浮窗体积，绝不遮挡核心棋盘；超出内容在主体区统一平滑向下滚动
    const width = Number.isFinite(initialBounds?.width) && initialBounds.width > 0 ? Math.round(initialBounds.width) : preset.width;
    const height = Number.isFinite(initialBounds?.height) && initialBounds.height > 0 ? Math.round(initialBounds.height) : preset.height;
    const rawX = Number.isFinite(initialBounds?.x)
      ? Math.round(initialBounds.x)
      : Math.max(workArea.x + 12, workArea.x + Math.round((workArea.width - width) / 2));
    const rawY = Number.isFinite(initialBounds?.y)
      ? Math.round(initialBounds.y)
      : workArea.y + 16;
    const clampedInitial = clampHudBoundsToWorkArea({ x: rawX, y: rawY, width, height }, workArea);
    const safeGpu = isSafeGpuMode({ argv: process.argv, commandLine: app?.commandLine });

    hudWindow = new BrowserWindow({
      title: `${product.shortName || 'PRTS'} 微缩遥测条`,
      x: clampedInitial.x,
      y: clampedInitial.y,
      width: clampedInitial.width,
      height: clampedInitial.height,
      minWidth: 360,
      minHeight: 112,
      maxWidth: 720,
      maxHeight: 360,
      frame: false,
      transparent: !safeGpu,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      backgroundColor: safeGpu ? '#0b0e14' : '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        additionalArguments: [`--prts-mode=${product.mode}`],
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: !safeGpu,
      },
    });
    hudWindow.setMenu(null);
    hudWindow.setAlwaysOnTop(true, 'screen-saver');
    try {
      hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      // ignore unsupported workspace flag
    }
    hudWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    hudWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('prts://app/')) event.preventDefault();
    });
    let hudCrashRecoveries = 0;
    hudWindow.webContents.on('render-process-gone', (_event, details) => {
      if (!hudWindow || hudWindow.isDestroyed() || details?.reason === 'clean-exit') return;
      if (hudCrashRecoveries < 2) {
        hudCrashRecoveries += 1;
        setTimeout(() => {
          if (hudWindow && !hudWindow.isDestroyed()) {
            hudWindow.loadURL('prts://app/?hud=1');
            clearReadyShowTimer();
            readyShowTimer = setTimeout(revealHudWindow, 900);
          }
        }, 300);
      } else {
        setOpen(false);
      }
    });
    hudWindow.on('closed', () => {
      clearReadyShowTimer();
      hudWindow = null;
      if (!disposed) {
        state = { ...state, open: false, locked: false, drawerCollapsed: false };
        broadcast();
      }
    });
    hudWindow.once('ready-to-show', () => {
      revealHudWindow();
    });
    hudWindow.webContents.on('did-finish-load', () => {
      if (hudWindow && !hudWindow.isDestroyed() && state.open) {
        hudWindow.webContents.send('hud-overlay-state', state);
        if (!hudWindow.isVisible()) {
          revealHudWindow();
        }
      }
    });
    clearReadyShowTimer();
    readyShowTimer = setTimeout(revealHudWindow, 900);
    hudWindow.loadURL('prts://app/?hud=1');
    return hudWindow;
  }

  function setOpen(flag) {
    if (disposed) return state;
    const nextOpen = Boolean(flag);
    if (nextOpen) {
      const existed = Boolean(hudWindow && !hudWindow.isDestroyed());
      state = { ...state, open: true };
      ensureHudWindow();
      if (existed) {
        revealHudWindow();
      }
      return broadcast();
    }
    clearReadyShowTimer();
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.close();
      hudWindow = null;
    }
    state = { ...state, open: false, locked: false, drawerCollapsed: false };
    return broadcast();
  }

  function openAtBounds(bounds, { drawerCollapsed } = {}) {
    if (disposed) return state;
    const existed = Boolean(hudWindow && !hudWindow.isDestroyed());
    state = {
      ...state,
      open: true,
      ...(drawerCollapsed !== undefined ? { drawerCollapsed: Boolean(drawerCollapsed) } : {}),
    };
    const win = ensureHudWindow(bounds);
    if (
      win
      && !win.isDestroyed()
      && bounds
      && Number.isFinite(bounds.x)
      && Number.isFinite(bounds.y)
    ) {
      const preset = getScaleBounds();
      const width = Number.isFinite(bounds.width) && bounds.width > 0 ? Math.round(bounds.width) : preset.width;
      const height = Number.isFinite(bounds.height) && bounds.height > 0 ? Math.round(bounds.height) : preset.height;
      const workArea = resolveHudDisplayWorkArea({ screenApi: screen, mainWindow, initialBounds: bounds });
      const clamped = clampHudBoundsToWorkArea({ x: Math.round(bounds.x), y: Math.round(bounds.y), width, height }, workArea);
      win.setBounds(clamped);
      if (existed || win.isVisible()) {
        revealHudWindow();
      }
    }
    return broadcast();
  }

  function setScale(nextScale) {
    if (disposed) return state;
    const normalized = normalizeHudScale(nextScale);
    if (!normalized) return state;
    state = { ...state, scale: normalized };
    writePersistedHudPrefs(prefsPath, { ...savedPrefs, scale: normalized });
    if (hudWindow && !hudWindow.isDestroyed()) {
      const target = getHudDimensions(normalized);
      const prev = hudWindow.getBounds();
      const display = screen.getDisplayMatching(prev);
      const clamped = clampHudBoundsToWorkArea({
        x: prev.x + Math.round((prev.width - target.width) / 2),
        y: prev.y,
        width: target.width,
        height: target.height,
      }, display?.workArea);
      hudWindow.setBounds(clamped);
    }
    return broadcast();
  }

  function setTemporarilyHidden(flag) {
    if (disposed) return false;
    const nextHidden = Boolean(flag);
    if (nextHidden) {
      if (hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
        tempHidden = true;
        hudWindow.hide();
        return true;
      }
      return false;
    }
    if (!tempHidden) return false;
    tempHidden = false;
    if (state.open && hudWindow && !hudWindow.isDestroyed()) {
      revealHudWindow();
      return true;
    }
    return false;
  }

  function setDrawerCollapsed(flag) {
    if (disposed) return state;
    state = { ...state, drawerCollapsed: Boolean(flag) };
    return broadcast();
  }

  function updateBattleFeed(feed) {
    if (!feed || disposed) return;
    state = {
      ...state,
      status: feed.status || state.status,
      clientSource: feed.clientSource !== undefined ? feed.clientSource : state.clientSource,
      report: feed.report !== undefined ? feed.report : state.report,
    };
    if (state.open) broadcast();
  }

  function updateGuideContext(guidePatch) {
    if (!guidePatch || typeof guidePatch !== 'object') return state;
    const round = Number.isInteger(guidePatch.round) && guidePatch.round >= 1 && guidePatch.round <= 15
      ? guidePatch.round
      : state.guide.round;
    const compTitle = typeof guidePatch.compTitle === 'string' ? guidePatch.compTitle.slice(0, 120) : state.guide.compTitle;
    const paceTip = typeof guidePatch.paceTip === 'string' ? guidePatch.paceTip.slice(0, 800) : state.guide.paceTip;
    const suggestedOperators = Array.isArray(guidePatch.suggestedOperators)
      ? guidePatch.suggestedOperators
          .filter(x => typeof x === 'string')
          .map(x => x.trim().slice(0, 32))
          .filter(Boolean)
          .slice(0, 16)
      : state.guide.suggestedOperators;
    state = { ...state, guide: { round, compTitle, paceTip, suggestedOperators } };
    if (state.open) broadcast();
    return state;
  }

  if (globalShortcut) {
    try {
      const registered = globalShortcut.register(HUD_SHORTCUT, () => {
        if (!state.open) return;
        applyLockState(!state.locked);
      });
      state = { ...state, shortcutAvailable: Boolean(registered) };
    } catch {
      state = { ...state, shortcutAvailable: false };
    }
  }

  ipcMain.handle('hud-overlay-get', (event) => {
    if (!isTrustedSender(event)) throw new Error('Forbidden');
    return state;
  });
  ipcMain.handle('hud-overlay-open', (event, flag) => {
    if (!isTrustedSender(event)) throw new Error('Forbidden');
    return setOpen(flag);
  });
  ipcMain.handle('hud-overlay-lock', (event, locked) => {
    if (!isTrustedSender(event)) throw new Error('Forbidden');
    return applyLockState(locked);
  });
  ipcMain.handle('hud-overlay-scale', (event, scalePatch) => {
    if (!isTrustedSender(event)) throw new Error('Forbidden');
    return setScale(scalePatch);
  });
  ipcMain.handle('hud-overlay-guide', (event, guidePatch) => {
    if (!isTrustedSender(event)) throw new Error('Forbidden');
    return updateGuideContext(guidePatch);
  });
  ipcMain.handle('hud-overlay-expand-drawer', (event) => {
    if (!isTrustedSender(event)) throw new Error('Forbidden');
    if (typeof onExpandDrawer === 'function') onExpandDrawer();
    return state;
  });

  return {
    getState: () => state,
    getWindow: () => hudWindow,
    getScaleBounds,
    setOpen,
    setScale,
    openAtBounds,
    setDrawerCollapsed,
    setTemporarilyHidden,
    updateBattleFeed,
    updateGuideContext,
    dispose() {
      disposed = true;
      clearReadyShowTimer();
      try { globalShortcut?.unregister(HUD_SHORTCUT); } catch {}
      if (hudWindow && !hudWindow.isDestroyed()) {
        hudWindow.destroy();
      }
      hudWindow = null;
    },
  };
}

module.exports = {
  HUD_SCALES,
  normalizeHudScale,
  defaultHudScaleForWorkArea,
  getHudDimensions,
  clampHudBoundsToWorkArea,
  resolveHudDisplayWorkArea,
  installHudOverlay,
};
