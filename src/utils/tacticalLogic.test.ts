import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { COMMUNITY_COMPS } from '../data/communityComps';
import {
  calculateStackingProjection,
  directionToRadians,
  evaluateCompUnderBans,
  extractConciseEffectBadges,
  filterCovenantGuides,
  getRecommendedPaceForRound,
  getStageRiskSummary,
  IMAGE3_DEFAULT_BAN_STATE,
  isCovenantRecommendedForComp,
  isInsideBossDangerZone,
  rankCompsByBanState,
} from './tacticalLogic';
import {
  ALL_CORE_COVENANT_NAMES,
  ALL_SUB_COVENANT_NAMES,
  COVENANT_GUIDES,
  COVENANT_SHORT_DESCRIPTIONS,
  META_COMPS,
  SUB_COVENANT_GUIDES,
  TACTICAL_MAPS,
  TRANSFER_ITEM_RECIPES,
  UNIVERSAL_STACKERS,
  BAN_SENSITIVE_OPERATORS,
  UPLOADED_GALLERY_ITEMS,
} from '../data/strongholdData';
import { PRTS_OPERATOR_TIERS, resolveOperatorAvatars } from '../data/prtsAvatars';

test('directionToRadians maps Arknights arrows to exact yaw angles', () => {
  assert.deepEqual(directionToRadians('→'), { primaryYaw: 0, secondaryYaw: null });
  assert.deepEqual(directionToRadians('↓'), { primaryYaw: -Math.PI / 2, secondaryYaw: null });
  assert.deepEqual(directionToRadians('↑'), { primaryYaw: Math.PI / 2, secondaryYaw: null });
  assert.deepEqual(directionToRadians('←'), { primaryYaw: Math.PI, secondaryYaw: null });
  assert.deepEqual(directionToRadians('→↓'), { primaryYaw: 0, secondaryYaw: -Math.PI / 2 });
});

test('isInsideBossDangerZone and getStageRiskSummary accurately analyze tactical layouts', () => {
  const desert1Boss = TACTICAL_MAPS[0].bossStage;
  assert.equal(isInsideBossDangerZone(6, 2, desert1Boss.bossDangerZone), true);
  assert.equal(isInsideBossDangerZone(3, 2, desert1Boss.bossDangerZone), false);

  const summary = getStageRiskSummary(desert1Boss);
  assert.equal(summary.totalOperators, 8);
  assert.equal(summary.defenderCount, 1);
  assert.equal(summary.medicCount, 1);
  assert.equal(summary.dpsCount, 6);
});

test('calculateStackingProjection computes Saria clone, Mon3tr cap, and Amiya uncapped bonus', () => {
  const result = calculateStackingProjection({
    activeFieldIds: ['pallas', 'saria', 'mon3tr', 'amiya', 'warfarin'],
    activeBenchIds: ['astgenne', 'quercus'],
    frontTargetSellPrice: 6,
    combatTriggerCount: 10,
    baseStacksPerTrigger: 3,
    baseCombatCap: 20,
    rounds: 5,
  });

  assert.equal(result.restPhaseStacksPerRound, 78);
  assert.equal(result.effectiveCombatCap, 32);
  assert.equal(result.combatStacksPerRound, 64);
  assert.equal(result.totalStacksPerRound, 142);
  assert.equal(result.projectedTotalStacks, 710);
  assert.equal(result.foresight80Unlocked, true);
  assert.equal(result.foresight190Unlocked, true);
});

test('getRecommendedPaceForRound resolves exact round pace for Ursus Eunectes Gravel comp', () => {
  const ursusComp = META_COMPS[0];
  const r2 = getRecommendedPaceForRound(ursusComp, 2);
  assert.equal(r2.recommendedTier, 2);

  const r6 = getRecommendedPaceForRound(ursusComp, 6);
  assert.equal(r6.recommendedTier, 2);

  const r10 = getRecommendedPaceForRound(ursusComp, 10);
  assert.equal(r10.recommendedTier, 5);
});

