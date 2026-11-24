import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Info, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { REPORT_SEATS, confirmedCurrent, groupEnemyOutcomes, roundMetrics, visibleSpawnRows, waveOwner, type BattleReport,
  type BattleRound, type EnemyOutcome, type ReportRoundFilter } from './battleReportData';
import { laneKinds, laneLeaks, metricText, roundDisplayEnemies, roundOutcome, roundTeamKinds, sumMetrics, type LaneMetric } from './battleRoundOutcome';
import { reportPhase, seatDisplayText, seatName } from './BattleReportPanels';
import { batchName, EnemyLabel, SpawnRounds } from './BattleReportSpawns';

const icons = { clean: ShieldCheck, assisting: Clock3, covered: CheckCheck, partial: ShieldAlert, breached: ShieldOff, unknown: CircleHelp };
function OutcomeLabel({ tone, label, note }: ReturnType<typeof roundOutcome>) {
  const Icon = icons[tone];
  return <span className="d-round-outcome" data-tone={tone} title={note}><Icon size={15} aria-hidden="true" />{label}</span>;
}

function LeakValue({ metric }: { metric: LaneMetric }) {
  if (metric?.value === 0 && metric.quality !== 'minimum') return <b data-tone="clean">无漏</b>;
  return <b data-tone={metric?.value ? 'breached' : 'unknown'}>{metricText(metric)}{metric && ' 只'}</b>;
}

function EnemyResult({ enemies, metric, pending }: { enemies: EnemyOutcome[]; metric: LaneMetric; pending?: boolean }) {
  if (!metric?.value) return <span className="d-muted">—</span>;
  // 残缺导入中的怪种合计可能超过已确认总数；这时只保留总数。
  const typed = enemies.reduce((n, enemy) => n + enemy.count, 0);
  const kinds = typed <= metric.value ? enemies : [];
  const missing = kinds.length ? metric.value - typed : metric.value;
  return <span className="d-enemy-result">{kinds.map(enemy => <EnemyLabel key={enemy.id} {...enemy} />)}
    {missing > 0 && <span className="d-missing-kinds">{pending
      ? `本路已漏 ${metricText(metric)} 只 · 协防结算后自动刷新怪种`
      : `${kinds.length ? '另有 ' : ''}${metric.quality === 'minimum' ? '≥' : ''}${missing} 只未记录怪种`}</span>}
  </span>;
}

function AssistLinks({ rows, report, seat }: { rows: BattleRound[]; report: BattleReport; seat: number | null }) {
  const pairs = new Map<string, BattleRound['assistPairs'][number]>();
  const pairEnemies = new Map<string, EnemyOutcome[]>();
  let unmatched = 0;
  for (const row of rows) {
    unmatched += row.unattributedAssists;
    for (const pair of row.assistPairs) {
      const key = `${pair.killer}:${pair.owner}`;
      pairs.set(key, { ...pair, count: (pairs.get(key)?.count ?? 0) + pair.count });
    }
    for (const enemy of row.assistEnemies) {
      const key = `${enemy.killer}:${enemy.owner}`;
      pairEnemies.set(key, [...(pairEnemies.get(key) ?? []), enemy]);
    }
  }
  const links = [...pairs.values()];
  return <>{[true, false].map(mine => {
    const group = links.filter(pair => (pair.killer === seat || pair.owner === seat) === mine);
    if (!group.length) return null;
    return <section key={String(mine)} className="d-assist-group" data-mine={mine}>
      <h3>{mine ? '与我相关' : seat === null ? '已确认的协防' : '队友间兜底'}</h3>
      <ul>{group.map(({ killer, owner, count }) => {
        const kinds = groupEnemyOutcomes(pairEnemies.get(`${killer}:${owner}`) ?? []);
        const validKinds = kinds.reduce((s, e) => s + e.count, 0) <= count ? kinds : [];
        return <li key={`${killer}:${owner}`}>
          {seatName(killer, report, seat)}<ArrowRight size={13} aria-label="协防" />{seatName(owner, report, seat)}
          <span>{killer === owner ? '自补' : '兜底'} <b>{count} 只</b></span>
          {validKinds.length > 0 && <span className="d-enemy-result">{validKinds.map(enemy => <EnemyLabel key={enemy.id} {...enemy} />)}</span>}
        </li>;
      })}</ul>
    </section>;
  })}
    {unmatched > 0 && <p className="d-muted">{unmatched} 只协防击杀，未能确认漏怪者</p>}
    {links.length > 0 && rows.some(row => row.assistsStatus === 'observed') && <small className="d-muted">仅列已记录的协防</small>}
  </>;
}

