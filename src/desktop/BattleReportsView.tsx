import { useEffect, useRef, useState } from 'react';
import { Activity, FileUp, Shield } from 'lucide-react';
import { BossRoutes } from '../components/BossRoutes';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { DesktopDialog } from './DesktopDialog';
import { defaultBossRound, readBattleReport, reportLeader, reportProgress, type PreviewRoundFilter, type ReportRoundFilter } from './battleReportData';
import { BossDamage, ReportHistory, RoundMatrix, SpawnPreview, WaveDetails } from './BattleReportPanels';
import { BattleReportRoster } from './BattleReportRoster';
import { MAX_REPORT_HISTORY, reportWithPlayerNames, setReportPlayerNames, setReportSelfSeat, updateLiveReport, type BattleReportsBridge, type ReportFeed, type ReportRecord,
  type ReportRecords, type ReportStatus } from './battleReports';
import './battleReports.css';

const STATUS: Record<ReportStatus, string> = {
  starting: '正在启动本地战报…',
  waiting: '等待 Windows 版明日方舟启动',
  connecting: '游戏已启动，等待对局连接',
  listening: '本地采集中',
  permission: '实时采集需要以管理员身份运行 PRTS；可导入 JSON 战报。',
  paused: '实时采集已暂停',
  unavailable: '未能在当前网络上采集，可导入 JSON 战报。',
  incompatible: '当前游戏数据未能识别，可导入 JSON 战报。',
  failed: '本地战报组件未启动，请重启 PRTS，或从「历史对局」导入 JSON。',
};
const maxReportBytes = 8 * 1024 * 1024;
const TABS = { rounds: '回合记录', waves: '回合详情', boss: 'Boss 伤害', preview: '出怪预告', history: '历史对局' } as const;
type Tab = keyof typeof TABS;

