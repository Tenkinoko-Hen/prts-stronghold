// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultBossRound, readBattleReport, reportBossRounds, reportLeader } from './battleReportData';
import { renderBattleReportHtml } from './battleReportDocument';
import { summarizeBattleReport } from './battleReportExport';
import { isSeatEliminatedInRound, roundOutcome } from './battleRoundOutcome';
import { SeatLineupsStrip } from './BattleReportTelemetry';
import { SeatTelemetryStrip } from './SeatTelemetryStrip';
import {
  formatTelemetryRate,
  formatTelemetryTotal,
  isSoloMode,
  isSoloStageMode,
  operatorRateForCaliber,
  readCombatTelemetry,
  readDeckPool,
  readSeatLineups,
} from './combatTelemetry';
import {
  computeEquipOdds,
  computeOperatorOdds,
  computeWishlistSummary,
  hypergeometricAtLeastOne,
} from './deckPoolMath';
import { computeSeatCovenants, shortCovenantName, visibleSeatCovenants } from './covenantBonds';
import { HUD_SCALE_SPECS, buildHudBossTeamData, buildHudLeakData } from './hudTelemetryViewModel';
import { buildSmoothSplinePath, formatAxisNumber, niceTicks } from './prtsChartKit';
import { resolveEquipIconIndex } from './EquipIcon';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import { isSecondScreenActive } from '../mobile/MobileLanPanel';
import { demoReport } from './demo/battleReportFixture';
import { buildHudDemoPreview } from './demo/hudDemoFixture';
import { computeEffectiveDps } from '../mobile/MobileDpsEstimator';
import { parseSettlementQuickText } from '../mobile/settlementQuickParse';
import { emptySession, mobileReducer } from '../mobile/mobileSession';

const css = readFileSync(new URL('./battleReportDocument.css', import.meta.url), 'utf8');

test('solo stage demo report parses 4-channel operator telemetry, summons, devices and exports cleanly', () => {
  const raw = demoReport('solo_dps');
  const report = readBattleReport(raw);
  assert.equal(isSoloStageMode(report.mode), true);
  assert.equal(isSoloMode(report.mode), true);
  assert.equal(isSoloMode('mode_single_4'), true);
  assert.equal(isSoloMode('mode_multi_hard'), false);
  assert.ok(report.telemetry);
  assert.equal(report.telemetry.operators.length, 4);
  assert.equal(report.telemetry.operators[0].name, '维什戴尔');
  assert.equal(report.telemetry.operators[0].children[0].name, '魂影残响');
  assert.equal(report.telemetry.stageDevices[0].name, '源石祭坛');
  assert.equal(operatorRateForCaliber(report.telemetry.operators[0], 'active', 'damage'), 5420);
  assert.equal(operatorRateForCaliber(report.telemetry.operators[3], 'pulse', 'healing'), 1450);

  const summary = summarizeBattleReport(
    { label: '单人演习 1', seenAt: Date.now() - 60_000 },
    report,
    false,
    new Date(2026, 10, 24, 20, 0),
  );
  assert.equal(summary.soloStage, true);
  assert.equal(summary.telemetryOperators.length, 4);
  const html = renderBattleReportHtml(summary, css);
  assert.match(html, /干员伤害统计明细/);
  assert.match(html, /维什戴尔/);
  assert.match(html, /5,420 \/s/);
  assert.doesNotMatch(html, /四人战绩总览/);
});

