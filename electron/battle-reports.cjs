const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { windowsWorkerLaunch } = require('./windows-runtime.cjs');
const { NPCAP_DOWNLOAD_PAGE, hasNpcap, runNpcapInstaller } = require('./npcap-installer.cjs');

const WORKER_STATUSES = new Set(['waiting', 'connecting', 'listening', 'permission', 'unavailable', 'incompatible']);
const MAX_REPORT = 8 * 1024 * 1024;
const DIAGNOSTICS = /^PRTS_REPORT_DIAG(?: [0-9]{1,12}){8}$/;
const DETAILS = /^PRTS_REPORT_DETAIL(?: [0-9]{1,12}){10}$/;
const BOSS_DETAILS = /^PRTS_REPORT_BOSS(?: [0-9]{1,12}){6,7}$/;
const UNKNOWN_DETAILS = /^PRTS_REPORT_UNKNOWN(?: [01] [0-9]{1,5} [0-9]{1,12}){0,12}$/;

function bossSummary(rounds) {
  return [14, 15].map(round => {
    const row = rounds[round];
    const damage = [row?.boss_damage, row?.boss_percent, row?.boss_uplink].some(table => Object.keys(table ?? {}).length > 0)
      || (Array.isArray(row?.boss_official) && row.boss_official.length > 0);
    return `R${round} ${damage ? '已入表' : row?.boss_ended === true ? '已结束，伤害未入表'
      : row?.phase === 'boss' ? '见到阶段，伤害未入表' : '无 Boss 记录'}`;
  }).join(' · ');
}

function latestSelfFinish(rounds) {
  const entry = Object.entries(rounds ?? {}).reverse().find(([round, row]) =>
    /^(?:[1-9]|1[0-5])$/.test(round) && Number.isSafeInteger(row?.self_leaks) && row.self_leaks >= 0);
  return entry ? { round: entry[0], row: entry[1], summary: `R${entry[0]} / 漏怪 ${entry[1].self_leaks}` } : undefined;
}

function parseUnknownDetails(line) {
  if (!UNKNOWN_DETAILS.test(line)) return undefined;
  const values = line.split(' ').slice(1).map(Number);
  return Array.from({ length: values.length / 3 }, (_, index) => {
    const [direction, id, count] = values.slice(index * 3, index * 3 + 3);
    return { direction: direction === 0 ? 'down' : 'up', id, count };
  });
}

function diagnosticsDialogTitle(product) {
  return product?.reportBrand?.diagnosticsTitle || 'PRTS · 战报诊断';
}