test('filterCovenantGuides filters by current MetaComp priority covenants and user favorites', () => {
  const ursusGravelComp = META_COMPS[0]; // 3卡西米尔, 3乌萨斯
  assert.equal(
    isCovenantRecommendedForComp(COVENANT_GUIDES[0], ursusGravelComp),
    true
  ); // ursus
  assert.equal(
    isCovenantRecommendedForComp(COVENANT_GUIDES[1], ursusGravelComp),
    true
  ); // kazimierz
  assert.equal(
    isCovenantRecommendedForComp(COVENANT_GUIDES[2], ursusGravelComp),
    false
  ); // iberia

  const priorityOnly = filterCovenantGuides(COVENANT_GUIDES, {
    onlyCurrentCompPriority: true,
    activeComp: ursusGravelComp,
    onlyFavorites: false,
    favoriteIds: [],
  });
  assert.deepEqual(
    priorityOnly.map((c) => c.id),
    ['ursus', 'kazimierz']
  );

  const favAndPriority = filterCovenantGuides(COVENANT_GUIDES, {
    onlyCurrentCompPriority: true,
    activeComp: ursusGravelComp,
    onlyFavorites: true,
    favoriteIds: ['kazimierz', 'yan'],
  });
  assert.deepEqual(
    favAndPriority.map((c) => c.id),
    ['kazimierz']
  );
});

test('extractConciseEffectBadges extracts scannable trigger and stack badges', () => {
  const gravelBadges = extractConciseEffectBadges(
    '<战斗中>部署时使已激活的【卡西米尔】【不屈】层数+2/4（每场至多12/24层）'
  );
  assert.equal(gravelBadges.triggerBadge, '战斗中');
  assert.equal(gravelBadges.valueBadge, '+2/4层');
});

test('rankCompsByBanState retains viable pivots and blocks banned main factions under Image 3 bans', () => {
  assert.equal(SUB_COVENANT_GUIDES.length, 14);
  assert.equal(META_COMPS.length, 34);

  const ranked = rankCompsByBanState(META_COMPS, IMAGE3_DEFAULT_BAN_STATE);
  for (const id of ['victoria-bastion-jessica', 'harmony-yan-victoria-chen', 'yan-bastion-chen-wang', 'sargon-pozy-pepe-swift']) {
    assert.notEqual(ranked.find((r) => r.comp.id === id)!.status, 'blocked');
  }
  assert.ok(ranked.every((item, i) => i === 0 || ranked[i - 1].score >= item.score));
  assert.equal(ranked[0].status, 'optimal');

  const leithanienEval = ranked.find((r) => r.comp.id === 'leithanien-shapeshifter-standard')!;
  assert.equal(leithanienEval.status, 'blocked');

  const hoolBan = evaluateCompUnderBans(
    META_COMPS.find((c) => c.id === 'leithanien-shapeshifter-standard')!,
    { bannedCovenants: [], bannedOperators: ['霍尔海雅'] }
  );
  assert.equal(hoolBan.score, 45);
  assert.equal(hoolBan.status, 'blocked');
});

test('Community routes distinguish main-faction bans from restricted secondary covenants', () => {
  const cases = [
    ['faith-mixer-fast-four', '奥术', null, 'viable'],
    ['faith-mixer-fast-four', '莱塔尼亚', null, 'blocked'],
    ['siracusa-precision-six', '叙拉古', '伺夜', 'blocked'],
    ['siracusa-bastion-roberta', '叙拉古', '贝洛内', 'blocked'],
    ['yan-double-chen-low-tier', '炎', '假日威龙陈', 'blocked'],
    ['eunectes-two-tier-scopes', '灵巧', '暴躁铁皮', 'viable'],
    ['ursus-arcane-talulah', '乌萨斯', null, 'blocked'],
    ['sargon-precision-arcane-three', '萨尔贡', '鸿雪', 'blocked'],
    ['kjerag-gnosis-warfarin-swift', '迅捷', '灵知', 'viable'],
    ['iberia-precision-thorns', '伊比利亚', null, 'blocked'],
    ['iberia-bluepoison-six', '伊比利亚', '蓝毒', 'blocked'],
    ['kazimierz-gavial-blemishine', '卡西米尔', '玛恩纳', 'blocked'],
    ['yan-suzuran-honeysuckle-economy', '叙拉古', '忍冬', 'blocked'],
  ];
  for (const [id, covenant, operator, status] of cases) {
    const comp = COMMUNITY_COMPS.find((c) => c.id === id)!;
    assert.equal(evaluateCompUnderBans(comp, { bannedCovenants: [covenant!], bannedOperators: [] }).status, status);
    if (operator) assert.equal(evaluateCompUnderBans(comp, { bannedCovenants: [], bannedOperators: [operator] }).status, 'blocked');
    const optionalCovenant = id === 'iberia-bluepoison-six' ? '奥术' : '灵巧';
    assert.notEqual(evaluateCompUnderBans(comp, { bannedCovenants: [optionalCovenant], bannedOperators: [] }).status, 'blocked');
  }
  const iberia = COVENANT_GUIDES.find((c) => c.id === 'iberia')!;
  for (const comp of COMMUNITY_COMPS.filter((c) => c.id.startsWith('iberia-'))) {
    assert.equal(isCovenantRecommendedForComp(iberia, comp), true);
  }
  assert.notEqual(evaluateCompUnderBans(COMMUNITY_COMPS.find((c) => c.id === 'iberia-precision-thorns')!, { bannedCovenants: [], bannedOperators: ['棘刺'] }).status, 'blocked');
  const restricted = evaluateCompUnderBans(COMMUNITY_COMPS.find((c) => c.id === 'iberia-bluepoison-six')!, { bannedCovenants: ['灵巧'], bannedOperators: [] });
  assert.equal(restricted.status, 'viable');
  assert.ok(restricted.blockedReasons.some((reason) => reason.includes('核对存活干员')));
  assert.equal(restricted.statusLabel.includes('%'), false);
});

