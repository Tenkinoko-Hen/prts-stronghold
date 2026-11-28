// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BossDamage, LeaderInlineBar } from './BattleReportPanels';
import { NpcapSetupBanner } from './NpcapSetupBanner';
import { RoundMatrix, WaveDetails } from './BattleReportRounds';
import { SpawnPreview } from './BattleReportSpawns';
import { laneKinds, laneLeaks, roundOutcome } from './battleRoundOutcome';
import { demoReport } from './demo/battleReportFixture';
import { BattleReportRoster } from './BattleReportRoster';
import { defaultBossRound, hasBossDamage, ownLeakKinds, ownLeakPower, ownRoundLeaks, readBattleReport, reportProgress, resolvePreviewRound,
  roundMetrics, visibleSpawnRows, type BattleReport, type ReportRoundFilter } from './battleReportData';
import { reportWithPlayerNames, setReportPlayerNames, setReportSelfSeat, updateLiveReport } from './battleReports';
import { BOND_ID_TO_COVENANT, mapBannedBondsToCovenants } from './covenantBonds';
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES } from '../data/strongholdData';
import portraits from './enemyPortraits.json';

const report = (match: number, current: number, rounds: Record<number, unknown>, self: number | null = 1) =>
  readBattleReport({ capture: { match, round: current, self }, players: {}, rounds });
const detailView = (report: BattleReport, round: ReportRoundFilter, seat = report.self) =>
  renderToStaticMarkup(createElement(WaveDetails, { report, round, seat }));

test('settlement-only reports do not substitute the recorded round for the current round', () => {
  const capture = report(1, 0, { 2: { self_leaks: 4 } });
  assert.deepEqual(reportProgress(capture, true), { number: 2, label: '最近记录 R2 · 当前回合未确认' });
  const partial = report(1, 1, { 1: { phase: 'prep' }, 2: { self_leaks: 4 } });
  assert.deepEqual(reportProgress(partial, true), reportProgress(capture, true));
});

test('labels use the last confirmed round, and history is never marked live', () => {
  const capture = report(1, 3, { 3: { phase: 'prep' } });
  assert.deepEqual(reportProgress(capture, true), { number: 3, label: '最近确认 R3' });
  assert.deepEqual(reportProgress(capture, false), { number: 3, label: '记录至 R3' });
  assert.equal(reportProgress(undefined, true).label, '等待本局记录');
});

test('Boss view prefers a recorded fight over an empty R15 and still lets R15 take over', () => {
  const r14 = { phase: 'end', boss_ended: true, boss_damage: { 1: 35000 }, boss_percent: { 1: 35 }, boss_status: 'settlement' };
  const capture = report(1, 15, { 14: r14, 15: { phase: 'prep', boss_plan: { id: 'boss_8' } } });
  assert.equal(defaultBossRound(capture), 14);
  assert.match(renderToStaticMarkup(createElement(BossDamage, { report: capture, number: 14, onRound: () => {},
    onPreview: () => {}, reference: null })), /已取得服务器伤害结算/);
  assert.equal(defaultBossRound(report(1, 15, { 14: r14, 15: { boss_official: [{ player: 2, identifier: 123, damage: 999 }] } })), 15);
});

test('Boss finished without an amount is not shown as zero or as an unseen battle', () => {
  const ended = report(1, 14, { 14: { phase: 'end', boss_ended: true, boss_status: 'unknown' } });
  const markup = renderToStaticMarkup(createElement(BossDamage, { report: ended, number: 14, onRound: () => {},
    onPreview: () => {}, reference: null }));
  assert.match(markup, /Boss 战斗阶段已结束，但未采到伤害/);
  assert.equal(hasBossDamage(ended.rounds[0]), false);
  const zero = report(1, 14, { 14: { phase: 'end', boss_damage: { 1: 0 } } });
  assert.equal(hasBossDamage(zero.rounds[0]), true);
});

test('Boss damage remains visible when a missing stage is associated by confirmed progress', () => {
  const inferred = report(1, 13, { 14: { boss_damage: { 1: 6000 }, boss_round_basis: 'inferred', boss_status: 'reported' } });
  const markup = renderToStaticMarkup(createElement(BossDamage, { report: inferred, number: 14, onRound: () => {},
    onPreview: () => {}, reference: null }));
  assert.match(markup, /6,000/);
  assert.match(markup, /回合按最近确认进度关联，等待场景校正/);
});

test('Boss damage survives a sparse same-match update and archive without leaking to a new match', () => {
  const initial = report(1, 14, { 14: { phase: 'end', boss_ended: true, boss_damage: { 1: 35000 }, boss_status: 'settlement', boss_round_basis: 'inferred' } });
  let records = updateLiveReport({ history: [] }, initial, 1, 10);
  records = updateLiveReport(records, report(1, 15, { 14: { phase: 'other' }, 15: { phase: 'prep' } }), 1, 20);
  assert.equal(records.live?.report.rounds[0].bossDamage[1], 35000);
  assert.equal(records.live?.report.rounds[0].bossRoundInferred, true);
  assert.equal(records.live?.report.rounds[0].bossEnded, true);
  records = updateLiveReport(records, null, 1, 21);
  assert.equal(records.history[0].report.rounds[0].bossDamage[1], 35000);
  records = updateLiveReport(records, report(2, 1, { 1: { phase: 'prep' } }), 1, 22);
  assert.equal(records.live?.report.rounds.some(row => row.number >= 14), false);
});

test('a ranking or local hit arriving after a settlement does not erase that settlement', () => {
  const initial = { boss_damage: { 1: 35000, 2: 0 }, boss_percent: { 1: 35, 2: 0 }, boss_status: 'settlement' };
  let records = updateLiveReport({ history: [] }, report(1, 14, { 14: initial }), 1, 10);
  const rank = { player: 1, identifier: 123, damage: 999 };
  records = updateLiveReport(records, report(1, 14, { 14: { boss_official: [rank], boss_status: 'unknown' } }), 1, 11);
  records = updateLiveReport(records, report(1, 14, { 14: { boss_uplink: { 1: 70 },
    boss_uplink_rows: [{ player: 1, attacker: 42, source: 1, damage: 70 }] } }), 1, 12);
  const result = records.live!.report;
  const [row] = result.rounds;
  assert.deepEqual(row.bossDamage, { 1: 35000, 2: 0 });
  assert.deepEqual(row.bossPercent, { 1: 35, 2: 0 });
  assert.equal(row.bossStatus, 'settlement');
  assert.equal(row.bossOfficial[0].damage, 999);
  assert.equal(row.bossUplinkRows[0].damage, 70);
  const html = renderToStaticMarkup(createElement(BossDamage, { report: result, number: 14, onRound: () => {},
    onPreview: () => {}, reference: null }));
  assert.match(html, /35,000/);
  assert.match(html, /已取得服务器伤害结算/);
  assert.match(html, /999/);
});

test('reconnecting keeps independent Boss sources while newer results replace the same source', () => {
  let records = updateLiveReport({ history: [] }, report(1, 14, { 14: {
    boss_official: [{ player: 1, identifier: 1, damage: 800 }], boss_uplink: { 1: 80 },
    boss_damage: { 1: 800 }, boss_percent: { 1: 8 }, boss_status: 'reported',
  } }), 1, 10);
  records = updateLiveReport(records, null, 1, 11);
  const corrected = report(1, 15, { 14: { boss_damage: { 1: 0, 2: 900 }, boss_status: 'settlement',
    boss_official: [{ player: 2, identifier: 2, damage: 900 }] }, 15: { phase: 'prep' } });
  records = updateLiveReport(records, corrected, 1, 12);
  const [r14, r15] = records.live!.report.rounds;
  assert.deepEqual(r14.bossDamage, { 1: 0, 2: 900 });
  assert.deepEqual(r14.bossPercent, {}); // A superseded total cannot supply the new percentage.
  assert.deepEqual(r14.bossOfficial.map(hit => hit.damage), [900]);
  assert.deepEqual(r14.bossUplink, { 1: 80 });
  assert.equal(hasBossDamage(r15), false);
});

