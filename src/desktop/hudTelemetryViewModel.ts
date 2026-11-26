// 青逝痕 Tenkinoko 制作
import {
  REPORT_SEATS,
  groupEnemyOutcomes,
  ownLeakKinds,
  roundMetrics,
  type BattleReport,
  type BattleRound,
  type EnemyOutcome,
} from './battleReportData';
import type { LaneMetric } from './battleRoundOutcome';
import type { HudScale } from './battleReports';
import type { EnemyPoolTelemetry } from './combatTelemetry';
import { visibleSeatCovenants, type SeatCovenantStatus } from './covenantBonds';

type LaneQuality = NonNullable<LaneMetric>['quality'];

export const HUD_SCALE_SPECS: Record<HudScale, { label: string; width: number; height: number; ratio: number }> = {
  sm: { label: '小', width: 500, height: 248, ratio: 0.92 },
  md: { label: '中', width: 580, height: 280, ratio: 1.0 },
  lg: { label: '大', width: 660, height: 316, ratio: 1.12 },
};

export interface SeatLeakCard {
  seat: number;
  label: string;
  isSelf: boolean;
  hp: number | undefined;
  shopLevel: number | null;
  elimRound: number | undefined;
  eliminated: boolean;
  leaked: number;
  leakQuality?: LaneQuality;
  assisted: number;
  covered: number;
  escaped: number;
  bonds: { shown: SeatCovenantStatus[]; hiddenCount: number; all: SeatCovenantStatus[] };
}

export interface BossTeamRow {
  rank: number;
  seat: number;
  label: string;
  isSelf: boolean;
  damage: number;
  dps: number | null;
  sharePct: number;
}

function seatLabel(seat: number, report?: BattleReport | null): string {
  const id = report?.names[seat]?.trim();
  return id || `${seat}号`;
}

