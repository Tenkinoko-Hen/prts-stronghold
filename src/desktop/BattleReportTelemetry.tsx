import { useId, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Cpu, Flame, HeartPulse, Shield, Skull, Sparkles, Swords, Users } from 'lucide-react';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import { REPORT_SEATS, type BattleReport } from './battleReportData';
import { seatDisplayText, seatName } from './BattleReportPanels';
import { EquipIcon } from './EquipIcon';
import {
  CALIBER_LABELS,
  formatTelemetryRate,
  formatTelemetryTotal,
  isSoloMode,
  operatorRateForCaliber,
  SCOPE_LABELS,
  type CombatTelemetrySnapshot,
  type OperatorTelemetry,
  type SeatLineup,
  type TelemetryCaliber,
  type TelemetryMetricMode,
  type TimelinePoint,
} from './combatTelemetry';
import { buildSmoothSplinePath, formatAxisNumber, niceTicks, PRTS_CHART, PRTS_FONT_NUM, PRTS_FONT_SANS } from './prtsChartKit';

const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const secFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const DONUT_PALETTE = PRTS_CHART.series;

export function CompactOperatorBadge({ name, size = 28 }: { name: string; size?: number }) {
  const resolved = resolveOperatorAvatars(name)[0];
  const [failed, setFailed] = useState(false);
  const clean = resolved?.cleanName || name;
  return (
    <span className="d-tele-avatar" style={{ width: size, height: size }} title={clean}>
      {resolved?.avatarUrl && !failed ? (
        <img
          src={resolved.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <b>{clean.slice(0, 2)}</b>
      )}
    </span>
  );
}

function DpsAreaChart({ timeline, operators, avgDps }: {
  timeline: TimelinePoint[];
  operators: OperatorTelemetry[];
  avgDps: number | null;
}) {
  const uid = useId();
  const gradId = `prts-dps-area-${uid}`;
  const gridId = `prts-dps-grid-${uid}`;
  const hasCurve = timeline.length >= 2;

  if (!hasCurve) {
    if (!operators.length) return null;
    const top = operators.slice(0, 8);
    const maxDmg = Math.max(1, ...top.map(o => o.totalDamage));
    const { top: yTop, ticks } = niceTicks(maxDmg, 3);
    const width = 560;
    const height = 164;
    const padL = 44;
    const padR = 14;
    const padT = 18;
    const padB = 26;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const slotW = innerW / top.length;
    const barW = Math.min(28, Math.max(14, slotW * 0.46));

    return (
      <section className="d-chart-card" aria-label="干员输出柱状对比图">
        <header className="d-chart-head">
          <span><b className="d-prts-slash">//</b>干员输出分布对比</span>
          <small>Top {top.length}</small>
        </header>
        <svg className="d-prts-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="干员输出柱状对比图">
          <rect x={padL} y={padT} width={innerW} height={innerH} fill={PRTS_CHART.plotBg} />
          {ticks.map((tick, idx) => {
            const y = padT + innerH - (tick / yTop) * innerH;
            return (
              <g key={tick}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke={idx === 0 ? PRTS_CHART.axisLine : PRTS_CHART.gridLine} strokeDasharray={idx === 0 ? undefined : '3 3'} />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fill={PRTS_CHART.labelMuted} fontSize="10" fontFamily={PRTS_FONT_NUM}>
                  {formatAxisNumber(tick)}
                </text>
              </g>
            );
          })}
          {top.map((op, i) => {
            const cx = padL + slotW * (i + 0.5);
            const h = Math.max(2, (op.totalDamage / yTop) * innerH);
            const y = padT + innerH - h;
            return (
              <g key={`${op.seat ?? 0}:${op.charId}`}>
                <rect x={cx - barW / 2} y={y} width={barW} height={h} fill={i === 0 ? PRTS_CHART.ochre : PRTS_CHART.blue} />
                <text x={cx} y={y - 4} textAnchor="middle" fill={PRTS_CHART.labelStrong} fontSize="9.5" fontWeight="600" fontFamily={PRTS_FONT_NUM}>
                  {formatAxisNumber(op.totalDamage)}
                </text>
                <text x={cx} y={height - 8} textAnchor="middle" fill={PRTS_CHART.labelMuted} fontSize="10" fontFamily={PRTS_FONT_SANS}>
                  {op.name.slice(0, 4)}
                </text>
              </g>
            );
          })}
        </svg>
      </section>
    );
  }

  const width = 580;
  const height = 176;
  const padL = 46;
  const padR = 16;
  const padT = 22;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxT = Math.max(1, timeline[timeline.length - 1].t);
  const rawMaxDps = Math.max(10, ...timeline.map(p => p.dps), avgDps ?? 0);
  const { top: yTop, ticks } = niceTicks(rawMaxDps * 1.06, 4);
  const peakPt = timeline.reduce((best, p) => (p.dps > best.dps ? p : best), timeline[0]);

  const toX = (t: number) => padL + (t / maxT) * innerW;
  const toY = (v: number) => padT + innerH - (Math.max(0, v) / yTop) * innerH;

  const pts = timeline.map(p => ({ x: toX(p.t), y: toY(p.dps) }));
  const smoothLine = buildSmoothSplinePath(pts);
  const baseY = padT + innerH;
  const smoothArea = `${smoothLine} L ${pts[pts.length - 1].x.toFixed(1)},${baseY.toFixed(1)} L ${pts[0].x.toFixed(1)},${baseY.toFixed(1)} Z`;
  const peakX = toX(peakPt.t);
  const peakY = toY(peakPt.dps);
  const avgY = avgDps && avgDps > 0 ? toY(avgDps) : null;
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="d-chart-card" aria-label="实时 DPS 输出趋势简报">
      <header className="d-chart-head">
        <span><b className="d-prts-slash">//</b>实时 DPS 走势</span>
        <div className="d-round-trend-legend">
          <span><i style={{ background: PRTS_CHART.blue }} />瞬时 DPS</span>
          {avgY !== null && <span><i style={{ background: PRTS_CHART.ochre }} />全程均值</span>}
          <small>峰值 {formatTelemetryRate(peakPt.dps)} @ {secFmt.format(peakPt.t)}s</small>
        </div>
      </header>
      <svg className="d-prts-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="实时秒伤趋势曲线图">
        <defs>
          <pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke={PRTS_CHART.gridSubtle} strokeWidth="1" />
          </pattern>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRTS_CHART.blueFill} stopOpacity="0.42" />
            <stop offset="100%" stopColor={PRTS_CHART.blueFill} stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Endfield matte plot area with micro-grid */}
        <rect x={padL} y={padT} width={innerW} height={innerH} fill={PRTS_CHART.plotBg} />
        <rect x={padL} y={padT} width={innerW} height={innerH} fill={`url(#${gridId})`} />

        {/* Horizontal dashed BI gridlines & Y-axis ticks */}
        {ticks.map((tick, idx) => {
          const y = toY(tick);
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
              <text x={padL - 7} y={y + 3.5} textAnchor="end" fill={PRTS_CHART.labelMuted} fontSize="10" fontFamily={PRTS_FONT_NUM}>
                {formatAxisNumber(tick)}
              </text>
            </g>
          );
        })}

        {/* Smooth BI area & stroke */}
        <path d={smoothArea} fill={`url(#${gradId})`} />
        <path d={smoothLine} fill="none" stroke={PRTS_CHART.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Average DPS horizontal reference line (Endfield Ochre) */}
        {avgY !== null && avgDps !== null && (
          <g>
            <line x1={padL} y1={avgY} x2={width - padR} y2={avgY} stroke={PRTS_CHART.ochre} strokeWidth="1.2" strokeDasharray="5 4" opacity="0.88" />
            <rect x={width - padR - 86} y={avgY - 15} width="84" height="13" rx="1" fill="#161b23" stroke="rgba(216,191,75,0.45)" strokeWidth="0.8" />
            <text x={width - padR - 44} y={avgY - 5.5} textAnchor="middle" fill={PRTS_CHART.ochreBright} fontSize="9.2" fontWeight="600" fontFamily={PRTS_FONT_NUM}>
              均值 {formatAxisNumber(avgDps)}/s
            </text>
          </g>
        )}

        {/* Ringed BI data point markers */}
        {pts.map((pt, idx) => {
          const isPeak = timeline[idx] === peakPt;
          return (
            <circle
              key={idx}
              cx={pt.x}
              cy={pt.y}
              r={isPeak ? 4 : 2.6}
              fill={PRTS_CHART.plotBg}
              stroke={isPeak ? PRTS_CHART.ochreBright : PRTS_CHART.blue}
              strokeWidth={isPeak ? 2 : 1.5}
            />
          );
        })}

        {/* Direct Peak Value Callout */}
        <line x1={peakX} y1={peakY + 4} x2={peakX} y2={baseY} stroke={PRTS_CHART.ochre} strokeWidth="1" strokeDasharray="2 3" opacity="0.45" />
        <text
          x={Math.min(width - padR - 26, Math.max(padL + 26, peakX))}
          y={Math.max(13, peakY - 7)}
          textAnchor="middle"
          fill={PRTS_CHART.ochreBright}
          fontSize="10"
          fontWeight="700"
          fontFamily={PRTS_FONT_NUM}
        >
          {formatAxisNumber(peakPt.dps)}/s
        </text>

        {/* X-axis ticks */}
        {xTicks.map(f => {
          const x = padL + innerW * f;
          return (
            <g key={`t-${f}`}>
              <line x1={x} y1={baseY} x2={x} y2={baseY + 4} stroke={PRTS_CHART.axisLine} />
              <text
                x={x}
                y={height - 6}
                textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
                fill={PRTS_CHART.labelMuted}
                fontSize="10"
                fontFamily={PRTS_FONT_NUM}
              >
                {secFmt.format(maxT * f)}s
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function CompositionDonut({ operators, totalDamage, metric }: {
  operators: OperatorTelemetry[];
  totalDamage: number;
  metric: TelemetryMetricMode;
}) {
  if (totalDamage <= 0 || !operators.length) return null;
  const hasChannels = metric === 'damage' && operators.some(o => o.physical > 0 || o.arts > 0 || o.trueDamage > 0 || o.elemental > 0);
  const slices: { label: string; value: number; color: string }[] = [];

  if (hasChannels) {
    const phys = operators.reduce((s, o) => s + o.physical, 0);
    const arts = operators.reduce((s, o) => s + o.arts, 0);
    const elem = operators.reduce((s, o) => s + o.elemental, 0);
    const trueD = operators.reduce((s, o) => s + o.trueDamage, 0);
    if (phys > 0) slices.push({ label: '物理', value: phys, color: '#C5CFD9' });
    if (arts > 0) slices.push({ label: '法术', value: arts, color: PRTS_CHART.blue });
    if (elem > 0) slices.push({ label: '元素', value: elem, color: PRTS_CHART.ochre });
    if (trueD > 0) slices.push({ label: '真实', value: trueD, color: PRTS_CHART.crimson });
  } else {
    const top = operators.slice(0, 5);
    top.forEach((op, idx) => {
      const val = metric === 'healing' ? op.healing : op.totalDamage;
      if (val > 0) slices.push({ label: op.name, value: val, color: DONUT_PALETTE[idx % DONUT_PALETTE.length] });
    });
    const rest = operators.slice(5).reduce((s, o) => s + (metric === 'healing' ? o.healing : o.totalDamage), 0);
    if (rest > 0) slices.push({ label: '其余干员', value: rest, color: PRTS_CHART.slate });
  }

  const sum = slices.reduce((s, x) => s + x.value, 0);
  if (sum <= 0) return null;

  const r = 40;
  const cx = 52;
  const cy = 52;
  const circ = 2 * Math.PI * r;
  let acc = 0;

  return (
    <section className="d-chart-card d-donut-card" aria-label="输出构成环形图">
      <header className="d-chart-head">
        <span><b className="d-prts-slash">//</b>{hasChannels ? '属性伤害构成' : metric === 'healing' ? '治疗贡献构成' : '主力输出占比'}</span>
        <small>{slices.length} 项</small>
      </header>
      <div className="d-donut-body">
        <svg viewBox="0 0 104 104" className="d-donut-svg" role="img" aria-label="构成环形图">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1b212b" strokeWidth="9" />
          {slices.map(sl => {
            const frac = sl.value / sum;
            const len = frac * circ;
            const offset = -acc * circ;
            acc += frac;
            return (
              <circle
                key={sl.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={sl.color}
                strokeWidth="9"
                strokeDasharray={`${Math.max(1.5, len - 1.5)} ${circ}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" fill={PRTS_CHART.labelStrong} fontSize="12" fontWeight="700" fontFamily={PRTS_FONT_NUM}>
            {formatTelemetryTotal(sum)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill={PRTS_CHART.labelMuted} fontSize="8.5" fontFamily={PRTS_FONT_SANS}>
            {metric === 'healing' ? '累计治疗' : '累计输出'}
          </text>
        </svg>
        <ul className="d-donut-legend">
          {slices.map(sl => {
            const pct = (sl.value / sum) * 100;
            return (
              <li key={sl.label}>
                <i style={{ background: sl.color }} />
                <span className="d-donut-name">{sl.label}</span>
                <span className="d-donut-mini-bar" aria-hidden="true">
                  <em style={{ width: `${Math.max(4, pct)}%`, background: sl.color }} />
                </span>
                <b>{pctFmt.format(pct)}%</b>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function SegmentedEnergyBar({ op, maxValue, metric, rank = 1 }: {
  op: OperatorTelemetry;
  maxValue: number;
  metric: TelemetryMetricMode;
  rank?: number;
}) {
  if (metric === 'healing') {
    const width = maxValue > 0 ? Math.min(100, (op.healing / maxValue) * 100) : 0;
    return (
      <div className="d-tele-bar-track" aria-hidden="true">
        <span className="d-tele-seg is-heal" style={{ width: `${width}%` }} />
      </div>
    );
  }
  const total = op.totalDamage;
  if (total <= 0 || maxValue <= 0) {
    return <div className="d-tele-bar-track" aria-hidden="true" />;
  }
  const chanSum = op.physical + op.arts + op.elemental + op.trueDamage;
  if (chanSum <= 0) {
    const width = Math.min(100, (total / maxValue) * 100);
    return (
      <div className="d-tele-bar-track" aria-hidden="true">
        <span className={`d-tele-seg ${rank === 0 ? 'is-lead' : 'is-arts'}`} style={{ width: `${width}%` }} title={`协议总伤 ${formatTelemetryTotal(total)}`} />
      </div>
    );
  }
  const scale = Math.min(100, (total / maxValue) * 100) / chanSum;
  const physW = op.physical * scale;
  const artsW = op.arts * scale;
  const elemW = op.elemental * scale;
  const trueW = op.trueDamage * scale;
  return (
    <div className="d-tele-bar-track" aria-hidden="true">
      {physW > 0 && <span className="d-tele-seg is-phys" style={{ width: `${physW}%` }} title={`物理 ${formatTelemetryTotal(op.physical)}`} />}
      {artsW > 0 && <span className="d-tele-seg is-arts" style={{ width: `${artsW}%` }} title={`法术 ${formatTelemetryTotal(op.arts)}`} />}
      {elemW > 0 && <span className="d-tele-seg is-elem" style={{ width: `${elemW}%` }} title={`元素 ${formatTelemetryTotal(op.elemental)}`} />}
      {trueW > 0 && <span className="d-tele-seg is-true" style={{ width: `${trueW}%` }} title={`真实 ${formatTelemetryTotal(op.trueDamage)}`} />}
    </div>
  );
}

function SeatLineupsStrip({ report, lineups, solo }: {
  report: BattleReport;
  lineups: Record<number, SeatLineup>;
  solo: boolean;
}) {
  const seats = solo ? ([1] as const) : REPORT_SEATS;
  const activeSeats = seats.filter(s => lineups[s]);
  if (!activeSeats.length) return null;

  return (
    <section className="d-tele-lineups" aria-label="当前场内阵容与策略家">
      <header className="d-tele-subhead">
        <span><Users size={13} />{solo ? '当前场内阵容与策略家' : '四席实时场内阵容与策略家'}</span>
        <small>仅展示当前已部署与整备席干员（不含未抽取牌库）</small>
      </header>
      <div className="d-tele-lineup-grid" data-solo={solo}>
        {activeSeats.map(s => {
          const info = lineups[s]!;
          const elimRound = report.eliminated[s];
          const isEliminated = elimRound !== undefined;
          return (
            <article key={s} className="d-tele-lineup-card" data-self={report.self === s} data-eliminated={isEliminated}>
              <div className="d-tele-lineup-top">
                {solo ? <strong>本机单兵席</strong> : seatName(s, report)}
                <div className="d-tele-badges">
                  {isEliminated && <span className="d-seat-elim-tag"><Skull size={10} />R{elimRound}阵亡</span>}
                  {info.shopLevel && <span className="d-tele-chip is-accent">{info.shopLevel}本</span>}
                  {info.strategist && <span className="d-tele-chip">{info.strategist}</span>}
                  {info.pieceCount > 0 && <span className="d-tele-chip">在场 {info.deployedCount}/{info.pieceCount}</span>}
                </div>
              </div>

              {info.deployed.length > 0 && (
                <div className="d-lineup-row-group">
                  <small className="d-lineup-label">在场</small>
                  <div className="d-tele-squad-chips">
                    {info.deployed.map(unit => (
                      <span key={unit.instId} className={`d-tele-op-pill${unit.isGolden ? ' is-gold' : ''}`} title={unit.isGolden ? `${unit.name}（进阶金卡）` : unit.name}>
                        <CompactOperatorBadge name={unit.name} size={18} />
                        <span>{unit.name}</span>
                        {unit.isGolden && <b className="d-gold-star">★</b>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {info.bench.length > 0 && (
                <div className="d-lineup-row-group">
                  <small className="d-lineup-label">整备</small>
                  <div className="d-tele-squad-chips">
                    {info.bench.map(unit => (
                      <span key={unit.instId} className={`d-tele-op-pill is-bench${unit.isGolden ? ' is-gold' : ''}`}>
                        <CompactOperatorBadge name={unit.name} size={16} />
                        <span>{unit.name}</span>
                        {unit.isGolden && <b className="d-gold-star">★</b>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {info.equips.length > 0 && (
                <div className="d-lineup-row-group">
                  <small className="d-lineup-label">装备</small>
                  <div className="d-tele-squad-chips">
                    {info.equips.map(eq => (
                      <span key={eq.instId} className={`d-tele-equip-pill${eq.isGolden ? ' is-gold' : ''}`}>
                        <EquipIcon trapId={eq.trapId} name={eq.name} size={16} />
                        <span>{eq.name}{eq.isGolden ? '★' : ''}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {info.deployed.length === 0 && info.bench.length === 0 && (
                <small className="d-muted">本回合尚无在场棋子快照（等待准备期/购买更新）</small>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function BattleReportTelemetry({ report }: { report?: BattleReport }) {
  const [caliber, setCaliber] = useState<TelemetryCaliber>('active');
  const [metric, setMetric] = useState<TelemetryMetricMode>('damage');
  const [selectedRound, setSelectedRound] = useState<number | 'live'>('live');
  const [seatFilter, setSeatFilter] = useState<number | 'all'>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rootTele = report?.telemetry ?? null;
  const roundNumbers = rootTele ? Object.keys(rootTele.rounds).map(Number).sort((a, b) => a - b) : [];
  const activeSnap: CombatTelemetrySnapshot | null =
    rootTele && selectedRound !== 'live' && rootTele.rounds[selectedRound]
      ? rootTele.rounds[selectedRound]
      : rootTele;

  const solo = isSoloMode(report?.mode);
  const lineups = report?.lineups ?? {};

  if (!report || (!activeSnap && !Object.keys(lineups).length)) {
    return (
      <section className="d-tele-empty">
        <Cpu size={20} />
        <div>
          <h3>当前未进入卫戍协议对局（纯抓包零注入安全模式）</h3>
          <p>
            为保障官服账号 100% 安全、绝不触发「环境存在异常」，本工具采用<strong>纯网络抓包（零内存注入 / 零挂钩）</strong>。
            常规单人关卡（主线 / 肉鸽 / 剿灭）在客户端本地运算无协议帧，因此不会读取其战斗内存；进入<strong>卫戍协议（单人极速 / 单人规程 / 四人模拟）</strong>后，本页将自动呈现实时在场阵容与首领战干员输出图表及估算 DPS。
          </p>
        </div>
      </section>
    );
  }

  const midstream = activeSnap?.coverage === 'midstream';
  const allOperators = activeSnap?.operators ?? [];
  const multiSeats = [...new Set(allOperators.flatMap(o => (o.seat ? [o.seat] : [])))].sort((a, b) => a - b);
  const visibleOps = allOperators
    .filter(op => seatFilter === 'all' || op.seat === seatFilter)
    .filter(op => (metric === 'healing' ? op.healing > 0 || op.onField : op.totalDamage > 0 || op.onField))
    .sort((a, b) =>
      metric === 'healing'
        ? b.healing - a.healing || b.totalDamage - a.totalDamage
        : b.totalDamage - a.totalDamage || b.healing - a.healing,
    );

  const maxPrimary = Math.max(
    1,
    ...visibleOps.map(op => (metric === 'healing' ? op.healing : op.totalDamage)),
  );
  const totalMetricSum = visibleOps.reduce(
    (s, op) => s + (metric === 'healing' ? op.healing : op.totalDamage),
    0,
  );
  const pool = activeSnap?.enemyPool;
  const timeline = activeSnap?.timeline ?? [];
  const durationSec = activeSnap?.logicSeconds ?? null;
  const avgDps = durationSec && durationSec > 0 ? totalMetricSum / durationSec : null;
  const peakDps = timeline.length > 0 ? Math.max(...timeline.map(p => p.dps)) : avgDps;
  const currentDps = timeline.length > 0 ? timeline[timeline.length - 1].dps : avgDps;

  return (
    <div className="d-tele-shell">
      {activeSnap && (
        <header className="d-tele-toolbar">
          <div className="d-tele-scope-group">
            <span className="d-tele-scope-badge" data-scope={activeSnap.scope}>
              <Cpu size={13} />
              {SCOPE_LABELS[activeSnap.scope]}
            </span>
            {activeSnap.stageName && <strong className="d-tele-stage">{activeSnap.stageName}</strong>}
            {activeSnap.retainedRound !== null && (
              <span className="d-tele-retain-chip" title="休整选牌期自动冻结保留上一轮防守算力供复盘">
                冻结复盘 · R{activeSnap.retainedRound} 防守
              </span>
            )}
            <span className="d-tele-coverage" data-coverage={activeSnap.coverage}>
              {activeSnap.coverage === 'protocol'
                ? '卫戍协议实采'
                : midstream
                  ? '中途接入 (≥下限)'
                  : '逻辑帧守卫'}
            </span>
            {durationSec !== null && (
              <span className="d-tele-clock">
                交战时长 <b>{secFmt.format(durationSec)}s</b>
              </span>
            )}
          </div>

          <div className="d-tele-controls">
            {roundNumbers.length > 1 && (
              <select
                aria-label="切换回合遥测快照"
                value={selectedRound}
                onChange={e => setSelectedRound(e.target.value === 'live' ? 'live' : Number(e.target.value))}
              >
                <option value="live">全部累计</option>
                {roundNumbers.map(r => (
                  <option key={r} value={r}>R{r} 首领快照</option>
                ))}
              </select>
            )}
            {!solo && multiSeats.length > 1 && (
              <div className="d-tele-seg-btns" role="group" aria-label="席位筛选">
                <button type="button" aria-pressed={seatFilter === 'all'} onClick={() => setSeatFilter('all')}>全队</button>
                {multiSeats.map(s => (
                  <button key={s} type="button" aria-pressed={seatFilter === s} onClick={() => setSeatFilter(s)}>
                    {seatDisplayText(s, report)}
                  </button>
                ))}
              </div>
            )}
            {activeSnap.coverage !== 'protocol' && (
              <>
                <div className="d-tele-seg-btns" role="group" aria-label="统计维度">
                  <button type="button" aria-pressed={metric === 'damage'} onClick={() => setMetric('damage')}>
                    <Swords size={12} />输出
                  </button>
                  <button type="button" aria-pressed={metric === 'healing'} onClick={() => setMetric('healing')}>
                    <HeartPulse size={12} />治疗
                  </button>
                </div>
                <div className="d-tele-seg-btns" role="group" aria-label="秒伤口径">
                  {(Object.keys(CALIBER_LABELS) as TelemetryCaliber[]).map(key => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={caliber === key}
                      title={CALIBER_LABELS[key].tip}
                      onClick={() => setCaliber(key)}
                    >
                      {CALIBER_LABELS[key].short}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* Top 5-Cell Industrial Telemetry KPI Bar */}
      {visibleOps.length > 0 && (
        <section className="d-tele-kpi-grid" aria-label="核心算力指标">
          <div className="d-tele-kpi is-highlight">
            <small>当前实时 DPS</small>
            <strong>{formatTelemetryRate(currentDps)}</strong>
          </div>
          <div className="d-tele-kpi">
            <small>全程平均 DPS</small>
            <strong>{formatTelemetryRate(avgDps)}</strong>
          </div>
          <div className="d-tele-kpi">
            <small>峰值脉冲 DPS</small>
            <strong className="is-cyan">{formatTelemetryRate(peakDps)}</strong>
          </div>
          <div className="d-tele-kpi">
            <small>交战时长</small>
            <strong>{durationSec !== null ? `${secFmt.format(durationSec)}s` : '—'}</strong>
          </div>
          <div className="d-tele-kpi">
            <small>累计{metric === 'healing' ? '治疗' : '总伤'}</small>
            <strong>{formatTelemetryTotal(totalMetricSum, midstream)}</strong>
          </div>
        </section>
      )}

      {/* Dual Visual Charts: Trend Area SVG + Composition Donut SVG */}
      {visibleOps.length > 0 && (
        <div className="d-tele-charts-grid">
          <DpsAreaChart timeline={timeline} operators={visibleOps} avgDps={avgDps} />
          <CompositionDonut operators={visibleOps} totalDamage={totalMetricSum} metric={metric} />
        </div>
      )}

      {pool && (pool.liveMaxHp > 0 || pool.defeatedCount > 0 || pool.boss) && (
        <section className="d-tele-enemy-bar" aria-label="在场敌方实时血池">
          <div className="d-tele-enemy-meta">
            <span>
              <Flame size={13} />
              {pool.boss ? `首领 · ${pool.boss.name}` : '战场敌方实时血池'}
            </span>
            <span>
              剩余生命 <b>{formatTelemetryTotal(pool.boss ? pool.boss.hp : pool.liveHp)}</b>
              {' / '}
              {formatTelemetryTotal(pool.boss ? pool.boss.maxHp : pool.liveMaxHp)}
            </span>
            {pool.respawnResets > 0 && <span className="d-tele-rebirth">阶段重生 ×{pool.respawnResets}</span>}
          </div>
          <div className="d-tele-hp-track" aria-hidden="true">
            <span
              style={{
                width: `${
                  (pool.boss ? pool.boss.maxHp : pool.liveMaxHp) > 0
                    ? Math.min(
                        100,
                        ((pool.boss ? pool.boss.hp : pool.liveHp) /
                          (pool.boss ? pool.boss.maxHp : pool.liveMaxHp)) *
                          100,
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </section>
      )}

      {activeSnap && visibleOps.length > 0 && (
        <section className="d-tele-matrix" aria-label="干员算力矩阵">
          <div className="d-tele-legend">
            <span>干员输出排行 · 合计 <strong>{formatTelemetryTotal(totalMetricSum, midstream)}</strong></span>
            {metric === 'damage' && activeSnap.coverage !== 'protocol' && (
              <div className="d-tele-channel-key">
                <span><i className="is-phys" />物理</span>
                <span><i className="is-arts" />法术</span>
                <span><i className="is-elem" />元素</span>
                <span><i className="is-true" />真实</span>
              </div>
            )}
          </div>

          <div className="d-tele-rows">
            {visibleOps.map((op, index) => {
              const rowKey = `${op.seat ?? 0}:${op.charId}`;
              const expanded = expandedKey === rowKey;
              const primaryVal = metric === 'healing' ? op.healing : op.totalDamage;
              const share = totalMetricSum > 0 ? (primaryVal / totalMetricSum) * 100 : 0;
              const rate = operatorRateForCaliber(op, caliber, metric);
              const summonPct = op.totalDamage > 0 && op.summonDamage > 0
                ? Math.round((op.summonDamage / op.totalDamage) * 100)
                : 0;

              return (
                <div key={rowKey} className="d-tele-item" data-expanded={expanded}>
                  <button
                    type="button"
                    className="d-tele-row"
                    aria-expanded={expanded}
                    onClick={() => setExpandedKey(expanded ? null : rowKey)}
                  >
                    <span className="d-tele-rank">#{String(index + 1).padStart(2, '0')}</span>
                    <CompactOperatorBadge name={op.name} size={30} />
                    <span className="d-tele-ident">
                      <strong>
                        {op.name}
                        {op.onField && <i className="d-tele-onfield" title="当前在场" />}
                      </strong>
                      <small>
                        {!solo && op.seat ? `${seatDisplayText(op.seat, report)} · ` : ''}
                        {summonPct > 0 ? `召唤物 ${summonPct}%` : op.hits ? `有效记录 ${op.hits} 次` : '参战干员'}
                      </small>
                    </span>
                    <SegmentedEnergyBar op={op} maxValue={maxPrimary} metric={metric} rank={index} />
                    <span className="d-tele-total">
                      <b>{formatTelemetryTotal(primaryVal, midstream)}</b>
                      <small>{pctFmt.format(share)}%</small>
                    </span>
                    <span className="d-tele-rate">
                      <b>{formatTelemetryRate(rate)}</b>
                      <small>{activeSnap.coverage === 'protocol' ? '估算 DPS' : CALIBER_LABELS[caliber].short}</small>
                    </span>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {expanded && (
                    <div className="d-tele-drawer">
                      <div className="d-tele-drawer-grid">
                        <div><span>累计输出</span><b>{formatTelemetryTotal(op.totalDamage, midstream)}</b></div>
                        <div><span>全队占比</span><b className="c-elem">{pctFmt.format(share)}%</b></div>
                        <div><span>估算/激战秒伤</span><b className="c-arts">{formatTelemetryRate(op.activeDps)}</b></div>
                        {op.physical > 0 && <div><span>物理伤害</span><b>{formatTelemetryTotal(op.physical, midstream)}</b></div>}
                        {op.arts > 0 && <div><span>法术伤害</span><b className="c-arts">{formatTelemetryTotal(op.arts, midstream)}</b></div>}
                        {op.elemental > 0 && <div><span>元素伤害</span><b className="c-elem">{formatTelemetryTotal(op.elemental, midstream)}</b></div>}
                        {op.trueDamage > 0 && <div><span>真实伤害</span><b className="c-true">{formatTelemetryTotal(op.trueDamage, midstream)}</b></div>}
                        {op.healing > 0 && <div><span>直接治疗</span><b className="c-heal">{formatTelemetryTotal(op.healing, midstream)}</b></div>}
                        {op.pulseDps !== null && <div><span>5s 脉冲</span><b>{formatTelemetryRate(op.pulseDps)}</b></div>}
                        {op.spanDps !== null && <div><span>在场均伤</span><b>{formatTelemetryRate(op.spanDps)}</b></div>}
                        {op.activeSeconds !== null && (
                          <div><span>交战时长</span><b>{secFmt.format(op.activeSeconds)}s</b></div>
                        )}
                        {op.shieldGuarded !== null && (
                          <div><span><Shield size={11} />护盾实吸</span><b>{formatTelemetryTotal(op.shieldGuarded)}</b></div>
                        )}
                        {op.overkillTrimmed !== null && (
                          <div><span>过量剥离</span><b>{formatTelemetryTotal(op.overkillTrimmed)}</b></div>
                        )}
                      </div>

                      {op.children.length > 0 && (
                        <div className="d-tele-summons">
                          <h4><Sparkles size={12} />本体与召唤物归并拆解</h4>
                          <ul>
                            <li>
                              <span>{op.name}（本体）</span>
                              <b>{formatTelemetryTotal(Math.max(0, op.totalDamage - op.summonDamage), midstream)}</b>
                            </li>
                            {op.children.map(child => (
                              <li key={child.unitId}>
                                <span>{child.name}（召唤物）</span>
                                <b>{formatTelemetryTotal(child.totalDamage, midstream)}</b>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {activeSnap.stageDevices.length > 0 && (
            <details className="d-round-fold d-tele-devices">
              <summary>场地装置独立统计 · {activeSnap.stageDevices.length} 项（不计入干员输出占比）</summary>
              <div className="d-tele-device-list">
                {activeSnap.stageDevices.map(dev => (
                  <div key={dev.unitId}>
                    <span>{dev.name}</span>
                    <b>{formatTelemetryTotal(dev.totalDamage, midstream)}</b>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {visibleOps.length === 0 && (
        <section className="d-tele-empty is-compact">
          <Cpu size={18} />
          <div>
            <h3>当前为普通备战 / 防守回合，进入首领战后自动汇入干员输出图表与 DPS</h3>
            <p>
              卫戍协议普通防守波次不下发逐干员伤害明细；进入首领波次（极速模拟 R9 / 常规 R14·R15）后，将实时呈现干员输出排行、趋势面积图与占比环。下方为当前实局场内阵容快照。
            </p>
          </div>
        </section>
      )}

      <SeatLineupsStrip report={report} lineups={lineups} solo={solo} />
    </div>
  );
}
