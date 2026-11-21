import { useEffect, useRef, useState } from 'react';
import { Activity, FileUp, Shield, Square } from 'lucide-react';
import { BossRoutes } from '../components/BossRoutes';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { DesktopDialog } from './DesktopDialog';
import { readBattleReport, reportLeader } from './battleReportData';
import { BossDamage, ReportHistory, RoundMatrix, SpawnPreview, WaveDetails, type ReportRecord } from './BattleReportPanels';
import type { BattleReportsBridge, ReportFeed, ReportStatus } from './battleReports';
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
  failed: '本地战报组件未启动，请重试或导入 JSON 战报。',
};
const maxReportBytes = 8 * 1024 * 1024;
const MAX_HISTORY = 20;
const TABS = { rounds: '回合记录', waves: '漏怪战力', boss: 'Boss 伤害', preview: '出怪预告', history: '历史对局' } as const;
type Tab = keyof typeof TABS;

export default function BattleReportsView({ api, visible }: { api: BattleReportsBridge; visible: boolean }) {
  const [records, setRecords] = useState<{ live?: ReportRecord; history: ReportRecord[] }>({ history: [] });
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('rounds');
  const [previewRound, setPreviewRound] = useState('');
  const [enemyQuery, setEnemyQuery] = useState('');
  const [status, setStatus] = useState<ReportStatus>('starting');
  const [selection, setSelection] = useState<{ key: string; round: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaderKey, setLeaderKey] = useState('');
  const [leaderImage, setLeaderImage] = useState<{ url: string; title: string } | null>(null);
  const nextImport = useRef(0);

  useEffect(() => {
    let changed = false;
    let mounted = true;
    let latest: unknown;
    const accept = (feed: ReportFeed) => {
      setStatus(feed.status);
      if (!feed.report) {
        latest = null;
        setRecords(previous => previous.live
          ? { history: [previous.live, ...previous.history].slice(0, MAX_HISTORY) } : previous);
        return;
      }
      if (latest === feed.report) return;
      latest = feed.report;
      try {
        const report = readBattleReport(feed.report);
        const key = `${feed.reportRun}:${report.match ?? 'unknown'}`;
        const seenAt = Date.now();
        setRecords(({ live, history }) => {
          const previous = live?.key === key ? live : history.find(entry => entry.key === key);
          return {
            live: { key, report, label: report.match === null ? '本地实况' : `本地对局 ${report.match}`,
              seenAt: previous?.seenAt ?? seenAt, source: 'live' },
            history: live && live.key !== key
              ? [live, ...history.filter(entry => entry.key !== key)].slice(0, MAX_HISTORY) : history,
          };
        });
      } catch { setStatus('incompatible'); }
    };
    const remove = api.onState(feed => { changed = true; accept(feed); });
    void api.getState().then(feed => { if (mounted && !changed) accept(feed); }).catch(() => {
      if (mounted && !changed) setStatus('failed');
    });
    return () => { mounted = false; remove(); };
  }, [api]);

  const recording = ['starting', 'waiting', 'connecting', 'listening'].includes(status);
  const setEnabled = async () => {
    setBusy(true);
    try { await api.setEnabled(!recording); setError(''); }
    catch { setError('无法切换本地采集，请重试。'); }
    finally { setBusy(false); }
  };
  const importReport = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > maxReportBytes) throw new Error('JSON 战报不能超过 8 MB。');
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); }
      catch { throw new Error('无法读取 JSON 战报；请选 ArkLogs 的 .json 文件。'); }
      const entry: ReportRecord = { key: `file:${++nextImport.current}`, label: file.name, report: readBattleReport(raw),
        seenAt: file.lastModified || Date.now(), source: 'file' };
      setRecords(previous => ({ ...previous, history: [entry, ...previous.history].slice(0, MAX_HISTORY) }));
      setOpenedKey(entry.key);
      setTab('rounds');
      setSelection(null);
      setLeaderKey('');
      setPreviewRound('');
      setEnemyQuery('');
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法导入战报。'); }
    finally { setBusy(false); }
  };

  const opened = openedKey === records.live?.key ? records.live : records.history.find(entry => entry.key === openedKey);
  const entry = opened ?? records.live;
  const report = entry?.report;
  const key = entry?.key ?? '';
  const selectedRound = selection?.key === key ? selection.round : null;
  const selected = report?.rounds.find(item => item.number === selectedRound);
  const lastRecorded = report?.rounds.at(-1);
  const latestRound = Math.max(report?.current ?? 0, lastRecorded?.number ?? 0) || undefined;
  const active = selected ?? lastRecorded;
  const bossNumber = selectedRound === 14 || selectedRound === 15 ? selectedRound
    : (selected?.number ?? latestRound) === 15 ? 15 : 14;
  const leader = tab === 'boss' && report && reportLeader(report, bossNumber);
  const highDifficulty = ['mode_multi_hard', 'mode_multi_abyss'].includes(report?.mode ?? '') ? true
    : ['mode_multi_funny', 'mode_multi_normal'].includes(report?.mode ?? '') ? false : undefined;
  const selectRound = (round: number) => { setSelection({ key, round }); setLeaderKey(''); };
  const showPreview = (number: number) => { setPreviewRound(String(number)); setEnemyQuery(''); setTab('preview'); };
  const openRecord = (key: string | null) => {
    setOpenedKey(key);
    setSelection(null);
    setLeaderKey('');
    setPreviewRound('');
    setEnemyQuery('');
    setTab('rounds');
  };
  if (!visible) return null;
  return <main className="desktop-page d-report-page">
    <section className="d-panel d-report-shell" aria-label="本地战报">
      <header className="d-section-head d-report-head">
        <div><div className="d-report-kicker">PRTS / BATTLE LOG</div><h1><Activity size={18} />战报</h1></div>
        <div className="d-inline">
          <button className="d-button d-small" type="button" onClick={() => void api.showDiagnostics().catch(() => setError('无法打开采集诊断。'))}>采集诊断</button>
          <button className="d-button" disabled={busy || status === 'permission'} onClick={() => void setEnabled()}>
            {recording ? <Square size={14} /> : <Activity size={14} />}{recording ? '暂停采集' : '启用采集'}
          </button>
          <label className="d-button d-primary d-report-import"><FileUp size={15} />导入 JSON
            <input aria-label="导入 JSON 战报" type="file" accept=".json,application/json" disabled={busy}
              onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importReport(file); }} />
          </label>
        </div>
      </header>
      <div className="d-report-meta">
        <div className="d-report-status" role="status"><Shield size={14} /><span>{STATUS[status]}</span></div>
        {entry && <span title={entry.label} className="d-report-record-title">{entry.label}</span>}
        {report && <>{report.difficulty && <span>难度 <strong>{report.difficulty}</strong></span>}
          <strong className="d-report-progress">{!latestRound ? '等待回合'
            : report.current === latestRound ? `当前 R${latestRound}` : `最近记录 R${latestRound} · 阶段待确认`}</strong></>}
        {opened && opened.key !== records.live?.key && <button className="d-button d-small" type="button" onClick={() => openRecord(null)}>返回实时战报</button>}
      </div>
      {error && <p role="alert" className="d-warning d-report-error">{error}</p>}
      <nav className="d-report-tabs" aria-label="战报视图">
        {(Object.keys(TABS) as Tab[]).map(name => <button key={name} className="d-button d-small" type="button"
          aria-pressed={tab === name} onClick={() => { setTab(name); setLeaderKey(''); }}>{TABS[name]}</button>)}
      </nav>
      <div className="d-report-body">
        {tab === 'rounds' && <RoundMatrix key={key} report={report} active={latestRound}
          onRound={round => { selectRound(round); setTab('waves'); }} />}
        {tab === 'waves' && <WaveDetails report={report} active={active} onRound={selectRound} following={!selected}
          onFollow={() => setSelection(null)} onPreview={showPreview} />}
        {tab === 'boss' && <BossDamage report={report} number={bossNumber} onRound={selectRound} reference={leader &&
          <div className="d-report-leader"><strong>{leader.name}</strong><button className="d-button d-small" type="button"
            onClick={() => { setLeaderKey(key); setLeaderImage(null); }}>领袖属性与站位</button></div>} onPreview={showPreview} />}
        {tab === 'preview' && <SpawnPreview key={key} report={report} round={previewRound} query={enemyQuery}
          onRound={setPreviewRound} onQuery={setEnemyQuery} />}
        {tab === 'history' && <ReportHistory records={(records.live ? [records.live, ...records.history] : records.history)
          .slice().sort((a, b) => b.seenAt - a.seenAt)} liveKey={records.live?.key} onOpen={openRecord} />}
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
