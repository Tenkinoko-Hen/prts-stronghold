// 青逝痕 Tenkinoko 制作
/**
 * 手机端离线搜牌概率引擎：
 * 复用桌面端超几何无放回计算公式（deckPoolMath.ts），结合《卫戍协议·规程》官方牌池张数与各本商店槽位，
 * 在无抓包环境下提供「单刷命中率 / 5刷命中率 / 期望刷新 / 升本对比 / 三连碰高一阶」速查。
 */
import { hypergeometricAtLeastOne, repeatedRollProb } from '../desktop/deckPoolMath';
import type { OperatorTier } from '../data/prtsAvatars';

export const TIER_NUM_MAP: Record<OperatorTier, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
};

export const NUM_TO_TIER: Record<number, OperatorTier> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
};

/** 卫戍协议·规程 各阶卡池标准单卡总张数 */
export const OFFLINE_POOL_COPIES_BY_TIER: Record<number, number> = {
  1: 12,
  2: 14,
  3: 18,
  4: 16,
  5: 8,
  6: 5,
};

/** 卫戍协议·规程 标准商店各阶常规干员种数（不含限定外援/代币） */
export const OFFLINE_OPERATOR_KINDS_BY_TIER: Record<number, number> = {
  1: 19,
  2: 24,
  3: 26,
  4: 27,
  5: 25,
  6: 20,
};

/** 各商店等级每次刷新提供的干员槽位数 */
export const OFFLINE_SHOP_SLOTS_BY_LEVEL: Record<number, number> = {
  1: 3,
  2: 4,
  3: 4,
  4: 5,
  5: 5,
  6: 5,
};

export interface OfflineRollResult {
  shopLevel: number;
  targetTier: number;
  unlocked: boolean;
  charSlots: number;
  totalCopies: number;
  remainingCopies: number;
  poolTotalCopies: number;
  perRollProb: number;
  fiveRollProb: number;
  tenRollProb: number;
  expectedRolls: number | null;
  nextLevelShopLevel: number | null;
  nextLevelPerRollProb: number | null;
  tripleDiscoverProb: number | null;
}

export function offlinePoolTotalUpTo(shopLevel: number, extraRemovedFromPool = 0): number {
  const level = Math.max(1, Math.min(6, Math.trunc(shopLevel)));
  let total = 0;
  for (let t = 1; t <= level; t++) {
    total += OFFLINE_OPERATOR_KINDS_BY_TIER[t] * OFFLINE_POOL_COPIES_BY_TIER[t];
  }
  return Math.max(1, total - Math.max(0, Math.trunc(extraRemovedFromPool)));
}

export function offlineExactTierTotal(tier: number): number {
  const t = Math.max(1, Math.min(6, Math.trunc(tier)));
  return OFFLINE_OPERATOR_KINDS_BY_TIER[t] * OFFLINE_POOL_COPIES_BY_TIER[t];
}

/**
 * 计算离线搜目标阶单名干员（或多目标合并剩余张数）的精准无放回概率。
 */
export function computeOfflineRollOdds(params: {
  shopLevel: number;
  targetTier: number;
  takenCopies?: number;
  targetCount?: number;
  estimatedOtherTaken?: number;
}): OfflineRollResult {
  const shopLevel = Math.max(1, Math.min(6, Math.trunc(params.shopLevel)));
  const targetTier = Math.max(1, Math.min(6, Math.trunc(params.targetTier)));
  const count = Math.max(1, Math.min(8, Math.trunc(params.targetCount ?? 1)));
  const perCardTotal = OFFLINE_POOL_COPIES_BY_TIER[targetTier];
  const totalCopies = perCardTotal * count;
  const taken = Math.max(0, Math.min(totalCopies, Math.trunc(params.takenCopies ?? 0)));
  const remainingCopies = Math.max(0, totalCopies - taken);
  const otherTaken = Math.max(0, Math.trunc(params.estimatedOtherTaken ?? 0));

  const charSlots = OFFLINE_SHOP_SLOTS_BY_LEVEL[shopLevel];
  const poolTotalCopies = offlinePoolTotalUpTo(shopLevel, taken + otherTaken);
  const unlocked = targetTier <= shopLevel;

  const perRollProb = unlocked
    ? hypergeometricAtLeastOne(poolTotalCopies, remainingCopies, charSlots)
    : 0;
  const fiveRollProb = repeatedRollProb(perRollProb, 5);
  const tenRollProb = repeatedRollProb(perRollProb, 10);
  const expectedRolls = perRollProb > 0 ? 1 / perRollProb : null;

  const nextLevelShopLevel = unlocked ? (shopLevel < 6 ? shopLevel + 1 : null) : targetTier;
  let nextLevelPerRollProb: number | null = null;
  if (nextLevelShopLevel !== null) {
    const nextSlots = OFFLINE_SHOP_SLOTS_BY_LEVEL[nextLevelShopLevel];
    const nextPool = offlinePoolTotalUpTo(nextLevelShopLevel, taken + otherTaken);
    nextLevelPerRollProb = hypergeometricAtLeastOne(nextPool, remainingCopies, nextSlots);
  }

  // 三连合精锐可从「当前本数 + 1」阶卡池中 3 选 1 碰牌
  const discoverTier = Math.min(6, shopLevel + 1);
  let tripleDiscoverProb: number | null = null;
  if (targetTier === discoverTier && remainingCopies > 0 && shopLevel < 6) {
    const exactPool = Math.max(remainingCopies, offlineExactTierTotal(discoverTier) - taken);
    tripleDiscoverProb = hypergeometricAtLeastOne(exactPool, remainingCopies, 3);
  }

  return {
    shopLevel,
    targetTier,
    unlocked,
    charSlots,
    totalCopies,
    remainingCopies,
    poolTotalCopies,
    perRollProb,
    fiveRollProb,
    tenRollProb,
    expectedRolls,
    nextLevelShopLevel,
    nextLevelPerRollProb,
    tripleDiscoverProb,
  };
}

export function formatOddsPct(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.001) return '<0.1%';
  const pct = prob * 100;
  return pct >= 10 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
}