test('midstream coverage uses >= lower-bound prefix and seat lineups parse banned slots', () => {
  const tele = readCombatTelemetry({
    scope: 'coop_defense',
    coverage: 'midstream',
    retained_round: 5,
    operators: [{ char_id: 'char_4133_logos', name: '逻各斯', total_damage: 85000, arts: 85000, share_ratio: 1 }],
  });
  assert.ok(tele);
  assert.equal(tele.coverage, 'midstream');
  assert.equal(tele.retainedRound, 5);
  assert.equal(formatTelemetryTotal(85000, true), '≥85,000');
  assert.equal(formatTelemetryRate(null), '—');

  const lineups = readSeatLineups({
    2: {
      round: 8,
      shop_level: 5,
      strategist: '凯尔希',
      piece_count: 7,
      deployed_count: 6,
      squad: [
        { chess_id: 'c1', char_id: 'char_1035_wisdel', name: '维什戴尔', bonds: ['sargonShip'], is_banned: false },
        { chess_id: 'c2', char_id: 'char_4133_logos', name: '逻各斯', bonds: ['arcaneShip'], is_banned: true },
      ],
    },
  });
  assert.equal(lineups[2].shopLevel, 5);
  assert.equal(lineups[2].strategist, '凯尔希');
  assert.deepEqual(lineups[2].squad[0].covenants, ['萨尔贡']);
  assert.equal(lineups[2].squad[1].isBanned, true);
});

test('mobile effective DPS estimator flags physical polishing and mobile quick-fill / LAN reducer work accurately', () => {
  const polished = computeEffectiveDps({
    damageType: 'physical',
    baseAtk: 600,
    covenantAtkPct: 20,
    skillMultiplier: 1.0,
    hitsPerAttack: 3,
    interval: 1.0,
    enemyDef: 1500,
    enemyRes: 30,
    defShredPct: 0,
    resShredFlat: 0,
  });
  assert.equal(polished.polishing, true);
  assert.equal(polished.postHit, 36); // 5% floor of 720

  const shredded = computeEffectiveDps({
    damageType: 'physical',
    baseAtk: 850,
    covenantAtkPct: 150,
    skillMultiplier: 2.2,
    hitsPerAttack: 3,
    interval: 2.8,
    enemyDef: 1500,
    enemyRes: 30,
    defShredPct: 40,
    resShredFlat: 0,
  });
  assert.equal(shredded.polishing, false);
  assert.ok(shredded.effectiveDps > 3500);

  const parsed = parseSettlementQuickText('第14回合 漏怪 2 协防 6 Boss伤害 148,500 占比 36.5%');
  assert.deepEqual(parsed, {
    round: 14,
    leaks: 2,
    helps: 6,
    boss: 148500,
    note: '结算占比 36.5%',
  });

  const synced = mobileReducer(emptySession(), {
    type: 'applyLanSync',
    bannedCovenants: ['阿戈尔', '奥术', '未知假词条'],
    round: 9,
  });
  assert.deepEqual(synced.bans.bannedCovenants, ['阿戈尔', '奥术']);
  assert.equal(synced.scanComplete, true);
});

test('quick_r9 solo mode detects dynamic R9 Boss, solo round outcomes, and translated operators/strategist', () => {
  const report = readBattleReport(demoReport('quick_r9'));
  assert.equal(report.difficulty, '极速模拟');
  assert.equal(isSoloMode(report.mode), true);
  assert.deepEqual(reportBossRounds(report), [9]);
  assert.equal(defaultBossRound(report), 9);
  assert.equal(reportLeader(report, 9)?.name, '假想敌：管');

  const r3 = report.rounds.find(r => r.number === 3)!;
  const r9 = report.rounds.find(r => r.number === 9)!;
  assert.equal(roundOutcome(r3, report, 1, false).label, '本路零漏');
  assert.equal(roundOutcome(r9, report, 1, true).label, '首领攻坚中');
  assert.equal(roundOutcome(r9, { ...report, defeatedBossRounds: [9] }, 1, false).label, '已击败首领');
  assert.equal(report.lineups[1].strategist, '阿米娅·众志合一');
  assert.equal(report.lineups[1].deployed.some(u => u.name === '黑键'), true);
  assert.equal(report.lineups[1].deployed.some(u => u.name === '车尔尼'), true);
  assert.equal(report.telemetry?.operators[0].name, '黑键');
  assert.ok((report.telemetry?.timeline.length ?? 0) >= 4);
});

