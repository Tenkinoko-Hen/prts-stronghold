const { app, BrowserWindow, ipcMain, net, protocol, desktopCapturer, clipboard, globalShortcut } = require('electron');
const { installCovenantOcr } = require('./covenant-ocr.cjs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'prts', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
let mainWindow;

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
    title: '卫戍协议战术终端 · PRTS Stronghold',
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    center: true, fullscreen: false, show: false, autoHideMenuBar: true,
    backgroundColor: '#0B0C0E',
    icon: path.join(__dirname, 'branding', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
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
  const scanner = installCovenantOcr({ app, mainWindow, ipcMain, desktopCapturer, clipboard, globalShortcut });
  mainWindow.on('closed', () => scanner.dispose());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL('prts://app/');
});
app.on('window-all-closed', () => app.quit());
