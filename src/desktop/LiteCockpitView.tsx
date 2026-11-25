// 青逝痕 Tenkinoko 制作
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AppWindow,
  ChevronRight,
  Flame,
  Heart,
  Layers,
  ListTree,
  Radio,
  ShieldCheck,
  Skull,
  Sparkles,
  Swords,
} from 'lucide-react';
import {
  defaultBossRound,
  hasBossDamage,
  REPORT_SEATS,
  reportBossRounds,
  roundMetrics,
  type BattleReport,
  type BattleRound,
} from './battleReportData';
import {
  buildDeckMatchKey,
  readPersistedWishlist,
  WISHLIST_STORAGE_PREFIX,
  writePersistedWishlist,
} from './BattleReportDeckPool';
import { reportPhase, seatDisplayText, seatName } from './BattleReportPanels';
import { EnemyAvatar } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import {
  formatTelemetryRate,
  formatTelemetryTotal,
  isSoloMode,
  type DeckPoolEquip,
  type DeckPoolOperator,
} from './combatTelemetry';
import { computeEquipOdds, computeOperatorOdds } from './deckPoolMath';
import { EquipIcon } from './EquipIcon';
import { PRTS_CHART } from './prtsChartKit';
import type { ReportRecord, ReportSeat, ReportStatus } from './battleReports';

export type LiteTab = 'cockpit' | 'rounds' | 'deck' | 'telemetry' | 'boss' | 'preview';

const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const;
const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

function fmtPct(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.001) return '<0.1%';
  return `${pctFmt.format(prob * 100)}%`;
}

function summarizeRoundTone(row: BattleRound, seat: number | null): { label: string; tone: string } {
  const selfLeaks = seat !== null ? (row.leaks[seat] ?? row.selfLeaks) : row.selfLeaks;
  const totalUncovered = Object.values(row.uncoveredLeaks).reduce((a, b) => a + b, 0);
  const totalLeaks = Object.values(row.leaks).reduce((a, b) => a + b, 0);
  if (row.allPlayersLeaked) return { label: '全员漏怪', tone: 'breached' };
  if (totalUncovered > 0) return { label: `净漏 ${totalUncovered}`, tone: 'breached' };
  if (totalLeaks === 0 && ['reported', 'observed'].includes(row.leaksStatus)) return { label: '全队零漏', tone: 'clean' };
  if (selfLeaks === 0 && Object.values(row.assists).some(v => v > 0)) return { label: '零漏协防', tone: 'assisting' };
  if (selfLeaks !== null && selfLeaks > 0 && row.assistsStatus === 'reported' && totalUncovered === 0) {
    return { label: '本路兜住', tone: 'covered' };
  }
  if (selfLeaks !== null && selfLeaks > 0) return { label: `漏 ${selfLeaks}`, tone: 'partial' };
  return { label: reportPhase(row), tone: 'unknown' };
}

