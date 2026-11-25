// 青逝痕 Tenkinoko 制作
import { useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, ChevronDown, FileDown, Layers, ListTree, Radio, RotateCcw, Swords } from 'lucide-react';
import { BossRoutes } from '../components/BossRoutes';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { DesktopDialog } from './DesktopDialog';
import { defaultBossRound, isHiddenBossRound, readBattleReport, reportLeader, reportProgress, type PreviewRoundFilter } from './battleReportData';
import { BossDamage, LeaderInlineBar } from './BattleReportPanels';
import { RoundMatrix } from './BattleReportRounds';
import { SpawnPreview } from './BattleReportSpawns';
import { BattleReportTelemetry } from './BattleReportTelemetry';
import { BattleReportDeckPool } from './BattleReportDeckPool';
import { BattleReportRoster } from './BattleReportRoster';
import { BattleReportExportDialog } from './BattleReportExportDialog';
import { NpcapSetupBanner } from './NpcapSetupBanner';
import { isSoloStageMode } from './combatTelemetry';
import { isCombatRound, summarizeBattleReport, type ReportSummary } from './battleReportExport';
import { reportWithPlayerNames, setReportPlayerNames, setReportSelfSeat, updateLiveReport, type BattleReportsBridge, type NpcapInstallState, type ReportFeed,
  type ReportRecords, type ReportSeat, type ReportStatus } from './battleReports';
import { PRODUCT_BRAND } from '../brand/productBrand';
import './battleReports.css';

const STATUS: Record<ReportStatus, string> = {
  starting: '正在启动本地战报…',
  waiting: '等待 Windows 版明日方舟启动',
  connecting: '游戏已启动，等待对局连接',
  listening: '本地采集中',
  permission: `实时采集需要以管理员身份运行 ${PRODUCT_BRAND.shortName}；已有历史战局可在左上角切换查阅或导出。`,
  paused: '实时采集已暂停',
  unavailable: '未能在当前网络上采集。已有历史战局仍可查阅或导出。',
  incompatible: '当前游戏数据未能识别。已有历史战局仍可查阅或导出。',
  failed: `本地战报组件未启动，请重启 ${PRODUCT_BRAND.shortName}。`,
};
const TABS = { rounds: '实时战报', deck: '当局牌库', telemetry: '伤害统计', boss: 'Boss 伤害', preview: '出怪预告' } as const;
const TAB_ICONS = { rounds: Activity, deck: Layers, telemetry: BarChart3, boss: Swords, preview: ListTree };
const shortStatus: Record<ReportStatus, string> = { starting: '启动中', waiting: '等待游戏', connecting: '等待对局',
  listening: '采集中', permission: '需要权限', paused: '已暂停', unavailable: '采集不可用', incompatible: '数据未识别', failed: '启动失败' };
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
type Tab = keyof typeof TABS;