test('coop_elim tracks eliminated seat, clean board lineup, and deck pool hypergeometric roll probabilities', () => {
  const report = readBattleReport(demoReport('coop_elim'));
  assert.equal(report.eliminated[2], 5);
  assert.equal(isSeatEliminatedInRound(report, 2, 5), false);
  assert.equal(isSeatEliminatedInRound(report, 2, 6), true);
  assert.equal(report.lineups[1].strategist, '阿米娅·众志合一');
  assert.equal(report.lineups[1].deployed.length, 4);
  assert.equal(report.lineups[1].bench.length, 1);
  assert.equal(report.lineups[1].equips.length, 1);

  const pool = report.deckPool ?? readDeckPool(null);
  assert.ok(pool);
  assert.equal(report.lineups[1].shopLevel, 4);
  assert.ok(pool.operators.length >= 6);

  // Exact hypergeometric check: 4 copies in 10 cards, 2 draws -> 1 - (6/10)*(5/9) = 2/3
  assert.ok(Math.abs(hypergeometricAtLeastOne(10, 4, 2) - 2 / 3) < 1e-12);

  const wisdel = pool.operators.find(o => o.name === '维什戴尔');
  assert.ok(wisdel);
  assert.equal(wisdel.remaining, 0);
  // At shop level 6 wisdel is unlocked but empty; at level 4 wisdel is tier 6 (locked)
  assert.equal(computeOperatorOdds(pool, wisdel, 4).status, 'locked');
  assert.equal(computeOperatorOdds(pool, wisdel, 6).status, 'empty');
  assert.equal(computeOperatorOdds(pool, wisdel, 6).perRollProb, 0);

  const ebnhlz = pool.operators.find(o => o.name === '黑键');
  assert.ok(ebnhlz);
  const ebOdds = computeOperatorOdds(pool, ebnhlz, 4);
  assert.equal(ebOdds.unlocked, true);
  assert.ok(ebOdds.perRollProb > 0 && ebOdds.perRollProb < 1);
  assert.ok(ebOdds.fiveRollProb > ebOdds.perRollProb);
  assert.ok(ebOdds.expectedRolls !== null && ebOdds.expectedRolls > 1);

  const shu = pool.operators.find(o => o.name === '黍');
  assert.ok(shu);
  // Tier 5 at level 4: locked for normal roll, but eligible for triple discover (discoverTier = 5)
  const shuOdds = computeOperatorOdds(pool, shu, 4);
  assert.equal(shuOdds.unlocked, false);
  assert.ok(shuOdds.tripleDiscoverProb !== null && shuOdds.tripleDiscoverProb > 0);

  if (pool.equips.length > 0) {
    const eqOdds = computeEquipOdds(pool, pool.equips[0], 4);
    assert.equal(eqOdds.unlocked, true);
    assert.ok(eqOdds.perRollProb > 0);
  }

  const summary = computeWishlistSummary(
    pool,
    4,
    new Set([ebnhlz.charId, shu.charId]),
    new Set(pool.equips.slice(0, 1).map(e => e.trapId)),
  );
  assert.equal(summary.shopLevel, 4);
  assert.equal(summary.nextLevelShopLevel, 5);
  assert.ok(summary.anyWishOperatorPerRoll > 0);
  assert.ok(summary.nextLevelAnyWishPerRoll !== null && summary.nextLevelAnyWishPerRoll > 0);

  const scale = niceTicks(52400, 4);
  assert.equal(scale.ticks[0], 0);
  assert.ok(scale.top >= 52400 && scale.ticks.at(-1) === scale.top);
  assert.equal(formatAxisNumber(20000), '2万');
  assert.equal(formatAxisNumber(1500), '1.5k');
  const spline = buildSmoothSplinePath([
    { x: 0, y: 100 },
    { x: 50, y: 40 },
    { x: 100, y: 80 },
    { x: 150, y: 20 },
  ]);
  assert.match(spline, /^M 0\.0,100\.0 C /);

  assert.notEqual(resolveEquipIconIndex('trap_1041_acarm041', '维式重锤'), undefined);
  assert.notEqual(resolveEquipIconIndex('trap_1066_acarm066', '盟约之币'), undefined);
  assert.notEqual(resolveEquipIconIndex('trap_1048_acarm048', '奥术法阵'), undefined);
  assert.ok(resolveOperatorAvatars('“暴躁铁皮”')[0]?.avatarUrl?.includes('%E6%9A%B4%E8%BA%81%E9%93%81%E7%9A%AE'));
  assert.ok(resolveOperatorAvatars('"暴躁铁皮"')[0]?.avatarUrl?.includes('%E6%9A%B4%E8%BA%81%E9%93%81%E7%9A%AE'));
  assert.ok(resolveOperatorAvatars('盟约·辅助干员')[0]?.avatarUrl?.includes('Pith'));
  assert.equal(isSecondScreenActive(null), false);
  assert.equal(
    isSecondScreenActive({
      active: true,
      status: 'connected',
      host: '192.168.1.10',
      port: 39527,
      error: '',
      lastSyncAt: Date.now(),
      peerProduct: 'PRTS',
      payload: null,
    }),
    true,
  );
  assert.equal(
    isSecondScreenActive({
      active: false,
      status: 'idle',
      host: '',
      port: 39527,
      error: '',
      lastSyncAt: 0,
      peerProduct: '',
      payload: null,
    }),
    false,
  );
});