test('Community data uses canonical tiers and shipped source images', () => {
  assert.equal(UPLOADED_GALLERY_ITEMS.length, 86);
  assert.equal(new Set(UPLOADED_GALLERY_ITEMS.map((item) => item.id)).size, UPLOADED_GALLERY_ITEMS.length);
  for (const item of UPLOADED_GALLERY_ITEMS) {
    assert.ok(existsSync(new URL(`../../public${item.url}`, import.meta.url)), item.url);
  }
  assert.equal(new Set(META_COMPS.map((c) => c.id)).size, META_COMPS.length);
  for (const comp of META_COMPS) {
    assert.ok(existsSync(new URL(`../../public${comp.imageUrl}`, import.meta.url)), comp.imageUrl);
    if (comp.secondaryImageUrl) assert.ok(existsSync(new URL(`../../public${comp.secondaryImageUrl}`, import.meta.url)), comp.secondaryImageUrl);
    for (const phase of comp.phases) {
      for (const op of [...phase.fieldOperators, ...phase.benchOperators]) {
        assert.equal(op.tier, PRTS_OPERATOR_TIERS[op.name], `${comp.id}: ${op.name}`);
      }
    }
    for (let i = 1; i < comp.roundPace.length; i++) {
      assert.ok(comp.roundPace[i].round > comp.roundPace[i - 1].round);
    }
  }
});

test('Every route covers R1 through R15 with explicit conditional advice', () => {
  for (const comp of META_COMPS) {
    assert.deepEqual(comp.roundPace.map((step) => step.round), Array.from({ length: 15 }, (_, i) => i + 1), comp.id);
    assert.equal(getRecommendedPaceForRound(comp, 1).recommendedTier, 1, comp.id);
    for (const step of comp.roundPace) {
      assert.ok(step.tier >= 1 && step.tier <= 6, comp.id);
      assert.equal(getRecommendedPaceForRound(comp, step.round).currentAction, step.action, comp.id);
    }
  }
  for (const id of ['kjerag-gnosis-warfarin-swift', 'iberia-precision-thorns', 'iberia-bluepoison-six', 'yan-suzuran-honeysuckle-economy']) {
    assert.ok(META_COMPS.find((comp) => comp.id === id)!.roundPace.every((step) => step.action.startsWith('【推导】')), id);
  }
  const victoria = META_COMPS.find((comp) => comp.id === 'victoria-bastion-jessica')!;
  assert.equal(getRecommendedPaceForRound(victoria, 12).recommendedTier, 4);
  assert.ok(getRecommendedPaceForRound(victoria, 12).currentAction.includes('四本能稳住可收束'));
});

test('Every scored operator can be marked, and all stages fit the eight deployment slots', () => {
  const available = new Set<string>(BAN_SENSITIVE_OPERATORS.map(op => op.name));
  for (const comp of META_COMPS) {
    assert(comp.phases.every(p => p.fieldOperators.length <= 8), comp.id);
    const score = evaluateCompUnderBans(comp, {bannedCovenants: [], bannedOperators: []}).score;
    for (const name of [...Object.keys(PRTS_OPERATOR_TIERS), '假日威龙陈']) {
      if (evaluateCompUnderBans(comp,{bannedCovenants: [], bannedOperators: [name]}).score < score)
        assert(available.has(name), `${comp.id}: ${name}`);
    }
  }
});

