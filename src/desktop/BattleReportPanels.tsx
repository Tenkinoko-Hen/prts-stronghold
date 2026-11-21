import { useState, type ReactNode } from 'react';
import { ScanFace } from 'lucide-react';
import { REPORT_ROUNDS, REPORT_SEATS, roundMetrics, waveOwner, type BattleReport, type BattleRound } from './battleReportData';
import portraits from './enemyPortraits.json';

const PHASES: Record<string, string> = {
  loading: '载入', special_prep: '特殊准备', prep: '准备', self: '防守', assist: '协防', boss: 'Boss 战',
  settle: '结算', end: '结束', pause: '暂停', battle_wait: '等待战斗', boss_wait: '等待 Boss 战',
};
const metrics = ['漏怪', '协防', '本回合扣血', '漏怪战力'];
const numbers = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
type Metric = ReturnType<typeof roundMetrics>[number];

export const formatReportNumber = (value: number | null | undefined) => value == null ? '—' : numbers.format(value);
const batchName = (value: number | null) => value === null ? '未定位' : value < 0 ? '额外出怪' : `第 ${value + 1} 批`;
const slots = new Map(portraits.ids.map((id, index) => [id, index]));
const atlasRows = Math.ceil(portraits.ids.length / portraits.columns);

function EnemyLabel({ id, name }: { id?: string; name?: string }) {
  if (!name) return <>—</>;
  const index = id ? slots.get(id) : undefined;
  return <span className="d-report-enemy" title={id}>{index === undefined
    ? <span className="d-report-no-portrait" title="暂无头像"><ScanFace size={18} aria-hidden="true" /></span>
    : <span className="d-report-portrait" aria-hidden="true" style={{
      backgroundSize: `${portraits.columns * 100}% ${atlasRows * 100}%`,
      backgroundPosition: `${(index % portraits.columns) * 100 / (portraits.columns - 1)}% ${Math.floor(index / portraits.columns) * 100 / (atlasRows - 1)}%`,
    }} />}{name}</span>;
}

export function reportPhase(data?: BattleRound) {
  if (data?.allPlayersLeaked) return '全员漏怪';
  if (data && ['settle', 'end', 'boss'].includes(data.phase)) return PHASES[data.phase];
  if (data?.assistsStatus === 'reported') return '协防已结算';
  if (data && data.phase !== 'assist' && (data.unassignedSelfLeaks !== null || data.leaksStatus === 'observed')) return '本路已结算';
  if (data && Object.hasOwn(PHASES, data.phase)) return PHASES[data.phase];
  return '—';
}

function seatName(seat: number, report?: BattleReport) {
  return <span className={`d-report-seat d-report-seat-${seat}`} title={report?.names[seat]}>
    {seat}号{report?.self === seat ? ' · 我' : ''}
  </span>;
}

const selfLeaks = (row: BattleRound, report: BattleReport) =>
  row.unassignedSelfLeaks ?? (report.self ? row.leaks[report.self] : undefined);

function metricText(metric: Metric, power = false) {
  if (!metric) return '—';
  const value = power && metric.value >= 10000 ? `${compact.format(metric.value / 10000)}万` : formatReportNumber(metric.value);
  return metric.quality === 'minimum' ? `≥${value}` : metric.quality === 'estimated' ? `≈${value}` : `${value}${metric.quality ? '*' : ''}`;
}

function sumMetrics(values: Metric[]) {
  const known = values.filter(value => value !== undefined);
  if (!known.length) return undefined;
  return {
    value: known.reduce((sum, metric) => sum + metric.value, 0),
    quality: known.some(metric => metric.quality === 'minimum') ? 'minimum'
      : known.some(metric => metric.quality) || known.length < values.length ? 'partial' : undefined,
  } satisfies Metric;
}

