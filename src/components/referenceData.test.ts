import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { META_COMPS, SUB_COVENANT_GUIDES, TACTICAL_MAPS } from '../data/strongholdData';
import { AEGIR_REFERENCES, AEGIR_SOURCES, aegirMapReferences, aegirImageUrl } from '../data/aegirReferences';
import { AEGIR_HUNTERS_ID, AEGIR_PITH_ID } from '../data/aegirErosion';
import { recommendedSkill } from './guidePresentation';
import { evaluateCompUnderBans, getRecommendedPaceForRound, isCovenantRecommendedForComp } from '../utils/tacticalLogic';
import { baseTalentsFor, covenantEffects, modeOperators, operatorAbilities, reference, referenceNames, strategiesFor, trainingState } from './referenceData';

test('Every named lineup operator has offline abilities, skill levels and covenant effects', () => {
  assert.equal(Object.keys(modeOperators).length, 143);
  assert.equal(Object.keys(operatorAbilities).length, 145);
  assert.equal(Object.keys(covenantEffects).length, 26);
  for (const comp of META_COMPS) for (const phase of comp.phases) for (const op of [...phase.fieldOperators, ...phase.benchOperators]) {
    const names = referenceNames(op.name);
    assert(names.length, `${comp.id}: ${op.name}`);
    for (const name of names) {
      const ability = operatorAbilities[name];
      assert(ability.talents.length, name);
      assert(ability.skills.length, name);
      assert.equal(new Set(ability.skills.map(s => s.name)).size, ability.skills.length, name);
      for (const skill of ability.skills) for (const level of ['4', '7']) assert(skill.levels.some(row => row[0] === level && row[1]), `${name} ${skill.name} ${level}`);
      for (const cov of modeOperators[name]?.covenants || []) assert(covenantEffects[cov], cov);
    }
  }
  assert.deepEqual(referenceNames('任意一阶对子'), []);
  assert.deepEqual(referenceNames('暴躁铁皮'), ['暴躁铁皮']);
  assert.deepEqual(referenceNames('风絮/仇白'), ['风絮', '仇白']);
  assert.equal(modeOperators['假日威龙陈'], undefined);
});

test('Mode training distinguishes first tiers, elite skill level and module conditions', () => {
  assert.deepEqual(trainingState(modeOperators['野鬃'], false), {promotion:1,level:55,skill:'4',module:0});
  assert.deepEqual(trainingState(modeOperators['承曦格雷伊'], true), {promotion:2,level:55,skill:'7',module:1});
  assert.deepEqual(trainingState(modeOperators['风絮'], false), {promotion:2,level:1,skill:'4',module:0});
  assert.deepEqual(trainingState(modeOperators['逻各斯'], true), {promotion:2,level:60,skill:'7',module:3});
  assert.equal(trainingState(undefined, true), null);
  assert.match(modeOperators['风絮'].normal, /16层/);
  assert.match(modeOperators['风絮'].elite, /32层/);
});

test('Renamed talents replace their earlier versions while unchanged talents remain', () => {
  assert.deepEqual(baseTalentsFor('砾',1).map(r=>r[0]),['快速部署']);
  assert.deepEqual(baseTalentsFor('砾',2).map(r=>r[0]),['小个子支援']);
  assert.deepEqual(baseTalentsFor('幽灵鲨',2).map(r=>r[0]),['深海再生力']);
  assert.deepEqual(baseTalentsFor('瑕光',2).map(r=>r[0]),['剑盾骑士','仁慈']);
  assert.deepEqual(baseTalentsFor('魔王',2).map(r=>r[0]),['过往尘埃','魔王残响']);
});

test('Strategy portraits resolve actual initiators and keep generic choices unassigned', () => {
  assert.equal(reference.strategies.length,61);
  for (const strategy of reference.strategies) assert(existsSync(new URL(`../../public${strategy.image}`, import.meta.url)),strategy.image);
  assert.deepEqual(strategiesFor('任意策略家'), []);
  assert.deepEqual(strategiesFor('杜遥夜（火陈外援）').map(s=>s.name), ['杜遥夜']);
  assert.deepEqual(strategiesFor('变形者集群(复奏) / 杰西卡').map(s=>s.name), ['变形者集群','杰西卡']);
  assert.deepEqual(strategiesFor('铃兰 · 御守之力').map(s=>s.title), ['御守之力']);
  const mechanist = META_COMPS.find(comp => comp.id === 'kjerag-mechanist-greyy')!;
  assert.deepEqual(strategiesFor(mechanist.strategist).map(s => s.title), ['精巧设计']);
});

