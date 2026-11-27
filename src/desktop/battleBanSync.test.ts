// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideBanSyncAction,
  normalizeBanSignature,
  readLightBattleSyncMeta,
  resolvePacketSyncSnapshot,
  type CurrentGuideSyncState,
} from './battleBanSync';
import { readBattleReport } from './battleReportData';
import { demoReport } from './demo/battleReportFixture';

test('readLightBattleSyncMeta matches readBattleReport metadata across valid and invalid snapshots', () => {
  assert.equal(readLightBattleSyncMeta(null), null);
  assert.equal(readLightBattleSyncMeta([]), null);
  assert.equal(readLightBattleSyncMeta({ players: {}, rounds: {} }), null);
  assert.equal(readLightBattleSyncMeta({ capture: { match: 1, round: 0 }, players: {}, rounds: {} }), null);

  for (const scene of ['quick_r9', 'coop_elim', 'solo_dps'] as const) {
    const raw = demoReport(scene);
    const full = readBattleReport(raw);
    const light = readLightBattleSyncMeta(raw);
    assert.ok(light);
    assert.equal(light.match, full.match);
    assert.equal(light.current, full.current);
    assert.equal(light.latestRound, full.rounds.at(-1)?.number ?? null);
    assert.equal(light.mode, full.mode);
    assert.deepEqual(light.bannedCovenants, full.bannedCovenants);
  }

  // Fallback to max round key when capture.round is absent or 0
  const uplinkOnly = readLightBattleSyncMeta({
    capture: { match: 8, round: 0 },
    players: {},
    rounds: {
      1: { phase: 'prep' },
      7: { self_leaks: 2 },
    },
  });
  assert.deepEqual(uplinkOnly, {
    match: 8,
    current: null,
    latestRound: 7,
    mode: '',
    bannedCovenants: [],
    hasMatchActivity: true,
  });
});

test('resolvePacketSyncSnapshot pauses OCR auto-poll for 0-ban matches and no-Npcap matches and resumes in lobby', () => {
  // 1. In lobby (report: null) -> auto-poll active
  const lobby = resolvePacketSyncSnapshot({ status: 'listening', report: null, reportRun: 1 }, false, '');
  assert.equal(lobby.matchKey, '');
  assert.equal(lobby.shouldPauseAutoPoll, false);

  // 2. Pure pre-match 0-Ban snapshot (only mode_id, no round/activity yet) -> keeps auto-poll enabled
  const preMatchZeroBan = resolvePacketSyncSnapshot({
    status: 'listening',
    reportRun: 1,
    report: {
      capture: { match: 12, round: 0 },
      battle_config: { mode_id: 'mode_multi_hard', banned_bonds: [] },
      players: {},
      rounds: {},
    },
  }, false, '');
  assert.equal(preMatchZeroBan.matchKey, '1:12');
  assert.equal(preMatchZeroBan.hasDownlink, true);
  assert.equal(preMatchZeroBan.liveRound, null);
  assert.equal(preMatchZeroBan.shouldPauseAutoPoll, false);

  // 3. 0-Ban match starts R1 -> IMMEDIATELY pauses auto-poll
  const r1ZeroBan = resolvePacketSyncSnapshot({
    status: 'listening',
    reportRun: 1,
    report: {
      capture: { match: 12, round: 1 },
      battle_config: { mode_id: 'mode_multi_hard', banned_bonds: [] },
      players: {},
      rounds: { 1: { phase: 'prep' } },
    },
  }, false, '1:12');
  assert.equal(r1ZeroBan.hasPacketBans, false);
  assert.equal(r1ZeroBan.liveRound, 1);
  assert.equal(r1ZeroBan.liveRoundConfirmed, true);
  assert.equal(r1ZeroBan.shouldPauseAutoPoll, true);

  // 4. Mid-match frame on same matchKey without round keeps auto-poll paused
  const midMatch = resolvePacketSyncSnapshot({
    status: 'listening',
    reportRun: 1,
    report: {
      capture: { match: 12, round: 0 },
      battle_config: { mode_id: 'mode_multi_hard', banned_bonds: [] },
      players: {},
      rounds: {},
    },
  }, true, '1:12');
  assert.equal(midMatch.shouldPauseAutoPoll, true);

  // 5. Returning to lobby (report: null, matchKey empty) -> resumes auto-poll
  const backToLobby = resolvePacketSyncSnapshot({ status: 'listening', report: null, reportRun: 1 }, true, '1:12');
  assert.equal(backToLobby.matchKey, '');
  assert.equal(backToLobby.shouldPauseAutoPoll, false);

  // 6. No-Npcap / uplink-only match (no banned_bonds, rounds[3] present) -> pauses auto-poll
  const noNpcap = resolvePacketSyncSnapshot({
    status: 'listening',
    reportRun: 2,
    report: {
      capture: { match: 3, round: 0 },
      players: {},
      rounds: { 3: { self_leaks: 1 } },
    },
  }, false, '');
  assert.equal(noNpcap.liveRound, 3);
  assert.equal(noNpcap.shouldPauseAutoPoll, true);

  // 7. Direct transition to a brand-new match in pure pre-match state resets pause
  const nextMatchPre = resolvePacketSyncSnapshot({
    status: 'listening',
    reportRun: 2,
    report: {
      capture: { match: 4, round: 0 },
      battle_config: { mode_id: 'mode_multi_hard', banned_bonds: [] },
      players: {},
      rounds: {},
    },
  }, true, '2:3');
  assert.equal(nextMatchPre.matchKey, '2:4');
  assert.equal(nextMatchPre.shouldPauseAutoPoll, false);
});

