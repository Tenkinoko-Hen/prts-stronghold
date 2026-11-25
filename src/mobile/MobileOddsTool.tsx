// 青逝痕 Tenkinoko 制作
import { useEffect, useMemo, useState } from 'react';
import { Dices, TrendingUp } from 'lucide-react';
import { PRTS_OPERATOR_TIERS, resolveOperatorAvatars, type OperatorTier } from '../data/prtsAvatars';
import { computeOfflineRollOdds, formatOddsPct, NUM_TO_TIER, OFFLINE_POOL_COPIES_BY_TIER, TIER_NUM_MAP } from './mobileOdds';

export interface MissingTargetSummary {
  name: string;
  tier: OperatorTier;
}

export function MobileOddsTool({
  defaultShopLevel = 4,
  missingTargets = [],
  compact = false,
}: {
  defaultShopLevel?: number;
  missingTargets?: MissingTargetSummary[];
  compact?: boolean;
}) {
  const [shopLevel, setShopLevel] = useState(() => Math.max(1, Math.min(6, Math.trunc(defaultShopLevel))));
  useEffect(() => {
    setShopLevel(Math.max(1, Math.min(6, Math.trunc(defaultShopLevel))));
  }, [defaultShopLevel]);
  const [targetTier, setTargetTier] = useState<number>(() => {
    const first = missingTargets[0];
    if (first && TIER_NUM_MAP[first.tier]) return TIER_NUM_MAP[first.tier];
    return Math.max(1, Math.min(6, Math.trunc(defaultShopLevel)));
  });
  const [takenCopies, setTakenCopies] = useState(0);
  const [targetCount, setTargetCount] = useState(1);

  const singleResult = useMemo(
    () => computeOfflineRollOdds({ shopLevel, targetTier, takenCopies, targetCount }),
    [shopLevel, targetTier, takenCopies, targetCount],
  );

  // 若传入了当前阵容缺卡清单，按阶分组算「本页任意缺卡命中率」
  const missingByTier = useMemo(() => {
    const groups = new Map<number, string[]>();
    for (const item of missingTargets) {
      const clean = resolveOperatorAvatars(item.name)[0]?.cleanName || item.name;
      const tier = item.tier || PRTS_OPERATOR_TIERS[clean];
      const num = tier ? TIER_NUM_MAP[tier] : 0;
      if (num >= 1 && num <= 6) {
        const list = groups.get(num) || [];
        if (!list.includes(clean)) list.push(clean);
        groups.set(num, list);
      }
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [missingTargets]);

  const anyMissingOdds = useMemo(() => {
    if (!missingByTier.length) return null;
    let totalUnlockedTargets = 0;
    for (const [tier, names] of missingByTier) {
      if (tier <= shopLevel) {
        totalUnlockedTargets += names.length * OFFLINE_POOL_COPIES_BY_TIER[tier];
      }
    }
    const base = computeOfflineRollOdds({
      shopLevel,
      targetTier: shopLevel,
      takenCopies: 0,
      targetCount: 1,
    });
    if (totalUnlockedTargets <= 0) {
      return { unlockedCount: 0, perRoll: 0, fiveRolls: 0, expected: null as number | null };
    }
    // 使用精确超几何概率计算「单刷至少命中 1 张当前缺卡」
    const pool = base.poolTotalCopies;
    const slots = base.charSlots;
    let miss = 1;
    for (let i = 0; i < Math.min(slots, pool); i++) {
      miss *= Math.max(0, pool - totalUnlockedTargets - i) / (pool - i);
    }
    const perRoll = Math.max(0, Math.min(1, 1 - miss));
    const fiveRolls = 1 - (1 - perRoll) ** 5;
    return {
      unlockedCount: missingByTier.filter(([t]) => t <= shopLevel).reduce((s, [, l]) => s + l.length, 0),
      perRoll,
      fiveRolls,
      expected: perRoll > 0 ? 1 / perRoll : null,
    };
  }, [missingByTier, shopLevel]);

  const maxTaken = OFFLINE_POOL_COPIES_BY_TIER[targetTier] * targetCount;

  return (
    <section className={`m-card m-odds-card${compact ? ' is-compact' : ''}`}>
      <div className="m-odds-head">
        <strong><Dices size={14} /> 离线搜牌概率速查</strong>
        <span className="m-odds-meta">{shopLevel}本 · {singleResult.charSlots}格/刷</span>
      </div>

      {/* 商店本数快选 */}
      <div className="m-odds-row">
        <span className="m-odds-label">当前商店</span>
        <div className="m-odds-pills" role="group" aria-label="当前商店本数">
          {[1, 2, 3, 4, 5, 6].map(lv => (
            <button key={lv} type="button" aria-pressed={shopLevel === lv} onClick={() => setShopLevel(lv)}>
              {lv}本
            </button>
          ))}
        </div>
      </div>

      {/* 当前阵容缺卡综合命中（仅在跟进页有缺卡时显示） */}
      {anyMissingOdds && missingByTier.length > 0 && (
        <div className="m-odds-missing-box">
          <div className="m-odds-missing-top">
            <span>阵容缺卡命中（{shopLevel}本可搜 {anyMissingOdds.unlockedCount} 名）</span>
            <strong>{formatOddsPct(anyMissingOdds.perRoll)} / 刷</strong>
          </div>
          <div className="m-odds-missing-sub">
            <span>5刷命中 {formatOddsPct(anyMissingOdds.fiveRolls)}</span>
            <span>期望 {anyMissingOdds.expected ? `${anyMissingOdds.expected.toFixed(1)} 刷` : '需升本'}</span>
          </div>
          <div className="m-odds-tier-chips">
            {missingByTier.map(([t, names]) => (
              <button
                key={t}
                type="button"
                className={targetTier === t ? 'is-active' : ''}
                onClick={() => { setTargetTier(t); setTargetCount(Math.min(4, names.length)); setTakenCopies(0); }}
              >
                {NUM_TO_TIER[t]}阶({names.length})：{names.slice(0, 2).join('·')}{names.length > 2 ? '…' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 目标阶数快选 */}
      <div className="m-odds-row">
        <span className="m-odds-label">目标阶数</span>
        <div className="m-odds-pills" role="group" aria-label="目标干员阶数">
          {[1, 2, 3, 4, 5, 6].map(t => (
            <button
              key={t}
              type="button"
              aria-pressed={targetTier === t}
              onClick={() => { setTargetTier(t); setTakenCopies(0); }}
            >
              {NUM_TO_TIER[t]}阶
            </button>
          ))}
        </div>
      </div>

      {/* 同时追几名 + 已被抓/抢走张数 */}
      <div className="m-odds-sliders">
        <label>
          <span>同时追 <b>{targetCount}</b> 名同阶卡</span>
          <input
            type="range"
            min={1}
            max={4}
            value={targetCount}
            onChange={e => {
              const next = Number(e.target.value);
              setTargetCount(next);
              setTakenCopies(prev => Math.min(prev, OFFLINE_POOL_COPIES_BY_TIER[targetTier] * next));
            }}
          />
        </label>
        <label>
          <span>牌池已拿走 <b>{takenCopies}</b>/{maxTaken} 张</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, maxTaken - 1)}
            value={Math.min(takenCopies, Math.max(0, maxTaken - 1))}
            onChange={e => setTakenCopies(Number(e.target.value))}
          />
        </label>
      </div>

      {/* 结果大字卡片 */}
      <div className="m-odds-metrics">
        <div>
          <small>单次刷新</small>
          <strong className={singleResult.unlocked ? 'is-yellow' : 'is-locked'}>
            {singleResult.unlocked ? formatOddsPct(singleResult.perRollProb) : '未解锁'}
          </strong>
        </div>
        <div>
          <small>连刷 5 次</small>
          <strong>{singleResult.unlocked ? formatOddsPct(singleResult.fiveRollProb) : '—'}</strong>
        </div>
        <div>
          <small>期望刷数</small>
          <strong>{singleResult.expectedRolls ? `${singleResult.expectedRolls.toFixed(1)} 刷` : '—'}</strong>
        </div>
      </div>

      {/* 决策建议：停本 vs 升本 / 三连碰牌 */}
      <div className="m-odds-advice">
        {singleResult.nextLevelShopLevel !== null && singleResult.nextLevelPerRollProb !== null && (
          <span>
            <TrendingUp size={12} /> 升至 <b>{singleResult.nextLevelShopLevel}本</b> 后单刷{' '}
            <b>{formatOddsPct(singleResult.nextLevelPerRollProb)}</b>
            {singleResult.unlocked
              ? singleResult.nextLevelPerRollProb < singleResult.perRollProb
                ? '（升本会被高阶卡稀释，建议当前本数追）'
                : '（槽位增加，升本收益更高）'
              : '（当前本数刷不到，需先升本或靠三连碰）'}
          </span>
        )}
        {singleResult.tripleDiscoverProb !== null && (
          <span>
            ★ 当前 {shopLevel}本 三连碰 {NUM_TO_TIER[targetTier]}阶 3选1 命中率：<b>{formatOddsPct(singleResult.tripleDiscoverProb)}</b>
          </span>
        )}
      </div>
    </section>
  );
}
