// 青逝痕 Tenkinoko 制作
import {
  ALL_CORE_COVENANT_NAMES,
  CovenantGuide,
  DirectionType,
  MetaCompGuide,
  StageLayout,
  UNIVERSAL_STACKERS,
} from '../data/strongholdData';
import { AEGIR_HUNTERS_ID, AEGIR_PITH_ID, isAegirGuide } from '../data/aegirErosion';

/**
 * Converts Arknights operator facing arrows into Three.js / 2D rotation radians.
 * +X is Right ('→'), -X is Left ('←'), +Z is Down ('↓'), -Z is Up ('↑').
 */
export function directionToRadians(dir: DirectionType): {
  primaryYaw: number;
  secondaryYaw: number | null;
} {
  switch (dir) {
    case '→':
      return { primaryYaw: 0, secondaryYaw: null };
    case '↓':
      return { primaryYaw: -Math.PI / 2, secondaryYaw: null };
    case '↑':
      return { primaryYaw: Math.PI / 2, secondaryYaw: null };
    case '←':
      return { primaryYaw: Math.PI, secondaryYaw: null };
    case '→↓':
      return { primaryYaw: 0, secondaryYaw: -Math.PI / 2 };
  }
}

export function isInsideBossDangerZone(
  x: number,
  z: number,
  zone?: { minX: number; maxX: number; minZ: number; maxZ: number }
): boolean {
  if (!zone) return false;
  return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
}

export interface StageRiskSummary {
  totalOperators: number;
  dpsCount: number;
  defenderCount: number;
  medicCount: number;
  exposedInBossZoneCount: number;
  frontlineEdgeCount: number;
}

export function getStageRiskSummary(layout: StageLayout): StageRiskSummary {
  let dpsCount = 0;
  let defenderCount = 0;
  let medicCount = 0;
  let exposedInBossZoneCount = 0;
  let frontlineEdgeCount = 0;

  for (const p of layout.placements) {
    if (p.role === '输出') dpsCount++;
    else if (p.role === '重装') defenderCount++;
    else if (p.role === '奶') medicCount++;

    if (isInsideBossDangerZone(p.x, p.z, layout.bossDangerZone)) {
      exposedInBossZoneCount++;
    }
    if (
      layout.bossDangerZone &&
      Math.abs(p.x - layout.bossDangerZone.minX) <= 1 &&
      p.z >= layout.bossDangerZone.minZ - 1 &&
      p.z <= layout.bossDangerZone.maxZ + 1
    ) {
      frontlineEdgeCount++;
    }
  }

  return {
    totalOperators: layout.placements.length,
    dpsCount,
    defenderCount,
    medicCount,
    exposedInBossZoneCount,
    frontlineEdgeCount,
  };
}

export interface StackingSimConfig {
  activeFieldIds: string[];
  activeBenchIds: string[];
  frontTargetSellPrice: number; // e.g., 6 for Lumen / Elite 6*
  combatTriggerCount: number; // e.g., 8 triggers per round
  baseStacksPerTrigger: number; // e.g., 2 stacks per trigger
  baseCombatCap: number; // e.g., 24 cap per combat
  rounds: number; // e.g., 10 rounds
}

export interface StackingSimResult {
  restPhaseStacksPerRound: number;
  combatStacksPerRound: number;
  totalStacksPerRound: number;
  projectedTotalStacks: number;
  effectiveCombatCap: number;
  sariaCloneBonus: number;
  foresight80Unlocked: boolean;
  foresight190Unlocked: boolean;
  breakdown: { label: string; value: number }[];
}

