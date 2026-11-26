// 青逝痕 Tenkinoko 制作
import operatorReference from '../data/operatorReference.json';
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES } from '../data/strongholdData';
import type { DeckPoolSnapshot, SeatLineup } from './combatTelemetry';

const OPERATOR_QUOTE_RE = /["'“”‘’]/g;

export function normalizeOperatorName(name?: string | null): string {
  return name ? name.replace(OPERATOR_QUOTE_RE, '').trim() : '';
}

const REF_COVENANTS_BY_NAME: ReadonlyMap<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  const mode = (operatorReference as { mode?: Record<string, { covenants?: unknown }> })?.mode;
  if (!mode) return map;
  for (const [rawName, entry] of Object.entries(mode)) {
    const covs = Array.isArray(entry?.covenants)
      ? entry.covenants.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];
    if (covs.length === 0) continue;
    const norm = normalizeOperatorName(rawName);
    if (norm) map.set(norm, covs);
  }
  return map;
})();

// 明日方舟《卫戍协议》V3_1（act3autochess）官方 bondInfoDict 全量 26 项盟约 ID 映射
export const BOND_ID_TO_COVENANT: Readonly<Record<string, string>> = {
  // 核心盟约（10）
  yanShip: '炎',
  sargonShip: '萨尔贡',
  egirShip: '阿戈尔',
  siracusaShip: '叙拉古',
  kazimierzShip: '卡西米尔',
  victoriaShip: '维多利亚',
  kjeragShip: '谢拉格',
  ursusShip: '乌萨斯',
  iberiaShip: '伊比利亚',
  lethaniaShip: '莱塔尼亚',
  // 附加盟约（16）
  preciShip: '精准',
  visiShip: '远见',
  investShip: '投资人',
  raidShip: '突袭',
  indomShip: '不屈',
  maniShip: '调和',
  emptyShip: '协防干员',
  soloShip: '独行',
  suntShip: '绝技',
  docShip: '聚合',
  arcaneShip: '奥术',
  swiftShip: '迅捷',
  skillfulShip: '灵巧',
  steadShip: '坚守',
  deputShip: '助力',
  miraShip: '奇迹',
};

// 各盟约最低触发阈值（与安卓端 StrongholdEnemyCatalog.COVENANT_THRESHOLDS 严格对齐）
export const COVENANT_THRESHOLDS: Readonly<Record<string, number>> = {
  独行: 1,
  炎: 2,
  萨尔贡: 3,
  阿戈尔: 3,
  叙拉古: 3,
  卡西米尔: 3,
  维多利亚: 3,
  谢拉格: 3,
  乌萨斯: 3,
  伊比利亚: 3,
  莱塔尼亚: 3,
};

const SHORT_COVENANT_LABELS: Readonly<Record<string, string>> = {
  萨尔贡: '萨尔',
  阿戈尔: '阿戈',
  叙拉古: '叙拉',
  卡西米尔: '卡西',
  维多利亚: '维多',
  谢拉格: '谢拉',
  乌萨斯: '乌萨',
  伊比利亚: '伊比',
  莱塔尼亚: '莱塔',
  投资人: '投资',
  协防干员: '协防',
};

export type CovenantTierTone = 'normal' | 'high' | 'max';

export interface SeatCovenantStatus {
  name: string;
  shortName: string;
  count: number;
  threshold: number;
  active: boolean;
  tierTone?: CovenantTierTone;
}

export function covenantTierTone(count: number): CovenantTierTone {
  if (count >= 500) return 'max';
  if (count >= 100) return 'high';
  return 'normal';
}

const BOND_ID_ALIASES: Readonly<Record<string, string>> = {
  aegirShip: '阿戈尔',
  leithanienShip: '莱塔尼亚',
};

const VALID_COVENANTS = new Set<string>([...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES]);

export function mapBondIdToCovenant(raw: string): string {
  if (!raw) return '';
  if (Object.hasOwn(BOND_ID_TO_COVENANT, raw)) return BOND_ID_TO_COVENANT[raw];
  if (Object.hasOwn(BOND_ID_ALIASES, raw)) return BOND_ID_ALIASES[raw];
  return VALID_COVENANTS.has(raw) ? raw : '';
}

export function mapBannedBondsToCovenants(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const mapped = mapBondIdToCovenant(item);
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      result.push(mapped);
    }
  }
  return result;
}

export function covenantThreshold(name: string): number {
  return COVENANT_THRESHOLDS[name] ?? 2;
}

export function shortCovenantName(name: string): string {
  return SHORT_COVENANT_LABELS[name] ?? (name.length > 2 ? name.slice(0, 2) : name);
}

