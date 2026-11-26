// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import { readLightBattleSyncMeta, resolvePacketSyncSnapshot } from './battleBanSync';
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
