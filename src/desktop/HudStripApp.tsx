// 青逝痕 Tenkinoko 制作
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, PanelRightOpen, Skull, Unlock, X } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import {
  REPORT_SEATS,
  defaultBossRound,
  groupEnemyOutcomes,
  hasBossDamage,
  ownLeakKinds,
  ownRoundLeaks,
  readBattleReport,
  reportBossRounds,
  reportLeader,
  type BattleRound,
  type EnemyOutcome,
} from './battleReportData';
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

export type HudNormalPage = 'intel' | 'peers' | 'leak' | 'dps';
type HudTab = 'intel' | 'leak' | 'dps';
type HudDpsSub = 'team' | 'ops';

const HUD_PAGE_STORAGE_KEY = 'prts:hud-normal-page:v2';

interface HudOpRow {
  key: string;
  name: string;
  damage: number;
  dps: number | null;
  share: number;
}

interface SeatLeakCard {
  seat: number;
  label: string;
  isSelf: boolean;
  hp: number | undefined;
  shopLevel: number | null;
  elimRound: number | undefined;
  eliminated: boolean;
  leaked: number;
  assisted: number;
  covered: number;
  escaped: number;
}

interface BossTeamRow {
  rank: number;
  seat: number;
  label: string;
  isSelf: boolean;
  damage: number;
  dps: number | null;
  sharePct: number;
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

function collectRoundLeakedEnemies(row: BattleRound, report: ReturnType<typeof readBattleReport>): EnemyOutcome[] {
  const list: EnemyOutcome[] = [];
  for (const e of row.uncoveredEnemies) list.push({ id: e.id, name: e.name, count: e.count, unitPower: e.unitPower });
  for (const e of row.assistEnemies) list.push({ id: e.id, name: e.name, count: e.count, unitPower: e.unitPower });
  if (list.length === 0) {
    for (const e of ownLeakKinds(row, report)) list.push(e);
  }
  if (list.length === 0 && !row.bossGroups) {
    for (const w of row.rows) {
      for (const e of w.enemies) {
        if (e.id && e.leaked && e.leaked > 0) {
          list.push({ id: e.id, name: e.name, count: e.leaked, unitPower: e.power });
        }
      }
    }
  }
  return groupEnemyOutcomes(list);
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

  const bossTeamData = useMemo(() => {
    const seats = soloMode ? ([1] as const) : REPORT_SEATS;
    const dmgBySeat: Record<number, number> = {};
    if (bossRound) {
      for (const s of seats) {
        const direct = bossRound.bossDamage[s] ?? bossRound.bossUplink[s];
        if (direct !== undefined && direct > 0) {
          dmgBySeat[s] = direct;
        }
      }
      if (Object.keys(dmgBySeat).length === 0) {
        const hits = bossRound.bossOfficial.length ? bossRound.bossOfficial : bossRound.bossUplinkRows;
        for (const h of hits) {
          if (h.damage > 0) dmgBySeat[h.seat] = (dmgBySeat[h.seat] ?? 0) + h.damage;
        }
      }
    }
    const teamTotal = seats.reduce((sum, s) => sum + (dmgBySeat[s] ?? 0), 0);
    const ranked = [...seats].sort((a, b) => (dmgBySeat[b] ?? 0) - (dmgBySeat[a] ?? 0) || a - b);
    const rows: BossTeamRow[] = ranked.map((seat, idx) => {
      const damage = dmgBySeat[seat] ?? 0;
      const pctFallback = bossRound?.bossPercent[seat];
      const sharePct = teamTotal > 0 ? (damage * 100) / teamTotal : (pctFallback ?? 0);
      const dps = damage > 0 && bossElapsedSec && bossElapsedSec > 0 ? damage / bossElapsedSec : null;
      return {
        rank: idx + 1,
        seat,
        label: parsed ? seatDisplayText(seat, parsed) : `${seat}P`,
        isSelf: seat === selfSeat,
        damage,
        dps,
        sharePct,
      };
    });
    const teamDps = teamTotal > 0 && bossElapsedSec && bossElapsedSec > 0 ? teamTotal / bossElapsedSec : null;
    const bossHp = bossPool?.hp ?? bossRound?.bossHp ?? null;
    const bossMaxHp = bossPool?.maxHp ?? (bossHp !== null ? Math.max(bossHp + teamTotal, bossHp) : null);
    const hpPct = bossHp !== null && bossMaxHp && bossMaxHp > 0
      ? Math.max(0, Math.min(100, Math.round((bossHp * 100) / bossMaxHp)))
      : null;
    const bossEnemyId = bossPool?.enemyId || bossLeader?.id || '';
    const bossName = bossPool?.name || bossLeader?.name || '终局首领';
    return { rows, teamTotal, teamDps, bossHp, hpPct, bossEnemyId, bossName };
  }, [bossElapsedSec, bossLeader, bossPool, bossRound, parsed, selfSeat, soloMode]);

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
      if (matched.length > 0) return { trackedOps: matched.slice(0, 6), trackedSource: 'wishlist' };
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
      if (matched.length > 0) return { trackedOps: matched.slice(0, 6), trackedSource: 'comp' };
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
      if (boardMatched.length > 0) return { trackedOps: boardMatched.slice(0, 5), trackedSource: 'comp' };
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

  // 4. Intel Tab: Next/Current Wave Enemy Icons + Full All-Waves Schedule (R01-R15)
  const { waveSpawns, spawnRound, spawnIsNext, allWaveRounds } = useMemo(() => {
    type WaveItem = { id: string; name: string; count: number | null; boss?: true };
    if (!parsed || parsed.preview.length === 0) {
      return {
        waveSpawns: [] as WaveItem[],
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
    const chosenEnemies = allWaveRounds.find(w => w.round === chosenRound)?.enemies ?? [];
    return {
      waveSpawns: chosenEnemies.slice(0, 8),
      spawnRound: chosenRound,
      spawnIsNext: chosenRound > roundNo,
      allWaveRounds,
    };
  }, [activeRound?.phase, parsed, roundNo]);

  // 5. Leak/Assist Tab (漏兜): 4-player chart + leaked enemy real icons (Cumulative OR Single Round)
  const leakData = useMemo(() => {
    if (!parsed) {
      return { cards: [] as SeatLeakCard[], enemies: [] as EnemyOutcome[], totalLeaks: 0, totalAssisted: 0, totalEscaped: 0 };
    }
    const seats = soloMode ? ([1] as const) : REPORT_SEATS;
    const targetRounds = leakCumulative
      ? parsed.rounds
      : parsed.rounds.filter(r => r.number === leakSelectedRound);

    const leakedMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const assistedMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const coveredMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const escapedMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const rawEnemies: EnemyOutcome[] = [];

    for (const r of targetRounds) {
      for (const s of seats) {
        const l = (s === selfSeat ? ownRoundLeaks(r, parsed) : r.leaks[s]) ?? r.leakMinimums[s] ?? 0;
        const a = r.assists[s] ?? 0;
        const esc = r.uncoveredLeaks[s] ?? 0;
        const pairCovered = r.assistPairs.reduce((sum, pair) => sum + (pair.owner === s ? pair.count : 0), 0);
        const cov = pairCovered > 0 ? pairCovered : (r.uncoveredStatus ? Math.max(0, l - esc) : 0);
        const effLeak = Math.max(l, cov + esc);
        leakedMap[s] += effLeak;
        assistedMap[s] += a;
        coveredMap[s] += cov;
        escapedMap[s] += esc;
      }
      rawEnemies.push(...collectRoundLeakedEnemies(r, parsed));
    }

    const cards: SeatLeakCard[] = seats.map(seat => ({
      seat,
      label: seatDisplayText(seat, parsed),
      isSelf: seat === selfSeat,
      hp: parsed.hp[seat],
      shopLevel: parsed.lineups[seat]?.shopLevel ?? null,
      elimRound: parsed.eliminated[seat],
      eliminated: parsed.eliminated[seat] !== undefined,
      leaked: leakedMap[seat],
      assisted: assistedMap[seat],
      covered: coveredMap[seat],
      escaped: escapedMap[seat],
    }));

    return {
      cards,
      enemies: groupEnemyOutcomes(rawEnemies).slice(0, 6),
      totalLeaks: seats.reduce((sum, s) => sum + leakedMap[s], 0),
      totalAssisted: seats.reduce((sum, s) => sum + assistedMap[s], 0),
      totalEscaped: seats.reduce((sum, s) => sum + escapedMap[s], 0),
    };
  }, [leakCumulative, leakSelectedRound, parsed, selfSeat, soloMode]);

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

  // Unified color theme matching mobile v3.1 (Yellow = Intel, Cyan = Cumulative Leak, Orange = Single/Escaped Leak, Crimson = Boss DPS)
  const themeAccent = effectiveTab === 'dps'
    ? '#ff4d4f'
    : effectiveTab === 'leak'
      ? (!leakCumulative || leakData.totalEscaped > 0 ? '#ff7a00' : '#00e5ff')
      : '#ffe600';
  const shellBg = effectiveTab === 'dps'
    ? (state.locked ? 'rgba(24, 10, 13, 0.84)' : 'rgba(20, 10, 14, 0.96)')
    : effectiveTab === 'leak' && (!leakCumulative || leakData.totalEscaped > 0)
      ? (state.locked ? 'rgba(24, 15, 8, 0.84)' : 'rgba(22, 14, 9, 0.96)')
      : (state.locked ? 'rgba(11, 14, 20, 0.84)' : 'rgba(12, 16, 23, 0.96)');

  const maxOpDamage = Math.max(1, ...opRows.map(o => o.damage));
  const maxTeamDamage = Math.max(1, ...bossTeamData.rows.map(r => r.damage));
  const emptyAlertCount = parsed?.deckPool ? trackedOps.filter(o => o.remaining === 0).length : 0;
  const fullGuideText = PRODUCT_BRAND.mode === 'full' && state.guide.paceTip ? state.guide.paceTip : '';

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
          background: shellBg,
          border: `1px solid ${state.locked ? `${themeAccent}66` : `${themeAccent}88`}`,
          borderLeft: `3px solid ${themeAccent}`,
          borderRadius: '2px',
          color: '#f1f5f9',
          overflow: 'hidden',
        }}
      >
        {/* Top Compact Drag Header (25px) with Unified Mode Capsule [情报 | 漏兜 | DPS] */}
        <header
          style={{
            flex: 'none',
            height: '25px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '0 6px',
            borderBottom: '1px solid rgba(45, 54, 68, 0.78)',
            WebkitAppRegion: state.locked ? 'no-drag' : 'drag',
            fontSize: '11px',
          } as React.CSSProperties}
        >
          <span
            style={{
              padding: '0 5px',
              background: themeAccent,
              color: effectiveTab === 'dps' ? '#ffffff' : '#0b0d11',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              fontSize: '10px',
              borderRadius: '2px',
              flexShrink: 0,
            }}
          >
            {badgeLabel}
          </span>

          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#cbd5e1', fontSize: '10.5px', fontWeight: 600 }}>
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
                ['intel', '情报', '#ffe600', '#0b0d11'],
                ...(!soloMode ? [['leak', currentRoundLeakCount > 0 ? `漏兜·${currentRoundLeakCount}` : '漏兜', currentRoundLeakCount > 0 ? '#ff7a00' : '#00e5ff', '#0b0d11'] as const] : []),
                ...(isBossContext ? [['dps', 'DPS', '#ff4d4f', '#ffffff'] as const] : []),
              ] as ReadonlyArray<readonly [HudTab, string, string, string]>).map(([id, label, activeBg, activeFg]) => {
                const active = effectiveTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectTab(id)}
                    style={{
                      padding: '1px 5px',
                      fontSize: '9.5px',
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
            <span style={{ color: themeAccent, fontSize: '9.5px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              穿透 · {state.shortcut}
            </span>
          ) : (
            <div style={{ display: 'inline-flex', gap: '3px', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {(state.clientSource === 'mumu' || state.drawerCollapsed) && (
                <button
                  type="button"
                  onClick={() => void hudApi?.expandDrawer?.()}
                  title="展开右侧 MuMu 战术抽屉"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '1px 4px',
                    fontSize: '9.5px',
                    color: '#00e5ff',
                    border: '1px solid rgba(0,229,255,0.45)',
                    background: 'rgba(0,229,255,0.12)',
                    borderRadius: '2px',
                    cursor: 'pointer',
                  }}
                >
                  <PanelRightOpen size={9.5} />抽屉
                </button>
              )}
              <button
                type="button"
                onClick={() => void hudApi?.setLocked(true)}
                title={`锁定鼠标穿透（${state.shortcut} 随时解锁）`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '1px 4px',
                  fontSize: '9.5px',
                  color: '#ffe600',
                  border: '1px solid rgba(255,230,0,0.45)',
                  background: 'rgba(255,230,0,0.1)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <Lock size={9.5} />穿透
              </button>
              <button
                type="button"
                onClick={() => void hudApi?.setOpen(false)}
                title="关闭悬浮条"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 3px',
                  color: '#94a3b8',
                  border: '1px solid #2d3644',
                  background: '#161c26',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <X size={10} />
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
          }}
        >
          {!parsed ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', color: '#94a3b8', fontSize: '11px', gap: '5px' }}>
              <Unlock size={11} />
              等待对局实时信号 · 自动同步牌池、出怪图标、4 人漏兜与 Boss DPS
            </div>
          ) : effectiveTab === 'dps' ? (
            /* ===== TAB 3: Boss MMO Damage Meter & Live DPS ([4人榜 | 干员DPS]) ===== */
            <div style={{ flex: '1 0 auto', padding: '4px 7px 5px', display: 'flex', flexDirection: 'column', gap: '3.5px' }}>
              {/* Boss HP Bar + [4人榜 | 干员DPS] Switch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minHeight: '20px' }}>
                {bossTeamData.bossEnemyId && <EnemyAvatar id={bossTeamData.bossEnemyId} size={18} />}
                <div
                  style={{
                    flex: 1,
                    position: 'relative',
                    height: '18px',
                    background: '#1d0b10',
                    border: '1px solid rgba(255, 77, 79, 0.55)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 6px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9.5px',
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
                  <span style={{ position: 'relative', color: '#ffffff', fontWeight: 700 }}>
                    {bossTeamData.hpPct !== null
                      ? `BOSS HP ${bossTeamData.hpPct}% · 余 ${formatTelemetryTotal(bossTeamData.bossHp ?? 0)}`
                      : bossTeamData.bossHp !== null
                        ? `BOSS 余 ${formatTelemetryTotal(bossTeamData.bossHp)}`
                        : 'BOSS 伤害统计'}
                  </span>
                  <span style={{ position: 'relative', color: '#fef08a', fontWeight: 700 }}>
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
                          padding: '1px 4px',
                          fontSize: '9px',
                          fontWeight: 700,
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

              {/* MMO Horizontal Ranking Bars */}
              {effectiveDpsSub === 'team' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {(() => {
                    let peerIdx = 0;
                    return bossTeamData.rows.map(row => {
                      const pct = row.damage > 0 ? Math.max(4, (row.damage / maxTeamDamage) * 100) : 0;
                      const barBg = row.isSelf
                        ? 'linear-gradient(90deg, rgba(138, 115, 8, 0.88), rgba(212, 177, 6, 0.78))'
                        : peerBarPalettes[Math.min(peerIdx++, peerBarPalettes.length - 1)];
                      return (
                        <div
                          key={row.seat}
                          style={{
                            position: 'relative',
                            height: '22px',
                            background: '#11161f',
                            border: `1px solid ${row.isSelf ? 'rgba(255, 230, 0, 0.62)' : '#232d3d'}`,
                            borderRadius: '2px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px',
                            gap: '5px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {pct > 0 && (
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: barBg }} />
                          )}
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 800, color: row.rank === 1 ? '#ffe600' : row.isSelf ? '#fef08a' : '#94a3b8', minWidth: '18px' }}>
                            #{row.rank}
                          </span>
                          {row.isSelf && (
                            <small style={{ position: 'relative', padding: '0 3px', fontSize: '8.5px', fontWeight: 800, background: '#ffe600', color: '#0b0d11', borderRadius: '1px' }}>
                              我
                            </small>
                          )}
                          <strong style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10.5px', color: '#ffffff' }}>
                            {row.label}
                          </strong>
                          <b style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: '#ffffff', minWidth: '42px', textAlign: 'right' }}>
                            {row.damage > 0 ? formatTelemetryTotal(row.damage) : '—'}
                          </b>
                          {row.dps !== null && (
                            <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: row.isSelf ? '#fef08a' : '#bae6fd', minWidth: '52px', textAlign: 'right' }}>
                              {formatTelemetryRate(row.dps)}
                            </span>
                          )}
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: '#e2e8f0', minWidth: '36px', textAlign: 'right' }}>
                            {row.sharePct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {opRows.map((op, i) => {
                    const pct = Math.max(4, (op.damage / maxOpDamage) * 100);
                    const barBg = i === 0
                      ? 'linear-gradient(90deg, rgba(138, 115, 8, 0.88), rgba(212, 177, 6, 0.78))'
                      : peerBarPalettes[Math.min(i - 1, peerBarPalettes.length - 1)];
                    return (
                      <div
                        key={op.key}
                        style={{
                          position: 'relative',
                          height: '22px',
                          background: '#11161f',
                          border: `1px solid ${i === 0 ? 'rgba(255, 230, 0, 0.58)' : '#232d3d'}`,
                          borderRadius: '2px',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 6px',
                          gap: '5px',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: barBg }} />
                        <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 800, color: i === 0 ? '#ffe600' : '#94a3b8', minWidth: '16px' }}>
                          #{i + 1}
                        </span>
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                          <CompactOperatorBadge name={op.name} size={16} />
                        </span>
                        <strong style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10.5px', color: '#ffffff' }}>
                          {op.name}
                        </strong>
                        <b style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: '#ffffff', minWidth: '42px', textAlign: 'right' }}>
                          {formatTelemetryTotal(op.damage)}
                        </b>
                        <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: i === 0 ? '#fef08a' : '#bae6fd', minWidth: '52px', textAlign: 'right' }}>
                          {op.dps !== null ? formatTelemetryRate(op.dps) : `${(op.share * 100).toFixed(1)}%`}
                        </span>
                        {op.dps !== null && (
                          <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 700, color: '#e2e8f0', minWidth: '34px', textAlign: 'right' }}>
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
            /* ===== TAB 2: 漏兜 4 人可视化柱图 + [累计 | 单回合] + 漏怪实机图标 ===== */
            <div style={{ flex: '1 0 auto', padding: '4px 7px 5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {/* Sub-bar: [累计 | 单回合] + ◀ R08 ▶ + Summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minHeight: '20px' }}>
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
                      padding: '1px 5px',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: '1px',
                      cursor: state.locked ? 'default' : 'pointer',
                      background: leakCumulative ? '#00e5ff' : 'transparent',
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
                      padding: '1px 5px',
                      fontSize: '9.5px',
                      fontWeight: 700,
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
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    <button
                      type="button"
                      onClick={() => stepLeakRound(-1)}
                      title="上一回合"
                      style={{ display: 'inline-grid', placeItems: 'center', width: '18px', height: '18px', padding: 0, background: '#161c26', border: '1px solid #2a3444', color: '#ffe600', borderRadius: '2px', cursor: 'pointer' }}
                    >
                      <ChevronLeft size={11} />
                    </button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: '#e2e8f0', minWidth: '34px', textAlign: 'center' }}>
                      {leakCumulative ? `R1-${roundNo}` : `R${String(leakSelectedRound).padStart(2, '0')}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepLeakRound(1)}
                      title="下一回合"
                      style={{ display: 'inline-grid', placeItems: 'center', width: '18px', height: '18px', padding: 0, background: '#161c26', border: '1px solid #2a3444', color: '#ffe600', borderRadius: '2px', cursor: 'pointer' }}
                    >
                      <ChevronRight size={11} />
                    </button>
                  </div>
                )}

                <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '9.5px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  <span
                    style={{
                      padding: '1px 5px',
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
                      padding: '1px 5px',
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
                      padding: '1px 5px',
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

              {/* 4-Column Equal-Width Player Dual-Track Bar Cards (兜 vs 漏) */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, leakData.cards.length)}, minmax(0, 1fr))`, gap: '4px' }}>
                {(() => {
                  const maxMetric = Math.max(1, ...leakData.cards.map(c => Math.max(c.leaked, c.assisted)));
                  return leakData.cards.map(card => {
                    const assistPct = (card.assisted / maxMetric) * 100;
                    const coveredPct = (card.covered / maxMetric) * 100;
                    const escapedPct = (card.escaped / maxMetric) * 100;
                    return (
                      <div
                        key={card.seat}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3.5px',
                          padding: '4px 5px',
                          background: card.eliminated
                            ? 'rgba(18, 22, 30, 0.55)'
                            : card.isSelf
                              ? 'rgba(255, 230, 0, 0.09)'
                              : card.escaped > 0
                                ? 'rgba(255, 77, 79, 0.11)'
                                : '#131a24',
                          border: `1px solid ${card.isSelf ? 'rgba(255, 230, 0, 0.52)' : card.escaped > 0 ? 'rgba(255, 77, 79, 0.5)' : '#263142'}`,
                          borderRadius: '2px',
                          opacity: card.eliminated ? 0.58 : 1,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
                          {card.isSelf && (
                            <small style={{ padding: '0 2.5px', fontSize: '8px', fontWeight: 800, background: '#ffe600', color: '#0b0d11', borderRadius: '1px', flexShrink: 0 }}>
                              我
                            </small>
                          )}
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', fontWeight: card.isSelf ? 700 : 600, color: card.isSelf ? '#fff8b0' : '#e2e8f0' }}>
                            {card.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
                          {card.eliminated ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#f87171', fontWeight: 700 }}>
                              <Skull size={9} />R{card.elimRound}出局
                            </span>
                          ) : (
                            <>
                              <b style={{ color: (card.hp ?? 99) <= 5 ? '#ff7875' : (card.hp ?? 0) >= 15 ? '#34d399' : '#cbd5e1' }}>
                                ♥{card.hp ?? '—'}
                              </b>
                              <span style={{ color: '#38bdf8', fontWeight: 700 }}>{card.shopLevel ? `${card.shopLevel}本` : '—'}</span>
                            </>
                          )}
                        </div>

                        {/* Track 1: 兜 (Assist Kills) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '8.5px', fontWeight: 700 }}>
                          <span style={{ color: card.assisted > 0 ? '#00e5ff' : '#64748b', flexShrink: 0 }}>兜</span>
                          <div style={{ flex: 1, height: '5px', background: '#0b0f16', border: '1px solid #1f2a3a', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                            {assistPct > 0 && <span style={{ width: `${assistPct}%`, background: '#00e5ff' }} />}
                          </div>
                          <span style={{ color: card.assisted > 0 ? '#67e8f9' : '#475569', flexShrink: 0, minWidth: '14px', textAlign: 'right' }}>
                            {card.assisted > 0 ? `+${card.assisted}` : '0'}
                          </span>
                        </div>

                        {/* Track 2: 漏 (Covered Amber + Escaped Red) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '8.5px', fontWeight: 700 }}>
                          <span style={{ color: card.escaped > 0 ? '#ff6b6b' : card.leaked > 0 ? '#fbbf24' : '#64748b', flexShrink: 0 }}>漏</span>
                          <div style={{ flex: 1, height: '5px', background: '#0b0f16', border: '1px solid #1f2a3a', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
                            {coveredPct > 0 && <span style={{ width: `${coveredPct}%`, background: '#fb923c' }} />}
                            {escapedPct > 0 && <span style={{ width: `${escapedPct}%`, background: '#ff4d4f' }} />}
                          </div>
                          <span style={{ flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {card.leaked === 0 ? (
                              <span style={{ color: '#475569' }}>0</span>
                            ) : card.escaped === 0 ? (
                              <span style={{ color: '#fbbf24' }}>{card.leaked}</span>
                            ) : (
                              <>
                                <span style={{ color: '#fbbf24' }}>{card.leaked}</span>
                                <span style={{ color: '#ff6b6b', marginLeft: '2px' }}>逃{card.escaped}</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Bottom Leaked Enemy Icons + Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2.5px 5px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px', minHeight: '22px' }}>
                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#fb923c', flexShrink: 0 }}>
                  {leakCumulative ? '累计高漏' : `R${String(leakSelectedRound).padStart(2, '0')} 漏怪`}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                  {leakData.enemies.length > 0 ? (
                    leakData.enemies.slice(0, 4).map(e => (
                      <span
                        key={e.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '1px 4px 1px 2px',
                          background: '#221215',
                          border: '1px solid rgba(255, 77, 79, 0.45)',
                          borderRadius: '2px',
                          fontSize: '9.5px',
                          color: '#e2e8f0',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <EnemyAvatar id={e.id} size={14} />
                        <span>{e.name.length > 5 ? e.name.slice(0, 5) : e.name}</span>
                        <b style={{ fontFamily: 'var(--font-mono)', color: '#fca5a5', fontSize: '9px' }}>×{e.count}</b>
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#6b7888', fontSize: '9.5px' }}>本段零漏怪记录</span>
                  )}
                </div>
                <span style={{ flexShrink: 0, fontSize: '8.5px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  <b style={{ color: '#00e5ff' }}>■</b>帮兜 <b style={{ color: '#fb923c' }}>■</b>已兜 <b style={{ color: '#ff4d4f' }}>■</b>逃逸
                </span>
              </div>
            </div>
          ) : (
            /* ===== TAB 1: 情报（PC 独有牌池余量概率 + 下波出怪实机图标 + Full 节奏提示）===== */
            <>
              {fullGuideText && (
                <div
                  style={{
                    flex: 'none',
                    padding: '3.5px 7px',
                    borderBottom: '1px solid rgba(45, 54, 68, 0.55)',
                    background: 'rgba(255, 230, 0, 0.05)',
                    fontSize: '10.5px',
                    lineHeight: 1.35,
                    color: '#e2e8f0',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                  }}
                >
                  {fullGuideText}
                </div>
              )}

              <div style={{ flex: '1 0 auto', padding: '4.5px 7px 5px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {parsed.deckPool && trackedOps.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', color: '#7d8a9c' }}>
                      <span style={{ color: PRTS_CHART.blue, fontWeight: 700 }}>
                        {trackedSource === 'wishlist'
                          ? `// 心仪牌池 · ${liveShopLevel}本`
                          : trackedSource === 'comp'
                            ? `// 核心牌池 · ${liveShopLevel}本`
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
                            <CompactOperatorBadge name={op.name} size={15} />
                            <span style={{ color: isEmpty ? '#f5b4b0' : '#e4eaf3', fontSize: '10px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                              {op.name}
                            </span>
                            {inSelfShop ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
                                <b style={{ color: PRTS_CHART.ochreBright }}>在售</b>
                                <small style={{ color: '#8f9db0' }}>剩{op.remaining}</small>
                              </span>
                            ) : isEmpty ? (
                              <span style={{ flexShrink: 0, color: '#f08680', fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700 }}>
                                池空 0/{op.totalCopies}
                              </span>
                            ) : isLocked ? (
                              <span style={{ flexShrink: 0, color: '#7c8a9c', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
                                {odds.tripleDiscoverProb !== null
                                  ? `三连${fmtHudPct(odds.tripleDiscoverProb)}`
                                  : `${op.tier}本 剩${op.remaining}`}
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3.5px', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
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
                      <span style={{ color: '#00e5ff', fontWeight: 700 }}>
                        {showAllWaves ? `// 全波次出怪总览 · ${allWaveRounds.length} 波` : `// R${spawnRound} ${spawnIsNext ? '下波出怪' : '本波出怪'}`}
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#6b7888' }}>
                          {showAllWaves ? `当前 R${roundNo}` : `${waveSpawns.length} 怪种`}
                        </span>
                        {allWaveRounds.length > 1 && !state.locked && (
                          <button
                            type="button"
                            onClick={() => setShowAllWaves(v => !v)}
                            style={{
                              padding: '0 5px',
                              fontSize: '9px',
                              fontWeight: 700,
                              borderRadius: '2px',
                              cursor: 'pointer',
                              border: '1px solid rgba(0, 229, 255, 0.55)',
                              background: showAllWaves ? '#00e5ff' : 'rgba(0, 229, 255, 0.12)',
                              color: showAllWaves ? '#0b0d11' : '#00e5ff',
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
                                gap: '4px',
                                padding: '2px 4px',
                                background: isCur ? 'rgba(255,230,0,0.08)' : isNext ? 'rgba(0,229,255,0.08)' : isBossWave ? 'rgba(255,77,79,0.1)' : '#101620',
                                borderLeft: `2px solid ${isBossWave ? '#ff4d4f' : isCur ? '#ffe600' : isNext ? '#00e5ff' : '#2a3547'}`,
                                opacity: isPast ? 0.55 : 1,
                              }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  minWidth: '28px',
                                  textAlign: 'center',
                                  padding: '1px 3px',
                                  borderRadius: '2px',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '9px',
                                  fontWeight: 800,
                                  background: isBossWave ? '#ff4d4f' : isCur ? '#ffe600' : isNext ? '#00e5ff' : '#1e293b',
                                  color: (isCur || isNext) && !isBossWave ? '#0b0d11' : '#ffffff',
                                }}
                              >
                                R{String(w.round).padStart(2, '0')}
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', flex: 1, minWidth: 0 }}>
                                {w.enemies.map(sp => (
                                  <span
                                    key={`${w.round}-${sp.id}-${sp.name}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '1px 4px 1px 2px',
                                      background: '#131822',
                                      border: `1px solid ${sp.boss ? 'rgba(255,77,79,0.55)' : '#242e3e'}`,
                                      borderRadius: '2px',
                                      fontSize: '9px',
                                      color: '#e2e8f0',
                                    }}
                                  >
                                    <EnemyAvatar id={sp.id} size={14} />
                                    <span>{sp.name}</span>
                                    {sp.count !== null && (
                                      <b style={{ fontFamily: 'var(--font-mono)', color: sp.boss ? '#fca5a5' : '#ffe600', fontSize: '8.5px' }}>
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
                              border: `1px solid ${sp.boss ? 'rgba(255,230,0,0.55)' : '#242e3e'}`,
                              borderRadius: '2px',
                              fontSize: '9.5px',
                              color: '#e2e8f0',
                            }}
                          >
                            <EnemyAvatar id={sp.id} size={15} />
                            <span>{sp.name}</span>
                            {sp.count !== null && (
                              <b style={{ fontFamily: 'var(--font-mono)', color: '#ffe600', fontSize: '9px' }}>
                                ×{sp.count}
                              </b>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!parsed.deckPool && waveSpawns.length === 0 && (
                  <span style={{ color: '#6b7888', fontSize: '10.5px' }}>
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