export function calculateStackingProjection(
  config: StackingSimConfig
): StackingSimResult {
  const breakdown: { label: string; value: number }[] = [];
  let restPhaseStacksPerRound = 0;

  const hasField = (id: string) => config.activeFieldIds.includes(id);
  const hasBench = (id: string) => config.activeBenchIds.includes(id);

  // 1. Field Rest-Phase Stackers
  if (hasField('pallas')) {
    const val = 36; // Self +18 and Front +18
    restPhaseStacksPerRound += val;
    breakdown.push({ label: '帕拉斯 (自身+身前各+18)', value: val });
  }
  if (hasField('civilight-eterna')) {
    const val = 20;
    restPhaseStacksPerRound += val;
    breakdown.push({ label: '魔王 (核心盟约+20)', value: val });
  }
  if (hasField('archetto')) {
    const val = 12; // Self +6 and Front +6
    restPhaseStacksPerRound += val;
    breakdown.push({ label: '空弦 (自身+身前各+6)', value: val });
  }
  if (hasField('poncirus')) {
    const val = 12; // Self +6 and Back +6
    restPhaseStacksPerRound += val;
    breakdown.push({ label: '青枳 (自身+身后各+6)', value: val });
  }
  if (hasField('windscoot')) {
    const val = 8; // Self +4 and Front +4
    restPhaseStacksPerRound += val;
    breakdown.push({ label: '渡桥 (自身+身前各+4)', value: val });
  }
  if (hasField('haigu')) {
    const price = Math.max(1, config.frontTargetSellPrice);
    const val = price * 2 * 2; // Self + Front based on 2x sell price
    restPhaseStacksPerRound += val;
    breakdown.push({ label: `骸骨 (按售价${price}×2倍双人叠加)`, value: val });
  }
  if (hasField('silence-alt')) {
    const benchCount = Math.max(1, config.activeBenchIds.length || 4);
    const val = benchCount * 2;
    restPhaseStacksPerRound += val;
    breakdown.push({ label: `淬羽赫默 (整备区${benchCount}人各+2)`, value: val });
  }

  // 2. Saria Specialization Clone Bonus (copies best active "休整期结束时" trait in front)
  let sariaCloneBonus = 0;
  if (hasField('saria')) {
    if (hasField('pallas')) {
      sariaCloneBonus = 36;
    } else if (hasField('haigu')) {
      sariaCloneBonus = Math.max(1, config.frontTargetSellPrice) * 4;
    } else if (hasField('civilight-eterna')) {
      sariaCloneBonus = 20;
    } else if (hasField('windscoot')) {
      sariaCloneBonus = 8;
    } else {
      sariaCloneBonus = 8; // Default clone value
    }
    restPhaseStacksPerRound += sariaCloneBonus;
    breakdown.push({ label: '塞雷娅【特异化】复制身前休整特质', value: sariaCloneBonus });
  }

  // 3. Bench-active stackers (Astgenne & Quercus work from bench or field)
  if (hasBench('astgenne') || hasField('astgenne')) {
    restPhaseStacksPerRound += 4;
    breakdown.push({ label: '星源 (整备区/场上最高盟约+4)', value: 4 });
  }
  if (hasBench('quercus') || hasField('quercus')) {
    restPhaseStacksPerRound += 2;
    breakdown.push({ label: '夏栎 (整备区/场上最高盟约+2)', value: 2 });
  }

  // 4. Combat Phase Calculation
  const capMultiplier = hasField('mon3tr') ? 1.6 : 1.0;
  const effectiveCombatCap = Math.round(config.baseCombatCap * capMultiplier);

  const rawCombatStacks = Math.min(
    effectiveCombatCap,
    config.combatTriggerCount * config.baseStacksPerTrigger
  );

  // Amiya adds +2 per trigger (unaffected by stack cap!)
  const amiyaBonus = hasField('amiya') ? config.combatTriggerCount * 2 : 0;
  // Warfarin adds +2 per skill activation up to 14
  const warfarinBonus = hasField('warfarin')
    ? Math.min(14, config.combatTriggerCount * 2)
    : 0;

  const combatStacksPerRound = rawCombatStacks + amiyaBonus + warfarinBonus;

  if (rawCombatStacks > 0) {
    breakdown.push({
      label: hasField('mon3tr')
        ? `战斗内基础叠层 (Mon3tr上限提升至${effectiveCombatCap})`
        : '战斗内基础叠层',
      value: rawCombatStacks,
    });
  }
  if (amiyaBonus > 0) {
    breakdown.push({
      label: `阿米娅 (身前每次叠层额外+2，无视上限×${config.combatTriggerCount}次)`,
      value: amiyaBonus,
    });
  }
  if (warfarinBonus > 0) {
    breakdown.push({
      label: '华法琳 (赋予身前开技能+2层，上限14)',
      value: warfarinBonus,
    });
  }

  const totalStacksPerRound = restPhaseStacksPerRound + combatStacksPerRound;
  const projectedTotalStacks = totalStacksPerRound * Math.max(1, config.rounds);

  return {
    restPhaseStacksPerRound,
    combatStacksPerRound,
    totalStacksPerRound,
    projectedTotalStacks,
    effectiveCombatCap,
    sariaCloneBonus,
    foresight80Unlocked: projectedTotalStacks >= 80,
    foresight190Unlocked: projectedTotalStacks >= 190,
    breakdown,
  };
}

export function getRecommendedPaceForRound(
  comp: MetaCompGuide,
  currentRound: number
): {
  recommendedTier: number;
  currentAction: string;
  activePhaseName: string;
} {
  const clampedRound = Math.max(1, Math.min(15, currentRound));
  let matchedPace = comp.roundPace[0];

  for (const step of comp.roundPace) {
    if (clampedRound >= step.round) {
      matchedPace = step;
    }
  }

  const activePhase =
    comp.phases.find((phase) => {
      const range = phase.rounds.match(/^(\d+)\s*[~～-]\s*(\d+)回合/);
      return range && clampedRound >= Number(range[1]) &&
        (clampedRound <= Number(range[2]) || phase.rounds.includes('及之后'));
    }) ??
    // 未给明确回合的成型阶段由玩家选择，不按固定 R10 推入。
    [...comp.phases].reverse().find(phase => {
      const start = phase.rounds.match(/^(\d+)\s*[~～-]/);
      return start && clampedRound >= Number(start[1]);
    }) ?? comp.phases[0];

  return {
    recommendedTier: matchedPace ? matchedPace.tier : 1,
    currentAction: matchedPace ? matchedPace.action : '',
    activePhaseName: activePhase ? activePhase.phaseName : '',
  };
}

export function filterUniversalStackers(query: string, benchOnly: boolean) {
  const q = query.trim().toLowerCase();
  return UNIVERSAL_STACKERS.filter((op) => {
    if (benchOnly && !op.worksOnBench && op.targetZone !== '整备区生效') {
      return false;
    }
    if (!q) return true;
    return (
      op.name.toLowerCase().includes(q) ||
      op.description.toLowerCase().includes(q) ||
      op.tag.toLowerCase().includes(q)
    );
  });
}

