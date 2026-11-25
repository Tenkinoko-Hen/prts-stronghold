// 青逝痕 Tenkinoko 制作
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AppWindow,
  BarChart3,
  ChevronDown,
  Crosshair,
  FileDown,
  LayoutDashboard,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  Pin,
  RotateCcw,
  Swords,
} from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import {
  defaultBossRound,
  readBattleReport,
  reportProgress,
  type PreviewRoundFilter,
} from './battleReportData';
import { BossDamage } from './BattleReportPanels';
import { RoundMatrix } from './BattleReportRounds';
import { SpawnPreview } from './BattleReportSpawns';
import { BattleReportTelemetry } from './BattleReportTelemetry';
import { BattleReportDeckPool } from './BattleReportDeckPool';
import { BattleReportRoster } from './BattleReportRoster';
import { BattleReportExportDialog } from './BattleReportExportDialog';
import { NpcapSetupBanner } from './NpcapSetupBanner';
import { isSoloStageMode } from './combatTelemetry';
import { isCombatRound, summarizeBattleReport, type ReportSummary } from './battleReportExport';
import {
  reportWithPlayerNames,
  setReportPlayerNames,
  setReportSelfSeat,
  updateLiveReport,
  type BattleReportsBridge,
  type ClientSource,
  type HudOverlayState,
  type NpcapInstallState,
  type ReportFeed,
  type ReportRecords,
  type ReportSeat,
  type ReportStatus,
  type WindowLayoutState,
} from './battleReports';
import { LiteCockpitView, type LiteTab } from './LiteCockpitView';
import './desktop.css';
import './battleReports.css';
import './telemetryLite.css';

const desktopAPI = window.electronAPI;

const LITE_TABS: { id: LiteTab; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'cockpit', label: '总览', Icon: LayoutDashboard },
  { id: 'rounds', label: '战报', Icon: Activity },
  { id: 'deck', label: '牌库', Icon: Layers },
  { id: 'telemetry', label: '伤害', Icon: BarChart3 },
  { id: 'boss', label: 'Boss', Icon: Swords },
  { id: 'preview', label: '出怪', Icon: ListTree },
];

const SHORT_STATUS: Record<ReportStatus, string> = {
  starting: '启动中',
  waiting: '待游戏',
  connecting: '待进局',
  listening: '记录中',
  permission: '需管理员',
  paused: '已暂停',
  unavailable: '不可用',
  incompatible: '未识别',
  failed: '异常',
};

const ERROR_TEXT: Partial<Record<ReportStatus, string>> = {
  permission: `实时采集需要以管理员身份运行 ${PRODUCT_BRAND.shortName}；历史战局仍可查阅与导出。`,
  unavailable: '未能在当前网络上采集；已有历史战局仍可查阅与导出。',
  incompatible: '当前游戏数据未能识别；已有历史战局仍可查阅与导出。',
  failed: `本地战报组件未启动，请重启 ${PRODUCT_BRAND.shortName}。`,
};

const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

