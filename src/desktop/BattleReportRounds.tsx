import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Info, Repeat, ShieldAlert, ShieldCheck, ShieldOff, Skull } from 'lucide-react';
import { REPORT_SEATS, confirmedCurrent, groupEnemyOutcomes, roundMetrics, visibleSpawnRows, waveOwner, type BattleReport,
  type BattleRound, type EnemyOutcome, type ReportRoundFilter } from './battleReportData';
import { isSeatEliminatedInRound, laneKinds, laneLeaks, metricText, roundDisplayEnemies, roundOutcome, roundTeamKinds, sumMetrics, type LaneMetric } from './battleRoundOutcome';
import { seatDisplayText, seatName } from './BattleReportPanels';
import { batchName, EnemyLabel, SpawnRounds } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { formatTelemetryRate, formatTelemetryTotal, isSoloMode } from './combatTelemetry';
import { formatAxisNumber, niceTicks, PRTS_CHART, PRTS_FONT_NUM } from './prtsChartKit';

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
  const typed = enemies.reduce((n, enemy) => n + enemy.count, 0);
  const kinds = typed <= metric.value ? enemies : [];
  const missing = kinds.length ? metric.value - typed : metric.value;
  return <span className="d-enemy-result">{kinds.map(enemy => <EnemyLabel key={enemy.id} {...enemy} />)}
    {missing > 0 && <span className="d-missing-kinds">{pending
      ? `本路已漏 ${metricText(metric)} 只 · 协防结算后自动刷新怪种`
      : `${kinds.length ? '另有 ' : ''}${metric.quality === 'minimum' ? '≥' : ''}${missing} 只未记录怪种`}</span>}
  </span>;
}

