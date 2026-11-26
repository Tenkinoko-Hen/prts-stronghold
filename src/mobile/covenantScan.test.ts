// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import { COVENANT_NAMES, parseCovenantScan } from './covenantScan';
import { emptySession, mobileReducer, restoreSession } from './mobileSession';
import { META_COMPS } from '../data/strongholdData';
import { rankCompsByBanState } from '../utils/tacticalLogic';

const videoBans = ['萨尔贡', '维多利亚', '叙拉古', '卡西米尔', '乌萨斯', '精准', '迅捷', '助力', '聚合', '奥术'];
const result = (overrides = {}) => JSON.stringify({ id: 'video-match', status: 'ready', message: '已确认', seenCovenants: [...COVENANT_NAMES].reverse(), bannedCovenants: videoBans, ...overrides });

test('录屏乱序的26个盟约批量应用，清除上一局进度并按新 Ban 推荐', () => {
  const scan = parseCovenantScan(result())!;
  assert.equal(true, scan.complete);
  let state = mobileReducer(emptySession(), { type: 'choose', id: META_COMPS[0].id });
  state = mobileReducer(state, { type: 'round', round: 8 });
  state = mobileReducer(state, { type: 'ban', group: 'bannedOperators', name: '砾' });
  state = mobileReducer(state, { type: 'applyScan', scan });
  assert.equal('ban', state.step);
  assert.equal(null, state.compId);
  assert.deepEqual({}, state.rounds);
  assert.deepEqual(videoBans, state.bans.bannedCovenants);
  assert.deepEqual([], state.bans.bannedOperators);
  assert.equal('blocked', rankCompsByBanState(META_COMPS, state.bans).find(item => item.comp.id === 'victoria-bastion-jessica')?.status);
  assert.deepEqual(state, restoreSession(JSON.stringify(state)));
  const corrected = mobileReducer(state, { type: 'ban', group: 'bannedCovenants', name: videoBans[0] });
  assert.equal(corrected, mobileReducer(corrected, { type: 'applyScan', scan }));
});

test('缺失盟约不能伪装完成；取消和错误不能覆盖当前局', () => {
  assert.equal(null, parseCovenantScan(result({ seenCovenants: ['炎'], bannedCovenants: [] })));
  assert.equal(null, parseCovenantScan(result({ bannedCovenants: ['未知盟约'] })));
  assert.equal(null, parseCovenantScan('not json'));
  const original = mobileReducer(emptySession(), { type: 'ban', group: 'bannedCovenants', name: '炎' });
  for (const status of ['error', 'cancelled', 'scanning', 'permission']) {
    const scan = parseCovenantScan(result({ status }))!;
    assert.deepEqual(original, mobileReducer(original, { type: 'applyScan', scan }));
  }
});

test('部分识别需显式应用且保留未读全标记，不伪造干员禁用', () => {
  const scan = parseCovenantScan(result({ status: 'incomplete', seenCovenants: ['炎', '萨尔贡'], bannedCovenants: ['萨尔贡'], complete: true }))!;
  assert.equal(false, scan.complete);
  assert.equal(24, scan.missingCovenants.length);
  const state = mobileReducer(emptySession(), { type: 'applyScan', scan });
  assert.equal(false, restoreSession(JSON.stringify(state)).scanComplete);
  assert.deepEqual(['萨尔贡'], state.bans.bannedCovenants);
  assert.deepEqual([], state.bans.bannedOperators);
});

test('贾维特殊路线在叙拉古未受限时提示卡池条件', () => {
  const route = rankCompsByBanState(META_COMPS, emptySession().bans).find(item => item.comp.id === 'chiave-leithanien-refresh')!;
  assert.equal('viable', route.status);
  assert.equal(true, route.blockedReasons.some(reason => reason.includes('禁叙保莱')));
});

test('parseCovenantScan 安全解析 targetCount 与 modeLabel 并保留缺省兼容', () => {
  const quickScanning = parseCovenantScan(JSON.stringify({
    id: 'quick-1',
    status: 'scanning',
    message: '极速模拟：已确认 14/18 个盟约',
    targetCount: 18,
    modeLabel: '极速模拟',
    seenCovenants: COVENANT_NAMES.slice(0, 14),
    bannedCovenants: ['乌萨斯'],
  }))!;
  assert.equal(18, quickScanning.targetCount);
  assert.equal('极速模拟', quickScanning.modeLabel);
  assert.equal(false, quickScanning.complete);

  const fallbackDefault = parseCovenantScan(result())!;
  assert.equal(26, fallbackDefault.targetCount);
  assert.equal('', fallbackDefault.modeLabel);
});
