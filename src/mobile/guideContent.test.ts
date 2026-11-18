import assert from 'node:assert/strict';
import test from 'node:test';
import { META_COMPS } from '../data/strongholdData';
import { mentionedOperators, roundOperators, loadoutTags } from './guideContent';
import { emptySession, mobileReducer, restoreSession } from './mobileSession';
import { parseCovenantScan } from './covenantScan';

test('回合指令匹配完整干员姓名，区分奶羊与小羊，不把余钱当干员', () => {
  assert.deepEqual(['纯烬艾雅法拉', '艾雅法拉', '砾'], mentionedOperators('纯烬艾雅法拉治疗，小羊输出；有余钱再买砾。'));
  const comp = META_COMPS.find(comp => comp.id === 'ursus-gravel-machine')!;
  const ops = roundOperators(comp, comp.phases[0], '抓砾、折桠与野鬃');
  assert.deepEqual(['砾', '折桠', '野鬃'], ops.map(op => op.name));
  assert.equal('II', ops[0].tier);
  assert(loadoutTags(ops[0]).includes('带1技能'));
  assert(loadoutTags(ops[0]).includes('下掉模组'));
  assert.equal('绑定注射器+弹射器', loadoutTags(ops[0])[0]);
});

test('校正受限标签立即影响条件，未识别项保留未确认，刷新不丢标记', () => {
  const scan = parseCovenantScan(JSON.stringify({ id: 'partial', status: 'incomplete', message: '未读全', bannedCovenants: ['炎'], seenCovenants: ['炎', '萨尔贡'] }))!;
  let state = mobileReducer(emptySession(), { type: 'applyScan', scan });
  state = mobileReducer(state, { type: 'ban', group: 'bannedCovenants', name: '炎' });
  assert.deepEqual([], state.bans.bannedCovenants);
  assert.equal(false, state.scanComplete);
  assert.deepEqual(['炎', '萨尔贡'], restoreSession(JSON.stringify(state)).confirmedCovenants);
  state = mobileReducer(state, { type: 'ban', group: 'bannedCovenants', name: '莱塔尼亚' });
  assert(state.confirmedCovenants?.includes('莱塔尼亚'));
  assert.equal(false, state.scanComplete);
});