test('normalizeBanSignature sorts and deduplicates banned covenants', () => {
  assert.equal(
    normalizeBanSignature('1:1', ['拉特兰', '炎', '拉特兰']),
    normalizeBanSignature('1:1', ['炎', '拉特兰']),
  );
});

test('decideBanSyncAction preserves guide stage, comp, and manual bans across intra-match syncs and transitions', () => {
  // 黄金向量 2：首次同步不踢回选阵容
  const initialSyncCurrent: CurrentGuideSyncState = {
    matchSyncId: '',
    matchSyncSource: null,
    banState: { bannedCovenants: [], bannedOperators: ['维什戴尔'] },
    currentRound: 1,
    stage: 'detail',
  };
  const initialSyncAction = decideBanSyncAction(
    { matchKey: '1:1', bannedCovenants: ['炎', '精准'], source: 'packet', liveRound: 1 },
    initialSyncCurrent,
  );
  assert.equal(initialSyncAction.isNewMatch, false);
  assert.equal(initialSyncAction.resetCompAndRound, false);
  assert.equal(initialSyncAction.nextStage, 'detail');
  assert.equal(initialSyncAction.nextMatchSyncId, '1:1');
  assert.deepEqual(initialSyncAction.nextBanState.bannedOperators, ['维什戴尔']);

  // 黄金向量 3：同局手动禁选干员或手动重新同步不踢回
  const manualResyncCurrent: CurrentGuideSyncState = {
    matchSyncId: '1:1',
    matchSyncSource: 'packet',
    banState: { bannedCovenants: ['炎', '精准'], bannedOperators: ['维什戴尔'] },
    currentRound: 4,
    stage: 'detail',
  };
  const manualResyncAction = decideBanSyncAction(
    { matchKey: '1:1', bannedCovenants: ['炎', '精准'], source: 'packet', liveRound: 4, manualResync: true },
    manualResyncCurrent,
  );
  assert.equal(manualResyncAction.isNewMatch, false);
  assert.equal(manualResyncAction.resetCompAndRound, false);
  assert.equal(manualResyncAction.nextStage, 'detail');
  assert.deepEqual(manualResyncAction.nextBanState.bannedOperators, ['维什戴尔']);

  // 黄金向量 4：局中 R5 重连 / Worker 重启换 matchKey 绝不踢回
  const r5ReconnectCurrent: CurrentGuideSyncState = {
    matchSyncId: '1:1',
    matchSyncSource: 'packet',
    banState: { bannedCovenants: ['炎', '精准'], bannedOperators: ['维什戴尔'] },
    currentRound: 5,
    stage: 'detail',
  };
  const r5ReconnectAction = decideBanSyncAction(
    { matchKey: '2:1', bannedCovenants: ['炎', '萨尔贡'], source: 'packet', liveRound: 5 },
    r5ReconnectCurrent,
  );
  assert.equal(r5ReconnectAction.isNewMatch, false);
  assert.equal(r5ReconnectAction.resetCompAndRound, false);
  assert.equal(r5ReconnectAction.nextStage, 'detail');
  assert.equal(r5ReconnectAction.nextMatchSyncId, '2:1');
  assert.deepEqual(r5ReconnectAction.nextBanState.bannedOperators, ['维什戴尔']);

  // 黄金向量 5：局中 R5 重启首帧 liveRound: null 且同 Ban 集不踢回
  const r5NullRoundCurrent: CurrentGuideSyncState = {
    matchSyncId: '1:1',
    matchSyncSource: 'packet',
    banState: { bannedCovenants: ['炎', '精准'], bannedOperators: [] },
    currentRound: 5,
    stage: 'detail',
  };
  const r5NullRoundAction = decideBanSyncAction(
    { matchKey: '2:1', bannedCovenants: ['精准', '炎'], source: 'packet', liveRound: null },
    r5NullRoundCurrent,
  );
  assert.equal(r5NullRoundAction.isNewMatch, false);
  assert.equal(r5NullRoundAction.nextStage, 'detail');

  // 黄金向量 6：OCR → Packet 同局接管不踢回
  const ocrToPacketCurrent: CurrentGuideSyncState = {
    matchSyncId: 'ocr-1',
    matchSyncSource: 'ocr',
    banState: { bannedCovenants: ['炎'], bannedOperators: [] },
    currentRound: 1,
    stage: 'detail',
  };
  const ocrToPacketAction = decideBanSyncAction(
    { matchKey: '1:1', bannedCovenants: ['炎', '精准'], source: 'packet', liveRound: 1 },
    ocrToPacketCurrent,
  );
  assert.equal(ocrToPacketAction.isNewMatch, false);
  assert.equal(ocrToPacketAction.resetCompAndRound, false);
  assert.equal(ocrToPacketAction.nextStage, 'detail');
  assert.equal(ocrToPacketAction.nextMatchSyncId, '1:1');
  assert.equal(ocrToPacketAction.nextMatchSyncSource, 'packet');

  // 黄金向量 7：真正新局 R12 → 新 matchKey R1 正常重置回 picker
  const r12FinishedCurrent: CurrentGuideSyncState = {
    matchSyncId: '1:1',
    matchSyncSource: 'packet',
    banState: { bannedCovenants: ['炎', '精准'], bannedOperators: ['维什戴尔'] },
    currentRound: 12,
    stage: 'detail',
  };
  const nextMatchDiffBans = decideBanSyncAction(
    { matchKey: '1:2', bannedCovenants: ['维多利亚'], source: 'packet', liveRound: 1 },
    r12FinishedCurrent,
  );
  assert.equal(nextMatchDiffBans.isNewMatch, true);
  assert.equal(nextMatchDiffBans.resetCompAndRound, true);
  assert.equal(nextMatchDiffBans.nextStage, 'picker');
  assert.deepEqual(nextMatchDiffBans.nextBanState.bannedOperators, []);

  const nextMatchSameBans = decideBanSyncAction(
    { matchKey: '1:2', bannedCovenants: ['炎', '精准'], source: 'packet', liveRound: 1 },
    r12FinishedCurrent,
  );
  assert.equal(nextMatchSameBans.isNewMatch, true);
  assert.equal(nextMatchSameBans.resetCompAndRound, true);
  assert.equal(nextMatchSameBans.nextStage, 'picker');
  assert.deepEqual(nextMatchSameBans.nextBanState.bannedOperators, []);

  const nextMatchPreFrame = decideBanSyncAction(
    { matchKey: '1:2', bannedCovenants: ['维多利亚'], source: 'packet', liveRound: null },
    r12FinishedCurrent,
  );
  assert.equal(nextMatchPreFrame.isNewMatch, true);
  assert.equal(nextMatchPreFrame.nextStage, 'picker');

  // 黄金向量 8：Packet 活跃时手动触发 OCR 校对不踢回
  const packetToOcrCurrent: CurrentGuideSyncState = {
    matchSyncId: '1:1',
    matchSyncSource: 'packet',
    banState: { bannedCovenants: ['炎'], bannedOperators: [] },
    currentRound: 6,
    stage: 'detail',
  };
  const packetToOcrAction = decideBanSyncAction(
    { matchKey: 'ocr-2', bannedCovenants: ['维多利亚'], source: 'ocr', liveRound: null },
    packetToOcrCurrent,
  );
  assert.equal(packetToOcrAction.isNewMatch, false);
  assert.equal(packetToOcrAction.nextStage, 'detail');
});
