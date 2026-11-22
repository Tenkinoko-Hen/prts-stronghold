import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BossDamage, RoundMatrix, SpawnPreview, WaveDetails } from './BattleReportPanels';
import { BattleReportRoster } from './BattleReportRoster';
import { defaultBossRound, hasBossDamage, ownLeakKinds, ownLeakPower, ownRoundLeaks, readBattleReport, reportProgress, resolvePreviewRound,
  roundMetrics, visibleSpawnRows } from './battleReportData';
import { reportWithPlayerNames, setReportPlayerNames, setReportSelfSeat, updateLiveReport } from './battleReports';
import portraits from './enemyPortraits.json';

const report = (match: number, current: number, rounds: Record<number, unknown>, self: number | null = 1) =>
  readBattleReport({ capture: { match, round: current, self }, players: {}, rounds });

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
  const first = updateLiveReport({ history: [] }, report(1, 4, { 4: covered }, 3), 1, 100);
  const state = updateLiveReport(first, report(1, 5, { 5: { phase: 'prep' } }, 2), 1, 101);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: state.live!.report, onRound: () => {} }));
  assert.match(html, /1号.*帮.*3号.*兜底.*1 只/);
  assert.doesNotMatch(html, /帮 <strong>我<\/strong> 兜底/);
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
  const view = renderToStaticMarkup(createElement(BattleReportRoster, { entry: state.live!, report: named,
    onSave: () => {}, onSetSelfSeat: () => {} }));
  assert.match(view, /测试队友#1000.*手填/);
  assert.match(view, /补录昵称/);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: named, onRound: () => {} }));
  assert.match(html, /测试队友#1000.*帮 <strong>我<\/strong> 兜底.*1 只/);

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
  const roster = renderToStaticMarkup(createElement(BattleReportRoster, { entry: state.live!, report: named,
    onSave: () => {}, onSetSelfSeat: () => {} }));
  assert.match(roster, /2号.*队友乙.*我/);
  assert.match(roster, /已选 2号/);
  const matrix = renderToStaticMarkup(createElement(RoundMatrix, { report: named, onRound: () => {} }));
  assert.match(matrix, /2号.*手动确认/);
  assert.match(matrix, /4号.*帮.*我.*兜底.*2 只/);

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
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, onRound: () => {} }));
  assert.match(html, /2号/);
  assert.match(html, /结算关联/);
  assert.match(html, /SyntheticSelf#1001/);
  assert.match(html, /SyntheticTeammate#1002.*帮.*我.*兜底.*2 只/);
  assert.doesNotMatch(html, /[1234]号协防/);
  assert.equal(data.rounds[0].unattributedAssists, 0);
});

test('overview distinguishes an unrecorded assist, unknown ownership and an explicit local zero', () => {
  const capture = report(1, 0, { 1: { self_leaks: 0 }, 2: { self_leaks: 2, assists_status: 'reported', assists: { 3: 1 } } }, null);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: capture, onRound: () => {} }));
  assert.match(html, /席位未确认/);
  assert.match(html, /0 只/);
  assert.match(html, /尚未记录协防/);
  assert.match(html, /1 只协防击杀，未能确认漏怪者/);
  assert.doesNotMatch(html, /帮 <strong>我<\/strong> 兜底/);
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
  assert.match(html, /回合.*批次.*敌人.*数量/);
  assert.match(html, /R2.*第 1 批.*合成敌人.*>5</);
  assert.doesNotMatch(html, /归属|单体战力|来源|98,765/);
});

const typedEnemy = { id: portraits.ids[0], name: '合成漏怪', count: 1, unit_power: 300 };

test('round log shows actual outcome portraits and labels unidentified enemies clearly', () => {
  const data = readBattleReport({ capture: { match: 1, round: 4, self: 3 }, players: {}, rounds: { 4: {
    ...covered, self_leaks: 2, self_leak_enemies: [typedEnemy],
    assist_enemies: [{ ...typedEnemy, killer: 1, owner: 3 }],
  } }, spawn_plan: [{ round: 4, enemy_id: 'preview_only', name: '预告专用', count: 2 }] });
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, onRound: () => {} }));
  assert.match(html, /怪物记录/);
  assert.match(html, /本路漏怪.*d-report-portrait.*合成漏怪.*×1.*另有 1 只未识别怪物/);
  assert.match(html, /已兜住.*d-report-portrait.*合成漏怪.*×1/);
  assert.doesNotMatch(html, /队伍明细|本路概览|预告专用/);
  assert.deepEqual(ownLeakPower(data.rounds[0], data), { value: 300, quality: 'partial' });
});

