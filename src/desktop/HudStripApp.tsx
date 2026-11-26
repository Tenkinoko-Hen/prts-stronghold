// 青逝痕 Tenkinoko 制作
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, PanelRightOpen, Skull, Unlock, X } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import {
  REPORT_SEATS,
  defaultBossRound,
  hasBossDamage,
  readBattleReport,
  reportBossRounds,
  reportLeader,
} from './battleReportData';
import { metricText } from './battleRoundOutcome';
import { buildDeckMatchKey, readPersistedWishlist, WISHLIST_STORAGE_PREFIX } from './BattleReportDeckPool';
import { seatDisplayText } from './BattleReportPanels';
import { EnemyAvatar } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { formatTelemetryRate, formatTelemetryTotal, isSoloMode, type DeckPoolOperator } from './combatTelemetry';
import { normalizeOperatorName } from './covenantBonds';
import { computeOperatorOdds } from './deckPoolMath';
import { HUD_SCALE_SPECS, buildHudBossTeamData, buildHudLeakData } from './hudTelemetryViewModel';
import { PRTS_CHART } from './prtsChartKit';
import type { HudOverlayState, HudScale } from './battleReports';
import './desktop.css';
import './battleReports.css';

export type HudNormalPage = 'intel' | 'peers' | 'leak' | 'dps';
type HudTab = 'intel' | 'leak' | 'dps';
type HudDpsSub = 'team' | 'ops';

const HUD_PAGE_STORAGE_KEY = 'prts:hud-normal-page:v2';

const HUD_SCALE_CYCLE: readonly HudScale[] = ['sm', 'md', 'lg'];
function nextHudScale(current: HudScale): HudScale {
  const idx = HUD_SCALE_CYCLE.indexOf(current);
  return HUD_SCALE_CYCLE[(idx + 1) % HUD_SCALE_CYCLE.length];
}

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

