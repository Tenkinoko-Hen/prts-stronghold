const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SHORTCUT = 'CommandOrControl+Shift+F8';
const EMPTY = { complete: false, bannedCovenants: [], seenCovenants: [], missingCovenants: [] };

function installCovenantOcr({ app, mainWindow, ipcMain, desktopCapturer, clipboard, globalShortcut }) {
  let state = { ...EMPTY, id: '', status: 'idle', message: '', sourceId: '', sourceName: '', shortcutAvailable: false };
  let availableSources = new Map();
  let worker;
  let pending;
  let disposed = false;

  function publish(patch) {
    state = { ...state, ...patch };
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('covenant-ocr-state', state);
    return state;
  }

  function stopWorker() {
    const previous = worker;
    worker = undefined;
    previous?.kill();
    if (pending) {
      const job = pending;
      pending = undefined;
      clearTimeout(job.timer);
      job.reject(new Error('识别已停止。'));
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    const directory = app.isPackaged
      ? path.join(process.resourcesPath, 'ocr')
      : path.join(app.getAppPath(), 'work', 'windows-ocr', 'runtime', 'PRTS-OCR');
    const executable = path.join(directory, 'PRTS-OCR.exe');
    if (!existsSync(executable)) throw new Error('缺少离线识别组件，请使用完整的 Windows OCR 版。');
    const child = spawn(executable, [], { cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    worker = child;
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.resume(); // 不记录截图、OCR 文本或用户窗口信息。
    const failed = () => {
      if (worker !== child) return;
      stopWorker();
    };
    child.on('error', failed);
    child.on('exit', failed);
    child.stdin.on('error', failed);
    child.stdout.on('data', (chunk) => {
      if (worker !== child) return;
      output += chunk;
      if (output.length > 1024 * 1024) return failed();
      let end;
      while ((end = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, end);
        output = output.slice(end + 1);
        let result;
        try { result = JSON.parse(line); } catch { continue; }
        if (!pending || result.id !== pending.id) continue;
        const job = pending;
        pending = undefined;
        clearTimeout(job.timer);
        if (result.error) job.reject(new Error(result.error));
        else if (!Array.isArray(result.seenCovenants) || !Array.isArray(result.bannedCovenants)
          || !Array.isArray(result.missingCovenants) || typeof result.complete !== 'boolean') {
          job.reject(new Error('识别结果无效，请重试。'));
        } else job.resolve(result);
      }
    });
    return child;
  }

  function recognize(image, id) {
    const child = ensureWorker();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stopWorker(), 45_000);
      pending = { id, resolve, reject, timer };
      child.stdin.write(JSON.stringify({ id, image: image.toPNG().toString('base64') }) + '\n');
    });
  }

  async function sources() {
    const found = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 } });
    const ownHandle = mainWindow.getMediaSourceId().split(':')[1];
    const visible = found.filter(source => !(source.id.startsWith('window:') && source.id.split(':')[1] === ownHandle));
    availableSources = new Map(visible.map(source => [source.id, source.name]));
    return visible.map(source => ({ id: source.id,
      name: source.id.startsWith('screen:') ? `整个屏幕 · ${source.name}` : source.name,
      thumbnail: source.thumbnail.toDataURL() }));
  }

  function cancel(reset = false) {
    publish({ ...EMPTY, id: randomUUID(), status: reset ? 'idle' : 'cancelled',
      message: reset ? '' : '已取消识别，当前筛选条件保持不变。', elapsedMs: undefined });
    stopWorker();
    return state;
  }

  async function start(mode) {
    if (disposed || state.status === 'scanning') return state;
    if (!['window', 'clipboard'].includes(mode)) throw new Error('Invalid capture mode');
    const id = randomUUID();
    const selectedId = state.sourceId;
    const started = Date.now();
    publish({ ...EMPTY, id, status: 'scanning', elapsedMs: undefined,
      message: mode === 'clipboard' ? '正在读取剪贴板截图…' : '正在截取所选窗口…' });
    try {
      let picture;
      if (mode === 'clipboard') {
        picture = clipboard.readImage();
        if (picture.isEmpty()) throw new Error('剪贴板里没有图片。请先截图，再点击“粘贴截图识别”。');
      } else {
        if (!selectedId) throw new Error('请先选择游戏窗口或游戏所在屏幕。');
        const wasVisible = mainWindow.isVisible() && !mainWindow.isMinimized();
        mainWindow.hide();
        try {
          await new Promise(resolve => setTimeout(resolve, 300));
          if (state.id !== id || disposed) return state;
          const captured = await desktopCapturer.getSources({
            types: [selectedId.startsWith('screen:') ? 'screen' : 'window'],
            thumbnailSize: { width: 2560, height: 1600 },
          });
          picture = captured.find(source => source.id === selectedId)?.thumbnail;
        } finally {
          if (wasVisible && !disposed && !mainWindow.isDestroyed()) mainWindow.show();
        }
        if (!picture || picture.isEmpty()) throw new Error('未取得窗口画面。请恢复游戏窗口后重试，或粘贴截图识别。');
      }
      if (state.id !== id || disposed) return state;
      const size = picture.getSize();
      if (Math.min(size.width, size.height) < 100) throw new Error('截图过小，请截取完整盟约总览。');
      if (Math.max(size.width, size.height) > 2560) {
        picture = picture.resize(size.width >= size.height ? { width: 2560 } : { height: 2560 });
      }
      publish({ message: '正在本机识别盟约名称与徽章…' });
      const result = await recognize(picture, id);
      if (state.id !== id || disposed) return state;
      publish({ ...result, elapsedMs: Date.now() - started, status: result.complete ? 'ready' : 'incomplete',
        message: result.complete ? `已读全 26 项，${result.bannedCovenants.length} 个盟约受限。`
          : `已确认 ${result.seenCovenants.length}/26 项。请露出完整总览后重试，当前筛选未覆盖。` });
    } catch (error) {
      if (state.id !== id || disposed) return state;
      publish({ status: 'error', message: error.message || '识别失败，请重试。' });
    }
    if (!disposed && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.webContents.send('covenant-ocr-open');
    }
    return state;
  }

  const handlers = {
    sources,
    state: () => state,
    select: (id) => {
      if (state.status === 'scanning') return state;
      if (typeof id !== 'string' || !availableSources.has(id)) throw new Error('请刷新后重新选择窗口。');
      return publish({ sourceId: id, sourceName: availableSources.get(id) });
    },
    start,
    cancel: () => cancel(),
    reset: () => cancel(true),
  };
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`covenant-ocr-${name}`, (event, ...args) => {
      if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
        || !event.senderFrame.url.startsWith('prts://app/')) throw new Error('Forbidden');
      return handler(...args);
    });
  }
  state.shortcutAvailable = globalShortcut.register(SHORTCUT, () => { void start('window'); });
  return {
    dispose() {
      disposed = true;
      stopWorker();
      globalShortcut.unregister(SHORTCUT);
      for (const name of Object.keys(handlers)) ipcMain.removeHandler(`covenant-ocr-${name}`);
    },
  };
}

module.exports = { installCovenantOcr };