export function collectRoundLeakedEnemies(row: BattleRound, report: BattleReport): EnemyOutcome[] {
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

/**
 * 合并四席 Boss 实时总伤、官方干员榜与百分比反推估算，避免局部字段先行到达时把第 3/4 席屏蔽。
 */
export function buildHudBossTeamData({
  parsed,
  bossRound,
  bossPool,
  bossLeader,
  bossElapsedSec,
  soloMode,
  selfSeat,
}: {
  parsed: BattleReport | null;
  bossRound: BattleRound | undefined;
  bossPool: EnemyPoolTelemetry['boss'];
  bossLeader: { id: string; name: string } | null;
  bossElapsedSec: number | null;
  soloMode: boolean;
  selfSeat: number | null;
}) {
  const seats = soloMode ? ([1] as const) : REPORT_SEATS;
  const dmgBySeat: Record<number, number> = {};
  if (bossRound) {
    const officialSum: Record<number, number> = {};
    for (const h of bossRound.bossOfficial) {
      if (h.damage > 0) officialSum[h.seat] = (officialSum[h.seat] ?? 0) + h.damage;
    }
    const uplinkSum: Record<number, number> = {};
    for (const h of bossRound.bossUplinkRows) {
      if (h.damage > 0) uplinkSum[h.seat] = (uplinkSum[h.seat] ?? 0) + h.damage;
    }
    for (const s of seats) {
      const direct = Math.max(bossRound.bossDamage[s] ?? 0, bossRound.bossUplink[s] ?? 0);
      const merged = Math.max(direct, officialSum[s] ?? 0, uplinkSum[s] ?? 0);
      if (merged > 0) {
        dmgBySeat[s] = merged;
      }
    }
    const knownTotal = seats.reduce((sum, s) => sum + (dmgBySeat[s] ?? 0), 0);
    const bossHpRaw = bossPool?.hp ?? bossRound.bossHp ?? null;
    let estMaxHp = bossPool?.maxHp && bossPool.maxHp > 0 ? bossPool.maxHp : null;
    if (!estMaxHp) {
      for (const s of seats) {
        const d = dmgBySeat[s] ?? 0;
        const pct = bossRound.bossPercent[s] ?? 0;
        if (d > 0 && pct > 0) {
          estMaxHp = Math.round((d * 100) / pct);
          break;
        }
      }
    }
    if (!estMaxHp && bossHpRaw !== null) {
      estMaxHp = bossHpRaw + knownTotal;
    }
    if (estMaxHp && estMaxHp > 0) {
      for (const s of seats) {
        if ((dmgBySeat[s] ?? 0) <= 0) {
          const pct = bossRound.bossPercent[s] ?? 0;
          if (pct > 0) {
            const est = Math.round((estMaxHp * pct) / 100);
            if (est > 0) dmgBySeat[s] = est;
          }
        }
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
      label: parsed ? seatLabel(seat, parsed) : `${seat}P`,
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
}

/**
 * 与主站四席条严格同源：使用 roundMetrics 读取漏兜与 skippedCosts 估算，全员漏怪且未进协防时计为未兜住逃逸。
 */
export function buildHudLeakData({
  parsed,
  leakCumulative,
  leakSelectedRound,
  soloMode,
  selfSeat,
}: {
  parsed: BattleReport | null;
  leakCumulative: boolean;
  leakSelectedRound: number;
  soloMode: boolean;
  selfSeat: number | null;
}) {
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
  const qualitiesMap: Record<number, LaneQuality[]> = { 1: [], 2: [], 3: [], 4: [] };
  const rawEnemies: EnemyOutcome[] = [];

  for (const r of targetRounds) {
    for (const s of seats) {
      const elim = parsed.eliminated[s];
      if (elim !== undefined && r.number > elim) continue;
      const [lk, as] = roundMetrics(r, s, parsed.self);
      const l = lk?.value ?? 0;
      const a = as?.value ?? 0;
      if (lk?.quality) qualitiesMap[s].push(lk.quality);
      const pairCovered = r.assistPairs.reduce((sum, pair) => sum + (pair.owner === s ? pair.count : 0), 0);
      const rawEsc = r.uncoveredLeaks[s];
      const effLeak = Math.max(l, pairCovered + (rawEsc ?? 0));
      const esc = r.allPlayersLeaked && rawEsc === undefined
        ? effLeak
        : Math.min(effLeak, rawEsc ?? 0);
      const cov = r.allPlayersLeaked && rawEsc === undefined
        ? 0
        : (pairCovered > 0 ? pairCovered : (r.uncoveredStatus ? Math.max(0, effLeak - esc) : 0));
      leakedMap[s] += effLeak;
      assistedMap[s] += a;
      coveredMap[s] += cov;
      escapedMap[s] += esc;
    }
    rawEnemies.push(...collectRoundLeakedEnemies(r, parsed));
  }

  const cards: SeatLeakCard[] = seats.map(seat => {
    const qs = qualitiesMap[seat];
    const leakQuality: LaneQuality = qs.includes('estimated')
      ? 'estimated'
      : qs.includes('minimum')
        ? 'minimum'
        : qs.includes('partial')
          ? 'partial'
          : undefined;
    return {
      seat,
      label: seatLabel(seat, parsed),
      isSelf: seat === selfSeat,
      hp: parsed.hp[seat],
      shopLevel: parsed.lineups[seat]?.shopLevel ?? null,
      elimRound: parsed.eliminated[seat],
      eliminated: parsed.eliminated[seat] !== undefined,
      leaked: leakedMap[seat],
      leakQuality,
      assisted: assistedMap[seat],
      covered: coveredMap[seat],
      escaped: escapedMap[seat],
      bonds: visibleSeatCovenants(parsed.lineups[seat], parsed.deckPool, 3),
    };
  });

  return {
    cards,
    enemies: groupEnemyOutcomes(rawEnemies).slice(0, 6),
    totalLeaks: seats.reduce((sum, s) => sum + leakedMap[s], 0),
    totalAssisted: seats.reduce((sum, s) => sum + assistedMap[s], 0),
    totalEscaped: seats.reduce((sum, s) => sum + escapedMap[s], 0),
  };
}