test('a positive Boss ranking retires an all-zero snapshot in either arrival order, including reconnect', () => {
  const first = report(1, 14, { 14: { phase: 'prep', boss_damage: { 1: 0 }, boss_percent: { 1: 0 },
    boss_status: 'reported', boss_round_basis: 'inferred' } });
  const records = updateLiveReport({ history: [] }, first, 1, 10);
  for (const player of [1, 2]) {
    const ranking = report(1, 14, { 14: { phase: 'prep', boss_damage: {}, boss_percent: {}, boss_status: 'unknown',
      boss_official: [{ player, identifier: 1, damage: 900 }], boss_round_basis: 'confirmed' } });
    const archived = updateLiveReport(updateLiveReport({ history: [] }, ranking, 1, 10), null, 1, 11);
    for (const state of [updateLiveReport(records, ranking, 1, 11), updateLiveReport(archived, first, 1, 12)]) {
      const result = state.live!.report, [row] = result.rounds;
      assert.deepEqual(row.bossDamage, {});
      assert.deepEqual(row.bossPercent, {});
      assert.equal(row.bossStatus, 'unknown');
      const html = renderToStaticMarkup(createElement(BossDamage, { report: result, number: 14, onRound: () => {},
        onPreview: () => {}, reference: null }));
      assert.match(html, /已收到榜单，未取得服务器伤害结算/);
      assert.doesNotMatch(html, /0% · 0|等待场景校正/);
    }
  }
});

test('a Boss ranking invalidates a conflicting zero but preserves the other seats of a mixed settlement', () => {
  const first = report(1, 14, { 14: { boss_damage: { 1: 35000, 2: 0, 3: 0 }, boss_percent: { 1: 35, 2: 0, 3: 0 },
    boss_status: 'settlement' } });
  const next = report(1, 14, { 14: { boss_official: [{ player: 2, identifier: 123, damage: 900 }] } });
  const [row] = updateLiveReport(updateLiveReport({ history: [] }, first, 1, 10), next, 1, 11).live!.report.rounds;
  assert.deepEqual(row.bossDamage, { 1: 35000, 3: 0 });
  assert.deepEqual(row.bossPercent, { 1: 35, 3: 0 });
  assert.equal(row.bossStatus, 'settlement');
});

test('an inferred Boss ranking keeps its warning until the round is explicitly confirmed', () => {
  const ranking = { boss_official: [{ player: 2, identifier: 1, damage: 900 }], boss_round_basis: 'inferred' };
  let records = updateLiveReport({ history: [] }, report(1, 14, { 14: ranking }), 1, 10);
  for (const update of [{ phase: 'other' }, { boss_uplink: { 2: 30 } }, { boss_ended: true, boss_round_basis: 'inferred' }]) {
    records = updateLiveReport(records, report(1, 14, { 14: update }), 1, 11);
    assert.equal(records.live!.report.rounds[0].bossRoundInferred, true);
    assert.equal(records.live!.report.rounds[0].bossOfficial[0].damage, 900);
  }
  for (const confirmation of [{ phase: 'prep', boss_round_basis: 'confirmed' }, { phase: 'boss' }]) {
    const result = updateLiveReport(records, report(1, 14, { 14: confirmation }), 1, 12).live!.report;
    assert.equal(result.rounds[0].bossRoundInferred, false);
    assert.equal(result.rounds[0].bossOfficial[0].damage, 900);
  }
});

test('direct local leak counts take precedence over cooperative counts for the own seat only', () => {
  const capture = report(1, 3, { 3: { leaks: { 1: 0, 2: 6 }, leaks_status: 'reported', self_leaks: 3 } });
  const [row] = capture.rounds;
  assert.equal(ownRoundLeaks(row, capture), 3);
  assert.equal(roundMetrics(row, 1, capture.self)[0]?.value, 3);
  assert.equal(roundMetrics(row, 2, capture.self)[0]?.value, 6);
  assert.equal(roundMetrics(row, 1, capture.self)[3], undefined);
});

test('observed zero, missing settlement, and a legacy unassigned local settlement stay distinct', () => {
  const capture = report(1, 0, { 1: { self_leaks: 0 }, 2: {}, 3: { unassigned_self_leaks: 5 } }, null);
  assert.deepEqual(capture.rounds.map(row => ownRoundLeaks(row, capture)), [0, undefined, 5]);
});

test('fractional and negative local leak counts do not become observed settlements', () => {
  const capture = report(1, 0, { 1: { self_leaks: 0.5 }, 2: { unassigned_self_leaks: -1 } }, null);
  assert.deepEqual(capture.rounds.map(row => ownRoundLeaks(row, capture)), [undefined, undefined]);
});

test('disconnect archives the old live report once and a new local match starts with clean data', () => {
  const first = report(1, 4, { 4: { phase: 'prep', self_leaks: 7 } });
  let state = updateLiveReport({ history: [] }, first, 1, 100);
  state = updateLiveReport(state, null, 1, 101);
  assert.equal(state.live, undefined);
  assert.strictEqual(updateLiveReport(state, null, 1, 102), state);
  state = updateLiveReport(state, report(2, 0, { 1: { self_leaks: 0 } }), 1, 103);
  assert.deepEqual(state.live?.report.rounds.map(row => row.number), [1]);
  assert.deepEqual(state.history.map(entry => entry.report), [first]);
});

test('a new match in the same capture session replaces R9 and previews while archiving the previous match', () => {
  const withPreview = (match: number, number: number, id: string) => readBattleReport({
    capture: { match, round: 0 }, players: {}, rounds: { [number]: { self_leaks: 2 } },
    spawn_plan: [{ round: number, action: 0, enemy_id: id, name: id, count: 2 }],
  });
  const first = withPreview(1, 9, 'old_preview');
  const state = updateLiveReport(updateLiveReport({ history: [] }, first, 1, 100), withPreview(2, 1, 'new_preview'), 1, 101);
  assert.deepEqual(state.history.map(entry => entry.report), [first]);
  assert.equal(resolvePreviewRound(state.live?.report, 'follow'), 1);
  const html = renderToStaticMarkup(createElement(SpawnPreview, { report: state.live!.report, filter: 'follow', onSelect: () => {} }));
  assert.match(html, /new_preview/);
  assert.doesNotMatch(html, /old_preview/);
});

test('reconnecting a known match removes the archived duplicate and keeps its first seen time', () => {
  const first = report(1, 3, { 3: { self_leaks: 2 } });
  const active = updateLiveReport({ history: [] }, first, 1, 100);
  const disconnected = updateLiveReport(active, null, 1, 102);
  const resumed = report(1, 4, { 3: { self_leaks: 2 }, 4: { self_leaks: 0 } });
  const result = updateLiveReport(disconnected, resumed, 1, 105);
  assert.deepEqual(result.history, []);
  assert.equal(result.live?.key, active.live?.key);
  assert.equal(result.live?.seenAt, 100);
  assert.equal(result.live?.report, resumed);
});

const covered = { self_leaks: 1, assists_status: 'reported', assists_others: { 1: 4 },
  assist_pairs: [{ killer: 1, owner: 3, count: 1 }, { killer: 1, owner: 4, count: 3 }] };

test('same-match sparse updates and reconnect keep old assist pairs, but a correction can clear them', () => {
  let state = updateLiveReport({ history: [] }, report(1, 4, { 4: covered }, 3), 1, 100);
  state = updateLiveReport(state, report(1, 5, { 4: { phase: 'settle' }, 5: { phase: 'prep' } }, 3), 1, 101);
  assert.deepEqual(state.live!.report.rounds[0].assistPairs.map(pair => pair.count), [1, 3]);
  assert.equal(state.live!.report.rounds[0].assists[1], 4);
  assert.equal(state.live!.report.rounds[0].selfLeaks, 1);
  assert.equal(state.live!.report.rounds[0].phase, 'settle');
  state = updateLiveReport(state, null, 1, 102);
  state = updateLiveReport(state, report(1, 6, { 6: { phase: 'prep' } }, 3), 1, 103);
  assert.equal(state.live!.report.rounds[0].assistPairs[0].owner, 3);
  assert.deepEqual(state.live!.report.rounds.map(row => row.number), [4, 5, 6]);
  const update = report(1, 6, { 4: { ...covered, assists_others: { 1: 0 }, assist_pairs: [] } }, 3);
  state = updateLiveReport(state, update, 1, 104);
  assert.deepEqual(state.live!.report.rounds[0].assistPairs, []);
  assert.equal(state.live!.report.rounds[0].assists[1], 0);
});

