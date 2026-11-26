// 青逝痕 Tenkinoko 制作
import type { HudNormalPage } from '../HudStripApp';
import type { HudOverlayState, HudScale } from '../battleReports';
import { demoReport } from './battleReportFixture';

function createLeakR8Report() {
  const base = demoReport('coop_boss') as Record<string, any>;
  const rounds = { ...(base.rounds || {}) };
  for (let n = 9; n <= 15; n++) delete rounds[n];
  rounds[8] = {
    phase: 'settle',
    self_leaks: 6,
    leak_minimums: { 1: 1, 2: 1, 3: 1, 4: 1 },
    skipped_hp_costs: { 1: 6, 2: 4, 3: 5, 4: 3 },
    assists_status: 'skipped',
    all_players_leaked: true,
    uncovered_status: 'unknown',
    uncovered_leaks: {},
    assists_others: {},
    hp_costs: { 1: 6, 2: 4, 3: 5, 4: 3 },
    self_leak_enemies: [
      { id: 'enemy_1006_shield', name: '重装防御者', count: 3, unit_power: 450 },
      { id: 'enemy_1023_jmage', name: '隐形术师', count: 2, unit_power: 600 },
      { id: 'enemy_1002_nsabr', name: '士兵', count: 1, unit_power: 200 },
    ],
  };

  // Seat 1 injects 8 active_bonds (up to 999 stacks) for high-stack covenant stress testing;
  // Seat 2 keeps empty squad covenants so static reference + smart-quote normalization stay verified.
  const lineups = {
    1: {
      round: 8,
      shop_level: 4,
      strategist: '阿米娅·众志合一',
      piece_count: 4,
      deployed_count: 4,
      deployed: [
        { inst_id: 1, chess_id: '', char_id: 'char_1035_wisdel', name: '维什戴尔', tier: 6, is_golden: false },
        { inst_id: 2, chess_id: '', char_id: 'char_pramanix_2', name: '“圣聆初雪”', tier: 6, is_golden: true },
        { inst_id: 3, chess_id: '', char_id: 'char_367_swllow', name: '灰喉', tier: 1, is_golden: false },
        { inst_id: 4, chess_id: '', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: false },
      ],
      bench: [],
      equips: [],
      shop_goods: [],
      squad: [],
      active_bonds: [
        { bond_id: 'arcaneShip', stacks: 999, active: true },
        { bond_id: 'preciShip', stacks: 245, active: true },
        { bond_id: 'ursusShip', stacks: 128, active: true },
        { bond_id: 'kjeragShip', stacks: 64, active: true },
        { bond_id: 'lethaniaShip', stacks: 32, active: true },
        { bond_id: 'visiShip', stacks: 18, active: true },
        { bond_id: 'swiftShip', stacks: 12, active: true },
        { bond_id: 'yanShip', stacks: 6, active: true },
      ],
    },
    2: {
      round: 8,
      shop_level: 3,
      strategist: '维什戴尔·爆裂黎明',
      piece_count: 3,
      deployed_count: 3,
      deployed: [
        { inst_id: 5, chess_id: '', char_id: 'char_pramanix_2', name: '“圣聆初雪”', tier: 6, is_golden: false },
        { inst_id: 6, chess_id: '', char_id: 'char_4133_logos', name: '逻各斯', tier: 6, is_golden: false },
        { inst_id: 7, chess_id: '', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: false },
      ],
      bench: [],
      equips: [],
      shop_goods: [],
      squad: [],
    },
    3: {
      round: 8,
      shop_level: 4,
      strategist: '斯卡蒂·深海共鸣',
      piece_count: 3,
      deployed_count: 3,
      deployed: [
        { inst_id: 8, chess_id: '', char_id: 'char_zheya', name: '折桠', tier: 1, is_golden: false },
        { inst_id: 9, chess_id: '', char_id: 'char_lethes', name: '烈夏', tier: 3, is_golden: false },
        { inst_id: 10, chess_id: '', char_id: 'char_istina', name: '真理', tier: 3, is_golden: false },
      ],
      bench: [],
      equips: [],
      shop_goods: [],
      squad: [],
    },
    4: {
      round: 8,
      shop_level: 4,
      strategist: '锡兰·源石脉动',
      piece_count: 3,
      deployed_count: 3,
      deployed: [
        { inst_id: 11, chess_id: '', char_id: 'char_mousse', name: '慕斯', tier: 1, is_golden: false },
        { inst_id: 12, chess_id: '', char_id: 'char_harold', name: '哈洛德', tier: 4, is_golden: false },
        { inst_id: 13, chess_id: '', char_id: 'char_catherine', name: '凯瑟琳', tier: 3, is_golden: false },
      ],
      bench: [],
      equips: [],
      shop_goods: [],
      squad: [],
    },
  };

  return {
    ...base,
    capture: { ...(base.capture || {}), round: 8, self: 1 },
    hp: { 1: 14, 2: 11, 3: 18, 4: 22 },
    eliminated: {},
    boss_rounds: [],
    defeated_boss_rounds: [],
    rounds,
    lineups,
  };
}

