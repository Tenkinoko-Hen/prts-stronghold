// 青逝痕 Tenkinoko 制作
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { windowsWorkerLaunch } = require('./windows-runtime.cjs');
const { NPCAP_DOWNLOAD_PAGE, hasNpcap, isWindows10OrOlder, runNpcapInstaller } = require('./npcap-installer.cjs');

const WORKER_STATUSES = new Set(['waiting', 'connecting', 'listening', 'permission', 'unavailable', 'incompatible']);
const CLIENT_SOURCES = new Set(['none', 'pc', 'mumu', 'ldplayer']);
const CLIENT_SOURCE_LABELS = { mumu: 'MuMu 模拟器', ldplayer: '雷电模拟器', pc: 'PC 原生端', none: '未检测到' };
const MAX_REPORT = 8 * 1024 * 1024;
const DIAGNOSTICS = /^PRTS_REPORT_DIAG(?: [0-9]{1,12}){8}$/;
const DETAILS = /^PRTS_REPORT_DETAIL(?: [0-9]{1,12}){10}$/;
const BOSS_DETAILS = /^PRTS_REPORT_BOSS(?: [0-9]{1,12}){6,7}$/;
const UNKNOWN_DETAILS = /^PRTS_REPORT_UNKNOWN(?: [01] [0-9]{1,5} [0-9]{1,12}){0,12}$/;
const BOND_DETAILS = /^PRTS_REPORT_BONDS(?: [1-4]:[0-9a-fA-F]{14}(?:,[0-9a-fA-F]{14}){0,25}){1,4}$/;

function parseSourceMessage(message, screenApi) {
  if (!message || message.kind !== 'source' || !CLIENT_SOURCES.has(message.client)) {
    return null;
  }
  const clientSource = message.client;
  if ((clientSource !== 'mumu' && clientSource !== 'ldplayer') || !message.mumuWindow || typeof message.mumuWindow !== 'object') {
    return { clientSource, mumuWindow: null };
  }
  const raw = message.mumuWindow;
  if (
    !Number.isFinite(raw.x)
    || !Number.isFinite(raw.y)
    || !Number.isFinite(raw.width)
    || !Number.isFinite(raw.height)
    || raw.width <= 0
    || raw.height <= 0
  ) {
    return { clientSource, mumuWindow: null };
  }
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 120) : '';
  let rect = {
    x: Math.round(raw.x),
    y: Math.round(raw.y),
    width: Math.round(raw.width),
    height: Math.round(raw.height),
  };
  let dipScreen = screenApi;
  if (dipScreen === undefined) {
    try {
      dipScreen = require('electron')?.screen;
    } catch {
      dipScreen = undefined;
    }
  }
  if (typeof dipScreen?.screenToDipRect === 'function') {
    try {
      const converted = dipScreen.screenToDipRect(null, rect);
      if (
        converted
        && Number.isFinite(converted.x)
        && Number.isFinite(converted.y)
        && Number.isFinite(converted.width)
        && Number.isFinite(converted.height)
        && converted.width > 0
        && converted.height > 0
      ) {
        rect = {
          x: Math.round(converted.x),
          y: Math.round(converted.y),
          width: Math.round(converted.width),
          height: Math.round(converted.height),
        };
      }
    } catch {
      // Fallback to raw pixel coordinates outside full Electron runtime.
    }
  }
  return {
    clientSource,
    mumuWindow: title ? { title, ...rect } : rect,
  };
}

