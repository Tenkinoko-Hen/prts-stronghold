import { useEffect, useState } from 'react';
import { Activity, ChevronDown, FileDown, ListTree, Radio, Swords } from 'lucide-react';
import { BossRoutes } from '../components/BossRoutes';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { DesktopDialog } from './DesktopDialog';
import { defaultBossRound, readBattleReport, reportLeader, reportProgress, type PreviewRoundFilter } from './battleReportData';
import { BossDamage } from './BattleReportPanels';
import { RoundMatrix } from './BattleReportRounds';
import { SpawnPreview } from './BattleReportSpawns';
import { BattleReportRoster } from './BattleReportRoster';
import { BattleReportExportDialog } from './BattleReportExportDialog';
import { isCombatRound, summarizeBattleReport, type ReportSummary } from './battleReportExport';
import { reportWithPlayerNames, setReportPlayerNames, setReportSelfSeat, updateLiveReport, type BattleReportsBridge, type ReportFeed,
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
const TABS = { rounds: '实时战报', preview: '出怪预告', boss: 'Boss 伤害' } as const;
const TAB_ICONS = { rounds: Activity, preview: ListTree, boss: Swords };
const shortStatus: Record<ReportStatus, string> = { starting: '启动中', waiting: '等待游戏', connecting: '等待对局',
  listening: '采集中', permission: '需要权限', paused: '已暂停', unavailable: '采集不可用', incompatible: '数据未识别', failed: '启动失败' };
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
type Tab = keyof typeof TABS;

export default function BattleReportsView({ api, visible, sourceLabel }: { api: BattleReportsBridge; visible: boolean; sourceLabel?: string }) {
  const [records, setRecords] = useState<ReportRecords>({ history: [] });
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rounds');
  const [previewFilter, setPreviewFilter] = useState<{ key: string; round: PreviewRoundFilter } | null>(null);
  const [status, setStatus] = useState<ReportStatus>('starting');
  const [perspective, setPerspective] = useState<{ key: string; seat: ReportSeat } | null>(null);
  const [bossFilter, setBossFilter] = useState<{ key: string; round: 14 | 15 } | null>(null);
  const [exported, setExported] = useState<ReportSummary | null>(null);
  const [leaderKey, setLeaderKey] = useState('');
  const [leaderImage, setLeaderImage] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    let changed = false;
    let mounted = true;
    let latest: unknown;
    let latestRun: number | undefined;
    const accept = (feed: ReportFeed) => {
      setStatus(feed.status);
      if (latest === feed.report && latestRun === feed.reportRun) return;
      latest = feed.report;
      latestRun = feed.reportRun;
      try {
        const report = feed.report === null ? null : readBattleReport(feed.report);
        const seenAt = Date.now();
        setRecords(previous => updateLiveReport(previous, report, feed.reportRun, seenAt));
      } catch { setStatus('incompatible'); }
    };
    const remove = api.onState(feed => { changed = true; accept(feed); });
    void api.getState().then(feed => { if (mounted && !changed) accept(feed); }).catch(() => {
      if (mounted && !changed) setStatus('failed');
    });
    return () => { mounted = false; remove(); };
  }, [api]);

  const opened = openedKey === records.live?.key ? records.live : records.history.find(entry => entry.key === openedKey);
  const entry = opened ?? records.live;
  const report = entry && reportWithPlayerNames(entry);
  const key = entry?.key ?? '';
  const replay = Boolean(entry && entry.key !== records.live?.key);
  const liveView = status === 'listening' && (!entry || entry.key === records.live?.key);
  const canExport = report?.rounds.some(isCombatRound) ?? false;
  const exportReason = '尚无实战回合，不能导出战报文档。';
  const progressLabel = reportProgress(report, liveView).label;
  const seat = perspective?.key === key ? perspective.seat : report?.self ?? null;
  const previewRound = previewFilter?.key === key ? previewFilter.round : replay ? 'all' : 'follow';
  const bossNumber = bossFilter?.key === key ? bossFilter.round : defaultBossRound(report);
  const lastLocal = !report && records.history[0];
  const leader = tab === 'boss' && report && reportLeader(report, bossNumber);
  const highDifficulty = ['mode_multi_hard', 'mode_multi_abyss'].includes(report?.mode ?? '') ? true
    : ['mode_multi_funny', 'mode_multi_normal'].includes(report?.mode ?? '') ? false : undefined;
  const selectBossRound = (round: number) => { if (round === 14 || round === 15) setBossFilter({ key, round }); setLeaderKey(''); };
  const showPreview = (round: PreviewRoundFilter) => { setPreviewFilter({ key, round }); setTab('preview'); };
  const openTab = (name: Tab) => {
    if (name !== tab && name === 'preview') setPreviewFilter(null);
    setTab(name);
    setLeaderKey('');
  };
  const openRecord = (key: string | null, tab: Tab = 'rounds') => {
    setOpenedKey(key);
    setPerspective(null);
    setBossFilter(null);
    setLeaderKey('');
    setPreviewFilter(null);
    setTab(tab);
  };
  if (!visible) return null;
  return <main className="desktop-page d-report-page">
    <section className="d-report-shell" aria-label="本地战报">
      <header className="d-report-context">
        <label className="d-match-select"><select aria-label="选择对局" value={opened && opened.key !== records.live?.key ? opened.key : ''}
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
          onViewSeat={seat => setPerspective({ key, seat })}
          onSave={names => setRecords(previous => setReportPlayerNames(previous, entry.key, names))}
          onSetSelfSeat={value => { setRecords(previous => setReportSelfSeat(previous, entry.key, value)); setPerspective(null); }} />}
      </header>
      {!sourceLabel && ['failed', 'permission', 'unavailable', 'incompatible'].includes(status) && <p className="d-warning d-report-error">{STATUS[status]}</p>}
      <nav className="d-report-tabs" aria-label="战报视图">
        {(Object.keys(TABS) as Tab[]).map(name => { const Icon = TAB_ICONS[name]; return <button key={name} type="button"
          aria-pressed={tab === name} onClick={() => openTab(name)}><Icon size={15} />{name === 'rounds' && replay ? '战报回放' : TABS[name]}</button>; })}
        {report?.difficulty && <small>{report.difficulty}</small>}
      </nav>
      <div className="d-report-body">
        {tab === 'rounds' && <RoundMatrix key={key} report={report} seat={seat} live={liveView} onPreview={() => showPreview('all')} />}
        {tab === 'boss' && lastLocal && <button type="button" className="d-button d-small"
          onClick={() => openRecord(lastLocal.key, 'boss')}>查看最近本地对局</button>}
        {tab === 'boss' && <BossDamage report={report} seat={seat} number={bossNumber} onRound={selectBossRound} reference={leader &&
          <div className="d-report-leader"><strong>{leader.name}</strong><button className="d-button d-small" type="button"
            onClick={() => { setLeaderKey(key); setLeaderImage(null); }}>领袖属性与站位</button></div>} onPreview={showPreview} />}
        {tab === 'preview' && <SpawnPreview key={key} report={report} live={liveView} filter={previewRound}
          onSelect={round => setPreviewFilter({ key, round })} />}
      </div>
      {exported && <BattleReportExportDialog report={exported} onClose={() => setExported(null)} />}
      {leaderKey === key && leader && <>
        <DesktopDialog open={visible && !leaderImage} title={`${leader.name} · R${bossNumber} 参考资料`} onClose={() => setLeaderKey('')}>
          <BossRoutes key={`${key}-${leader.id}-${bossNumber}`} leader={{ encounter: leader, round: bossNumber,
            highDifficulty }} onOpenImage={(url, title) => setLeaderImage({ url, title })} />
        </DesktopDialog>
        {visible && leaderImage && <ImageLightboxModal initialUrl={leaderImage.url} initialTitle={leaderImage.title} onClose={() => setLeaderImage(null)} />}
      </>}
    </section>
  </main>;
}
