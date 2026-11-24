import { useId, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Cpu, Flame, HeartPulse, Shield, Skull, Sparkles, Swords, Users } from 'lucide-react';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import { REPORT_SEATS, type BattleReport } from './battleReportData';
import { seatDisplayText, seatName } from './BattleReportPanels';
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

const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const secFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const DONUT_PALETTE = ['#ffe600', '#00e5ff', '#34d399', '#c7b1ff', '#fb923c', '#94a3b8'];

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

function DpsAreaChart({ timeline, operators }: { timeline: TimelinePoint[]; operators: OperatorTelemetry[] }) {
  const gradId = useId();
  // If protocol timeline has >=2 points, plot real elapsed curve; else synthesize bar profile from top ops
  const hasCurve = timeline.length >= 2;
  if (!hasCurve) {
    if (!operators.length) return null;
    const top = operators.slice(0, 8);
    const maxDmg = Math.max(1, ...top.map(o => o.totalDamage));
    return (
      <section className="d-chart-card" aria-label="干员输出柱状对比图">
        <header className="d-chart-head">
          <span><Activity size={13} />干员总伤对比分布</span>
          <small>Top {top.length}</small>
        </header>
        <div className="d-mini-col-chart">
          {top.map((op, i) => {
            const h = Math.max(8, Math.round((op.totalDamage / maxDmg) * 76));
            return (
              <div key={`${op.seat ?? 0}:${op.charId}`} className="d-mini-col-item" title={`${op.name} · ${formatTelemetryTotal(op.totalDamage)}`}>
                <small className="d-mini-col-val">{formatTelemetryTotal(op.totalDamage)}</small>
                <span className="d-mini-col-track">
                  <i style={{ height: `${h}px`, background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                </span>
                <span className="d-mini-col-name">{op.name}</span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const width = 460;
  const height = 112;
  const padL = 38;
  const padR = 12;
  const padT = 12;
  const padB = 20;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxT = Math.max(1, timeline[timeline.length - 1].t);
  const maxDps = Math.max(10, ...timeline.map(p => p.dps));
  const peakPt = timeline.reduce((best, p) => (p.dps > best.dps ? p : best), timeline[0]);

  const toX = (t: number) => padL + (t / maxT) * innerW;
  const toY = (v: number) => padT + innerH - (v / maxDps) * innerH;

  const linePoints = timeline.map(p => `${toX(p.t).toFixed(1)},${toY(p.dps).toFixed(1)}`).join(' ');
  const areaPath = `M ${toX(timeline[0].t).toFixed(1)},${(padT + innerH).toFixed(1)} `
    + timeline.map(p => `L ${toX(p.t).toFixed(1)},${toY(p.dps).toFixed(1)}`).join(' ')
    + ` L ${toX(timeline[timeline.length - 1].t).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  return (
    <section className="d-chart-card" aria-label="实时 DPS 脉冲趋势图">
      <header className="d-chart-head">
        <span><Activity size={13} />实时 DPS 输出趋势</span>
        <small>峰值 {formatTelemetryRate(peakPt.dps)} @ {secFmt.format(peakPt.t)}s</small>
      </header>
      <svg className="d-area-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="实时秒伤趋势面积图">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => {
          const y = padT + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#1f2733" strokeDasharray={f === 0 ? undefined : '3 3'} />
              <text x={padL - 5} y={y + 3} textAnchor="end" fill="#7c8799" fontSize="9" fontFamily="Consolas, monospace">
                {formatTelemetryTotal(maxDps * f)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill={`url(#${gradId})`} />
        <polyline points={linePoints} fill="none" stroke="#00e5ff" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={toX(peakPt.t)} cy={toY(peakPt.dps)} r="3.2" fill="#ffe600" stroke="#0b0c0e" strokeWidth="1.2" />
        {[0, 0.5, 1].map(f => (
          <text key={`t-${f}`} x={padL + innerW * f} y={height - 4} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fill="#7c8799" fontSize="9" fontFamily="Consolas, monospace">
            {secFmt.format(maxT * f)}s
          </text>
        ))}
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
    if (phys > 0) slices.push({ label: '物理', value: phys, color: '#d8dee9' });
    if (arts > 0) slices.push({ label: '法术', value: arts, color: '#00e5ff' });
    if (elem > 0) slices.push({ label: '元素', value: elem, color: '#ffe600' });
    if (trueD > 0) slices.push({ label: '真实', value: trueD, color: '#ff3b30' });
  } else {
    const top = operators.slice(0, 5);
    top.forEach((op, idx) => {
      const val = metric === 'healing' ? op.healing : op.totalDamage;
      if (val > 0) slices.push({ label: op.name, value: val, color: DONUT_PALETTE[idx % DONUT_PALETTE.length] });
    });
    const rest = operators.slice(5).reduce((s, o) => s + (metric === 'healing' ? o.healing : o.totalDamage), 0);
    if (rest > 0) slices.push({ label: '其余干员', value: rest, color: '#475569' });
  }

  const sum = slices.reduce((s, x) => s + x.value, 0);
  if (sum <= 0) return null;

  const r = 34;
  const cx = 46;
  const cy = 46;
  const circ = 2 * Math.PI * r;
  let acc = 0;

  return (
    <section className="d-chart-card d-donut-card" aria-label="输出构成环形图">
      <header className="d-chart-head">
        <span>{hasChannels ? '属性伤害构成' : metric === 'healing' ? '治疗贡献构成' : '主力输出占比'}</span>
        <small>{slices.length} 项</small>
      </header>
      <div className="d-donut-body">
        <svg viewBox="0 0 92 92" className="d-donut-svg" role="img" aria-label="构成环形图">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#181f2a" strokeWidth="11" />
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
                strokeWidth="11"
                strokeDasharray={`${Math.max(1, len - 1)} ${circ}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}
          <text x={cx} y={cy - 2} textAnchor="middle" fill="#f8fafc" fontSize="11.5" fontWeight="700" fontFamily="Consolas, monospace">
            {formatTelemetryTotal(sum)}
          </text>
          <text x={cx} y={cy + 11} textAnchor="middle" fill="#8e99aa" fontSize="8.5">
            {metric === 'healing' ? '累计治疗' : '累计输出'}
          </text>
        </svg>
        <ul className="d-donut-legend">
          {slices.map(sl => (
            <li key={sl.label}>
              <i style={{ background: sl.color }} />
              <span className="d-donut-name">{sl.label}</span>
              <b>{pctFmt.format((sl.value / sum) * 100)}%</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SegmentedEnergyBar({ op, maxValue, metric }: {
  op: OperatorTelemetry;
  maxValue: number;
  metric: TelemetryMetricMode;
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
        <span className="d-tele-seg is-arts" style={{ width: `${width}%` }} title={`协议总伤 ${formatTelemetryTotal(total)}`} />
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
                        {eq.name}{eq.isGolden ? '★' : ''}
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
          <DpsAreaChart timeline={timeline} operators={visibleOps} />
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
                    <SegmentedEnergyBar op={op} maxValue={maxPrimary} metric={metric} />
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