test('a corrected seat does not mislabel an old assist as mine or make the pair disappear', () => {
  const provisional = readBattleReport({ capture: { match: 1, round: 4, self: 3, self_basis: 'help' }, players: {}, rounds: { 4: covered } });
  const first = updateLiveReport({ history: [] }, provisional, 1, 100);
  const state = updateLiveReport(first, report(1, 5, { 5: { phase: 'prep' } }, 2), 1, 101);
  const html = detailView(state.live!.report, 4);
  assert.match(html, /队友互兜.*1号.*3号.*1/);
  assert.doesNotMatch(html, /我给谁兜|谁给我兜/);
});

test('mergeSameMatch locks a confirmed self seat against spectator drift and null updates', () => {
  const initial = readBattleReport({
    capture: { match: 4, round: 8, self: 4 },
    players: { 1: '甲', 2: '乙', 3: '丙', 4: '我' },
    eliminated: { 4: 8 },
    rounds: {
      8: {
        phase: 'settle',
        self_leaks: 1,
        self_leak_enemies: [typedEnemy],
      },
    },
  });
  let state = updateLiveReport({ history: [] }, initial, 1, 100);

  // Spectator 300/341 or sparse snapshot attempting to drift self to seat 3 or null must be ignored
  const driftedTo3 = readBattleReport({
    capture: { match: 4, round: 10, self: 3 },
    players: { 1: '甲', 2: '乙', 3: '丙', 4: '我' },
    eliminated: { 4: 8 },
    rounds: { 10: { phase: 'prep' } },
  });
  state = updateLiveReport(state, driftedTo3, 1, 110);
  assert.equal(state.live!.report.self, 4);
  assert.equal(state.live!.report.selfBySettlement, false);
  assert.equal(state.live!.report.rounds[0].selfLeakEnemies?.[0].id, typedEnemy.id);

  const driftedToHelp = readBattleReport({
    capture: { match: 4, round: 11, self: 3, self_basis: 'help' },
    players: {},
    rounds: { 11: { phase: 'settle' } },
  });
  state = updateLiveReport(state, driftedToHelp, 1, 120);
  assert.equal(state.live!.report.self, 4);
  assert.equal(state.live!.report.selfBySettlement, false);

  const driftedToNull = report(4, 12, { 12: { phase: 'prep' } }, null);
  state = updateLiveReport(state, driftedToNull, 1, 130);
  assert.equal(state.live!.report.self, 4);
  assert.equal(state.live!.report.selfBySettlement, false);
});

