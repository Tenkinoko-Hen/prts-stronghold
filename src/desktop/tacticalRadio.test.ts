// 青逝痕 Tenkinoko 制作
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RADIO_PRESETS,
  RADIO_SLOTS,
  defaultRadioConfig,
  defaultSlotConfig,
  isSlotCustomized,
  resolveRadioPhase,
  restoreRadioConfig,
} from './tacticalRadio';
import { readBattleReport } from './battleReportData';

const idleBan = {
  ocrStatus: 'idle' as const,
  syncSource: null,
  ocrSeenCount: 0,
  liveRound: null,
};

test('tacticalRadio exposes 4 built-in clips and valid defaults for BP and Prep slots', () => {
  assert.deepEqual(RADIO_PRESETS.map(p => p.id), ['clip1', 'clip2', 'clip3', 'clip4']);
  assert.deepEqual(RADIO_SLOTS.map(s => s.id), ['bp', 'prep', 'boss', 'combat']);

  const cfg = defaultRadioConfig();
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.slots.bp.enabled, true);
  assert.equal(cfg.slots.bp.presetId, 'clip1');
  assert.equal(cfg.slots.prep.enabled, true);
  assert.equal(cfg.slots.prep.presetId, 'clip3');
  assert.equal(cfg.slots.boss.enabled, true);
  assert.equal(cfg.slots.boss.presetId, 'clip4');
  assert.equal(cfg.slots.combat.enabled, false);

  assert.equal(isSlotCustomized('bp', defaultSlotConfig('bp')), false);
  assert.equal(isSlotCustomized('bp', { ...defaultSlotConfig('bp'), presetId: 'clip2' }), true);
  assert.equal(isSlotCustomized('prep', { ...defaultSlotConfig('prep'), source: 'custom', customName: 'my.mp3' }), true);
});

test('restoreRadioConfig sanitizes corrupt JSON and preserves valid custom slot metadata', () => {
  assert.deepEqual(restoreRadioConfig(null), defaultRadioConfig());
  assert.deepEqual(restoreRadioConfig('{bad json'), defaultRadioConfig());

  const restored = restoreRadioConfig(JSON.stringify({
    enabled: true,
    volume: 1.8,
    crossfadeMs: -50,
    slots: {
      bp: { enabled: true, source: 'custom', presetId: 'clip2', customName: 's14-bp.mp3', customSize: 123456 },
      prep: { enabled: true, source: 'custom', presetId: 'invalid' }, // missing customName -> falls back to preset + defaultPreset
      boss: { enabled: false, source: 'preset', presetId: 'clip4' },
    },
  }));
  assert.equal(restored.enabled, true);
  assert.equal(restored.volume, 1);
  assert.equal(restored.crossfadeMs, 0);
  assert.equal(restored.slots.bp.source, 'custom');
  assert.equal(restored.slots.bp.presetId, 'clip2');
  assert.equal(restored.slots.bp.customName, 's14-bp.mp3');
  assert.equal(restored.slots.prep.source, 'preset');
  assert.equal(restored.slots.prep.presetId, 'clip3');
  assert.equal(restored.slots.boss.enabled, false);
});

test('resolveRadioPhase maps OCR Ban screen, 300 loading, prep, combat, Boss, and defeated Boss accurately', () => {
  assert.equal(resolveRadioPhase({ report: null, banSync: idleBan }), 'idle');

  // 1. Empty lobby OCR probe stays idle; active Ban recognition triggers BP slot
  assert.equal(resolveRadioPhase({
    report: null,
    banSync: { ocrStatus: 'scanning', syncSource: null, ocrSeenCount: 0, liveRound: null },
  }), 'idle');
  assert.equal(resolveRadioPhase({
    report: null,
    banSync: { ocrStatus: 'scanning', syncSource: null, ocrSeenCount: 6, liveRound: null },
  }), 'bp');
  assert.equal(resolveRadioPhase({
    report: null,
    banSync: { ocrStatus: 'ready', syncSource: 'ocr', ocrSeenCount: 26, liveRound: null },
  }), 'bp');

  // 2. Opening 300 frame (loading / banned_bonds before R1) triggers BP slot
  const openingReport = readBattleReport({
    capture: { match: 1, round: 0 },
    battle_config: { mode_id: 'mode_multi_abyss', banned_bonds: ['bond_yan'] },
    players: { 1: 'A' },
    rounds: {},
  });
  assert.equal(resolveRadioPhase({ report: openingReport, banSync: idleBan }), 'bp');

  // 3. Prep & special_prep trigger Prep slot
  const prepReport = readBattleReport({
    capture: { match: 1, round: 5 },
    battle_config: { mode_id: 'mode_multi_abyss' },
    players: { 1: 'A' },
    rounds: { 5: { phase: 'special_prep' } },
  });
  assert.equal(resolveRadioPhase({ report: prepReport, banSync: { ...idleBan, liveRound: 5 } }), 'prep');

  // 4. Self / assist trigger Combat slot
  const combatReport = readBattleReport({
    capture: { match: 1, round: 5 },
    battle_config: { mode_id: 'mode_multi_abyss' },
    players: { 1: 'A' },
    rounds: { 5: { phase: 'self' } },
  });
  assert.equal(resolveRadioPhase({ report: combatReport, banSync: { ...idleBan, liveRound: 5 } }), 'combat');

  // 5. Boss active triggers Boss slot; defeated Boss stops Boss music
  const bossActive = readBattleReport({
    capture: { match: 1, round: 14 },
    battle_config: { mode_id: 'mode_multi_abyss' },
    players: { 1: 'A' },
    rounds: { 14: { phase: 'boss', boss_hp: 10000000 } },
  });
  assert.equal(resolveRadioPhase({ report: bossActive, banSync: { ...idleBan, liveRound: 14 } }), 'boss');

  const bossDefeated = readBattleReport({
    capture: { match: 1, round: 14 },
    battle_config: { mode_id: 'mode_multi_abyss' },
    defeated_boss_rounds: [14],
    players: { 1: 'A' },
    rounds: { 14: { phase: 'boss', boss_hp: 10000000 } },
  });
  assert.equal(resolveRadioPhase({ report: bossDefeated, banSync: { ...idleBan, liveRound: 14 } }), 'idle');
});
