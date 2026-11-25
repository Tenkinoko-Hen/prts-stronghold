// 青逝痕 Tenkinoko 制作
const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const HUD_SHORTCUT = 'CommandOrControl+Shift+F10';

function installHudOverlay({ mainWindow, ipcMain, globalShortcut, product, onExpandDrawer }) {
  let hudWindow = null;
  let disposed = false;
  let state = {
    open: false,
    locked: false,
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

  function ensureHudWindow(initialBounds) {
    if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;
    // 严格克制悬浮窗体积，绝不遮挡核心棋盘；超出内容在主体区统一平滑向下滚动
    const width = Number.isFinite(initialBounds?.width) && initialBounds.width > 0 ? Math.round(initialBounds.width) : 460;
    const height = Number.isFinite(initialBounds?.height) && initialBounds.height > 0 ? Math.round(initialBounds.height) : 188;
    const x = Number.isFinite(initialBounds?.x)
      ? Math.round(initialBounds.x)
      : Math.max(workArea.x + 12, workArea.x + Math.round((workArea.width - width) / 2));
    const y = Number.isFinite(initialBounds?.y)
      ? Math.round(initialBounds.y)
      : workArea.y + 16;

    hudWindow = new BrowserWindow({
      title: `${product.shortName || 'PRTS'} 微缩遥测条`,
      x,
      y,
      width,
      height,
      minWidth: 360,
      minHeight: 112,
      maxWidth: 540,
      maxHeight: 248,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        additionalArguments: [`--prts-mode=${product.mode}`],
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    hudWindow.setMenu(null);
    hudWindow.setAlwaysOnTop(true, 'screen-saver');
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
          if (hudWindow && !hudWindow.isDestroyed()) hudWindow.loadURL('prts://app/?hud=1');
        }, 300);
      } else {
        setOpen(false);
      }
    });
    hudWindow.on('closed', () => {
      hudWindow = null;
      if (!disposed) {
        state = { ...state, open: false, locked: false, drawerCollapsed: false };
        broadcast();
      }
    });
    hudWindow.once('ready-to-show', () => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      hudWindow.showInactive();
      applyLockState(state.locked);
    });
    hudWindow.loadURL('prts://app/?hud=1');
    return hudWindow;
  }

  function setOpen(flag) {
    if (disposed) return state;
    const nextOpen = Boolean(flag);
    if (nextOpen) {
      state = { ...state, open: true };
      ensureHudWindow();
      return broadcast();
    }
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.close();
      hudWindow = null;
    }
    state = { ...state, open: false, locked: false, drawerCollapsed: false };
    return broadcast();
  }

  function openAtBounds(bounds, { drawerCollapsed } = {}) {
    if (disposed) return state;
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
      const width = Number.isFinite(bounds.width) && bounds.width > 0 ? Math.round(bounds.width) : 460;
      const height = Number.isFinite(bounds.height) && bounds.height > 0 ? Math.round(bounds.height) : 188;
      win.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width, height });
      if (win.isVisible()) {
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    }
    return broadcast();
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
    setOpen,
    openAtBounds,
    setDrawerCollapsed,
    updateBattleFeed,
    updateGuideContext,
    dispose() {
      disposed = true;
      try { globalShortcut?.unregister(HUD_SHORTCUT); } catch {}
      if (hudWindow && !hudWindow.isDestroyed()) {
        hudWindow.destroy();
      }
      hudWindow = null;
    },
  };
}

module.exports = { installHudOverlay };