// Explicit mapping of each MetaCompGuide ID to its recommended priority CovenantGuide IDs (both Core and Sub)
const COMP_PRIORITY_COVENANT_MAP: Record<string, string[]> = {
  'kjerag-mechanist-greyy': ['kjerag', 'sub-dexterous', 'sub-bastion', 'sub-convergence'],
  [AEGIR_PITH_ID]: ['aegir', 'sub-harmony', 'sub-dexterous', 'sub-assault'],
  [AEGIR_HUNTERS_ID]: ['aegir', 'sub-dexterous', 'sub-assault'],
  'yan-slow-six-convergence': ['yan', 'sub-convergence', 'sub-dexterous', 'sub-miracle'],
  'yan-bison-shop-four': ['yan', 'sub-bastion', 'sub-dexterous', 'sub-convergence'],
  'suzuran-low-tier-acquisition': ['sub-precision', 'sub-bastion', 'sub-dexterous', 'kjerag'],
  'chiave-leithanien-refresh': ['leithanien', 'sub-precision', 'sub-arcane', 'sub-dexterous', 'sub-convergence', 'sub-miracle'],
  'iberia-low-tier-multibone': ['iberia', 'sub-precision', 'sub-dexterous', 'sub-convergence', 'sub-bastion'],
  'iberia-bastion-three-tier': ['iberia', 'sub-bastion', 'sub-convergence', 'sub-assist', 'sub-swift'],
  'kjerag-snowhunter-precision-swift': ['kjerag', 'sub-precision', 'sub-swift', 'sub-bastion', 'sub-convergence'],
  'iberia-chen-swift-survival': ['iberia', 'sub-precision', 'sub-swift', 'sub-convergence', 'sub-bastion'],
  'ursus-arcane-talulah': ['ursus', 'sub-arcane', 'sub-convergence', 'sub-precision'],
  'sargon-precision-arcane-three': ['sargon', 'sub-precision', 'sub-arcane', 'sub-dexterous', 'sub-convergence'],
  'siracusa-precision-six': ['siracusa', 'sub-precision', 'sub-foresight'],
  'siracusa-bastion-roberta': ['siracusa', 'sub-bastion', 'sub-assist'],
  'yan-double-chen-low-tier': ['yan', 'sub-dexterous', 'sub-convergence', 'sub-bastion'],
  'eunectes-two-tier-scopes': ['sub-dexterous', 'sub-miracle', 'sub-precision', 'sub-convergence', 'sub-defense-support', 'sub-unyielding'],
  'yan-suzuran-honeysuckle-economy': ['yan', 'siracusa', 'sub-investor', 'sub-precision', 'sub-bastion', 'sub-foresight', 'sub-miracle'],
  'kazimierz-gavial-blemishine': ['kazimierz', 'sub-unyielding', 'sub-assault'],
  'faith-mixer-fast-four': ['leithanien', 'sub-precision', 'sub-arcane', 'sub-convergence'],
  'kjerag-gnosis-warfarin-swift': ['kjerag', 'sub-swift', 'sub-convergence', 'sub-dexterous'],
  'iberia-precision-thorns': ['iberia', 'sub-precision', 'sub-convergence', 'sub-dexterous', 'sub-arcane'],
  'iberia-bluepoison-six': ['iberia', 'sub-precision', 'sub-dexterous', 'sub-convergence'],
  'ursus-gravel-machine': ['kazimierz', 'ursus', 'sub-unyielding', 'sub-defense-support', 'sub-miracle'],
  'fuzou-tier1-leithanien': ['leithanien', 'siracusa', 'sub-precision', 'sub-arcane', 'sub-convergence', 'sub-miracle', 'sub-foresight'],
  'eunectes-precision-arcane-big-ugly': ['leithanien', 'sub-precision', 'sub-dexterous', 'sub-arcane', 'sub-convergence', 'sub-miracle', 'sub-foresight', 'sub-defense-support'],
  'leithanien-shapeshifter-standard': ['leithanien', 'sub-precision', 'sub-dexterous', 'sub-arcane', 'sub-convergence', 'sub-miracle', 'sub-foresight'],
  'harmony-yan-victoria-chen': ['yan', 'victoria', 'sub-harmony', 'sub-dexterous', 'sub-bastion', 'sub-convergence', 'sub-precision'],
  'yan-bastion-chen-wang': ['yan', 'sub-convergence', 'sub-dexterous', 'sub-bastion', 'sub-investor'],
  'victoria-bastion-jessica': ['victoria', 'yan', 'sub-bastion', 'sub-dexterous', 'sub-arcane', 'sub-foresight'],
  'kazimierz-fartooth-6': ['kazimierz', 'sub-unyielding', 'sub-precision', 'sub-swift'],
  'kjerag-permafrost-3': ['kjerag', 'sub-dexterous', 'sub-precision', 'sub-swift', 'sub-foresight'],
  'minor-pact-dynasty-logos': ['leithanien', 'kjerag', 'sargon', 'sub-precision', 'sub-dexterous', 'sub-arcane', 'sub-foresight'],
  'sargon-pozy-pepe-swift': ['sargon', 'leithanien', 'sub-swift', 'sub-investor', 'sub-precision'],
  'jessica-precision-arcane-foresight': ['leithanien', 'sargon', 'ursus', 'sub-precision', 'sub-arcane', 'sub-foresight', 'sub-convergence'],
};

/**
 * Determines if a CovenantGuide is a recommended priority covenant for the selected MetaCompGuide.
 */
export function isCovenantRecommendedForComp(
  cov: CovenantGuide,
  comp: MetaCompGuide
): boolean {
  const mapped = COMP_PRIORITY_COVENANT_MAP[comp.id];
  if (mapped && mapped.includes(cov.id)) {
    return true;
  }
  const shortFaction = cov.name.split(' ')[0].replace('盟约', '').trim();
  return comp.covenants.some((c) => c.includes(shortFaction));
}

export interface CovenantFilterOptions {
  onlyCurrentCompPriority: boolean;
  activeComp: MetaCompGuide;
  onlyFavorites: boolean;
  favoriteIds: string[];
}

/**
 * Filters covenants according to:
 * 1) whether the user enabled "仅显示当前所选【阵容一图流】推荐优先级盟约"
 * 2) whether the user enabled "仅看已收藏盟约"
 */
export function filterCovenantGuides(
  covenants: CovenantGuide[],
  options: CovenantFilterOptions
): CovenantGuide[] {
  return covenants.filter((cov) => {
    if (
      options.onlyCurrentCompPriority &&
      !isCovenantRecommendedForComp(cov, options.activeComp)
    ) {
      return false;
    }
    if (options.onlyFavorites && !options.favoriteIds.includes(cov.id)) {
      return false;
    }
    return true;
  });
}

/**
 * Extracts concise visual tags from an operator's raw effect string so the UI
 * can show scannable graphic badges instead of walls of small text.
 */