function WaveTable({ row, report, seat }: { row: BattleRound; report: BattleReport; seat: number | null }) {
  const waves = row.rows.filter(wave => wave.seat !== null || wave.leaked !== null);
  if (!waves.length) return null;
  return <details className="d-round-fold"><summary>实战编排</summary><div className="d-report-table"><table>
    <thead><tr>{[row.bossGroups ? '战区' : '玩家', '批次', '敌人', '计划', '漏怪'].map(label => <th key={label}>{label}</th>)}</tr></thead>
    <tbody>{waves.flatMap((wave, i) => (wave.enemies.length ? wave.enemies : [undefined]).map((enemy, j) => <tr key={`${i}-${j}`}>
      {j === 0 && <><th rowSpan={Math.max(1, wave.enemies.length)}>{wave.seat !== null && !row.bossGroups
        ? seatName(wave.seat, report, seat) : waveOwner(wave.seat, row.bossGroups)}</th>
        <td rowSpan={Math.max(1, wave.enemies.length)}>{batchName(wave.action)}</td></>}
      <td><EnemyLabel id={enemy?.id} name={enemy?.name} /></td>
      <td>{(enemy ? enemy.count : wave.planned) ?? '—'}</td><td>{(enemy ? enemy.leaked : wave.leaked) ?? '—'}</td>
    </tr>))}</tbody>
  </table></div></details>;
}