test('manual game nicknames label assists locally and stay with that match through refresh and reconnect', () => {
  const raw = report(9, 4, { 4: covered }, 3);
  let state = updateLiveReport({ history: [] }, raw, 1, 100);
  const key = state.live!.key;
  state = setReportPlayerNames(state, key, { 1: ' 测试队友#1000 ', 2: '  ', 3: '测试本人' });
  assert.equal(state.live!.report.names[1], '');
  const named = reportWithPlayerNames(state.live!);
  assert.equal(named.names[1], '测试队友#1000');
  assert.equal(named.names[2], '');
  const view = renderToStaticMarkup(createElement(BattleReportRoster, { entry: state.live!, report: named, seat: named.self, onViewSeat: () => {},
    onSave: () => {}, onSetSelfSeat: () => {} }));
  assert.match(view, /测试队友#1000.*手填/);
  assert.match(view, /补录昵称/);
  const html = detailView(named, 4);
  assert.match(html, /谁给我兜.*测试队友#1000.*1/);

  state = updateLiveReport(state, null, 1, 101);
  assert.equal(reportWithPlayerNames(state.history[0]).names[3], '测试本人');
  state = updateLiveReport(state, report(9, 5, { 5: {} }, 3), 1, 102);
  assert.equal(reportWithPlayerNames(state.live!).names[1], '测试队友#1000');

  const nextMatch = updateLiveReport(state, report(10, 1, { 1: {} }), 1, 103);
  const nextRun = updateLiveReport(state, report(9, 1, { 1: {} }), 2, 104);
  for (const next of [nextMatch, nextRun]) {
    assert.equal(reportWithPlayerNames(next.live!).names[1], '');
    assert.deepEqual(next.live!.report.rounds.map(row => row.number), [1]);
  }
});

test('a captured name takes precedence over manual entry and a sparse update cannot erase it', () => {
  let state = updateLiveReport({ history: [] }, report(9, 4, { 4: covered }, 3), 1, 100);
  state = setReportPlayerNames(state, state.live!.key, { 1: '临时昵称', 3: '本机补录' });
  const scene = readBattleReport({ capture: { match: 9, self: 3, round: 5 }, players: { 1: '游戏内昵称#1234' },
    battle_config: { mode_id: 'mode_multi_normal' }, rounds: {} });
  state = updateLiveReport(state, scene, 1, 101);
  state = updateLiveReport(state, report(9, 6, { 6: {} }, 3), 1, 102);
  assert.equal(reportWithPlayerNames(state.live!).names[1], '游戏内昵称#1234');
  assert.equal(reportWithPlayerNames(state.live!).names[3], '本机补录');
  assert.equal(reportWithPlayerNames(state.live!).rounds[0].assistPairs[0].count, 1);
  state = setReportPlayerNames(state, state.live!.key, { 3: '' });
  assert.equal(reportWithPlayerNames(state.live!).names[3], '');
});

test('manual local seat confirmation labels my seat and assist pairs, survives same-match updates, and resets for a new match', () => {
  const raw = readBattleReport({ capture: { match: 9, round: 2 }, players: { 1: '队友甲', 2: '队友乙' }, rounds: {
    1: { self_leaks: 2, assists_status: 'reported', assists: { 4: 2 },
      assist_pairs: [{ killer: 4, owner: 2, count: 2 }] },
  } });
  let state = updateLiveReport({ history: [] }, raw, 1, 100);
  const key = state.live!.key;
  state = setReportSelfSeat(state, key, 2);
  const named = reportWithPlayerNames(state.live!);
  assert.equal(named.self, 2);
  assert.equal(named.selfManual, true);
  const roster = renderToStaticMarkup(createElement(BattleReportRoster, { entry: state.live!, report: named, seat: named.self, onViewSeat: () => {},
    onSave: () => {}, onSetSelfSeat: () => {} }));
  assert.match(roster, /2号.*队友乙.*我/);
  assert.equal((roster.match(/class="d-seat-button"/g) ?? []).length, 4);
  const matrix = detailView(named, 1);
  assert.match(matrix, /本机席位：队友乙 · 手动确认/);
  assert.match(matrix, /谁给我兜.*4号.*2/);

  state = updateLiveReport(state, readBattleReport({ capture: { match: 9, round: 3 }, players: {}, rounds: {},
    battle_config: { mode_id: 'mode_multi_normal' } }), 1, 101);
  assert.equal(reportWithPlayerNames(state.live!).self, 2);
  const nextMatch = updateLiveReport(state, readBattleReport({ capture: { match: 10, round: 1 }, players: {}, rounds: {},
    battle_config: { mode_id: 'mode_multi_normal' } }), 1, 102);
  assert.equal(reportWithPlayerNames(nextMatch.live!).self, null);
  assert.equal(nextMatch.live!.manualSelfSeat, undefined);
});

test('overview shows the captured ID and who covered my leaks rather than four anonymous columns', () => {
  const data = readBattleReport({
    capture: { self: 2, self_basis: 'help' }, players: { 2: 'SyntheticSelf#1001', 3: 'SyntheticTeammate#1002' },
    rounds: { 2: { self_leaks: 2, assists_status: 'reported', assists: { 3: 2 },
      assist_pairs: [{ killer: 3, owner: 2, count: 2 }] } },
  });
  const html = detailView(data, 2);
  assert.match(html, /2号/);
  assert.match(html, /结算关联/);
  assert.match(html, /SyntheticSelf#1001/);
  assert.match(html, /谁给我兜.*SyntheticTeammate#1002.*2/);
  assert.doesNotMatch(html, /[1234]号协防/);
  assert.equal(data.rounds[0].unattributedAssists, 0);
});

test('overview distinguishes an unrecorded assist, unknown ownership and an explicit local zero', () => {
  const capture = report(1, 0, { 1: { self_leaks: 0 }, 2: { self_leaks: 2, assists_status: 'reported', assists: { 3: 1 } } }, null);
  const html = detailView(capture, 1) + detailView(capture, 2);
  assert.match(html, /席位未确认/);
  assert.match(html, /0 只/);
  assert.match(html, /战况未确认/);
  assert.match(html, /1 只协防击杀，未能确认漏怪者/);
  assert.doesNotMatch(html, /全队无漏|我给谁兜|谁给我兜/);
});

test('spawn preview hides source, owner and power; only battle rows aggregate different routes', () => {
  const data = readBattleReport({ players: {}, spawn_plan: [
    { round: 2, action: 0, enemy_id: 'enemy_example', name: '合成敌人', count: 5, unit_power: 98765, sources: ['合成来源'] },
  ], rounds: { 2: { wave_power: { rows: [1, 2].map(player => ({ player, action: 0, planned: 3,
    enemies: [{ id: 'enemy_example', name: '合成敌人', planned: 3 }] })) } } } });
  const plan = visibleSpawnRows(data, 'plan', '2', '合成');
  const battle = visibleSpawnRows(data, 'battle', '2', 'enemy_example');
  assert.deepEqual(plan.map(row => row.count), [5]);
  assert.deepEqual(battle.map(row => row.count), [6]);
  assert.deepEqual(visibleSpawnRows(data, 'battle', '1', ''), []);
  const html = renderToStaticMarkup(createElement(SpawnPreview, { report: data, filter: 2, onSelect: () => {} }));
  assert.match(html, /R2 波次.*第 1 批.*合成敌人.*×5/);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /归属|单体战力|合成来源|98,765/);
});

const typedEnemy = { id: portraits.ids[0], name: '合成漏怪', count: 1, unit_power: 300 };

test('round log shows actual outcome portraits and labels unidentified enemies clearly', () => {
  const data = readBattleReport({ capture: { match: 1, round: 4, self: 3 }, players: {}, rounds: { 4: {
    ...covered, self_leaks: 2, self_leak_enemies: [typedEnemy],
    assist_enemies: [{ ...typedEnemy, killer: 1, owner: 3 }],
  } }, spawn_plan: [{ round: 4, enemy_id: 'preview_only', name: '预告专用', count: 2 }] });
  const html = detailView(data, 4);
  assert.match(html, /本路漏怪.*d-report-portrait.*合成漏怪.*×1.*另有 1 只未记录怪种/);
  assert.match(html, /本路被兜住.*d-report-portrait.*合成漏怪.*×1/);
  assert.match(html, /本回合出怪预告.*预告专用/);
  assert.doesNotMatch(html.split('本回合出怪预告')[0], /预告专用/);
  assert.deepEqual(ownLeakPower(data.rounds[0], data), { value: 300, quality: 'partial' });
});

test('HP damage is explicit and fills missing enemy names from the own lane', () => {
  const data = report(1, 10, { 10: { self_leaks: 10, self_leak_enemies: [], hp_costs: { 3: 10 }, assists_status: 'unknown',
    wave_power: { confirmed_players: [3], rows: [{ player: 3, planned: 10, leaked: 10, power: 3000,
      enemies: [{ id: typedEnemy.id, name: typedEnemy.name, planned: 10, leaked: 10, unit_power: 300 }] }] } } }, 3);
  const html = detailView(data, 10);
  assert.match(html, /扣血.*10 点/);
  assert.doesNotMatch(html, /无人兜底/);
  assert.match(html, /本路漏怪.*合成漏怪.*×10/);
  assert.doesNotMatch(html, /尚未记录协防/);
  assert.deepEqual(ownLeakKinds(data.rounds[0], data), [{ id: typedEnemy.id, name: typedEnemy.name, count: 10, unitPower: 300 }]);

  const unknown = report(2, 10, { 10: { self_leaks: 2, assists_status: 'unknown' } }, 3);
  const unknownHtml = detailView(unknown, 10);
  assert.match(unknownHtml, /兜底未确认/);
  assert.doesNotMatch(unknownHtml, /无人兜底/);

  const partial = report(3, 10, { 10: { self_leaks: 2, hp_costs: { 3: 2 }, assist_pairs: [{ killer: 2, owner: 3, count: 1 }] } }, 3);
  const partialHtml = detailView(partial, 10);
  assert.match(partialHtml, /本路被兜住.*1 只/);
  assert.match(partialHtml, /扣血.*2 点/);
  assert.doesNotMatch(partialHtml, /无人兜底/);
});

test('remaining escaped enemies are shown as uncovered by their owning lane', () => {
  const data = report(1, 4, { 4: { self_leaks: 2, uncovered_leaks: { 3: 2 }, uncovered_status: 'reported' } }, 3);
  const html = detailView(data, 4);
  assert.match(html, /本路无人兜底/);
  assert.match(html, /本路未兜住 2 只/);
});

test('incomplete cooperative ownership displays a lane leak count as a lower bound', () => {
  const data = report(1, 4, { 4: { leaks: { 1: 0, 2: 1, 3: 0, 4: 1 }, leaks_status: 'observed', leak_minimums: { 4: 1 } } }, null);
  const html = detailView(data, 4);
  assert.match(html, /≥1 只/);
});

test('a catalog token is rendered as a named portrait even if the seat and assist stage are missing', () => {
  const token = { id: 'enemy_1137_plasm', name: '畸变赘生物', count: 2, unit_power: 1750 };
  const data = report(1, 0, { 8: { self_leaks: 2, self_leak_enemies: [token] } }, null);
  const html = detailView(data, 8);
  assert.match(html, /本路漏怪.*d-report-portrait.*畸变赘生物.*×2/);
  assert.doesNotMatch(html, /未记录种类/);
  assert.deepEqual(ownLeakPower(data.rounds[0], data), { value: 3500, quality: undefined });
});

test('local settlement types do not borrow types from a conflicting cooperative or preview row', () => {
  const data = report(5, 2, { 2: { self_leaks: 1, leaks: { 1: 2 },
    wave_power: { confirmed_players: [1], rows: [{ player: 1, leaked: 2, power: 600,
      enemies: [{ id: typedEnemy.id, name: typedEnemy.name, leaked: 2, unit_power: 300 }] }] } } });
  assert.deepEqual(ownLeakKinds(data.rounds[0], data), []);
  assert.equal(ownLeakPower(data.rounds[0], data), undefined);
});

test('round detail separates totals and round data without showing leak power', () => {
  const data = report(1, 4, { 3: { self_leaks: 1, self_leak_enemies: [typedEnemy] },
    4: { ...covered, self_leaks: 2, self_leak_enemies: [{ ...typedEnemy, count: 2 }] }, 5: {} }, 3);
  const view = (round: number | 'all') => detailView(data, round);
  const all = view('all');
  assert.match(all, /全部回合累计.*本路漏怪.*<strong>3 只/);
  assert.doesNotMatch(all, /\*/);
  assert.match(all, /合成漏怪.*×3/);
  assert.doesNotMatch(all, /战力/);
  const single = view(4);
  assert.match(single, /R4.*本路漏怪.*<strong>2 只/);
  assert.doesNotMatch(single, /全部回合累计|×3/);
  assert.match(view(6), /R6 暂无实战记录/);
});

test('preview follows confirmed current round, lets manual pins win, and does not infer a round from previews', () => {
  const data = report(1, 4, { 3: {}, 4: {} }, 3);
  assert.equal(resolvePreviewRound(data, 'follow'), 4);
  assert.equal(resolvePreviewRound({ ...data, current: null }, 'follow'), 4);
  assert.equal(resolvePreviewRound(report(1, 4, { 4: {}, 5: { phase: 'self' } }), 'follow'), 5);
  assert.equal(resolvePreviewRound({ ...data, current: null, rounds: [] }, 'follow'), 'all');
  assert.equal(resolvePreviewRound(data, 'all'), 'all');
  assert.equal(resolvePreviewRound(data, 2), 2);
  const html = renderToStaticMarkup(createElement(SpawnPreview, { report: data, filter: 'follow', onSelect: () => {} }));
  assert.match(html, /checked="".*仅看当前及后续回合/);
  assert.match(html, /R4 起/);
});

test('follow mode shows the nearest upcoming forecast without claiming an unconfirmed round', () => {
  const data = readBattleReport({ capture: { match: 1, round: 0, self: 1 }, players: {}, rounds: {
    1: { phase: 'settle' }, 2: { phase: 'settle' }, 3: { phase: 'settle' },
  }, spawn_plan: [
    { round: 1, action: 0, enemy_id: 'old_preview', name: '旧预告', count: 2 },
    { round: 4, action: 0, enemy_id: 'reconnect_preview', name: '重连后预告', count: 3 },
    { round: 9, action: 0, enemy_id: 'later_preview', name: '后续预告', count: 4 },
  ] });
  assert.equal(data.current, null);
  assert.equal(resolvePreviewRound(data, 'follow'), 4);
  const html = renderToStaticMarkup(createElement(SpawnPreview, { report: data, filter: 'follow', onSelect: () => {} }));
  assert.match(html, /当前回合未确认，暂从 R4 显示/);
  assert.match(html, /重连后预告/);
  assert.match(html, /后续预告/);
  assert.doesNotMatch(html, /旧预告|<small>当前<\/small>/);
});

test('the same R9 distinguishes the five results and both scopes without borrowing local identity', () => {
  const data = readBattleReport(demoReport('settled'));
  const outcome = (n: number, seat = 3) => roundOutcome(data.rounds[n - 1], data, seat, true);
  assert.deepEqual(data.rounds.map((_, i) => outcome(i + 1).tone), ['clean', 'covered', 'covered', 'covered', 'covered', 'breached', 'clean', 'covered', 'partial']);
  assert.match(outcome(6).note, /共漏 6 只 · 无人可协防/);
  assert.equal(outcome(9).label, '本路未兜住 3 只');
  assert.equal(outcome(9, 2).label, '本路已兜住');
  assert.match(outcome(9, 1).note, /全队未兜住 7 只/);
  const r9 = data.rounds[8];
  assert.equal(laneLeaks(r9, data, 4)?.value, 8);
  assert.deepEqual(laneKinds(r9, data, 4), []);
  assert.equal(laneKinds(r9, data, 3).length, 3);
  const html = detailView(data, 9);
  assert.match(html, /谁给我兜.*1号.*3.*队友互兜.*1号.*4号.*4.*1号.*2号.*1/);
  assert.doesNotMatch(html, /点回合可查看/);
  const pending = readBattleReport(demoReport('assisting'));
  assert.equal(roundOutcome(pending.rounds[8], pending, 3, true).tone, 'assisting');
  assert.equal(roundOutcome(pending.rounds[8], pending, 3, false).tone, 'unknown');
  const pendingHtml = renderToStaticMarkup(createElement(RoundMatrix, { report: pending, live: true, onPreview: () => {} }));
  assert.match(pendingHtml, /本路已漏 6 只 · 协防结算后自动刷新怪种/);
  assert.doesNotMatch(pendingHtml, /未识别怪物/);
});

test('partial evidence, HP cost, and legacy unassigned kills cannot prove a team or personal outcome', () => {
  for (const row of [{ self_leaks: 0 }, { leaks: { 1: 0 }, leaks_status: 'reported' },
    { self_leaks: 1, assists_status: 'reported', assist_pairs: [{ killer: 1, owner: 4, count: 1 }] },
    { self_leaks: 1, uncovered_status: 'reported' }, { hp_costs: { 3: 3 } }]) {
    const data = report(1, 9, { 9: row }, 3);
    assert.equal(roundOutcome(data.rounds[0], data, 3, true).tone, 'unknown');
  }
  const data = report(1, 9, { 9: { phase: 'assist', self_leaks: 2, assists_status: 'observed',
    uncovered_status: 'observed', uncovered_leaks: { 3: 1 }, assist_pairs: [{ killer: 1, owner: 3, count: 1 }] } }, 3);
  assert.equal(roundOutcome(data.rounds[0], data, 3, true).label, '本路未兜住 ≥1 只');
  const stale = report(1, 9, { 9: { phase: 'assist', self_leaks: 6 }, 10: { phase: 'prep' } }, 3);
  assert.equal(roundOutcome(stale.rounds[0], stale, 3, true).tone, 'unknown');
  const legacy = report(1, 9, { 9: { assists_status: 'reported', assists: { 3: 1, 4: 2 }, assist_pairs: [{ killer: 3, owner: 3, count: 1 }] } }, 3);
  assert.deepEqual(legacy.rounds[0].assists, { 3: 0 });
  assert.equal(legacy.rounds[0].unattributedAssists, 2);
});

test('team settlement survives a sparse frame but a new complete empty remainder corrects it', () => {
  const original = readBattleReport(demoReport('settled'));
  let records = updateLiveReport({ history: [] }, original, 1, 1);
  const correction = (row: object) => report(1, 10, { 9: row, 10: { phase: 'prep' } }, 3);
  records = updateLiveReport(records, correction({ phase: 'settle' }), 1, 2);
  let data = records.live!.report;
  assert.equal(roundOutcome(data.rounds[8], data, 3, false).label, '本路未兜住 3 只');
  records = updateLiveReport(records, correction({ assists_status: 'reported', uncovered_status: 'reported', uncovered_leaks: {} }), 1, 3);
  data = records.live!.report;
  assert.equal(roundOutcome(data.rounds[8], data, 3, false).tone, 'covered');
  assert.equal(data.rounds[8].assistPairs.length, 0);
});

test('opening renders only received R1 to R3 forecasts and the actual count of available rounds', () => {
  const data = readBattleReport(demoReport('opening'));
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, onPreview: () => {} }));
  assert.equal(data.preview.length, 117);
  assert.match(html, /R1 波次.*R2 波次.*R3 波次/);
  assert.doesNotMatch(html, /R4 波次|回合详情/);
  assert.match(html, /查看全部 15 回合预告/);
});