test('computeSeatCovenants deduplicates deployed copies, applies transfer equip +1, and handles soloShip=1', () => {
  assert.deepEqual(computeSeatCovenants(undefined, null), []);
  assert.equal(shortCovenantName('卡西米尔'), '卡西');
  assert.equal(shortCovenantName('精准'), '精准');

  const pool = readDeckPool({
    mode_id: 'mode_multi_hard',
    is_single: false,
    operators: [
      { char_id: 'char_a', name: '干员A', tier: 3, bonds: ['egirShip', 'preciShip'], total_copies: 10, taken_total: 2, remaining: 8 },
      { char_id: 'char_b', name: '干员B', tier: 4, bonds: ['egirShip', 'preciShip'], total_copies: 10, taken_total: 1, remaining: 9 },
      { char_id: 'char_solo', name: '孤狼', tier: 5, bonds: ['soloShip'], total_copies: 8, taken_total: 1, remaining: 7 },
    ],
    equips: [
      { trap_id: 'trap_egir', chess_id: 'chess_trap_egir', name: '阿戈尔之徽', tier: 4, item_type: 'EQUIP', give_bond_id: 'egirShip', taken_total: 1 },
    ],
  });
  assert.ok(pool);

  const lineups = readSeatLineups({
    1: {
      round: 7,
      shop_level: 4,
      piece_count: 4,
      deployed_count: 4,
      deployed: [
        { inst_id: 1, chess_id: 'c_a1', char_id: 'char_a', name: '干员A', tier: 3, is_golden: false },
        { inst_id: 2, chess_id: 'c_a2', char_id: 'char_a', name: '干员A', tier: 3, is_golden: false }, // duplicate copy on board!
        { inst_id: 3, chess_id: 'c_b1', char_id: 'char_b', name: '干员B', tier: 4, is_golden: false },
        { inst_id: 4, chess_id: 'c_s1', char_id: 'char_solo', name: '孤狼', tier: 5, is_golden: true },
      ],
      bench: [],
      equips: [
        { inst_id: 99, identifier: 99, chess_id: 'chess_trap_egir', trap_id: 'trap_egir', name: '阿戈尔之徽', tier: 4, is_golden: false, item_type: 'EQUIP' },
      ],
      shop_goods: [],
      squad: [],
    },
  });

  const bonds = computeSeatCovenants(lineups[1], pool);
  const egir = bonds.find(b => b.name === '阿戈尔');
  const preci = bonds.find(b => b.name === '精准');
  const solo = bonds.find(b => b.name === '独行');
  assert.ok(egir && preci && solo);
  // 2 unique egir operators + 1 transfer equip = 3 (>= threshold 3 -> active!)
  assert.equal(egir.count, 3);
  assert.equal(egir.active, true);
  // 2 unique preci operators (duplicate char_a ignored!) -> 2 (>= threshold 2 -> active!)
  assert.equal(preci.count, 2);
  assert.equal(preci.active, true);
  // 1 soloShip operator -> active when count === 1
  assert.equal(solo.count, 1);
  assert.equal(solo.active, true);

  const capped = visibleSeatCovenants(lineups[1], pool, 2);
  assert.equal(capped.shown.length, 2);
  assert.equal(capped.hiddenCount, 1);
});