function bossSummary(report) {
  const rounds = report?.rounds ?? {};
  const configured = Array.isArray(report?.boss_rounds) && report.boss_rounds.length
    ? report.boss_rounds
    : Object.entries(rounds)
        .filter(([r, row]) => Number(r) >= 14 || row?.phase === 'boss' || row?.boss_ended === true
          || [row?.boss_damage, row?.boss_percent, row?.boss_uplink].some(table => Object.keys(table ?? {}).length > 0)
          || (Array.isArray(row?.boss_official) && row.boss_official.length > 0))
        .map(([r]) => Number(r));
  const list = [...new Set(configured.length ? configured : [14, 15])].sort((a, b) => a - b);
  return list.map(round => {
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

function parseBondDetails(line) {
  if (!BOND_DETAILS.test(line)) return undefined;
  return line.split(' ').slice(1).map(token => {
    const [seatStr, hexList] = token.split(':');
    return {
      seat: Number(seatStr),
      bonds: hexList.split(',').map(h => h.toLowerCase()),
    };
  });
}

function diagnosticsDialogTitle(product) {
  return product?.reportBrand?.diagnosticsTitle || 'PRTS · 战报诊断';
}

function installBattleReports({
  app,
  mainWindow,
  ipcMain,
  product,
  onPublish,
  spawnFn,
  screenApi,
  hasNpcapFn = hasNpcap,
  runNpcapInstallerFn = runNpcapInstaller,
  startupTimeoutMs = 25_000,
  restartBaseDelayMs = 1_500,
  maxAutoRestarts = 3,
  healthyResetMs = 20_000,
}) {
  const spawnWorker = spawnFn || spawn;
  const checkNpcap = typeof hasNpcapFn === 'function' ? hasNpcapFn : hasNpcap;
  const launchNpcapInstaller = typeof runNpcapInstallerFn === 'function' ? runNpcapInstallerFn : runNpcapInstaller;
  let state = {
    status: 'starting',
    report: null,
    reportRun: 0,
    clientSource: 'none',
    mumuWindow: null,
    npcapInstalled: checkNpcap(),
    npcapInstall: { status: 'idle', message: '' },
    failureReason: '',
    autoRestartCount: 0,
    restarting: false,
  };
  let run = 0;
  let worker;
  let startupTimer;
  let restartTimer;
  let healthyTimer;
  let autoRestartCount = 0;
  let lastStderrErrors = [];
  let diagnostics;
  let details;
  let bossDetails, unknownDetails, bondDetails, lastBossSummary;
  let backend, traffic;
  let installingNpcap = false;
  let disposed = false;

  function publish(patch) {
    state = { ...state, ...patch };
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('battle-reports-state', state);
    if (typeof onPublish === 'function') {
      try { onPublish(state); } catch {}
    }
    return state;
  }

  function hotSwitchToNpcap(message, shouldResume = state.status !== 'paused') {
    const installed = checkNpcap();
    if (!installed) return publish({ npcapInstalled: false });
    stop();
    publish({
      npcapInstalled: true,
      npcapInstall: { status: 'installed', message: message || 'Npcap 已安装，已自动切换至驱动采集通道。' },
    });
    if (shouldResume) start(false);
    return state;
  }

  const onWindowFocus = () => {
    if (!disposed && !installingNpcap && !state.npcapInstalled && checkNpcap()) {
      hotSwitchToNpcap('检测到 Npcap 已就绪，已自动切换至驱动采集通道。');
    }
  };
  mainWindow.on('focus', onWindowFocus);

  function stop() {
    const previous = worker;
    worker = undefined;
    clearTimeout(startupTimer);
    clearTimeout(restartTimer);
    clearTimeout(healthyTimer);
    if (previous) {
      try { previous.stdin.destroy(); } catch {}
      try { previous.kill(); } catch {}
    }
    if (state.clientSource !== 'none' || state.mumuWindow !== null) {
      if (disposed) {
        state = { ...state, clientSource: 'none', mumuWindow: null, restarting: false };
      } else {
        publish({ clientSource: 'none', mumuWindow: null, restarting: false });
      }
    }
  }

  function stopAndWait(timeoutMs = 1500) {
    const previous = worker;
    if (!previous || typeof previous.once !== 'function') {
      stop();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      let timer;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        previous.removeListener?.('close', done);
        previous.removeListener?.('exit', done);
        resolve();
      };
      previous.once('close', done);
      previous.once('exit', done);
      timer = setTimeout(done, Math.max(0, timeoutMs));
      if (typeof timer.unref === 'function') timer.unref();
      stop();
    });
  }

  function buildFailureAdvice(errCode, timedOut) {
    if (errCode === 'ENOENT') {
      return '未找到战报采集进程（PRTS-Worker.exe），可能被 Windows Defender / 360 / 火绒误隔离。请将程序目录加入信任区后点击「立即重启采集」；离线攻略功能不受影响。';
    }
    if (errCode === 'EACCES' || errCode === 'EPERM') {
      return '战报采集进程启动被系统权限拦截，请右键「以管理员身份运行」本应用，或检查安全软件拦截记录。';
    }
    if (timedOut) {
      return '系统高负载下采集进程响应超时，已尝试自动恢复仍未就绪；游戏运行不受影响，可点击「立即重启采集」重试。';
    }
    const tail = lastStderrErrors.at(-1);
    return tail
      ? `采集进程异常退出（${tail}）。点击「立即重启采集」可一键恢复，离线攻略仍可正常使用。`
      : '本地战报采集进程意外中断（游戏本体不受影响），点击「立即重启采集」即可恢复。';
  }

  function start(isAutoRetry = false) {
    if (disposed || worker) return state;
    clearTimeout(restartTimer);
    if (!isAutoRetry) {
      autoRestartCount = 0;
    }
    const { command, args, cwd } = windowsWorkerLaunch(app, product);
    let child;
    try {
      child = spawnWorker(command, [...args, '--battle-report'], {
        cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (spawnErr) {
      const code = spawnErr && typeof spawnErr === 'object' ? spawnErr.code : '';
      return publish({
        status: 'failed',
        restarting: false,
        autoRestartCount,
        failureReason: buildFailureAdvice(code, false),
      });
    }
    worker = child;
    diagnostics = undefined;
    details = undefined;
    bossDetails = lastBossSummary = undefined;
    unknownDetails = undefined;
    bondDetails = undefined;
    backend = traffic = undefined;
    lastStderrErrors = [];
    const childRun = ++run;
    let pending = '';
    let settledFailure = false;

    const fail = (errOrReason) => {
      if (worker !== child || settledFailure) return;
      settledFailure = true;
      const errCode = errOrReason && typeof errOrReason === 'object' ? errOrReason.code : '';
      const timedOut = errOrReason === 'timeout';
      stop();
      if (disposed || ['permission', 'unavailable', 'incompatible', 'paused'].includes(state.status)) {
        return;
      }
      // 缺失可执行文件或权限拒绝无法靠重试自愈，直接给出明确排障提示
      if (errCode === 'ENOENT' || errCode === 'EACCES' || errCode === 'EPERM') {
        publish({
          status: 'failed',
          restarting: false,
          autoRestartCount,
          failureReason: buildFailureAdvice(errCode, false),
        });
        return;
      }
      if (autoRestartCount < maxAutoRestarts) {
        autoRestartCount += 1;
        const delay = restartBaseDelayMs * Math.pow(2, autoRestartCount - 1);
        publish({
          status: 'starting',
          restarting: true,
          autoRestartCount,
          failureReason: `采集组件意外中断，正在自动重启（${autoRestartCount}/${maxAutoRestarts}）…`,
        });
        restartTimer = setTimeout(() => {
          if (!disposed && !worker && state.status !== 'paused') {
            start(true);
          }
        }, delay);
        if (typeof restartTimer.unref === 'function') restartTimer.unref();
        return;
      }
      publish({
        status: 'failed',
        restarting: false,
        autoRestartCount,
        failureReason: buildFailureAdvice(errCode, timedOut),
      });
    };

    child.on('error', (err) => fail(err));
    child.on('close', () => fail('closed'));
    child.stdin.on('error', () => fail('stdin'));
    child.stderr.on('error', () => fail('stderr'));
    createInterface({ input: child.stderr }).on('line', line => {
      if (worker !== child) return;
      if (DIAGNOSTICS.test(line)) {
        diagnostics = line.split(' ').slice(1).map(Number);
        details = traffic = undefined;
      } else if (DETAILS.test(line)) details = line.split(' ').slice(1).map(Number);
      else if (BOSS_DETAILS.test(line)) bossDetails = line.split(' ').slice(1).map(Number);
      else if (UNKNOWN_DETAILS.test(line)) unknownDetails = parseUnknownDetails(line);
      else if (BOND_DETAILS.test(line)) bondDetails = parseBondDetails(line);
      else if (/^PRTS_REPORT_BYTES(?: [0-9]{1,16}){2}$/.test(line)) traffic = line.split(' ').slice(1).map(Number);
      else if (/^PRTS_CAPTURE_SOURCE (winsock|npcap|mixed)$/.test(line)) backend = line.split(' ')[1];
      else if (line && line.trim() && !line.startsWith('PRTS_')) {
        lastStderrErrors.push(line.trim().slice(0, 140));
        if (lastStderrErrors.length > 6) lastStderrErrors.shift();
      }
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (worker !== child) return;
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        if (newline > MAX_REPORT) return fail('overflow');
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message?.kind === 'status' && WORKER_STATUSES.has(message.status)) {
          clearTimeout(startupTimer);
          clearTimeout(healthyTimer);
          if (['waiting', 'connecting', 'listening'].includes(message.status)) {
            healthyTimer = setTimeout(() => {
              if (worker === child) autoRestartCount = 0;
            }, healthyResetMs);
            if (typeof healthyTimer.unref === 'function') healthyTimer.unref();
          }
          publish({
            status: message.status,
            restarting: false,
            failureReason: '',
          });
        } else if (message?.kind === 'source') {
          const parsedSource = parseSourceMessage(message, screenApi);
          if (parsedSource) publish(parsedSource);
        } else if (message?.kind === 'report'
          && (message.report === null || (message.report?.rounds && message.report?.capture))) {
          if (message.report) lastBossSummary = bossSummary(message.report);
          publish({ report: message.report, reportRun: childRun });
        }
      }
      if (pending.length > MAX_REPORT) fail('overflow');
    });
    startupTimer = setTimeout(() => fail('timeout'), startupTimeoutMs);
    if (typeof startupTimer.unref === 'function') startupTimer.unref();
    return publish({
      status: 'starting',
      restarting: isAutoRetry,
      autoRestartCount,
      failureReason: isAutoRetry ? state.failureReason : '',
      report: isAutoRetry ? state.report : null,
      reportRun: childRun,
      clientSource: 'none',
      mumuWindow: null,
    });
  }

  function manualRestart() {
    if (disposed) return state;
    stop();
    autoRestartCount = 0;
    return start(false);
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
      const modeId = snapshot.battle_config?.mode_id || '';
      const modeName = snapshot.battle_config?.mode_name || '';
      const bossRounds = Array.isArray(snapshot.boss_rounds) ? snapshot.boss_rounds : [];
      const named = Object.values(snapshot.players ?? {}).filter(name => typeof name === 'string' && name.trim()).length;
      const latestHelp = Object.entries(snapshot.rounds ?? {}).reverse().find(([round, row]) =>
        /^(?:[1-9]|1[0-5])$/.test(round) && ['reported', 'observed'].includes(row?.assists_status));
      if (modeId || bossRounds.length) {
        detail += `\n模式：${modeName ? `${modeName} (${modeId})` : modeId || '未确认'}`
          + (bossRounds.length ? ` · 首领回合：${bossRounds.map(r => `R${r}`).join('/')}` : '');
      }
      detail += `\n本路席位：${Number.isInteger(self) && self >= 1 && self <= 4 ? `${self} 号${snapshot.capture.self_basis === 'help' ? '（结算关联）' : ''}` : '未确认'}`
        + ` · 已记录玩家 ID：${named} 个`;
      const elimEntries = Object.entries(snapshot.eliminated ?? {});
      const hpEntries = Object.entries(snapshot.hp ?? {});
      if (hpEntries.length || elimEntries.length) {
        const hpStr = hpEntries.map(([s, v]) => `${s}号:${v}`).join(' ');
        const elimStr = elimEntries.map(([s, r]) => `${s}号(R${r})`).join(' ');
        detail += `\n血量与淘汰：${hpStr || '—'}${elimStr ? ` · 已淘汰：${elimStr}` : ''}`;
      }
      if (latestHelp) {
        const row = latestHelp[1];
        const assigned = (Array.isArray(row.assist_pairs) ? row.assist_pairs : []).reduce((sum, item) =>
          sum + (Number.isSafeInteger(item?.count) && item.count > 0 ? item.count : 0), 0);
        const unmatched = Number.isSafeInteger(row.unattributed_assists) && row.unattributed_assists > 0 ? row.unattributed_assists : 0;
        detail += `\n最近协防记录：R${latestHelp[0]} · 双方已识别 ${assigned} 只 · 未能确认双方 ${unmatched} 只`;
      }
    }
    detail += `\n游戏客户端：${CLIENT_SOURCE_LABELS[state.clientSource] || CLIENT_SOURCE_LABELS.none}`;
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
      detail += `\n\nBoss 采集累计：开战场景 ${stage} · 结算或结束场景 ${terminal} · 非零伤害快照 ${runtime}`
        + `\n榜单候选 ${rank} · 达标信号 ${ratio} · 推定回合关联 ${inferred} · 未能归入回合 ${unassigned}`;
    }
    if (unknownDetails) {
      const entries = unknownDetails.map(({ direction, id, count }) =>
        `${direction === 'down' ? '下行' : '上行'} ${id}(${count})`);
      detail += `\n未识别消息 ID（按次数最多 12 项）：${entries.length ? entries.join('、') : '无'}`;
    }
    if (lastBossSummary) detail += `\n${snapshot ? '当前战报' : '最近一份本地战报'}：${lastBossSummary}`;
    if (bondDetails && bondDetails.length > 0) {
      const bondSummary = bondDetails
        .map(({ seat, bonds }) => `${seat}号:${bonds.join(',')}`)
        .join(' | ');
      detail += `\n盟约协议样本（7B hex）：${bondSummary}`;
    }
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
      if (!state.npcapInstalled && checkNpcap()) {
        return hotSwitchToNpcap('检测到 Npcap 已就绪，已自动切换至驱动采集通道。');
      }
      return state;
    },
    'battle-reports-diagnostics': showDiagnostics,
    'battle-reports-enable': (enabled) => {
      if (typeof enabled !== 'boolean') throw new Error('Invalid capture request');
      if (enabled && worker && ['permission', 'unavailable', 'incompatible'].includes(state.status)) stop();
      if (enabled) return start(false);
      stop();
      autoRestartCount = 0;
      return publish({ status: 'paused', restarting: false, failureReason: '' });
    },
    'battle-reports-restart': () => manualRestart(),
    'battle-reports-install-npcap': async (options) => {
      if (installingNpcap) return state;
      if (checkNpcap()) return hotSwitchToNpcap('Npcap 已安装，已切换至驱动采集通道。');
      const preferCompat180 = Boolean(options && typeof options === 'object' && options.preferCompat180 === true);
      installingNpcap = true;
      const shouldResumeWorker = state.status !== 'paused';
      let installSucceeded = false;
      try {
        await stopAndWait(1500);
        if (disposed) return state;
        const result = await launchNpcapInstaller({
          preferCompat180,
          onProgress: (installStatus, message) => {
            publish({ npcapInstall: { status: installStatus, message } });
          },
        });
        if (disposed) return state;
        if (result?.installed) {
          installSucceeded = true;
          return hotSwitchToNpcap(
            `Npcap ${result.version ? `v${result.version} ` : ''}安装完成，已自动切换至驱动采集通道（无需重启软件）。`,
            shouldResumeWorker,
          );
        }
        return publish({
          npcapInstalled: false,
          npcapInstall: {
            status: 'error',
            message: result?.failureMessage || '安装向导已关闭但未检测到 Npcap，请确认完成安装或重试。',
            canFallbackCompat180: Boolean(result?.canFallbackCompat180),
          },
        });
      } catch (err) {
        return publish({
          npcapInstalled: checkNpcap(),
          npcapInstall: {
            status: 'error',
            message: err instanceof Error ? err.message : '拉起 Npcap 官方安装失败，请点击打开官网手动安装。',
            canFallbackCompat180: !preferCompat180 && !isWindows10OrOlder(),
          },
        });
      } finally {
        installingNpcap = false;
        if (!disposed && !installSucceeded && shouldResumeWorker && state.status !== 'paused' && !worker) {
          start(false);
        }
      }
    },
    'battle-reports-recheck-npcap': () => {
      if (checkNpcap()) return hotSwitchToNpcap('检测到 Npcap 已安装，已自动切换至驱动采集通道。');
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
    start: () => start(false),
    restart: manualRestart,
    stopAndWait,
    dispose() {
      disposed = true;
      if (!mainWindow.isDestroyed()) mainWindow.removeListener('focus', onWindowFocus);
      stop();
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    },
  };
}

module.exports = {
  installBattleReports,
  diagnosticsDialogTitle,
  latestSelfFinish,
  parseUnknownDetails,
  parseBondDetails,
  parseSourceMessage,
};