export default function TelemetryApp({
  previewApi,
  previewRail,
  onTogglePreviewRail,
}: {
  previewApi?: BattleReportsBridge;
  previewRail?: boolean;
  onTogglePreviewRail?(): void;
}) {
  const reportsApi = previewApi ?? desktopAPI?.battleReports;

  const [alwaysOnTop, setAlwaysOnTop] = useState(PRODUCT_BRAND.defaultAlwaysOnTop);
  const [windowMode, setWindowMode] = useState<'wide' | 'rail'>(previewRail ? 'rail' : 'wide');
  const [pinPending, setPinPending] = useState(false);
  const [layoutPending, setLayoutPending] = useState(false);
  const [hudState, setHudState] = useState<HudOverlayState | null>(null);

  const [records, setRecords] = useState<ReportRecords>({ history: [] });
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<LiteTab>('cockpit');
  const [status, setStatus] = useState<ReportStatus>('starting');
  const [failureReason, setFailureReason] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [clientSource, setClientSource] = useState<ClientSource>('none');
  const [mumuPlacement, setMumuPlacement] = useState<'outside-right' | 'inside-right' | 'screen-right' | null>(null);
  const [npcapInstalled, setNpcapInstalled] = useState<boolean | undefined>(undefined);
  const [npcapInstall, setNpcapInstall] = useState<NpcapInstallState | undefined>(undefined);
  const [perspective, setPerspective] = useState<{ key: string; seat: ReportSeat } | null>(null);
  const [bossFilter, setBossFilter] = useState<{ key: string; round: number } | null>(null);
  const [previewFilter, setPreviewFilter] = useState<{ key: string; round: PreviewRoundFilter } | null>(null);
  const [exported, setExported] = useState<ReportSummary | null>(null);
  const prevLiveKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previewRail !== undefined) setWindowMode(previewRail ? 'rail' : 'wide');
  }, [previewRail]);

  useEffect(() => {
    let mounted = true;
    const applyLayout = (next: WindowLayoutState) => {
      if (!mounted) return;
      setWindowMode(next.mode === 'rail' ? 'rail' : 'wide');
      setAlwaysOnTop(next.alwaysOnTop);
      if (next.clientSource !== undefined) setClientSource(next.clientSource);
      if (next.placement !== undefined) setMumuPlacement(next.placement ?? null);
    };
    const offHud = desktopAPI?.hud?.onState(next => { if (mounted) setHudState(next); });
    const offLayout = desktopAPI?.windowLayout?.onState?.(applyLayout);
    void desktopAPI?.hud?.getState().then(next => { if (mounted) setHudState(next); }).catch(() => {});
    void desktopAPI?.windowLayout?.getMode().then(applyLayout).catch(() => {});
    return () => {
      mounted = false;
      offHud?.();
      offLayout?.();
    };
  }, []);

  useEffect(() => {
    if (!reportsApi) return;
    let changed = false;
    let mounted = true;
    let latest: unknown;
    let latestRun: number | undefined;
    const accept = (feed: ReportFeed) => {
      setStatus(feed.status);
      setFailureReason(feed.failureReason ?? '');
      setRestarting(Boolean(feed.restarting));
      if (feed.clientSource !== undefined) setClientSource(feed.clientSource);
      if (feed.npcapInstalled !== undefined) setNpcapInstalled(feed.npcapInstalled);
      if (feed.npcapInstall !== undefined) setNpcapInstall(feed.npcapInstall);
      if (latest === feed.report && latestRun === feed.reportRun) return;
      latest = feed.report;
      latestRun = feed.reportRun;
      try {
        const parsed = feed.report === null ? null : readBattleReport(feed.report);
        setRecords(previous => updateLiveReport(previous, parsed, feed.reportRun, Date.now()));
      } catch {
        setStatus('incompatible');
      }
    };
    const remove = reportsApi.onState(feed => { changed = true; accept(feed); });
    void reportsApi.getState().then(feed => { if (mounted && !changed) accept(feed); }).catch(() => {
      if (mounted && !changed) setStatus('failed');
    });
    return () => { mounted = false; remove(); };
  }, [reportsApi]);

  // 局末归档后停留复盘不白屏；新局开始自动切回实时局
  useEffect(() => {
    const prevKey = prevLiveKeyRef.current;
    const nextKey = records.live?.key;
    if (prevKey && !nextKey) {
      setOpenedKey(current => (current === null || current === prevKey ? prevKey : current));
    } else if (!prevKey && nextKey) {
      setOpenedKey(null);
    } else if (prevKey && nextKey && prevKey !== nextKey) {
      setOpenedKey(null);
    }
    prevLiveKeyRef.current = nextKey;
  }, [records.live?.key]);

  const toggleAlwaysOnTop = async () => {
    if (!desktopAPI || pinPending) return;
    setPinPending(true);
    try {
      setAlwaysOnTop(await desktopAPI.setAlwaysOnTop(!alwaysOnTop));
    } finally {
      setPinPending(false);
    }
  };

  const snapToMumu = async () => {
    if (!desktopAPI?.windowLayout?.snapToMumu || layoutPending) return;
    setLayoutPending(true);
    try {
      const next = await desktopAPI.windowLayout.snapToMumu();
      setWindowMode(next.mode === 'rail' ? 'rail' : 'wide');
      setAlwaysOnTop(next.alwaysOnTop);
      if (next.placement !== undefined) setMumuPlacement(next.placement ?? null);
    } finally {
      setLayoutPending(false);
    }
  };

  const toggleWindowMode = async () => {
    if (onTogglePreviewRail) {
      onTogglePreviewRail();
      return;
    }
    if (!desktopAPI?.windowLayout || layoutPending) return;
    setLayoutPending(true);
    try {
      const next = await desktopAPI.windowLayout.setMode(windowMode === 'rail' ? 'wide' : 'rail');
      setWindowMode(next.mode === 'rail' ? 'rail' : 'wide');
      setAlwaysOnTop(next.alwaysOnTop);
    } finally {
      setLayoutPending(false);
    }
  };

  const opened = openedKey === records.live?.key ? records.live : records.history.find(item => item.key === openedKey);
  const entry = opened ?? records.live ?? records.history[0];
  const report = entry && reportWithPlayerNames(entry);
  const key = entry?.key ?? '';
  const replay = Boolean(entry && entry.key !== records.live?.key);
  const liveView = status === 'listening' && Boolean(records.live && entry?.key === records.live.key);
  const canExport = Boolean(report && (report.rounds.some(isCombatRound) || (report.telemetry?.operators.length ?? 0) > 0));
  const soloStage = isSoloStageMode(report?.mode);
  const activeTab: LiteTab = soloStage ? 'telemetry' : tab;
  const visibleTabs = soloStage ? LITE_TABS.filter(t => t.id === 'telemetry') : LITE_TABS;
  const seat = perspective?.key === key ? perspective.seat : report?.self ?? null;
  const previewRound = previewFilter?.key === key ? previewFilter.round : replay ? 'all' : 'follow';
  const bossNumber = bossFilter?.key === key ? bossFilter.round : defaultBossRound(report);
  const liveRound = report?.current || report?.rounds.at(-1)?.number || null;

  const statusTone = replay
    ? 'replay'
    : npcapInstalled === false || restarting
      ? 'warn'
      : liveView
        ? 'live'
        : ['permission', 'unavailable', 'incompatible', 'failed'].includes(status)
          ? 'error'
          : 'idle';

  const statusText = replay
    ? '回放'
    : npcapInstalled === false
      ? '未装 Npcap'
      : restarting
        ? '自动重连中…'
        : liveView
          ? `${clientSource === 'mumu' ? 'MuMu · ' : ''}${liveRound !== null ? `记录中 R${String(liveRound).padStart(2, '0')}` : '记录中'}`
          : clientSource === 'mumu'
            ? (['waiting', 'connecting', 'listening'].includes(status) ? 'MuMu · 待进局' : `MuMu · ${SHORT_STATUS[status]}`)
            : SHORT_STATUS[status];

  const openRecord = (recordKey: string | null) => {
    setOpenedKey(recordKey);
    setPerspective(null);
    setBossFilter(null);
    setPreviewFilter(null);
  };

  const showPreview = (round: PreviewRoundFilter) => {
    setPreviewFilter({ key, round });
    setTab('preview');
  };

  const selectBossRound = (round: number) => {
    if (round >= 1 && round <= 15) setBossFilter({ key, round });
  };

  return (
    <div className="lite-app desktop-app" data-window-mode={windowMode} data-active-tab={activeTab}>
      {/* Row 1: 40px Single-Row Master Instrument Bar */}
      <header className="lite-topbar">
        <div className="lite-brand">
          <span className="lite-brand-chip">LITE</span>
          <span className="lite-brand-name font-display">{PRODUCT_BRAND.shortName}</span>
        </div>

        <span className="lite-status-pill" data-tone={statusTone} role="status" title={reportProgress(report, liveView).label}>
          <span className="lite-dot" aria-hidden="true" />
          <span>{statusText}</span>
        </span>

        <nav className="lite-nav" aria-label="战报仪视图">
          {visibleTabs.map(({ id, label, Icon }) => {
            const count = id === 'deck'
              ? report?.deckPool?.operators.length
              : id === 'telemetry'
                ? (report?.telemetry?.operators.length || undefined)
                : undefined;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={activeTab === id}
                onClick={() => {
                  if (id !== tab && id === 'preview') setPreviewFilter(null);
                  setTab(id);
                }}
              >
                <Icon size={13} />
                <span>{id === 'rounds' && replay ? '回放' : label}</span>
                {count ? <i>{count}</i> : null}
              </button>
            );
          })}
        </nav>

        <div className="lite-tools">
          <button
            type="button"
            className={`lite-tool-btn${replay ? ' is-highlight' : ''}`}
            disabled={!canExport}
            title={canExport ? '导出离线战报文档 (HTML/PNG)' : '尚无实战回合可导出'}
            onClick={() => {
              if (entry && report && canExport) {
                setExported(summarizeBattleReport(entry, report, liveView, new Date()));
              }
            }}
          >
            <FileDown size={13} />
            <span>导出</span>
          </button>

          {clientSource === 'mumu' && desktopAPI?.windowLayout?.snapToMumu && (
            <button
              type="button"
              className={`lite-tool-btn${mumuPlacement ? ' is-active' : ''}`}
              disabled={layoutPending}
              title={mumuPlacement === 'inside-right' ? '重新吸附 MuMu 窗口（右侧空间不足，内侧叠放）' : '吸附定位到 MuMu 窗口右侧'}
              onClick={() => void snapToMumu()}
            >
              <Crosshair size={13} />
              <span>吸附</span>
            </button>
          )}

          {(desktopAPI?.windowLayout || onTogglePreviewRail) && (
            <button
              type="button"
              className="lite-tool-btn"
              aria-pressed={windowMode === 'rail'}
              disabled={layoutPending}
              title={
                windowMode === 'rail'
                  ? '切回宽屏视图（1180×740）'
                  : clientSource === 'mumu'
                    ? '切到侧边栏并吸附 MuMu 窗口右侧'
                    : '切到 460px 侧边栏贴在游戏旁边'
              }
              onClick={() => void toggleWindowMode()}
            >
              {windowMode === 'rail' ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
              <span>{windowMode === 'rail' ? '宽屏' : '侧边栏'}</span>
            </button>
          )}

          {desktopAPI?.hud && (
            <button
              type="button"
              className="lite-tool-btn"
              aria-pressed={Boolean(hudState?.open)}
              title="打开置顶小窗（Ctrl+Shift+F10 锁定鼠标穿透）"
              onClick={() => void desktopAPI.hud?.setOpen(!hudState?.open)}
            >
              <AppWindow size={13} />
              <span>悬浮窗</span>
            </button>
          )}

          {desktopAPI && (
            <button
              type="button"
              className="lite-tool-btn"
              aria-pressed={alwaysOnTop}
              disabled={pinPending}
              title="切换系统窗口置顶"
              onClick={() => void toggleAlwaysOnTop()}
            >
              <Pin size={13} />
              <span>{alwaysOnTop ? '已置顶' : '置顶'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Row 2: 34px Compact Context Strip (History + Ban Covenants + 4-Seat Roster) */}
      <div className="lite-subbar d-report-shell">
        <label className="d-match-select">
          <select
            aria-label="选择对局"
            value={entry && entry.key !== records.live?.key ? entry.key : ''}
            onChange={e => openRecord(e.target.value || null)}
          >
            <option value="">{records.live?.label ?? '实时战报'}（当前）</option>
            {records.history.map(item => (
              <option key={item.key} value={item.key}>
                {item.label} · {dateTime.format(item.seenAt)}{item.report.difficulty ? ` · ${item.report.difficulty}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>

        {report?.difficulty && <span className="lite-diff-badge">{report.difficulty}</span>}

        {report && report.bannedCovenants.length > 0 && (
          <div className="lite-bans" aria-label="本局禁选盟约">
            <span className="lite-bans-label">BAN</span>
            {report.bannedCovenants.map(name => (
              <span key={name} className="lite-ban-chip">{name}</span>
            ))}
          </div>
        )}

        {entry && report && (
          <BattleReportRoster
            key={entry.key}
            entry={entry}
            report={report}
            seat={seat}
            onViewSeat={s => setPerspective({ key, seat: s })}
            onResetPerspective={() => setPerspective(null)}
            onSave={names => setRecords(previous => setReportPlayerNames(previous, entry.key, names))}
            onSetSelfSeat={value => {
              setRecords(previous => setReportSelfSeat(previous, entry.key, value));
              setPerspective(null);
            }}
          />
        )}
      </div>

      {/* Row 3: Scrollable Instrument Viewport */}
      <main className="lite-main">
        <div className="lite-main-inner d-report-shell">
          {!previewApi && (restarting || ERROR_TEXT[status]) && (
            <div className="d-warning d-report-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <span>{failureReason || ERROR_TEXT[status]}</span>
              {reportsApi && (
                <span style={{ display: 'inline-flex', gap: '6px', flexShrink: 0 }}>
                  {!restarting && (
                    <button
                      type="button"
                      className="d-button d-small"
                      onClick={() => {
                        if (reportsApi.restart) void reportsApi.restart();
                        else void reportsApi.setEnabled(true);
                      }}
                    >
                      <RotateCcw size={13} />立即重启采集
                    </button>
                  )}
                  <button type="button" className="d-button d-small" onClick={() => void reportsApi.showDiagnostics()}>
                    查看诊断
                  </button>
                </span>
              )}
            </div>
          )}
          {!previewApi && reportsApi && (
            <NpcapSetupBanner api={reportsApi} npcapInstalled={npcapInstalled} installState={npcapInstall} />
          )}

          {!reportsApi ? (
            <section className="lite-card">
              <div className="lite-empty-inline">
                请在 Windows 桌面端运行 {PRODUCT_BRAND.name} 以启用本机实时采集，或在开发模式下打开 <code>?lite-demo</code> 预演。
              </div>
            </section>
          ) : (
            <>
              {activeTab === 'cockpit' && (
                <LiteCockpitView
                  report={report}
                  seat={seat}
                  live={liveView}
                  status={status}
                  npcapInstalled={npcapInstalled}
                  history={records.history}
                  onSelectRecord={openRecord}
                  onSelectSeat={s => setPerspective({ key, seat: s })}
                  onJumpTab={setTab}
                  onOpenHud={desktopAPI?.hud ? () => void desktopAPI.hud?.setOpen(true) : undefined}
                />
              )}
              {activeTab === 'rounds' && (
                <RoundMatrix key={key} report={report} seat={seat} live={liveView} onPreview={() => showPreview('all')} />
              )}
              {activeTab === 'deck' && <BattleReportDeckPool key={key} report={report} />}
              {activeTab === 'telemetry' && <BattleReportTelemetry key={key} report={report} />}
              {activeTab === 'boss' && (
                <BossDamage report={report} seat={seat} number={bossNumber} onRound={selectBossRound} reference={null} onPreview={showPreview} />
              )}
              {activeTab === 'preview' && (
                <SpawnPreview
                  key={key}
                  report={report}
                  live={liveView}
                  filter={previewRound}
                  onSelect={round => setPreviewFilter({ key, round })}
                />
              )}
            </>
          )}
        </div>
      </main>

      {exported && <BattleReportExportDialog report={exported} onClose={() => setExported(null)} />}
    </div>
  );
}