test('New strategies stay separate with viable eight-slot main phases and Ban dependencies', () => {
  const bison=META_COMPS.find(c=>c.id==='yan-bison-shop-four')!;
  const suzuran=META_COMPS.find(c=>c.id==='suzuran-low-tier-acquisition')!;
  assert.equal(evaluateCompUnderBans(bison,{bannedCovenants:['炎'],bannedOperators:[]}).status,'blocked');
  assert.equal(evaluateCompUnderBans(suzuran,{bannedCovenants:[],bannedOperators:['承曦格雷伊']}).status,'blocked');
  assert.equal(evaluateCompUnderBans(suzuran,{bannedCovenants:['迅捷'],bannedOperators:[]}).status,'optimal');
  for(const comp of [bison,suzuran]) {
    assert(comp.phases.every(p=>p.fieldOperators.length<=8));
    assert.equal(comp.roundPace.length,15);
    if (comp === bison) {
      assert.deepEqual(comp.roundPace.slice(0,6).map(r=>r.tier),[1,1,2,3,3,4]);
      assert.match(comp.roundPace[4].action,/拜松/);
    }
    assert(comp.roundPace.slice(comp === bison ? 6 : 0).every(r=>r.action.startsWith('【推导】')));
    assert(isCovenantRecommendedForComp(SUB_COVENANT_GUIDES.find(c=>c.id==='sub-dexterous')!,comp));
    assert.equal(getRecommendedPaceForRound(comp,1).activePhaseName,comp.phases[0].phaseName);
    assert.equal(getRecommendedPaceForRound(comp,7).activePhaseName,comp.phases[1].phaseName);
    assert.equal(getRecommendedPaceForRound(comp,15).activePhaseName,comp.phases[2].phaseName);
  }
  assert(!suzuran.covenants.some(c=>/炎|投资人|迅捷/.test(c)));
});

test('Aegir guide has all five sources offline; current-map results exclude other stages and case studies', () => {
  assert.equal(AEGIR_REFERENCES.length, 39);
  assert.equal(new Set(AEGIR_REFERENCES.map(item => item.id)).size, AEGIR_REFERENCES.length);
  assert.deepEqual(new Set(AEGIR_REFERENCES.map(item => item.source)), new Set(Object.keys(AEGIR_SOURCES)));
  for (const item of AEGIR_REFERENCES) {
    assert(existsSync(new URL(`../../public${aegirImageUrl(item.id)}`, import.meta.url)), item.id);
    assert(item.location && item.note, item.id);
    if (item.mapId) assert(TACTICAL_MAPS.some(map => map.id === item.mapId), item.id);
  }
  assert.deepEqual(aegirMapReferences('desert-1', '道中').map(item => item.round), [5, 6, 6, 7, 10, 11]);
  assert.deepEqual(aegirMapReferences('desert-1', 'Boss战').map(item => item.id), ['m21', 'm22']);
  assert.deepEqual(aegirMapReferences('desert-3', 'Boss战').map(item => item.id), ['s03', 's12']);
  assert.deepEqual(aegirMapReferences('desert-2', 'Boss战'), []);
  assert.equal(AEGIR_REFERENCES.find(item => item.id === 's09')?.purpose, '纠偏');
});

test('Aegir strategies have separate operating plans and manual terminal phases', () => {
  const pith = META_COMPS.find(comp => comp.id === AEGIR_PITH_ID)!;
  const gladiia = META_COMPS.find(comp => comp.id === AEGIR_HUNTERS_ID)!;
  assert.deepEqual(strategiesFor(pith.strategist).map(s => s.name), ['Pith']);
  assert.deepEqual(strategiesFor(gladiia.strategist).map(s => s.name), ['歌蕾蒂娅']);
  assert.deepEqual([2, 4, 6, 8, 10].map(round => getRecommendedPaceForRound(gladiia, round).recommendedTier), [2, 3, 4, 5, 6]);
  assert.match(gladiia.roundPace[5].action, /四本开调度/);
  assert(!pith.roundPace.some(item => /四本开调度/.test(item.action)));
  for (const comp of [pith, gladiia]) {
    assert.deepEqual(comp.roundPace.map(item => item.round), Array.from({ length: 15 }, (_, i) => i + 1));
    assert.equal(getRecommendedPaceForRound(comp, 15).activePhaseName, comp.phases[1].phaseName);
    assert.equal(recommendedSkill(comp.id, '克莱门莎'), 2);
    assert.equal(recommendedSkill(comp.id, '魔王'), 2);
    assert.equal(evaluateCompUnderBans(comp, { bannedCovenants: ['阿戈尔'], bannedOperators: [] }).status, 'blocked');
    assert.equal(evaluateCompUnderBans(comp, { bannedCovenants: ['精准', '奥术'], bannedOperators: [] }).score, 100);
    assert.equal(evaluateCompUnderBans(comp, { bannedCovenants: ['灵巧', '突袭'], bannedOperators: [] }).status, 'viable');
  }
});