function fmtMmSs(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function normalizeOpName(raw: string): string {
  const clean = normalizeOperatorName(raw);
  if (clean) return clean;
  const resolved = resolveOperatorAvatars(raw);
  if (resolved[0]?.cleanName) return resolved[0].cleanName;
  return raw.replace(/["“”'‘’「」『』]/g, '').trim();
}

function toHudTab(page: HudNormalPage): HudTab {
  if (page === 'peers' || page === 'leak') return 'leak';
  if (page === 'dps') return 'dps';
  return 'intel';
}

function readSavedHudTab(fallback: HudTab): HudTab {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(HUD_PAGE_STORAGE_KEY);
      if (v === 'intel' || v === 'leak' || v === 'dps') return v;
      if (v === 'peers') return 'leak';
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

export default function HudStripApp({
  previewState,
  initialPage = 'intel',
  previewScale,
}: {
  previewState?: HudOverlayState;
  initialPage?: HudNormalPage;
  previewScale?: HudScale;
}) {
  const isLiteBrand = PRODUCT_BRAND.mode === 'telemetry';
  const brandAccent = isLiteBrand ? '#22d3ee' : '#ffe600';
  const brandFg = isLiteBrand ? '#061318' : '#0b0d11';

  const hudApi = previewState ? undefined : window.electronAPI?.hud;
  const [state, setState] = useState<HudOverlayState>(
    previewState ?? {
      open: true,
      locked: false,
      scale: previewScale ?? 'md',
      shortcut: 'Ctrl+Shift+F10',
      shortcutAvailable: false,
      status: 'starting',
      report: null,
      guide: { round: 1, compTitle: '', paceTip: '', suggestedOperators: [] },
    },
  );
  const [localScale, setLocalScale] = useState<HudScale>(previewScale ?? previewState?.scale ?? 'md');
  const activeScale: HudScale = previewScale ?? state.scale ?? localScale ?? 'md';
  const scaleSpec = HUD_SCALE_SPECS[activeScale] ?? HUD_SCALE_SPECS.md;
  // 按 2K 基准缩放字号，sm 档下限 10.5px，彻底消灭蚂蚁字
  const fs = (baseMdPx: number) => `${Math.max(10.5, Math.round(baseMdPx * scaleSpec.ratio * 10) / 10)}px`;
  const [activeTab, setActiveTab] = useState<HudTab>(() =>
    previewState ? toHudTab(initialPage) : readSavedHudTab(toHudTab(initialPage)),
  );
  const [leakCumulative, setLeakCumulative] = useState(true);
  const [leakSelectedRound, setLeakSelectedRound] = useState<number>(1);
  const [dpsSub, setDpsSub] = useState<HudDpsSub>('team');
  const [showAllWaves, setShowAllWaves] = useState(false);
  const [storageTick, setStorageTick] = useState(0);
  const autoSwitchedBossRoundRef = useRef(0);

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
    if (previewState) setActiveTab(toHudTab(initialPage));
  }, [initialPage, previewState]);

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

  const handleSelectTab = (tab: HudTab) => {
    if (state.locked) return;
    setActiveTab(tab);
    if (!previewState) {
      try {
        localStorage.setItem(HUD_PAGE_STORAGE_KEY, tab);
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
  const liveShopLevel = selfLineup?.shopLevel
    ?? Object.values(parsed?.lineups ?? {}).find(l => l.shopLevel)?.shopLevel
    ?? 1;

  // 1. Per-operator DPS / damage rows (PC exclusive)
  const roundTele = parsed?.telemetry?.rounds[roundNo] ?? parsed?.telemetry ?? null;
  const opRows = useMemo<HudOpRow[]>(() => {
    const rows: HudOpRow[] = [];
    if (roundTele && roundTele.operators.length > 0) {
      const valid = roundTele.operators.filter(o => o.totalDamage > 0);
      const total = valid.reduce((s, o) => s + o.totalDamage, 0);
      for (const op of valid) {
        rows.push({
          key: `${op.seat ?? 0}:${op.charId}`,
          name: op.name,
          damage: op.totalDamage,
          dps: op.activeDps ?? op.spanDps,
          share: total > 0 ? op.totalDamage / total : 0,
        });
      }
      return rows;
    }
    if (parsed) {
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
          rows.push({ key: k, name: v.name, damage: v.damage, dps: null, share: total > 0 ? v.damage / total : 0 });
        }
      }
    }
    return rows;
  }, [activeRound, parsed, roundTele]);

  // 2. Boss 4-player MMO ranking + Boss HP bar
  const bossRoundNo = useMemo(() => (parsed ? defaultBossRound(parsed) : 14), [parsed]);
  const bossRound = useMemo(
    () => parsed?.rounds.find(r => r.number === bossRoundNo) ?? (activeRound?.phase === 'boss' ? activeRound : undefined),
    [activeRound, bossRoundNo, parsed],
  );
  const bossPool = parsed?.telemetry?.enemyPool?.boss ?? roundTele?.enemyPool?.boss ?? null;
  const bossLeader = useMemo(() => (parsed ? reportLeader(parsed, bossRound?.number ?? bossRoundNo) : null), [bossRound?.number, bossRoundNo, parsed]);

  const bossElapsedSec = useMemo<number | null>(() => {
    const bossTele = (bossRound ? parsed?.telemetry?.rounds[bossRound.number] : null) ?? roundTele;
    if (bossTele?.logicSeconds && bossTele.logicSeconds > 0) return bossTele.logicSeconds;
    const tl = bossTele?.timeline;
    if (tl && tl.length >= 2) {
      const span = tl[tl.length - 1].t - tl[0].t;
      if (span > 0) return span;
    }
    return null;
  }, [bossRound, parsed?.telemetry?.rounds, roundTele]);

  const bossTeamData = useMemo(
    () => buildHudBossTeamData({ parsed, bossRound, bossPool, bossLeader, bossElapsedSec, soloMode, selfSeat }),
    [bossElapsedSec, bossLeader, bossPool, bossRound, parsed, selfSeat, soloMode],
  );

  const isBossContext = Boolean(
    activeRound?.phase === 'boss'
    || (parsed && reportBossRounds(parsed).includes(roundNo) && (hasBossDamage(activeRound) || activeRound?.bossEnded || Boolean(bossPool)))
    || hasBossDamage(bossRound)
    || Boolean(bossPool)
    || opRows.length > 0,
  );

  // Auto-switch to DPS once per Boss round (never overrides user's subsequent clicks!)
  useEffect(() => {
    if (previewState) return;
    const activeBossActive = Boolean(
      activeRound?.phase === 'boss'
      || (parsed && reportBossRounds(parsed).includes(roundNo) && (hasBossDamage(activeRound) || Boolean(bossPool))),
    );
    if (activeBossActive && autoSwitchedBossRoundRef.current !== roundNo) {
      autoSwitchedBossRoundRef.current = roundNo;
      setActiveTab('dps');
      setDpsSub(!soloMode && bossTeamData.teamTotal > 0 ? 'team' : 'ops');
    } else if (!activeBossActive && autoSwitchedBossRoundRef.current !== 0 && roundNo < 14) {
      autoSwitchedBossRoundRef.current = 0;
    }
  }, [activeRound, bossPool, bossTeamData.teamTotal, parsed, previewState, roundNo, soloMode]);

  // Keep leakSelectedRound synced to latest round when viewing cumulative
  useEffect(() => {
    if (leakCumulative) {
      setLeakSelectedRound(roundNo);
    }
  }, [leakCumulative, roundNo]);

  // 3. Intel Tab: Deck Pool tracked operators
  const matchKey = buildDeckMatchKey(parsed);
  const { trackedOps, trackedSource } = useMemo<{
    trackedOps: DeckPoolOperator[];
    trackedSource: 'wishlist' | 'comp' | 'hot';
  }>(() => {
    const pool = parsed?.deckPool;
    if (!pool || pool.operators.length === 0) return { trackedOps: [], trackedSource: 'hot' };
    const saved = previewState ? { chars: [], traps: [] } : readPersistedWishlist(matchKey, storageTick > 0);
    if (saved.chars.length > 0) {
      const idSet = new Set(saved.chars);
      const matched = pool.operators.filter(o => idSet.has(o.charId));
      if (matched.length > 0) return { trackedOps: matched.slice(0, 4), trackedSource: 'wishlist' };
    }
    const suggested = state.guide.suggestedOperators ?? [];
    if (suggested.length > 0) {
      const wanted = new Set(suggested.map(normalizeOpName).filter(Boolean));
      const matched: DeckPoolOperator[] = [];
      const seen = new Set<string>();
      for (const raw of suggested) {
        const clean = normalizeOpName(raw);
        if (!clean || !wanted.has(clean)) continue;
        const found = pool.operators.find(o => !seen.has(o.charId) && (o.name === raw || normalizeOpName(o.name) === clean));
        if (found) {
          seen.add(found.charId);
          matched.push(found);
        }
      }
      if (matched.length > 0) return { trackedOps: matched.slice(0, 4), trackedSource: 'comp' };
    }
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
      if (boardMatched.length > 0) return { trackedOps: boardMatched.slice(0, 4), trackedSource: 'comp' };
    }
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

  // 4. Intel Tab: Dual-Wave Same-Row Forecast (下波 R+1 | 预 R+2) + Full All-Waves Schedule (R01-R15)
  const { nextTwoWaves, spawnRound, spawnIsNext, allWaveRounds } = useMemo(() => {
    type WaveItem = { id: string; name: string; count: number | null; boss?: true };
    if (!parsed || parsed.preview.length === 0) {
      return {
        nextTwoWaves: [] as Array<{ round: number; enemies: WaveItem[] }>,
        spawnRound: roundNo,
        spawnIsNext: false,
        allWaveRounds: [] as Array<{ round: number; enemies: WaveItem[] }>,
      };
    }
    const planRows = parsed.preview.filter(p => p.kind === 'plan');
    const sourceRows = planRows.length > 0 ? planRows : parsed.preview;
    const byRound = new Map<number, Map<string, WaveItem>>();
    for (const sp of sourceRows) {
      const bucket = byRound.get(sp.round) ?? new Map<string, WaveItem>();
      const key = `${sp.boss ? '1' : '0'}:${sp.id}:${sp.name}`;
      const prev = bucket.get(key);
      if (!prev) bucket.set(key, { id: sp.id, name: sp.name, count: sp.count, boss: sp.boss });
      else if (sp.count !== null) prev.count = (prev.count ?? 0) + sp.count;
      byRound.set(sp.round, bucket);
    }
    const allWaveRounds = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, m]) => ({
        round: r,
        enemies: [...m.values()].sort((a, b) => Number(Boolean(b.boss)) - Number(Boolean(a.boss)) || (b.count ?? 0) - (a.count ?? 0)),
      }));
    const isSettled = activeRound?.phase === 'settle' || activeRound?.phase === 'end';
    const hasNext = isSettled && byRound.has(roundNo + 1);
    const chosenRound = hasNext
      ? roundNo + 1
      : byRound.has(roundNo)
        ? roundNo
        : (allWaveRounds.find(w => w.round >= roundNo)?.round ?? allWaveRounds[0]?.round ?? roundNo);
    const upcoming = allWaveRounds.filter(w => w.round >= chosenRound).slice(0, 2);
    const nextTwoWaves = upcoming.length > 0 ? upcoming : allWaveRounds.slice(-2);
    return {
      nextTwoWaves,
      spawnRound: chosenRound,
      spawnIsNext: chosenRound > roundNo,
      allWaveRounds,
    };
  }, [activeRound?.phase, parsed, roundNo]);

  // 5. Leak/Assist Tab (漏兜): 2×2 wide cards + active covenants + auto-collapsed zero-leak footer
  const leakData = useMemo(
    () => buildHudLeakData({ parsed, leakCumulative, leakSelectedRound, soloMode, selfSeat }),
    [leakCumulative, leakSelectedRound, parsed, selfSeat, soloMode],
  );

  const currentRoundLeakCount = useMemo(() => {
    if (!activeRound) return 0;
    return REPORT_SEATS.reduce((sum, s) => sum + (activeRound.leaks[s] ?? 0), 0) || (activeRound.selfLeaks ?? 0);
  }, [activeRound]);

  // Effective tab & DPS sub-mode
  const effectiveTab: HudTab = (activeTab === 'leak' && soloMode)
    ? 'intel'
    : (activeTab === 'dps' && !isBossContext)
      ? 'intel'
      : activeTab;
  const effectiveDpsSub: HudDpsSub = (dpsSub === 'team' && (soloMode || bossTeamData.teamTotal === 0) && opRows.length > 0)
    ? 'ops'
    : (dpsSub === 'ops' && opRows.length === 0 && bossTeamData.teamTotal > 0)
      ? 'team'
      : dpsSub;

  // Brand-aligned theme (Full: #ffe600 Industrial Yellow, Lite: #22d3ee Electric Cyan)
  const themeAccent = effectiveTab === 'dps'
    ? '#ff4d4f'
    : effectiveTab === 'leak'
      ? (!leakCumulative || leakData.totalEscaped > 0 ? '#ff7a00' : (isLiteBrand ? '#22d3ee' : '#00e5ff'))
      : brandAccent;
  const shellBg = effectiveTab === 'dps'
    ? (state.locked ? 'rgba(24, 10, 13, 0.84)' : 'rgba(20, 10, 14, 0.96)')
    : effectiveTab === 'leak' && (!leakCumulative || leakData.totalEscaped > 0)
      ? (state.locked ? 'rgba(24, 15, 8, 0.84)' : 'rgba(22, 14, 9, 0.96)')
      : (state.locked ? 'rgba(11, 14, 20, 0.84)' : 'rgba(12, 16, 23, 0.96)');

  const maxOpDamage = Math.max(1, ...opRows.map(o => o.damage));
  const maxTeamDamage = Math.max(1, ...bossTeamData.rows.map(r => r.damage));
  const emptyAlertCount = parsed?.deckPool ? trackedOps.filter(o => o.remaining === 0).length : 0;
  const fullGuideText = !isLiteBrand && state.guide.paceTip ? state.guide.paceTip : '';

  const maxSelectableRound = Math.max(1, Math.min(15, parsed?.current || parsed?.rounds.at(-1)?.number || roundNo || 15));
  const stepLeakRound = (delta: number) => {
    if (state.locked) return;
    if (leakCumulative) {
      setLeakCumulative(false);
      setLeakSelectedRound(maxSelectableRound);
      return;
    }
    setLeakSelectedRound(prev => Math.max(1, Math.min(maxSelectableRound, prev + delta)));
  };

  const badgeLabel = effectiveTab === 'dps'
    ? `R${String(bossRound?.number ?? roundNo).padStart(2, '0')}·BOSS`
    : effectiveTab === 'leak'
      ? (leakCumulative ? `R1-${String(roundNo).padStart(2, '0')}` : `R${String(leakSelectedRound).padStart(2, '0')}`)
      : parsed?.mode === 'mode_solo_stage'
        ? 'SOLO'
        : `R${String(roundNo).padStart(2, '0')}${liveShopLevel ? `·${liveShopLevel}本` : ''}`;

  const peerBarPalettes = [
    'linear-gradient(90deg, rgba(14, 92, 112, 0.85), rgba(8, 145, 178, 0.72))',
    'linear-gradient(90deg, rgba(76, 29, 149, 0.85), rgba(124, 58, 237, 0.72))',
    'linear-gradient(90deg, rgba(30, 58, 95, 0.85), rgba(37, 99, 235, 0.72))',
    'linear-gradient(90deg, rgba(39, 50, 68, 0.85), rgba(71, 85, 105, 0.72))',
  ];

  const isAsciiBadge = /^[A-Z0-9·-]+$/.test(badgeLabel);
  const handleCycleScale = () => {
    if (state.locked) return;
    const next = nextHudScale(activeScale);
    setLocalScale(next);
    if (hudApi?.setScale) {
      void hudApi.setScale(next);
    }
  };
  const headerH = Math.round(32 * scaleSpec.ratio);
  const avatarOpSize = Math.round(18 * scaleSpec.ratio);
  const avatarEnemySize = Math.round(15 * scaleSpec.ratio);

  return (
    <div
      style={{
        width: previewState ? `${scaleSpec.width}px` : '100vw',
        height: previewState ? `${scaleSpec.height}px` : '100vh',
        boxSizing: 'border-box',
        padding: '3px 4px',
        background: 'transparent',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        fontVariantNumeric: 'tabular-nums',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <section
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: shellBg,
          border: `1px solid ${state.locked ? `${themeAccent}66` : `${themeAccent}88`}`,
          borderLeft: `3px solid ${themeAccent}`,
          borderRadius: '2px',
          color: '#f1f5f9',
          overflow: 'hidden',
        }}
      >
        {/* Top Compact Drag Header */}
        <header
          style={{
            flex: 'none',
            height: `${headerH}px`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 8px',
            borderBottom: '1px solid rgba(45, 54, 68, 0.78)',
            WebkitAppRegion: state.locked ? 'no-drag' : 'drag',
            fontFamily: 'var(--font-sans)',
            fontSize: fs(12),
          } as React.CSSProperties}
        >
          <span
            style={{
              padding: '1px 6px',
              background: themeAccent,
              color: effectiveTab === 'dps' ? '#ffffff' : brandFg,
              fontFamily: isAsciiBadge ? 'var(--font-mono)' : 'var(--font-sans)',
              fontWeight: 800,
              fontSize: fs(12),
              lineHeight: 1.25,
              borderRadius: '2px',
              flexShrink: 0,
            }}
          >
            {badgeLabel}
          </span>

          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#cbd5e1', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: 600 }}>
            {effectiveTab === 'dps'
              ? bossTeamData.bossName
              : [state.guide.compTitle, parsed?.difficulty].filter(Boolean).join(' · ') || `${PRODUCT_BRAND.shortName} 战术悬浮条`}
          </span>

          {/* Unified Mode Capsule */}
          {parsed && !state.locked && (
            <div
              role="tablist"
              aria-label="悬浮条视图切换"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: '#0c1017',
                border: '1px solid #2a3444',
                borderRadius: '2px',
                padding: '1px',
                gap: '1px',
                flexShrink: 0,
                WebkitAppRegion: 'no-drag',
              } as React.CSSProperties}
            >
              {([
                ['intel', '情报', brandAccent, brandFg],
                ...(!soloMode ? [['leak', currentRoundLeakCount > 0 ? `漏兜·${currentRoundLeakCount}` : '漏兜', currentRoundLeakCount > 0 ? '#ff7a00' : (isLiteBrand ? '#22d3ee' : '#00e5ff'), '#0b0d11'] as const] : []),
                ...(isBossContext ? [['dps', 'DPS', '#ff4d4f', '#ffffff'] as const] : []),
              ] as ReadonlyArray<readonly [HudTab, string, string, string]>).map(([id, label, activeBg, activeFg]) => {
                const active = effectiveTab === id;
                const isAsciiTab = id === 'dps';
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectTab(id)}
                    style={{
                      padding: '2px 7px',
                      fontFamily: isAsciiTab ? 'var(--font-mono)' : 'var(--font-sans)',
                      fontSize: fs(11.5),
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: '1px',
                      cursor: 'pointer',
                      lineHeight: 1.25,
                      color: active ? activeFg : '#94a3b8',
                      background: active ? activeBg : 'transparent',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {state.locked ? (
            <span style={{ color: themeAccent, fontSize: fs(11), fontFamily: 'var(--font-sans)', flexShrink: 0, whiteSpace: 'nowrap' }}>
              穿透 · {state.shortcut}
            </span>
          ) : (
            <div style={{ display: 'inline-flex', gap: '3px', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                type="button"
                onClick={handleCycleScale}
                title={`切换尺寸：小 / 中 / 大（当前：${scaleSpec.label} ${scaleSpec.width}×${scaleSpec.height}）`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 6px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: fs(11),
                  fontWeight: 700,
                  lineHeight: 1.25,
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  background: '#161c26',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                {scaleSpec.label}
              </button>
              {(state.clientSource === 'mumu' || state.drawerCollapsed) && (
                <button
                  type="button"
                  onClick={() => void hudApi?.expandDrawer?.()}
                  title={isLiteBrand ? '展开右侧 MuMu 战报窄栏' : '展开右侧 MuMu 战术抽屉'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 6px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: fs(11.5),
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: '#22d3ee',
                    border: '1px solid rgba(34,211,238,0.5)',
                    background: 'rgba(34,211,238,0.12)',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  <PanelRightOpen size={11} />{isLiteBrand ? '侧栏' : '抽屉'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void hudApi?.setLocked(true)}
                title={`锁定鼠标穿透（${state.shortcut} 随时解锁）`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 6px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: fs(11.5),
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: brandAccent,
                  border: `1px solid ${isLiteBrand ? 'rgba(34,211,238,0.45)' : 'rgba(255,230,0,0.45)'}`,
                  background: isLiteBrand ? 'rgba(34,211,238,0.10)' : 'rgba(255,230,0,0.10)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <Lock size={11} />穿透
              </button>
              <button
                type="button"
                onClick={() => void hudApi?.setOpen(false)}
                title="关闭悬浮条"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 5px',
                  color: '#94a3b8',
                  border: '1px solid #2d3644',
                  background: '#161c26',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </header>

        {/* Scrollable Tactical Body */}
        <div
          className="d-hud-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {!parsed ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', color: '#94a3b8', fontFamily: 'var(--font-sans)', fontSize: fs(12), gap: '6px' }}>
              <Unlock size={13} />
              等待对局实时信号 · 自动同步牌池、双波出怪、4 人漏兜盟约与 Boss DPS
            </div>
          ) : effectiveTab === 'dps' ? (
            /* ===== TAB 3: Boss MMO Damage Meter & Live DPS ([4人榜 | 干员DPS]) ===== */
            <div style={{ flex: '1 0 auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: `${Math.round(24 * scaleSpec.ratio)}px` }}>
                {bossTeamData.bossEnemyId && <EnemyAvatar id={bossTeamData.bossEnemyId} size={Math.round(22 * scaleSpec.ratio)} />}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    position: 'relative',
                    height: `${Math.round(22 * scaleSpec.ratio)}px`,
                    background: '#1d0b10',
                    border: '1px solid rgba(255, 77, 79, 0.55)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    padding: '0 8px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: fs(11.5),
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {bossTeamData.hpPct !== null && bossTeamData.hpPct > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${bossTeamData.hpPct}%`,
                        background: 'linear-gradient(90deg, #b91c1c, #f97316)',
                        opacity: 0.72,
                      }}
                    />
                  )}
                  <span style={{ position: 'relative', color: '#ffffff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {bossTeamData.hpPct !== null
                      ? `BOSS HP ${bossTeamData.hpPct}% · 余 ${formatTelemetryTotal(bossTeamData.bossHp ?? 0)}`
                      : bossTeamData.bossHp !== null
                        ? `BOSS 余 ${formatTelemetryTotal(bossTeamData.bossHp)}`
                        : 'BOSS 伤害统计'}
                  </span>
                  <span style={{ position: 'relative', color: '#fef08a', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {bossTeamData.teamTotal > 0
                      ? `全队 ${formatTelemetryTotal(bossTeamData.teamTotal)}${bossTeamData.teamDps ? ` · ${formatTelemetryRate(bossTeamData.teamDps)}` : ''}${fmtMmSs(bossElapsedSec) ? ` · ${fmtMmSs(bossElapsedSec)}` : ''}`
                      : opRows.length > 0
                        ? `参战 ${opRows.length} 干员`
                        : '等待伤害'}
                  </span>
                </div>

                {!soloMode && opRows.length > 0 && bossTeamData.teamTotal > 0 && !state.locked && (
                  <div
                    style={{
                      display: 'inline-flex',
                      background: '#0c1017',
                      border: '1px solid #442329',
                      borderRadius: '2px',
                      padding: '1px',
                      gap: '1px',
                      flexShrink: 0,
                    }}
                  >
                    {([
                      ['team', '4人榜'],
                      ['ops', '干员DPS'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDpsSub(id)}
                        style={{
                          padding: '2px 6px',
                          fontFamily: 'var(--font-sans)',
                          fontSize: fs(11.5),
                          fontWeight: 700,
                          lineHeight: 1.25,
                          border: 'none',
                          borderRadius: '1px',
                          cursor: 'pointer',
                          color: effectiveDpsSub === id ? '#ffffff' : '#fca5a5',
                          background: effectiveDpsSub === id ? '#dc2626' : 'transparent',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {effectiveDpsSub === 'team' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(() => {
                    let peerIdx = 0;
                    const rowH = Math.round(30 * scaleSpec.ratio);
                    return bossTeamData.rows.map(row => {
                      const pct = row.damage > 0 ? Math.max(4, (row.damage / maxTeamDamage) * 100) : 0;
                      const barBg = row.isSelf
                        ? (isLiteBrand
                          ? 'linear-gradient(90deg, rgba(14, 116, 144, 0.88), rgba(34, 211, 238, 0.72))'
                          : 'linear-gradient(90deg, rgba(138, 115, 8, 0.88), rgba(212, 177, 6, 0.78))')
                        : peerBarPalettes[Math.min(peerIdx++, peerBarPalettes.length - 1)];
                      return (
                        <div
                          key={row.seat}
                          style={{
                            position: 'relative',
                            height: `${rowH}px`,
                            background: '#11161f',
                            border: `1px solid ${row.isSelf ? `${brandAccent}99` : '#232d3d'}`,
                            borderRadius: '2px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 8px',
                            gap: '6px',
                            fontFamily: 'var(--font-sans)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {pct > 0 && (
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: barBg }} />
                          )}
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: fs(11.5), fontWeight: 800, color: row.rank === 1 ? '#ffe600' : row.isSelf ? brandAccent : '#94a3b8', minWidth: '22px' }}>
                            #{row.rank}
                          </span>
                          {row.isSelf && (
                            <small style={{ position: 'relative', padding: '1px 4px', fontFamily: 'var(--font-sans)', fontSize: fs(11), lineHeight: 1.15, fontWeight: 800, background: brandAccent, color: brandFg, borderRadius: '2px' }}>
                              我
                            </small>
                          )}
                          <strong style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: row.isSelf ? 700 : 600, color: '#ffffff' }}>
                            {row.label}
                          </strong>
                          <b style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: 800, color: '#ffffff', minWidth: '54px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {row.damage > 0 ? formatTelemetryTotal(row.damage) : '—'}
                          </b>
                          {row.dps !== null && (
                            <span style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), color: row.isSelf ? '#fef08a' : '#bae6fd', minWidth: '58px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {formatTelemetryRate(row.dps)}
                            </span>
                          )}
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: fs(12), fontWeight: 700, color: '#e2e8f0', minWidth: '44px', textAlign: 'right' }}>
                            {row.sharePct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {opRows.map((op, i) => {
                    const pct = Math.max(4, (op.damage / maxOpDamage) * 100);
                    const rowH = Math.round(30 * scaleSpec.ratio);
                    const barBg = i === 0
                      ? 'linear-gradient(90deg, rgba(138, 115, 8, 0.88), rgba(212, 177, 6, 0.78))'
                      : peerBarPalettes[Math.min(i - 1, peerBarPalettes.length - 1)];
                    return (
                      <div
                        key={op.key}
                        style={{
                          position: 'relative',
                          height: `${rowH}px`,
                          background: '#11161f',
                          border: `1px solid ${i === 0 ? 'rgba(255, 230, 0, 0.58)' : '#232d3d'}`,
                          borderRadius: '2px',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px',
                          gap: '6px',
                          fontFamily: 'var(--font-sans)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: barBg }} />
                        <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: fs(11.5), fontWeight: 800, color: i === 0 ? '#ffe600' : '#94a3b8', minWidth: '22px' }}>
                          #{i + 1}
                        </span>
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                          <CompactOperatorBadge name={op.name} size={avatarOpSize} />
                        </span>
                        <strong style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: 700, color: '#ffffff' }}>
                          {op.name}
                        </strong>
                        <b style={{ position: 'relative', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: 800, color: '#ffffff', minWidth: '54px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {formatTelemetryTotal(op.damage)}
                        </b>
                        <span style={{ position: 'relative', fontFamily: op.dps !== null ? 'var(--font-sans)' : 'var(--font-mono)', fontSize: fs(11.5), color: i === 0 ? '#fef08a' : '#bae6fd', minWidth: '58px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {op.dps !== null ? formatTelemetryRate(op.dps) : `${(op.share * 100).toFixed(1)}%`}
                        </span>
                        {op.dps !== null && (
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: fs(12), fontWeight: 700, color: '#e2e8f0', minWidth: '42px', textAlign: 'right' }}>
                            {(op.share * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : effectiveTab === 'leak' ? (
            /* ===== TAB 2: 漏兜 2×2 紧凑宽卡（含 4 人已激活盟约）+ 零漏自动折叠底栏 ===== */
            <div style={{ flex: '1 0 auto', padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: `${Math.round(20 * scaleSpec.ratio)}px` }}>
                <div
                  style={{
                    display: 'inline-flex',
                    background: '#0c1017',
                    border: '1px solid #2a3444',
                    borderRadius: '2px',
                    padding: '1px',
                    gap: '1px',
                  }}
                >
                  <button
                    type="button"
                    disabled={state.locked}
                    onClick={() => setLeakCumulative(true)}
                    style={{
                      padding: '1px 7px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: fs(11.5),
                      fontWeight: 700,
                      lineHeight: 1.2,
                      border: 'none',
                      borderRadius: '1px',
                      cursor: state.locked ? 'default' : 'pointer',
                      background: leakCumulative ? (isLiteBrand ? '#22d3ee' : '#00e5ff') : 'transparent',
                      color: leakCumulative ? '#0b0d11' : '#94a3b8',
                    }}
                  >
                    累计
                  </button>
                  <button
                    type="button"
                    disabled={state.locked}
                    onClick={() => { setLeakCumulative(false); setLeakSelectedRound(roundNo); }}
                    style={{
                      padding: '1px 7px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: fs(11.5),
                      fontWeight: 700,
                      lineHeight: 1.2,
                      border: 'none',
                      borderRadius: '1px',
                      cursor: state.locked ? 'default' : 'pointer',
                      background: !leakCumulative ? '#ff7a00' : 'transparent',
                      color: !leakCumulative ? '#0b0d11' : '#94a3b8',
                    }}
                  >
                    单回合
                  </button>
                </div>

                {!state.locked && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <button
                      type="button"
                      onClick={() => stepLeakRound(-1)}
                      title="上一回合"
                      style={{ display: 'inline-grid', placeItems: 'center', width: '18px', height: '18px', padding: 0, background: '#161c26', border: '1px solid #2a3444', color: brandAccent, borderRadius: '2px', cursor: 'pointer' }}
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: fs(11.5), fontWeight: 700, color: '#e2e8f0', minWidth: '40px', textAlign: 'center', lineHeight: 1.2 }}>
                      {leakCumulative ? `R1-${roundNo}` : `R${String(leakSelectedRound).padStart(2, '0')}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepLeakRound(1)}
                      title="下一回合"
                      style={{ display: 'inline-grid', placeItems: 'center', width: '18px', height: '18px', padding: 0, background: '#161c26', border: '1px solid #2a3444', color: brandAccent, borderRadius: '2px', cursor: 'pointer' }}
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}

                <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), lineHeight: 1.3, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  <span
                    style={{
                      padding: '0 6px',
                      borderRadius: '2px',
                      background: leakData.totalLeaks > 0 ? 'rgba(245, 158, 11, 0.20)' : '#141b26',
                      border: `1px solid ${leakData.totalLeaks > 0 ? 'rgba(245, 158, 11, 0.80)' : '#273447'}`,
                      color: leakData.totalLeaks > 0 ? '#fbbf24' : '#64748b',
                    }}
                  >
                    漏 {leakData.totalLeaks}
                  </span>
                  <span
                    style={{
                      padding: '0 6px',
                      borderRadius: '2px',
                      background: leakData.totalAssisted > 0 ? 'rgba(0, 229, 255, 0.18)' : '#141b26',
                      border: `1px solid ${leakData.totalAssisted > 0 ? 'rgba(0, 229, 255, 0.80)' : '#273447'}`,
                      color: leakData.totalAssisted > 0 ? '#67e8f9' : '#64748b',
                    }}
                  >
                    兜 {leakData.totalAssisted}
                  </span>
                  <span
                    style={{
                      padding: '0 6px',
                      borderRadius: '2px',
                      background: leakData.totalEscaped > 0 ? 'rgba(255, 77, 79, 0.25)' : '#141b26',
                      border: `1px solid ${leakData.totalEscaped > 0 ? 'rgba(255, 77, 79, 0.90)' : '#273447'}`,
                      color: leakData.totalEscaped > 0 ? '#ff8080' : '#64748b',
                    }}
                  >
                    {leakData.totalEscaped > 0 ? `逃 ${leakData.totalEscaped}` : '零逃'}
                  </span>
                </div>
              </div>

              {/* 2×2 Wide Player Cards (昵称 + ♥HP + 本数 + 实时盟约 + 双轨 兜/漏) */}
              <div style={{ display: 'grid', gridTemplateColumns: soloMode ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: '3px 4px' }}>
                {(() => {
                  const maxMetric = Math.max(1, ...leakData.cards.map(c => Math.max(c.leaked, c.assisted)));
                  return leakData.cards.map(card => {
                    const assistPct = (card.assisted / maxMetric) * 100;
                    const coveredPct = (card.covered / maxMetric) * 100;
                    const escapedPct = (card.escaped / maxMetric) * 100;
                    const leakDisplay = card.leaked === 0
                      ? '0'
                      : metricText({ value: card.leaked, quality: card.leakQuality });
                    return (
                      <div
                        key={card.seat}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.5px',
                          padding: '3px 6px',
                          lineHeight: 1.25,
                          background: card.eliminated
                            ? 'rgba(18, 22, 30, 0.55)'
                            : card.isSelf
                              ? (isLiteBrand ? 'rgba(34, 211, 238, 0.09)' : 'rgba(255, 230, 0, 0.09)')
                              : card.escaped > 0
                                ? 'rgba(255, 77, 79, 0.11)'
                                : '#131a24',
                          border: `1px solid ${card.isSelf ? `${brandAccent}88` : card.escaped > 0 ? 'rgba(255, 77, 79, 0.5)' : '#263142'}`,
                          borderRadius: '2px',
                          opacity: card.eliminated ? 0.58 : 1,
                          fontFamily: 'var(--font-sans)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
                            {card.isSelf && (
                              <small style={{ padding: '0 4px', fontFamily: 'var(--font-sans)', fontSize: fs(11), lineHeight: 1.2, fontWeight: 800, background: brandAccent, color: brandFg, borderRadius: '2px', flexShrink: 0 }}>
                                我
                              </small>
                            )}
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: card.isSelf ? 700 : 600, color: card.isSelf ? (isLiteBrand ? '#a5f3fc' : '#fff8b0') : '#e2e8f0' }}>
                              {card.label}
                            </span>
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontFamily: 'var(--font-sans)', fontSize: fs(11.5) }}>
                            {card.eliminated ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#f87171', fontWeight: 700, fontSize: fs(11) }}>
                                <Skull size={11} />R{card.elimRound}出局
                              </span>
                            ) : (
                              <>
                                <b style={{ fontFamily: 'var(--font-mono)', fontSize: fs(11.5), color: (card.hp ?? 99) <= 5 ? '#ff7875' : (card.hp ?? 0) >= 15 ? '#34d399' : '#cbd5e1' }}>
                                  ♥{card.hp ?? '—'}
                                </b>
                                {card.shopLevel && (
                                  <span style={{ padding: '0 4px', borderRadius: '2px', background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.4)', color: '#7dd3fc', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: fs(11), lineHeight: 1.2 }}>
                                    {card.shopLevel}本
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {!card.eliminated && card.bonds.shown.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden' }}>
                            {card.bonds.shown.map(b => (
                              <span
                                key={b.name}
                                style={{
                                  padding: '0 4px',
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: fs(11),
                                  lineHeight: 1.2,
                                  fontWeight: 700,
                                  borderRadius: '2px',
                                  whiteSpace: 'nowrap',
                                  background: b.active ? 'rgba(34, 211, 238, 0.15)' : 'rgba(148, 163, 184, 0.12)',
                                  border: `1px solid ${b.active ? 'rgba(34, 211, 238, 0.45)' : 'rgba(148, 163, 184, 0.28)'}`,
                                  color: b.active ? '#67e8f9' : '#94a3b8',
                                }}
                              >
                                {b.shortName}{b.count}
                              </span>
                            ))}
                            {card.bonds.hiddenCount > 0 && (
                              <span style={{ fontSize: fs(11), color: '#64748b', fontFamily: 'var(--font-mono)' }}>+{card.bonds.hiddenCount}</span>
                            )}
                          </div>
                        )}

                        {!card.eliminated && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), lineHeight: 1.2, fontWeight: 700 }}>
                              <span style={{ color: card.assisted > 0 ? '#00e5ff' : '#64748b', flexShrink: 0 }}>兜</span>
                              <div style={{ flex: 1, height: '5px', background: '#0b0f16', border: '1px solid #1f2a3a', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                                {assistPct > 0 && <span style={{ width: `${assistPct}%`, background: '#00e5ff' }} />}
                              </div>
                              <span style={{ fontFamily: 'var(--font-mono)', color: card.assisted > 0 ? '#67e8f9' : '#475569', flexShrink: 0, minWidth: '22px', textAlign: 'right' }}>
                                {card.assisted > 0 ? `+${card.assisted}` : '0'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), lineHeight: 1.2, fontWeight: 700 }}>
                              <span style={{ color: card.escaped > 0 ? '#ff6b6b' : card.leaked > 0 ? '#fbbf24' : '#64748b', flexShrink: 0 }}>漏</span>
                              <div style={{ flex: 1, height: '5px', background: '#0b0f16', border: '1px solid #1f2a3a', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                                {coveredPct > 0 && <span style={{ width: `${coveredPct}%`, background: '#fb923c' }} />}
                                {escapedPct > 0 && <span style={{ width: `${escapedPct}%`, background: '#ff4d4f' }} />}
                              </div>
                              <span style={{ fontFamily: 'var(--font-sans)', flexShrink: 0, minWidth: '22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {card.leaked === 0 ? (
                                  <span style={{ color: '#475569' }}>0</span>
                                ) : card.escaped === 0 ? (
                                  <span style={{ color: '#fbbf24' }}>{leakDisplay}</span>
                                ) : (
                                  <>
                                    <span style={{ color: '#fbbf24' }}>{leakDisplay}</span>
                                    <span style={{ color: '#ff6b6b', marginLeft: '3px' }}>逃{card.escaped}</span>
                                  </>
                                )}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Auto-Collapsed Bottom Leaked Enemy Icons (hidden when 0 leaked enemies!) */}
              {leakData.enemies.length > 0 && (() => {
                const maxEnemies = activeScale === 'sm' ? 3 : 4;
                const restCount = leakData.enemies.length - maxEnemies;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '1.5px 6px', background: 'rgba(255,77,79,0.08)', border: '1px solid rgba(255,77,79,0.28)', borderRadius: '2px', minHeight: '20px', lineHeight: 1.25 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: fs(11.5), fontWeight: 700, color: '#fb923c', flexShrink: 0 }}>
                      {leakCumulative ? `累计高漏(${leakData.totalLeaks})` : `R${String(leakSelectedRound).padStart(2, '0')}漏怪`}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                      {leakData.enemies.slice(0, maxEnemies).map(e => (
                        <span
                          key={e.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            minWidth: 0,
                            padding: '0.5px 5px 0.5px 2px',
                            background: '#221215',
                            border: '1px solid rgba(255, 77, 79, 0.45)',
                            borderRadius: '2px',
                            fontFamily: 'var(--font-sans)',
                            fontSize: fs(11.5),
                            color: '#e2e8f0',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <EnemyAvatar id={e.id} size={avatarEnemySize} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.name.length > 5 ? e.name.slice(0, 5) : e.name}
                          </span>
                          <b style={{ fontFamily: 'var(--font-mono)', color: '#fca5a5', fontSize: fs(11), flexShrink: 0 }}>×{e.count}</b>
                        </span>
                      ))}
                      {restCount > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: fs(11), color: '#94a3b8', flexShrink: 0 }}>
                          +{restCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* ===== TAB 1: 情报（心仪牌池 + 未来两波单行同屏预报 + Full 节奏提示）===== */
            <>
              {fullGuideText && (
                <div
                  style={{
                    flex: 'none',
                    padding: '4px 8px',
                    borderBottom: '1px solid rgba(45, 54, 68, 0.55)',
                    background: 'rgba(255, 230, 0, 0.05)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: fs(11.5),
                    lineHeight: 1.35,
                    color: '#e2e8f0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={fullGuideText}
                >
                  {fullGuideText}
                </div>
              )}

              <div style={{ flex: '1 0 auto', padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {parsed.deckPool && trackedOps.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), color: '#7d8a9c' }}>
                      <span style={{ color: PRTS_CHART.blue, fontWeight: 700 }}>
                        {trackedSource === 'wishlist'
                          ? `// 心仪牌池 · ${liveShopLevel}本`
                          : trackedSource === 'comp'
                            ? `// 核心牌池 · ${liveShopLevel}本`
                            : `// 热门牌池 · ${liveShopLevel}本`}
                      </span>
                      <span style={{ fontFamily: 'var(--font-sans)', color: emptyAlertCount > 0 ? '#e88b85' : '#6f7d90' }}>
                        {emptyAlertCount > 0 ? `池空告警 ${emptyAlertCount}` : `单刷 ${parsed.deckPool.shopSlots[liveShopLevel]?.char ?? 4} 格`}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px' }}>
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
                              gap: '5px',
                              padding: '3.5px 6px 3.5px 4px',
                              background: isEmpty ? 'rgba(214, 72, 64, 0.10)' : inSelfShop ? 'rgba(216, 191, 75, 0.10)' : '#141922',
                              border: `1px solid ${isEmpty ? 'rgba(214, 72, 64, 0.50)' : inSelfShop ? 'rgba(216, 191, 75, 0.45)' : '#232c3b'}`,
                              borderLeft: isEmpty ? `2px solid ${PRTS_CHART.crimson}` : inSelfShop ? `2px solid ${PRTS_CHART.ochre}` : '2px solid #2d384b',
                              borderRadius: '2px',
                              minWidth: 0,
                              fontFamily: 'var(--font-sans)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            <CompactOperatorBadge name={op.name} size={avatarOpSize} />
                            <span style={{ color: isEmpty ? '#f5b4b0' : '#e4eaf3', fontFamily: 'var(--font-sans)', fontSize: fs(12.5), fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                              {op.name}
                            </span>
                            {inSelfShop ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontFamily: 'var(--font-sans)', fontSize: fs(11.5) }}>
                                <b style={{ color: PRTS_CHART.ochreBright }}>在售</b>
                                <small style={{ fontSize: fs(11.5), color: '#8f9db0' }}>剩{op.remaining}</small>
                              </span>
                            ) : isEmpty ? (
                              <span style={{ flexShrink: 0, color: '#f08680', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), fontWeight: 700 }}>
                                池空 0/{op.totalCopies}
                              </span>
                            ) : isLocked ? (
                              <span style={{ flexShrink: 0, color: '#7c8a9c', fontFamily: 'var(--font-sans)', fontSize: fs(11.5) }}>
                                {odds.tripleDiscoverProb !== null
                                  ? `三连${fmtHudPct(odds.tripleDiscoverProb)}`
                                  : `${op.tier}本 剩${op.remaining}`}
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontFamily: 'var(--font-sans)', fontSize: fs(11.5) }}>
                                <small style={{ fontSize: fs(11.5), color: '#8a98ab' }}>剩{op.remaining}</small>
                                <b style={{ fontFamily: 'var(--font-mono)', fontSize: fs(12), color: odds.perRollProb >= 0.25 ? PRTS_CHART.ochreBright : PRTS_CHART.blue }}>
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

                {nextTwoWaves.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: fs(11.5), color: '#7d8a9c' }}>
                      <span style={{ color: '#22d3ee', fontWeight: 700 }}>
                        {showAllWaves
                          ? `// 全波次出怪总览 · ${allWaveRounds.length} 波`
                          : nextTwoWaves.length >= 2
                            ? `// 未来两波出怪 · R${nextTwoWaves[0].round} + R${nextTwoWaves[1].round}`
                            : `// R${spawnRound} ${spawnIsNext ? '下波出怪' : '本波出怪'}`}
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        {allWaveRounds.length > 1 && !state.locked && (
                          <button
                            type="button"
                            onClick={() => setShowAllWaves(v => !v)}
                            style={{
                              padding: '1px 6px',
                              fontFamily: 'var(--font-sans)',
                              fontSize: fs(11),
                              fontWeight: 700,
                              borderRadius: '2px',
                              cursor: 'pointer',
                              border: '1px solid rgba(34, 211, 238, 0.55)',
                              background: showAllWaves ? '#22d3ee' : 'rgba(34, 211, 238, 0.12)',
                              color: showAllWaves ? '#061318' : '#22d3ee',
                            }}
                          >
                            {showAllWaves ? '收起' : `完整(${allWaveRounds.length})`}
                          </button>
                        )}
                      </div>
                    </div>

                    {showAllWaves ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {allWaveRounds.map(w => {
                          const isCur = w.round === roundNo;
                          const isNext = w.round === spawnRound && spawnIsNext;
                          const isBossWave = w.round >= 14 || w.enemies.some(e => e.boss);
                          const isPast = w.round < roundNo;
                          return (
                            <div
                              key={w.round}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '5px',
                                padding: '3px 5px',
                                background: isCur ? 'rgba(255,230,0,0.08)' : isNext ? 'rgba(0,229,255,0.08)' : isBossWave ? 'rgba(255,77,79,0.1)' : '#101620',
                                borderLeft: `2px solid ${isBossWave ? '#ff4d4f' : isCur ? brandAccent : isNext ? '#00e5ff' : '#2a3547'}`,
                                opacity: isPast ? 0.55 : 1,
                              }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  minWidth: '34px',
                                  textAlign: 'center',
                                  padding: '1px 4px',
                                  borderRadius: '2px',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: fs(11),
                                  fontWeight: 800,
                                  background: isBossWave ? '#ff4d4f' : isCur ? brandAccent : isNext ? '#00e5ff' : '#1e293b',
                                  color: (isCur || isNext) && !isBossWave ? brandFg : '#ffffff',
                                }}
                              >
                                R{String(w.round).padStart(2, '0')}
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, minWidth: 0 }}>
                                {w.enemies.map(sp => (
                                  <span
                                    key={`${w.round}-${sp.id}-${sp.name}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '1px 5px 1px 2px',
                                      background: '#131822',
                                      border: `1px solid ${sp.boss ? 'rgba(255,77,79,0.55)' : '#242e3e'}`,
                                      borderRadius: '2px',
                                      fontFamily: 'var(--font-sans)',
                                      fontSize: fs(11.5),
                                      color: '#e2e8f0',
                                    }}
                                  >
                                    <EnemyAvatar id={sp.id} size={avatarEnemySize} />
                                    <span>{sp.name}</span>
                                    {sp.count !== null && (
                                      <b style={{ fontFamily: 'var(--font-mono)', color: sp.boss ? '#fca5a5' : brandAccent, fontSize: fs(11) }}>
                                        ×{sp.count}
                                      </b>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Single-row Dual-Wave Side-by-Side (下波 R+1 | 预 R+2) */
                      <div style={{ display: 'grid', gridTemplateColumns: nextTwoWaves.length >= 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: '4px' }}>
                        {nextTwoWaves.map((w, idx) => {
                          const isBossWave = w.round >= 14 || w.enemies.some(e => e.boss);
                          const dual = nextTwoWaves.length >= 2;
                          const maxItems = dual ? 2 : (activeScale === 'sm' ? 4 : 5);
                          const hiddenWaves = w.enemies.length - maxItems;
                          return (
                            <div
                              key={w.round}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 5px',
                                background: isBossWave ? 'rgba(255,77,79,0.10)' : idx === 0 ? 'rgba(34,211,238,0.08)' : '#101620',
                                border: `1px solid ${isBossWave ? 'rgba(255,77,79,0.45)' : idx === 0 ? 'rgba(34,211,238,0.40)' : '#232e3f'}`,
                                borderRadius: '2px',
                                minWidth: 0,
                                overflow: 'hidden',
                              }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  padding: '1px 4px',
                                  borderRadius: '2px',
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: fs(11),
                                  fontWeight: 800,
                                  background: isBossWave ? '#ff4d4f' : idx === 0 ? '#22d3ee' : '#1e3a5f',
                                  color: isBossWave ? '#ffffff' : idx === 0 ? '#061318' : '#7dd3fc',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {idx === 0 ? `下R${String(w.round).padStart(2, '0')}` : `预R${String(w.round).padStart(2, '0')}`}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                {w.enemies.slice(0, maxItems).map(sp => (
                                  <span
                                    key={`${w.round}-${sp.id}-${sp.name}`}
                                    title={`${sp.name}${sp.count !== null ? ` ×${sp.count}` : ''}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      minWidth: 0,
                                      padding: '1px 4px 1px 2px',
                                      background: '#131822',
                                      border: `1px solid ${sp.boss ? 'rgba(255,77,79,0.55)' : '#242e3e'}`,
                                      borderRadius: '2px',
                                      fontFamily: 'var(--font-sans)',
                                      fontSize: fs(11.5),
                                      color: '#e2e8f0',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                                      <EnemyAvatar id={sp.id} size={avatarEnemySize} />
                                    </span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {dual && sp.name.length > 4 ? sp.name.slice(0, 4) : sp.name}
                                    </span>
                                    {sp.count !== null && (
                                      <b style={{ fontFamily: 'var(--font-mono)', color: sp.boss ? '#fca5a5' : brandAccent, fontSize: fs(11), flexShrink: 0 }}>
                                        ×{sp.count}
                                      </b>
                                    )}
                                  </span>
                                ))}
                                {hiddenWaves > 0 && (
                                  <span style={{ fontSize: fs(11), color: '#94a3b8', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                                    +{hiddenWaves}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!parsed.deckPool && nextTwoWaves.length === 0 && (
                  <span style={{ color: '#6b7888', fontFamily: 'var(--font-sans)', fontSize: fs(12) }}>
                    等待牌池与出怪预告同步 · 可随时切「漏兜」查 4 人数据，Boss 战自动切 MMO DPS 榜
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