test('Conditional pivots and phase transitions follow the current lineup, even before a scan', () => {
  const route = (id: string) => META_COMPS.find(c=>c.id===id)!;
  const score = (id: string, bannedCovenants: string[], bannedOperators: string[]=[]) =>
    evaluateCompUnderBans(route(id), {bannedCovenants,bannedOperators});
  const ranked = rankCompsByBanState(META_COMPS,{bannedCovenants:[],bannedOperators:[]});
  assert(ranked.every((r,i)=>!i || ranked[i-1].score>=r.score));
  assert.equal(score('harmony-yan-victoria-chen',[],['假日威龙陈']).score,100);
  for(const id of ['kazimierz-fartooth-6','sargon-pozy-pepe-swift','yan-bison-shop-four']){
    assert.equal(getRecommendedPaceForRound(route(id),5).activePhaseName,route(id).phases[0].phaseName);
    assert.equal(getRecommendedPaceForRound(route(id),6).activePhaseName,route(id).phases[1].phaseName);
  }
  const id='aegir-clemencia-erosion';
  assert.equal(score(id,['阿戈尔']).status,'blocked');
  assert.equal(score(id,[],['克莱门莎']).status,'blocked');
  assert.equal(score(id,['灵巧']).score,100);
  assert.equal(score(id,['突袭','灵巧']).status,'viable');
  assert.equal(getRecommendedPaceForRound(route(id),15).activePhaseName,route(id).phases[1].phaseName);
});

test('Separated slow Yan route has independent bans and does not auto-select its conditional endgame', () => {
  const comp = META_COMPS.find(c => c.id === 'yan-slow-six-convergence')!;
  assert.equal(evaluateCompUnderBans(comp, {bannedCovenants: [], bannedOperators: ['华法琳']}).status, 'blocked');
  assert.equal(evaluateCompUnderBans(comp, {bannedCovenants: [], bannedOperators: ['假日威龙陈']}).status, 'optimal');
  for (const round of [6, 10, 12, 15]) {
    assert.equal(getRecommendedPaceForRound(comp, round).activePhaseName, '四本炎灵巧底座');
  }
  assert.ok(comp.phases.at(-1)!.fieldOperators.some(op => op.name === '黍'));
  assert.equal(comp.phases.at(-1)!.fieldOperators.filter(op => op.name === '假日威龙陈').length, 1);
});

test('Four-tier routes keep automatic guide and picker previews on their normal roster', () => {
  for (const id of ['victoria-bastion-jessica', 'kjerag-permafrost-3', 'minor-pact-dynasty-logos', 'harmony-yan-victoria-chen']) {
    const comp = META_COMPS.find(c => c.id === id)!;
    const phase = comp.phases.find(p => p.phaseName === getRecommendedPaceForRound(comp, 15).activePhaseName)!;
    assert.notEqual(phase, comp.phases.at(-1), id);
    assert.ok(phase.fieldOperators.every(op => !['V', 'VI'].includes(op.tier)), id);
    assert.ok(comp.phases.at(-1)!.fieldOperators.some(op => op.tier === 'VI'), id);
  }
});

test('Faith mixer follows explicit ranges and does not infer when its core is complete', () => {
  const comp = COMMUNITY_COMPS.find((c) => c.id === 'faith-mixer-fast-four')!;
  const advice = getRecommendedPaceForRound(comp, 5);
  assert.equal(advice.recommendedTier, 4);
  assert.equal(advice.activePhaseName, '三本碰核心、四本找莱塔');
  assert.ok(advice.currentAction.includes('资金到位'));
  for (const round of [6, 9, 10, 15]) {
    assert.equal(getRecommendedPaceForRound(comp, round).activePhaseName, '三本碰核心、四本找莱塔');
  }
});

