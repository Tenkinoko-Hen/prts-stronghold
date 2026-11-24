// 青逝痕 Tenkinoko 制作
import { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Cpu,
  Download,
  Flame,
  Heart,
  Layers,
  LayoutGrid,
  Radio,
  ShieldAlert,
  Skull,
  Swords,
  Unlink,
  Users,
  Wifi,
} from 'lucide-react';
import { META_COMPS } from '../data/strongholdData';
import { getRecommendedPaceForRound, rankCompsByBanState } from '../utils/tacticalLogic';
import {
  defaultBossRound,
  isHiddenBossRound,
  readBattleReport,
  REPORT_SEATS,
  reportLeader,
  roundMetrics,
  type BattleReport,
} from '../desktop/battleReportData';
import { BattleReportDeckPool } from '../desktop/BattleReportDeckPool';
import { BossDamage, LeaderInlineBar, seatDisplayText } from '../desktop/BattleReportPanels';
import { RoundMatrix } from '../desktop/BattleReportRounds';
import { BattleReportTelemetry, CompactOperatorBadge } from '../desktop/BattleReportTelemetry';
import { EquipIcon } from '../desktop/EquipIcon';
import { formatTelemetryRate, formatTelemetryTotal, isSoloMode } from '../desktop/combatTelemetry';
import { PRTS_CHART } from '../desktop/prtsChartKit';
import type { MobileLanBridgeState } from './MobileLanPanel';
import '../desktop/battleReports.css';
import './secondScreen.css';

export type SecondScreenTab = 'overview' | 'lineup' | 'deck' | 'rounds' | 'combat';

const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const;