test('computeSeatCovenants normalizes smart quotes and falls back to operatorReference catalog without squad/pool', () => {
  const lineups = readSeatLineups({
    1: {
      round: 8,
      shop_level: 4,
      piece_count: 3,
      deployed_count: 3,
      deployed: [
        { inst_id: 1, chess_id: '', char_id: 'char_pramanix_2', name: '“圣聆初雪”', tier: 6, is_golden: false },
        { inst_id: 2, chess_id: '', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: false },
        { inst_id: 3, chess_id: '', char_id: 'char_367_swllow', name: '灰喉', tier: 1, is_golden: false },
      ],
      bench: [],
      equips: [],
      shop_goods: [],
      squad: [],
    },
    3: {
      round: 8,
      shop_level: 4,
      piece_count: 3,
      deployed_count: 3,
      deployed: [
        { inst_id: 4, chess_id: '', char_id: 'char_zheya', name: '折桠', tier: 1, is_golden: false },
        { inst_id: 5, chess_id: '', char_id: 'char_lethes', name: '烈夏', tier: 3, is_golden: false },
        { inst_id: 6, chess_id: '', char_id: 'char_istina', name: '真理', tier: 3, is_golden: false },
      ],
      bench: [],
      equips: [],
      shop_goods: [],
      squad: [],
    },
  });
  const s1Bonds = computeSeatCovenants(lineups[1], null);
  const preci = s1Bonds.find(b => b.name === '精准');
  assert.ok(preci && preci.count === 2 && preci.active);
  assert.ok(s1Bonds.some(b => b.name === '奥术' && b.count === 1));

  const s3Bonds = computeSeatCovenants(lineups[3], null);
  const ursus = s3Bonds.find(b => b.name === '乌萨斯');
  assert.ok(ursus && ursus.count === 3 && ursus.active);
});