export function extractConciseEffectBadges(effect: string): {
  triggerBadge: string;
  valueBadge: string;
  shortDesc: string;
} {
  let triggerBadge = '被动强化';
  const trigMatch = effect.match(/<([^>]+)>/);
  if (trigMatch) {
    triggerBadge = trigMatch[1]
      .replace('休整期结束时', '休整结束')
      .replace('进入休整期时', '进休整期')
      .replace('战斗开始时', '开战时')
      .replace('战斗结束时', '战斗结束');
  } else if (effect.includes('部署')) {
    triggerBadge = '部署触发';
  } else if (effect.includes('击倒')) {
    triggerBadge = '击倒触发';
  } else if (effect.includes('冻结') || effect.includes('寒冷')) {
    triggerBadge = '寒冷/冻结';
  }

  let valueBadge = '核心特效';
  const plusMatch = effect.match(/(\+\d+(?:\/\d+)?(?:%|层|秒|点)?)/);
  const minusMatch = effect.match(/(-\d+(?:\/\d+)?(?:%|秒)?)/);
  const multMatch = effect.match(/([12]倍\/[24]倍|1倍\/2倍|2倍)/);

  if (plusMatch) {
    valueBadge = plusMatch[1].includes('层') || plusMatch[1].includes('%') || plusMatch[1].includes('秒')
      ? `叠层 ${plusMatch[1]}`
      : `${plusMatch[1]}层`;
  } else if (minusMatch) {
    valueBadge = `再部署 ${minusMatch[1]}`;
  } else if (multMatch) {
    valueBadge = `售价 ${multMatch[1]}`;
  } else if (effect.includes('转化')) {
    valueBadge = '转永久层';
  } else if (effect.includes('免费刷新')) {
    valueBadge = '免费刷新';
  } else if (effect.includes('不融冰')) {
    valueBadge = '产不融冰';
  } else if (effect.includes('重锤')) {
    valueBadge = '产维式重锤';
  }

  const shortDesc = effect
    .replace(/<[^>]+>/g, '')
    .replace(/【叠层核心】|【前期叠层核心】|【中后期叠层核心】|【中期核心】|【四本真神】|【永冻核心】|【本家站场输出】|【本家输出终端】|【后期输出核心】|【叠层\+输出终端】/g, '')
    .replace(/（每(?:回合|场)至多[^）]+）/g, '')
    .trim();

  return {
    triggerBadge,
    valueBadge,
    shortDesc: shortDesc.length > 36 ? shortDesc.slice(0, 35) + '…' : shortDesc,
  };
}

// ---------------------------------------------------------------------------
// BAN / PICK AUTOMATIC OPTIMAL COMP MATCHING ENGINE
// ---------------------------------------------------------------------------
export interface BanPickState {
  bannedCovenants: string[];
  bannedOperators: string[];
}

export interface CompBanEvaluation {
  comp: MetaCompGuide;
  score: number; // 0 to 100
  status: 'optimal' | 'viable' | 'blocked';
  statusLabel: string;
  blockedReasons: string[];
  safeHighlights: string[];
  pivotAdvice: string;
}

/**
 * Exact preset from User Image 3 (/assets/aistudio/e540b6bc8f2cdd41866ef02d4a9d7c33_263d6fd8.png):
 * Banned Core Covenants: 谢拉格, 卡西米尔, 乌萨斯, 伊比利亚, 莱塔尼亚
 * Banned Sub-Covenants: 精准, 助力, 突袭, 聚合, 奥术
 */
export const IMAGE3_DEFAULT_BAN_STATE: BanPickState = {
  bannedCovenants: [
    '谢拉格',
    '卡西米尔',
    '乌萨斯',
    '伊比利亚',
    '莱塔尼亚',
    '精准',
    '助力',
    '突袭',
    '聚合',
    '奥术',
  ],
  bannedOperators: [],
};

interface CompBanRuleProfile {
  hardRequiredCovenants: string[]; // 主阵营被禁 -55，关键附加盟约受限 -25
  softSupportCovenants: string[]; // 辅助盟约受限 -10，可调整组件
  criticalOperators: string[]; // 核心干员被禁 -55
  importantOperators: string[]; // 重要干员被禁 -18
  pivotTipWhenSoftBanned: string;
  setupCheck?: string; // 仅凭 Ban 不能确认的科研或来牌条件
}