test('Low-tier routes retain their main phase until the player chooses conditional support', () => {
  for (const [id, tier, phase] of [
    ['eunectes-two-tier-scopes', 2, '二本云迹经济与双大丑'],
    ['yan-bastion-chen-wang', 4, '四本风絮与策略输出'],
    ['kjerag-permafrost-3', 4, '四本远见空弦冻控'],
  ] as const) {
    const comp = META_COMPS.find(item => item.id === id)!;
    for (const round of [10, 11, 12, 13, 14, 15]) {
      const advice = getRecommendedPaceForRound(comp, round);
      assert.equal(advice.recommendedTier, tier, `${id} R${round}`);
      assert.equal(advice.activePhaseName, phase, `${id} R${round}`);
    }
  }
});

test('Updated Ban rules distinguish pure scope economy from optional Yan support', () => {
  const scopes = META_COMPS.find(item => item.id === 'eunectes-two-tier-scopes')!;
  for (const operator of ['承曦格雷伊', '云迹', '暴躁铁皮']) {
    assert.equal(evaluateCompUnderBans(scopes, { bannedCovenants: [], bannedOperators: [operator] }).status, 'blocked');
  }
  const restricted = evaluateCompUnderBans(scopes, { bannedCovenants: ['奇迹'], bannedOperators: [] });
  assert.equal(restricted.status, 'viable');
  assert.ok(restricted.blockedReasons.some(reason => reason.includes('核对存活干员')));
  const yan = META_COMPS.find(item => item.id === 'yan-bastion-chen-wang')!;
  for (const operator of ['余', '仇白', '假日威龙陈']) {
    assert.notEqual(evaluateCompUnderBans(yan, { bannedCovenants: [], bannedOperators: [operator] }).status, 'blocked');
  }
  assert.equal(evaluateCompUnderBans(yan, { bannedCovenants: [], bannedOperators: ['风絮'] }).status, 'blocked');
});

test('Mechanist control and the no-precision/no-arcane pivots are ranked by their own requirements', () => {
  const bans = { bannedCovenants: ['精准', '奥术'], bannedOperators: [] };
  const ranked = rankCompsByBanState(META_COMPS, bans);
  const find = (id: string) => ranked.find(item => item.comp.id === id)!;
  for (const id of ['kjerag-mechanist-greyy', 'yan-bison-shop-four', 'yan-bastion-chen-wang', 'victoria-bastion-jessica', 'aegir-clemencia-erosion']) {
    assert.equal(find(id).score, 100, id);
    assert(ranked.indexOf(find(id)) < ranked.indexOf(find('kjerag-snowhunter-precision-swift')), id);
  }
  const { comp } = find('kjerag-mechanist-greyy');
  assert.equal(evaluateCompUnderBans(comp, { ...bans, bannedCovenants: ['谢拉格'] }).status, 'blocked');
  assert.equal(evaluateCompUnderBans(comp, { ...bans, bannedCovenants: [...bans.bannedCovenants, '灵巧'] }).status, 'viable');
  assert.equal(evaluateCompUnderBans(comp, { ...bans, bannedOperators: ['承曦格雷伊'] }).status, 'blocked');
  assert.equal(evaluateCompUnderBans(comp, { ...bans, bannedOperators: ['空弦', '灵知', '圣聆初雪'] }).score, 100);
  const archetto = find('kjerag-permafrost-3').comp;
  assert.equal(evaluateCompUnderBans(archetto, { ...bans, bannedOperators: ['空弦'] }).status, 'blocked');
  assert.equal(evaluateCompUnderBans(archetto, { ...bans, bannedOperators: ['寒檀'] }).score, find(archetto.id).score);
  for (const [round, phase] of [[5, 0], [6, 1], [9, 1], [10, 2], [15, 2]]) {
    assert.equal(getRecommendedPaceForRound(comp, round).activePhaseName, comp.phases[phase].phaseName);
  }
});

test('TRANSFER_ITEM_RECIPES and COVENANT_SHORT_DESCRIPTIONS cover all 18 synthesis formulas and 26 covenants', () => {
  assert.equal(TRANSFER_ITEM_RECIPES.length, 18);
  assert.equal(
    TRANSFER_ITEM_RECIPES.filter((r) => r.category === '核心盟约转职').length,
    10
  );
  assert.equal(
    TRANSFER_ITEM_RECIPES.filter((r) => r.category === '附加盟约转职').length,
    8
  );
  assert.equal(TRANSFER_ITEM_RECIPES.filter((r) => r.isNew).length, 5);

  for (const cov of [...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES]) {
    assert.ok(
      COVENANT_SHORT_DESCRIPTIONS[cov] &&
        COVENANT_SHORT_DESCRIPTIONS[cov].length > 0,
      `Missing short description for covenant: ${cov}`
    );
  }
});