test('R8 all-players-leaked uses roundMetrics/skippedCosts and prevents false 零逃 in HUD & SeatTelemetryStrip', () => {
  assert.deepEqual(
    {
      sm: { width: HUD_SCALE_SPECS.sm.width, height: HUD_SCALE_SPECS.sm.height },
      md: { width: HUD_SCALE_SPECS.md.width, height: HUD_SCALE_SPECS.md.height },
      lg: { width: HUD_SCALE_SPECS.lg.width, height: HUD_SCALE_SPECS.lg.height },
    },
    {
      sm: { width: 500, height: 248 },
      md: { width: 580, height: 280 },
      lg: { width: 660, height: 316 },
    },
  );
  const leakPreview = buildHudDemoPreview('leak_r8', 'md');
  assert.ok(leakPreview);
  const parsed = readBattleReport(leakPreview.previewState.report);
  const hudLeak = buildHudLeakData({
    parsed,
    leakCumulative: true,
    leakSelectedRound: 8,
    soloMode: false,
    selfSeat: 1,
  });
  assert.ok(hudLeak.totalEscaped >= 18);
  const s1 = hudLeak.cards.find(c => c.seat === 1)!;
  assert.ok(s1.leaked >= 6 && s1.escaped >= 6 && s1.covered === 0);
  // Seat 1 in leak_r8 injects 8 active_bonds (max 999 stacks) -> HUD shows top 3 + hiddenCount 5
  assert.equal(s1.bonds.shown.length, 3);
  assert.equal(s1.bonds.hiddenCount, 5);
  assert.deepEqual(
    s1.bonds.shown.map(b => [b.name, b.count, b.tierTone]),
    [
      ['奥术', 999, 'max'],
      ['精准', 245, 'high'],
      ['乌萨斯', 128, 'high'],
    ],
  );
  // Seat 2 keeps empty squad so static reference + smart-quote normalization remain covered
  assert.equal(hudLeak.cards.find(c => c.seat === 2)?.bonds.shown.some(b => b.name === '奥术' && b.count >= 2 && b.active), true);
  assert.equal(hudLeak.cards.find(c => c.seat === 3)?.bonds.shown.some(b => b.name === '乌萨斯' && b.count === 3 && b.active), true);

  const stripHtml = renderToStaticMarkup(createElement(SeatTelemetryStrip, { report: parsed, focusSeat: 1 }));
  assert.doesNotMatch(stripHtml, /零逃/);
  assert.match(stripHtml, /逃\s*18|逃18/);
  assert.match(stripHtml, /data-tier="max"[^>]*>奥术999/);
  assert.match(stripHtml, /data-tier="high"[^>]*>精准245/);
  assert.match(stripHtml, /data-tier="high"[^>]*>乌萨斯128/);
  assert.match(stripHtml, /炎6/);

  const compactStripHtml = renderToStaticMarkup(createElement(SeatTelemetryStrip, { report: parsed, focusSeat: 1, compact: true }));
  assert.match(compactStripHtml, /奥术999/);
  assert.match(compactStripHtml, /\+4/);
});

test('readSeatLineups and computeSeatCovenants handle active_bonds up to 999 stacks, 8 bonds sorting, and tierTone', () => {
  const lineups = readSeatLineups({
    1: {
      round: 12,
      shop_level: 6,
      piece_count: 8,
      deployed_count: 8,
      active_bonds: [
        { bond_id: 'yanShip', stacks: 6, active: true },
        { bond_id: 'arcaneShip', stacks: 1500, active: true }, // clamps to 999
        { bond_id: 'preciShip', stacks: 245, active: true },
        { bond_id: 'ursusShip', stacks: 128, active: true },
        { bond_id: 'kjeragShip', stacks: 64, active: true },
        { bond_id: 'lethaniaShip', stacks: 32, active: true },
        { bond_id: 'visiShip', stacks: 18, active: true },
        { bond_id: 'swiftShip', stacks: 12, active: true },
        { bond_id: 'raidShip', stacks: -3, active: false }, // negative clamps to 0 and is omitted
      ],
    },
  });

  const s1 = lineups[1];
  assert.ok(s1.activeBonds);
  assert.equal(s1.activeBonds.find(b => b.bondId === 'arcaneShip')?.stacks, 999);
  assert.equal(s1.activeBonds.find(b => b.bondId === 'raidShip')?.stacks, 0);

  const computed = computeSeatCovenants(s1, null);
  assert.equal(computed.length, 8);
  assert.equal(computed[0].name, '奥术');
  assert.equal(computed[0].count, 999);
  assert.equal(computed[0].tierTone, 'max');
  assert.equal(computed[1].name, '精准');
  assert.equal(computed[1].count, 245);
  assert.equal(computed[1].tierTone, 'high');
  assert.equal(computed[2].name, '乌萨斯');
  assert.equal(computed[2].count, 128);
  assert.equal(computed[2].tierTone, 'high');
  assert.equal(computed[3].tierTone, 'normal');

  // Verify clamping even when activeBonds is constructed directly without readSeatLineups
  const directClamped = computeSeatCovenants({
    ...s1,
    activeBonds: [
      { bondId: 'arcaneShip', stacks: 2048, active: true },
      { bondId: 'sargonShip', stacks: 500, active: true },
      { bondId: 'egirShip', stacks: 100, active: true },
      { bondId: 'preciShip', stacks: 99, active: true },
      { bondId: 'soloShip', stacks: 2, active: false },
    ],
  });
  assert.equal(directClamped[0].count, 999);
  assert.equal(directClamped[0].tierTone, 'max');
  assert.equal(directClamped[1].tierTone, 'max');
  assert.equal(directClamped[2].tierTone, 'high');
  assert.equal(directClamped[3].tierTone, 'normal');
  assert.equal(directClamped[4].active, false);

  const wide8 = visibleSeatCovenants(s1, null, 8);
  assert.equal(wide8.shown.length, 8);
  assert.equal(wide8.hiddenCount, 0);

  const hud3 = visibleSeatCovenants(s1, null, 3);
  assert.equal(hud3.shown.length, 3);
  assert.equal(hud3.hiddenCount, 5);
  assert.equal(hud3.all.length, 8);
});