export function WaveDetails({ report, round, seat = report.self, live = false }: {
  report: BattleReport; round: ReportRoundFilter; seat?: number | null; live?: boolean;
}) {
  const active = report.rounds.find(row => row.number === round);
  const rows = round === 'all' ? report.rounds : active ? [active] : [];
  if (!rows.length) return <p className="d-muted">{round === 'all' ? '暂无回合记录。' : `R${round} 暂无实战记录。`}</p>;
  const total = (values: LaneMetric[]) => active ? values[0] : sumMetrics(values);
  const leaks = total(rows.map(row => laneLeaks(row, report, seat)));
  const outcome = active && roundOutcome(active, report, seat, live);
  const covered = rows.flatMap(row => row.assistPairs.filter(pair => pair.owner === seat && pair.killer !== seat)).reduce((n, pair) => n + pair.count, 0);
  const hpCost = seat === null ? undefined : active?.hpCosts[seat];
  const uncoveredOwn = seat === null ? 0 : rows.reduce((n, row) => n + (row.uncoveredLeaks[seat] ?? 0), 0);
  const uncoveredOwnKinds = seat === null ? [] : groupEnemyOutcomes(rows.flatMap(row => row.uncoveredEnemies.filter(e => e.owner === seat)));
  const teammateKinds = groupEnemyOutcomes(rows.flatMap(row => roundTeamKinds(row, report, seat)));
  const preview = active ? visibleSpawnRows(report, 'plan', String(active.number), '') : [];
  const hasCombatDetail = Boolean(leaks?.value || covered > 0 || teammateKinds.length > 0
    || rows.some(row => row.assistPairs.length > 0 || row.unattributedAssists > 0));
  return <section className="d-wave-detail" aria-label={active ? `R${active.number} 回合详情` : '全部回合累计'}>
    <header className="d-report-heading"><h2>{active ? <><b>R{active.number}</b> 回合详情</> : '全部回合累计'}</h2>
      <details className="d-metric-key"><summary><Info size={13} />口径说明</summary>
        <div>— 未记录 · ≈ 估算 · ≥ 已知下限<br />漏怪按进入协防前计数，协防按帮助其他席位计数。
          {report.selfManual && <><br />本机席位：{seatDisplayText(report.self!, report)} · 手动确认</>}
          {report.selfBySettlement && <><br />本机席位：{seatDisplayText(report.self!, report)} · 结算关联</>}
          {seat === null && <><br />席位未确认，仅显示采到的本机漏怪。</>}</div>
      </details>
    </header>
    <div className="d-detail-focus" data-tone={outcome?.tone ?? 'unknown'}>
      <div className="d-detail-summary">
        {outcome && <><OutcomeLabel {...outcome} /><span>{outcome.note}</span></>}
        {active ? <small>{reportPhase(active)}</small> : <span>{rows.length} 个回合 · 已知数据合计</span>}
      </div>
      <div className="d-detail-numbers">
        <span>本路漏怪 <strong>{leaks ? `${metricText(leaks)} 只` : '—'}</strong></span>
        {covered > 0 && <span>本路被兜住 <strong data-tone="covered">{covered} 只</strong></span>}
        {!!hpCost && <span>扣血 <strong data-tone="breached">{hpCost} 点</strong></span>}
      </div>
    </div>
    <AssistLinks rows={rows} report={report} seat={seat} />
    {!!leaks?.value && <div className="d-detail-enemies"><h3>本路漏怪</h3><EnemyResult metric={leaks}
      enemies={groupEnemyOutcomes(rows.flatMap(row => laneKinds(row, report, seat)))} pending={outcome?.tone === 'assisting'} /></div>}
    {covered > 0 && <div className="d-detail-enemies"><h3>本路被兜住</h3><EnemyResult metric={{ value: covered }}
      enemies={groupEnemyOutcomes(rows.flatMap(row => row.assistEnemies.filter(enemy => enemy.owner === seat && enemy.killer !== seat)))} /></div>}
    {uncoveredOwn > 0 && uncoveredOwnKinds.length > 0 && <div className="d-detail-enemies"><h3>本路未兜住</h3><EnemyResult
      metric={{ value: uncoveredOwn }} enemies={uncoveredOwnKinds} /></div>}
    {teammateKinds.length > 0 && <div className="d-detail-enemies"><h3>{seat === null ? '队伍怪种' : '队友漏怪'}</h3>
      <span className="d-enemy-result">{teammateKinds.map(enemy => <EnemyLabel key={enemy.id} {...enemy} />)}</span></div>}
    <div className="d-report-seat-cards">{REPORT_SEATS.map(id => {
      const lane = rows.map(row => roundMetrics(row, id, report.self));
      const seatLeak = total(lane.map(metrics => metrics[0]));
      const help = total(lane.map(metrics => metrics[1]));
      const empty = !seatLeak && !help;
      return <div key={id} data-self={id === seat} data-empty={empty}>{seatName(id, report, seat)}
        <div className="d-seat-stats"><span>漏怪<LeakValue metric={seatLeak} /></span>
          <span>协防<b data-tone={help?.value ? 'covered' : 'unknown'}>{help?.value ? '+' : ''}{metricText(help)}</b></span></div>
      </div>;
    })}</div>
    {active && <><WaveTable row={active} report={report} seat={seat} />
      <details className="d-round-fold" open={!hasCombatDetail && preview.length > 0}>
        <summary>本回合出怪预告 <small>R{active.number}</small></summary>
        {preview.length ? <SpawnRounds rows={preview} current={live ? confirmedCurrent(report) : null} byBatch /> : <p className="d-muted">未收到本回合预告。</p>}
      </details></>}
  </section>;
}

