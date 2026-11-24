import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STRONGHOLD_REPORT_BRAND, TELEMETRY_REPORT_BRAND } from '../brand/productBrand';
import { readBattleReport } from './battleReportData';
import { renderBattleReportHtml } from './battleReportDocument';
import { exportCount, summarizeBattleReport } from './battleReportExport';
import { demoReport } from './demo/battleReportFixture';

const date = new Date(2026, 10, 23, 15, 42);
const entry = { label: '本地对局 1', seenAt: date.getTime() - 3600000 };
const css = readFileSync(new URL('./battleReportDocument.css', import.meta.url), 'utf8');
const summary = (raw: unknown, live = true) => summarizeBattleReport(entry, readBattleReport(raw), live, date);
const values = (r: ReturnType<typeof summary>) => [r.gross, r.helps, r.net].map(exportCount);

test('nine played rounds, pre-assist leaks, confirmed net, MVP and all three R9 links agree', () => {
  const result = summary(demoReport('settled'));
  assert.deepEqual(result.rounds.map(r => r.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(result.clean, 2);
  assert.deepEqual(values(result), ['33', '20', '13']);
  assert.deepEqual([...new Set(result.rounds.map(r => r.label))], ['全队无漏', '已兜住', '全队均漏', '部分兜住']);
  assert.equal(result.players[0].top, '协防最多');
  assert.equal(result.players[2].self, true);
  assert.equal(result.players[2].cleanRatio, '22.2%（2/9）');
  assert.deepEqual(result.rounds.at(-1)?.links, ['1号 → 3号 兜底 3 只（潜伏者×3）',
    '1号 → 2号 兜底 1 只（未记录怪种×1）', '1号 → 4号 兜底 4 只（未记录怪种×4）']);
  assert.equal(summary(demoReport('assisting')).rounds.at(-1)?.label, '协防中');
  assert.equal(summary(demoReport('assisting'), false).rounds.at(-1)?.tone, 'unknown');
  assert.equal(result.bosses.length, 0);
});

test('only forecasts and preparation cannot be exported; explicit zero and attributed wave evidence count', () => {
  const raw = demoReport('opening');
  raw.rounds = { 1: { phase: 'prep' }, 15: { phase: 'boss_wait', boss_plan: { id: 'boss_8' },
    wave_power: { rows: [{ player: 2, planned: 3, enemies: [{ id: 'enemy_1006_shield', planned: 3 }] }] } } };
  assert.equal(summary(raw).rounds.length, 0);
  raw.rounds[2] = { self_leaks: 0 };
  raw.rounds[3] = { wave_power: { confirmed_players: [2], rows: [{ player: 2, leaked: 2,
    enemies: [{ id: 'enemy_1006_shield', name: '重装防御者', leaked: 2 }] }] } };
  const r = summary(raw);
  assert.deepEqual(r.rounds.map(item => item.number), [2, 3]);
  assert.equal(r.clean, 0);
  assert.equal(exportCount(r.net), '—');
  assert.equal(exportCount(r.players[1].leaks), '2');
  assert.equal(r.hasPartial, true);
  assert.equal(r.rounds[1].enemies[0].kinds[0].name, '重装防御者');
});

test('same-seat wave detail can complete a partial list but cannot add, contradict, or borrow from another seat', () => {
  const kinds = (player: number, ids: string[], confirmed = true) => {
    const r = summary({ capture: { self: 3 }, players: {}, rounds: { 9: {
      self_leaks: 2, self_leak_enemies: [{ id: 'a', count: 1 }],
      wave_power: { confirmed_players: confirmed ? [player] : [], rows: [{ player, leaked: ids.length,
        enemies: ids.map(id => ({ id, leaked: 1 })) }] },
    } } });
    return Object.fromEntries(r.rounds[0].lanes[2].kinds.map(e => [e.id, e.count]));
  };
  assert.deepEqual(kinds(3, ['a', 'b']), { a: 1, b: 1 });
  for (const incomplete of [kinds(3, ['b', 'c']), kinds(3, ['a']), kinds(2, ['a', 'b']), kinds(3, ['a', 'b'], false)])
    assert.deepEqual(incomplete, { a: 1, '': 1 });
});

test('positive unassigned escapes are combat evidence, not clean rounds or kills attributed to a player', () => {
  const wave_power = { rows: [{ player: 0, leaked: 2, enemies: [{ id: 'a', leaked: 2 }] }] };
  const r = summary({ players: {}, rounds: { 1: { wave_power }, 2: {
    leaks_status: 'reported', leaks: { 1: 0, 2: 0, 3: 0, 4: 0 }, wave_power,
  } } });
  assert.equal(r.rounds.length, 2);
  assert.equal(r.clean, 0);
  for (const row of r.rounds) {
    assert.equal(exportCount(row.gross), '≥2');
    assert.equal(exportCount(row.net), '—');
    assert.equal(exportCount(row.helps), '—');
    assert.deepEqual(row.enemies.map(g => [g.label, g.kinds[0].id, g.kinds[0].count]), [['波次漏怪（席位未确认）', 'a', 2]]);
  }
});

test('explicitly skipped assistance keeps the known net leaks without claiming that all four lanes leaked', () => {
  const r = summary({ capture: { self: 3 }, players: {}, rounds: { 9: {
    self_leaks: 2, leaks: { 3: 2 }, leaks_status: 'observed', assists_status: 'skipped',
    skipped_hp_costs: { 3: 2 }, uncovered_leaks: {}, uncovered_status: 'unknown',
  } } });
  assert.deepEqual(values(r), ['2', '0', '≥2']);
  assert.equal(r.hasPartial, true);
  assert.equal(r.rounds[0].label, '未进入协防');
});

test('self-cleanups are not teammate assists, unknown owners remain unassigned and tied top seats are marked', () => {
  const r = summary({ players: {}, rounds: { 1: { phase: 'settle', assists_status: 'reported', assists_others_status: 'reported',
    assists_others: { 1: 2, 2: 2, 3: 0, 4: 0 }, assist_pairs: [{ killer: 3, owner: 3, count: 5 },
      { killer: 1, owner: 4, count: 2 }], unattributed_assists: 2, uncovered_leaks: { 1: 1 }, uncovered_status: 'observed' } } });
  assert.equal(exportCount(r.helps), '4');
  assert.equal(exportCount(r.net), '≥1');
  assert.deepEqual(r.players.map(p => p.top), ['协防最多', '协防最多', '', '']);
  assert.match(r.rounds[0].links.join(';'), /3号 → 3号 自补 5 只/);
  assert.match(r.rounds[0].links.join(';'), /2号 → 未确认席位 兜底 2 只/);
  assert.equal(r.rounds[0].links.length, 3);
});

test('Boss shares use team damage, not boss HP, and never double count independent sources', () => {
  const r = summary({ players: {}, battle_config: { boss_id: 'boss_1' }, rounds: {
    14: { phase: 'end', boss_damage: { 1: 4500, 2: 2500, 3: 2000, 4: 1000 }, boss_percent: { 1: 9 }, boss_status: 'settlement',
      boss_official: [{ player: 1, identifier: 1, damage: 300 }], boss_uplink: { 1: 400 }, boss_round_basis: 'inferred' },
    15: { boss_ended: true, boss_official: [{ player: 2, identifier: 7, damage: 500 }], boss_uplink: { 2: 200 } } } });
  assert.notEqual(r.bosses[0].name, '未识别首领');
  assert.equal(exportCount(r.bosses[0].total), '10,000');
  assert.deepEqual(r.bosses[0].seats.map(s => s.shareText), ['45%', '25%', '20%', '10%']);
  assert.equal(r.bosses[0].inferred, true);
  assert.equal(exportCount(r.bosses[1].total), '500');
  assert.equal(r.bosses[1].seats[1].share, null);
  assert.equal(exportCount(r.players[1].boss), '3,000');
  assert.equal(r.hasPartial, true);
  assert.equal(exportCount(r.bosses[1].seats[3].damage), '—');
});

test('a ratio-only Boss record remains visible without inventing damage or a share of team damage', () => {
  const r = summary({ players: {}, rounds: { 14: { boss_percent: { 1: 20 }, boss_round_basis: 'inferred' } } });
  assert.equal(exportCount(r.bosses[0].total), '—');
  assert.equal(r.bosses[0].seats[0].share, null);
  assert.equal(exportCount(r.bosses[0].seats[0].damage), '—');
  assert.match(renderBattleReportHtml(r, css), /占 Boss 血量：1号 20%/);
});

test('the compact line is reserved for a confirmed clean team, not a local zero or an unassigned escape', () => {
  const clean = renderBattleReportHtml(summary({ players: {}, rounds: { 1: demoReport('settled').rounds[1] } }), '');
  assert.match(clean, /全队无漏<\/span><span class="quiet-note">四路零漏，未触发协防/);
  assert.doesNotMatch(clean, /class="lane"/);
  const sparse = renderBattleReportHtml(summary({ players: { 1: '仅有昵称' }, capture: { self: 3 }, rounds: { 2: { self_leaks: 0 } } }), '');
  assert.match(sparse, /战况未确认/);
  assert.doesNotMatch(sparse, /四路零漏|class="lane"/);
  const unassigned = renderBattleReportHtml(summary({ players: {}, rounds: { 1: { ...demoReport('settled').rounds[1],
    wave_power: { rows: [{ player: 0, leaked: 2, enemies: [{ id: 'a', name: '甲', leaked: 2 }] }] } } } }), '');
  assert.match(unassigned, /波次漏怪（席位未确认）/);
  assert.doesNotMatch(unassigned, /四路零漏/);
});

test('enemy tags merge identical known IDs and counts without erasing unequal or unidentified evidence', () => {
  const render = (leak: number, help: number, id: string, helpId: string) => renderBattleReportHtml(summary({
    players: {}, capture: { self: 3 }, rounds: { 2: { leaks: { 1: 0, 2: 0, 3: leak, 4: 0 }, leaks_status: 'reported', self_leaks: leak,
      self_leak_enemies: id ? [{ id, name: '同名敌人', count: leak }] : [],
      assists_status: 'reported', assist_pairs: [{ killer: 1, owner: 3, count: help }],
      assist_enemies: helpId ? [{ id: helpId, name: '同名敌人', count: help, killer: 1, owner: 3 }] : [],
      uncovered_status: 'reported', uncovered_leaks: { 3: leak - help } } },
  }), '');
  const same = render(3, 3, 'a', 'a');
  assert.equal(same.match(/class="kinds"/g)?.length, 1);
  assert.match(same, /><span>同名敌人<\/span><b>×3/);
  const unequal = render(11, 3, 'a', 'a');
  assert.match(unequal, /部分兜住/);
  assert.match(unequal, /<small>漏怪<\/small>.*?×11/);
  assert.match(unequal, /<small>协防<\/small>.*?×3/);
  for (const different of [render(3, 3, 'a', 'b'), render(3, 3, '', '')])
    assert.equal(different.match(/class="kinds"/g)?.length, 2);
});

test('Boss provenance is grouped without converting estimates or HP percentages to team shares', () => {
  const wave = { boss_status: 'settlement', boss_damage: { 1: 4500, 2: 0, 3: 500, 4: 100 } };
  const uniform = renderBattleReportHtml(summary({ players: {}, rounds: { 14: wave, 15: wave } }), '');
  assert.equal(uniform.match(/服务器结算/g)?.length, 1);
  const mixed = renderBattleReportHtml(summary({ players: {}, rounds: { 14: { ...wave, boss_damage: { 1: 4500, 2: 0 },
    boss_percent: { 1: 9 }, boss_official: [{ player: 3, identifier: 7, damage: 500 }], boss_uplink: { 4: 100 }, boss_round_basis: 'inferred' } } }), '');
  assert.match(mixed, /服务器结算：1、2号 · 榜单明细：3号 · 本端上报：4号/);
  assert.match(mixed, /占 Boss 血量：1号 9%/);
  assert.match(mixed, /回合归属待校正/);
  for (const n of ['5,100', '4,500', '0', '500', '100']) assert.ok(mixed.includes(`<strong>${n}</strong>`));
  assert.equal(mixed.match(/class="share">—/g)?.length, 4);
});

test('the document keeps text literal, all links, enemy ranks and deterministic product-branded filenames', () => {
  const report = readBattleReport(demoReport('settled'));
  report.names[3] = '<b title="昵称">A|B</b>&';
  const r = summarizeBattleReport({ ...entry, label: '合成:对局/甲' }, report, true, date);
  assert.equal(r.filename, 'PRTS战报_合成_对局_甲_20261123-1542');
  const html = renderBattleReportHtml(r, css);
  assert.match(html, /<b>PRTS<\/b>/);
  assert.match(html, /<footer>PRTS Stronghold · 卫戍协议战术终端<\/footer>/);
  assert.match(html, /&lt;b title=&quot;昵称&quot;&gt;A\|B&lt;\/b&gt;&amp;/);
  assert.doesNotMatch(html, /<b title="昵称">|另有队友间兜底/);
  assert.match(html, /class="enemy boss"><span>鼠王<\/span><b>×1/);
  assert.match(html, /class="enemy elite"><span>重装防御者<\/span><b>×3/);
  assert.match(html, /content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /<script\b|<link\b|\bsrc=|https?:\/\//i);
  for (const link of r.rounds[8].links) assert.ok(html.includes(link));

  const telemetry = summarizeBattleReport({ ...entry, label: '合成:对局/甲' }, report, true, date, TELEMETRY_REPORT_BRAND);
  assert.equal(telemetry.filename, '卫戍战报仪_合成_对局_甲_20261123-1542');
  const telemetryHtml = renderBattleReportHtml(telemetry, css, TELEMETRY_REPORT_BRAND);
  assert.match(telemetryHtml, /<b>卫戍战报仪<\/b>/);
  assert.match(telemetryHtml, /<footer>卫戍战报仪 · Stronghold Telemetry<\/footer>/);
  assert.doesNotMatch(telemetryHtml, /PRTS Stronghold/);
  assert.equal(STRONGHOLD_REPORT_BRAND.exportPrefix, 'PRTS战报');
});

test('embedded portraits render inline sprite icons, omit empty Boss column and collapse teammate assist kinds', () => {
  const r = summary({
    capture: { self: 4 }, players: {},
    rounds: {
      2: {
        leaks: { 1: 2, 2: 0, 3: 0, 4: 0 }, leaks_status: 'reported', self_leaks: 0,
        assists_status: 'reported', assists_others: { 3: 2 },
        assist_pairs: [{ killer: 3, owner: 1, count: 2 }],
        assist_enemies: [{ id: 'enemy_a', name: '深池逐火战士', count: 2, killer: 3, owner: 1 }],
        uncovered_status: 'reported', uncovered_leaks: {},
      },
    },
  });
  const html = renderBattleReportHtml(r, css, STRONGHOLD_REPORT_BRAND, {
    dataUrl: 'data:image/png;base64,AA==', ids: ['enemy_a', 'enemy_b'],
  });
  assert.match(html, /class="players no-boss"/);
  assert.doesNotMatch(html, />Boss 输出</);
  assert.match(html, /\.enemy-ico\{[^}]*data:image\/png;base64,AA==/);
  assert.match(html, /<i class="enemy-ico" style="background-position:0% 0" aria-hidden="true"><\/i><span>深池逐火战士<\/span><b>×2<\/b>/);
  assert.equal(html.match(/class="kinds"/g)?.length, 1);
  assert.doesNotMatch(html, /未记录怪种/);
});

test('uplink-only round where everyone leaked infers skipped assist and counts net leaks', () => {
  const r = summary({
    capture: { match: 1, round: 0, self: 4 }, players: {},
    rounds: {
      7: {
        self_leaks: 1, leaks: { 4: 1 }, leaks_status: 'reported',
        assists_status: 'reported', assists_others: { 3: 1 },
        assist_pairs: [{ killer: 3, owner: 4, count: 1 }],
        uncovered_status: 'reported', uncovered_leaks: {},
      },
      8: { self_leaks: 1, assists_status: 'unknown', uncovered_status: 'unknown' },
      9: {
        self_leaks: 2, leaks: { 4: 2 }, leaks_status: 'reported',
        assists_status: 'reported', assists_others: { 2: 2 },
        assist_pairs: [{ killer: 2, owner: 4, count: 2 }],
        uncovered_status: 'reported', uncovered_leaks: {},
      },
    },
  });
  assert.equal(r.rounds[1].number, 8);
  assert.equal(r.rounds[1].tone, 'breached');
  assert.equal(r.rounds[1].label, '未进协防 · 本路净漏');
  assert.equal(exportCount(r.rounds[1].net), '≥1');
  assert.equal(exportCount(r.net), '≥1');
});