test('spawn preview defaults to merged summary for multi-round views and shows per-batch for single rounds', () => {
  const data = readBattleReport({
    players: {}, rounds: {},
    spawn_plan: [
      { round: 5, action: 0, enemy_id: 'enemy_a', name: '宿主士兵', count: 5 },
      { round: 5, action: 1, enemy_id: 'enemy_a', name: '宿主士兵', count: 5 },
      { round: 6, action: 0, enemy_id: 'enemy_b', name: '寻险水手', count: 4 },
    ],
  });
  const merged = renderToStaticMarkup(createElement(SpawnPreview, { report: data, filter: 'all', onSelect: () => {} }));
  assert.match(merged, /按怪汇总/);
  assert.match(merged, /2 批/);
  assert.match(merged, /宿主士兵.*×10/);
  assert.doesNotMatch(merged, /第 1 批/);
  const single = renderToStaticMarkup(createElement(SpawnPreview, { report: data, filter: 5, onSelect: () => {} }));
  assert.match(single, /第 1 批.*宿主士兵.*×5.*第 2 批.*宿主士兵.*×5/);
});

test('round matrix shows match strip, missing round gaps, inferred skipped-assist outcome and Npcap Boss hint', () => {
  const data = report(1, 0, {
    3: { self_leaks: 0, assists_status: 'reported', uncovered_status: 'reported' },
    5: { self_leaks: 1, assists_status: 'reported', assist_pairs: [{ killer: 2, owner: 4, count: 1 }], uncovered_status: 'reported' },
    8: { self_leaks: 1, assists_status: 'unknown', uncovered_status: 'unknown' },
    9: { self_leaks: 2, assists_status: 'reported', assist_pairs: [{ killer: 2, owner: 4, count: 2 }], uncovered_status: 'reported' },
  }, 4);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, live: true, onPreview: () => {} }));
  assert.match(html, /d-match-strip/);
  assert.match(html, /未记录.*R4/);
  assert.match(html, /d-round-gap.*R4.*未采到本回合结算/);
  assert.match(html, /未进协防 · 本路净漏/);
  const bossHtml = renderToStaticMarkup(createElement(BossDamage, {
    report: data, number: 14, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.match(bossHtml, /Npcap/);
});

test('all 26 V3_1 bond IDs map cleanly to covenant names and defeated Boss rounds render badges', () => {
  const expected = new Set<string>([...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES]);
  const mapped = new Set(Object.values(BOND_ID_TO_COVENANT));
  assert.equal(Object.keys(BOND_ID_TO_COVENANT).length, 26);
  assert.deepEqual(mapped, expected);
  assert.deepEqual(mapBannedBondsToCovenants(['yanShip', 'preciShip', 'unknownShip', 'yanShip']), ['炎', '精准']);

  const opening = readBattleReport({
    capture: { match: 7, round: 0, self: 1 },
    players: { 1: 'Self' },
    battle_config: { mode_id: 'mode_multi_hard', banned_bonds: ['sargonShip', 'arcaneShip'] },
    defeated_boss_rounds: [14],
    rounds: { 14: { phase: 'end', boss_ended: true, boss_damage: { 1: 12000 }, boss_status: 'settlement' } },
  });
  assert.deepEqual(opening.bannedCovenants, ['萨尔贡', '奥术']);
  assert.deepEqual(opening.defeatedBossRounds, [14]);

  const merged = updateLiveReport(
    updateLiveReport({ history: [] }, opening, 1, 10),
    report(7, 15, { 15: { phase: 'prep' } }, 1),
    1, 20,
  ).live!.report;
  assert.deepEqual(merged.bannedCovenants, ['萨尔贡', '奥术']);
  assert.deepEqual(merged.defeatedBossRounds, [14]);

  const bossHtml = renderToStaticMarkup(createElement(BossDamage, {
    report: opening, number: 14, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.match(bossHtml, /R14 · 已击败/);
  assert.match(bossHtml, /已击败首领/);

  const mockApi = {
    getState: async () => ({ status: 'listening' as const, report: null, reportRun: 1 }),
    showDiagnostics: async () => {},
    setEnabled: async () => ({ status: 'listening' as const, report: null, reportRun: 1 }),
    installNpcap: async () => ({ status: 'listening' as const, report: null, reportRun: 1 }),
    openNpcapPage: async () => true,
    recheckNpcap: async () => ({ status: 'listening' as const, report: null, reportRun: 1 }),
    onState: () => () => {},
  };
  const missingHtml = renderToStaticMarkup(createElement(NpcapSetupBanner, {
    api: mockApi, npcapInstalled: false, installState: { status: 'idle' },
  }));
  assert.match(missingHtml, /未检测到 Npcap 驱动/);
  assert.match(missingHtml, /一键安装 Npcap/);
  const doneHtml = renderToStaticMarkup(createElement(NpcapSetupBanner, {
    api: mockApi, npcapInstalled: true, installState: { status: 'installed', message: '已自动切换至驱动采集通道' },
  }));
  assert.match(doneHtml, /Npcap 驱动通道已就绪/);
  assert.doesNotMatch(doneHtml, /一键安装 Npcap/);
});

test('full player IDs omit seat number prefix unless missing, zero estimate becomes clean, no asterisks in totals, and covered/uncovered enemy kinds always show', () => {
  const data = readBattleReport({
    capture: { match: 1, round: 4, self: 3 },
    players: { 1: 'Shika', 2: '冰茶', 3: '乌尔比福的安水', 4: '' },
    battle_config: { mode_id: 'mode_multi_hard', boss_id: 'enemy_9032_aclionk' },
    rounds: {
      1: {
        phase: 'settle',
        leaks: { 1: 0, 2: 7, 3: 0, 4: 0 },
        leaks_status: 'reported',
        self_leaks: 0,
        assists_status: 'reported',
        assists_others: { 1: 0, 2: 0, 3: 0, 4: 7 },
        assist_pairs: [{ killer: 4, owner: 2, count: 7 }],
        assist_enemies: [{ id: typedEnemy.id, name: '青瓷茶器', count: 7, killer: 4, owner: 2 }],
        uncovered_status: 'reported',
        uncovered_leaks: {},
      },
      2: {
        phase: 'settle',
        self_leaks: 0,
        assists_status: 'skipped',
        skipped_hp_costs: { 1: 0, 2: 8, 3: 0, 4: 0 },
        uncovered_enemies: [{ id: typedEnemy.id, name: '未兜住怪', count: 2, owner: 2 }],
      },
      4: { phase: 'self' },
    },
  });

  const matrixHtml = renderToStaticMarkup(createElement(RoundMatrix, { report: data, live: true, onPreview: () => {} }));
  // R1 本路无漏但队友漏 7 只已被兜住，怪种列依然显示“青瓷茶器 ×7”
  assert.match(matrixHtml, /青瓷茶器.*×7/);
  // R2 未兜住的怪种同样显示
  assert.match(matrixHtml, /未兜住怪.*×2/);
  // 有玩家名字时直接全量显示 ID（不拼接“3号 · 乌尔比福的安水”），无名字才回退“4号”
  assert.match(matrixHtml, /d-strip-who.*乌尔比福的安水/);
  assert.doesNotMatch(matrixHtml, /3号累计漏怪|<bdi>3号<\/bdi>|· 乌尔比福的安水/);

  const allHtml = detailView(data, 'all');
  // 跳过协防且 0 扣血应判为“无漏”而非“≈0 只”，且全局累计不出现星号“*”，怪种明细排在底部
  assert.doesNotMatch(allHtml, /≈0|\*/);
  assert.match(allHtml, /队友互兜.*4号.*冰茶.*7.*d-bottom-enemies.*青瓷茶器/);

  const leader = { id: 'enemy_9032_aclionk', name: '阿利斯泰尔，帝国余晖', rounds: {
    14: { stats: [3700000, 1889.72116, 1030, 20, 8.2, 0] as const, attendants: [] },
  } };
  const leaderHtml = renderToStaticMarkup(createElement(LeaderInlineBar, {
    encounter: leader, round: 14, onOpen: () => {},
  }));
  assert.match(leaderHtml, /d-report-portrait/);
  assert.match(leaderHtml, /阿利斯泰尔，帝国余晖.*3,700,000.*1,890.*1,030.*20.*8\.2s.*0.*详情与路线/);

  // 验证图形化双栏条形图（我给谁兜 / 谁给我兜）排在上方，四席漏/兜微缩条形图居中，怪种折叠块沉底且无冗余句式
  const visualMatch = readBattleReport({
    capture: { match: 2, round: 13, self: 3 },
    players: { 1: 'Shika', 2: '冰茶', 3: '乌尔比福的安水', 4: '雪月六' },
    battle_config: { mode_id: 'mode_multi_hard' },
    rounds: {
      13: {
        phase: 'settle',
        leaks: { 1: 8, 2: 21, 3: 4, 4: 1 },
        leaks_status: 'reported',
        self_leaks: 4,
        self_leak_enemies: [{ id: typedEnemy.id, name: '青瓷茶器', count: 4 }],
        assists_status: 'reported',
        assists_others: { 1: 4, 2: 0, 3: 29, 4: 0 },
        assist_pairs: [
          { killer: 3, owner: 2, count: 21 },
          { killer: 3, owner: 1, count: 8 },
          { killer: 1, owner: 3, count: 4 },
          { killer: 4, owner: 2, count: 1 },
        ],
        uncovered_status: 'reported',
        uncovered_leaks: {},
      },
    },
  });
  const visualHtml = detailView(visualMatch, 'all');
  const outIdx = visualHtml.indexOf('我给谁兜');
  const inIdx = visualHtml.indexOf('谁给我兜');
  const seatCardsIdx = visualHtml.indexOf('d-report-seat-cards');
  const bottomEnemyIdx = visualHtml.indexOf('d-bottom-enemies');
  assert.ok(outIdx > 0 && inIdx > 0);
  assert.ok(outIdx < seatCardsIdx && inIdx < seatCardsIdx);
  assert.ok(seatCardsIdx < bottomEnemyIdx);
  assert.doesNotMatch(visualHtml, /与我相关|已知数据合计|全队漏怪已全额兜住/);
});

test('R15 BossDamage strips smart quotes, uses unified team denominator, and updates donut/subtitle cleanly', () => {
  const r15Report = readBattleReport({
    capture: { match: 7, round: 15, self: 1 },
    players: { 1: '乌尔比福的安水', 2: '冰茶', 3: '雪月六', 4: '星极' },
    battle_config: { mode_id: 'mode_multi_hard' },
    boss_rounds: [14, 15],
    rounds: {
      15: {
        phase: 'boss',
        boss_hp: 1500000,
        boss_damage: { 1: 901000, 2: 520000, 3: 410000, 4: 250000 },
        boss_percent: { 1: 43.3, 2: 25.0, 3: 19.7, 4: 12.0 },
        boss_status: 'reported',
        boss_official: [
          { player: 1, identifier: 1001, char_id: 'char_pramanix_2', operator_name: '“圣聆初雪”', damage: 649000 },
          { player: 2, identifier: 1002, char_id: 'char_4064_mlynar', operator_name: '玛恩纳', damage: 44000 },
        ],
      },
    },
  });
  const html = renderToStaticMarkup(createElement(BossDamage, {
    report: r15Report, number: 15, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.doesNotMatch(html, /“圣聆初雪”|93\.7%/);
  assert.match(html, /圣聆初雪/);
  assert.match(html, /31\.2%/);
  assert.match(html, /全队输出/);
  assert.match(html, /官方前2干员合计.*其余席位见左侧总览/);
  assert.match(html, /已同步实时伤害与官方榜单/);
});

test('R11 WaveDetails applies killer seat colors to peer bars and omits duplicate covered pill', () => {
  const r11Report = readBattleReport({
    capture: { match: 8, round: 11, self: 1 },
    players: { 1: '我方', 2: '二号', 3: '三号', 4: '四号' },
    battle_config: { mode_id: 'mode_multi_hard' },
    rounds: {
      11: {
        phase: 'settle',
        self_leaks: 1,
        leaks: { 1: 1, 2: 0, 3: 2, 4: 0 },
        leaks_status: 'reported',
        assists_status: 'reported',
        assists_others: { 1: 0, 2: 1, 3: 0, 4: 2 },
        assist_pairs: [
          { killer: 2, owner: 1, count: 1 },
          { killer: 4, owner: 3, count: 2 },
        ],
        uncovered_status: 'reported',
        uncovered_leaks: {},
      },
    },
  });
  const html = detailView(r11Report, 11);
  assert.match(html, /is-peer seat-fill-4/);
  assert.match(html, /本路已兜住/);
  assert.match(html, /本路漏怪/);
  assert.doesNotMatch(html.split('d-assist-visual')[0], /本路被兜住/);
});

test('BossDamage displays Npcap downlink hint when only uplink boss damage is present without current scene', () => {
  const uplinkOnlyReport = readBattleReport({
    capture: { match: 9, self: 1 },
    players: {},
    rounds: {
      14: {
        phase: 'boss',
        boss_uplink: { 1: 420000 },
        boss_uplink_rows: [{ seat: 1, identifier: 10, char_id: 'char_4087_ines', operator_name: '伊内丝', source: 0, damage: 420000 }],
      },
    },
  });
  const uplinkHtml = renderToStaticMarkup(createElement(BossDamage, {
    report: uplinkOnlyReport, number: 14, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.match(uplinkHtml, /d-report-npcap-hint/);
  assert.match(uplinkHtml, /当前未检测到 Npcap 下行（仅本端上报口径）/);

  const normalReport = readBattleReport({
    capture: { match: 9, round: 14, self: 1 },
    players: { 1: '我方', 2: '二号' },
    rounds: {
      14: {
        phase: 'boss',
        boss_status: 'settlement',
        boss_damage: { 1: 420000, 2: 380000 },
      },
    },
  });
  const normalHtml = renderToStaticMarkup(createElement(BossDamage, {
    report: normalReport, number: 14, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.doesNotMatch(normalHtml, /当前未检测到 Npcap 下行（仅本端上报口径）/);
});

test('mergeLoadedHistory deduplicates persisted records and prevents cross-session live key collision', async () => {
  const { mergeLoadedHistory, removeHistoryRecord, updateLiveReport } = await import('./battleReports');
  const oldReport = readBattleReport({
    capture: { match: 1, round: 5, self: 1 },
    players: { 1: '旧局玩家' },
    rounds: { 5: { phase: 'settle', self_leaks: 0 } },
  });
  const saved = {
    key: 'saved:report-1732700000000-1',
    storageId: 'report-1732700000000-1',
    label: '本地对局 1',
    seenAt: 1732700000000,
    report: oldReport,
  };
  const hydrated = mergeLoadedHistory({ history: [] }, [saved, saved]);
  assert.equal(hydrated.history.length, 1);

  // New launch starts a brand-new match with run=1, match=1 -> must NOT merge into yesterday's saved match!
  const newReport = readBattleReport({
    capture: { match: 1, round: 1, self: 1 },
    players: { 1: '新局玩家' },
    rounds: { 1: { phase: 'prep' } },
  });
  const afterNew = updateLiveReport(hydrated, newReport, 1, 1732780000000);
  assert.equal(afterNew.live?.report.names[1], '新局玩家');
  assert.equal(afterNew.live?.report.rounds.length, 1);
  assert.equal(afterNew.history.length, 1);
  assert.equal(afterNew.history[0].report.names[1], '旧局玩家');

  const afterRemove = removeHistoryRecord(afterNew, saved.key);
  assert.equal(afterRemove.history.length, 0);
});

test('Boss view prefers full own uplink sum over single Top-3 operator and labels milestone floor vs 未入前3', () => {
  const partialBoss = readBattleReport({
    capture: { match: 1, round: 14, self: 2 },
    players: { 1: '队友甲', 2: '本机乙', 3: '队友丙', 4: '队友丁' },
    battle_config: { mode_id: 'mode_multi_abyss' },
    rounds: {
      14: {
        phase: 'boss',
        boss_hp: 16200000,
        boss_status: 'unknown',
        boss_official: [
          { player: 2, identifier: 101, damage: 2579000, operator_name: '艾雅法拉' },
          { player: 1, identifier: 102, damage: 2179000, operator_name: '蓝毒' },
        ],
        boss_uplink: { 2: 4100000 },
        boss_percent: { 3: 20 },
      },
    },
  });
  const html = renderToStaticMarkup(createElement(BossDamage, {
    report: partialBoss, number: 14, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.match(html, /410万/, 'Seat 2 should display full uplink total (410万) rather than single Top-3 operator (257.9万)');
  assert.match(html, /全队 · 血25\.3%/, 'Seat 2 uplink should be labeled 全队 + Boss HP share rather than misleading team share');
  assert.match(html, /单卡 · 血13\.5%/, 'Seat 1 Top-3 single op should be labeled 单卡 + Boss HP share');
  assert.match(html, /≥324万/, 'Seat 3 with 20% milestone should display floor ≥324万');
  assert.match(html, /达 20%/);
  assert.match(html, /未入前3/, 'Seat 4 outside Top-3 with no milestone should display clear 未入前3 label');
  assert.match(html, /已观测输出/);
});

test('HUD and Telemetry Boss HP drop to 0 when defeated and avoid bogus remaining HP during Top-3 only combat', async () => {
  const { buildHudBossTeamData } = await import('./hudTelemetryViewModel');
  const { BattleReportTelemetry } = await import('./BattleReportTelemetry');

  const defeatedReport = readBattleReport({
    capture: { match: 1, round: 15, self: 2 },
    players: { 1: '队友甲', 2: '本机乙', 3: '队友丙', 4: '队友丁' },
    battle_config: { mode_id: 'mode_multi_abyss', boss_id: 'enemy_boss_1' },
    defeated_boss_rounds: [14],
    rounds: {
      14: {
        phase: 'boss',
        boss_ended: true,
        boss_hp: 15799000,
        boss_status: 'unknown',
        boss_official: [
          { player: 2, identifier: 101, damage: 2704000, operator_name: '艾雅法拉' },
          { player: 4, identifier: 102, damage: 1778000, operator_name: '霍尔海雅' },
        ],
        boss_uplink: { 2: 4694000 },
      },
    },
    telemetry: {
      scope: 'coop_boss',
      source: 'protocol_wire',
      coverage: 'protocol',
      logic_seconds: 74.2,
      team_total_damage: 4482000,
      operators: [
        { char_id: 'char_1', name: '艾雅法拉', seat: 2, total_damage: 2704000, share_ratio: 0.6 },
        { char_id: 'char_2', name: '霍尔海雅', seat: 4, total_damage: 1778000, share_ratio: 0.4 },
      ],
      enemy_pool: {
        active_count: 1,
        defeated_count: 0,
        respawn_resets: 0,
        live_hp: 11317000,
        live_max_hp: 15799000,
        boss: { enemy_id: 'enemy_boss_1', name: '本局首领', hp: 11317000, max_hp: 15799000 },
      },
      rounds: {
        '14': {
          scope: 'coop_boss',
          source: 'protocol_wire',
          coverage: 'protocol',
          logic_seconds: 74.2,
          team_total_damage: 4482000,
          operators: [],
        },
      },
    },
  });

  const hudDefeated = buildHudBossTeamData({
    parsed: defeatedReport,
    bossRound: defeatedReport.rounds[0],
    bossPool: defeatedReport.telemetry?.enemyPool?.boss ?? null,
    bossLeader: null,
    bossElapsedSec: 74.2,
    soloMode: false,
    selfSeat: 2,
  });
  assert.equal(hudDefeated.defeated, true);
  assert.equal(hudDefeated.bossHp, 0);
  assert.equal(hudDefeated.hpPct, 0);
  assert.equal(hudDefeated.hasServerTotals, false);
  assert.equal(hudDefeated.rows.find(r => r.seat === 2)?.sourceKind, 'uplink');
  assert.equal(hudDefeated.rows.find(r => r.seat === 4)?.sourceKind, 'top3');

  const teleDefeatedHtml = renderToStaticMarkup(createElement(BattleReportTelemetry, { report: defeatedReport }));
  assert.match(teleDefeatedHtml, /已击破 · 剩余生命 <b>0<\/b>/);

  // Mid-combat before defeat: must NOT claim maxHp - top3Sum is real remaining HP
  const midCombatReport = readBattleReport({
    ...({
      capture: { match: 1, round: 14, self: 2 },
      players: { 2: '本机乙', 4: '队友丁' },
      battle_config: { mode_id: 'mode_multi_abyss', boss_id: 'enemy_boss_1' },
      defeated_boss_rounds: [],
      rounds: {
        14: {
          phase: 'boss',
          boss_hp: 15799000,
          boss_status: 'unknown',
          boss_official: [{ player: 2, identifier: 101, damage: 2704000, operator_name: '艾雅法拉' }],
        },
      },
      telemetry: {
        scope: 'coop_boss',
        source: 'protocol_wire',
        coverage: 'protocol',
        logic_seconds: 40,
        team_total_damage: 2704000,
        operators: [{ char_id: 'char_1', name: '艾雅法拉', seat: 2, total_damage: 2704000, share_ratio: 1 }],
        enemy_pool: {
          active_count: 1,
          defeated_count: 0,
          respawn_resets: 0,
          live_hp: 13095000,
          live_max_hp: 15799000,
          boss: { enemy_id: 'enemy_boss_1', name: '本局首领', hp: 13095000, max_hp: 15799000 },
        },
        rounds: {},
      },
    }),
  });
  const teleMidHtml = renderToStaticMarkup(createElement(BattleReportTelemetry, { report: midCombatReport }));
  assert.match(teleMidHtml, /前3单卡已观测/);
  assert.match(teleMidHtml, /非实时剩余血量/);
});

test('Boss milestone 20% upgrades smaller Top-3 card, keeps duplicate official Top-3 cards separate, and surfaces R14 defeated residual HP cap', async () => {
  const { buildHudBossTeamData } = await import('./hudTelemetryViewModel');

  // 1. Mid-combat R15: Seat 2 has Top-3 single card 294.5万 (10%) AND 366 milestone 20% (579万) -> must upgrade to milestone!
  const midR15 = readBattleReport({
    capture: { match: 1, round: 15, self: 1 },
    players: { 1: '乌尔比福的安水', 2: '歌蕾蒂精的雅液', 3: '克莱红莎的龙门', 4: '晶梅' },
    battle_config: { mode_id: 'mode_multi_abyss' },
    rounds: {
      15: {
        phase: 'boss',
        boss_hp: 28952200,
        boss_status: 'unknown',
        boss_official: [
          { player: 1, identifier: 101, char_id: 'char_iron', operator_name: '暴躁铁皮', damage: 8100000 },
          { player: 2, identifier: 102, char_id: 'char_mlynar', operator_name: '玛恩纳', damage: 2945000 },
          { player: 1, identifier: 103, char_id: 'char_iron', operator_name: '暴躁铁皮', damage: 1150000 },
        ],
        boss_uplink: { 1: 16368000, 4: 3803000 },
        boss_percent: { 1: 50, 2: 20 },
      },
    },
  });
  const hud = buildHudBossTeamData({
    parsed: midR15,
    bossRound: midR15.rounds[0],
    bossPool: null,
    bossLeader: null,
    bossElapsedSec: 88,
    soloMode: false,
    selfSeat: 1,
  });
  const seat2 = hud.rows.find(r => r.seat === 2);
  assert.equal(seat2?.sourceKind, 'milestone', '20% milestone (579万) must override smaller Top-3 card (294.5万)');
  assert.equal(seat2?.damage, 5790440);
  assert.equal(seat2?.rank, 2, 'Upgraded Seat 2 should rank above Seat 4 (380.3万)');
  assert.equal(hud.hpPct, null, 'hpPct remains null without real server HP');
  assert.ok(hud.estRemainPct !== null && hud.estRemainPct > 0 && hud.estRemainPct < 100, 'estRemainPct drives live HP bar fill');

  // 2. Defeated R14 without server totals: duplicate Top-3 cards stay as Top 3 + missing Seat 3 shows residual upper bound (≤211.9万)
  const r14Defeated = readBattleReport({
    capture: { match: 1, round: 15, self: 1 },
    players: { 1: '乌尔比福的安水', 2: '歌蕾蒂精的雅液', 3: '克莱红莎的龙门', 4: '晶梅' },
    battle_config: { mode_id: 'mode_multi_abyss' },
    defeated_boss_rounds: [14],
    rounds: {
      14: {
        phase: 'boss',
        boss_ended: true,
        boss_hp: 16200400,
        boss_status: 'unknown',
        boss_official: [
          { player: 1, identifier: 101, char_id: 'char_iron', operator_name: '暴躁铁皮', damage: 9000000 },
          { player: 1, identifier: 102, char_id: 'char_iron', operator_name: '暴躁铁皮', damage: 2467000 },
          { player: 2, identifier: 103, char_id: 'char_mlynar', operator_name: '玛恩纳', damage: 1517000 },
        ],
        boss_uplink: { 4: 1097000 },
      },
    },
  });
  const html = renderToStaticMarkup(createElement(BossDamage, {
    report: r14Defeated, number: 14, onRound: () => {}, onPreview: () => {}, reference: null,
  }));
  assert.match(html, /Top 3/, 'Two duplicate 暴躁铁皮 cards in official Top-3 must not collapse into Top 2');
  assert.match(html, /≤211\.9万/, 'Missing seat on defeated partial R14 should show residual HP upper bound');
  assert.match(html, /未入前3 · 余血上限/);
  assert.match(html, /未归因 13\.1%/, 'Boss HP segmented bar should show unattributed residual segment');
  assert.match(html, /上报 · 血6\.8%/, 'Teammate uplink should be labeled 上报 instead of misleading 全队');
});