export function RoundMatrix({ report, seat = report?.self ?? null, live = false, onPreview }: {
  report?: BattleReport; seat?: number | null; live?: boolean; onPreview(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<ReportRoundFilter | null>();
  useLayoutEffect(() => {
    const element = host.current?.closest('.d-report-shell') ?? host.current;
    if (!element) return;
    const resize = () => setCompact(element.getBoundingClientRect().width <= 760);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const rows = report?.rounds ?? [];
  const current = live ? confirmedCurrent(report) : null;
  const selection = selected ?? (compact ? null : rows.find(row => row.number === current)?.number ?? rows.at(-1)?.number);
  const choose = (value: ReportRoundFilter) => setSelected(compact && selection === value ? null : value);
  let content;
  if (!rows.length || !report) {
    const plans = visibleSpawnRows(report, 'plan', '', '');
    const count = new Set(plans.map(row => row.round)).size;
    content = count ? <section className="d-opening-preview"><header className="d-report-heading"><h2>开局备战</h2>
      <span className="d-muted">已收到 {plans.length} 条预告</span></header>
      <SpawnRounds rows={plans.filter(row => row.round <= 3)} />
      <button type="button" className="d-button d-primary" onClick={onPreview}>查看全部 {count} 回合预告<ArrowRight size={14} /></button>
    </section> : <p className="d-muted d-report-note">等待首条回合记录或出怪预告。</p>;
  } else {
    const detail = selection != null && <div id={detailId} className={compact ? 'd-detail-inline' : 'd-detail-side'}>
      <WaveDetails key={selection} report={report} round={selection} seat={seat} live={live} /></div>;
    const laneAllLeaks = rows.map(row => laneLeaks(row, report, seat));
    const totalLeaks = sumMetrics(laneAllLeaks);
    const totalHelps = seat !== null ? sumMetrics(rows.map(row => roundMetrics(row, seat, report.self)[1])) : undefined;
    const confirmedLane = laneAllLeaks.filter(m => m && !m.quality);
    const cleanLane = confirmedLane.filter(m => m!.value === 0).length;
    const reversed = [...rows].reverse();
    const missingRounds: number[] = [];
    const present = new Set(rows.map(row => row.number));
    const highest = rows.at(-1)?.number ?? 0;
    for (let n = 1; n < highest; n++) if (!present.has(n)) missingRounds.push(n);

    content = <div className="d-report-workbench" data-compact={compact}>
      <section className="d-round-master" aria-label="回合记录">
        <header className="d-report-heading"><h2>回合记录 <small>{rows.length}</small></h2>
          <button className="d-button d-small" type="button" onClick={() => choose('all')} aria-pressed={selection === 'all'}>全局累计</button></header>
        <div className="d-match-strip" aria-label="当前视角汇总">
          <div><span>{seat !== null ? `${seatDisplayText(seat, report)}累计漏怪` : '本机累计漏怪'}</span><b data-tone={totalLeaks?.value ? 'breached' : 'clean'}>{totalLeaks ? `${totalLeaks.value} 只` : '—'}</b></div>
          <div><span>{seat !== null ? `${seatDisplayText(seat, report)}累计协防` : '累计协防'}</span><b data-tone={totalHelps?.value ? 'covered' : 'unknown'}>{totalHelps ? `${totalHelps.value} 只` : '—'}</b></div>
          <div><span>本席零漏</span><b data-tone={cleanLane ? 'clean' : 'unknown'}>{confirmedLane.length ? `${cleanLane}/${confirmedLane.length}` : '—'}</b></div>
          {missingRounds.length > 0 && <div><span>缺失回合</span><b data-tone="unknown">{missingRounds.map(n => `R${n}`).join(' ')}</b></div>}
        </div>
        {compact && selection === 'all' && detail}
        <div className="d-round-grid d-round-cols" aria-hidden="true"><span>回合</span><span>本路漏怪</span><span>协防结果</span><span>怪种</span><span /></div>
        {reversed.map((row, idx) => {
          const outcome = roundOutcome(row, report, seat, live);
          const leaks = laneLeaks(row, report, seat);
          const displayEnemies = roundDisplayEnemies(row, report, seat);
          const description = displayEnemies.enemies.map(enemy => `${enemy.name} ×${enemy.count}`).join('、');
          const nextOlder = reversed[idx + 1]?.number;
          const gaps: number[] = [];
          if (nextOlder !== undefined && row.number - nextOlder > 1) {
            for (let missing = row.number - 1; missing > nextOlder; missing--) gaps.push(missing);
          }
          return <Fragment key={row.number}><button type="button" className="d-round-grid d-round-row" data-current={row.number === current}
            aria-expanded={selection === row.number} aria-controls={selection === row.number ? detailId : undefined}
            aria-label={`查看 R${row.number} 回合详情，${outcome.label}，本路漏怪 ${metricText(leaks)}${description ? `，${description}` : ''}`} onClick={() => choose(row.number)}>
            <b className="d-round-number">R{row.number}</b><LeakValue metric={leaks} /><OutcomeLabel {...outcome} />
            <EnemyResult enemies={displayEnemies.enemies} metric={displayEnemies.metric} pending={outcome.tone === 'assisting' && Boolean(leaks?.value)} />
            {compact && selection === row.number ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>{compact && selection === row.number && detail}
            {gaps.map(missing => <div key={`gap-${missing}`} className="d-round-gap" title="本回合未收到自路或协防结算包">
              <b className="d-round-number">R{missing}</b><span>未采到本回合结算（可能全队无漏或瞬时丢包）</span>
            </div>)}
          </Fragment>;
        })}
      </section>
      {!compact && detail}
    </div>;
  }
  return <div ref={host}>{content}</div>;
}