export default function BattleReportsView({ api, visible }: { api: BattleReportsBridge; visible: boolean }) {
  const [records, setRecords] = useState<ReportRecords>({ history: [] });
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rounds');
  const [previewFilter, setPreviewFilter] = useState<{ key: string; round: PreviewRoundFilter } | null>(null);
  const [status, setStatus] = useState<ReportStatus>('starting');
  const [waveFilter, setWaveFilter] = useState<{ key: string; round: ReportRoundFilter } | null>(null);
  const [bossFilter, setBossFilter] = useState<{ key: string; round: 14 | 15 } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaderKey, setLeaderKey] = useState('');
  const [leaderImage, setLeaderImage] = useState<{ url: string; title: string } | null>(null);
  const nextImport = useRef(0);

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

  const importReport = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > maxReportBytes) throw new Error('JSON 战报不能超过 8 MB。');
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); }
      catch { throw new Error('无法读取 JSON 战报；请选 ArkLogs 的 .json 文件。'); }
      const entry: ReportRecord = { key: `file:${++nextImport.current}`, label: file.name, report: readBattleReport(raw),
        seenAt: file.lastModified || Date.now(), source: 'file' };
      setRecords(previous => ({ ...previous, history: [entry, ...previous.history].slice(0, MAX_REPORT_HISTORY) }));
      openRecord(entry.key);
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法导入战报。'); }
    finally { setBusy(false); }
  };

  const opened = openedKey === records.live?.key ? records.live : records.history.find(entry => entry.key === openedKey);
  const entry = opened ?? records.live;
  const report = entry && reportWithPlayerNames(entry);
  const key = entry?.key ?? '';
  const liveView = status === 'listening' && (!entry || entry.key === records.live?.key);
  const { number: latestRound, label: progressLabel } = reportProgress(report, liveView);
  const waveRound = waveFilter?.key === key ? waveFilter.round : 'all';
  const previewRound = previewFilter?.key === key ? previewFilter.round : 'follow';
  const bossNumber = bossFilter?.key === key ? bossFilter.round : defaultBossRound(report);
  const lastLocal = !report && records.history.find(entry => entry.source === 'live');
  const leader = tab === 'boss' && report && reportLeader(report, bossNumber);
  const highDifficulty = ['mode_multi_hard', 'mode_multi_abyss'].includes(report?.mode ?? '') ? true
    : ['mode_multi_funny', 'mode_multi_normal'].includes(report?.mode ?? '') ? false : undefined;
  const selectWaveRound = (round: ReportRoundFilter) => setWaveFilter({ key, round });
  const selectBossRound = (round: number) => { if (round === 14 || round === 15) setBossFilter({ key, round }); setLeaderKey(''); };
  const showPreview = (round: number) => { setPreviewFilter({ key, round }); setTab('preview'); };
  const openTab = (name: Tab) => {
    if (name !== tab && name === 'waves') setWaveFilter(null);
    if (name !== tab && name === 'preview') setPreviewFilter(null);
    setTab(name);
    setLeaderKey('');
  };
  const openRecord = (key: string | null, tab: Tab = 'rounds') => {
    setOpenedKey(key);
    setWaveFilter(null);
    setBossFilter(null);
    setLeaderKey('');
    setPreviewFilter(null);
    setTab(tab);
  };
  if (!visible) return null;
  return <main className="desktop-page d-report-page">
    <section className="d-panel d-report-shell" aria-label="本地战报">
      <header className="d-section-head d-report-head">
        <div><div className="d-report-kicker">PRTS / BATTLE LOG</div><h1><Activity size={18} />战报</h1></div>
      </header>
      <div className="d-report-meta">
        <div className="d-report-status" role="status"><Shield size={14} /><span>{STATUS[status]}</span></div>
        {entry && <span title={entry.label} className="d-report-record-title">{entry.label}</span>}
        {report?.difficulty && <span>难度 <strong>{report.difficulty}</strong></span>}
        {(report || liveView) && <strong className="d-report-progress">{progressLabel}</strong>}
        {opened && opened.key !== records.live?.key && <button className="d-button d-small" type="button" onClick={() => openRecord(null)}>返回实时战报</button>}
      </div>
      {error && <p role="alert" className="d-warning d-report-error">{error}</p>}
      {entry && report && tab !== 'history' && <BattleReportRoster key={entry.key} entry={entry} report={report}
        onSave={names => setRecords(previous => setReportPlayerNames(previous, entry.key, names))}
        onSetSelfSeat={seat => setRecords(previous => setReportSelfSeat(previous, entry.key, seat))} />}
      <nav className="d-report-tabs" aria-label="战报视图">
        {(Object.keys(TABS) as Tab[]).map(name => <button key={name} className="d-button d-small" type="button"
          aria-pressed={tab === name} onClick={() => openTab(name)}>{TABS[name]}</button>)}
      </nav>
      <div className="d-report-body">
        {tab === 'rounds' && <RoundMatrix key={key} report={report} active={latestRound}
          onRound={round => { selectWaveRound(round); setTab('waves'); }} />}
        {tab === 'waves' && <WaveDetails report={report} round={waveRound} onRound={selectWaveRound} onPreview={showPreview} />}
        {tab === 'boss' && lastLocal && <button type="button" className="d-button d-small"
          onClick={() => openRecord(lastLocal.key, 'boss')}>查看最近本地对局</button>}
        {tab === 'boss' && <BossDamage report={report} number={bossNumber} onRound={selectBossRound} reference={leader &&
          <div className="d-report-leader"><strong>{leader.name}</strong><button className="d-button d-small" type="button"
            onClick={() => { setLeaderKey(key); setLeaderImage(null); }}>领袖属性与站位</button></div>} onPreview={showPreview} />}
        {tab === 'preview' && <SpawnPreview key={key} report={report} filter={previewRound}
          onSelect={round => setPreviewFilter({ key, round })} />}
        {tab === 'history' && <>
          <div className="d-report-history-actions">
            <label className="d-button d-primary d-report-import"><FileUp size={15} />导入 JSON
              <input aria-label="导入 JSON 战报" type="file" accept=".json,application/json" disabled={busy}
                onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importReport(file); }} />
            </label>
          </div>
          <ReportHistory records={(records.live ? [records.live, ...records.history] : records.history)
            .slice().sort((a, b) => b.seenAt - a.seenAt)} liveKey={records.live?.key} onOpen={openRecord} />
        </>}
      </div>
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
