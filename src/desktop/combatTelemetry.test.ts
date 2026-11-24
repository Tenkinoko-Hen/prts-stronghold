import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { defaultBossRound, readBattleReport, reportBossRounds, reportLeader } from './battleReportData';
import { renderBattleReportHtml } from './battleReportDocument';
import { summarizeBattleReport } from './battleReportExport';
import { isSeatEliminatedInRound, roundOutcome } from './battleRoundOutcome';
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
import { demoReport } from './demo/battleReportFixture';
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
  assert.match(html, /干员算力贡献明细/);
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
});
