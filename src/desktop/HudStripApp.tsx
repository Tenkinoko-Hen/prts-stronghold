// 青逝痕 Tenkinoko 制作
import { useEffect, useMemo, useState } from 'react';
import { Layers, Lock, ShieldCheck, Skull, Swords, Unlock, Users, X } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import { REPORT_SEATS, readBattleReport, reportBossRounds } from './battleReportData';
import { buildDeckMatchKey, readPersistedWishlist, WISHLIST_STORAGE_PREFIX } from './BattleReportDeckPool';
import { seatDisplayText } from './BattleReportPanels';
import { EnemyAvatar } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { formatTelemetryRate, formatTelemetryTotal, isSoloMode, type DeckPoolOperator } from './combatTelemetry';
import { computeOperatorOdds } from './deckPoolMath';
import { PRTS_CHART } from './prtsChartKit';
import type { HudOverlayState } from './battleReports';
import './desktop.css';
import './battleReports.css';

export type HudNormalPage = 'intel' | 'peers';

const HUD_PAGE_STORAGE_KEY = 'prts:hud-normal-page:v1';

interface HudOpRow {
  key: string;
  name: string;
  damage: number;
  dps: number | null;
  share: number;
}

const hudPctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
function fmtHudPct(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.001) return '<0.1%';
  return `${hudPctFmt.format(prob * 100)}%`;
}

