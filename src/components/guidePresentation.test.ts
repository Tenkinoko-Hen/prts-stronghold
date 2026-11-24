// 青逝痕 Tenkinoko 制作
import test from 'node:test';
import assert from 'node:assert/strict';
import { META_COMPS } from '../data/strongholdData';
import { operatorAbilities } from './referenceData';
import { loadoutSummary, recommendedSkill, summarizeBlockedReasons } from './guidePresentation';

test('Skill recommendations follow the selected route and operator without guessing conditional variants', () => {
  assert.equal(recommendedSkill('fuzou-tier1-leithanien', '霍尔海雅'), 1);
  assert.equal(recommendedSkill('faith-mixer-fast-four', '霍尔海雅'), 2);
  assert.equal(recommendedSkill('fuzou-tier1-leithanien', '渡桥'), undefined);
  assert.equal(recommendedSkill('victoria-bastion-jessica', '涤火杰西卡'), undefined);
  assert.equal(recommendedSkill('faith-mixer-fast-four', '迷迭香'), undefined);
  assert.equal(recommendedSkill('yan-bison-shop-four', '仇白'), 1);
  assert.equal(recommendedSkill('yan-double-chen-low-tier', '霜叶'), 1);
  assert.equal(recommendedSkill('kjerag-gnosis-warfarin-swift', '华法琳'), undefined);
  assert.equal(recommendedSkill(undefined, '霍尔海雅'), undefined);
  for (const comp of META_COMPS) for (const [name, ability] of Object.entries(operatorAbilities)) {
    const skill = recommendedSkill(comp.id, name);
    if (skill !== undefined) assert(skill >= 1 && skill <= ability.skills.length, `${comp.id}: ${name}`);
  }
});

test('Ban summaries group support restrictions without disguising unavailable core requirements', () => {
  assert.equal(summarizeBlockedReasons(['辅助词条【聚合】受限，检查替代组件', '辅助词条【协防干员】受限，检查替代组件'], ''), '受限需替换：【聚合】【协防干员】');
  const result = summarizeBlockedReasons(['主阵营【炎】被禁', '绝对核心【风絮】被禁', '关键附加盟约【灵巧】受限，核对存活干员与转职', '辅助词条【投资人】受限，检查替代组件', '需要特殊卡池'], '');
  assert.equal(result, '阵营被禁：【炎】；核心被禁：【风絮】；关键受限：【灵巧】；受限需替换：【投资人】；需要特殊卡池');
  assert.equal(summarizeBlockedReasons(['主阵营【炎】被禁', '绝对核心【风絮】被禁', '额外构筑条件需要逐项核对，不把未满足的特殊卡池当作可以保证核心的来源'], ''), '阵营被禁：【炎】；核心被禁：【风絮】；另 1 项限制，点击查看');
  assert.equal(summarizeBlockedReasons([], '原有节奏'), '原有节奏');
});

test('Loadout summaries use the selected route and keep conditional equipment qualifiers', () => {
  const comp = (id: string) => META_COMPS.find(item => item.id === id)!;
  assert.match(loadoutSummary(comp('minor-pact-dynasty-logos')), /天马之翼.*佩尔森式.*双金狙击镜/);
  assert.match(loadoutSummary(comp('ursus-gravel-machine')), /砾.*红色注射器.*不屈弹射器/);
  assert.doesNotMatch(loadoutSummary(comp('ursus-gravel-machine')), /天马之翼/);
  assert.match(loadoutSummary(comp('sargon-pozy-pepe-swift')), /转职到手再给/);
  for (const item of META_COMPS) assert(loadoutSummary(item).length <= 60, `${item.id}: summary too long`);
});
