// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import { META_COMPS } from '../data/strongholdData';
import { rankCompsByBanState } from '../utils/tacticalLogic';
import { emptySession, mobileReducer, nextOwnershipState, restoreFavorites, restoreSession, toggleFavoriteId } from './mobileSession';

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

test('本机 VPN 抓包自动同步 26 项 Ban 选、回合推进与新局自动重置', () => {
  const cid = META_COMPS[0].id;
  let session = mobileReducer(emptySession(), {
    type: 'applyCaptureSync',
    matchSerial: 1,
    bansConfirmed: true,
    bannedCovenants: ['乌萨斯', '炎', '精准', '未知'],
    round: 1,
  });
  assert.equal('vpn-1', session.scanId);
  assert.equal(true, session.scanComplete);
  assert.equal(26, session.confirmedCovenants?.length);
  assert.deepEqual(['乌萨斯', '炎', '精准'], session.bans.bannedCovenants);

  session = mobileReducer(session, { type: 'choose', id: cid });
  session = mobileReducer(session, { type: 'toggleOwned', compId: cid, name: '野鬃' });
  session = mobileReducer(session, {
    type: 'applyCaptureSync',
    matchSerial: 1,
    bansConfirmed: true,
    bannedCovenants: ['乌萨斯', '炎', '精准'],
    round: 6,
  });
  assert.equal(6, session.rounds[cid]);
  assert.equal('owned', session.ownedOperators?.[cid]?.['野鬃']);

  // 开新一局（matchSerial=2）自动清空上局打卡与回合，并更新为新局 Ban 列表
  session = mobileReducer(session, {
    type: 'applyCaptureSync',
    matchSerial: 2,
    bansConfirmed: true,
    bannedCovenants: ['阿戈尔'],
    round: 1,
  });
  assert.equal('vpn-2', session.scanId);
  assert.equal('ban', session.step);
  assert.deepEqual(['阿戈尔'], session.bans.bannedCovenants);
  assert.deepEqual({}, session.ownedOperators);
  assert.deepEqual({}, session.rounds);
});

test('极端损坏缓存与非法输入在 restoreSession / restoreFavorites / mobileReducer 下永不崩溃', () => {
  const corruptedInputs: Array<string | null> = [
    null,
    '',
    'null',
    'true',
    '12345',
    '"string-only"',
    '[]',
    '{"step":123,"compId":{},"bans":null,"rounds":"bad","ownedOperators":[]}',
    JSON.stringify({
      step: 'guide',
      compId: META_COMPS[0].id,
      bans: { bannedCovenants: [null, 42, {}, '炎', '炎'], bannedOperators: [false, '塔露拉'] },
      rounds: { [META_COMPS[0].id]: Number.NaN, [META_COMPS[1].id]: -999 },
      ownedOperators: { [META_COMPS[0].id]: null },
    }),
  ];

  for (const raw of corruptedInputs) {
    const s = restoreSession(raw);
    assert.ok(['ban', 'plans', 'guide', 'report', 'library'].includes(s.step));
    assert.ok(Array.isArray(s.bans.bannedCovenants));
    assert.ok(Array.isArray(s.bans.bannedOperators));
    const f = restoreFavorites(raw);
    assert.ok(Array.isArray(f));
  }

  const reportStepSession = restoreSession(JSON.stringify({ step: 'report', compId: null, bans: { bannedCovenants: ['炎'], bannedOperators: [] } }));
  assert.equal(reportStepSession.step, 'report');
  assert.deepEqual(reportStepSession.bans.bannedCovenants, ['炎']);
  const switchedToReport = mobileReducer(emptySession(), { type: 'step', step: 'report' });
  assert.equal(switchedToReport.step, 'report');

  let s = mobileReducer(emptySession(), { type: 'choose', id: META_COMPS[0].id });
  s = mobileReducer(s, { type: 'round', round: Number.NaN });
  assert.ok(s.rounds[META_COMPS[0].id] === undefined || (s.rounds[META_COMPS[0].id] >= 1 && s.rounds[META_COMPS[0].id] <= 15));
  s = mobileReducer(s, {
    type: 'applyCaptureSync',
    matchSerial: 99,
    bansConfirmed: true,
    bannedCovenants: Array.from({ length: 80 }, (_, i) => (i % 2 === 0 ? '炎' : `未知_${i}`)),
    round: 999,
  });
  assert.deepEqual(['炎'], s.bans.bannedCovenants);
});