function sortSeatCovenants(list: SeatCovenantStatus[]): SeatCovenantStatus[] {
  return list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function clampBondStacks(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(999, Math.max(0, Math.trunc(raw)));
}

/**
 * 计算指定席位当前场上已部署干员 + 转职装备提供的实时盟约人数与激活态。
 * 若服务端已提供 activeBonds（层数最高 999），优先使用；否则回退至在场不重复干员 + 转职装备估算。
 */
export function computeSeatCovenants(
  lineup: SeatLineup | undefined,
  deckPool?: DeckPoolSnapshot | null,
): SeatCovenantStatus[] {
  if (!lineup) return [];

  if (lineup.activeBonds && lineup.activeBonds.length > 0) {
    const byName = new Map<string, { count: number; active: boolean }>();
    for (const item of lineup.activeBonds) {
      const name = mapBondIdToCovenant(item.bondId);
      if (!name) continue;
      const count = clampBondStacks(item.stacks);
      if (count <= 0) continue;
      const prev = byName.get(name);
      if (!prev) {
        byName.set(name, { count, active: Boolean(item.active) });
      } else {
        byName.set(name, {
          count: clampBondStacks(Math.max(prev.count, count)),
          active: prev.active || Boolean(item.active),
        });
      }
    }
    const directList: SeatCovenantStatus[] = [];
    for (const [name, entry] of byName.entries()) {
      directList.push({
        name,
        shortName: shortCovenantName(name),
        count: entry.count,
        threshold: covenantThreshold(name),
        active: entry.active,
        tierTone: covenantTierTone(entry.count),
      });
    }
    return sortSeatCovenants(directList);
  }

  const counts = new Map<string, number>();

  // 1. 预建干员盟约索引（优先开局 squad，回退 deckPool.operators）
  const byChess = new Map<string, string[]>();
  const byChar = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const s of lineup.squad) {
    if (s.covenants.length > 0) {
      const norm = normalizeOperatorName(s.name);
      if (s.chessId) byChess.set(s.chessId, s.covenants);
      if (s.charId) byChar.set(s.charId, s.covenants);
      if (norm) byName.set(norm, s.covenants);
    }
  }
  if (deckPool) {
    for (const op of deckPool.operators) {
      if (op.covenants.length > 0) {
        const norm = normalizeOperatorName(op.name);
        if (op.charId && !byChar.has(op.charId)) byChar.set(op.charId, op.covenants);
        if (norm && !byName.has(norm)) byName.set(norm, op.covenants);
      }
    }
  }

  // 2. 场上不重复干员计数
  const seenUnits = new Set<string>();
  for (const unit of lineup.deployed) {
    const normName = normalizeOperatorName(unit.name);
    const dedupKey = unit.charId || unit.chessId || normName || unit.name;
    if (!dedupKey || seenUnits.has(dedupKey)) continue;
    seenUnits.add(dedupKey);
    const covs = (unit.chessId ? byChess.get(unit.chessId) : undefined)
      ?? (unit.charId ? byChar.get(unit.charId) : undefined)
      ?? (normName ? byName.get(normName) : undefined)
      ?? (normName ? REF_COVENANTS_BY_NAME.get(normName) : undefined);
    if (!covs) continue;
    for (const cov of covs) {
      if (!VALID_COVENANTS.has(cov)) continue;
      counts.set(cov, (counts.get(cov) ?? 0) + 1);
    }
  }

  // 3. 转职装备 giveBondId 加成（+1）
  if (lineup.equips.length > 0 && deckPool && deckPool.equips.length > 0) {
    const equipBondByTrap = new Map<string, string>();
    const equipBondByChess = new Map<string, string>();
    const equipBondByName = new Map<string, string>();
    for (const eq of deckPool.equips) {
      const cov = mapBondIdToCovenant(eq.giveBondId);
      if (!cov) continue;
      if (eq.trapId) equipBondByTrap.set(eq.trapId, cov);
      if (eq.chessId) equipBondByChess.set(eq.chessId, cov);
      if (eq.name) equipBondByName.set(eq.name, cov);
    }
    for (const held of lineup.equips) {
      const cov = (held.trapId ? equipBondByTrap.get(held.trapId) : undefined)
        ?? (held.chessId ? equipBondByChess.get(held.chessId) : undefined)
        ?? (held.name ? equipBondByName.get(held.name) : undefined);
      if (cov) counts.set(cov, (counts.get(cov) ?? 0) + 1);
    }
  }

  const list: SeatCovenantStatus[] = [];
  for (const [name, rawCount] of counts.entries()) {
    const count = clampBondStacks(rawCount);
    if (count <= 0) continue;
    const threshold = covenantThreshold(name);
    const active = name === '独行' ? count === 1 : count >= threshold;
    list.push({
      name,
      shortName: shortCovenantName(name),
      count,
      threshold,
      active,
      tierTone: covenantTierTone(count),
    });
  }

  return sortSeatCovenants(list);
}

export function visibleSeatCovenants(
  lineup: SeatLineup | undefined,
  deckPool?: DeckPoolSnapshot | null,
  maxItems = 4,
): { shown: SeatCovenantStatus[]; hiddenCount: number; all: SeatCovenantStatus[] } {
  const all = computeSeatCovenants(lineup, deckPool).filter(b => b.active || b.count >= 2);
  const limit = Math.max(0, Math.trunc(maxItems));
  return {
    shown: all.slice(0, limit),
    hiddenCount: Math.max(0, all.length - limit),
    all,
  };
}

export function formatCovenantsTooltip(bonds: SeatCovenantStatus[]): string {
  return bonds
    .map(b => `${b.name} ${b.count}${b.active ? '' : `/${b.threshold}（未激活）`}`)
    .join(' · ');
}
