// 青逝痕 Tenkinoko 制作
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES } from '../data/strongholdData';
import type { DeckPoolSnapshot, SeatLineup } from './combatTelemetry';

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

export interface SeatCovenantStatus {
  name: string;
  shortName: string;
  count: number;
  threshold: number;
  active: boolean;
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

/**
 * 计算指定席位当前场上已部署干员 + 转职装备提供的实时盟约人数与激活态。
 * 同名干员在场多枚仅计 1 次；独行仅在人数 === 1 时视为激活。
 */
export function computeSeatCovenants(
  lineup: SeatLineup | undefined,
  deckPool?: DeckPoolSnapshot | null,
): SeatCovenantStatus[] {
  if (!lineup) return [];
  const counts = new Map<string, number>();

  // 1. 预建干员盟约索引（优先开局 squad，回退 deckPool.operators）
  const byChess = new Map<string, string[]>();
  const byChar = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const s of lineup.squad) {
    if (s.covenants.length > 0) {
      if (s.chessId) byChess.set(s.chessId, s.covenants);
      if (s.charId) byChar.set(s.charId, s.covenants);
      if (s.name) byName.set(s.name, s.covenants);
    }
  }
  if (deckPool) {
    for (const op of deckPool.operators) {
      if (op.covenants.length > 0) {
        if (op.charId && !byChar.has(op.charId)) byChar.set(op.charId, op.covenants);
        if (op.name && !byName.has(op.name)) byName.set(op.name, op.covenants);
      }
    }
  }

  // 2. 场上不重复干员计数
  const seenUnits = new Set<string>();
  for (const unit of lineup.deployed) {
    const dedupKey = unit.charId || unit.chessId || unit.name;
    if (!dedupKey || seenUnits.has(dedupKey)) continue;
    seenUnits.add(dedupKey);
    const covs = (unit.chessId ? byChess.get(unit.chessId) : undefined)
      ?? (unit.charId ? byChar.get(unit.charId) : undefined)
      ?? (unit.name ? byName.get(unit.name) : undefined);
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
  for (const [name, count] of counts.entries()) {
    if (count <= 0) continue;
    const threshold = covenantThreshold(name);
    const active = name === '独行' ? count === 1 : count >= threshold;
    list.push({
      name,
      shortName: shortCovenantName(name),
      count,
      threshold,
      active,
    });
  }

  return list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export function visibleSeatCovenants(
  lineup: SeatLineup | undefined,
  deckPool?: DeckPoolSnapshot | null,
  maxItems = 4,
): { shown: SeatCovenantStatus[]; hiddenCount: number } {
  const all = computeSeatCovenants(lineup, deckPool).filter(b => b.active || b.count >= 2);
  return {
    shown: all.slice(0, maxItems),
    hiddenCount: Math.max(0, all.length - maxItems),
  };
}