function normalizeOpName(raw: string): string {
  const resolved = resolveOperatorAvatars(raw);
  if (resolved[0]?.cleanName) return resolved[0].cleanName;
  return raw.replace(/["“”'‘’「」『』]/g, '').trim();
}

function readSavedHudPage(fallback: HudNormalPage): HudNormalPage {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(HUD_PAGE_STORAGE_KEY);
      if (v === 'intel' || v === 'peers') return v;
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

export default function HudStripApp({
  previewState,
  initialPage = 'intel',
}: {
  previewState?: HudOverlayState;
  initialPage?: HudNormalPage;
}) {
  const hudApi = previewState ? undefined : window.electronAPI?.hud;
  const [state, setState] = useState<HudOverlayState>(
    previewState ?? {
      open: true,
      locked: false,
      shortcut: 'Ctrl+Shift+F10',
      shortcutAvailable: false,
      status: 'starting',
      report: null,
      guide: { round: 1, compTitle: '', paceTip: '', suggestedOperators: [] },
    },
  );
  const [normalPage, setNormalPage] = useState<HudNormalPage>(() =>
    previewState ? initialPage : readSavedHudPage(initialPage),
  );
  const [storageTick, setStorageTick] = useState(0);

  useEffect(() => {
    if (previewState) {
      setState(previewState);
      return;
    }
    if (!hudApi) return;
    let mounted = true;
    const remove = hudApi.onState(next => {
      if (mounted) setState(next);
    });
    void hudApi.getState().then(next => {
      if (mounted) setState(next);
    }).catch(() => {});
    return () => {
      mounted = false;
      remove();
    };
  }, [hudApi, previewState]);

  useEffect(() => {
    if (previewState) setNormalPage(initialPage);
  }, [initialPage, previewState]);

  // Listen for live wishlist edits made in the main window's「当局牌库」tab
  useEffect(() => {
    if (previewState) return;
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith(WISHLIST_STORAGE_PREFIX)) {
        setStorageTick(t => t + 1);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [previewState]);

  const handleSelectPage = (page: HudNormalPage) => {
    if (state.locked) return;
    setNormalPage(page);
    if (!previewState) {
      try {
        localStorage.setItem(HUD_PAGE_STORAGE_KEY, page);
      } catch {
        // ignore storage errors
      }
    }
  };

  const parsed = useMemo(() => {
    try {
      return state.report ? readBattleReport(state.report) : null;
    } catch {
      return null;
    }
  }, [state.report]);

  const roundNo = parsed?.current || parsed?.rounds.at(-1)?.number || state.guide.round || 1;
  const activeRound = parsed?.rounds.find(r => r.number === roundNo) ?? parsed?.rounds.at(-1);
  const soloMode = isSoloMode(parsed?.mode);
  const selfSeat = parsed?.self ?? (soloMode ? 1 : null);
  const selfLineup = selfSeat !== null ? parsed?.lineups[selfSeat] : undefined;
  const selfHp = selfSeat !== null ? parsed?.hp[selfSeat] : undefined;
  const selfLeaks = activeRound ? (activeRound.selfLeaks ?? (selfSeat !== null ? activeRound.leaks[selfSeat] : undefined)) : undefined;
  const selfAssists = activeRound && selfSeat !== null ? activeRound.assists[selfSeat] : undefined;
  const liveShopLevel = selfLineup?.shopLevel
    ?? Object.values(parsed?.lineups ?? {}).find(l => l.shopLevel)?.shopLevel
    ?? 1;

  // 1. Collect per-operator DPS / damage rows for current round (or active boss round)
  const roundTele = parsed?.telemetry?.rounds[roundNo] ?? parsed?.telemetry ?? null;
  const opRows: HudOpRow[] = [];
  if (roundTele && roundTele.operators.length > 0) {
    const valid = roundTele.operators.filter(o => o.totalDamage > 0);
    const total = valid.reduce((s, o) => s + o.totalDamage, 0);
    for (const op of valid) {
      opRows.push({
        key: `${op.seat ?? 0}:${op.charId}`,
        name: op.name,
        damage: op.totalDamage,
        dps: op.activeDps ?? op.spanDps,
        share: total > 0 ? op.totalDamage / total : 0,
      });
    }
  } else if (parsed) {
    const bossRound = [activeRound, ...reportBossRounds(parsed).map(n => parsed.rounds.find(r => r.number === n)).reverse()]
      .find(r => r && (r.bossOfficial.length > 0 || r.bossUplinkRows.length > 0));
    if (bossRound) {
      const hits = bossRound.bossOfficial.length ? bossRound.bossOfficial : bossRound.bossUplinkRows;
      const agg = new Map<string, { name: string; damage: number }>();
      for (const h of hits) {
        if (h.damage <= 0) continue;
        const k = `${h.seat}:${h.charId || h.identifier}`;
        const prev = agg.get(k);
        const name = h.operatorName || `干员 #${h.identifier}`;
        if (!prev) agg.set(k, { name, damage: h.damage });
        else prev.damage += h.damage;
      }
      const list = [...agg.entries()].sort((a, b) => b[1].damage - a[1].damage);
      const total = list.reduce((s, [, v]) => s + v.damage, 0);
      for (const [k, v] of list) {
        opRows.push({ key: k, name: v.name, damage: v.damage, dps: null, share: total > 0 ? v.damage / total : 0 });
      }
    }
  }

  // 2. Page 1 (牌池+出怪): Tracked Deck Pool operators (Wishlist > Suggested Comp Core > Contested)
  const matchKey = buildDeckMatchKey(parsed);
  const { trackedOps, trackedSource } = useMemo<{
    trackedOps: DeckPoolOperator[];
    trackedSource: 'wishlist' | 'comp' | 'hot';
  }>(() => {
    const pool = parsed?.deckPool;
    if (!pool || pool.operators.length === 0) {
      return { trackedOps: [], trackedSource: 'hot' };
    }
    const saved = previewState ? { chars: [], traps: [] } : readPersistedWishlist(matchKey, storageTick > 0);
    if (saved.chars.length > 0) {
      const idSet = new Set(saved.chars);
      const matched = pool.operators.filter(o => idSet.has(o.charId));
      if (matched.length > 0) {
        return { trackedOps: matched.slice(0, 6), trackedSource: 'wishlist' };
      }
    }
    const suggested = state.guide.suggestedOperators ?? [];
    if (suggested.length > 0) {
      const wanted = new Set(suggested.map(normalizeOpName).filter(Boolean));
      const matched: DeckPoolOperator[] = [];
      const seen = new Set<string>();
      // Preserve guide order, prioritizing unlocked / in-shop / empty alerts
      for (const raw of suggested) {
        const clean = normalizeOpName(raw);
        if (!clean || !wanted.has(clean)) continue;
        const found = pool.operators.find(o => !seen.has(o.charId) && (o.name === raw || normalizeOpName(o.name) === clean));
        if (found) {
          seen.add(found.charId);
          matched.push(found);
        }
      }
      if (matched.length > 0) {
        return { trackedOps: matched.slice(0, 6), trackedSource: 'comp' };
      }
    }
    // Lite / no-guide fallback: track own deployed board units (highest tier non-golden first) before generic hot pool
    const ownDeployed = selfLineup?.deployed ?? [];
    if (ownDeployed.length > 0) {
      const preferredNames = [...ownDeployed]
        .sort((a, b) => Number(a.isGolden) - Number(b.isGolden) || b.tier - a.tier)
        .map(u => u.name);
      const boardMatched: DeckPoolOperator[] = [];
      const seen = new Set<string>();
      for (const name of preferredNames) {
        const hit = pool.operators.find(o => !seen.has(o.charId) && o.name === name);
        if (hit) {
          seen.add(hit.charId);
          boardMatched.push(hit);
        }
      }
      if (boardMatched.length > 0) {
        return { trackedOps: boardMatched.slice(0, 5), trackedSource: 'comp' };
      }
    }
    // Fallback: prioritize operators currently in player's shop, depleted alerts, or highest contested tier
    const ranked = [...pool.operators].sort((a, b) => {
      const aShop = selfSeat !== null && a.inShopSeats.includes(selfSeat) ? 1 : 0;
      const bShop = selfSeat !== null && b.inShopSeats.includes(selfSeat) ? 1 : 0;
      if (aShop !== bShop) return bShop - aShop;
      const aUnlocked = a.tier <= liveShopLevel ? 1 : 0;
      const bUnlocked = b.tier <= liveShopLevel ? 1 : 0;
      if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
      if (a.remaining === 0 && b.remaining > 0) return -1;
      if (b.remaining === 0 && a.remaining > 0) return 1;
      return b.tier - a.tier || b.takenTotal - a.takenTotal;
    });
    return { trackedOps: ranked.slice(0, 4), trackedSource: 'hot' };
  }, [liveShopLevel, matchKey, parsed?.deckPool, previewState, selfLineup?.deployed, selfSeat, state.guide.suggestedOperators, storageTick]);

  // 3. Page 1 (牌池+出怪): Aggregated enemy preview for current (or next upcoming) round
  const { waveSpawns, spawnRound, spawnIsNext } = useMemo(() => {
    if (!parsed || parsed.preview.length === 0) {
      return { waveSpawns: [] as Array<{ id: string; name: string; count: number | null; boss?: true }>, spawnRound: roundNo, spawnIsNext: false };
    }
    const planRows = parsed.preview.filter(p => p.kind === 'plan');
    const sourceRows = planRows.length > 0 ? planRows : parsed.preview;
    const isSettled = activeRound?.phase === 'settle' || activeRound?.phase === 'end';
    const nextRows = isSettled ? sourceRows.filter(p => p.round === roundNo + 1) : [];
    const curRows = sourceRows.filter(p => p.round === roundNo);
    const chosenRound = nextRows.length > 0 ? roundNo + 1 : curRows.length > 0 ? roundNo : (sourceRows.find(p => p.round >= roundNo)?.round ?? sourceRows[0].round);
    const targetRows = sourceRows.filter(p => p.round === chosenRound);
    const merged = new Map<string, { id: string; name: string; count: number | null; boss?: true }>();
    for (const sp of targetRows) {
      const key = `${sp.boss ? '1' : '0'}:${sp.id}:${sp.name}`;
      const prev = merged.get(key);
      if (!prev) merged.set(key, { id: sp.id, name: sp.name, count: sp.count, boss: sp.boss });
      else if (sp.count !== null) prev.count = (prev.count ?? 0) + sp.count;
    }
    const list = [...merged.values()]
      .sort((a, b) => Number(Boolean(b.boss)) - Number(Boolean(a.boss)) || (b.count ?? 0) - (a.count ?? 0));
    return {
      waveSpawns: list.slice(0, 8),
      spawnRound: chosenRound,
      spawnIsNext: chosenRound > roundNo,
    };
  }, [activeRound?.phase, parsed, roundNo]);

  // 4. Page 2 (队友态势): All 4 seats sorted with alive / self info & top deployed units
  const peerRows = useMemo(() => {
    if (!parsed) return [];
    const seats = soloMode ? ([1] as const) : REPORT_SEATS;
    return seats.map(seat => {
      const lineup = parsed.lineups[seat];
      const hp = parsed.hp[seat];
      const elimRound = parsed.eliminated[seat];
      const eliminated = elimRound !== undefined;
      const rLeak = activeRound?.leaks[seat];
      const rAssist = activeRound?.assists[seat];
      const deployed = [...(lineup?.deployed ?? [])].sort(
        (a, b) => Number(b.isGolden) - Number(a.isGolden) || b.tier - a.tier,
      );
      return {
        seat,
        isSelf: seat === selfSeat,
        label: seatDisplayText(seat, parsed),
        hp,
        elimRound,
        eliminated,
        shopLevel: lineup?.shopLevel ?? null,
        rLeak,
        rAssist,
        deployed,
      };
    });
  }, [activeRound, parsed, selfSeat, soloMode]);

  const activeNormalPage: HudNormalPage = soloMode ? 'intel' : normalPage;
  const maxOpDamage = Math.max(1, ...opRows.map(o => o.damage));
  const bossPool = parsed?.telemetry?.enemyPool?.boss;
  const fullGuideText = PRODUCT_BRAND.mode === 'full' && state.guide.paceTip
    ? state.guide.paceTip
    : parsed?.difficulty || state.guide.compTitle || '';
  const emptyAlertCount = parsed?.deckPool
    ? trackedOps.filter(o => o.remaining === 0).length
    : 0;

  return (
    <div
      style={{
        width: previewState ? '440px' : '100vw',
        height: previewState ? '176px' : '100vh',
        boxSizing: 'border-box',
        padding: '3px 4px',
        background: 'transparent',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <section
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: state.locked ? 'rgba(11, 14, 20, 0.82)' : 'rgba(12, 16, 23, 0.95)',
          border: `1px solid ${state.locked ? 'rgba(255, 230, 0, 0.42)' : '#2d3644'}`,
          borderLeft: '3px solid #ffe600',
          borderRadius: '2px',
          color: '#f1f5f9',
          overflow: 'hidden',
        }}
      >
        {/* Top Compact Drag Header (26px) */}
        <header
          style={{
            flex: 'none',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 7px',
            borderBottom: '1px solid rgba(45, 54, 68, 0.75)',
            WebkitAppRegion: state.locked ? 'no-drag' : 'drag',
            fontSize: '11.5px',
          } as React.CSSProperties}
        >
          <span
            style={{
              padding: '0 5px',
              background: 'rgba(255, 230, 0, 0.16)',
              color: '#ffe600',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              borderRadius: '2px',
            }}
          >
            {parsed?.mode === 'mode_solo_stage' ? 'SOLO' : `R${String(roundNo).padStart(2, '0')}`}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '11px' }}>
            {[parsed?.difficulty, state.guide.compTitle, selfLineup?.shopLevel ? `${selfLineup.shopLevel}本` : ''].filter(Boolean).join(' · ') || `${PRODUCT_BRAND.shortName} 战术悬浮条`}
          </span>

          {state.locked ? (
            <span style={{ color: '#ffe600', fontSize: '10px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              穿透已锁 · {state.shortcut}
            </span>
          ) : (
            <div style={{ display: 'inline-flex', gap: '4px', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => void hudApi?.setLocked(true)}
                title={`锁定鼠标穿透（${state.shortcut} 随时解锁）`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 5px',
                  fontSize: '10.5px',
                  color: '#ffe600',
                  border: '1px solid rgba(255,230,0,0.45)',
                  background: 'rgba(255,230,0,0.1)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <Lock size={10} />穿透
              </button>
              <button
                type="button"
                onClick={() => void hudApi?.setOpen(false)}
                title="关闭悬浮条"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 4px',
                  color: '#94a3b8',
                  border: '1px solid #2d3644',
                  background: '#161c26',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </header>

        {/* Unified Vertically-Scrollable Body */}
        <div
          className="d-hud-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {fullGuideText && (
            <div
              style={{
                flex: 'none',
                padding: '4.5px 8px',
                borderBottom: '1px solid rgba(45, 54, 68, 0.55)',
                background: 'rgba(255, 230, 0, 0.04)',
                fontSize: '11px',
                lineHeight: 1.4,
                color: '#e2e8f0',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {fullGuideText}
            </div>
          )}

          <div
            style={{
              flex: '1 0 auto',
              padding: '5px 8px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '11px',
            }}
          >
            {opRows.length > 0 ? (
              /* Boss / Live Telemetry Mode: Per-Operator Avatars + Damage Bars + DPS */
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#8894a6', fontSize: '10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: PRTS_CHART.blue, fontWeight: 650 }}>
                    <Swords size={10} />// 当回合干员输出 · {opRows.length} 人（可向下滚动）
                  </span>
                  {bossPool && (
                    <span style={{ color: '#e88b85', fontFamily: 'var(--font-mono)' }}>
                      首领余 {formatTelemetryTotal(bossPool.hp)}
                    </span>
                  )}
                </div>
                {opRows.map((op, i) => (
                  <div
                    key={op.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4em 18px minmax(3.8em, 5.4em) 1fr auto auto',
                      alignItems: 'center',
                      gap: '5px',
                      minHeight: '20px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <small style={{ color: '#6b7888', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{i + 1}.</small>
                    <CompactOperatorBadge name={op.name} size={18} />
                    <strong style={{ color: '#eef2f7', fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</strong>
                    <span style={{ height: '6px', background: PRTS_CHART.plotBg, border: '1px solid #232a35', borderRadius: '1px', overflow: 'hidden' }}>
                      <i style={{ display: 'block', height: '100%', width: `${Math.max(6, (op.damage / maxOpDamage) * 100)}%`, background: i === 0 ? PRTS_CHART.ochre : PRTS_CHART.blue }} />
                    </span>
                    <b style={{ color: '#f1f5f9', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      {formatTelemetryTotal(op.damage)}
                    </b>
                    <small style={{ color: i === 0 ? PRTS_CHART.ochreBright : PRTS_CHART.blue, fontFamily: 'var(--font-mono)', fontSize: '10.5px', minWidth: '4.4em', textAlign: 'right' }}>
                      {op.dps != null ? formatTelemetryRate(op.dps) : `${Math.round(op.share * 100)}%`}
                    </small>
                  </div>
                ))}
              </>
            ) : parsed ? (
              /* Normal Round Mode: Switchable 2-Page Tactical HUD (牌池+出怪 ↔ 队友态势) */
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3.5px', color: selfLeaks === 0 ? PRTS_CHART.sage : selfLeaks ? PRTS_CHART.crimson : '#cbd5e1', fontWeight: 650, fontSize: '10.5px' }}>
                    <ShieldCheck size={11} />
                    {selfLeaks === undefined ? '进行中' : selfLeaks === 0 ? '零漏' : `漏 ${selfLeaks}`}
                  </span>
                  {selfHp !== undefined && (
                    <span style={{ color: selfHp <= 5 ? PRTS_CHART.crimson : '#cbd5e1', fontFamily: 'var(--font-mono)', fontSize: '10.5px', fontWeight: 600 }}>
                      ♡{selfHp}
                    </span>
                  )}
                  {!!selfAssists && (
                    <span style={{ color: PRTS_CHART.blue, fontFamily: 'var(--font-mono)', fontSize: '10.5px' }}>
                      兜+{selfAssists}
                    </span>
                  )}

                  {/* Inline 2-Page Switcher */}
                  {!soloMode ? (
                    <div
                      role="tablist"
                      aria-label="悬浮窗情报切页"
                      style={{
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        background: '#0d1118',
                        border: '1px solid #263040',
                        borderRadius: '2px',
                        padding: '1px',
                        gap: '2px',
                      }}
                    >
                      {([
                        ['intel', '牌池+出怪', Layers],
                        ['peers', '队友态势', Users],
                      ] as const).map(([id, label, Icon]) => {
                        const active = activeNormalPage === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            disabled={state.locked}
                            onClick={() => handleSelectPage(id)}
                            title={state.locked ? `已锁定当前页（按 ${state.shortcut} 解锁切换）` : `切换到${label}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '1px 5px',
                              fontSize: '10px',
                              fontWeight: active ? 650 : 500,
                              color: active ? '#ffe600' : state.locked ? '#4d596a' : '#8e9bae',
                              background: active ? 'rgba(255, 230, 0, 0.14)' : 'transparent',
                              border: active ? '1px solid rgba(255, 230, 0, 0.35)' : '1px solid transparent',
                              borderRadius: '1px',
                              cursor: state.locked ? 'default' : 'pointer',
                              lineHeight: 1.3,
                            }}
                          >
                            <Icon size={9.5} />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span style={{ marginLeft: 'auto', color: PRTS_CHART.blue, fontSize: '10px', fontWeight: 600 }}>
                      // 牌池+出怪 · 首领战自动切 DPS
                    </span>
                  )}
                </div>

                {activeNormalPage === 'intel' ? (
                  /* PAGE 1: 牌池核心余量/概率 + 本波/下波出怪预告 */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {parsed.deckPool && trackedOps.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', color: '#7d8a9c' }}>
                          <span style={{ color: PRTS_CHART.blue, fontWeight: 650 }}>
                            {trackedSource === 'wishlist'
                              ? `// 心仪牌池 · ${liveShopLevel}本`
                              : trackedSource === 'comp'
                                ? `// 阵容核心牌池 · ${liveShopLevel}本`
                                : `// 热门牌池 · ${liveShopLevel}本`}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: emptyAlertCount > 0 ? '#e88b85' : '#6f7d90' }}>
                            {emptyAlertCount > 0 ? `池空告警 ${emptyAlertCount}` : `单刷 ${parsed.deckPool.shopSlots[liveShopLevel]?.char ?? 4} 格`}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '3.5px' }}>
                          {trackedOps.map(op => {
                            const odds = computeOperatorOdds(parsed.deckPool!, op, liveShopLevel);
                            const inSelfShop = selfSeat !== null && op.inShopSeats.includes(selfSeat);
                            const isEmpty = odds.status === 'empty' || op.remaining === 0;
                            const isLocked = odds.status === 'locked';
                            return (
                              <div
                                key={op.charId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 5px 2px 3px',
                                  background: isEmpty ? 'rgba(214, 72, 64, 0.10)' : inSelfShop ? 'rgba(216, 191, 75, 0.10)' : '#141922',
                                  border: `1px solid ${isEmpty ? 'rgba(214, 72, 64, 0.50)' : inSelfShop ? 'rgba(216, 191, 75, 0.45)' : '#232c3b'}`,
                                  borderLeft: isEmpty ? `2px solid ${PRTS_CHART.crimson}` : inSelfShop ? `2px solid ${PRTS_CHART.ochre}` : '2px solid #2d384b',
                                  borderRadius: '2px',
                                  minWidth: 0,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                <CompactOperatorBadge name={op.name} size={16} />
                                <span style={{ color: isEmpty ? '#f5b4b0' : '#e4eaf3', fontSize: '10.5px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                                  {op.name}
                                </span>
                                {inSelfShop ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '9.5px' }}>
                                    <b style={{ color: PRTS_CHART.ochreBright }}>在售</b>
                                    <small style={{ color: '#8f9db0' }}>剩{op.remaining}</small>
                                  </span>
                                ) : isEmpty ? (
                                  <span style={{ flexShrink: 0, color: '#f08680', fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 700 }}>
                                    池空 0/{op.totalCopies}
                                  </span>
                                ) : isLocked ? (
                                  <span style={{ flexShrink: 0, color: '#7c8a9c', fontFamily: 'var(--font-mono)', fontSize: '9.5px' }}>
                                    {odds.tripleDiscoverProb !== null
                                      ? `三连${fmtHudPct(odds.tripleDiscoverProb)}`
                                      : `${op.tier}本 剩${op.remaining}`}
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '9.5px' }}>
                                    <small style={{ color: '#8a98ab' }}>剩{op.remaining}</small>
                                    <b style={{ color: odds.perRollProb >= 0.25 ? PRTS_CHART.ochreBright : PRTS_CHART.blue }}>
                                      {fmtHudPct(odds.perRollProb)}
                                    </b>
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {waveSpawns.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', color: '#7d8a9c' }}>
                          <span style={{ color: '#9eb0c6', fontWeight: 650 }}>
                            // R{spawnRound} {spawnIsNext ? '下波出怪预告' : '本波出怪预告'}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: '#6b7888' }}>
                            {waveSpawns.length} 怪种
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3.5px' }}>
                          {waveSpawns.map(sp => (
                            <span
                              key={`${sp.id}-${sp.name}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3.5px',
                                padding: '1.5px 5px 1.5px 2px',
                                background: '#131822',
                                border: `1px solid ${sp.boss ? 'rgba(216,191,75,0.48)' : '#242e3e'}`,
                                borderRadius: '2px',
                                fontSize: '10px',
                                color: '#d5deea',
                              }}
                            >
                              <EnemyAvatar id={sp.id} size={16} />
                              <span>{sp.name}</span>
                              {sp.count !== null && (
                                <b style={{ fontFamily: 'var(--font-mono)', color: sp.boss ? PRTS_CHART.ochreBright : PRTS_CHART.blue, fontSize: '9.5px' }}>
                                  ×{sp.count}
                                </b>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {!parsed.deckPool && waveSpawns.length === 0 && (
                      <span style={{ color: '#6b7888', fontSize: '10.5px' }}>
                        等待牌池与出怪预告同步 · 首领战自动切换参战干员输出与 DPS
                      </span>
                    )}
                  </div>
                ) : (
                  /* PAGE 2: 队友态势（四席实时血量 / 本数 / 淘汰状态 / 核心在场干员头像） */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {peerRows.map(peer => (
                      <div
                        key={peer.seat}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(4.8em, 6.8em) auto 1fr',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '2.5px 6px',
                          minHeight: '22px',
                          background: peer.eliminated ? 'rgba(18, 22, 30, 0.55)' : peer.isSelf ? 'rgba(216, 191, 75, 0.07)' : '#131822',
                          border: `1px solid ${peer.isSelf ? 'rgba(216, 191, 75, 0.35)' : '#232c3b'}`,
                          borderLeft: peer.isSelf ? `2px solid ${PRTS_CHART.ochre}` : peer.eliminated ? '2px solid #485364' : '2px solid #2b384c',
                          borderRadius: '2px',
                          opacity: peer.eliminated ? 0.56 : 1,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
                          <span style={{ color: peer.eliminated ? '#808d9e' : '#e6edf6', fontSize: '10.5px', fontWeight: peer.isSelf ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {peer.label}
                          </span>
                          {peer.isSelf && (
                            <small style={{ flexShrink: 0, padding: '0 3px', fontSize: '9px', background: 'rgba(216,191,75,0.18)', color: PRTS_CHART.ochreBright, borderRadius: '1px', fontWeight: 700 }}>
                              我
                            </small>
                          )}
                        </span>

                        {peer.eliminated ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#d87c76', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600 }}>
                            <Skull size={10} />R{peer.elimRound} 淘汰
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                            <b style={{ color: (peer.hp ?? 99) <= 5 ? '#f08680' : (peer.hp ?? 0) >= 15 ? PRTS_CHART.sage : '#cbd5e1' }}>
                              ♡{peer.hp ?? '—'}
                            </b>
                            <span style={{ color: '#90a0b5' }}>{peer.shopLevel ? `${peer.shopLevel}本` : '—'}</span>
                            {!!peer.rLeak && <span style={{ color: '#e88b85' }}>漏{peer.rLeak}</span>}
                            {!!peer.rAssist && <span style={{ color: PRTS_CHART.blue }}>兜+{peer.rAssist}</span>}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', minWidth: 0 }}>
                          {peer.eliminated ? (
                            <span style={{ color: '#677487', fontSize: '9.5px' }}>已回牌池</span>
                          ) : peer.deployed.length > 0 ? (
                            <>
                              {peer.deployed.slice(0, 4).map(u => (
                                <span
                                  key={u.instId}
                                  title={`${u.name}${u.isGolden ? '★' : ''}`}
                                  style={{
                                    display: 'inline-flex',
                                    padding: '1px',
                                    borderRadius: '2px',
                                    border: `1px solid ${u.isGolden ? 'rgba(216,191,75,0.75)' : '#283447'}`,
                                    background: u.isGolden ? 'rgba(216,191,75,0.14)' : '#0f141c',
                                  }}
                                >
                                  <CompactOperatorBadge name={u.name} size={15} />
                                </span>
                              ))}
                              {peer.deployed.length > 4 && (
                                <small style={{ color: '#7d8b9e', fontFamily: 'var(--font-mono)', fontSize: '9.5px' }}>
                                  +{peer.deployed.length - 4}
                                </small>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#647285', fontSize: '9.5px' }}>待布阵</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span style={{ color: '#94a3b8', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: 'auto', marginBottom: 'auto' }}>
                <Unlock size={11} />
                等待进入卫戍对局 · 按 {state.shortcut} 切换鼠标点击穿透
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
