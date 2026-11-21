const { spawn } = require('node:child_process');
const { dirname } = require('node:path');
const { createInterface } = require('node:readline');
const { windowsWorkerPath } = require('./windows-runtime.cjs');

const WORKER_STATUSES = new Set(['waiting', 'connecting', 'listening', 'permission', 'unavailable', 'incompatible']);
const MAX_REPORT = 8 * 1024 * 1024;
const DIAGNOSTICS = /^PRTS_REPORT_DIAG(?: [0-9]{1,12}){8}$/;
const DETAILS = /^PRTS_REPORT_DETAIL(?: [0-9]{1,12}){10}$/;

function installBattleReports({ app, mainWindow, ipcMain }) {
  let state = { status: 'starting', report: null, reportRun: 0 };
  let run = 0;
  let worker;
  let startupTimer;
  let diagnostics;
  let details;
  let backend, traffic;
  let disposed = false;

  function publish(patch) {
    state = { ...state, ...patch };
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('battle-reports-state', state);
    return state;
  }

  function stop() {
    const previous = worker;
    worker = undefined;
    clearTimeout(startupTimer);
    if (previous) {
      previous.stdin.destroy();
      previous.kill();
    }
  }

  function start() {
    if (disposed || worker) return state;
    const executable = windowsWorkerPath(app);
    const child = spawn(executable, ['--battle-report'], {
      cwd: dirname(executable), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    worker = child;
    diagnostics = undefined;
    details = undefined;
    backend = traffic = undefined;
    const childRun = ++run;
    let pending = '';
    const fail = () => {
      if (worker !== child) return;
      stop();
      if (!['permission', 'unavailable', 'incompatible'].includes(state.status)) publish({ status: 'failed' });
    };
    child.on('error', fail);
    child.on('close', fail);
    child.stdin.on('error', fail);
    child.stderr.on('error', fail);
    createInterface({ input: child.stderr }).on('line', line => {
      if (worker !== child) return;
      if (DIAGNOSTICS.test(line)) {
        diagnostics = line.split(' ').slice(1).map(Number);
        details = traffic = undefined;
      } else if (DETAILS.test(line)) details = line.split(' ').slice(1).map(Number);
      else if (/^PRTS_REPORT_BYTES(?: [0-9]{1,16}){2}$/.test(line)) traffic = line.split(' ').slice(1).map(Number);
      else if (/^PRTS_CAPTURE_SOURCE (winsock|npcap|mixed)$/.test(line)) backend = line.split(' ')[1];
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (worker !== child) return;
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        if (newline > MAX_REPORT) return fail();
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message?.kind === 'status' && WORKER_STATUSES.has(message.status)) {
          clearTimeout(startupTimer);
          publish({ status: message.status });
        } else if (message?.kind === 'report' && message.report?.rounds && message.report?.capture) {
          publish({ report: message.report, reportRun: childRun });
        }
      }
      if (pending.length > MAX_REPORT) fail();
    });
    startupTimer = setTimeout(fail, 12_000);
    startupTimer.unref();
    return publish({ status: 'starting', report: null, reportRun: childRun });
  }

  function showDiagnostics() {
    const { clipboard, dialog } = require('electron');
    let detail = '尚未收到采集计数，请查看战报页的采集状态。';
    if (diagnostics) {
      const [down, up, frames, events, rounds, parseErrors, tcpErrors, gaps] = diagnostics;
      const summary = rounds ? (details && !details[6] ? '已记录回合，尚未取得可确认的阶段。' : '已生成回合数据。')
        : events ? '已识别卫戍事件，暂未生成回合。'
        : down || up ? '已收到游戏数据，暂未识别出卫戍事件。' : '尚未收到匹配游戏连接的数据。';
      detail = `${summary}\n\n游戏数据段：下行 ${down} / 上行 ${up}\n协议帧：${frames} · 卫戍事件：${events} · 回合：${rounds}\n`
        + `解析错误：${parseErrors} · 重组错误：${tcpErrors} · 待补齐数据流：${gaps}`;
      if (details) {
        const [full, scene, plan, solo, help, rejected, phases, waves, previews, errors] = details;
        detail += `\n\n已解析：全量场景 ${full} · 阶段更新 ${scene} · 上行预告 ${plan} · 自路结算 ${solo} · 协防结算 ${help}`
          + `\n场景候选未能对齐 ${rejected} · 处理异常 ${errors}`
          + `\n当前战报：已知阶段 ${phases} · 战斗编排 ${waves} 批 · 出怪预告 ${previews} 条`;
      }
    }
    if (backend) detail += `\n采集通道：${{ winsock: 'Windows 内置', npcap: 'Npcap', mixed: 'Npcap / Windows 内置' }[backend]}`;
    if (traffic) detail += `\n游戏连接字节：下行 ${traffic[0]} / 上行 ${traffic[1]}`;
    if (details && !details[0] && !details[1] && (details[3] || details[4]))
      detail += '\n目前只取得结算，尚未收到可用的服务端场景。';
    if (details && !details[0] && !details[1] && diagnostics?.[0] > 0 && traffic?.[0] === diagnostics[0])
      detail += `\n本次采集命中的 ${diagnostics[0]} 个下行数据段各只有 1 字节。可继续查看本路结算，或导入本局已有的完整 JSON 战报。`;
    void dialog.showMessageBox(mainWindow, {
      title: 'PRTS · 战报诊断', message: '战报采集诊断', detail,
      buttons: ['复制诊断', '关闭'], defaultId: 1, cancelId: 1, noLink: true,
    }).then(({ response }) => {
      if (response === 0) clipboard.writeText(detail);
    }).catch(() => {});
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F9' && input.control && input.shift && !input.alt
      && !input.isAutoRepeat && mainWindow.webContents.getURL().split('#', 1)[0] === 'prts://app/') {
      event.preventDefault();
      showDiagnostics();
    }
  });
  const handlers = {
    'battle-reports-get': () => state,
    'battle-reports-diagnostics': showDiagnostics,
    'battle-reports-enable': (enabled) => {
      if (typeof enabled !== 'boolean') throw new Error('Invalid capture request');
      if (enabled && worker && ['permission', 'unavailable', 'incompatible'].includes(state.status)) stop();
      if (enabled) return start();
      stop();
      return publish({ status: 'paused' });
    },
  };
  for (const [channel, handle] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, value) => {
      if (mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || !event.senderFrame.url.startsWith('prts://app/')) throw new Error('Forbidden');
      return handle(value);
    });
  }
  return {
    start,
    dispose() {
      disposed = true;
      stop();
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    },
  };
}

module.exports = { installBattleReports };