function installBattleReports({ app, mainWindow, ipcMain, product }) {
  let state = {
    status: 'starting',
    report: null,
    reportRun: 0,
    npcapInstalled: hasNpcap(),
    npcapInstall: { status: 'idle', message: '' },
  };
  let run = 0;
  let worker;
  let startupTimer;
  let diagnostics;
  let details;
  let bossDetails, unknownDetails, lastBossSummary;
  let backend, traffic;
  let installingNpcap = false;
  let disposed = false;

  function publish(patch) {
    state = { ...state, ...patch };
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('battle-reports-state', state);
    return state;
  }

  function hotSwitchToNpcap(message) {
    const installed = hasNpcap();
    if (!installed) return publish({ npcapInstalled: false });
    const wasPaused = state.status === 'paused';
    stop();
    publish({
      npcapInstalled: true,
      npcapInstall: { status: 'installed', message: message || 'Npcap 已安装，已自动切换至驱动采集通道。' },
    });
    if (!wasPaused) start();
    return state;
  }

  const onWindowFocus = () => {
    if (!disposed && !installingNpcap && !state.npcapInstalled && hasNpcap()) {
      hotSwitchToNpcap('检测到 Npcap 已就绪，已自动切换至驱动采集通道。');
    }
  };
  mainWindow.on('focus', onWindowFocus);

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
    const { command, args, cwd } = windowsWorkerLaunch(app, product);
    const child = spawn(command, [...args, '--battle-report'], {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    worker = child;
    diagnostics = undefined;
    details = undefined;
    bossDetails = lastBossSummary = undefined;
    unknownDetails = undefined;
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
      else if (BOSS_DETAILS.test(line)) bossDetails = line.split(' ').slice(1).map(Number);
      else if (UNKNOWN_DETAILS.test(line)) unknownDetails = parseUnknownDetails(line);
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
        } else if (message?.kind === 'report'
          && (message.report === null || (message.report?.rounds && message.report?.capture))) {
          if (message.report) lastBossSummary = bossSummary(message.report.rounds);
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
      detail = `${summary}\n\n游戏数据段：下行 ${down} / 上行 ${up}\n协议帧：${frames} · 卫戍事件：${events} · 已记录回合数：${rounds}\n`
        + `解析错误：${parseErrors} · 重组错误：${tcpErrors} · 待补齐数据流：${gaps}`;
      if (details) {
        const [full, scene, plan, solo, help, rejected, phases, waves, previews, errors] = details;
        detail += `\n\n已解析：全量场景 ${full} · 阶段更新 ${scene} · 上行预告 ${plan} · 自路结算 ${solo} · 协防结算 ${help}`
          + `\n场景候选未能对齐 ${rejected} · 处理异常 ${errors}`
          + `\n当前战报：已知阶段 ${phases} · 战斗编排 ${waves} 批 · 出怪预告 ${previews} 条`;
      }
    }
    const snapshot = state.report;
    const verifiedRound = snapshot?.capture?.round;
    const latestFinish = latestSelfFinish(snapshot?.rounds);
    const lastLocal = latestFinish?.row;
    detail += `\n最近确认回合：${Number.isInteger(verifiedRound) && verifiedRound >= 1 && verifiedRound <= 15 ? `R${verifiedRound}` : '未确认'}`
      + ` · 最近入表本路结算：${latestFinish?.summary ?? '未记录'}`;
    if (lastLocal?.self_leaks > 0) {
      const entries = Array.isArray(lastLocal.self_leak_enemies) ? lastLocal.self_leak_enemies : [];
      const identified = entries.reduce((sum, item) =>
        sum + (Number.isSafeInteger(item?.count) && item.count > 0 ? item.count : 0), 0);
      detail += ` · 已识别怪种 ${Math.min(identified, lastLocal.self_leaks)}/${lastLocal.self_leaks} 只`;
    }
    if (snapshot) {
      const self = snapshot.capture?.self;
      const named = Object.values(snapshot.players ?? {}).filter(name => typeof name === 'string' && name.trim()).length;
      const latestHelp = Object.entries(snapshot.rounds ?? {}).reverse().find(([round, row]) =>
        /^(?:[1-9]|1[0-5])$/.test(round) && ['reported', 'observed'].includes(row?.assists_status));
      detail += `\n本路席位：${Number.isInteger(self) && self >= 1 && self <= 4 ? `${self} 号${snapshot.capture.self_basis === 'help' ? '（结算关联）' : ''}` : '未确认'}`
        + ` · 已记录玩家 ID：${named} 个`;
      if (latestHelp) {
        const row = latestHelp[1];
        const assigned = (Array.isArray(row.assist_pairs) ? row.assist_pairs : []).reduce((sum, item) =>
          sum + (Number.isSafeInteger(item?.count) && item.count > 0 ? item.count : 0), 0);
        const unmatched = Number.isSafeInteger(row.unattributed_assists) && row.unattributed_assists > 0 ? row.unattributed_assists : 0;
        detail += `\n最近协防记录：R${latestHelp[0]} · 双方已识别 ${assigned} 只 · 未能确认双方 ${unmatched} 只`;
      }
    }
    if (backend) detail += `\n采集通道：${{ winsock: 'Windows 内置', npcap: 'Npcap', mixed: 'Npcap / Windows 内置' }[backend]}`;
    if (traffic) detail += `\n游戏连接字节：下行 ${traffic[0]} / 上行 ${traffic[1]}`;
    if (details && !details[0] && !details[1] && (details[3] || details[4])) {
      detail += '\n目前只取得客户端上行结算，尚未收到服务端下行场景。';
      if (backend === 'winsock') {
        detail += '\n提示：当前使用 Windows 内置通道，系统防火墙可能拦截入站游戏包导致缺失场景、队友昵称与 Boss 结算；安装 Npcap 后以管理员重启本应用将自动切换驱动通道。';
      }
    }
    if (details && !details[0] && !details[1] && diagnostics?.[0] > 0 && traffic?.[0] === diagnostics[0])
      detail += `\n本次采集命中的 ${diagnostics[0]} 个下行数据段各只有 1 字节。已记录的本路结算仍可查阅或导出。`;
    if (bossDetails) {
      const [stage, terminal, runtime, rank, ratio, unassigned, inferred = 0] = bossDetails;
      detail += `\n\nBoss 采集累计：开战场景 ${stage} · R14/R15 结算或结束场景 ${terminal} · 非零伤害快照 ${runtime}`
        + `\n榜单候选 ${rank} · 达标信号 ${ratio} · 推定回合关联 ${inferred} · 未能归入回合 ${unassigned}`;
    }
    if (unknownDetails) {
      const entries = unknownDetails.map(({ direction, id, count }) =>
        `${direction === 'down' ? '下行' : '上行'} ${id}(${count})`);
      detail += `\n未识别消息 ID（按次数最多 12 项）：${entries.length ? entries.join('、') : '无'}`;
    }
    if (lastBossSummary) detail += `\n${snapshot ? '当前战报' : '最近一份本地战报'}：${lastBossSummary}`;
    void dialog.showMessageBox(mainWindow, {
      title: diagnosticsDialogTitle(product), message: '战报采集诊断', detail,
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
    'battle-reports-get': () => {
      if (!state.npcapInstalled && hasNpcap()) {
        return hotSwitchToNpcap('检测到 Npcap 已就绪，已自动切换至驱动采集通道。');
      }
      return state;
    },
    'battle-reports-diagnostics': showDiagnostics,
    'battle-reports-enable': (enabled) => {
      if (typeof enabled !== 'boolean') throw new Error('Invalid capture request');
      if (enabled && worker && ['permission', 'unavailable', 'incompatible'].includes(state.status)) stop();
      if (enabled) return start();
      stop();
      return publish({ status: 'paused' });
    },
    'battle-reports-install-npcap': async () => {
      if (installingNpcap) return state;
      if (hasNpcap()) return hotSwitchToNpcap('Npcap 已安装，已切换至驱动采集通道。');
      installingNpcap = true;
      try {
        const result = await runNpcapInstaller({
          onProgress: (installStatus, message) => {
            publish({ npcapInstall: { status: installStatus, message } });
          },
        });
        if (result.installed) {
          return hotSwitchToNpcap(
            `Npcap ${result.version ? `v${result.version} ` : ''}安装完成，已自动切换至驱动采集通道（无需重启软件）。`,
          );
        }
        return publish({
          npcapInstalled: false,
          npcapInstall: { status: 'error', message: '安装向导已关闭但未检测到 Npcap，请确认完成安装或重试。' },
        });
      } catch (err) {
        return publish({
          npcapInstalled: hasNpcap(),
          npcapInstall: {
            status: 'error',
            message: err instanceof Error ? err.message : '拉起 Npcap 官方安装失败，请点击打开官网手动安装。',
          },
        });
      } finally {
        installingNpcap = false;
      }
    },
    'battle-reports-recheck-npcap': () => {
      if (hasNpcap()) return hotSwitchToNpcap('检测到 Npcap 已安装，已自动切换至驱动采集通道。');
      return publish({
        npcapInstalled: false,
        npcapInstall: { status: 'idle', message: '尚未检测到 Npcap（wpcap.dll）。' },
      });
    },
    'battle-reports-open-npcap': async () => {
      const { shell } = require('electron');
      await shell.openExternal(NPCAP_DOWNLOAD_PAGE);
      return true;
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
      if (!mainWindow.isDestroyed()) mainWindow.removeListener('focus', onWindowFocus);
      stop();
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    },
  };
}

module.exports = { installBattleReports, diagnosticsDialogTitle, latestSelfFinish, parseUnknownDetails };
