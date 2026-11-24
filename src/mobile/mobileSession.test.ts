// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import { META_COMPS } from '../data/strongholdData';
import { rankCompsByBanState } from '../utils/tacticalLogic';
import { emptySession, mobileReducer, restoreSession } from './mobileSession';

test('选 Ban 后推荐排除被禁主阵营，清空恢复全部方案', () => {
  let session = mobileReducer(emptySession(), { type: 'ban', group: 'bannedCovenants', name: '乌萨斯' });
  const ranked = rankCompsByBanState(META_COMPS, session.bans);
  assert.equal(ranked.find(item => item.comp.id === 'ursus-arcane-talulah')?.status, 'blocked');
  session = mobileReducer(session, { type: 'clearBans' });
  assert.equal(META_COMPS.length, rankCompsByBanState(META_COMPS, session.bans).filter(item => item.status !== 'blocked').length);
});

test('返回换方案保留 Ban 和各阵容回合，恢复后继续原回合', () => {
  const a = META_COMPS[0].id, b = META_COMPS[1].id;
  let session = mobileReducer(emptySession(), { type: 'ban', group: 'bannedOperators', name: '塔露拉' });
  session = mobileReducer(session, { type: 'choose', id: a });
  session = mobileReducer(session, { type: 'round', round: 7 });
  session = mobileReducer(session, { type: 'step', step: 'plans' });
  session = mobileReducer(session, { type: 'choose', id: b });
  session = mobileReducer(session, { type: 'round', round: 3 });
  session = mobileReducer(restoreSession(JSON.stringify(session)), { type: 'choose', id: a });
  assert.equal(7, session.rounds[a]);
  assert.equal(3, session.rounds[b]);
  assert.deepEqual(['塔露拉'], session.bans.bannedOperators);
  assert.equal('guide', session.step);
});

test('损坏或旧进度不会进入无阵容页面，回合范围限制 R1–R15', () => {
  assert.deepEqual(emptySession(), restoreSession('{invalid'));
  const restored = restoreSession(JSON.stringify({ step: 'guide', compId: 'removed', bans: { bannedCovenants: ['炎', '炎', 'unknown'] }, rounds: { [META_COMPS[0].id]: 99 } }));
  assert.equal('plans', restored.step);
  assert.deepEqual(['炎'], restored.bans.bannedCovenants);
  assert.equal(15, restored.rounds[META_COMPS[0].id]);
  let session = mobileReducer(emptySession(), { type: 'choose', id: META_COMPS[0].id });
  session = mobileReducer(session, { type: 'round', round: -2 });
  assert.equal(1, session.rounds[META_COMPS[0].id]);
  assert.deepEqual(emptySession(), mobileReducer(session, { type: 'newMatch' }));
});