test('HP damage is explicit and fills missing enemy names from the own lane', () => {
  const data = report(1, 10, { 10: { self_leaks: 10, self_leak_enemies: [], hp_costs: { 3: 10 }, assists_status: 'unknown',
    wave_power: { confirmed_players: [3], rows: [{ player: 3, planned: 10, leaked: 10, power: 3000,
      enemies: [{ id: typedEnemy.id, name: typedEnemy.name, planned: 10, leaked: 10, unit_power: 300 }] }] } } }, 3);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, onRound: () => {} }));
  assert.match(html, /无人兜底 · 漏怪 10 只 · 扣血 10 点/);
  assert.match(html, /本路漏怪.*合成漏怪.*×10/);
  assert.doesNotMatch(html, /尚未记录协防/);
  assert.deepEqual(ownLeakKinds(data.rounds[0], data), [{ id: typedEnemy.id, name: typedEnemy.name, count: 10, unitPower: 300 }]);

  const unknown = report(2, 10, { 10: { self_leaks: 2, assists_status: 'unknown' } }, 3);
  const unknownHtml = renderToStaticMarkup(createElement(RoundMatrix, { report: unknown, onRound: () => {} }));
  assert.match(unknownHtml, /尚未记录协防/);
  assert.doesNotMatch(unknownHtml, /无人兜底/);

  const partial = report(3, 10, { 10: { self_leaks: 2, hp_costs: { 3: 2 }, assist_pairs: [{ killer: 2, owner: 3, count: 1 }] } }, 3);
  const partialHtml = renderToStaticMarkup(createElement(RoundMatrix, { report: partial, onRound: () => {} }));
  assert.match(partialHtml, /仍有本路漏怪未兜住/);
  assert.doesNotMatch(partialHtml, /无人兜底/);
});

test('remaining escaped enemies are shown as uncovered by their owning lane', () => {
  const data = report(1, 4, { 4: { self_leaks: 2, uncovered_leaks: { 3: 2 }, uncovered_status: 'reported' } }, 3);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, onRound: () => {} }));
  assert.match(html, /无人兜底 · 漏怪 2 只/);
});

test('incomplete cooperative ownership displays a lane leak count as a lower bound', () => {
  const data = report(1, 4, { 4: { leaks: { 1: 0, 2: 1, 3: 0, 4: 1 }, leaks_status: 'observed', leak_minimums: { 4: 1 } } }, null);
  const html = renderToStaticMarkup(createElement(WaveDetails, { report: data, round: 4, onRound: () => {}, onPreview: () => {} }));
  assert.match(html, /≥1 只/);
});

test('a catalog token is rendered as a named portrait even if the seat and assist stage are missing', () => {
  const token = { id: 'enemy_1137_plasm', name: '畸变赘生物', count: 2, unit_power: 1750 };
  const data = report(1, 0, { 8: { self_leaks: 2, self_leak_enemies: [token] } }, null);
  const html = renderToStaticMarkup(createElement(RoundMatrix, { report: data, onRound: () => {} }));
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

test('round detail timeline separates totals and round data without showing leak power', () => {
  const data = report(1, 4, { 3: { self_leaks: 1, self_leak_enemies: [typedEnemy] },
    4: { ...covered, self_leaks: 2, self_leak_enemies: [{ ...typedEnemy, count: 2 }] }, 5: {} }, 3);
  const view = (round: number | 'all') => renderToStaticMarkup(createElement(WaveDetails, { report: data, round,
    onRound: () => {}, onPreview: () => {} }));
  const all = view('all');
  assert.match(all, /aria-pressed="true">全部回合/);
  assert.match(all, /全部回合累计.*我漏怪 <strong>3\* 只/);
  assert.match(all, /合成漏怪.*×3/);
  assert.doesNotMatch(all, /战力/);
  const single = view(4);
  assert.match(single, /R4 · .*我漏怪 <strong>2 只/);
  assert.doesNotMatch(single, /全部回合累计|×3/);
  assert.match(view(6), /R6 暂无实战记录/);
});

test('preview follows confirmed current round, lets manual pins win, and does not infer a round from previews', () => {
  const data = report(1, 4, { 4: {}, 5: {} }, 3);
  assert.equal(resolvePreviewRound(data, 'follow'), 4);
  assert.equal(resolvePreviewRound({ ...data, current: null }, 'follow'), 5);
  assert.equal(resolvePreviewRound({ ...data, current: null, rounds: [] }, 'follow'), 'all');
  assert.equal(resolvePreviewRound(data, 'all'), 'all');
  assert.equal(resolvePreviewRound(data, 2), 2);
  const html = renderToStaticMarkup(createElement(SpawnPreview, { report: data, filter: 'follow', onSelect: () => {} }));
  assert.match(html, /全部回合.*>R1<.*>R2<.*>R15<.*跟随回合/);
  assert.match(html, /aria-pressed="true" aria-current="step"[^>]*>R4</);
  assert.doesNotMatch(html, /搜索敌人|<select/);
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
  assert.match(html, /当前回合未确认，先显示 R4 预告/);
  assert.match(html, /重连后预告/);
  assert.doesNotMatch(html, /后续预告/);
  assert.match(html, /aria-pressed="true" data-available="true" title="R4">R4<\/button>/);
  assert.doesNotMatch(html, /aria-current="step"/);
});