test('R14 HUD Boss ranking merges bossOfficial/bossPercent alongside partial bossDamage without dropping #3', () => {
  const bossPreview = buildHudDemoPreview('boss_r14', 'md');
  assert.ok(bossPreview);
  const parsed = readBattleReport(bossPreview.previewState.report);
  const bossRound = parsed.rounds.find(r => r.number === 14);
  const data = buildHudBossTeamData({
    parsed,
    bossRound,
    bossPool: null,
    bossLeader: null,
    bossElapsedSec: 40,
    soloMode: false,
    selfSeat: 1,
  });
  const seat3Row = data.rows.find(r => r.seat === 3)!;
  assert.equal(seat3Row.damage, 4410000);
  assert.equal(seat3Row.rank, 3);
  assert.ok(seat3Row.sharePct > 19);
});

test('SeatLineupsStrip shows 持有 X 枚 when bench is empty and 在场 X / 整备 Y when bench is populated', () => {
  const noBenchReport = readBattleReport({
    capture: { match: 9, round: 8, self: 1 },
    players: { 1: '测试席1' },
    battle_config: { mode_id: 'mode_multi_hard' },
    rounds: { 8: { phase: 'prep', self_leaks: 0 } },
    lineups: {
      1: {
        round: 8,
        shop_level: 5,
        piece_count: 9,
        deployed_count: 9,
        deployed: Array.from({ length: 9 }, (_, i) => ({
          inst_id: i + 1, chess_id: '', char_id: `char_${i}`, name: `干员${i}`, tier: 4, is_golden: false,
        })),
        bench: [],
        equips: [],
        shop_goods: [],
        squad: [],
      },
    },
  });
  const noBenchHtml = renderToStaticMarkup(createElement(SeatLineupsStrip, {
    report: noBenchReport,
    lineups: noBenchReport.lineups,
    solo: false,
  }));
  assert.match(noBenchHtml, /持有 9 枚/);
  assert.doesNotMatch(noBenchHtml, /在场 9\/9/);

  const withBenchReport = readBattleReport({
    capture: { match: 10, round: 9, self: 1 },
    players: { 1: '测试席1' },
    battle_config: { mode_id: 'mode_multi_hard' },
    rounds: { 9: { phase: 'prep', self_leaks: 0 } },
    lineups: {
      1: {
        round: 9,
        shop_level: 5,
        piece_count: 9,
        deployed_count: 7,
        deployed: Array.from({ length: 7 }, (_, i) => ({
          inst_id: i + 1, chess_id: '', char_id: `char_${i}`, name: `干员${i}`, tier: 4, is_golden: false,
        })),
        bench: Array.from({ length: 2 }, (_, i) => ({
          inst_id: 20 + i, chess_id: '', char_id: `bench_${i}`, name: `整备${i}`, tier: 3, is_golden: false,
        })),
        equips: [],
        shop_goods: [],
        squad: [],
      },
    },
  });
  const withBenchHtml = renderToStaticMarkup(createElement(SeatLineupsStrip, {
    report: withBenchReport,
    lineups: withBenchReport.lineups,
    solo: false,
  }));
  assert.match(withBenchHtml, /在场 7 \/ 整备 2/);
});
