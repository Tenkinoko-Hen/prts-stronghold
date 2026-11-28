// 青逝痕 Tenkinoko 制作
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, net, protocol, screen, session, shell, Tray, Menu } = require('electron');
const { createHotUpdateManager } = require('./hot-update.cjs');
const HOT_UPDATE_PUBKEY = require('./hot-update-pubkey.cjs');
const { installBattleReports } = require('./battle-reports.cjs');
const { installReportStore } = require('./report-store.cjs');
const { installStorageManager, resolveBootstrapStorage } = require('./storage-manager.cjs');
const { installCovenantOcr } = require('./covenant-ocr.cjs');
const { installHudOverlay } = require('./hud-overlay.cjs');
const { installLanSync } = require('./lan-sync.cjs');
const { computeMumuDrawerBounds, computeMumuHudBounds } = require('./mumu-layout.cjs');
const { loadRuntimeProduct, brandingAssetPath } = require('./product-runtime.cjs');
const {
  applyStartupGpuWorkarounds,
  buildSafeGpuRelaunchArgs,
  createStartupLogger,
  readStartupPrefs,
  shouldRelaunchForChildProcessGone,
  shouldRelaunchForRenderProcessGone,
  writeStartupPrefs,
} = require('./startup-guard.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'prts', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const product = loadRuntimeProduct(app);
const desktop = product.desktop;
let mainWindow;
let tray;
let mainWindowShown = false;
let isQuitting = false;
let hasRelaunchedForGpu = false;

const storageBootstrap = resolveBootstrapStorage({
  product,
  app,
  env: process.env,
  portableDir: process.env.PORTABLE_EXECUTABLE_DIR || '',
  platform: process.platform,
});
const userDataInitError = storageBootstrap.initError;
if (process.platform === 'win32' && desktop.appId) {
  app.setAppUserModelId(desktop.appId);
}

let userDataDir = '';
try {
  userDataDir = app.getPath('userData');
} catch {
  userDataDir = '';
}
const startupPrefs = readStartupPrefs(userDataDir);
const safeGpuMode = applyStartupGpuWorkarounds({
  app,
  platform: process.platform,
  argv: process.argv,
  startupPrefs,
});

const logStartup = createStartupLogger({ app, product, safeGpuMode });

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  isQuitting = true;
  app.quit();
} else {
  logStartup('startup');
  if (userDataInitError) {
    logStartup('userdata-init-failed', userDataInitError);
  }
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

// 全局异常兜底：防止多屏拔插或极端异步异常导致主进程闪退中断对局查阅
process.on('uncaughtException', (err) => {
  console.error('[PRTS Main Guard] Uncaught exception:', err);
  logStartup('uncaught-exception', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[PRTS Main Guard] Unhandled rejection:', reason);
  logStartup('unhandled-rejection', reason);
});

if (gotSingleInstanceLock) {
  app.on('child-process-gone', (_event, details) => {
    logStartup('child-process-gone', {
      type: details?.type,
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
    if (shouldRelaunchForChildProcessGone(details, {
      mainWindowShown,
      safeGpuMode,
      hasRelaunched: hasRelaunchedForGpu,
      isQuitting,
    })) {
      hasRelaunchedForGpu = true;
      isQuitting = true;
      logStartup('gpu-safe-relaunch', {
        type: details?.type,
        reason: details?.reason,
        exitCode: details?.exitCode,
      });
      try { app.releaseSingleInstanceLock(); } catch {}
      app.relaunch({ args: buildSafeGpuRelaunchArgs(process.argv) });
      app.exit(0);
    }
  });
}

if (gotSingleInstanceLock) app.whenReady().then(() => {
  const relaunchApp = () => {
    isQuitting = true;
    try { app.releaseSingleInstanceLock(); } catch {}
    app.relaunch({
      args: safeGpuMode ? buildSafeGpuRelaunchArgs(process.argv) : process.argv.slice(1),
    });
    app.exit(0);
  };
  const builtinDistDir = path.join(app.getAppPath(), 'dist');
  const hotUpdate = createHotUpdateManager({
    product,
    userDataDir: app.getPath('userData'),
    builtinDistDir,
    nativeVersion: app.getVersion(),
    publicKeyPem: process.env.PRTS_HOT_UPDATE_PUBKEY_PEM || HOT_UPDATE_PUBKEY.publicKeyPem,
    manifestUrl: process.env.PRTS_HOT_UPDATE_MANIFEST_URL || undefined,
    allowLocalhost: process.env.PRTS_HOT_UPDATE_ALLOW_LOCALHOST === '1',
    fetchImpl: (url, init) => net.fetch(url, init),
    openExternal: (url) => shell.openExternal(url),
    getMainWindow: () => mainWindow,
    relaunchApp,
    logStartup,
  });
  const resolveWithinRoot = (baseDir, relPath) => {
    const resolved = path.resolve(baseDir, `.${relPath}`);
    const relative = path.relative(baseDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return resolved;
  };
  protocol.handle('prts', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app' || request.method !== 'GET') return new Response('Forbidden', { status: 403 });
    let requestedPath;
    try { requestedPath = decodeURIComponent(url.pathname); }
    catch { return new Response('Bad request', { status: 400 }); }
    const normalizedPath = requestedPath === '/' ? '/index.html' : requestedPath;
    const activeRoot = hotUpdate.getUiRoot();
    const activeFile = resolveWithinRoot(activeRoot, normalizedPath);
    if (!activeFile) return new Response('Forbidden', { status: 403 });
    if (activeRoot !== builtinDistDir && !fs.existsSync(activeFile)) {
      const fallbackFile = resolveWithinRoot(builtinDistDir, normalizedPath);
      if (!fallbackFile) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(fallbackFile).href);
    }
    return net.fetch(pathToFileURL(activeFile).href);
  });
  const layoutFile = path.join(app.getPath('userData'), 'window-layout.json');
  const defaultPin = Boolean(desktop.defaultAlwaysOnTop);
  const readWindowLayout = () => {
    try {
      if (!fs.existsSync(layoutFile)) {
        return {
          mode: 'wide',
          wideAlwaysOnTop: defaultPin,
          railAlwaysOnTop: defaultPin,
          mumuAlwaysOnTop: defaultPin,
        };
      }
      const parsed = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
      const mode = product.mode === 'telemetry' && parsed?.mode === 'rail' ? 'rail' : 'wide';
      return {
        mode,
        wideBounds: product.mode === 'telemetry' ? parsed?.wideBounds : undefined,
        railBounds: product.mode === 'telemetry' ? parsed?.railBounds : undefined,
        wideAlwaysOnTop: typeof parsed?.wideAlwaysOnTop === 'boolean' ? parsed.wideAlwaysOnTop : defaultPin,
        railAlwaysOnTop: typeof parsed?.railAlwaysOnTop === 'boolean' ? parsed.railAlwaysOnTop : defaultPin,
        mumuAlwaysOnTop: typeof parsed?.mumuAlwaysOnTop === 'boolean' ? parsed.mumuAlwaysOnTop : defaultPin,
      };
    } catch {
      return {
        mode: 'wide',
        wideAlwaysOnTop: defaultPin,
        railAlwaysOnTop: defaultPin,
        mumuAlwaysOnTop: defaultPin,
      };
    }
  };
  const clampBounds = (bounds, fallbackW, fallbackH) => {
    const ref = bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
      ? { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width || fallbackW), height: Math.round(bounds.height || fallbackH) }
      : null;
    const display = ref ? screen.getDisplayMatching(ref) : screen.getPrimaryDisplay();
    const wa = display.workArea;
    const width = Math.max(desktop.minWidth, Math.min(wa.width, ref ? ref.width : fallbackW));
    const height = Math.max(desktop.minHeight, Math.min(wa.height, ref ? ref.height : fallbackH));
    const x = ref ? Math.max(wa.x, Math.min(wa.x + wa.width - width, ref.x)) : Math.round(wa.x + (wa.width - width) / 2);
    const y = ref ? Math.max(wa.y, Math.min(wa.y + wa.height - height, ref.y)) : Math.round(wa.y + (wa.height - height) / 2);
    return { x, y, width, height };
  };
  let layoutState = readWindowLayout();
  let autoMumuEnabled = true;
  let manualOverride = false;
  let autoEnteredMumu = false;
  let autoEnteredFromMode = null;
  let drawerCollapsed = false;
  let hudOpenedByCollapse = false;
  let latestClientSource = 'none';
  let latestMumuWindow = null;
  let mumuPlacement = null;
  const isEmulatorSource = (src) => src === 'mumu' || src === 'ldplayer';

  const getModeAlwaysOnTop = (mode = layoutState.mode) => {
    if (mode === 'mumu-drawer') return Boolean(layoutState.mumuAlwaysOnTop);
    if (mode === 'rail') return Boolean(layoutState.railAlwaysOnTop);
    return Boolean(layoutState.wideAlwaysOnTop);
  };

  const persistWindowLayout = () => {
    try {
      fs.mkdirSync(path.dirname(layoutFile), { recursive: true });
      const payload = product.mode === 'telemetry'
        ? {
            mode: layoutState.mode === 'rail' ? 'rail' : 'wide',
            wideBounds: layoutState.wideBounds,
            railBounds: layoutState.railBounds,
            wideAlwaysOnTop: Boolean(layoutState.wideAlwaysOnTop),
            railAlwaysOnTop: Boolean(layoutState.railAlwaysOnTop),
          }
        : {
            wideAlwaysOnTop: Boolean(layoutState.wideAlwaysOnTop),
            mumuAlwaysOnTop: Boolean(layoutState.mumuAlwaysOnTop),
          };
      fs.writeFileSync(layoutFile, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // ignore layout write errors
    }
  };
  const initialBounds = layoutState.mode === 'rail'
    ? clampBounds(layoutState.railBounds, 460, Math.min(840, screen.getPrimaryDisplay().workArea.height - 32))
    : (layoutState.wideBounds ? clampBounds(layoutState.wideBounds, desktop.width, desktop.height) : null);

  mainWindow = new BrowserWindow({
    title: product.windowTitle,
    ...(initialBounds || { width: desktop.width, height: desktop.height, center: true }),
    minWidth: desktop.minWidth,
    minHeight: desktop.minHeight,
    fullscreen: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#090B0F',
    icon: brandingAssetPath(app, product, 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--prts-mode=${product.mode}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !safeGpuMode,
    },
  });
  const initialOnTop = getModeAlwaysOnTop(layoutState.mode);
  if (initialOnTop) mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== 'prts://app/' && !url.startsWith('prts://app/#')) event.preventDefault();
  });

  const isTrustedMainSender = (event) => !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame;
  hotUpdate.installHotUpdateIpc(ipcMain, isTrustedMainSender);

  const getLayoutPublicState = () => ({
    mode: layoutState.mode,
    alwaysOnTop: !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : false,
    clientSource: latestClientSource,
    mumuWindow: latestMumuWindow,
    placement: mumuPlacement,
    autoMumuEnabled,
    drawerCollapsed,
  });

  const sendLayoutState = () => {
    const snapshot = getLayoutPublicState();
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-layout-state', snapshot);
    }
    return snapshot;
  };

  const mumuWindowMovedSignificantly = (prevWin, nextWin) => {
    if (!nextWin) return false;
    if (!prevWin) return true;
    return Math.abs(prevWin.x - nextWin.x) > 4
      || Math.abs(prevWin.y - nextWin.y) > 4
      || Math.abs(prevWin.width - nextWin.width) > 4
      || Math.abs(prevWin.height - nextWin.height) > 4;
  };

  const safeDisplayWorkArea = (rect) => {
    try {
      if (
        rect
        && Number.isFinite(rect.x)
        && Number.isFinite(rect.y)
        && Number.isFinite(rect.width)
        && Number.isFinite(rect.height)
        && rect.width > 0
        && rect.height > 0
      ) {
        return screen.getDisplayMatching({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }).workArea;
      }
    } catch {
      // fall through to primary display
    }
    return screen.getPrimaryDisplay().workArea;
  };

  let hudOverlay = null;

  const snapWindowToMumu = (animate = true) => {
    if (mainWindow.isDestroyed()) return;
    const isLite = product.mode === 'telemetry';
    const minW = isLite ? desktop.minWidth : 380;
    const minH = isLite ? desktop.minHeight : 560;
    const drawerWidth = isLite ? 460 : 416;
    const workArea = safeDisplayWorkArea(latestMumuWindow || mainWindow.getBounds());
    const result = computeMumuDrawerBounds({
      mumuWindow: latestMumuWindow,
      workArea,
      drawerWidth,
      minWidth: minW,
      minHeight: minH,
    });
    mumuPlacement = result.placement;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setMinimumSize(minW, minH);
    mainWindow.setBounds(result.bounds, animate);
    mainWindow.setAlwaysOnTop(getModeAlwaysOnTop(isLite ? 'rail' : 'mumu-drawer'), 'screen-saver');
  };

  const switchLayoutMode = (requestedMode, { isAuto = false, isManual = false, snapMumu = false } = {}) => {
    if (mainWindow.isDestroyed()) return getLayoutPublicState();
    if (product.mode === 'telemetry') {
      const mode = requestedMode === 'rail' ? 'rail' : 'wide';
      if (mode !== layoutState.mode) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        const current = mainWindow.getBounds();
        if (layoutState.mode === 'wide') {
          layoutState.wideBounds = current;
          layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
        } else {
          layoutState.railBounds = current;
          layoutState.railAlwaysOnTop = mainWindow.isAlwaysOnTop();
        }
        const prevMode = layoutState.mode;
        layoutState.mode = mode;
        const display = screen.getDisplayMatching(current);
        const wa = display.workArea;
        if (mode === 'rail') {
          if (snapMumu || (isEmulatorSource(latestClientSource) && isManual)) {
            if (isAuto) {
              autoEnteredMumu = true;
              autoEnteredFromMode = prevMode;
            }
            snapWindowToMumu(true);
          } else {
            const defaultRailW = 460;
            const defaultRailH = Math.min(840, Math.max(desktop.minHeight, wa.height - 32));
            const target = layoutState.railBounds
              ? clampBounds(layoutState.railBounds, defaultRailW, defaultRailH)
              : { x: wa.x + wa.width - defaultRailW - 12, y: wa.y + Math.round((wa.height - defaultRailH) / 2), width: defaultRailW, height: defaultRailH };
            mainWindow.setBounds(target, true);
            mainWindow.setAlwaysOnTop(getModeAlwaysOnTop('rail'), 'screen-saver');
          }
        } else {
          const target = clampBounds(layoutState.wideBounds, desktop.width, desktop.height);
          mainWindow.setBounds(target, true);
          mainWindow.setAlwaysOnTop(getModeAlwaysOnTop('wide'), 'screen-saver');
          mumuPlacement = null;
          autoEnteredMumu = false;
          autoEnteredFromMode = null;
          drawerCollapsed = false;
          if (hudOpenedByCollapse) {
            hudOpenedByCollapse = false;
            hudOverlay?.setOpen(false);
          } else {
            hudOverlay?.setDrawerCollapsed(false);
          }
          if (isManual && isEmulatorSource(latestClientSource)) {
            manualOverride = true;
          }
        }
        persistWindowLayout();
      } else if (mode === 'rail' && snapMumu) {
        if (isAuto && !autoEnteredMumu) {
          autoEnteredMumu = true;
          autoEnteredFromMode = 'rail';
        }
        snapWindowToMumu(true);
      }
      return sendLayoutState();
    }

    const mode = requestedMode === 'mumu-drawer' ? 'mumu-drawer' : 'wide';
    if (mode === layoutState.mode) {
      if (mode === 'mumu-drawer') {
        snapWindowToMumu(false);
        return sendLayoutState();
      }
      return getLayoutPublicState();
    }

    if (mode === 'mumu-drawer') {
      if (layoutState.mode === 'wide') {
        layoutState.wideBounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
        layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
      }
      layoutState.mode = 'mumu-drawer';
      autoEnteredMumu = Boolean(isAuto);
      drawerCollapsed = false;
      snapWindowToMumu(true);
      return sendLayoutState();
    }

    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setMinimumSize(desktop.minWidth, desktop.minHeight);
    const target = clampBounds(layoutState.wideBounds, desktop.width, desktop.height);
    mainWindow.setBounds(target, true);
    mainWindow.setAlwaysOnTop(getModeAlwaysOnTop('wide'), 'screen-saver');
    layoutState.mode = 'wide';
    mumuPlacement = null;
    autoEnteredMumu = false;
    drawerCollapsed = false;
    if (isManual && isEmulatorSource(latestClientSource)) {
      manualOverride = true;
    }
    if (hudOpenedByCollapse) {
      hudOpenedByCollapse = false;
      hudOverlay?.setOpen(false);
    } else {
      hudOverlay?.setDrawerCollapsed(false);
    }
    return sendLayoutState();
  };

  ipcMain.handle('app-relaunch', (event) => {
    if (!isTrustedMainSender(event)) return;
    return relaunchApp();
  });
  ipcMain.handle('set-always-on-top', (event, flag) => {
    if (!isTrustedMainSender(event) || typeof flag !== 'boolean') return false;
    mainWindow.setAlwaysOnTop(flag, 'screen-saver');
    const actual = mainWindow.isAlwaysOnTop();
    if (layoutState.mode === 'mumu-drawer') {
      layoutState.mumuAlwaysOnTop = actual;
    } else if (layoutState.mode === 'rail') {
      layoutState.railAlwaysOnTop = actual;
    } else {
      layoutState.wideAlwaysOnTop = actual;
    }
    persistWindowLayout();
    sendLayoutState();
    return actual;
  });
  ipcMain.handle('window-layout-get', (event) => {
    if (!isTrustedMainSender(event)) {
      return { mode: 'wide', alwaysOnTop: false, clientSource: 'none', mumuWindow: null, placement: null, autoMumuEnabled, drawerCollapsed: false };
    }
    return getLayoutPublicState();
  });
  ipcMain.handle('window-layout-set', (event, nextMode) => {
    if (!isTrustedMainSender(event)) return getLayoutPublicState();
    if (product.mode === 'full') {
      if (nextMode === 'mumu-drawer') {
        manualOverride = false;
        return switchLayoutMode('mumu-drawer', { isManual: true, isAuto: isEmulatorSource(latestClientSource) });
      }
      return switchLayoutMode('wide', { isManual: true });
    }
    if (nextMode === 'rail') {
      manualOverride = false;
      return switchLayoutMode('rail', { isManual: true, snapMumu: isEmulatorSource(latestClientSource) });
    }
    return switchLayoutMode('wide', { isManual: true });
  });
  ipcMain.handle('window-layout-snap-mumu', (event) => {
    if (!isTrustedMainSender(event)) return getLayoutPublicState();
    manualOverride = false;
    if (product.mode === 'telemetry') {
      return switchLayoutMode('rail', { isManual: true, isAuto: isEmulatorSource(latestClientSource), snapMumu: true });
    }
    if (layoutState.mode !== 'mumu-drawer') {
      return switchLayoutMode('mumu-drawer', { isManual: true, isAuto: isEmulatorSource(latestClientSource) });
    }
    snapWindowToMumu(true);
    return sendLayoutState();
  });
  ipcMain.handle('window-layout-collapse-mumu', (event) => {
    if (!isTrustedMainSender(event)) return getLayoutPublicState();
    drawerCollapsed = true;
    const display = latestMumuWindow
      ? screen.getDisplayMatching(latestMumuWindow)
      : screen.getDisplayMatching(mainWindow.getBounds());
    const hudSize = hudOverlay?.getScaleBounds?.();
    const hudBounds = computeMumuHudBounds({
      mumuWindow: latestMumuWindow,
      workArea: display.workArea,
      hudWidth: hudSize?.width,
      hudHeight: hudSize?.height,
    });
    const wasHudOpen = Boolean(hudOverlay?.getState()?.open);
    hudOpenedByCollapse = !wasHudOpen;
    hudOverlay?.openAtBounds(hudBounds, { drawerCollapsed: true });
    mainWindow.minimize();
    return sendLayoutState();
  });
  ipcMain.handle('window-layout-set-auto-mumu', (event, enabled) => {
    if (!isTrustedMainSender(event)) return getLayoutPublicState();
    autoMumuEnabled = Boolean(enabled);
    if (autoMumuEnabled) {
      manualOverride = false;
      if (isEmulatorSource(latestClientSource)) {
        if (product.mode === 'full' && layoutState.mode !== 'mumu-drawer') {
          return switchLayoutMode('mumu-drawer', { isAuto: true });
        }
        if (product.mode === 'telemetry') {
          return switchLayoutMode('rail', { isAuto: true, snapMumu: true });
        }
      }
    }
    return sendLayoutState();
  });
  mainWindow.on('restore', () => {
    if (!drawerCollapsed) return;
    drawerCollapsed = false;
    if (hudOpenedByCollapse) {
      hudOpenedByCollapse = false;
      hudOverlay?.setOpen(false);
    } else {
      hudOverlay?.setDrawerCollapsed(false);
    }
    if (product.mode === 'full' && layoutState.mode === 'mumu-drawer') {
      snapWindowToMumu(false);
    } else if (product.mode === 'telemetry' && layoutState.mode === 'rail' && isEmulatorSource(latestClientSource)) {
      snapWindowToMumu(false);
    }
    sendLayoutState();
  });
  mainWindow.on('close', () => {
    if (mainWindow.isMinimized()) return;
    if (product.mode === 'telemetry') {
      const current = mainWindow.getBounds();
      if (layoutState.mode === 'rail') {
        layoutState.railBounds = current;
        layoutState.railAlwaysOnTop = mainWindow.isAlwaysOnTop();
      } else {
        layoutState.wideBounds = current;
        layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
      }
    } else {
      if (layoutState.mode === 'mumu-drawer') {
        layoutState.mumuAlwaysOnTop = mainWindow.isAlwaysOnTop();
      } else {
        layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
      }
    }
    persistWindowLayout();
  });

  hudOverlay = process.platform === 'win32'
    ? installHudOverlay({
        app,
        mainWindow,
        ipcMain,
        globalShortcut,
        product,
        onExpandDrawer: () => {
          if (mainWindow.isDestroyed()) return;
          drawerCollapsed = false;
          if (hudOpenedByCollapse) {
            hudOpenedByCollapse = false;
            hudOverlay?.setOpen(false);
          } else {
            hudOverlay?.setDrawerCollapsed(false);
          }
          if (mainWindow.isMinimized()) mainWindow.restore();
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.focus();
          if (product.mode === 'full') {
            manualOverride = false;
            if (layoutState.mode !== 'mumu-drawer') {
              switchLayoutMode('mumu-drawer', { isAuto: isEmulatorSource(latestClientSource) });
            } else {
              snapWindowToMumu(true);
              sendLayoutState();
            }
          } else {
            manualOverride = false;
            if (layoutState.mode !== 'rail') {
              switchLayoutMode('rail', { isManual: true, snapMumu: isEmulatorSource(latestClientSource) });
            } else if (isEmulatorSource(latestClientSource)) {
              snapWindowToMumu(true);
              sendLayoutState();
            } else {
              sendLayoutState();
            }
          }
        },
      })
    : null;
  const lanSync = process.platform === 'win32' && product.mode === 'full'
    ? installLanSync({ mainWindow, ipcMain, product })
    : null;
  const battleReports = process.platform === 'win32'
    ? installBattleReports({
        app,
        mainWindow,
        ipcMain,
        product,
        onPublish: (feed) => {
          const prevSource = latestClientSource;
          const prevWin = latestMumuWindow;
          latestClientSource = feed?.clientSource || 'none';
          latestMumuWindow = feed?.mumuWindow || null;

          hudOverlay?.updateBattleFeed(feed);
          lanSync?.updateBattleFeed(feed);

          if (product.mode === 'telemetry') {
            if (isEmulatorSource(latestClientSource)) {
              const moved = mumuWindowMovedSignificantly(prevWin, latestMumuWindow);
              if (autoMumuEnabled && !manualOverride && (!autoEnteredMumu || layoutState.mode !== 'rail')) {
                switchLayoutMode('rail', { isAuto: true, snapMumu: true });
              } else if (layoutState.mode === 'rail' && !drawerCollapsed && !manualOverride && moved) {
                snapWindowToMumu(false);
                sendLayoutState();
              } else if (prevSource !== latestClientSource || moved) {
                sendLayoutState();
              }
              if (drawerCollapsed && hudOverlay?.getState()?.open && moved) {
                const hudSize = hudOverlay?.getScaleBounds?.();
                const hudBounds = computeMumuHudBounds({
                  mumuWindow: latestMumuWindow,
                  workArea: safeDisplayWorkArea(latestMumuWindow),
                  hudWidth: hudSize?.width,
                  hudHeight: hudSize?.height,
                });
                hudOverlay.openAtBounds(hudBounds, { drawerCollapsed: true });
              }
            } else {
              manualOverride = false;
              mumuPlacement = null;
              if (autoEnteredMumu) {
                if (drawerCollapsed) {
                  drawerCollapsed = false;
                  if (hudOpenedByCollapse) {
                    hudOpenedByCollapse = false;
                    hudOverlay?.setOpen(false);
                  } else {
                    hudOverlay?.setDrawerCollapsed(false);
                  }
                  if (mainWindow.isMinimized()) mainWindow.restore();
                  if (!mainWindow.isVisible()) mainWindow.show();
                }
                const restoreWide = autoEnteredFromMode === 'wide' && layoutState.mode === 'rail';
                autoEnteredMumu = false;
                autoEnteredFromMode = null;
                if (restoreWide) {
                  switchLayoutMode('wide', { isAuto: true });
                } else {
                  sendLayoutState();
                }
              } else if (prevSource !== latestClientSource || prevWin !== null) {
                sendLayoutState();
              }
            }
            return;
          }
          if (isEmulatorSource(latestClientSource)) {
            const moved = mumuWindowMovedSignificantly(prevWin, latestMumuWindow);
            if (layoutState.mode !== 'mumu-drawer' && autoMumuEnabled && !manualOverride) {
              switchLayoutMode('mumu-drawer', { isAuto: true });
            } else if (layoutState.mode === 'mumu-drawer' && !drawerCollapsed && moved) {
              snapWindowToMumu(false);
              sendLayoutState();
            } else if (prevSource !== latestClientSource || moved) {
              sendLayoutState();
            }
            if (drawerCollapsed && hudOverlay?.getState()?.open && moved) {
              const hudSize = hudOverlay?.getScaleBounds?.();
              const hudBounds = computeMumuHudBounds({
                mumuWindow: latestMumuWindow,
                workArea: safeDisplayWorkArea(latestMumuWindow),
                hudWidth: hudSize?.width,
                hudHeight: hudSize?.height,
              });
              hudOverlay.openAtBounds(hudBounds, { drawerCollapsed: true });
            }
          } else {
            manualOverride = false;
            if (layoutState.mode === 'mumu-drawer' && autoEnteredMumu) {
              if (drawerCollapsed) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                if (!mainWindow.isVisible()) mainWindow.show();
              }
              switchLayoutMode('wide', { isAuto: true });
            } else if (prevSource !== latestClientSource || prevWin !== null) {
              sendLayoutState();
            }
          }
        },
      })
    : null;
  const covenantOcr = process.platform === 'win32' && product.mode === 'full'
    ? installCovenantOcr({
        mainWindow,
        ipcMain,
        desktopCapturer,
        clipboard,
        globalShortcut,
        setHudTemporarilyHidden: (hidden) => Boolean(hudOverlay?.setTemporarilyHidden?.(hidden)),
      })
    : null;
  const reportStore = installReportStore({
    app,
    ipcMain,
    dialog,
    shell,
    mainWindow,
    product,
    defaultDirOverride: storageBootstrap.defaultReportDir,
  });
  installStorageManager({
    app,
    ipcMain,
    dialog,
    shell,
    session,
    getMainWindow: () => mainWindow,
    isTrustedSender: isTrustedMainSender,
    bootstrap: storageBootstrap,
    product,
    reportStore,
    onBeforeQuitForMigration: () => {
      isQuitting = true;
      try { battleReports?.stop?.(); } catch {}
    },
  });

  if (process.platform === 'win32' && desktop.useTray) {
    try {
      const showWindow = () => {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      };
      const trayIcon = brandingAssetPath(app, product, 'tray.ico');
      tray = new Tray(fs.existsSync(trayIcon) ? trayIcon : brandingAssetPath(app, product, 'app.ico'));
      tray.setToolTip(product.windowTitle);
      tray.on('click', showWindow);
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: `打开${product.name}`, click: showWindow },
        { label: '退出', click: () => app.quit() },
      ]));
    } catch (err) {
      tray = null;
      logStartup('tray-init-failed', err);
    }
  }

  let readyShowTimer = null;
  const showMainWindow = () => {
    if (readyShowTimer) {
      clearTimeout(readyShowTimer);
      readyShowTimer = null;
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindowShown) {
      mainWindowShown = true;
      if (!mainWindow.isVisible()) mainWindow.show();
      battleReports?.start();
    } else if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  };

  let autoUpdateTimer;
  mainWindow.on('closed', () => {
    clearTimeout(autoUpdateTimer);
    hotUpdate.dispose();
    if (readyShowTimer) {
      clearTimeout(readyShowTimer);
      readyShowTimer = null;
    }
    try { tray?.destroy(); } catch {}
    hudOverlay?.dispose();
    lanSync?.dispose();
    covenantOcr?.dispose();
    battleReports?.dispose();
  });
  // 渲染进程异常自愈：开窗前/沙盒启动失败/60 秒内二次崩溃自动切换兼容模式重启，已处于兼容模式或重启后仍失败再弹窗提示
  let rendererRecoverCount = 0;
  let lastRendererCrashAt = 0;
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow.isDestroyed()) return;
    if (process.env.PRTS_DISABLE_AUTO_UPDATE !== '1') {
      autoUpdateTimer = setTimeout(() => void hotUpdate.checkForUpdates().catch(() => {}), 4000);
    }
    if (
      safeGpuMode
      && process.argv.includes('--prts-safe-gpu')
      && !process.argv.includes('--prts-normal-gpu')
      && !startupPrefs.preferSafeGpu
    ) {
      if (writeStartupPrefs(userDataDir, {
        preferSafeGpu: true,
        reason: 'auto-recovery',
        updatedAt: new Date().toISOString(),
      })) {
        startupPrefs.preferSafeGpu = true;
        logStartup('safe-gpu-pref-saved');
      }
    } else if (process.argv.includes('--prts-normal-gpu') && startupPrefs.preferSafeGpu) {
      if (writeStartupPrefs(userDataDir, {
        preferSafeGpu: false,
        reason: 'manual-normal-gpu',
        updatedAt: new Date().toISOString(),
      })) {
        startupPrefs.preferSafeGpu = false;
        logStartup('safe-gpu-pref-cleared');
      }
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logStartup('render-process-gone', {
      reason: details?.reason,
      exitCode: details?.exitCode,
      mainWindowShown,
      rendererRecoverCount,
    });
    if (isQuitting || mainWindow.isDestroyed() || details?.reason === 'clean-exit') return;
    if (hotUpdate.handleRendererGone()) return;
    const now = Date.now();
    if (now - lastRendererCrashAt > 60_000) rendererRecoverCount = 0;
    lastRendererCrashAt = now;
    if (shouldRelaunchForRenderProcessGone(details, {
      mainWindowShown,
      safeGpuMode,
      hasRelaunched: hasRelaunchedForGpu,
      isQuitting,
      rendererRecoverCount,
    })) {
      hasRelaunchedForGpu = true;
      isQuitting = true;
      logStartup('renderer-safe-relaunch', {
        reason: details?.reason,
        exitCode: details?.exitCode,
        mainWindowShown,
        rendererRecoverCount,
      });
      try { app.releaseSingleInstanceLock(); } catch {}
      app.relaunch({ args: buildSafeGpuRelaunchArgs(process.argv) });
      app.exit(0);
      return;
    }
    if (rendererRecoverCount < 1) {
      rendererRecoverCount += 1;
      setTimeout(() => {
        if (!mainWindow.isDestroyed()) mainWindow.loadURL('prts://app/');
      }, 250);
      return;
    }
    const reasonText = typeof details?.reason === 'string' && details.reason ? details.reason : 'unknown';
    const exitCodeText = Number.isFinite(details?.exitCode) ? `（退出码：${details.exitCode}）` : '';
    const modeText = safeGpuMode ? '当前已处于兼容渲染模式' : '当前处于标准渲染模式';
    const actionHint = safeGpuMode
      ? '您可以尝试重新加载界面，或重置窗口布局后重启终端。'
      : '您可以尝试重新加载界面，或以兼容模式重启终端（自动禁用硬件加速与渲染沙盒）。';
    showMainWindow();
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: `${product.name} · 界面异常恢复`,
      message: '终端渲染进程意外中断（《明日方舟》运行不受影响）。',
      detail: `中断原因：${reasonText}${exitCodeText} · ${modeText}。\n\n${actionHint}\n如问题反复出现，请查看 %APPDATA% 下应用目录中的 startup.log 并反馈给开发者。`,
      buttons: ['重新加载界面', safeGpuMode ? '重置布局并重启' : '以兼容模式重启', '关闭终端'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    }).then(({ response }) => {
      if (mainWindow.isDestroyed()) return;
      if (response === 0) {
        rendererRecoverCount = 0;
        mainWindow.loadURL('prts://app/');
      } else if (response === 1) {
        try { fs.rmSync(layoutFile, { force: true }); } catch {}
        isQuitting = true;
        try { app.releaseSingleInstanceLock(); } catch {}
        app.relaunch({ args: buildSafeGpuRelaunchArgs(process.argv) });
        app.exit(0);
      } else {
        app.quit();
      }
    }).catch(() => {});
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL) => {
    logStartup('did-fail-load', {
      errorCode,
      errorDescription: typeof errorDescription === 'string' ? errorDescription : '',
    });
    if (errorCode === -3) return;
    showMainWindow();
    if (!mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: `${product.name} · 界面加载失败`,
        message: '终端主界面未能正常加载。',
        detail: `错误代码：${errorCode}${errorDescription ? `（${errorDescription}）` : ''}\n\n您可以尝试重新加载界面，或重启应用后再试。`,
        buttons: ['重新加载界面', '关闭终端'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }).then(({ response }) => {
        if (mainWindow.isDestroyed()) return;
        if (response === 0) {
          mainWindow.loadURL('prts://app/');
        } else {
          app.quit();
        }
      }).catch(() => {});
    }
  });

  mainWindow.once('ready-to-show', () => {
    showMainWindow();
  });
  readyShowTimer = setTimeout(() => {
    readyShowTimer = null;
    if (!mainWindow || mainWindow.isDestroyed() || mainWindowShown) return;
    logStartup('ready-to-show-timeout');
    showMainWindow();
  }, 8000);
  mainWindow.loadURL('prts://app/');
});

app.on('window-all-closed', () => app.quit());