const COMP_BAN_PROFILES: Record<string, CompBanRuleProfile> = {
  'kjerag-reprise-fast-four': {
    hardRequiredCovenants: ['谢拉格', '精准'], softSupportCovenants: ['聚合'],
    criticalOperators: [], importantOperators: ['空弦', '纯烬艾雅法拉'],
    pivotTipWhenSoftBanned: '用复奏在四本碰五阶；无谢转就不强走逻各斯，有有效迅捷与双镜再选雪猎。缺聚合优先补有效治疗。',
  },
  'kjerag-suzuran-snowhunter': {
    hardRequiredCovenants: ['谢拉格', '精准', '迅捷'], softSupportCovenants: ['坚守'],
    criticalOperators: ['雪猎', '承曦格雷伊'], importantOperators: ['耶拉', '青枳'],
    pivotTipWhenSoftBanned: '需要铃兰指令和二本核心对子。缺迅捷先稳场，不沿用双镜的关底预期；牌不顺转铃兰供冰或复奏速四。',
  },
  'yan-bison-victoria-research': {
    hardRequiredCovenants: ['炎', '维多利亚'], softSupportCovenants: ['坚守', '聚合', '灵巧'],
    criticalOperators: ['风絮', '涤火杰西卡', '赤刃明霄陈'], importantOperators: ['仇白', '余'],
    setupCheck: '科研：先守住四本炎，火陈与维转到手再合流',
    pivotTipWhenSoftBanned: '缺火陈、维转或装备用四本整店炎；别在中期同时硬凑三炎和三维。',
  },
  'sargon-victoria-mechanist': {
    hardRequiredCovenants: ['萨尔贡', '维多利亚'], softSupportCovenants: ['坚守', '聚合'],
    criticalOperators: ['异客', '涤火杰西卡'], importantOperators: [],
    setupCheck: '科研：四本确认异客装备循环与涤火杰西卡',
    pivotTipWhenSoftBanned: '精奥受限可以试。异客迟到先用免费换装找战力；缺输出时不靠堆坚守解决漏怪。',
  },
  'papyrus-pairs-pivot': {
    hardRequiredCovenants: [], softSupportCovenants: ['精准'],
    criticalOperators: [], importantOperators: [],
    setupCheck: '转线：四本开牌后再选莱塔尼亚或萨尔贡',
    pivotTipWhenSoftBanned: '按实际开到的五阶和道中生存转线；两家都不合适就保现有强阵，不能假定开出核心。',
  },
  'kjerag-mechanist-greyy': {
    hardRequiredCovenants: ['谢拉格', '灵巧'], softSupportCovenants: ['坚守', '聚合'],
    criticalOperators: ['承曦格雷伊'], importantOperators: ['耶拉', '初雪'],
    pivotTipWhenSoftBanned: '先选机械师策略，再确认格雷伊、手套和冰的来源。缺耶拉须实际拿到不融冰；灵巧受限或控场覆盖不够时，少追叠层，先补对空和输出。',
  },
  [AEGIR_PITH_ID]: {
    hardRequiredCovenants: ['阿戈尔'], softSupportCovenants: ['调和'],
    criticalOperators: ['克莱门莎'], importantOperators: ['安哲拉'],
    pivotTipWhenSoftBanned: 'Pith 先核对调和能否开出，再补阿戈尔人数。缺灵巧看有效突袭或装备；克莱门莎没来就保当前输出。',
  },
  [AEGIR_HUNTERS_ID]: {
    hardRequiredCovenants: ['阿戈尔'], softSupportCovenants: [],
    criticalOperators: ['克莱门莎'], importantOperators: ['安哲拉'],
    pivotTipWhenSoftBanned: '需选歌蕾蒂娅策略。精奥受限可走水月灵巧；克莱门莎没到先保当前输出，不为凑六阿戈尔提前拆阵。',
  },
  'yan-bison-shop-four': {
    hardRequiredCovenants: ['炎', '坚守', '灵巧', '聚合'], softSupportCovenants: ['投资人'],
    criticalOperators: ['风絮', '仇白', '华法琳'], importantOperators: ['余', '塞雷娅'],
    pivotTipWhenSoftBanned: '精奥受限可走；先确认炎、坚守、聚合和灵巧。拜松只买有收益的整店，缺四本核心就留过渡阵，塞雷娅到手再换位。',
  },
  'suzuran-low-tier-acquisition': {
    hardRequiredCovenants: ['精准', '坚守', '灵巧'], softSupportCovenants: ['谢拉格'],
    criticalOperators: ['承曦格雷伊', '雪猎'], importantOperators: ['耶拉', '云迹', '空弦'],
    pivotTipWhenSoftBanned: '需要铃兰指令；缺格雷伊或雪猎换路线，耶拉不可用则失去供冰分支。三本关键牌迟到不要死卡二本；迅捷不是前提。',
  },
  'chiave-leithanien-refresh': {
    hardRequiredCovenants: ['莱塔尼亚', '精准', '奥术'], softSupportCovenants: ['灵巧', '聚合', '奇迹'],
    criticalOperators: ['复奏'], importantOperators: ['云迹', '黑键', '纯烬艾雅法拉'],
    pivotTipWhenSoftBanned: '先核对禁叙保莱且复奏存活的特殊卡池；未满足时不能宣称被动必出复奏，改按现有牌走普通精奥莱。',
  },
  'iberia-low-tier-multibone': {
    hardRequiredCovenants: ['伊比利亚', '精准', '灵巧'], softSupportCovenants: ['聚合', '坚守'],
    criticalOperators: ['旅骨', '蓝毒', '空弦'], importantOperators: ['云迹', '承曦格雷伊', '海沫', '流明'],
    pivotTipWhenSoftBanned: '低本精锐与转职不到位先保三伊生存；灵巧受限核对实际存活卡，无法启动时换原有精准聚合或坚守兜底。',
  },
  'iberia-bastion-three-tier': {
    hardRequiredCovenants: ['伊比利亚'], softSupportCovenants: ['坚守', '聚合', '助力', '迅捷'],
    criticalOperators: ['旅骨', '蓝毒'], importantOperators: ['海沫', '流明', '温蒂'],
    pivotTipWhenSoftBanned: '精准受限仍可走坚守聚合，先核对蓝毒、旅骨。两名低阶伊已精锐仍缺四阶治疗或控制时及时升四，不等固定回合。',
  },
  'kjerag-snowhunter-precision-swift': {
    hardRequiredCovenants: ['谢拉格', '精准', '迅捷'], softSupportCovenants: ['坚守', '聚合'],
    criticalOperators: ['雪猎'], importantOperators: ['灵知', '空弦', '青枳'],
    pivotTipWhenSoftBanned: '雪猎被禁不能沿用本终端；精迅受限须核对实际叠层手，多个高阶来源缺失时先精准坚守过渡或换线，不以青枳保证迅捷层数。',
  },
  'iberia-chen-swift-survival': {
    hardRequiredCovenants: ['伊比利亚', '迅捷'], softSupportCovenants: ['精准', '聚合', '坚守'],
    criticalOperators: ['旅骨', '霍尔海雅'], importantOperators: ['流明', '温蒂', '青枳'],
    pivotTipWhenSoftBanned: '这是陈策略与迅捷转职条件分支；没有策略或转职时保原生存底座，或换蓝毒精准路线，不照抄二精准取舍。',
  },
  'ursus-arcane-talulah': {
    hardRequiredCovenants: ['乌萨斯', '奥术'], softSupportCovenants: ['聚合', '精准'],
    criticalOperators: [], importantOperators: ['塔露拉', '怒潮凛冬'],
    pivotTipWhenSoftBanned: '塔露拉没来先用怒潮凛冬等成熟输出，三奥术、前排和治疗要实际补齐；乌萨斯被禁时换其他阵营。',
  },
  'sargon-precision-arcane-three': {
    hardRequiredCovenants: ['萨尔贡', '精准', '奥术'], softSupportCovenants: ['灵巧', '聚合'],
    criticalOperators: ['鸿雪', '佩佩'], importantOperators: ['异客', '霍尔海雅'],
    pivotTipWhenSoftBanned: '这张卡为三萨精奥；缺五阶核心或对空不足时保持成熟精奥并换阵营，迅捷变体参考另一张萨尔贡卡。',
  },
  'siracusa-precision-six': {
    hardRequiredCovenants: ['叙拉古', '精准'], softSupportCovenants: ['远见'],
    criticalOperators: ['空弦', '伺夜'], importantOperators: ['贝洛内', '忍冬'],
    pivotTipWhenSoftBanned: '叙拉古被禁时换路线；精准受限先核对存活组件与转职，三本不能直接购买四阶支援。',
  },
  'siracusa-bastion-roberta': {
    hardRequiredCovenants: ['叙拉古', '坚守'], softSupportCovenants: ['助力'],
    criticalOperators: ['罗比菈塔', '贝洛内'], importantOperators: ['塞雷娅', '荒芜拉普兰德'],
    pivotTipWhenSoftBanned: '仅在坚守底座与本家终端到位时考虑；缺六叙保三坚守，核心不齐优先现有维或炎路线。',
  },
  'yan-double-chen-low-tier': {
    hardRequiredCovenants: ['炎', '灵巧', '聚合'], softSupportCovenants: ['坚守', '迅捷'],
    criticalOperators: ['假日威龙陈', '仇白'], importantOperators: ['华法琳', '风絮', '余'],
    pivotTipWhenSoftBanned: '火陈通过策略取得，四本不能直接购买；缺第二名火陈保原有输出，聚合受限时核对替代生存。',
  },
  'yan-slow-six-convergence': {
    hardRequiredCovenants: ['炎', '灵巧', '聚合'], softSupportCovenants: ['奇迹'],
    criticalOperators: ['华法琳'], importantOperators: ['云迹', '仇白', '风絮', '佩佩', '黍'],
    pivotTipWhenSoftBanned: '华法琳不可用时换线；云迹未到先保战力，火陈按策略实际取得，不要求双火陈。六炎人数不足保三炎聚合。',
  },
  'eunectes-two-tier-scopes': {
    hardRequiredCovenants: ['灵巧', '奇迹'], softSupportCovenants: ['精准', '聚合', '协防干员', '不屈'],
    criticalOperators: ['暴躁铁皮', '云迹', '承曦格雷伊'], importantOperators: [],
    pivotTipWhenSoftBanned: '核对存活的奇迹与灵巧组件；缺云迹改看卡西不屈，缺承曦格雷伊改看转职大丑，不继续照抄双六镜。通讯器出现与给卡选项分开判断，不能保证按时刷出。',
  },
  'yan-suzuran-honeysuckle-economy': {
    hardRequiredCovenants: ['炎', '叙拉古', '投资人', '精准'], softSupportCovenants: ['坚守', '远见', '奇迹', '灵巧'],
    criticalOperators: ['忍冬'], importantOperators: ['余', '仇白', '可露希尔'],
    pivotTipWhenSoftBanned: '忍冬循环没启动就先正常构筑，不预支免费刷新；远见或奇迹受限可减少经济分支，炎或叙拉古被Ban时改选其他路线。',
  },
  'kazimierz-gavial-blemishine': {
    hardRequiredCovenants: ['卡西米尔', '不屈', '突袭'], softSupportCovenants: [],
    criticalOperators: ['砾', '瑕光', '玛恩纳'], importantOperators: ['风丸'],
    pivotTipWhenSoftBanned: '先确认砾、瑕光与玛恩纳。R5–10 先补阻挡、对空和清怪；百炼嘉维尔指令保砾或当前扛线位，别等转职才补战力。',
  },
  'faith-mixer-fast-four': {
    hardRequiredCovenants: ['莱塔尼亚', '精准', '奥术'], softSupportCovenants: ['聚合'],
    criticalOperators: [], importantOperators: ['霍尔海雅', '黑键'],
    pivotTipWhenSoftBanned: '莱塔尼亚被禁时放弃本卡主线，保留搅拌机经济打法，改看坚守维多利亚或萨尔贡路线；精准/奥术受限时先核对存活组件。技能收入依当轮血线，不能保证5回合上四本。',
  },
  'kjerag-gnosis-warfarin-swift': {
    hardRequiredCovenants: ['谢拉格', '迅捷'], softSupportCovenants: ['聚合', '灵巧'],
    criticalOperators: ['灵知', '华法琳'], importantOperators: ['圣聆初雪'],
    pivotTipWhenSoftBanned: '雅雅与空弦受限时可考虑此路线，但灵知、华法琳与谢迅需可用；缺核心先保坚守聚合，灵巧流属于另一种取舍，不保证迅捷流同样成立。',
  },
  'iberia-precision-thorns': {
    hardRequiredCovenants: ['伊比利亚', '精准', '聚合'], softSupportCovenants: ['灵巧', '奥术'],
    criticalOperators: [], importantOperators: ['棘刺', '霍尔海雅', '流明', '承曦格雷伊'],
    pivotTipWhenSoftBanned: '先保3伊、3精准与聚合底座，灵巧位按云迹/佩佩来牌调整；普通棘刺是五阶，未到或被Ban时保留四本精准聚合主体，以已有输出过渡。',
  },
  'iberia-bluepoison-six': {
    hardRequiredCovenants: ['伊比利亚', '精准', '灵巧'], softSupportCovenants: ['聚合'],
    criticalOperators: ['蓝毒', '旅骨'], importantOperators: ['流明', '华法琳'],
    pivotTipWhenSoftBanned: '有足够转职再开6伊，否则保留3伊3精准聚合；灵巧、蓝毒或旅骨被Ban时不能照抄本路线，改看棘刺混搭或其他已成型体系。',
  },
  'victoria-bastion-jessica': {
    hardRequiredCovenants: ['维多利亚', '坚守'],
    softSupportCovenants: ['灵巧', '助力', '聚合'],
    criticalOperators: ['涤火杰西卡'],
    importantOperators: ['罗比菈塔', '白铁', '水灯心', '华法琳'],
    pivotTipWhenSoftBanned:
      '精准/奥术受限时可转3/6维多利亚与3坚守，灵巧、远见、助力按来牌补齐；聚合被Ban时需另补续航，并检查AOE、对空与Boss输出。',
  },
  'harmony-yan-victoria-chen': {
    hardRequiredCovenants: ['炎', '维多利亚', '灵巧', '坚守'],
    softSupportCovenants: ['调和', '聚合', '远见'],
    criticalOperators: ['仇白'],
    importantOperators: ['涤火杰西卡', '余', '华法琳', '缪尔赛思'],
    pivotTipWhenSoftBanned:
      '聚合受限时先核对存活成员，涤火杰西卡与余补阻挡，另补治疗。调和、转职与六阶终端实际取得后再接高本配置。',
  },
  'yan-bastion-chen-wang': {
    hardRequiredCovenants: ['炎', '聚合', '灵巧'],
    softSupportCovenants: ['坚守', '投资人'],
    criticalOperators: ['风絮'],
    importantOperators: ['余', '仇白', '华法琳', '假日威龙陈'],
    pivotTipWhenSoftBanned:
      '此卡为四本精锐风絮主线，余或仇白缺席时按已有输出和生存调整；火陈未到可用实际取得的精锐老鲤2技能。灵巧/聚合受限先核对存活组件，坚守与投资人按需，不保证核心按时到。',
  },
  'sargon-pozy-pepe-swift': {
    hardRequiredCovenants: ['萨尔贡', '迅捷'],
    softSupportCovenants: ['投资人', '灵巧', '精准'],
    criticalOperators: [],
    importantOperators: ['华法琳', '塞雷娅'],
    pivotTipWhenSoftBanned:
      '萨尔贡与迅捷可用时，按佩佩、鸿雪等来牌选择三萨混搭或六萨；精准/奥术受限时重新检查输出，不把迅捷层数等同于Boss伤害。',
  },
  'eunectes-precision-arcane-big-ugly': {
    hardRequiredCovenants: ['精准', '协防干员'],
    softSupportCovenants: ['灵巧', '奥术', '聚合', '奇迹', '远见'],
    criticalOperators: ['暴躁铁皮', '缪尔赛思'],
    importantOperators: ['霍尔海雅', '空弦', '渡桥'],
    pivotTipWhenSoftBanned:
      '二本通讯器给大丑追精锐，但不保证商店按时刷出；这是远见经济与五本碰缪尔赛思的转职线，区别于云迹奇迹长停二本。霍尔海雅受限时再核对空弦、渡桥与黑键。',
  },
  'leithanien-shapeshifter-standard': {
    hardRequiredCovenants: ['莱塔尼亚', '精准', '奥术'],
    softSupportCovenants: ['灵巧', '聚合', '奇迹', '远见'],
    criticalOperators: ['霍尔海雅'],
    importantOperators: ['暴躁铁皮', '缪尔赛思', '黑键', '空弦'],
    pivotTipWhenSoftBanned:
      '注意：变形者集群策略下【霍尔海雅】不能被Ban！若大丑被Ban可选杰西卡策略走纯莱塔尼亚术师/逻各斯终端。',
  },
  'fuzou-tier1-leithanien': {
    hardRequiredCovenants: ['莱塔尼亚', '精准', '奥术'],
    softSupportCovenants: ['聚合', '灵巧', '奇迹', '远见'],
    criticalOperators: ['霍尔海雅'],
    importantOperators: ['黑键', '空弦', '华法琳', '佩佩', '承曦格雷伊'],
    pivotTipWhenSoftBanned:
      '新版两页稿以莱塔尼亚与霍尔海雅可用为前提。华法琳/佩佩受限可放弃灵巧换治疗；空弦可换鸿雪/迷迭香；承曦受限在放弃灵巧、放弃三聚合或五本碰转职三条分支中择一。核心不满足则换其他路线。',
  },
  'minor-pact-dynasty-logos': {
    hardRequiredCovenants: ['精准', '奥术'],
    softSupportCovenants: ['灵巧', '远见', '奇迹'],
    criticalOperators: [],
    importantOperators: ['霍尔海雅', '空弦', '渡桥'],
    pivotTipWhenSoftBanned:
      '以精准、奥术稳场。缺灵巧补回转，缺远见保买牌钱；六阶逻各斯到手且有输出装再换主C。',
  },
  'ursus-gravel-machine': {
    hardRequiredCovenants: ['乌萨斯', '卡西米尔'],
    softSupportCovenants: ['不屈', '协防干员', '奇迹'],
    criticalOperators: ['砾', '暴躁铁皮'],
    importantOperators: ['塞雷娅'],
    pivotTipWhenSoftBanned:
      '核心依赖【砾】再部署与【卡西米尔+乌萨斯】转层机制；若卡西米尔或乌萨斯被Ban则无法启动自动沙砾机。',
  },
  'kazimierz-fartooth-6': {
    hardRequiredCovenants: ['卡西米尔'],
    softSupportCovenants: ['不屈', '精准', '迅捷'],
    criticalOperators: ['砾'],
    importantOperators: [],
    pivotTipWhenSoftBanned:
      '必须未禁用【卡西米尔】与【砾】；若精准被Ban可改挂不屈+迅捷，靠玛恩纳与耀骑士临光吃满6卡西米尔层数。',
  },
  'kjerag-permafrost-3': {
    hardRequiredCovenants: ['谢拉格', '远见'],
    softSupportCovenants: ['灵巧', '精准', '迅捷'],
    criticalOperators: ['空弦'],
    importantOperators: ['耶拉', '初雪'],
    pivotTipWhenSoftBanned:
      '空弦戴冰，初雪覆盖冻结区；寒檀只补远见，可换其他远见干员。空弦不可用且有机械师、格雷伊时，改走机械师控场线。',
  },
  'jessica-precision-arcane-foresight': {
    hardRequiredCovenants: ['精准'],
    softSupportCovenants: ['奥术', '聚合', '远见', '灵巧', '协防干员'],
    criticalOperators: [],
    importantOperators: ['空弦', '霍尔海雅', '黑键', '承曦格雷伊'],
    pivotTipWhenSoftBanned:
      '先核对仍可用的精准检索目标与叠层手；远见、渡桥和单个空弦都非硬条件。精准受限须核对剩余成员，精奥核心不足就换线；大盟约可选，聚合/协防或治疗缺口需补，不能只看层数。',
  },
};

