/**
 * Clean-room Stronghold shared/solo deck-pool probability & comparison calculator.
 * Uses exact hypergeometric without-replacement roll probability per shop slot count.
 */

import type { DeckPoolEquip, DeckPoolOperator, DeckPoolSnapshot } from './combatTelemetry';

export interface OperatorRollOdds {
  operator: DeckPoolOperator;
  unlocked: boolean;
  unlockTier: number;
  singleSlotProb: number;
  perRollProb: number;
  fiveRollProb: number;
  tenRollProb: number;
  expectedRolls: number | null;
  nextTierRollProb: number | null;
  tripleDiscoverProb: number | null;
  status: 'locked' | 'empty' | 'scarce' | 'healthy';
}

export interface EquipRollOdds {
  equip: DeckPoolEquip;
  unlocked: boolean;
  unlockTier: number;
  perRollProb: number;
  fiveRollProb: number;
  expectedRolls: number | null;
}

export interface WishlistSummary {
  shopLevel: number;
  charSlots: number;
  itemSlots: number;
  availablePoolCopies: number;
  availableEquipKinds: number;
  wishlistOperatorRemaining: number;
  anyWishOperatorPerRoll: number;
  anyWishOperatorFiveRolls: number;
  anyWishOperatorExpectedRolls: number | null;
  nextLevelShopLevel: number | null;
  nextLevelAnyWishPerRoll: number | null;
  anyWishEquipPerRoll: number;
  operatorOdds: OperatorRollOdds[];
  equipOdds: EquipRollOdds[];
}

/**
 * Exact probability of drawing at least 1 target card out of `slots` draws
 * without replacement from a pool of `poolTotal` cards containing `targetCount` targets.
 */
export function hypergeometricAtLeastOne(poolTotal: number, targetCount: number, slots: number): number {
  if (poolTotal <= 0 || targetCount <= 0 || slots <= 0) return 0;
  if (targetCount >= poolTotal) return 1;
  const draws = Math.min(slots, poolTotal);
  if (poolTotal - targetCount < draws) return 1;
  let missProb = 1;
  for (let i = 0; i < draws; i++) {
    missProb *= (poolTotal - targetCount - i) / (poolTotal - i);
  }
  return Math.max(0, Math.min(1, 1 - missProb));
}

export function repeatedRollProb(perRollProb: number, rolls: number): number {
  if (perRollProb <= 0 || rolls <= 0) return 0;
  if (perRollProb >= 1) return 1;
  return Math.max(0, Math.min(1, 1 - (1 - perRollProb) ** rolls));
}

export function poolCopiesUpToTier(pool: DeckPoolSnapshot, maxTier: number): number {
  let total = 0;
  for (const op of pool.operators) {
    if (op.tier >= 1 && op.tier <= maxTier) {
      total += op.remaining;
    }
  }
  return total;
}

export function poolCopiesAtExactTier(pool: DeckPoolSnapshot, tier: number): number {
  let total = 0;
  for (const op of pool.operators) {
    if (op.tier === tier) total += op.remaining;
  }
  return total;
}

export function computeOperatorOdds(
  pool: DeckPoolSnapshot,
  op: DeckPoolOperator,
  shopLevel: number,
): OperatorRollOdds {
  const level = Math.max(1, Math.min(6, Math.trunc(shopLevel)));
  const slots = pool.shopSlots[level]?.char ?? 4;
  const unlocked = op.tier <= level;
  const availTotal = poolCopiesUpToTier(pool, level);

  const singleSlotProb = unlocked && availTotal > 0 ? op.remaining / availTotal : 0;
  const perRollProb = unlocked ? hypergeometricAtLeastOne(availTotal, op.remaining, slots) : 0;
  const fiveRollProb = repeatedRollProb(perRollProb, 5);
  const tenRollProb = repeatedRollProb(perRollProb, 10);
  const expectedRolls = perRollProb > 0 ? 1 / perRollProb : null;

  const targetNextLevel = unlocked ? (level < 6 ? level + 1 : null) : op.tier;
  let nextTierRollProb: number | null = null;
  if (targetNextLevel !== null) {
    const nextSlots = pool.shopSlots[targetNextLevel]?.char ?? 5;
    const nextTotal = poolCopiesUpToTier(pool, targetNextLevel);
    nextTierRollProb = hypergeometricAtLeastOne(nextTotal, op.remaining, nextSlots);
  }

  // Triple promotion discovers 3 choices from tier = min(6, shopLevel + 1)
  const discoverTier = Math.min(6, level + 1);
  let tripleDiscoverProb: number | null = null;
  if (op.tier === discoverTier && op.remaining > 0) {
    const exactTierTotal = poolCopiesAtExactTier(pool, discoverTier);
    tripleDiscoverProb = hypergeometricAtLeastOne(exactTierTotal, op.remaining, 3);
  }

  const status: OperatorRollOdds['status'] = !unlocked
    ? 'locked'
    : op.remaining <= 0
      ? 'empty'
      : op.remaining <= Math.max(1, Math.floor(op.totalCopies * 0.25))
        ? 'scarce'
        : 'healthy';

  return {
    operator: op,
    unlocked,
    unlockTier: op.tier,
    singleSlotProb,
    perRollProb,
    fiveRollProb,
    tenRollProb,
    expectedRolls,
    nextTierRollProb,
    tripleDiscoverProb,
    status,
  };
}