export default function BattleReportsView({
  api,
  visible,
  sourceLabel,
  suggestedOperatorNames = [],
  suggestedEquipNames = [],
  compTitle = '',
  shared,
}: {
  api: BattleReportsBridge;
  visible: boolean;
  sourceLabel?: string;
  suggestedOperatorNames?: string[];
  suggestedEquipNames?: string[];
  compTitle?: string;
  shared?: {
    records: ReportRecords;
    setRecords: React.Dispatch<React.SetStateAction<ReportRecords>>;
    status: ReportStatus;
    npcapInstalled?: boolean;
    npcapInstall?: NpcapInstallState;
    failureReason?: string;
    restarting?: boolean;
  };
}) {
  const [localRecords, setLocalRecords] = useState<ReportRecords>({ history: [] });
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rounds');
  const [previewFilter, setPreviewFilter] = useState<{ key: string; round: PreviewRoundFilter } | null>(null);
  const [localStatus, setLocalStatus] = useState<ReportStatus>('starting');
  const [localFailureReason, setLocalFailureReason] = useState('');
  const [localRestarting, setLocalRestarting] = useState(false);
  const [localNpcapInstalled, setLocalNpcapInstalled] = useState<boolean | undefined>(undefined);
  const [localNpcapInstall, setLocalNpcapInstall] = useState<NpcapInstallState | undefined>(undefined);
  const [perspective, setPerspective] = useState<{ key: string; seat: ReportSeat } | null>(null);
  const [bossFilter, setBossFilter] = useState<{ key: string; round: number } | null>(null);
  const [exported, setExported] = useState<ReportSummary | null>(null);
  const [leaderKey, setLeaderKey] = useState('');
  const [leaderImage, setLeaderImage] = useState<{ url: string; title: string } | null>(null);
  const prevLiveKeyRef = useRef<string | undefined>(undefined);

  const records = shared ? shared.records : localRecords;
  const setRecords = shared ? shared.setRecords : setLocalRecords;
  const status = shared ? shared.status : localStatus;
  const failureReason = shared ? (shared.failureReason ?? '') : localFailureReason;
  const restarting = shared ? Boolean(shared.restarting) : localRestarting;
  const npcapInstalled = shared ? shared.npcapInstalled : localNpcapInstalled;
  const npcapInstall = shared ? shared.npcapInstall : localNpcapInstall;

  useEffect(() => {
    if (shared) return;
    let changed = false;
    let mounted = true;
    let latest: unknown;
    let latestRun: number | undefined;
    const accept = (feed: ReportFeed) => {
      setLocalStatus(feed.status);
      setLocalFailureReason(feed.failureReason ?? '');
      setLocalRestarting(Boolean(feed.restarting));
      if (feed.npcapInstalled !== undefined) setLocalNpcapInstalled(feed.npcapInstalled);
      if (feed.npcapInstall !== undefined) setLocalNpcapInstall(feed.npcapInstall);
      if (latest === feed.report && latestRun === feed.reportRun) return;
      latest = feed.report;
      latestRun = feed.reportRun;
      try {
        const report = feed.report === null ? null : readBattleReport(feed.report);
        const seenAt = Date.now();
        setLocalRecords(previous => updateLiveReport(previous, report, feed.reportRun, seenAt));
      } catch { setLocalStatus('incompatible'); }
    };
    const remove = api.onState(feed => { changed = true; accept(feed); });
    void api.getState().then(feed => { if (mounted && !changed) accept(feed); }).catch(() => {
      if (mounted && !changed) setLocalStatus('failed');
    });
    return () => { mounted = false; remove(); };
  }, [api, shared]);

  // 当实时对局结束/玩家阵亡断连归档进 history 时，自动停留展示刚结束的对局复盘，绝不瞬间清空白屏；
  // 等新对局开打产生新 live key 时，自动切回新实时局。
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

  const opened = openedKey === records.live?.key ? records.live : records.history.find(entry => entry.key === openedKey);
  const entry = opened ?? records.live ?? records.history[0];
  const report = entry && reportWithPlayerNames(entry);
  const key = entry?.key ?? '';
  const replay = Boolean(entry && entry.key !== records.live?.key);
  const liveView = status === 'listening' && Boolean(records.live && entry?.key === records.live.key);
  const canExport = Boolean(report && (report.rounds.some(isCombatRound) || (report.telemetry?.operators.length ?? 0) > 0));
  const exportReason = '尚无实战回合，不能导出战报文档。';
  const soloStage = isSoloStageMode(report?.mode);
  const activeTab: Tab = soloStage ? 'telemetry' : tab;
  const visibleTabs = soloStage
    ? (['telemetry'] as Tab[])
    : (Object.keys(TABS) as Tab[]);
  const progressLabel = soloStage
    ? (report?.difficulty || '单人关卡伤害统计')
    : reportProgress(report, liveView).label;
  const seat = perspective?.key === key ? perspective.seat : report?.self ?? null;
  const previewRound = previewFilter?.key === key ? previewFilter.round : replay ? 'all' : 'follow';
  const bossNumber = bossFilter?.key === key ? bossFilter.round : defaultBossRound(report);
  const leader = activeTab === 'boss' && report && reportLeader(report, bossNumber);
  const hiddenLeader = isHiddenBossRound(report, bossNumber);
  const highDifficulty = ['mode_multi_hard', 'mode_multi_abyss'].includes(report?.mode ?? '') ? true
    : ['mode_multi_funny', 'mode_multi_normal'].includes(report?.mode ?? '') ? false : undefined;
  const selectBossRound = (round: number) => { if (round >= 1 && round <= 15) setBossFilter({ key, round }); setLeaderKey(''); };
  const showPreview = (round: PreviewRoundFilter) => { setPreviewFilter({ key, round }); setTab('preview'); };
  const openTab = (name: Tab) => {
    if (name !== tab && name === 'preview') setPreviewFilter(null);
    setTab(name);
    setLeaderKey('');
  };
  const openRecord = (recordKey: string | null, nextTab: Tab = 'rounds') => {
    setOpenedKey(recordKey);
    setPerspective(null);
    setBossFilter(null);
    setLeaderKey('');
    setPreviewFilter(null);
    setTab(nextTab);
  };
  if (!visible) return null;
  return <main className="desktop-page d-report-page">
    <section className="d-report-shell" aria-label="本地战报">
      <header className="d-report-context">
        <label className="d-match-select"><select aria-label="选择对局" value={entry && entry.key !== records.live?.key ? entry.key : ''}
          onChange={e => openRecord(e.target.value || null)}>
          <option value="">{records.live?.label ?? '实时战报'}（当前）</option>
          {records.history.map(item => <option key={item.key} value={item.key}>{item.label} · {dateTime.format(item.seenAt)}
            {item.report.difficulty && ` · ${item.report.difficulty}`}</option>)}
        </select><ChevronDown size={14} /></label>
        <span className="d-export-trigger" title={canExport ? undefined : exportReason} tabIndex={canExport ? undefined : 0}
          aria-label={canExport ? undefined : exportReason}>
          <button type="button" className="d-button d-export-button" data-history={replay} disabled={!canExport}
            title={canExport ? '导出战报文档' : exportReason} onClick={() => {
              if (entry && report && canExport) setExported(summarizeBattleReport(entry, report, liveView, new Date()));
            }}><FileDown size={15} />导出战报文档</button>
        </span>
        <span className="d-report-status" role="status" data-live={liveView} title={replay ? entry?.label : sourceLabel ?? STATUS[status]}>
          <Radio size={14} />{replay ? '历史回放' : sourceLabel ?? shortStatus[status]}</span>
        {report && <span className="d-report-progress" title={[report.difficulty, progressLabel].filter(Boolean).join(' · ')}>{progressLabel}</span>}
        {entry && report && <BattleReportRoster key={entry.key} entry={entry} report={report} seat={seat}
          onViewSeat={s => setPerspective({ key, seat: s })}
          onResetPerspective={() => setPerspective(null)}
          onSave={names => setRecords(previous => setReportPlayerNames(previous, entry.key, names))}
          onSetSelfSeat={value => { setRecords(previous => setReportSelfSeat(previous, entry.key, value)); setPerspective(null); }} />}
      </header>
      {!sourceLabel && (restarting || ['failed', 'permission', 'unavailable', 'incompatible'].includes(status)) && (
        <div className="d-warning d-report-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <span>{failureReason || STATUS[status]}</span>
          <span style={{ display: 'inline-flex', gap: '6px', flexShrink: 0 }}>
            {!restarting && (
              <button
                type="button"
                className="d-button d-small"
                onClick={() => {
                  if (api.restart) void api.restart();
                  else void api.setEnabled(true);
                }}
              >
                <RotateCcw size={13} />立即重启采集
              </button>
            )}
            <button type="button" className="d-button d-small" onClick={() => void api.showDiagnostics()}>
              查看诊断
            </button>
          </span>
        </div>
      )}
      {!sourceLabel && <NpcapSetupBanner api={api} npcapInstalled={npcapInstalled} installState={npcapInstall} />}
      <nav className="d-report-tabs" aria-label="战报视图">
        {visibleTabs.map(name => { const Icon = TAB_ICONS[name]; return <button key={name} type="button"
          aria-pressed={activeTab === name} onClick={() => openTab(name)}><Icon size={15} />{name === 'rounds' && replay ? '战报回放' : TABS[name]}
          {name === 'telemetry' && (report?.telemetry?.operators.length ?? 0) > 0 && <i className="d-tab-count">{report!.telemetry!.operators.length}</i>}
          {name === 'deck' && report?.deckPool && <i className="d-tab-count">{report.deckPool.operators.length}</i>}
        </button>; })}
        {report?.difficulty && <small>{report.difficulty}</small>}
      </nav>
      <div className="d-report-body">
        {activeTab === 'rounds' && <RoundMatrix key={key} report={report} seat={seat} live={liveView} onPreview={() => showPreview('all')} />}
        {activeTab === 'deck' && (
          <BattleReportDeckPool
            key={key}
            report={report}
            suggestedOperatorNames={suggestedOperatorNames}
            suggestedEquipNames={suggestedEquipNames}
            compTitle={compTitle}
          />
        )}
        {activeTab === 'telemetry' && <BattleReportTelemetry key={key} report={report} />}
        {activeTab === 'boss' && <BossDamage report={report} seat={seat} number={bossNumber} onRound={selectBossRound} reference={leader &&
          <LeaderInlineBar encounter={leader} round={bossNumber} hidden={hiddenLeader}
            liveHp={report?.rounds.find(r => r.number === bossNumber)?.bossHp}
            onOpen={() => { setLeaderKey(key); setLeaderImage(null); }} />} onPreview={showPreview} />}
        {activeTab === 'preview' && <SpawnPreview key={key} report={report} live={liveView} filter={previewRound}
          onSelect={round => setPreviewFilter({ key, round })} />}
      </div>
      {exported && <BattleReportExportDialog report={exported} onClose={() => setExported(null)} />}
      {leaderKey === key && leader && <>
        <DesktopDialog open={visible && !leaderImage} title={`${leader.name} · R${bossNumber} 参考资料`} onClose={() => setLeaderKey('')}>
          <BossRoutes key={`${key}-${leader.id}-${bossNumber}`} leader={{ encounter: leader, round: hiddenLeader ? 15 : 14,
            highDifficulty }} onOpenImage={(url, title) => setLeaderImage({ url, title })} />
        </DesktopDialog>
        {visible && leaderImage && <ImageLightboxModal initialUrl={leaderImage.url} initialTitle={leaderImage.title} onClose={() => setLeaderImage(null)} />}
      </>}
    </section>
  </main>;
}
