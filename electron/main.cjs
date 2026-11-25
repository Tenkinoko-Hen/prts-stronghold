// 青逝痕 Tenkinoko 制作
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, net, protocol, screen, Tray, Menu } = require('electron');
const { installBattleReports } = require('./battle-reports.cjs');
const { installCovenantOcr } = require('./covenant-ocr.cjs');
const { installHudOverlay } = require('./hud-overlay.cjs');
const { installLanSync } = require('./lan-sync.cjs');
const { loadRuntimeProduct, brandingAssetPath } = require('./product-runtime.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'prts', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const product = loadRuntimeProduct(app);
const desktop = product.desktop;
let mainWindow;
let tray;

if (desktop.useIsolatedUserData) {
  const profile = path.join(app.getPath('appData'), desktop.appId);
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
}
if (process.platform === 'win32' && desktop.appId) {
  app.setAppUserModelId(desktop.appId);
}

app.whenReady().then(() => {
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('prts', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app' || request.method !== 'GET') return new Response('Forbidden', { status: 403 });
    let requestedPath;
    try { requestedPath = decodeURIComponent(url.pathname); }
    catch { return new Response('Bad request', { status: 400 }); }
    const file = path.resolve(root, `.${requestedPath === '/' ? '/index.html' : requestedPath}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  const layoutFile = path.join(app.getPath('userData'), 'window-layout.json');
  const readWindowLayout = () => {
    try {
      if (product.mode !== 'telemetry' || !fs.existsSync(layoutFile)) return { mode: 'wide' };
      const parsed = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
      const mode = parsed && parsed.mode === 'rail' ? 'rail' : 'wide';
      return {
        mode,
        wideBounds: parsed?.wideBounds,
        railBounds: parsed?.railBounds,
        wideAlwaysOnTop: typeof parsed?.wideAlwaysOnTop === 'boolean' ? parsed.wideAlwaysOnTop : Boolean(desktop.defaultAlwaysOnTop),
      };
    } catch {
      return { mode: 'wide' };
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
  const persistWindowLayout = () => {
    if (product.mode !== 'telemetry') return;
    try {
      fs.mkdirSync(path.dirname(layoutFile), { recursive: true });
      fs.writeFileSync(layoutFile, JSON.stringify(layoutState, null, 2), 'utf8');
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
      sandbox: true,
    },
  });
  const initialOnTop = layoutState.mode === 'rail'
    ? true
    : (typeof layoutState.wideAlwaysOnTop === 'boolean' ? layoutState.wideAlwaysOnTop : Boolean(desktop.defaultAlwaysOnTop));
  if (initialOnTop) mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== 'prts://app/' && !url.startsWith('prts://app/#')) event.preventDefault();
  });
  ipcMain.handle('set-always-on-top', (event, flag) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || typeof flag !== 'boolean') return false;
    mainWindow.setAlwaysOnTop(flag, 'screen-saver');
    if (layoutState.mode === 'wide') {
      layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
      persistWindowLayout();
    }
    return mainWindow.isAlwaysOnTop();
  });
  ipcMain.handle('window-layout-get', (event) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      return { mode: 'wide', alwaysOnTop: false };
    }
    return { mode: layoutState.mode, alwaysOnTop: mainWindow.isAlwaysOnTop() };
  });
  ipcMain.handle('window-layout-set', (event, nextMode) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      return { mode: layoutState.mode, alwaysOnTop: mainWindow.isAlwaysOnTop() };
    }
    const mode = nextMode === 'rail' ? 'rail' : 'wide';
    if (mode !== layoutState.mode) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      const current = mainWindow.getBounds();
      if (layoutState.mode === 'wide') {
        layoutState.wideBounds = current;
        layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
      } else {
        layoutState.railBounds = current;
      }
      layoutState.mode = mode;
      const display = screen.getDisplayMatching(current);
      const wa = display.workArea;
      if (mode === 'rail') {
        const defaultRailW = 460;
        const defaultRailH = Math.min(840, Math.max(desktop.minHeight, wa.height - 32));
        const target = layoutState.railBounds
          ? clampBounds(layoutState.railBounds, defaultRailW, defaultRailH)
          : { x: wa.x + wa.width - defaultRailW - 12, y: wa.y + Math.round((wa.height - defaultRailH) / 2), width: defaultRailW, height: defaultRailH };
        mainWindow.setBounds(target, true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
      } else {
        const target = clampBounds(layoutState.wideBounds, desktop.width, desktop.height);
        mainWindow.setBounds(target, true);
        mainWindow.setAlwaysOnTop(Boolean(layoutState.wideAlwaysOnTop), 'screen-saver');
      }
      persistWindowLayout();
    }
    return { mode: layoutState.mode, alwaysOnTop: mainWindow.isAlwaysOnTop() };
  });
  mainWindow.on('close', () => {
    if (product.mode !== 'telemetry' || mainWindow.isMinimized()) return;
    const current = mainWindow.getBounds();
    if (layoutState.mode === 'rail') layoutState.railBounds = current;
    else {
      layoutState.wideBounds = current;
      layoutState.wideAlwaysOnTop = mainWindow.isAlwaysOnTop();
    }
    persistWindowLayout();
  });

  const hudOverlay = process.platform === 'win32'
    ? installHudOverlay({ mainWindow, ipcMain, globalShortcut, product })
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
          hudOverlay?.updateBattleFeed(feed);
          lanSync?.updateBattleFeed(feed);
        },
      })
    : null;
  const covenantOcr = process.platform === 'win32' && product.mode === 'full'
    ? installCovenantOcr({ mainWindow, ipcMain, desktopCapturer, clipboard, globalShortcut })
    : null;

  if (process.platform === 'win32' && desktop.useTray) {
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
  }

  mainWindow.on('closed', () => {
    tray?.destroy();
    hudOverlay?.dispose();
    lanSync?.dispose();
    covenantOcr?.dispose();
    battleReports?.dispose();
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    battleReports?.start();
  });
  mainWindow.loadURL('prts://app/');
});

app.on('window-all-closed', () => app.quit());
