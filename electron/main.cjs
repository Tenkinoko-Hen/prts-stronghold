const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, net, protocol, Tray, Menu } = require('electron');
const { installBattleReports } = require('./battle-reports.cjs');
const { installCovenantOcr } = require('./covenant-ocr.cjs');
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
  mainWindow = new BrowserWindow({
    title: product.windowTitle,
    width: desktop.width,
    height: desktop.height,
    minWidth: desktop.minWidth,
    minHeight: desktop.minHeight,
    center: true,
    fullscreen: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0B0C0E',
    icon: brandingAssetPath(app, product, 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--prts-mode=${product.mode}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (desktop.defaultAlwaysOnTop) mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== 'prts://app/' && !url.startsWith('prts://app/#')) event.preventDefault();
  });
  ipcMain.handle('set-always-on-top', (event, flag) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || typeof flag !== 'boolean') return false;
    mainWindow.setAlwaysOnTop(flag, 'screen-saver');
    return mainWindow.isAlwaysOnTop();
  });

  const battleReports = process.platform === 'win32'
    ? installBattleReports({ app, mainWindow, ipcMain, product })
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
