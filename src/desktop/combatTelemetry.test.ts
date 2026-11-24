import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readBattleReport } from './battleReportData';
import { renderBattleReportHtml } from './battleReportDocument';
import { summarizeBattleReport } from './battleReportExport';
import {
  formatTelemetryRate,
  formatTelemetryTotal,
  isSoloMode,
  isSoloStageMode,
  operatorRateForCaliber,
  readCombatTelemetry,
  readSeatLineups,
} from './combatTelemetry';
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