function aggregateWaveSpawns(report: BattleReport, roundNo: number) {
  const planRows = report.preview.filter(p => p.kind === 'plan' && p.round === roundNo);
  const source = planRows.length > 0 ? planRows : report.preview.filter(p => p.round === roundNo);
  const merged = new Map<string, { id: string; name: string; count: number | null; boss?: true }>();
  for (const sp of source) {
    const k = `${sp.boss ? '1' : '0'}:${sp.id}:${sp.name}`;
    const prev = merged.get(k);
    if (!prev) merged.set(k, { id: sp.id, name: sp.name, count: sp.count, boss: sp.boss });
    else if (sp.count !== null) prev.count = (prev.count ?? 0) + sp.count;
  }
  return [...merged.values()]
    .sort((a, b) => Number(Boolean(b.boss)) - Number(Boolean(a.boss)) || (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 8);
}

export function LiteCockpitView({
  report,
  seat,
  live,
  status,
  npcapInstalled,
  history,
  onSelectRecord,
  onSelectSeat,
  onJumpTab,
  onOpenHud,
}: {
  report?: BattleReport;
  seat: number | null;
  live: boolean;
  status: ReportStatus;
  npcapInstalled?: boolean;
  history: ReportRecord[];
  onSelectRecord(key: string | null): void;
  onSelectSeat(seat: ReportSeat): void;
  onJumpTab(tab: LiteTab): void;
  onOpenHud?(): void;
}) {
  const [wishTick, setWishTick] = useState(0);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (!ev.key || ev.key.startsWith(WISHLIST_STORAGE_PREFIX)) setWishTick(t => t + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const matchKey = buildDeckMatchKey(report ?? null);
  const solo = isSoloMode(report?.mode);
  const selfSeat = report?.self ?? (solo ? 1 : null);
  const focusSeat = seat ?? selfSeat;
  const liveRound = report?.current || report?.rounds.at(-1)?.number || 1;
  const activeRound = report?.rounds.find(r => r.number === liveRound) ?? report?.rounds.at(-1);
  const liveShopLevel = (focusSeat !== null ? report?.lineups[focusSeat]?.shopLevel : undefined)
    ?? (selfSeat !== null ? report?.lineups[selfSeat]?.shopLevel : undefined)
    ?? Object.values(report?.lineups ?? {}).find(l => l.shopLevel)?.shopLevel
    ?? 1;

  // 1. Seat summaries for the top 4-seat strip
  const seatCards = useMemo(() => {
    if (!report) return [];
    const seats = solo ? ([1] as const) : REPORT_SEATS;
    return seats.map(s => {
      const lineup = report.lineups[s];
      const hp = report.hp[s];
      const elim = report.eliminated[s];
      let leaks = 0;
      let assists = 0;
      for (const r of report.rounds) {
        if (elim !== undefined && r.number > elim) continue;
        const [lk, as] = roundMetrics(r, s, report.self);
        leaks += lk?.value ?? 0;
        assists += as?.value ?? 0;
      }
      return { seat: s, lineup, hp, elim, leaks, assists };
    });
  }, [report, solo]);

  // 2. Current & next wave spawn preview
  const waveInfo = useMemo(() => {
    if (!report || report.preview.length === 0) return null;
    const curSpawns = aggregateWaveSpawns(report, liveRound);
    const nextRound = liveRound < 15 ? liveRound + 1 : null;
    const nextSpawns = nextRound ? aggregateWaveSpawns(report, nextRound) : [];
    if (!curSpawns.length && !nextSpawns.length) {
      const fallbackRound = report.preview.find(p => p.round >= liveRound)?.round ?? report.preview[0].round;
      return {
        curRound: fallbackRound,
        curSpawns: aggregateWaveSpawns(report, fallbackRound),
        nextRound: fallbackRound < 15 ? fallbackRound + 1 : null,
        nextSpawns: fallbackRound < 15 ? aggregateWaveSpawns(report, fallbackRound + 1) : [],
      };
    }
    return { curRound: liveRound, curSpawns, nextRound, nextSpawns };
  }, [report, liveRound]);

  // 3. Tracked Deck Pool operators & equips (Persisted Wishlist > Own Deployed > Hot Contested)
  const trackedDeck = useMemo<{
    ops: DeckPoolOperator[];
    equips: DeckPoolEquip[];
    source: 'wishlist' | 'board' | 'hot';
  }>(() => {
    const pool = report?.deckPool;
    if (!pool || (pool.operators.length === 0 && pool.equips.length === 0)) {
      return { ops: [], equips: [], source: 'hot' };
    }
    const saved = readPersistedWishlist(matchKey, wishTick >= 0);
    if (saved.chars.length > 0 || saved.traps.length > 0) {
      const charSet = new Set(saved.chars);
      const trapSet = new Set(saved.traps);
      const ops = pool.operators.filter(o => charSet.has(o.charId)).slice(0, 6);
      const equips = pool.equips.filter(e => trapSet.has(e.trapId)).slice(0, 3);
      if (ops.length > 0 || equips.length > 0) return { ops, equips, source: 'wishlist' };
    }
    // Auto-track own board operators for veteran players (non-golden highest tier first)
    const ownLineup = selfSeat !== null ? report?.lineups[selfSeat] : undefined;
    if (ownLineup && ownLineup.deployed.length > 0) {
      const boardNames = ownLineup.deployed
        .filter(u => !u.isGolden)
        .sort((a, b) => b.tier - a.tier)
        .map(u => u.name);
      const fallbackNames = boardNames.length > 0 ? boardNames : ownLineup.deployed.map(u => u.name);
      const matched: DeckPoolOperator[] = [];
      const seen = new Set<string>();
      for (const name of fallbackNames) {
        const hit = pool.operators.find(o => !seen.has(o.charId) && o.name === name);
        if (hit) {
          seen.add(hit.charId);
          matched.push(hit);
        }
      }
      if (matched.length > 0) return { ops: matched.slice(0, 5), equips: [], source: 'board' };
    }
    const hot = [...pool.operators]
      .sort((a, b) => {
        const aShop = selfSeat !== null && a.inShopSeats.includes(selfSeat) ? 1 : 0;
        const bShop = selfSeat !== null && b.inShopSeats.includes(selfSeat) ? 1 : 0;
        if (aShop !== bShop) return bShop - aShop;
        const aOpen = a.tier <= liveShopLevel ? 1 : 0;
        const bOpen = b.tier <= liveShopLevel ? 1 : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;
        return b.tier - a.tier || b.takenTotal - a.takenTotal;
      })
      .slice(0, 5);
    return { ops: hot, equips: [], source: 'hot' };
  }, [liveShopLevel, matchKey, report, selfSeat, wishTick]);

  // 4. Live Boss cut-through or Top DPS operators
  const bossRoundNo = useMemo(() => {
    if (!report) return null;
    const bossRounds = reportBossRounds(report);
    const activeBoss = activeRound && (activeRound.phase === 'boss' || bossRounds.includes(activeRound.number)) && hasBossDamage(activeRound)
      ? activeRound.number
      : null;
    if (activeBoss !== null) return activeBoss;
    const def = defaultBossRound(report);
    const row = report.rounds.find(r => r.number === def);
    return row && hasBossDamage(row) && (liveRound >= def - 1 || !live) ? def : null;
  }, [activeRound, live, liveRound, report]);

  const bossData = useMemo(() => {
    if (!report || bossRoundNo === null) return null;
    const row = report.rounds.find(r => r.number === bossRoundNo);
    if (!row) return null;
    const seats = solo ? ([1] as const) : REPORT_SEATS;
    const seatDmg = seats
      .map(s => ({ seat: s, dmg: row.bossDamage[s] ?? row.bossUplink[s] ?? 0, pct: row.bossPercent[s] ?? 0 }))
      .filter(item => item.dmg > 0 || item.pct > 0);
    const totalDmg = seatDmg.reduce((s, item) => s + item.dmg, 0);
    const hits = row.bossOfficial.length ? row.bossOfficial : row.bossUplinkRows;
    const byOp = new Map<string, { name: string; damage: number; seat: number }>();
    for (const h of hits) {
      if (h.damage <= 0) continue;
      const k = `${h.seat}:${h.charId || h.identifier}`;
      const prev = byOp.get(k);
      const name = h.operatorName || `干员 #${h.identifier}`;
      if (!prev) byOp.set(k, { name, damage: h.damage, seat: h.seat });
      else prev.damage += h.damage;
    }
    const topOps = [...byOp.entries()]
      .sort((a, b) => b[1].damage - a[1].damage)
      .slice(0, 5)
      .map(([k, v]) => ({ key: k, ...v }));
    return { roundNo: bossRoundNo, seatDmg, totalDmg, bossHp: row.bossHp, topOps };
  }, [bossRoundNo, report, solo]);

  const topDpsOps = useMemo(() => {
    if (!report?.telemetry) return [];
    const roundSnap = report.telemetry.rounds[liveRound] ?? report.telemetry;
    return roundSnap.operators
      .filter(o => o.totalDamage > 0)
      .sort((a, b) => b.totalDamage - a.totalDamage)
      .slice(0, 5);
  }, [liveRound, report]);

  const recentRounds = useMemo(
    () => (report ? [...report.rounds].sort((a, b) => b.number - a.number).slice(0, 5) : []),
    [report],
  );

  const trackOwnBoard = () => {
    if (!report?.deckPool || selfSeat === null) return;
    const own = report.lineups[selfSeat]?.deployed ?? [];
    const ids = report.deckPool.operators
      .filter(op => own.some(u => !u.isGolden && u.name === op.name))
      .map(op => op.charId);
    const fallbackIds = ids.length > 0
      ? ids
      : report.deckPool.operators.filter(op => own.some(u => u.name === op.name)).map(op => op.charId);
    if (fallbackIds.length === 0) return;
    const prev = readPersistedWishlist(matchKey, true);
    const nextChars = [...new Set([...prev.chars, ...fallbackIds])];
    writePersistedWishlist(matchKey, { chars: nextChars, traps: prev.traps });
    setWishTick(t => t + 1);
  };

  // Standby / Pre-match Panel
  if (!report) {
    const adminOk = status !== 'permission';
    const npcapOk = npcapInstalled !== false;
    const gameOk = status === 'listening' || status === 'connecting';
    return (
      <section className="lite-standby" aria-label="等待对局">
        <div className="lite-card lite-standby-status">
          <header className="lite-card-head">
            <span><b className="lite-slash">//</b>运行环境</span>
            <small>{status === 'listening' ? '就绪' : '待机'}</small>
          </header>
          <div className="lite-checks">
            <div className="lite-check-row" data-state={adminOk ? 'ok' : 'error'}>
              <ShieldCheck size={15} />
              <div>
                <strong>管理员权限</strong>
                <span>{adminOk ? '已获取' : '请以管理员身份重新打开'}</span>
              </div>
              <em>{adminOk ? '正常' : '未获取'}</em>
            </div>
            <div className="lite-check-row" data-state={npcapOk ? 'ok' : 'warn'}>
              <Radio size={15} />
              <div>
                <strong>Npcap 驱动</strong>
                <span>{npcapOk ? '已安装，可正常读取对局数据' : '未检测到，点上方按钮一键安装'}</span>
              </div>
              <em>{npcapOk ? '正常' : '未安装'}</em>
            </div>
            <div className="lite-check-row" data-state={gameOk ? 'ok' : 'pending'}>
              <Activity size={15} />
              <div>
                <strong>游戏连接</strong>
                <span>{status === 'connecting' ? '已检测到游戏，进入卫戍协议后自动开始记录' : '打开电脑版明日方舟，进入卫戍协议即可自动记录'}</span>
              </div>
              <em>{gameOk ? '已连接' : '等待中'}</em>
            </div>
          </div>
          {onOpenHud && (
            <div className="lite-standby-actions">
              <button type="button" className="d-button d-small" onClick={onOpenHud}>
                <AppWindow size={13} />打开悬浮窗
              </button>
            </div>
          )}
        </div>

        <div className="lite-card lite-standby-history">
          <header className="lite-card-head">
            <span><b className="lite-slash">//</b>历史对局</span>
            <small>{history.length} 场</small>
          </header>
          {history.length === 0 ? (
            <div className="lite-empty-note">
              <p>还没有对局记录。</p>
              <p>打完一局会自动保存在这里，随时回看漏怪明细或导出战报图。</p>
            </div>
          ) : (
            <ul className="lite-history-list">
              {history.slice(0, 8).map(item => (
                <li key={item.key}>
                  <button type="button" onClick={() => onSelectRecord(item.key)}>
                    <strong>{item.label}</strong>
                    <span>
                      {item.report.difficulty || '卫戍协议'} · {item.report.rounds.length} 回合 · {dateTime.format(item.seenAt)}
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  const maxDpsDmg = Math.max(1, ...topDpsOps.map(o => o.totalDamage));
  const maxBossOpDmg = bossData ? Math.max(1, ...bossData.topOps.map(o => o.damage)) : 1;

  return (
    <div className="lite-cockpit">
      {/* Row 1: 4-Seat Telemetry Ribbon */}
      <section className="lite-seats-strip" data-solo={solo} aria-label="四席实时态势">
        {seatCards.map(({ seat: s, lineup, hp, elim, leaks, assists }) => {
          const isSelf = report.self === s;
          const isFocus = focusSeat === s;
          const eliminated = elim !== undefined;
          return (
            <button
              key={s}
              type="button"
              className="lite-seat-tile"
              data-self={isSelf}
              data-focus={isFocus}
              data-eliminated={eliminated}
              onClick={() => onSelectSeat(s)}
              title="点击切换主视角席位"
            >
              <div className="lite-seat-top">
                {seatName(s, report)}
                <span className="lite-seat-tier">
                  {eliminated ? (
                    <><Skull size={11} />淘汰 R{elim}</>
                  ) : (
                    <>
                      {lineup?.shopLevel ? `${lineup.shopLevel}本` : '—'}
                      {lineup?.strategist ? ` · ${lineup.strategist}` : ''}
                    </>
                  )}
                </span>
              </div>
              <div className="lite-seat-metrics">
                {eliminated ? (
                  <span className="lite-seat-recycled">持卡已回流共享池</span>
                ) : (
                  <>
                    <span className="lite-hp">
                      <Heart size={11} /><b>{hp ?? '—'}</b>
                    </span>
                    <span className="lite-metric-pair">
                      漏 <b data-warn={leaks > 0}>{leaks}</b>
                    </span>
                    <span className="lite-metric-pair">
                      协 <b data-good={assists > 0}>+{assists}</b>
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Row 2: Dual-Column Cockpit (auto-collapses to 1-col in Rail mode) */}
      <div className="lite-cockpit-grid">
        {/* Left Column: Spawn Radar + Recent Rounds */}
        <div className="lite-cockpit-col">
          <section className="lite-card" aria-label="当前与下波出怪预告">
            <header className="lite-card-head">
              <span><b className="lite-slash">//</b><ListTree size={13} />出怪预告</span>
              <button type="button" className="lite-link-btn" onClick={() => onJumpTab('preview')}>
                完整列表<ChevronRight size={13} />
              </button>
            </header>
            {waveInfo ? (
              <div className="lite-wave-stack">
                <div className="lite-wave-row is-current">
                  <span className="lite-wave-tag">R{waveInfo.curRound} 当前</span>
                  <div className="lite-enemy-chips">
                    {waveInfo.curSpawns.length > 0 ? waveInfo.curSpawns.map(sp => (
                      <span key={`c-${sp.id}-${sp.name}`} className="lite-enemy-chip" data-boss={Boolean(sp.boss)}>
                        <EnemyAvatar id={sp.id} size={20} />
                        <span>{sp.name}</span>
                        {sp.count !== null && <b>×{sp.count}</b>}
                      </span>
                    )) : <span className="lite-muted">本波暂无预告条目</span>}
                  </div>
                </div>
                {waveInfo.nextRound !== null && waveInfo.nextSpawns.length > 0 && (
                  <div className="lite-wave-row">
                    <span className="lite-wave-tag is-next">R{waveInfo.nextRound} 预告</span>
                    <div className="lite-enemy-chips">
                      {waveInfo.nextSpawns.map(sp => (
                        <span key={`n-${sp.id}-${sp.name}`} className="lite-enemy-chip" data-boss={Boolean(sp.boss)}>
                          <EnemyAvatar id={sp.id} size={20} />
                          <span>{sp.name}</span>
                          {sp.count !== null && <b>×{sp.count}</b>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="lite-empty-inline">等待服务端出怪预告帧…</div>
            )}
          </section>

          <section className="lite-card" aria-label="最近回合战况">
            <header className="lite-card-head">
              <span><b className="lite-slash">//</b><Activity size={13} />最近回合</span>
              <button type="button" className="lite-link-btn" onClick={() => onJumpTab('rounds')}>
                全部 {report.rounds.length} 轮<ChevronRight size={13} />
              </button>
            </header>
            {recentRounds.length > 0 ? (
              <div className="lite-rounds-mini">
                {recentRounds.map(row => {
                  const summary = summarizeRoundTone(row, focusSeat);
                  const [lk, as] = focusSeat !== null ? roundMetrics(row, focusSeat, report.self) : [null, null];
                  const pairText = row.assistPairs
                    .slice(0, 2)
                    .map(p => `${p.killer}→${p.owner}×${p.count}`)
                    .join(' · ');
                  return (
                    <button
                      key={row.number}
                      type="button"
                      className="lite-round-line"
                      data-current={row.number === liveRound && live}
                      onClick={() => onJumpTab('rounds')}
                    >
                      <b className="lite-rn">R{row.number}</b>
                      <span className="lite-outcome" data-tone={summary.tone}>{summary.label}</span>
                      <span className="lite-rstat">
                        漏 <b>{lk?.value ?? '—'}</b> · 协 <b>{as?.value ?? 0}</b>
                      </span>
                      <span className="lite-rpair" title={pairText || undefined}>{pairText || '—'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="lite-empty-inline">等待首轮战斗结算记录…</div>
            )}
          </section>
        </div>

        {/* Right Column: Tracked Deck Pool + Live DPS / Boss Bar */}
        <div className="lite-cockpit-col">
          <section className="lite-card" aria-label="牌池余量">
            <header className="lite-card-head">
              <span>
                <b className="lite-slash">//</b>
                <Layers size={13} />
                {trackedDeck.source === 'wishlist'
                  ? '心仪牌池'
                  : trackedDeck.source === 'board'
                    ? '场上干员余量'
                    : '高阶牌池'}
                <small className="lite-head-pill">{liveShopLevel}本</small>
              </span>
              <div className="lite-head-actions">
                {trackedDeck.source !== 'wishlist' && selfSeat !== null && (report.lineups[selfSeat]?.deployed.length ?? 0) > 0 && (
                  <button type="button" className="lite-chip-btn" onClick={trackOwnBoard} title="把当前场上干员加入心仪追踪">
                    <Sparkles size={11} />盯住场上
                  </button>
                )}
                <button type="button" className="lite-link-btn" onClick={() => onJumpTab('deck')}>
                  全部牌池<ChevronRight size={13} />
                </button>
              </div>
            </header>
            {report.deckPool && (trackedDeck.ops.length > 0 || trackedDeck.equips.length > 0) ? (
              <div className="lite-pool-rows">
                {trackedDeck.ops.map(op => {
                  const odds = computeOperatorOdds(report.deckPool!, op, liveShopLevel);
                  const inShop = selfSeat !== null && op.inShopSeats.includes(selfSeat);
                  const depleted = op.remaining <= 0;
                  return (
                    <div key={op.charId} className="lite-pool-row" data-empty={depleted} data-shop={inShop}>
                      <CompactOperatorBadge name={op.name} size={24} />
                      <span className="lite-pool-name">
                        <strong>{op.name}</strong>
                        <small>{TIER_ROMAN[op.tier] || op.tier}阶</small>
                      </span>
                      <span className="lite-pool-rem">
                        余 <b>{op.remaining}</b>/{op.totalCopies}
                      </span>
                      <span className="lite-pool-odds">
                        {depleted ? (
                          <em className="is-empty">池空</em>
                        ) : inShop ? (
                          <em className="is-shop">在售</em>
                        ) : !odds.unlocked ? (
                          <em className="is-locked">需{op.tier}本</em>
                        ) : (
                          <>
                            单<b>{fmtPct(odds.perRollProb)}</b>
                            <small>5刷{fmtPct(odds.fiveRollProb)}</small>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
                {trackedDeck.equips.map(eq => {
                  const odds = computeEquipOdds(report.deckPool!, eq, liveShopLevel);
                  const inShop = selfSeat !== null && eq.inShopSeats.includes(selfSeat);
                  return (
                    <div key={eq.trapId} className="lite-pool-row" data-shop={inShop}>
                      <EquipIcon trapId={eq.trapId} name={eq.name} size={24} />
                      <span className="lite-pool-name">
                        <strong>{eq.name}</strong>
                        <small>装备·{TIER_ROMAN[eq.tier] || eq.tier}</small>
                      </span>
                      <span className="lite-pool-rem">
                        已持 <b>{eq.takenTotal}</b>
                      </span>
                      <span className="lite-pool-odds">
                        {inShop ? <em className="is-shop">在售</em> : !odds.unlocked ? (
                          <em className="is-locked">需{eq.tier}本</em>
                        ) : (
                          <>单<b>{fmtPct(odds.perRollProb)}</b></>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="lite-empty-inline">等待开局牌库同步后自动显示余量与 D 牌概率…</div>
            )}
          </section>

          {bossData ? (
            <section className="lite-card lite-card-boss" aria-label="Boss 伤害">
              <header className="lite-card-head">
                <span><b className="lite-slash">//</b><Swords size={13} />R{bossData.roundNo} Boss 伤害</span>
                <button type="button" className="lite-link-btn" onClick={() => onJumpTab('boss')}>
                  查看详情<ChevronRight size={13} />
                </button>
              </header>
              {bossData.seatDmg.length > 0 && (
                <div className="lite-boss-bar-wrap">
                  <div className="lite-boss-bar">
                    {bossData.seatDmg.map(item => {
                      const pct = bossData.totalDmg > 0 ? (item.dmg / bossData.totalDmg) * 100 : item.pct;
                      const isSelf = item.seat === report.self;
                      return (
                        <div
                          key={item.seat}
                          style={{
                            width: `${Math.max(2, pct)}%`,
                            background: isSelf ? PRTS_CHART.ochre : PRTS_CHART.series[(item.seat - 1) % PRTS_CHART.series.length],
                          }}
                          title={`${seatDisplayText(item.seat, report)} ${formatTelemetryTotal(item.dmg)} (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="lite-boss-legend">
                    {bossData.seatDmg.map(item => (
                      <span key={item.seat} data-self={item.seat === report.self}>
                        {seatDisplayText(item.seat, report)} <b>{formatTelemetryTotal(item.dmg)}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="lite-dps-list">
                {bossData.topOps.map((op, i) => (
                  <div key={op.key} className="lite-dps-row">
                    <span className="lite-dps-rank">{i + 1}</span>
                    <CompactOperatorBadge name={op.name} size={22} />
                    <span className="lite-dps-name">{op.name}</span>
                    <div className="lite-dps-track">
                      <div
                        style={{
                          width: `${Math.max(4, (op.damage / maxBossOpDmg) * 100)}%`,
                          background: op.seat === report.self ? PRTS_CHART.ochre : PRTS_CHART.blue,
                        }}
                      />
                    </div>
                    <b className="lite-dps-val">{formatTelemetryTotal(op.damage)}</b>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="lite-card" aria-label="本波伤害 Top 5">
              <header className="lite-card-head">
                <span><b className="lite-slash">//</b><Flame size={13} />本波伤害 Top 5</span>
                <button type="button" className="lite-link-btn" onClick={() => onJumpTab('telemetry')}>
                  全部伤害<ChevronRight size={13} />
                </button>
              </header>
              {topDpsOps.length > 0 ? (
                <div className="lite-dps-list">
                  {topDpsOps.map((op, i) => (
                    <div key={`${op.seat ?? 0}:${op.charId}`} className="lite-dps-row">
                      <span className="lite-dps-rank">{i + 1}</span>
                      <CompactOperatorBadge name={op.name} size={22} />
                      <span className="lite-dps-name">{op.name}</span>
                      <div className="lite-dps-track">
                        <div style={{ width: `${Math.max(4, (op.totalDamage / maxDpsDmg) * 100)}%` }} />
                      </div>
                      <span className="lite-dps-nums">
                        <b>{formatTelemetryTotal(op.totalDamage)}</b>
                        {(op.activeDps ?? op.spanDps) !== null && (
                          <small>{formatTelemetryRate(op.activeDps ?? op.spanDps)}</small>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lite-empty-inline">开战后自动统计干员伤害与秒伤，Boss 战自动切为 Boss 伤害排行。</div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