export function MobileSecondScreen({
  lan,
  onDisconnect,
  onImportReport,
  productMode = 'full',
}: {
  lan: MobileLanBridgeState;
  onDisconnect(): void;
  onImportReport?: (report: BattleReport) => void;
  productMode?: 'full' | 'telemetry';
}) {
  const [tab, setTab] = useState<SecondScreenTab>('overview');
  const [combatSub, setCombatSub] = useState<'telemetry' | 'boss'>('telemetry');
  const [bossRoundPick, setBossRoundPick] = useState<number | null>(null);
  const [guideRoundOverride, setGuideRoundOverride] = useState<number | null>(null);

  const report = useMemo<BattleReport | null>(() => {
    try {
      return lan.payload?.report ? readBattleReport(lan.payload.report) : null;
    } catch {
      return null;
    }
  }, [lan.payload?.report]);

  const guide = lan.payload?.guide;
  const solo = isSoloMode(report?.mode);
  const selfSeat = report?.self ?? (solo ? 1 : 1);
  const liveRound = report?.current || report?.rounds.at(-1)?.number || guide?.currentRound || 1;
  const selfLineup = report ? report.lineups[selfSeat] : undefined;
  const selfHp = report ? report.hp[selfSeat] : undefined;
  const bannedCovenants = report?.bannedCovenants.length
    ? report.bannedCovenants
    : (guide?.bannedCovenants ?? []);

  const activeComp = useMemo(() => {
    if (guide?.selectedCompId) {
      const exact = META_COMPS.find(c => c.id === guide.selectedCompId);
      if (exact) return exact;
    }
    if (guide?.compTitle) {
      const byTitle = META_COMPS.find(c => c.title === guide.compTitle);
      if (byTitle) return byTitle;
    }
    const ranked = rankCompsByBanState(META_COMPS, { bannedCovenants, bannedOperators: [] });
    return ranked.find(item => item.status !== 'blocked')?.comp ?? META_COMPS[0];
  }, [guide?.selectedCompId, guide?.compTitle, bannedCovenants]);

  const guideRound = guideRoundOverride ?? Math.max(1, Math.min(15, liveRound));
  const pace = useMemo(() => getRecommendedPaceForRound(activeComp, guideRound), [activeComp, guideRound]);
  const activePhase = useMemo(
    () => activeComp.phases.find(p => p.phaseName === pace.activePhaseName) ?? activeComp.phases[0],
    [activeComp, pace.activePhaseName],
  );

  const suggestedOperatorNames = useMemo(
    () => [...new Set(activeComp.phases.flatMap(p => [...p.fieldOperators.map(o => o.name), ...p.benchOperators.map(o => o.name)]))],
    [activeComp],
  );
  const suggestedEquipNames = useMemo(() => activeComp.equipmentTips, [activeComp]);

  const bossRound = bossRoundPick ?? defaultBossRound(report ?? undefined);
  const leader = report ? reportLeader(report, bossRound) : undefined;
  const hiddenLeader = report ? isHiddenBossRound(report, bossRound) : false;

  const topOps = useMemo(
    () => (report?.telemetry?.operators ?? []).filter(o => o.totalDamage > 0).slice(0, 5),
    [report],
  );
  const maxOpDmg = Math.max(1, ...topOps.map(o => o.totalDamage));
  const bossPool = report?.telemetry?.enemyPool?.boss;

  const upcomingSpawns = useMemo(
    () => (report?.preview ?? []).filter(p => p.round === liveRound && p.kind === 'plan').slice(0, 6),
    [report, liveRound],
  );

  const seatSummaries = useMemo(() => {
    if (!report) return [];
    const seats = solo ? ([1] as const) : REPORT_SEATS;
    return seats.map(seat => {
      const elim = report.eliminated[seat];
      const hp = report.hp[seat];
      const lineup = report.lineups[seat];
      let leaks = 0;
      let assists = 0;
      for (const r of report.rounds) {
        if (elim !== undefined && r.number > elim) continue;
        const [lk, as] = roundMetrics(r, seat, report.self);
        leaks += lk?.value ?? 0;
        assists += as?.value ?? 0;
      }
      return { seat, elim, hp, lineup, leaks, assists };
    });
  }, [report, solo]);

  const tabs: { id: SecondScreenTab; label: string; icon: typeof LayoutGrid; badge?: string | number }[] = productMode === 'full'
    ? [
      { id: 'overview', label: '态势总览', icon: LayoutGrid },
      { id: 'lineup', label: '阵容攻略', icon: BookOpen },
      { id: 'deck', label: '当局牌库', icon: Layers, badge: report?.deckPool?.operators.length },
      { id: 'rounds', label: '战报兜底', icon: Activity, badge: report?.rounds.length || undefined },
      { id: 'combat', label: '算力/Boss', icon: Swords, badge: topOps.length || undefined },
    ]
    : [
      { id: 'overview', label: '态势总览', icon: LayoutGrid },
      { id: 'deck', label: '当局牌库', icon: Layers, badge: report?.deckPool?.operators.length },
      { id: 'rounds', label: '战报兜底', icon: Activity, badge: report?.rounds.length || undefined },
      { id: 'combat', label: '算力/Boss', icon: Swords, badge: topOps.length || undefined },
    ];

  const isReconnecting = lan.status === 'reconnecting';
  const reportEnded = Boolean(lan.payload?.reportEnded);
  const statusText = isReconnecting
    ? '重连中…'
    : !report
      ? '待开局'
      : reportEnded
        ? `回放 · R${String(liveRound).padStart(2, '0')}`
        : `LIVE · R${String(liveRound).padStart(2, '0')}`;

  return (
    <div className="ms-root" data-reconnecting={isReconnecting}>
      {/* Fixed Compact Landscape Top Tactical Bar (40px) */}
      <header className="ms-topbar">
        <div className="ms-brand">
          <span className="ms-chip">PRTS</span>
          <span className="ms-live-pill" data-tone={isReconnecting ? 'warn' : report && !reportEnded ? 'live' : 'idle'}>
            <i />
            {statusText}
          </span>
          {report?.difficulty && <span className="ms-meta-tag">{report.difficulty}</span>}
          {selfLineup?.shopLevel && <span className="ms-meta-tag is-ochre">{selfLineup.shopLevel}本</span>}
          {selfHp !== undefined && (
            <span className="ms-meta-tag" data-low={selfHp <= 5}>
              <Heart size={10} />{selfHp}
            </span>
          )}
        </div>

        <nav className="ms-nav" aria-label="无线副屏模块切换">
          {tabs.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="ms-tab"
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                <Icon size={13} />
                <span>{item.label}</span>
                {item.badge !== undefined && <em>{item.badge}</em>}
              </button>
            );
          })}
        </nav>

        <div className="ms-actions">
          {onImportReport && report && (
            <button
              type="button"
              className="ms-act-btn is-save"
              title="导入本局战报至手机相册导出"
              onClick={() => onImportReport(report)}
            >
              <Download size={12} />
              <span>存战报</span>
            </button>
          )}
          <button
            type="button"
            className="ms-act-btn is-exit"
            title="断开电脑无线副屏并自动返回手机攻略界面"
            onClick={onDisconnect}
          >
            <Unlink size={12} />
            <span>断开</span>
          </button>
        </div>
      </header>

      {/* Main Horizontal Viewport Body */}
      <main className="ms-body">
        {tab === 'overview' && (
          <div className="ms-overview-grid">
            {/* Left Column: Current Tactical Guide + Live Combat / Standby Radar */}
            <div className="ms-col">
              <section className="ms-card is-accent">
                <header className="ms-card-head">
                  <span><b className="d-prts-slash">//</b>R{String(liveRound).padStart(2, '0')} 当前战术节奏</span>
                  <small>{guide?.compTitle || activeComp.title}</small>
                </header>
                <p className="ms-pace-copy">
                  {guide?.paceTip || `推荐 ${pace.recommendedTier} 本 · ${pace.currentAction || activeComp.strategistTip}`}
                </p>
                {bannedCovenants.length > 0 && (
                  <div className="ms-ban-strip">
                    <small>受限盟约</small>
                    {bannedCovenants.map(name => <span key={name}>{name}</span>)}
                  </div>
                )}
              </section>

              {!report ? (
                <section className="ms-card ms-standby-card">
                  <div className="ms-standby-top">
                    <Radio size={18} className="ms-radar-icon" />
                    <div>
                      <strong>已连接电脑副屏 · {lan.peerProduct || 'PRTS Stronghold'}</strong>
                      <small>{lan.host}:{lan.port} · 等待游戏进入卫戍对局</small>
                    </div>
                  </div>
                  <p className="ms-standby-desc">
                    进入对局后，本屏将自动同步实时回合承压、队友漏怪兜底、当局干员/装备牌池余量与抽卡概率，以及首领战算力曲线。顶部标签可随时自由切换。
                  </p>
                  <div className="ms-standby-shortcuts">
                    {productMode === 'full' && (
                      <button type="button" className="ms-quick-btn" onClick={() => setTab('lineup')}>
                        <BookOpen size={13} />先看当前阵容路线
                      </button>
                    )}
                    <button type="button" className="ms-quick-btn" onClick={() => setTab('deck')}>
                      <Layers size={13} />查看当局牌库
                    </button>
                  </div>
                </section>
              ) : topOps.length > 0 ? (
                <section className="ms-card">
                  <header className="ms-card-head">
                    <span><b className="d-prts-slash">//</b>实时干员算力排行</span>
                    <button type="button" className="ms-link-btn" onClick={() => setTab('combat')}>
                      完整曲线 →
                    </button>
                  </header>
                  {bossPool && bossPool.maxHp > 0 && (
                    <div className="ms-boss-mini-hp">
                      <div>
                        <span><Flame size={11} />{bossPool.name}</span>
                        <b>{formatTelemetryTotal(bossPool.hp)} / {formatTelemetryTotal(bossPool.maxHp)}</b>
                      </div>
                      <span className="ms-hp-bar">
                        <i style={{ width: `${Math.min(100, (bossPool.hp / bossPool.maxHp) * 100)}%` }} />
                      </span>
                    </div>
                  )}
                  <div className="ms-op-bars">
                    {topOps.map((op, idx) => (
                      <div key={`${op.seat ?? 0}:${op.charId}`} className="ms-op-row">
                        <small>#{idx + 1}</small>
                        <CompactOperatorBadge name={op.name} size={20} />
                        <strong>{op.name}</strong>
                        <span className="ms-bar-track">
                          <i
                            style={{
                              width: `${Math.max(5, (op.totalDamage / maxOpDmg) * 100)}%`,
                              background: idx === 0 ? PRTS_CHART.ochre : PRTS_CHART.blue,
                            }}
                          />
                        </span>
                        <b>{formatTelemetryTotal(op.totalDamage)}</b>
                        <em>{op.activeDps != null ? formatTelemetryRate(op.activeDps) : ''}</em>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="ms-card">
                  <header className="ms-card-head">
                    <span><b className="d-prts-slash">//</b>R{liveRound} 本波出怪预告</span>
                    <button type="button" className="ms-link-btn" onClick={() => setTab('rounds')}>
                      战报明细 →
                    </button>
                  </header>
                  {upcomingSpawns.length > 0 ? (
                    <div className="ms-spawn-chips">
                      {upcomingSpawns.map((sp, i) => (
                        <span key={`${sp.id}-${i}`}>
                          {sp.name}<b>×{sp.count ?? '?'}</b>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="ms-muted">本波出怪预告暂未到达，可切换至「当局牌库」查抽卡概率或「阵容攻略」核对站位。</p>
                  )}
                </section>
              )}
            </div>

            {/* Right Column: Live 4-Seat Status / Self Board + Quick Deck Pool Summary */}
            <div className="ms-col">
              {report ? (
                <>
                  <section className="ms-card">
                    <header className="ms-card-head">
                      <span><b className="d-prts-slash">//</b>{solo ? '单兵实时态势' : '四席实时态势'}</span>
                      <small>{report.rounds.length} 回合已录</small>
                    </header>
                    <div className="ms-seat-list">
                      {seatSummaries.map(({ seat, elim, hp, lineup, leaks, assists }) => {
                        const isSelf = seat === report.self;
                        const eliminated = elim !== undefined;
                        return (
                          <div key={seat} className="ms-seat-item" data-self={isSelf} data-elim={eliminated}>
                            <div className="ms-seat-top">
                              <span className="ms-seat-name">
                                {seatDisplayText(seat, report)}
                                {isSelf && <em>我</em>}
                              </span>
                              <div className="ms-seat-nums">
                                {lineup?.shopLevel && <small className="is-tier">{lineup.shopLevel}本</small>}
                                {eliminated ? (
                                  <small className="is-dead"><Skull size={10} />R{elim}阵亡</small>
                                ) : hp !== undefined ? (
                                  <small className="is-hp"><Heart size={10} />{hp}</small>
                                ) : null}
                                <small className={leaks > 0 ? 'is-loss' : 'is-clean'}>漏 {leaks}</small>
                                {!solo && <small className="is-help">兜 +{assists}</small>}
                              </div>
                            </div>
                            {lineup && lineup.deployed.length > 0 && (
                              <div className="ms-seat-units">
                                {lineup.deployed.slice(0, 8).map(u => (
                                  <span key={u.instId} className={u.isGolden ? 'is-gold' : ''}>
                                    <CompactOperatorBadge name={u.name} size={16} />
                                    {u.name}{u.isGolden ? '★' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {report.deckPool && (
                    <section className="ms-card ms-pool-glance">
                      <header className="ms-card-head">
                        <span><b className="d-prts-slash">//</b>当局牌池速览</span>
                        <button type="button" className="ms-link-btn" onClick={() => setTab('deck')}>
                          概率计算器 →
                        </button>
                      </header>
                      <div className="ms-tier-mini-grid">
                        {report.deckPool.tierSummary.map(ts => {
                          const unlocked = ts.tier <= (selfLineup?.shopLevel ?? 1);
                          return (
                            <div key={ts.tier} data-locked={!unlocked}>
                              <small>{TIER_ROMAN[ts.tier]}本</small>
                              <b>{ts.remainingCopies}<em>/{ts.totalCopies}</em></b>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <section className="ms-card">
                  <header className="ms-card-head">
                    <span><b className="d-prts-slash">//</b>当前核心阵容预览 · {activeComp.title}</span>
                    <small>{activeComp.strategist}</small>
                  </header>
                  <div className="ms-core-ops">
                    {(activePhase?.fieldOperators ?? []).map((op, idx) => (
                      <div key={`${op.name}-${idx}`} className="ms-core-op-chip">
                        <CompactOperatorBadge name={op.name} size={22} />
                        <div>
                          <strong>{op.name}</strong>
                          <small>{op.tier}阶 · {op.role}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="ms-muted" style={{ marginTop: '6px' }}>{activeComp.coreHighlight}</p>
                </section>
              )}
            </div>
          </div>
        )}

        {tab === 'lineup' && (
          <div className="ms-lineup-grid">
            {/* Left: Live PC Board, Bench, Equips & Shop Shelf */}
            <section className="ms-card">
              <header className="ms-card-head">
                <span><b className="d-prts-slash">//</b>PC 实时场内阵容与商店货架</span>
                <small>{report ? `${Object.keys(report.lineups).length} 席快照` : '等待开局'}</small>
              </header>
              {report && Object.keys(report.lineups).length > 0 ? (
                <div className="ms-live-boards">
                  {(solo ? [1] : REPORT_SEATS).filter(s => report.lineups[s]).map(s => {
                    const info = report.lineups[s];
                    const elim = report.eliminated[s];
                    return (
                      <article key={s} className="ms-board-card" data-self={s === report.self} data-elim={elim !== undefined}>
                        <div className="ms-board-head">
                          <strong>
                            {seatDisplayText(s, report)}
                            {s === report.self && <em>我</em>}
                          </strong>
                          <div>
                            {info.shopLevel && <span className="ms-tag is-ochre">{info.shopLevel}本</span>}
                            {info.strategist && <span className="ms-tag">{info.strategist}</span>}
                            {elim !== undefined && <span className="ms-tag is-dead">R{elim}阵亡</span>}
                          </div>
                        </div>
                        {info.deployed.length > 0 && (
                          <div className="ms-board-row">
                            <small>在场</small>
                            <div>
                              {info.deployed.map(u => (
                                <span key={u.instId} className={`ms-unit-pill${u.isGolden ? ' is-gold' : ''}`}>
                                  <CompactOperatorBadge name={u.name} size={18} />
                                  {u.name}{u.isGolden ? '★' : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {info.bench.length > 0 && (
                          <div className="ms-board-row">
                            <small>整备</small>
                            <div>
                              {info.bench.map(u => (
                                <span key={u.instId} className="ms-unit-pill is-bench">
                                  <CompactOperatorBadge name={u.name} size={16} />
                                  {u.name}{u.isGolden ? '★' : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {info.equips.length > 0 && (
                          <div className="ms-board-row">
                            <small>装备</small>
                            <div>
                              {info.equips.map(eq => (
                                <span key={eq.instId} className={`ms-equip-pill${eq.isGolden ? ' is-gold' : ''}`}>
                                  <EquipIcon trapId={eq.trapId} name={eq.name} size={15} />
                                  <span>{eq.name}{eq.isGolden ? '★' : ''}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {s === report.self && info.shopGoods.length > 0 && (
                          <div className="ms-board-row">
                            <small>货架</small>
                            <div>
                              {info.shopGoods.map(g => (
                                <span key={`${g.slot}-${g.name}`} className="ms-shop-pill">
                                  {g.kind === 'operator'
                                    ? <CompactOperatorBadge name={g.name} size={15} />
                                    : <EquipIcon trapId={g.trapId} name={g.name} size={15} />}
                                  <span>{g.name}</span>
                                  <em>{g.price}金</em>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="ms-empty-box">
                  <Users size={16} />
                  <span>进入卫戍协议对局后，此处实时同步你与队友的在场棋子、整备席、装备与当前商店货架。</span>
                </div>
              )}
            </section>

            {/* Right: Active Guide Plan & R1-R15 Round Pace Browser */}
            <section className="ms-card">
              <header className="ms-card-head">
                <span><b className="d-prts-slash">//</b>{activeComp.title} · 阶段指引</span>
                <small>{activeComp.strategist}</small>
              </header>
              <div className="ms-round-strip" role="group" aria-label="快速浏览回合攻略">
                {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={guideRound === n}
                    data-live={n === liveRound}
                    onClick={() => setGuideRoundOverride(n === liveRound ? null : n)}
                  >
                    R{n}
                  </button>
                ))}
              </div>
              <div className="ms-guide-box">
                <div className="ms-guide-phase">
                  <b>R{guideRound} · 推荐 {pace.recommendedTier} 本</b>
                  <small>{pace.activePhaseName}</small>
                </div>
                <p>{pace.currentAction || activeComp.strategistTip}</p>
              </div>
              <div className="ms-core-ops">
                {(activePhase?.fieldOperators ?? []).map((op, i) => (
                  <div key={`${op.name}-${i}`} className="ms-core-op-chip">
                    <CompactOperatorBadge name={op.name} size={22} />
                    <div>
                      <strong>{op.name}</strong>
                      <small>{op.tier}阶 · {op.role}</small>
                    </div>
                  </div>
                ))}
              </div>
              {activeComp.equipmentTips.length > 0 && (
                <div className="ms-board-row" style={{ marginTop: '6px' }}>
                  <small>装备</small>
                  <div style={{ display: 'grid', gap: '3px', width: '100%' }}>
                    {activeComp.equipmentTips.slice(0, 4).map(tip => (
                      <span key={tip} className="ms-muted" style={{ fontSize: '11px', lineHeight: 1.4 }}>
                        · {tip}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'deck' && (
          <div className="d-report-shell ms-embed-shell">
            <BattleReportDeckPool
              report={report ?? undefined}
              suggestedOperatorNames={suggestedOperatorNames}
              suggestedEquipNames={suggestedEquipNames}
              compTitle={guide?.compTitle || activeComp.title}
            />
          </div>
        )}

        {tab === 'rounds' && (
          <div className="d-report-shell ms-embed-shell">
            <RoundMatrix
              report={report ?? undefined}
              seat={selfSeat}
              live={!reportEnded && lan.status === 'connected'}
              onPreview={() => setTab('overview')}
            />
          </div>
        )}

        {tab === 'combat' && (
          <div className="d-report-shell ms-embed-shell">
            <div className="ms-sub-switch">
              <button
                type="button"
                aria-pressed={combatSub === 'telemetry'}
                onClick={() => setCombatSub('telemetry')}
              >
                <Cpu size={13} />算力遥测与 DPS 曲线
              </button>
              <button
                type="button"
                aria-pressed={combatSub === 'boss'}
                onClick={() => setCombatSub('boss')}
              >
                <Swords size={13} />Boss 伤害剖析
              </button>
            </div>
            {combatSub === 'telemetry' ? (
              <BattleReportTelemetry report={report ?? undefined} />
            ) : (
              <BossDamage
                report={report ?? undefined}
                seat={selfSeat}
                number={bossRound}
                onRound={setBossRoundPick}
                onPreview={() => setTab('overview')}
                reference={leader && (
                  <LeaderInlineBar
                    encounter={leader}
                    round={bossRound}
                    hidden={hiddenLeader}
                    liveHp={report?.rounds.find(r => r.number === bossRound)?.bossHp}
                    onOpen={() => {}}
                  />
                )}
              />
            )}
          </div>
        )}
      </main>

      {isReconnecting && (
        <div className="ms-toast" role="status">
          <ShieldAlert size={13} />
          <span>{lan.error || '正在重连电脑端…'}</span>
          <Wifi size={12} />
        </div>
      )}
    </div>
  );
}