function createBossR14Report() {
  const base = demoReport('coop_boss') as Record<string, any>;
  const rounds = { ...(base.rounds || {}) };
  delete rounds[15];
  rounds[14] = {
    phase: 'boss',
    self_leaks: 0,
    leaks: { 1: 0, 2: 0, 3: 0, 4: 0 },
    leaks_status: 'reported',
    assists_status: 'skipped',
    boss_hp: 1560000,
    boss_plan: { id: 'boss_3', hidden: false },
    // Intentionally omit seat 3 from boss_damage so official-list merging recovers #3
    boss_damage: { 1: 8588000, 2: 6120000, 4: 2940000 },
    boss_percent: { 1: 42.8, 2: 30.5, 3: 12.1, 4: 14.6 },
    boss_status: 'reported',
    boss_ended: false,
    boss_official: [
      { player: 1, identifier: 1035, char_id: 'char_1035_wisdel', operator_name: '维什戴尔', damage: 4620000 },
      { player: 1, identifier: 4133, char_id: 'char_4133_logos', operator_name: '逻各斯', damage: 3968000 },
      { player: 2, identifier: 4064, char_id: 'char_4064_mlynar', operator_name: '玛恩纳', damage: 6120000 },
      { player: 3, identifier: 4116, char_id: 'char_4116_blkkgt', operator_name: '锏', damage: 2430000 },
      { player: 3, identifier: 4046, char_id: 'char_4046_ebnhlz', operator_name: '黑键', damage: 1980000 },
      { player: 4, identifier: 2025, char_id: 'char_2025_shu', operator_name: '黍', damage: 2940000 },
    ],
  };

  return {
    ...base,
    capture: { ...(base.capture || {}), round: 14, self: 1 },
    eliminated: {},
    boss_rounds: [14],
    defeated_boss_rounds: [],
    rounds,
  };
}

function createIntelR4Report() {
  const opening = demoReport('opening') as Record<string, any>;
  const withPool = demoReport('coop_boss') as Record<string, any>;
  return {
    ...opening,
    capture: { ...(opening.capture || {}), round: 4, self: 1 },
    deck_pool: withPool.deck_pool,
    lineups: withPool.lineups
      ? { ...withPool.lineups, 1: { ...(withPool.lineups[1] || {}), round: 4, shop_level: 3 } }
      : opening.lineups,
  };
}

export function buildHudDemoPreview(
  demoKey: string,
  scale: HudScale = 'md',
): { previewState: HudOverlayState; initialPage: HudNormalPage } | null {
  if (demoKey === 'leak_r8') {
    return {
      initialPage: 'leak',
      previewState: {
        open: true,
        locked: false,
        scale,
        shortcut: 'Ctrl+Shift+F10',
        shortcutAvailable: true,
        status: 'listening',
        clientSource: 'mumu',
        drawerCollapsed: true,
        report: createLeakR8Report(),
        guide: { round: 8, compTitle: '全员高漏复盘演示', paceTip: '' },
      },
    };
  }
  if (demoKey === 'boss_r14') {
    return {
      initialPage: 'dps',
      previewState: {
        open: true,
        locked: false,
        scale,
        shortcut: 'Ctrl+Shift+F10',
        shortcutAvailable: true,
        status: 'listening',
        clientSource: 'mumu',
        drawerCollapsed: true,
        report: createBossR14Report(),
        guide: { round: 14, compTitle: 'Boss R14 四席输出', paceTip: '' },
      },
    };
  }
  if (demoKey === 'intel_r4') {
    return {
      initialPage: 'intel',
      previewState: {
        open: true,
        locked: false,
        scale,
        shortcut: 'Ctrl+Shift+F10',
        shortcutAvailable: true,
        status: 'listening',
        clientSource: 'mumu',
        drawerCollapsed: true,
        report: createIntelR4Report(),
        guide: {
          round: 4,
          compTitle: '4本追核期',
          paceTip: 'D 牌提质量 · 优先追黑键 / 玛恩纳，留意下两波控潮术师',
          suggestedOperators: ['黑键', '玛恩纳', '维什戴尔', '逻各斯'],
        },
      },
    };
  }
  return null;
}