function RoundTrendBarChart({
  rows,
  report,
  seat,
  solo,
  selected,
  onSelect,
}: {
  rows: BattleRound[];
  report: BattleReport;
  seat: number | null;
  solo: boolean;
  selected: ReportRoundFilter | null | undefined;
  onSelect(round: number): void;
}) {
  const gridId = useId();
  if (rows.length < 2) return null;
  const points = rows.map(row => {
    const leak = laneLeaks(row, report, seat)?.value ?? 0;
    const help = !solo && seat !== null ? (roundMetrics(row, seat, report.self)[1]?.value ?? 0) : 0;
    const elim = seat !== null && isSeatEliminatedInRound(report, seat, row.number);
    return { round: row.number, leak, help, elim };
  });
  const maxVal = Math.max(1, ...points.flatMap(p => [p.leak, p.help]));
  const hasAny = points.some(p => p.leak > 0 || p.help > 0);
  if (!hasAny) return null;

  const { top: yTop, ticks } = niceTicks(maxVal, 2);
  const width = 640;
  const height = 84;
  const padL = 26;
  const padR = 10;
  const padT = 14;
  const padB = 18;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const baseY = padT + innerH;
  const slotW = innerW / points.length;
  const bandW = Math.min(44, Math.max(18, slotW - 4));
  const barW = solo ? Math.min(13, Math.max(7, bandW * 0.36)) : Math.min(10, Math.max(5, bandW * 0.28));
  const barGap = 2.5;

  return (
    <section className="d-round-trend" aria-label="各回合漏怪与兜底趋势图">
      <header className="d-round-trend-head">
        <span><b className="d-prts-slash">//</b>各回合承压趋势</span>
        <div className="d-round-trend-legend">
          <span><i className="is-leak" />本路漏怪</span>
          {!solo && <span><i className="is-help" />我方兜底</span>}
        </div>
      </header>
      <svg className="d-prts-svg d-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="各回合漏怪与兜底柱状图">
        <defs>
          <pattern id={`trend-grid-${gridId}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={PRTS_CHART.gridSubtle} strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={padL} y={padT} width={innerW} height={innerH} fill={PRTS_CHART.plotBg} />
        <rect x={padL} y={padT} width={innerW} height={innerH} fill={`url(#trend-grid-${gridId})`} />

        {ticks.map((tick, idx) => {
          const y = baseY - (tick / yTop) * innerH;
          return (
            <g key={tick}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke={idx === 0 ? PRTS_CHART.axisLine : PRTS_CHART.gridLine}
                strokeWidth={idx === 0 ? 1.2 : 1}
                strokeDasharray={idx === 0 ? undefined : '3 3'}
              />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fill={PRTS_CHART.labelMuted} fontSize="9.5" fontFamily={PRTS_FONT_NUM}>
                {formatAxisNumber(tick)}
              </text>
            </g>
          );
        })}

        {points.map((pt, idx) => {
          const x0 = padL + idx * slotW;
          const cx = x0 + slotW / 2;
          const active = selected === pt.round;
          const leakH = pt.leak > 0 ? Math.max(3, (pt.leak / yTop) * innerH) : 0;
          const helpH = pt.help > 0 ? Math.max(3, (pt.help / yTop) * innerH) : 0;
          const leakX = solo ? cx - barW / 2 : cx - barW - barGap / 2;
          const helpX = cx + barGap / 2;
          return (
            <g
              key={pt.round}
              className="d-trend-svg-col"
              role="button"
              tabIndex={0}
              aria-label={`选择 R${pt.round}${pt.elim ? '（已淘汰）' : `，漏怪 ${pt.leak}${!solo ? `，兜底 ${pt.help}` : ''}`}`}
              onClick={() => onSelect(pt.round)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(pt.round); } }}
            >
              <title>{`R${pt.round}${pt.elim ? '（已淘汰）' : ` · 漏 ${pt.leak}${!solo ? ` / 兜 +${pt.help}` : ''}`}`}</title>
              <rect
                x={cx - bandW / 2}
                y={padT}
                width={bandW}
                height={innerH}
                fill={active ? 'rgba(54, 152, 204, 0.14)' : 'transparent'}
              />
              {active && <rect x={cx - bandW / 2} y={padT} width={bandW} height="2" fill={PRTS_CHART.ochreBright} />}

              {pt.elim ? (
                <line x1={cx - 5} y1={baseY - 4} x2={cx + 5} y2={baseY - 4} stroke={PRTS_CHART.slate} strokeWidth="2" />
              ) : (
                <>
                  {leakH > 0 && (
                    <>
                      <rect x={leakX} y={baseY - leakH} width={barW} height={leakH} fill={PRTS_CHART.crimson} />
                      <text x={leakX + barW / 2} y={baseY - leakH - 2.5} textAnchor="middle" fill="#E88B85" fontSize="9" fontWeight="700" fontFamily={PRTS_FONT_NUM}>
                        {pt.leak}
                      </text>
                    </>
                  )}
                  {!solo && helpH > 0 && (
                    <>
                      <rect x={helpX} y={baseY - helpH} width={barW} height={helpH} fill={PRTS_CHART.blue} />
                      <text x={helpX + barW / 2} y={baseY - helpH - 2.5} textAnchor="middle" fill="#8CCAE8" fontSize="9" fontWeight="700" fontFamily={PRTS_FONT_NUM}>
                        +{pt.help}
                      </text>
                    </>
                  )}
                </>
              )}
              <text
                x={cx}
                y={height - 4}
                textAnchor="middle"
                fill={active ? PRTS_CHART.ochreBright : PRTS_CHART.labelMuted}
                fontSize="9.5"
                fontWeight={active ? '700' : '500'}
                fontFamily={PRTS_FONT_NUM}
              >
                R{pt.round}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function AssistFlowVisual({ rows, report, seat }: { rows: BattleRound[]; report: BattleReport; seat: number | null }) {
  const pairs = new Map<string, BattleRound['assistPairs'][number]>();
  let unmatched = 0;
  for (const row of rows) {
    unmatched += row.unattributedAssists;
    for (const pair of row.assistPairs) {
      const key = `${pair.killer}:${pair.owner}`;
      pairs.set(key, { ...pair, count: (pairs.get(key)?.count ?? 0) + pair.count });
    }
  }
  const links = [...pairs.values()];
  const iHelped = seat !== null
    ? links.filter(p => p.killer === seat && p.owner !== seat).sort((a, b) => b.count - a.count || a.owner - b.owner)
    : [];
  const helpedMe = seat !== null
    ? links.filter(p => p.owner === seat && p.killer !== seat).sort((a, b) => b.count - a.count || a.killer - b.killer)
    : [];
  const selfClean = seat !== null
    ? links.filter(p => p.killer === seat && p.owner === seat).reduce((s, p) => s + p.count, 0)
    : 0;
  const others = links
    .filter(p => seat === null || (p.killer !== seat && p.owner !== seat))
    .sort((a, b) => b.count - a.count || a.killer - b.killer || a.owner - b.owner);

  const iHelpedSum = iHelped.reduce((s, p) => s + p.count, 0);
  const helpedMeSum = helpedMe.reduce((s, p) => s + p.count, 0);
  const othersSum = others.reduce((s, p) => s + p.count, 0);
  const myScale = Math.max(1, ...iHelped.map(p => p.count), ...helpedMe.map(p => p.count));
  const otherScale = Math.max(1, ...others.map(p => p.count));

  if (!iHelped.length && !helpedMe.length && !selfClean && !others.length && !unmatched) {
    return null;
  }

  return (
    <div className="d-assist-visual">
      {(iHelped.length > 0 || helpedMe.length > 0 || selfClean > 0) && (
        <div className="d-assist-dual" data-both={iHelped.length > 0 && helpedMe.length > 0}>
          {(iHelped.length > 0 || selfClean > 0) && (
            <section className="d-assist-card is-out" aria-label="我给谁兜">
              <header>
                <span><ArrowUpRight size={14} />{seat === report.self ? '我给谁兜' : 'TA 给谁兜'}</span>
                <div className="d-assist-head-tags">
                  {selfClean > 0 && <small className="d-self-clean">自补 {selfClean}</small>}
                  {iHelpedSum > 0 && <b>+{iHelpedSum}</b>}
                </div>
              </header>
              {iHelped.length > 0 && (
                <ul className="d-bar-list">
                  {iHelped.map(({ owner, count }) => (
                    <li key={owner}>
                      <span className="d-bar-who">{seatName(owner, report)}</span>
                      <span className="d-bar-track" aria-hidden="true">
                        <i className={`is-out seat-fill-${owner}`} style={{ width: `${Math.max(6, (count / myScale) * 100)}%` }} />
                      </span>
                      <strong className="d-bar-val">+{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {helpedMe.length > 0 && (
            <section className="d-assist-card is-in" aria-label="谁给我兜">
              <header>
                <span><ArrowDownLeft size={14} />{seat === report.self ? '谁给我兜' : '谁给 TA 兜'}</span>
                <b>{helpedMeSum}</b>
              </header>
              <ul className="d-bar-list">
                {helpedMe.map(({ killer, count }) => (
                  <li key={killer}>
                    <span className="d-bar-who">{seatName(killer, report)}</span>
                    <span className="d-bar-track" aria-hidden="true">
                      <i className={`is-in seat-fill-${killer}`} style={{ width: `${Math.max(6, (count / myScale) * 100)}%` }} />
                    </span>
                    <strong className="d-bar-val">{count}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {others.length > 0 && (
        <section className="d-assist-card is-peer" aria-label={seat === null ? '已确认协防' : '队友互兜'}>
          <header>
            <span><Repeat size={13} />{seat === null ? '已确认协防' : '队友互兜'}</span>
            <b>{othersSum}</b>
          </header>
          <ul className="d-bar-list is-peer-list">
            {others.map(({ killer, owner, count }) => (
              <li key={`${killer}:${owner}`}>
                <span className="d-bar-pair">
                  {seatName(killer, report)}
                  <ArrowRight size={11} aria-label="兜底" />
                  {owner === killer ? <small>自补</small> : seatName(owner, report)}
                </span>
                <span className="d-bar-track" aria-hidden="true">
                  <i className="is-peer" style={{ width: `${Math.max(6, (count / otherScale) * 100)}%` }} />
                </span>
                <strong className="d-bar-val">{count}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unmatched > 0 && <p className="d-muted d-assist-unmatched">{unmatched} 只协防击杀，未能确认漏怪者</p>}
    </div>
  );
}

function WaveTable({ row, report }: { row: BattleRound; report: BattleReport }) {
  const waves = row.rows.filter(wave => wave.seat !== null || wave.leaked !== null);
  if (!waves.length) return null;
  return <details className="d-round-fold"><summary>实战编排</summary><div className="d-report-table"><table>
    <thead><tr>{[row.bossGroups ? '战区' : '玩家', '批次', '敌人', '计划', '漏怪'].map(label => <th key={label}>{label}</th>)}</tr></thead>
    <tbody>{waves.flatMap((wave, i) => (wave.enemies.length ? wave.enemies : [undefined]).map((enemy, j) => <tr key={`${i}-${j}`}>
      {j === 0 && <><th rowSpan={Math.max(1, wave.enemies.length)}>{wave.seat !== null && !row.bossGroups
        ? seatName(wave.seat, report) : waveOwner(wave.seat, row.bossGroups)}</th>
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
  const solo = isSoloMode(report.mode);
  const seats = solo ? ([1] as const) : REPORT_SEATS;
  const effectiveSeat = solo ? 1 : seat;
  const total = (values: LaneMetric[]) => active ? values[0] : sumMetrics(values);
  const leaks = total(rows.map(row => laneLeaks(row, report, effectiveSeat)));
  const outcome = active && roundOutcome(active, report, effectiveSeat, live);
  const covered = solo ? 0 : rows.flatMap(row => row.assistPairs.filter(pair => pair.owner === effectiveSeat && pair.killer !== effectiveSeat)).reduce((n, pair) => n + pair.count, 0);
  const hpCost = effectiveSeat === null ? undefined : active?.hpCosts[effectiveSeat];
  const uncoveredOwn = effectiveSeat === null ? 0 : rows.reduce((n, row) => n + (row.uncoveredLeaks[effectiveSeat] ?? 0), 0);
  const uncoveredOwnKinds = effectiveSeat === null ? [] : groupEnemyOutcomes(rows.flatMap(row => row.uncoveredEnemies.filter(e => e.owner === effectiveSeat)));
  const teammateKinds = solo ? [] : groupEnemyOutcomes(rows.flatMap(row => roundTeamKinds(row, report, effectiveSeat)));
  const roundTelemetry = active ? report.telemetry?.rounds[active.number] ?? null : null;
  const preview = active ? visibleSpawnRows(report, 'plan', String(active.number), '') : [];
  const hasCombatDetail = Boolean(leaks?.value || covered > 0 || teammateKinds.length > 0
    || rows.some(row => row.assistPairs.length > 0 || row.unattributedAssists > 0));
  const myOut = solo || effectiveSeat === null
    ? 0
    : rows.flatMap(row => row.assistPairs.filter(pair => pair.killer === effectiveSeat && pair.owner !== effectiveSeat)).reduce((n, pair) => n + pair.count, 0);
  const ownKinds = leaks?.value ? groupEnemyOutcomes(rows.flatMap(row => laneKinds(row, report, effectiveSeat))) : [];
  const coveredKinds = covered > 0
    ? groupEnemyOutcomes(rows.flatMap(row => row.assistEnemies.filter(enemy => enemy.owner === effectiveSeat && enemy.killer !== effectiveSeat)))
    : [];
  const hasAnyEnemySection = Boolean(leaks?.value || covered > 0 || (uncoveredOwn > 0 && uncoveredOwnKinds.length > 0) || teammateKinds.length > 0);
  const seatStats = seats.map(id => {
    const elimRound = report.eliminated[id];
    const eliminatedInActive = active ? isSeatEliminatedInRound(report, id, active.number) : false;
    const survivedRows = elimRound !== undefined ? rows.filter(r => r.number <= elimRound) : rows;
    const lane = (active ? rows : survivedRows).map(row => roundMetrics(row, id, report.self));
    const seatLeak = eliminatedInActive ? undefined : total(lane.map(metrics => metrics[0]));
    const help = eliminatedInActive ? undefined : total(lane.map(metrics => metrics[1]));
    return { id, seatLeak, help, elimRound, eliminatedInActive };
  });
  const seatBarMax = Math.max(
    1,
    ...seatStats.flatMap(s => [s.seatLeak?.value ?? 0, s.help?.value ?? 0]),
  );
  const showDistinctOutcomeNote = Boolean(
    outcome && outcome.note && outcome.label === '本路无人兜底',
  );

  return <section className="d-wave-detail" aria-label={active ? `R${active.number} 回合详情` : '全部回合累计'}>
    <header className="d-report-heading"><h2>{active ? <><b>R{active.number}</b> 回合详情</> : <>全部回合累计 <small>{rows.length}R</small></>}</h2>
      <details className="d-metric-key"><summary><Info size={13} />口径说明</summary>
        <div>— 未记录 · ≈ 估算 · ≥ 已知下限<br />漏怪按进入协防前计数，协防按帮助其他席位计数。<br />已淘汰席位在阵亡后的回合自动置灰，不计入零漏。
          {report.selfManual && <><br />本机席位：{seatDisplayText(report.self!, report)} · 手动确认</>}
          {report.selfBySettlement && <><br />本机席位：{seatDisplayText(report.self!, report)} · 结算关联</>}
          {seat === null && <><br />席位未确认，仅显示采到的本机漏怪。</>}</div>
      </details>
    </header>

    <div className="d-kpi-strip" data-tone={outcome?.tone ?? 'unknown'}>
      {outcome && (
        <div className="d-kpi-status">
          <OutcomeLabel {...outcome} />
          {showDistinctOutcomeNote && <small>{outcome.note}</small>}
        </div>
      )}
      <div className="d-kpi-pills">
        {!solo && myOut > 0 && (
          <span className="d-kpi-pill is-out">
            <small>{effectiveSeat === report.self ? '我兜他' : '协防兜底'}</small>
            <b>+{myOut}</b>
          </span>
        )}
        {!solo && covered > 0 && (
          <span className="d-kpi-pill is-in">
            <small>本路被兜住</small>
            <b>{covered} 只</b>
          </span>
        )}
        <span className="d-kpi-pill" data-clean={leaks?.value === 0 && leaks.quality !== 'minimum'} data-loss={Boolean(leaks?.value)}>
          <small>本路漏怪</small>
          <strong>{leaks ? `${metricText(leaks)} 只` : '—'}</strong>
        </span>
        {!!hpCost && (
          <span className="d-kpi-pill is-hp">
            <small>扣血</small>
            <strong data-tone="breached">{hpCost} 点</strong>
          </span>
        )}
      </div>
    </div>

    {!solo && <AssistFlowVisual rows={rows} report={report} seat={effectiveSeat} />}

    <div className="d-report-seat-cards" data-solo={solo}>
      {seatStats.map(({ id, seatLeak, help, elimRound, eliminatedInActive }) => {
        const empty = !seatLeak && !help && !eliminatedInActive;
        const leakW = seatLeak?.value ? Math.max(8, (seatLeak.value / seatBarMax) * 100) : 0;
        const helpW = help?.value ? Math.max(8, (help.value / seatBarMax) * 100) : 0;
        const diedThisRound = Boolean(active && elimRound === active.number);
        return (
          <div
            key={id}
            data-self={id === report.self}
            data-viewing={id === effectiveSeat && id !== report.self}
            data-empty={empty}
            data-eliminated={eliminatedInActive}
          >
            <div className="d-seat-card-head">
              {seatName(id, report)}
              {diedThisRound && <span className="d-seat-elim-tag"><Skull size={10} />本回合阵亡</span>}
              {!active && elimRound !== undefined && <span className="d-seat-elim-tag"><Skull size={10} />R{elimRound}阵亡</span>}
            </div>
            {eliminatedInActive ? (
              <div className="d-seat-eliminated-body">
                <Skull size={12} />
                <span>已淘汰 · R{elimRound}</span>
              </div>
            ) : (
              <div className="d-seat-bars">
                <div className="d-seat-bar-row">
                  <small>漏</small>
                  <span className="d-micro-track" aria-hidden="true">
                    {leakW > 0 && <i className="is-leak" style={{ width: `${leakW}%` }} />}
                  </span>
                  <LeakValue metric={seatLeak} />
                </div>
                {!solo && (
                  <div className="d-seat-bar-row">
                    <small>兜</small>
                    <span className="d-micro-track" aria-hidden="true">
                      {helpW > 0 && <i className="is-help" style={{ width: `${helpW}%` }} />}
                    </span>
                    <b data-tone={help?.value ? 'covered' : 'unknown'}>{help?.value ? '+' : ''}{metricText(help)}</b>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>

    {roundTelemetry && roundTelemetry.operators.length > 0 && (
      <div className="d-round-dps-summary">
        <h3>主力输出</h3>
        <div className="d-round-dps-chips">
          {roundTelemetry.operators.slice(0, 4).map(op => (
            <span key={op.charId} className="d-round-dps-chip">
              <CompactOperatorBadge name={op.name} size={18} />
              <strong>{op.name}</strong>
              <b>{formatTelemetryTotal(op.totalDamage)}</b>
              {op.activeDps != null && <small>{formatTelemetryRate(op.activeDps)}</small>}
            </span>
          ))}
        </div>
      </div>
    )}

    {hasAnyEnemySection && (
      <details className="d-round-fold d-bottom-enemies" open={Boolean(active && !myOut && !covered)}>
        <summary>漏怪与兜底怪种</summary>
        <div className="d-bottom-enemies-body">
          {!!leaks?.value && (
            <div className="d-detail-enemies">
              <h3>本路漏怪</h3>
              <EnemyResult metric={leaks} enemies={ownKinds} pending={outcome?.tone === 'assisting'} />
            </div>
          )}
          {covered > 0 && (
            <div className="d-detail-enemies">
              <h3>本路被兜住</h3>
              <EnemyResult metric={{ value: covered }} enemies={coveredKinds} />
            </div>
          )}
          {uncoveredOwn > 0 && uncoveredOwnKinds.length > 0 && (
            <div className="d-detail-enemies">
              <h3>本路未兜住</h3>
              <EnemyResult metric={{ value: uncoveredOwn }} enemies={uncoveredOwnKinds} />
            </div>
          )}
          {teammateKinds.length > 0 && (
            <div className="d-detail-enemies">
              <h3>{effectiveSeat === null ? '队伍怪种' : '队友漏怪'}</h3>
              <span className="d-enemy-result">{teammateKinds.map(enemy => <EnemyLabel key={enemy.id} {...enemy} />)}</span>
            </div>
          )}
        </div>
      </details>
    )}

    {active && <><WaveTable row={active} report={report} />
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
    const solo = isSoloMode(report.mode);
    const effectiveSeat = solo ? 1 : seat;
    const effectiveElimRound = effectiveSeat !== null ? report.eliminated[effectiveSeat] : undefined;
    const selfElimRound = report.self !== null ? report.eliminated[report.self] : undefined;
    const survivedRows = effectiveElimRound !== undefined ? rows.filter(r => r.number <= effectiveElimRound) : rows;
    const detail = selection != null && <div id={detailId} className={compact ? 'd-detail-inline' : 'd-detail-side'}>
      <WaveDetails key={selection} report={report} round={selection} seat={effectiveSeat} live={live} /></div>;
    const laneAllLeaks = survivedRows.map(row => laneLeaks(row, report, effectiveSeat));
    const totalLeaks = sumMetrics(laneAllLeaks);
    const totalHelps = !solo && effectiveSeat !== null ? sumMetrics(survivedRows.map(row => roundMetrics(row, effectiveSeat, report.self)[1])) : undefined;
    const confirmedLane = laneAllLeaks.filter(m => m && !m.quality);
    const cleanLane = confirmedLane.filter(m => m!.value === 0).length;
    const reversed = [...rows].reverse();
    const missingRounds: number[] = [];
    const present = new Set(rows.map(row => row.number));
    const highest = rows.at(-1)?.number ?? 0;
    for (let n = 1; n < highest; n++) if (!present.has(n)) missingRounds.push(n);

    content = <div className="d-report-workbench" data-compact={compact}>
      <section className="d-round-master" aria-label="回合记录">
        <header className="d-report-heading"><h2>{solo ? '单兵承压记录' : '回合记录'} <small>{rows.length}</small></h2>
          <button className="d-button d-small" type="button" onClick={() => choose('all')} aria-pressed={selection === 'all'}>全局累计</button></header>
        {!solo && selfElimRound !== undefined && (
          <div className="d-spectator-banner" role="status">
            <Skull size={13} />
            <span>本席已于 R{selfElimRound} 阵亡 · 历史战绩已完整保留，后续回合继续记录存活队友与协防</span>
          </div>
        )}
        <div className="d-match-strip" aria-label="当前视角汇总">
          {effectiveSeat !== null && !solo && (
            <strong className="d-strip-who">
              {seatDisplayText(effectiveSeat, report)}
              {effectiveSeat === report.self ? '（我）' : '（视角）'}
              {effectiveElimRound !== undefined ? ` · R${effectiveElimRound}阵亡` : ''}
            </strong>
          )}
          <div><span>漏怪</span><b data-tone={totalLeaks?.value ? 'breached' : 'clean'}>{totalLeaks ? `${totalLeaks.value}` : '—'}</b></div>
          {!solo && <div><span>兜底</span><b data-tone={totalHelps?.value ? 'covered' : 'unknown'}>{totalHelps ? `+${totalHelps.value}` : '—'}</b></div>}
          <div><span>零漏</span><b data-tone={cleanLane ? 'clean' : 'unknown'}>{confirmedLane.length ? `${cleanLane}/${confirmedLane.length}` : '—'}</b></div>
          {missingRounds.length > 0 && <div><span>未记录</span><b data-tone="unknown">{missingRounds.map(n => `R${n}`).join(' ')}</b></div>}
        </div>
        <RoundTrendBarChart
          rows={rows}
          report={report}
          seat={effectiveSeat}
          solo={solo}
          selected={selection}
          onSelect={r => choose(r)}
        />
        {compact && selection === 'all' && detail}
        <div className="d-round-grid d-round-cols" aria-hidden="true"><span>回合</span><span>本路漏怪</span><span>{solo ? '单兵态势' : '协防结果'}</span><span>{solo ? '怪种 / 主力输出' : '怪种'}</span><span /></div>
        {reversed.map((row, idx) => {
          const seatEliminated = effectiveSeat !== null && isSeatEliminatedInRound(report, effectiveSeat, row.number);
          const outcome = roundOutcome(row, report, effectiveSeat, live);
          const leaks = seatEliminated ? undefined : laneLeaks(row, report, effectiveSeat);
          const displayEnemies = roundDisplayEnemies(row, report, effectiveSeat);
          const roundOps = solo ? (report.telemetry?.rounds[row.number]?.operators.slice(0, 2) ?? []) : [];
          const description = displayEnemies.enemies.map(enemy => `${enemy.name} ×${enemy.count}`).join('、');
          const nextOlder = reversed[idx + 1]?.number;
          const gaps: number[] = [];
          if (nextOlder !== undefined && row.number - nextOlder > 1) {
            for (let missing = row.number - 1; missing > nextOlder; missing--) gaps.push(missing);
          }
          return <Fragment key={row.number}><button type="button" className="d-round-grid d-round-row" data-current={row.number === current}
            data-eliminated={seatEliminated}
            aria-expanded={selection === row.number} aria-controls={selection === row.number ? detailId : undefined}
            aria-label={`查看 R${row.number} 回合详情，${outcome.label}，本路漏怪 ${metricText(leaks)}${description ? `，${description}` : ''}`} onClick={() => choose(row.number)}>
            <b className="d-round-number">R{row.number}</b>
            {seatEliminated ? <span className="d-muted">已淘汰</span> : <LeakValue metric={leaks} />}
            <OutcomeLabel {...outcome} />
            <span className="d-round-cell-mix">
              <EnemyResult enemies={displayEnemies.enemies} metric={displayEnemies.metric} pending={outcome.tone === 'assisting' && Boolean(leaks?.value)} />
              {roundOps.length > 0 && <span className="d-round-mini-ops">{roundOps.map(op => <small key={op.charId}>{op.name} {formatTelemetryTotal(op.totalDamage)}</small>)}</span>}
            </span>
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