export function RoundMatrix({ report, active, onRound }: {
  report?: BattleReport; active?: number; onRound(round: number): void;
}) {
  const [view, setView] = useState<'summary' | 'seats' | null>(null);
  if (!report?.rounds.length) return <p className="d-muted d-report-note">{report?.preview.length
    ? `已收到 ${report.preview.length} 条预告，尚无实战回合。` : '暂无回合记录。'}</p>;
  const sparse = report.rounds.every(row => (!row.phase || row.phase === 'other') && !Object.keys(row.hpCosts).length
    && !row.rows.some(wave => wave.seat !== null && wave.planned !== null) && !Object.keys(row.bossDamage).length);
  const summary = (view ?? (sparse ? 'summary' : 'seats')) === 'summary';
  const controls = <div className="d-report-view-switch" role="group" aria-label="回合记录布局">
    <button className="d-button d-small" type="button" aria-pressed={summary} onClick={() => setView('summary')}>结算概览</button>
    <button className="d-button d-small" type="button" aria-pressed={!summary} onClick={() => setView('seats')}>四席明细</button>
  </div>;
  const local = report.rounds.flatMap(row => selfLeaks(row, report) ?? []);
  if (summary) return <>
    <div className="d-section-head d-report-subhead"><h2>已记录 {report.rounds.length} 个回合</h2>{controls}</div>
    <div className="d-report-summary"><span>本路已记录漏怪 <strong>{local.length ? formatReportNumber(local.reduce((a, b) => a + b, 0)) : '—'}</strong></span>
      <span>{report.self ? `本路 ${report.self} 号` : '本路席位待确认'}</span></div>
    <div className="d-report-table d-report-compact" tabIndex={0} aria-label="逐回合结算概览"><table>
      <thead><tr><th scope="col">回合</th><th scope="col">最近记录</th><th scope="col">本路漏怪</th>
        {REPORT_SEATS.map(seat => <th key={seat} scope="col">{seatName(seat, report)} 协防</th>)}</tr></thead>
      <tbody>{report.rounds.slice().reverse().map(row => <tr key={row.number} data-current={row.number === active}>
        <th scope="row"><button type="button" className="d-report-round-link" onClick={() => onRound(row.number)}
          aria-label={`查看 R${row.number} 漏怪战力`}>R{row.number}</button></th>
        <td>{reportPhase(row)}</td><td className="d-report-own-leaks">{formatReportNumber(selfLeaks(row, report))}</td>
        {REPORT_SEATS.map(seat => <td key={seat}>{metricText(roundMetrics(row, seat)[1])}</td>)}
      </tr>)}</tbody>
    </table></div>
    <p className="d-muted d-report-legend">— 未记录 · * 部分记录</p>
  </>;
  const recorded = new Map(report?.rounds.map(row => [row.number, row]));
  const rows = REPORT_ROUNDS.map(number => {
    const data = recorded.get(number);
    const seats = REPORT_SEATS.map(seat => roundMetrics(data, seat));
    return { number, data, cells: metrics.flatMap((_, index) => seats.map(seat => seat[index])) };
  });
  return <>
    <div className="d-section-head d-report-subhead"><h2>四席回合记录</h2>{controls}</div>
    <div className="d-report-table d-report-matrix" tabIndex={0} aria-label="逐回合数据表">
      <table>
        <thead>
          <tr><th rowSpan={2} scope="col">回合</th><th rowSpan={2} scope="col">阶段</th>
            {metrics.map((name, index) => <th className="d-report-metric-group" data-metric={index} key={name} colSpan={4} scope="colgroup">{name}</th>)}
          </tr>
          <tr>{metrics.map(name => REPORT_SEATS.map(seat => <th key={`${name}-${seat}`} scope="col">{seatName(seat, report)}</th>))}</tr>
        </thead>
        <tbody>{rows.map(({ number, data, cells }) => <tr key={number} data-current={number === active} data-recorded={Boolean(data)}>
          <th scope="row">{data
            ? <button className="d-report-round-link" type="button" onClick={() => onRound(number)} aria-label={`查看 R${number} 漏怪战力`}>R{number}</button>
            : `R${number}`}</th>
          <td>{reportPhase(data)}{data && data.unassignedSelfLeaks !== null &&
            <small style={{ display: 'block' }}>本路漏怪 {data.unassignedSelfLeaks} · 席位待确认</small>}</td>
          {cells.map((cell, i) => {
            const eliminatedAt = (report?.eliminated[REPORT_SEATS[i % 4]] ?? Infinity);
            const missing = !cell && data && eliminatedAt < number ? '阵亡' : null;
            return <td key={i} data-quality={cell?.quality} data-known={Boolean(cell)} title={cell && i >= 12 ? formatReportNumber(cell.value) : undefined}>
              {missing ?? metricText(cell, i >= 12)}
            </td>;
          })}
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">合计</th><td>{recorded.size ? `${recorded.size} 回合` : '—'}</td>
          {rows[0].cells.map((_, i) => <td key={i}>{metricText(sumMetrics(rows.filter(row => row.data).map(row => row.cells[i])), i >= 12)}</td>)}
        </tr></tfoot>
      </table>
    </div>
    <p className="d-muted d-report-legend">— 缺少数据 · * 部分记录 · ≈ 按扣血估算 · ≥ 已知下限</p>
  </>;
}

function RoundPreviewLink({ report, number, open }: { report?: BattleReport; number: number; open(round: number): void }) {
  const count = report?.preview.filter(row => row.round === number && row.kind === 'plan').length;
  return count ? <button type="button" className="d-button d-small" onClick={() => open(number)}>查看 R{number} 出怪预告 · {count} 条</button> : null;
}

export function WaveDetails({ report, active, onRound, following, onFollow, onPreview }: {
  report?: BattleReport; active?: BattleRound; onRound(round: number): void; following: boolean; onFollow(): void;
  onPreview(round: number): void;
}) {
  if (!active) return <p className="d-muted d-report-note">暂无回合记录。</p>;
  const assistStatus = { reported: '协防已结算', observed: '部分协防记录', skipped: '本回合跳过协防' }[active.assistsStatus];
  const waves = active.rows.filter(wave => wave.seat !== null || wave.leaked !== null);
  return <>
    <div className="d-section-head">
      <h2>R{active.number} · {reportPhase(active)}</h2>
      <div className="d-inline">
        {!following && <button className="d-button d-small" type="button" onClick={onFollow}>跟随当前回合</button>}
        <select className="d-button d-small" aria-label="漏怪战力回合" value={active.number} onChange={event => onRound(Number(event.target.value))}>
          {report?.rounds.map(row => <option key={row.number} value={row.number}>R{row.number}</option>)}
        </select>
      </div>
    </div>
    {active.unassignedSelfLeaks !== null && <p className="d-muted d-report-note">
      本路结算：漏怪 {active.unassignedSelfLeaks}。席位确认后会计入对应玩家。
    </p>}
    <div className="d-report-seat-cards">
      {REPORT_SEATS.map(seat => <div key={seat}>{seatName(seat, report)}
        <strong>{metricText(roundMetrics(active, seat)[3], true)}</strong>
        <small>漏怪 {metricText(roundMetrics(active, seat)[0])} · 最近血量 {formatReportNumber(report?.hp[seat])}</small>
      </div>)}
    </div>
    {waves.length ? <div className="d-report-table"><table>
      <thead><tr>{['归属', '批次', '敌人', '计划', '漏怪', '单体战力', '漏怪战力'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{waves.flatMap((wave, i) => (wave.enemies.length ? wave.enemies : [undefined]).map((enemy, j) => <tr key={`${i}-${j}`}>
        {j === 0 && <><th rowSpan={Math.max(1, wave.enemies.length)} scope="row">{waveOwner(wave.seat, active.bossGroups)}</th>
          <td rowSpan={Math.max(1, wave.enemies.length)}>{batchName(wave.action)}</td></>}
        <td><EnemyLabel id={enemy?.id} name={enemy?.name} /></td>
        <td>{formatReportNumber(enemy?.count ?? (enemy ? null : wave.planned))}</td>
        <td>{formatReportNumber(enemy?.leaked ?? (enemy ? null : wave.leaked))}</td>
        <td>{formatReportNumber(enemy?.power)}</td>
        {j === 0 && <td rowSpan={Math.max(1, wave.enemies.length)}>
          {wave.unpriced > 0 ? wave.power ? `≥${formatReportNumber(wave.power)}` : '—' : formatReportNumber(wave.power)}
        </td>}
      </tr>))}</tbody>
    </table></div> : <div className="d-report-empty"><span>R{active.number} 暂无战斗编排。</span>
      <RoundPreviewLink report={report} number={active.number} open={onPreview} /></div>}
    {(assistStatus || active.assistPairs.length > 0) && <section>
      <div className="d-section-head"><h3>协防击杀</h3><span className="d-muted">{assistStatus}
        {active.unattributedAssists > 0 ? ` · 未归属击杀 ${active.unattributedAssists}` : ''}</span></div>
      <div className="d-report-table"><table>
        <thead><tr><th scope="col">击杀者 ＼ 敌人归属</th>{REPORT_SEATS.map(seat => <th key={seat} scope="col">{seatName(seat, report)}</th>)}</tr></thead>
        <tbody>{REPORT_SEATS.map(killer => <tr key={killer}><th scope="row">{seatName(killer, report)}</th>
          {REPORT_SEATS.map(owner => {
            const pairs = active.assistPairs.filter(pair => pair.killer === killer && pair.owner === owner);
            const skipped = active.assistsStatus === 'skipped' && active.assists[killer] === 0 && active.assists[owner] === 0;
            return <td key={owner}>{pairs.length || skipped ? formatReportNumber(pairs.reduce((sum, pair) => sum + pair.count, 0)) : '—'}</td>;
          })}</tr>)}</tbody>
      </table></div>
    </section>}
  </>;
}

const bossSourceLabels: Record<number, string> = { 0: '未知', 1: '干员', 2: '法术／陷阱', 3: '无攻击实例' };

export function BossDamage({ report, number, onRound, reference, onPreview }: {
  report?: BattleReport; number: 14 | 15; onRound(round: number): void; reference: ReactNode; onPreview(round: number): void;
}) {
  const data = report?.rounds.find(row => row.number === number);
  const hasBreakdown = data && (data.bossUplinkRows.length > 0 || data.bossOfficial.length > 0
    || Object.keys(data.bossUplink).length > 0);
  return <>
    {report?.rounds.some(row => row.number >= 14 && (Object.keys(row.bossPercent).length || Object.keys(row.bossDamage).length))
      && <div className="d-report-table"><table>
      <thead><tr><th scope="col">座位</th><th scope="col">R14 · 贡献 / 伤害</th><th scope="col">R15 · 贡献 / 伤害</th></tr></thead>
      <tbody>{REPORT_SEATS.map(seat => <tr key={seat}><th scope="row">{seatName(seat, report)}</th>
        {([14, 15] as const).map(round => {
          const row = report?.rounds.find(item => item.number === round);
          const percent = row?.bossPercent[seat], damage = row?.bossDamage[seat];
          return <td key={round}>{percent !== undefined ? `${formatReportNumber(percent)}%${damage !== undefined ? ` · ${formatReportNumber(damage)}` : ''}` : formatReportNumber(damage)}</td>;
        })}
      </tr>)}</tbody>
    </table></div>}
    <div className="d-section-head">
      <h2>Boss 明细</h2>
      <div className="d-inline">
        {([14, 15] as const).map(round => <button type="button" className="d-button d-small" key={round}
          aria-pressed={number === round} onClick={() => onRound(round)}>R{round}</button>)}
      </div>
    </div>
    {reference}
    {!hasBreakdown && !Object.keys(data?.bossPercent ?? {}).length && !Object.keys(data?.bossDamage ?? {}).length && data?.bossHp == null
      ? <div className="d-report-empty"><span>R{number} 暂无 Boss 战记录。</span>
        <RoundPreviewLink report={report} number={number} open={onPreview} /></div> : data && <>
      <p className="d-muted">Boss 血量 {formatReportNumber(data.bossHp)} · {
        data.bossStatus === 'settlement' ? '已结算' : data.bossStatus === 'reported' ? '已记录伤害'
          : hasBreakdown ? '累计伤害未确认' : '尚无伤害记录'
      }</p>
      {hasBreakdown && <div className="d-report-table"><table>
        <thead><tr>{['来源', '座位', '攻击编号', '类型', '伤害'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {REPORT_SEATS.filter(seat => data.bossUplink[seat] !== undefined).map(seat => <tr key={`sum-${seat}`}>
            <th scope="row">本端上报合计</th><td>{seatName(seat, report)}</td><td>—</td><td>—</td><td>{formatReportNumber(data.bossUplink[seat])}</td>
          </tr>)}
          {[...data.bossOfficial, ...data.bossUplinkRows].map((hit, i) => <tr key={i}>
            <th scope="row">{i < data.bossOfficial.length ? '官方榜单' : '本端上报'}</th>
            <td>{seatName(hit.seat, report)}</td><td>{hit.identifier}</td>
            <td>{hit.source === null ? '—' : bossSourceLabels[hit.source] ?? '未知'}</td><td>{formatReportNumber(hit.damage)}</td>
          </tr>)}
        </tbody>
      </table></div>}
    </>}
  </>;
}

export function SpawnPreview({ report, round, query, onRound, onQuery }: {
  report?: BattleReport; round: string; query: string; onRound(round: string): void; onQuery(query: string): void;
}) {
  const [kind, setKind] = useState<'plan' | 'battle' | null>(null);
  const plans = report?.preview.some(row => row.kind === 'plan');
  const hasBattle = report?.preview.some(row => row.kind === 'battle');
  const currentKind = kind ?? (!plans && hasBattle ? 'battle' : 'plan');
  const battle = currentKind === 'battle';
  const keyword = query.trim().toLowerCase();
  const rows = report?.preview.filter(item => item.kind === currentKind && (!round || item.round === Number(round))
    && (!keyword || item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword))) ?? [];
  return <>
    <div className="d-report-filters">
      <div className="d-report-view-switch" role="group" aria-label="出怪记录来源">
        <button className="d-button d-small" type="button" aria-pressed={!battle} onClick={() => setKind('plan')}>对局预告</button>
        <button className="d-button d-small" type="button" aria-pressed={battle} onClick={() => setKind('battle')}>战斗编排</button>
      </div>
      <select className="d-button d-small" aria-label="出怪预告回合" value={round} onChange={event => onRound(event.target.value)}>
        <option value="">全部回合</option>{REPORT_ROUNDS.map(number => <option key={number} value={number}>R{number}</option>)}
      </select>
      <input aria-label="搜索敌人" type="search" placeholder="搜索敌人名称或编号" value={query} onChange={event => onQuery(event.target.value)} />
      <span className="d-muted">{rows.length} 条</span>
    </div>
    {rows.length ? <div className="d-report-table d-report-scroll-table" tabIndex={0} aria-label="敌人预告明细"><table>
      <thead><tr>{['回合', '归属', '批次', '敌人', '数量', '单体战力', '来源'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map((enemy, i) => <tr key={i}><th scope="row">R{enemy.round}</th><td>{enemy.owner}</td>
        <td>{enemy.source === 'Boss 预告' ? '—' : batchName(enemy.action)}</td><td><EnemyLabel id={enemy.id} name={enemy.name} /></td>
        <td>{formatReportNumber(enemy.count)}</td><td>{formatReportNumber(enemy.power)}</td>
        <td>{enemy.source}{enemy.seenRound === 0 ? ' · 载入' : enemy.seenRound === null ? '' : ` · R${enemy.seenRound}`}</td>
      </tr>)}</tbody>
    </table></div> : <p className="d-muted d-report-note">{battle && !hasBattle ? '暂无战斗编排。' : !battle && !plans ? '暂无出怪预告。' : '没有匹配的敌人。'}</p>}
  </>;
}

export type ReportRecord = { key: string; label: string; report: BattleReport; seenAt: number; source: 'live' | 'file' };
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

export function ReportHistory({ records, liveKey, onOpen }: {
  records: ReportRecord[]; liveKey?: string; onOpen(key: string): void;
}) {
  if (!records.length) return <p className="d-muted d-report-note">暂无记录。实时对局和导入的 JSON 会列在这里。</p>;
  return <>
    <div className="d-report-table"><table>
      <thead>
        <tr><th scope="col" rowSpan={2}>对局</th><th scope="col" rowSpan={2}>记录时间</th><th scope="col" rowSpan={2}>难度</th>
          <th scope="col" rowSpan={2}>进度</th><th scope="col" rowSpan={2}>本路漏怪</th><th scope="colgroup" colSpan={4}>漏怪合计</th><th scope="col" rowSpan={2}>操作</th></tr>
        <tr>{REPORT_SEATS.map(seat => <th scope="col" key={seat}>{seat}号</th>)}</tr>
      </thead>
      <tbody>{records.map(entry => {
        const last = entry.report.rounds.at(-1);
        return <tr key={entry.key}>
          <th scope="row" title={entry.label}>{entry.label}{entry.key === liveKey ? ' · 最新' : ''}</th>
          <td>{dateTime.format(entry.seenAt)}</td><td>{entry.report.difficulty || '—'}</td>
          <td>{last ? `R${last.number} · ${reportPhase(last)}` : '—'}</td>
          <td>{metricText(sumMetrics(entry.report.rounds.map(row => {
            const value = selfLeaks(row, entry.report);
            return value === undefined ? undefined : { value };
          })))}</td>
          {REPORT_SEATS.map(seat => <td key={seat}>{metricText(sumMetrics(entry.report.rounds.map(row => roundMetrics(row, seat)[0])))}</td>)}
          <td><button className="d-button d-small" type="button" onClick={() => onOpen(entry.key)}>查看</button></td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="d-muted d-report-legend">当前运行期间的对局与导入记录</p>
  </>;
}