export function evaluateCompUnderBans(
  comp: MetaCompGuide,
  banState: BanPickState
): CompBanEvaluation {
  const profile = COMP_BAN_PROFILES[comp.id];
  const bannedCovSet = new Set(banState.bannedCovenants);
  const bannedOpSet = new Set(banState.bannedOperators);

  let score = profile?.setupCheck ? 80 : 100;
  const blockedReasons: string[] = [];
  const safeHighlights: string[] = [];
  let coreUnavailable = false;

  if (isAegirGuide(comp.id) && bannedCovSet.has('灵巧') && bannedCovSet.has('突袭')) {
    score -= 25;
    blockedReasons.push('灵巧与突袭均受限，需另找攻速来源');
  }

  if (comp.id === 'chiave-leithanien-refresh' && !bannedCovSet.has('叙拉古')) {
    score -= 20;
    blockedReasons.push('尚未满足禁叙保莱的特殊卡池，不能预期贾维被动稳定给复奏；按普通精奥莱准备备选');
  }

  const papyrusLineBans = comp.id === 'papyrus-pairs-pivot'
    ? ['莱塔尼亚', '萨尔贡'].filter(name => bannedCovSet.has(name))
    : [];
  if (papyrusLineBans.length === 2) {
    score -= 55;
    coreUnavailable = true;
    blockedReasons.push('莱塔尼亚和萨尔贡均被禁，本卡两条出口都不可用');
  } else if (papyrusLineBans.length === 1) {
    blockedReasons.push(`主阵营【${papyrusLineBans[0]}】被禁，渡桥仅保留另一条出口`);
  }

  if (profile) {
    for (const hardCov of profile.hardRequiredCovenants) {
      if (bannedCovSet.has(hardCov)) {
        const isMainFaction = ALL_CORE_COVENANT_NAMES.some((name) => name === hardCov);
        score -= isMainFaction ? 55 : 25;
        coreUnavailable ||= isMainFaction;
        blockedReasons.push(isMainFaction
          ? `主阵营【${hardCov}】被禁`
          : `关键附加盟约【${hardCov}】受限，核对存活干员与转职`);
      } else {
        safeHighlights.push(`${hardCov}可用`);
      }
    }

    for (const softCov of profile.softSupportCovenants) {
      if (bannedCovSet.has(softCov)) {
        score -= 10;
        blockedReasons.push(`辅助词条【${softCov}】受限，检查替代组件`);
      } else {
        safeHighlights.push(`${softCov}可用`);
      }
    }

    for (const critOp of profile.criticalOperators) {
      if (bannedOpSet.has(critOp)) {
        score -= 55;
        coreUnavailable = true;
        blockedReasons.push(`绝对核心【${critOp}】被禁`);
      }
    }

    for (const impOp of profile.importantOperators) {
      if (bannedOpSet.has(impOp)) {
        score -= 18;
        blockedReasons.push(`关键卡【${impOp}】被禁`);
      }
    }
  }

  if (profile?.setupCheck) blockedReasons.push(profile.setupCheck);
  score = Math.max(0, Math.min(100, score));

  let status: 'optimal' | 'viable' | 'blocked' = 'optimal';
  let statusLabel = '关键禁用未命中';

  if (score >= 82) {
    status = 'optimal';
    statusLabel = score === 100 ? '适配100分 · 核心仍需看发牌' : `适配${score}分 · 优先考虑`;
  } else if (score >= 50) {
    status = 'viable';
    statusLabel = `适配${score}分 · 需调整组件`;
  } else {
    status = 'blocked';
    statusLabel = coreUnavailable ? `适配${score}分 · 核心被Ban` : `适配${score}分 · 构筑风险高`;
  }

  const pivotAdvice = profile
    ? profile.pivotTipWhenSoftBanned
    : '根据本局未禁用盟约灵活替换副羁绊。';

  return {
    comp,
    score,
    status,
    statusLabel,
    blockedReasons,
    safeHighlights: safeHighlights.slice(0, 4),
    pivotAdvice,
  };
}

export function rankCompsByBanState(
  comps: MetaCompGuide[],
  banState: BanPickState
): CompBanEvaluation[] {
  const evaluations = comps.map((c) => evaluateCompUnderBans(c, banState));
  return evaluations.sort((a, b) => b.score - a.score);
}

