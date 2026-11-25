// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import { META_COMPS } from '../data/strongholdData';
import { rankCompsByBanState } from '../utils/tacticalLogic';
import { emptySession, mobileReducer, nextOwnershipState, restoreFavorites, restoreSession, toggleFavoriteId } from './mobileSession';
import { computeOfflineRollOdds, formatOddsPct } from './mobileOdds';
import { classifyShopMatches } from './ShopScanner';

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

test('常用阵容收藏置顶持久化与无效 ID 过滤', () => {
  const a = META_COMPS[0].id, b = META_COMPS[1].id;
  let favs = restoreFavorites(JSON.stringify([a, 'non-existent', a, b]));
  assert.deepEqual([a, b], favs);
  favs = toggleFavoriteId(favs, a);
  assert.deepEqual([b], favs);
  favs = toggleFavoriteId(favs, a);
  assert.deepEqual([a, b], favs);
  assert.deepEqual([], restoreFavorites('{bad json'));
});

test('已抓核心干员打卡三态循环、持久化恢复与开新局重置', () => {
  const cid = META_COMPS[0].id;
  assert.equal('owned', nextOwnershipState(undefined));
  assert.equal('elite', nextOwnershipState('owned'));
  assert.equal(undefined, nextOwnershipState('elite'));

  let session = mobileReducer(emptySession(), { type: 'choose', id: cid });
  session = mobileReducer(session, { type: 'toggleOwned', compId: cid, name: '维什戴尔' });
  assert.equal('owned', session.ownedOperators?.[cid]?.['维什戴尔']);

  session = mobileReducer(session, { type: 'toggleOwned', compId: cid, name: '维什戴尔' });
  assert.equal('elite', session.ownedOperators?.[cid]?.['维什戴尔']);

  const restored = restoreSession(JSON.stringify({
    ...session,
    ownedOperators: {
      [cid]: { '维什戴尔': 'elite', '坏值': 'invalid' },
      'removed-comp': { '阿米娅': 'owned' },
    },
  }));
  assert.deepEqual({ [cid]: { '维什戴尔': 'elite' } }, restored.ownedOperators);

  session = mobileReducer(session, { type: 'toggleOwned', compId: cid, name: '维什戴尔' });
  assert.equal(undefined, session.ownedOperators?.[cid]?.['维什戴尔']);

  session = mobileReducer(session, { type: 'toggleOwned', compId: cid, name: '铃兰' });
  session = mobileReducer(session, { type: 'clearOwned', compId: cid });
  assert.equal(undefined, session.ownedOperators?.[cid]);

  session = mobileReducer(session, { type: 'toggleOwned', compId: cid, name: '铃兰' });
  session = mobileReducer(session, { type: 'newMatch' });
  assert.deepEqual({}, session.ownedOperators);
});

test('离线搜牌概率引擎：未解锁阶数、单刷/5刷/升本对比与三连碰牌', () => {
  const locked = computeOfflineRollOdds({ shopLevel: 3, targetTier: 5 });
  assert.equal(false, locked.unlocked);
  assert.equal(0, locked.perRollProb);
  assert.equal(5, locked.nextLevelShopLevel);
  assert.ok((locked.nextLevelPerRollProb || 0) > 0);
  assert.equal(null, locked.tripleDiscoverProb);

  // 4本三连可碰 5阶 3选1
  const discover = computeOfflineRollOdds({ shopLevel: 4, targetTier: 5 });
  assert.equal(false, discover.unlocked);
  assert.ok((discover.tripleDiscoverProb || 0) > 0.05 && (discover.tripleDiscoverProb || 0) < 0.25);

  const base = computeOfflineRollOdds({ shopLevel: 4, targetTier: 4, takenCopies: 0, targetCount: 1 });
  const taken = computeOfflineRollOdds({ shopLevel: 4, targetTier: 4, takenCopies: 6, targetCount: 1 });
  assert.equal(true, base.unlocked);
  assert.ok(base.perRollProb > taken.perRollProb);
  assert.ok(base.fiveRollProb > base.perRollProb);
  assert.equal('0%', formatOddsPct(0));
  assert.equal('<0.1%', formatOddsPct(0.0005));
});

test('商店扫牌结果按本回合急抓 > 阵容必抓 > 整备 > 已精锐 > 非本阵排序', () => {
  const comp = META_COMPS[0];
  const fieldOp = comp.phases[0].fieldOperators[0].name;
  const fieldOp2 = comp.phases[comp.phases.length - 1].fieldOperators[0].name;
  const result = classifyShopMatches(
    ['陌生干员', fieldOp2, fieldOp],
    comp,
    { [fieldOp2]: 'elite' },
    [fieldOp],
  );
  assert.equal(fieldOp, result[0].name);
  assert.equal('urgent', result[0].priority);
  assert.equal('done', result.find(r => r.name === fieldOp2)?.priority);
  assert.equal('other', result[result.length - 1].priority);
});