export function computeEquipOdds(
  pool: DeckPoolSnapshot,
  equip: DeckPoolEquip,
  shopLevel: number,
): EquipRollOdds {
  const level = Math.max(1, Math.min(6, Math.trunc(shopLevel)));
  const itemSlots = pool.shopSlots[level]?.item ?? 1;
  const availEquips = pool.equips.filter(eq => eq.tier >= 1 && eq.tier <= level).length;
  const unlocked = equip.tier <= level;
  const perRollProb = unlocked && availEquips > 0
    ? hypergeometricAtLeastOne(availEquips, 1, itemSlots)
    : 0;
  return {
    equip,
    unlocked,
    unlockTier: equip.tier,
    perRollProb,
    fiveRollProb: repeatedRollProb(perRollProb, 5),
    expectedRolls: perRollProb > 0 ? 1 / perRollProb : null,
  };
}

export function computeWishlistSummary(
  pool: DeckPoolSnapshot,
  shopLevel: number,
  wishCharIds: ReadonlySet<string>,
  wishTrapIds: ReadonlySet<string>,
): WishlistSummary {
  const level = Math.max(1, Math.min(6, Math.trunc(shopLevel)));
  const charSlots = pool.shopSlots[level]?.char ?? 4;
  const itemSlots = pool.shopSlots[level]?.item ?? 1;
  const availablePoolCopies = poolCopiesUpToTier(pool, level);
  const availableEquipKinds = pool.equips.filter(eq => eq.tier >= 1 && eq.tier <= level).length;

  const wishedOps = pool.operators.filter(op => wishCharIds.has(op.charId));
  const operatorOdds = wishedOps.map(op => computeOperatorOdds(pool, op, level));
  const wishlistOperatorRemaining = wishedOps
    .filter(op => op.tier <= level)
    .reduce((sum, op) => sum + op.remaining, 0);

  const anyWishOperatorPerRoll = hypergeometricAtLeastOne(availablePoolCopies, wishlistOperatorRemaining, charSlots);
  const anyWishOperatorFiveRolls = repeatedRollProb(anyWishOperatorPerRoll, 5);
  const anyWishOperatorExpectedRolls = anyWishOperatorPerRoll > 0 ? 1 / anyWishOperatorPerRoll : null;

  const nextLevelShopLevel = level < 6 ? level + 1 : null;
  let nextLevelAnyWishPerRoll: number | null = null;
  if (nextLevelShopLevel !== null && wishedOps.length > 0) {
    const nextSlots = pool.shopSlots[nextLevelShopLevel]?.char ?? 5;
    const nextTotal = poolCopiesUpToTier(pool, nextLevelShopLevel);
    const nextWishRem = wishedOps
      .filter(op => op.tier <= nextLevelShopLevel)
      .reduce((sum, op) => sum + op.remaining, 0);
    nextLevelAnyWishPerRoll = hypergeometricAtLeastOne(nextTotal, nextWishRem, nextSlots);
  }

  const wishedEquips = pool.equips.filter(eq => wishTrapIds.has(eq.trapId));
  const equipOdds = wishedEquips.map(eq => computeEquipOdds(pool, eq, level));
  const unlockedWishEquipCount = wishedEquips.filter(eq => eq.tier <= level).length;
  const anyWishEquipPerRoll = availableEquipKinds > 0
    ? hypergeometricAtLeastOne(availableEquipKinds, unlockedWishEquipCount, itemSlots)
    : 0;

  return {
    shopLevel: level,
    charSlots,
    itemSlots,
    availablePoolCopies,
    availableEquipKinds,
    wishlistOperatorRemaining,
    anyWishOperatorPerRoll,
    anyWishOperatorFiveRolls,
    anyWishOperatorExpectedRolls,
    nextLevelShopLevel,
    nextLevelAnyWishPerRoll,
    anyWishEquipPerRoll,
    operatorOdds,
    equipOdds,
  };
}