test('All operators across META_COMPS, COVENANT_GUIDES, SUB_COVENANT_GUIDES, UNIVERSAL_STACKERS, and BAN_SENSITIVE_OPERATORS resolve to valid PRTS avatars and canonical tiers', () => {
  const allOperatorNames = new Set<string>();

  for (const comp of META_COMPS) {
    for (const phase of comp.phases) {
      for (const op of phase.fieldOperators) allOperatorNames.add(op.name);
      for (const op of phase.benchOperators) allOperatorNames.add(op.name);
    }
  }
  for (const cov of [...COVENANT_GUIDES, ...SUB_COVENANT_GUIDES]) {
    for (const op of cov.operators) allOperatorNames.add(op.name);
  }
  for (const st of UNIVERSAL_STACKERS) {
    allOperatorNames.add(st.name);
  }
  for (const b of BAN_SENSITIVE_OPERATORS) {
    allOperatorNames.add(b.name);
  }
  for (const r of TRANSFER_ITEM_RECIPES) {
    for (const op of r.freeSourceOperators) allOperatorNames.add(op);
    for (const op of r.bestRecipients) allOperatorNames.add(op);
  }
  for (const m of TACTICAL_MAPS) {
    for (const p of [...m.midStage.placements, ...m.bossStage.placements]) {
      for (const op of p.recommendedOps) allOperatorNames.add(op);
    }
  }

  for (const name of allOperatorNames) {
    const resolved = resolveOperatorAvatars(name);
    assert.ok(resolved.length > 0, `Failed to resolve operator: ${name}`);
    assert.ok(
      resolved[0].avatarUrl && resolved[0].avatarUrl.startsWith('/assets/avatars/'),
      `Missing PRTS avatar URL for operator: ${name}`
    );
    assert.ok(existsSync(new URL(`../../public${resolved[0].avatarUrl}`, import.meta.url)), `Missing offline avatar: ${name}`);
    assert.ok(
      resolved[0].canonicalTier,
      `Missing canonical PRTS tier for operator: ${name}`
    );
  }
});




test('Jessica precision route keeps early economy and does not require optional foresight operators', () => {
  const comp = META_COMPS.find(comp => comp.id === 'jessica-precision-arcane-foresight')!;
  assert.deepEqual([2,3,4,9,15].map(round => getRecommendedPaceForRound(comp, round).recommendedTier), [1,2,3,4,4]);
  for (const bannedOperators of [['渡桥'], ['空弦'], ['渡桥', '空弦']]) {
    const result = evaluateCompUnderBans(comp, { bannedCovenants: ['远见'], bannedOperators });
    assert.notEqual(result.status, 'blocked');
    assert(!result.blockedReasons.some(reason => reason.includes('绝对核心')));
  }
  assert.notEqual(evaluateCompUnderBans(comp, { bannedCovenants: ['莱塔尼亚'], bannedOperators: [] }).status, 'blocked');
  assert.equal(getRecommendedPaceForRound(comp, 15).activePhaseName, comp.phases[2].phaseName);
});

test('New source branches preserve survival and optional terminal conditions', () => {
  const iberia = META_COMPS.find(comp => comp.id === 'iberia-bastion-three-tier')!;
  const snow = META_COMPS.find(comp => comp.id === 'kjerag-snowhunter-precision-swift')!;
  assert.equal(evaluateCompUnderBans(iberia, {bannedCovenants: ['精准'], bannedOperators: []}).score, 100);
  assert.equal(evaluateCompUnderBans(iberia, {bannedCovenants: [], bannedOperators: ['旅骨']}).status, 'blocked');
  assert.equal(evaluateCompUnderBans(snow, {bannedCovenants: [], bannedOperators: ['雪猎']}).status, 'blocked');
  assert.deepEqual([2,4,8,10,15].map(round => getRecommendedPaceForRound(iberia, round).recommendedTier), [2,3,3,4,4]);
  assert.equal(getRecommendedPaceForRound(iberia,15).activePhaseName, iberia.phases[2].phaseName);
  assert(snow.equipmentTips.some(tip => tip.includes('雪猎2技能')));
});
