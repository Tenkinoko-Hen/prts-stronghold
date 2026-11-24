import { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, Flame, HeartPulse, Shield, Sparkles, Swords, Users } from 'lucide-react';
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
} from './combatTelemetry';

const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const secFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

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
  const scale = Math.min(100, (total / maxValue) * 100) / total;
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
    <section className="d-tele-lineups" aria-label="本局席位构筑与策略家">
      <header className="d-tele-subhead">
        <span><Users size={13} />{solo ? '单兵构筑与策略家' : '四席实时本数与构筑快照'}</span>
        <small>源自卫戍协议下行帧</small>
      </header>
      <div className="d-tele-lineup-grid" data-solo={solo}>
        {activeSeats.map(s => {
          const info = lineups[s]!;
          const activeOps = info.squad.filter(slot => !slot.isBanned);
          const bannedOps = info.squad.filter(slot => slot.isBanned);
          return (
            <article key={s} className="d-tele-lineup-card" data-self={report.self === s}>
              <div className="d-tele-lineup-top">
                {solo ? <strong>本机单兵席</strong> : seatName(s, report)}
                <div className="d-tele-badges">
                  {info.shopLevel && <span className="d-tele-chip is-accent">{info.shopLevel}本</span>}
                  {info.strategist && <span className="d-tele-chip">{info.strategist}</span>}
                  {info.deployedCount > 0 && <span className="d-tele-chip">在场 {info.deployedCount}/{info.pieceCount}</span>}
                </div>
              </div>
              {activeOps.length > 0 && (
                <div className="d-tele-squad-chips">
                  {activeOps.slice(0, 8).map(slot => (
                    <span key={slot.charId || slot.chessId} className="d-tele-op-pill" title={slot.covenants.join(' · ')}>
                      <CompactOperatorBadge name={slot.name} size={18} />
                      <span>{slot.name}</span>
                    </span>
                  ))}
                  {activeOps.length > 8 && <small className="d-muted">+{activeOps.length - 8}</small>}
                </div>
              )}
              {bannedOps.length > 0 && (
                <small className="d-tele-banned-note">
                  本席受限干员：{bannedOps.map(b => b.name).join('、')}
                </small>
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
          <h3>等待算力遥测数据接入</h3>
          <p>
            进入常规单人关卡（主线 / 活动 / 集成战略 / 剿灭）或卫戍协议战斗后，本面板自动汇入四维属性伤害、直接治疗与三口径逻辑秒伤；无需注入客户端，不触发环境异常。
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
                ? '协议归因'
                : midstream
                  ? '中途接入 (≥下限)'
                  : '只读帧守卫'}
            </span>
            {activeSnap.logicSeconds !== null && (
              <span className="d-tele-clock" title="仅计局内定点数逻辑帧，暂停与 2× 倍速零抖动">
                逻辑时钟 <b>{secFmt.format(activeSnap.logicSeconds)}s</b>
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
                <option value="live">当前实时域</option>
                {roundNumbers.map(r => (
                  <option key={r} value={r}>R{r} 归档快照</option>
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
          </div>
        </header>
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
            <span>在场 <b>{pool.activeCount}</b> · 已歼灭 <b>{pool.defeatedCount}</b></span>
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

      <SeatLineupsStrip report={report} lineups={lineups} solo={solo} />

      {activeSnap && (
        <section className="d-tele-matrix" aria-label="干员算力矩阵">
          <div className="d-tele-legend">
            <span>队伍累计{metric === 'healing' ? '治疗' : '输出'} <strong>{formatTelemetryTotal(totalMetricSum, midstream)}</strong></span>
            {metric === 'damage' && (
              <div className="d-tele-channel-key">
                <span><i className="is-phys" />物理</span>
                <span><i className="is-arts" />法术</span>
                <span><i className="is-elem" />元素</span>
                <span><i className="is-true" />真实</span>
              </div>
            )}
          </div>

          {visibleOps.length === 0 ? (
            <p className="d-muted d-report-note">当前筛选条件下暂无已记录的{metric === 'healing' ? '治疗' : '输出'}干员。</p>
          ) : (
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
                          {summonPct > 0 ? `召唤物 ${summonPct}%` : op.hits ? `命中 ${op.hits} 次` : '主力干员'}
                        </small>
                      </span>
                      <SegmentedEnergyBar op={op} maxValue={maxPrimary} metric={metric} />
                      <span className="d-tele-total">
                        <b>{formatTelemetryTotal(primaryVal, midstream)}</b>
                        <small>{pctFmt.format(share)}%</small>
                      </span>
                      <span className="d-tele-rate">
                        <b>{formatTelemetryRate(rate)}</b>
                        <small>{CALIBER_LABELS[caliber].short}</small>
                      </span>
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {expanded && (
                      <div className="d-tele-drawer">
                        <div className="d-tele-drawer-grid">
                          <div><span>物理伤害</span><b>{formatTelemetryTotal(op.physical, midstream)}</b></div>
                          <div><span>法术伤害</span><b className="c-arts">{formatTelemetryTotal(op.arts, midstream)}</b></div>
                          <div><span>元素伤害</span><b className="c-elem">{formatTelemetryTotal(op.elemental, midstream)}</b></div>
                          <div><span>真实伤害</span><b className="c-true">{formatTelemetryTotal(op.trueDamage, midstream)}</b></div>
                          <div><span>直接治疗</span><b className="c-heal">{formatTelemetryTotal(op.healing, midstream)}</b></div>
                          <div><span>激战秒伤</span><b>{formatTelemetryRate(op.activeDps)}</b></div>
                          <div><span>5s 脉冲</span><b>{formatTelemetryRate(op.pulseDps)}</b></div>
                          <div><span>在场均伤</span><b>{formatTelemetryRate(op.spanDps)}</b></div>
                          {op.activeSeconds !== null && (
                            <div><span>交战 / 在场时长</span><b>{secFmt.format(op.activeSeconds)}s / {secFmt.format(op.presenceSeconds ?? 0)}s</b></div>
                          )}
                          {op.shieldGuarded !== null && (
                            <div><span><Shield size={11} />护盾实吸</span><b>{formatTelemetryTotal(op.shieldGuarded)}</b></div>
                          )}
                          {op.overkillTrimmed !== null && (
                            <div><span>过量剥离</span><b>{formatTelemetryTotal(op.overkillTrimmed)}</b></div>
                          )}
                          {op.mitigationRatio !== null && (
                            <div>
                              <span>护甲/法抗折损率</span>
                              <b className={op.mitigationRatio >= 0.65 ? 'c-true' : ''}>
                                {pctFmt.format(op.mitigationRatio * 100)}%
                                {op.mitigationRatio >= 0.65 ? ' · 抛光预警' : ''}
                              </b>
                            </div>
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
          )}

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
    </div>
  );
}
