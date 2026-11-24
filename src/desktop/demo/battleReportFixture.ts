import { REPORT_ROUNDS } from '../battleReportData';

export type DemoScene = 'coop_elim' | 'coop_boss' | 'quick_r9' | 'second_screen' | 'settled' | 'assisting' | 'opening' | 'solo_dps' | 'hud_preview';
const enemies = [
  ['enemy_1002_nsabr', '士兵'], ['enemy_1009_lurker', '潜伏者'], ['enemy_1006_shield', '重装防御者'],
  ['enemy_1023_jmage', '隐形术师'], ['enemy_9034_acblk', '假想敌：影役'], ['enemy_1509_mousek', '鼠王'],
  ['enemy_1043_zomsbr', '宿主士兵'], ['enemy_1161_tidmag', '控潮术师'],
];
const counts = (a: number, b: number, c: number, d: number) => ({ 1: a, 2: b, 3: c, 4: d });
const zero = counts(0, 0, 0, 0);
const enemy = (index: number, count: number) => ({ id: enemies[index][0], name: enemies[index][1], count });
const pair = (killer: number, owner: number, count: number) => ({ killer, owner, count });

const plans = REPORT_ROUNDS.flatMap(round => Array.from({ length: round <= 12 ? 8 : 7 }, (_, i) => {
  const [enemy_id, name] = enemies[(i + round) % enemies.length];
  return { round, action: Math.floor(i / 4), enemy_id, name, count: (i + round) % 6 + 1 };
}));

function buildDemoDeckPool(isSingle: boolean) {
  const operators = [
    { char_id: 'char_4166_varkis', name: '摆渡人', tier: 1, bonds: ['minosShip'], total_copies: 12, taken_by: { '1': 1 }, taken_total: 1, remaining: 11, in_shop_seats: [] },
    { char_id: 'char_469_indigo', name: '深靛', tier: 1, bonds: ['iberiaShip'], total_copies: 12, taken_by: { '1': 3 }, taken_total: 3, remaining: 9, in_shop_seats: [1] },
    { char_id: 'char_237_gravel', name: '砾', tier: 2, bonds: ['kazimierzShip'], total_copies: 14, taken_by: { '1': 1, '3': 2 }, taken_total: 3, remaining: 11, in_shop_seats: [] },
    { char_id: 'char_4047_pianst', name: '车尔尼', tier: 3, bonds: ['leithanienShip'], total_copies: 18, taken_by: { '1': 3, '4': 1 }, taken_total: 4, remaining: 14, in_shop_seats: [1] },
    { char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, bonds: ['leithanienShip', 'arcaneShip'], total_copies: 16, taken_by: isSingle ? { '1': 1 } : { '1': 1, '3': 3 }, taken_total: isSingle ? 1 : 4, remaining: isSingle ? 15 : 12, in_shop_seats: [1] },
    { char_id: 'char_4064_mlynar', name: '玛恩纳', tier: 4, bonds: ['kazimierzShip'], total_copies: 16, taken_by: isSingle ? { '1': 2 } : { '1': 2, '4': 3 }, taken_total: isSingle ? 2 : 5, remaining: isSingle ? 14 : 11, in_shop_seats: [] },
    { char_id: 'char_2026_yu', name: '余', tier: 4, bonds: ['yanShip'], total_copies: 16, taken_by: isSingle ? {} : { '3': 2 }, taken_total: isSingle ? 0 : 2, remaining: isSingle ? 16 : 14, in_shop_seats: [] },
    { char_id: 'char_2025_shu', name: '黍', tier: 5, bonds: ['yanShip', 'steadShip'], total_copies: 8, taken_by: isSingle ? { '1': 1 } : { '1': 1, '3': 3, '4': 2 }, taken_total: isSingle ? 1 : 6, remaining: isSingle ? 7 : 2, in_shop_seats: [] },
    { char_id: 'char_4145_ulpia', name: '乌尔比安', tier: 5, bonds: ['aegirShip'], total_copies: 8, taken_by: isSingle ? {} : { '4': 1 }, taken_total: isSingle ? 0 : 1, remaining: isSingle ? 8 : 7, in_shop_seats: [] },
    { char_id: 'char_1035_wisdel', name: '维什戴尔', tier: 6, bonds: ['sargonShip', 'preciShip'], total_copies: 5, taken_by: isSingle ? { '1': 1 } : { '1': 1, '3': 3, '4': 1 }, taken_total: isSingle ? 1 : 5, remaining: isSingle ? 4 : 0, in_shop_seats: [] },
    { char_id: 'char_4133_logos', name: '逻各斯', tier: 6, bonds: ['arcaneShip'], total_copies: 5, taken_by: isSingle ? { '1': 1 } : { '1': 1, '4': 1 }, taken_total: isSingle ? 1 : 2, remaining: isSingle ? 4 : 3, in_shop_seats: [1] },
    { char_id: 'char_4116_blkkgt', name: '锏', tier: 6, bonds: ['kjeragShip'], total_copies: 5, taken_by: {}, taken_total: 0, remaining: 5, in_shop_seats: [] },
  ];
  const equips = [
    { trap_id: 'trap_1041_acarm041', chess_id: 'chess_item_1_01_e_a', name: '维式重锤', tier: 1, item_type: 'EQUIP', give_bond_id: 'victoriaShip', taken_by: { '1': 1 }, taken_total: 1, in_shop_seats: [] },
    { trap_id: 'trap_1047_acarm047', chess_id: 'chess_item_1_02_e_a', name: '坚守盾牌', tier: 1, item_type: 'EQUIP', give_bond_id: 'steadShip', taken_by: { '3': 1 }, taken_total: 1, in_shop_seats: [] },
    { trap_id: 'trap_1066_acarm066', chess_id: 'chess_item_1_03_e_a', name: '盟约之币', tier: 1, item_type: 'EQUIP', give_bond_id: '', taken_by: {}, taken_total: 0, in_shop_seats: [1] },
    { trap_id: 'trap_1056_acarm056', chess_id: 'chess_item_2_01_e_a', name: '高能瞄准镜', tier: 2, item_type: 'EQUIP', give_bond_id: '', taken_by: { '1': 1 }, taken_total: 1, in_shop_seats: [] },
    { trap_id: 'trap_1121_acarm121', chess_id: 'chess_item_3_01_e_a', name: '源石法杖', tier: 3, item_type: 'EQUIP', give_bond_id: 'arcaneShip', taken_by: {}, taken_total: 0, in_shop_seats: [] },
    { trap_id: 'trap_1075_acarm075', chess_id: 'chess_item_4_01_e_a', name: '精密战术模组', tier: 4, item_type: 'EQUIP', give_bond_id: '', taken_by: { '4': 1 }, taken_total: 1, in_shop_seats: [] },
    { trap_id: 'trap_1067_acarm067', chess_id: 'chess_item_5_01_e_a', name: '炎国兵符', tier: 5, item_type: 'EQUIP', give_bond_id: 'yanShip', taken_by: {}, taken_total: 0, in_shop_seats: [] },
    { trap_id: 'trap_1117_acarm117', chess_id: 'chess_item_6_01_e_a', name: '终末圣遗物', tier: 6, item_type: 'EQUIP', give_bond_id: '', taken_by: {}, taken_total: 0, in_shop_seats: [] },
  ];
  return {
    mode_id: isSingle ? 'mode_single_funny' : 'mode_multi_hard',
    is_single: isSingle,
    shop_slots: {
      1: { char: 3, item: 1, upgrade_price: 5 },
      2: { char: 4, item: 1, upgrade_price: 8 },
      3: { char: 4, item: 1, upgrade_price: 11 },
      4: { char: 5, item: 1, upgrade_price: 12 },
      5: { char: 5, item: 1, upgrade_price: 13 },
      6: { char: 5, item: 1, upgrade_price: 99 },
    },
    tier_summary: [
      { tier: 1, operator_kinds: 2, total_copies: 24, taken_copies: 4, remaining_copies: 20, equip_kinds: 3 },
      { tier: 2, operator_kinds: 1, total_copies: 14, taken_copies: 3, remaining_copies: 11, equip_kinds: 1 },
      { tier: 3, operator_kinds: 1, total_copies: 18, taken_copies: 4, remaining_copies: 14, equip_kinds: 1 },
      { tier: 4, operator_kinds: 3, total_copies: 48, taken_copies: isSingle ? 3 : 11, remaining_copies: isSingle ? 45 : 37, equip_kinds: 1 },
      { tier: 5, operator_kinds: 2, total_copies: 16, taken_copies: isSingle ? 1 : 7, remaining_copies: isSingle ? 15 : 9, equip_kinds: 1 },
      { tier: 6, operator_kinds: 3, total_copies: 15, taken_copies: isSingle ? 2 : 7, remaining_copies: isSingle ? 13 : 8, equip_kinds: 1 },
    ],
    operators,
    equips,
  };
}

export function demoReport(scene: DemoScene) {
  if (scene === 'quick_r9' || scene === 'hud_preview') {
    const r9Rounds: Record<number, object> = {};
    for (let n = 1; n <= 8; n++) {
      r9Rounds[n] = {
        phase: 'settle',
        self_leaks: 0,
        leaks: { 1: 0 },
        leaks_status: 'reported',
        assists_status: 'skipped',
        assists_others: {},
      };
    }
    r9Rounds[9] = {
      phase: 'boss',
      self_leaks: 0,
      leaks: { 1: 0 },
      leaks_status: 'reported',
      assists_status: 'skipped',
      boss_hp: 4200000,
      boss_plan: { id: 'boss_3', hidden: false },
      boss_damage: { 1: 1842000 },
      boss_percent: { 1: 43 },
      boss_status: 'reported',
      boss_ended: false,
      boss_official: [
        { player: 1, identifier: 4, damage: 724000, char_id: 'char_4046_ebnhlz', operator_name: '黑键' },
        { player: 1, identifier: 180, damage: 512000, char_id: 'char_4133_logos', operator_name: '逻各斯' },
        { player: 1, identifier: 120, damage: 368000, char_id: 'char_4064_mlynar', operator_name: '玛恩纳' },
        { player: 1, identifier: 2, damage: 146000, char_id: 'char_4047_pianst', operator_name: '车尔尼' },
        { player: 1, identifier: 88, damage: 92000, char_id: 'char_2025_shu', operator_name: '黍' },
      ],
      boss_uplink: { 1: 1842000 },
      boss_uplink_rows: [],
    };
    return {
      capture: { match: 1, round: 9, self: 1 },
      players: { 1: '乌尔比福的安水' },
      hp: { 1: 25 },
      eliminated: {},
      boss_rounds: [9],
      defeated_boss_rounds: [],
      battle_config: { mode_id: 'mode_single_funny', mode_name: '极速模拟', boss_id: 'boss_3', max_round: 9 },
      rounds: r9Rounds,
      spawn_plan: plans.filter(p => p.round <= 9),
      lineups: {
        1: {
          round: 9,
          shop_level: 5,
          skill_id: 'aceffect_band_22',
          strategist: '阿米娅·众志合一',
          piece_count: 6,
          deployed_count: 5,
          deployed: [
            { inst_id: 1, chess_id: 'chess_char_4_01_b', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: true },
            { inst_id: 2, chess_id: 'chess_char_6_08_a', char_id: 'char_4133_logos', name: '逻各斯', tier: 6, is_golden: false },
            { inst_id: 3, chess_id: 'chess_char_4_15_a', char_id: 'char_4064_mlynar', name: '玛恩纳', tier: 4, is_golden: false },
            { inst_id: 4, chess_id: 'chess_char_3_01_b', char_id: 'char_4047_pianst', name: '车尔尼', tier: 3, is_golden: true },
            { inst_id: 5, chess_id: 'chess_char_5_05_a', char_id: 'char_2025_shu', name: '黍', tier: 5, is_golden: false },
          ],
          bench: [
            { inst_id: 6, chess_id: 'chess_char_1_09_a', char_id: 'char_4166_varkis', name: '摆渡人', tier: 1, is_golden: false },
          ],
          equips: [
            { inst_id: 21, identifier: 311, chess_id: 'chess_item_1_01_e_a', trap_id: 'trap_1041_acarm041', name: '维式重锤', tier: 1, is_golden: false, item_type: 'EQUIP' },
            { inst_id: 22, identifier: 320, chess_id: 'chess_item_2_01_e_b', trap_id: 'trap_1056_acarm056', name: '高能瞄准镜', tier: 2, is_golden: true, item_type: 'EQUIP' },
          ],
          shop_goods: [
            { kind: 'operator', slot: 0, price: 2, frozen: false, char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4 },
            { kind: 'operator', slot: 1, price: 2, frozen: false, char_id: 'char_4133_logos', name: '逻各斯', tier: 6 },
            { kind: 'equip', slot: 4, price: 2, frozen: false, trap_id: 'trap_1066_acarm066', name: '盟约之币', tier: 1 },
          ],
          squad: [],
        },
      },
      deck_pool: buildDemoDeckPool(true),
      telemetry: {
        scope: 'solo_stronghold',
        source: 'protocol_wire',
        coverage: 'protocol',
        logic_seconds: 58.0,
        team_total_damage: 1842000,
        team_total_healing: null,
        enemy_pool: { active_count: 1, defeated_count: 0, respawn_resets: 0, live_hp: 2358000, live_max_hp: 4200000,
          boss: { enemy_id: 'enemy_9021_acduml', name: '假想敌：管', hp: 2358000, max_hp: 4200000 } },
        timeline: [
          { t: 4, dps: 8400, total: 33600 },
          { t: 10, dps: 24200, total: 178800 },
          { t: 18, dps: 46800, total: 553200 },
          { t: 26, dps: 19500, total: 709200 },
          { t: 34, dps: 52400, total: 1128400 },
          { t: 42, dps: 38200, total: 1434000 },
          { t: 50, dps: 29800, total: 1672400 },
          { t: 58, dps: 21200, total: 1842000 },
        ],
        operators: [
          { char_id: 'char_4046_ebnhlz', name: '黑键', seat: 1, on_field: true, total_damage: 724000, summon_damage: 0,
            physical: 0, arts: 0, true: 0, elemental: 0, healing: 0, active_dps: 12482, pulse_dps: null, span_dps: 12482,
            active_seconds: 58, presence_seconds: 58, hits: 14, share_ratio: 0.3931, children: [] },
          { char_id: 'char_4133_logos', name: '逻各斯', seat: 1, on_field: true, total_damage: 512000, summon_damage: 0,
            physical: 0, arts: 0, true: 0, elemental: 0, healing: 0, active_dps: 8827, pulse_dps: null, span_dps: 8827,
            active_seconds: 58, presence_seconds: 58, hits: 12, share_ratio: 0.278, children: [] },
          { char_id: 'char_4064_mlynar', name: '玛恩纳', seat: 1, on_field: true, total_damage: 368000, summon_damage: 0,
            physical: 0, arts: 0, true: 0, elemental: 0, healing: 0, active_dps: 6344, pulse_dps: null, span_dps: 6344,
            active_seconds: 58, presence_seconds: 58, hits: 9, share_ratio: 0.1998, children: [] },
          { char_id: 'char_4047_pianst', name: '车尔尼', seat: 1, on_field: true, total_damage: 146000, summon_damage: 0,
            physical: 0, arts: 0, true: 0, elemental: 0, healing: 0, active_dps: 2517, pulse_dps: null, span_dps: 2517,
            active_seconds: 58, presence_seconds: 58, hits: 8, share_ratio: 0.0793, children: [] },
          { char_id: 'char_2025_shu', name: '黍', seat: 1, on_field: true, total_damage: 92000, summon_damage: 0,
            physical: 0, arts: 0, true: 0, elemental: 0, healing: 0, active_dps: 1586, pulse_dps: null, span_dps: 1586,
            active_seconds: 58, presence_seconds: 58, hits: 6, share_ratio: 0.0499, children: [] },
        ],
        rounds: {},
      },
    };
  }

  if (scene === 'coop_elim') {
    const coopRounds: Record<number, object> = {
      1: { phase: 'settle', self_leaks: 0, leaks: counts(0, 0, 0, 0), leaks_status: 'reported', assists_status: 'reported', assists_others: zero },
      2: { phase: 'settle', self_leaks: 4, leaks: counts(4, 0, 0, 0), leaks_status: 'reported', uncovered_leaks: {}, uncovered_status: 'reported', assists_status: 'reported', assists_others: counts(0, 0, 2, 2), assist_pairs: [pair(3, 1, 2), pair(4, 1, 2)], self_leak_enemies: [enemy(2, 4)], assist_enemies: [{ ...enemy(2, 2), killer: 3, owner: 1 }, { ...enemy(2, 2), killer: 4, owner: 1 }] },
      3: { phase: 'settle', self_leaks: 0, leaks: counts(0, 6, 0, 0), leaks_status: 'reported', uncovered_leaks: { 2: 2 }, uncovered_status: 'reported', assists_status: 'reported', assists_others: counts(4, 0, 0, 0), assist_pairs: [pair(1, 2, 4)], assist_enemies: [{ ...enemy(6, 4), killer: 1, owner: 2 }], uncovered_enemies: [{ ...enemy(6, 2), owner: 2 }] },
      4: { phase: 'settle', self_leaks: 3, leaks: counts(3, 4, 2, 1), leaks_status: 'reported', assists_status: 'skipped', all_players_leaked: true, assists_others: zero, self_leak_enemies: [enemy(0, 3)], hp_costs: { 1: 3, 2: 4, 3: 2, 4: 1 } },
      5: { phase: 'settle', self_leaks: 5, leaks: counts(5, 16, 0, 0), leaks_status: 'reported', uncovered_leaks: { 2: 10 }, uncovered_status: 'reported', assists_status: 'reported', assists_others: counts(0, 0, 6, 5), assist_pairs: [pair(3, 2, 6), pair(4, 1, 5)], self_leak_enemies: [enemy(3, 5)], hp_costs: { 2: 10 } },
      6: { phase: 'settle', self_leaks: 0, leaks: { 1: 0, 3: 4, 4: 0 }, leaks_status: 'reported', uncovered_leaks: {}, uncovered_status: 'reported', assists_status: 'reported', assists_others: { 1: 4, 3: 0, 4: 0 }, assist_pairs: [pair(1, 3, 4)], assist_enemies: [{ ...enemy(1, 4), killer: 1, owner: 3 }] },
      7: { phase: 'settle', self_leaks: 7, leaks: { 1: 7, 3: 11, 4: 0 }, leaks_status: 'reported', uncovered_leaks: { 1: 2, 3: 5 }, uncovered_status: 'reported', assists_status: 'reported', assists_others: { 1: 0, 3: 0, 4: 11 }, assist_pairs: [pair(4, 1, 5), pair(4, 3, 6)], self_leak_enemies: [enemy(4, 4), enemy(5, 3)], assist_enemies: [{ ...enemy(4, 4), killer: 4, owner: 1 }, { ...enemy(5, 1), killer: 4, owner: 1 }] },
    };
    return {
      capture: { match: 2, round: 7, self: 1 },
      players: { 1: '乌尔比福的安水', 2: '荒芜拉普兰德', 3: '威龙我爱你老婆', 4: 'hvvn' },
      hp: { 1: 3, 2: 0, 3: 8, 4: 13 },
      eliminated: { 2: 5 },
      boss_rounds: [14, 15],
      defeated_boss_rounds: [],
      battle_config: { mode_id: 'mode_multi_hard', mode_name: '绝境模拟', boss_id: 'boss_1', hidden_boss_id: 'boss_8' },
      rounds: coopRounds,
      spawn_plan: plans,
      lineups: {
        1: {
          round: 7, shop_level: 4, skill_id: 'aceffect_band_22', strategist: '阿米娅·众志合一', piece_count: 5, deployed_count: 4,
          deployed: [
            { inst_id: 1, chess_id: 'chess_char_4_01_a', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: false },
            { inst_id: 2, chess_id: 'chess_char_3_01_b', char_id: 'char_4047_pianst', name: '车尔尼', tier: 3, is_golden: true },
            { inst_id: 3, chess_id: 'chess_char_4_15_a', char_id: 'char_4064_mlynar', name: '玛恩纳', tier: 4, is_golden: false },
            { inst_id: 4, chess_id: 'chess_char_1_09_a', char_id: 'char_4166_varkis', name: '摆渡人', tier: 1, is_golden: false },
          ],
          bench: [
            { inst_id: 5, chess_id: 'chess_char_2_06_a', char_id: 'char_237_gravel', name: '砾', tier: 2, is_golden: false },
          ],
          equips: [
            { inst_id: 20, identifier: 311, chess_id: 'chess_item_1_01_e_a', trap_id: 'trap_1041_acarm041', name: '维式重锤', tier: 1, is_golden: false, item_type: 'EQUIP' },
          ],
          shop_goods: [
            { kind: 'operator', slot: 0, price: 2, frozen: false, char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4 },
            { kind: 'operator', slot: 1, price: 2, frozen: false, char_id: 'char_4047_pianst', name: '车尔尼', tier: 3 },
            { kind: 'equip', slot: 4, price: 1, frozen: false, trap_id: 'trap_1066_acarm066', name: '盟约之币', tier: 1 },
          ],
          squad: [],
        },
        2: { round: 5, shop_level: 3, skill_id: 'aceffect_band_103', strategist: '森蚺·暴躁铁皮', piece_count: 0, deployed_count: 0, deployed: [], bench: [], equips: [], shop_goods: [], squad: [] },
        3: {
          round: 7, shop_level: 5, skill_id: 'aceffect_band_107', strategist: '妮芙·溃心领域', piece_count: 5, deployed_count: 3,
          deployed: [
            { inst_id: 31, chess_id: 'chess_char_5_05_b', char_id: 'char_2025_shu', name: '黍', tier: 5, is_golden: true },
            { inst_id: 32, chess_id: 'chess_char_4_01_b', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: true },
            { inst_id: 33, chess_id: 'chess_char_5_27_a', char_id: 'char_618_acrbot', name: '“暴躁铁皮”', tier: 5, is_golden: false },
          ],
          bench: [], equips: [], shop_goods: [], squad: [],
        },
        4: {
          round: 7, shop_level: 5, skill_id: 'aceffect_band_15', strategist: '坎诺特·利滚利', piece_count: 4, deployed_count: 4,
          deployed: [
            { inst_id: 41, chess_id: 'chess_char_4_15_b', char_id: 'char_4064_mlynar', name: '玛恩纳', tier: 4, is_golden: true },
            { inst_id: 42, chess_id: 'chess_char_6_08_a', char_id: 'char_4133_logos', name: '逻各斯', tier: 6, is_golden: false },
          ],
          bench: [], equips: [], shop_goods: [], squad: [],
        },
      },
      deck_pool: buildDemoDeckPool(false),
    };
  }

  if (scene === 'coop_boss') {
    const r14Rounds: Record<number, object> = {};
    for (let n = 1; n <= 13; n++) {
      r14Rounds[n] = {
        phase: 'settle',
        self_leaks: n === 4 || n === 9 ? 1 : 0,
        leaks: { 1: n <= 10 ? 2 : 0, 2: n === 4 || n === 9 ? 1 : 0, 3: n <= 10 ? 3 : 0, 4: 0 },
        leaks_status: 'reported',
        assists_status: 'reported',
        assists_others: { 1: 0, 2: n === 8 ? 3 : 0, 3: 0, 4: n === 4 ? 1 : 0 },
      };
    }
    r14Rounds[14] = {
      phase: 'boss',
      self_leaks: 0,
      leaks: { 2: 0, 4: 0 },
      leaks_status: 'reported',
      assists_status: 'skipped',
      boss_hp: 7437000,
      boss_plan: { id: 'boss_1', hidden: false },
      boss_damage: {},
      boss_percent: { 2: 20, 4: 4 },
      boss_status: 'unknown',
      boss_ended: false,
      boss_official: [
        { player: 2, identifier: 267, damage: 3435000, char_id: 'char_618_acrbot', operator_name: '“暴躁铁皮”' },
        { player: 4, identifier: 108, damage: 196000, char_id: 'char_180_amgoat', operator_name: '艾雅法拉' },
        { player: 4, identifier: 61, damage: 168000, char_id: 'char_4119_wanqin', operator_name: '折光' },
      ],
      boss_uplink: { 2: 3435000 },
      boss_uplink_rows: [],
    };
    return {
      capture: { match: 3, round: 14, self: 2 },
      players: { 1: '冰凌', 2: '乌尔比福的安水', 3: '补药迫害冰淇淋', 4: '几许愁' },
      hp: { 1: 0, 2: 14, 3: 0, 4: 9 },
      eliminated: { 1: 10, 3: 10 },
      boss_rounds: [14, 15],
      defeated_boss_rounds: [],
      battle_config: { mode_id: 'mode_multi_hard', mode_name: '绝境模拟', boss_id: 'boss_1', hidden_boss_id: 'boss_8' },
      rounds: r14Rounds,
      spawn_plan: plans,
      lineups: {
        1: { round: 10, shop_level: 4, skill_id: 'aceffect_band_15', strategist: '坎诺特·利滚利', piece_count: 0, deployed_count: 0, deployed: [], bench: [], equips: [], shop_goods: [], squad: [] },
        2: {
          round: 14, shop_level: 5, skill_id: 'aceffect_band_103', strategist: '森蚺·暴躁铁皮', piece_count: 5, deployed_count: 5,
          deployed: [
            { inst_id: 21, chess_id: 'chess_char_5_27_b', char_id: 'char_618_acrbot', name: '“暴躁铁皮”', tier: 5, is_golden: true },
            { inst_id: 22, chess_id: 'chess_char_4_15_b', char_id: 'char_4064_mlynar', name: '玛恩纳', tier: 4, is_golden: true },
            { inst_id: 23, chess_id: 'chess_char_5_05_a', char_id: 'char_2025_shu', name: '黍', tier: 5, is_golden: false },
            { inst_id: 24, chess_id: 'chess_char_4_01_a', char_id: 'char_4046_ebnhlz', name: '黑键', tier: 4, is_golden: false },
            { inst_id: 25, chess_id: 'chess_char_2_06_b', char_id: 'char_237_gravel', name: '砾', tier: 2, is_golden: true },
          ],
          bench: [], equips: [], shop_goods: [], squad: [],
        },
        3: { round: 10, shop_level: 4, skill_id: 'aceffect_band_107', strategist: '妮芙·溃心领域', piece_count: 0, deployed_count: 0, deployed: [], bench: [], equips: [], shop_goods: [], squad: [] },
        4: {
          round: 14, shop_level: 5, skill_id: 'aceffect_band_22', strategist: '阿米娅·众志合一', piece_count: 4, deployed_count: 4,
          deployed: [
            { inst_id: 41, chess_id: 'chess_char_4_02_b', char_id: 'char_180_amgoat', name: '艾雅法拉', tier: 4, is_golden: true },
            { inst_id: 42, chess_id: 'chess_char_2_01_b', char_id: 'char_4119_wanqin', name: '折光', tier: 2, is_golden: true },
            { inst_id: 43, chess_id: 'chess_char_6_08_a', char_id: 'char_4133_logos', name: '逻各斯', tier: 6, is_golden: false },
            { inst_id: 44, chess_id: 'chess_char_3_01_a', char_id: 'char_4047_pianst', name: '车尔尼', tier: 3, is_golden: false },
          ],
          bench: [], equips: [], shop_goods: [], squad: [],
        },
      },
      deck_pool: buildDemoDeckPool(false),
    };
  }

  if (scene === 'solo_dps') {
    return {
      capture: { match: 1001, round: 1, self: 1 },
      players: { 1: '博士' },
      battle_config: { mode_id: 'mode_solo_stage', stage_id: 'act38side_ex08', stage_name: 'EX-8 突袭 · 熔炉边界' },
      rounds: { 1: { phase: 'self', self_leaks: 0, leaks: { 1: 0 }, leaks_status: 'reported', assists_status: 'skipped' } },
      spawn_plan: [],
      telemetry: {
        scope: 'solo_stage',
        source: 'memory_readonly',
        coverage: 'full',
        logic_seconds: 64.5,
        team_total_damage: 342800,
        team_total_healing: 41200,
        enemy_pool: { active_count: 3, defeated_count: 42, respawn_resets: 1, live_hp: 38500, live_max_hp: 120000,
          boss: { enemy_id: 'enemy_1521_dslily', name: '领袖假想敌', hp: 38500, max_hp: 120000 } },
        timeline: [
          { t: 5, dps: 2100, total: 10500 },
          { t: 15, dps: 6800, total: 78500 },
          { t: 25, dps: 4900, total: 127500 },
          { t: 40, dps: 8200, total: 250500 },
          { t: 55, dps: 5100, total: 327000 },
          { t: 64.5, dps: 1660, total: 342800 },
        ],
        operators: [
          { char_id: 'char_1035_wisdel', name: '维什戴尔', seat: 1, on_field: true, total_damage: 168400, summon_damage: 42100,
            physical: 152400, arts: 16000, true: 0, elemental: 0, healing: 0, active_dps: 5420, pulse_dps: 6180, span_dps: 3210,
            active_hps: 0, pulse_hps: 0, span_hps: 0, active_seconds: 31.1, presence_seconds: 52.4, share_ratio: 0.4912,
            children: [{ unit_id: 'token_10042_wisdel_soul', name: '魂影残响', total_damage: 42100, physical: 26100, arts: 16000, true: 0, elemental: 0, healing: 0, on_field: true }] },
          { char_id: 'char_4133_logos', name: '逻各斯', seat: 1, on_field: true, total_damage: 112600, summon_damage: 0,
            physical: 0, arts: 84200, true: 4400, elemental: 24000, healing: 0, active_dps: 3890, pulse_dps: 4120, span_dps: 2340,
            active_hps: 0, pulse_hps: 0, span_hps: 0, active_seconds: 28.9, presence_seconds: 48.1, share_ratio: 0.3285, children: [] },
          { char_id: 'char_4116_blkkgt', name: '锏', seat: 1, on_field: true, total_damage: 61800, summon_damage: 0,
            physical: 61800, arts: 0, true: 0, elemental: 0, healing: 0, active_dps: 3150, pulse_dps: 2200, span_dps: 1580,
            active_hps: 0, pulse_hps: 0, span_hps: 0, active_seconds: 19.6, presence_seconds: 39.1, share_ratio: 0.1803, children: [] },
          { char_id: 'char_2025_shu', name: '黍', seat: 1, on_field: true, total_damage: 0, summon_damage: 0,
            physical: 0, arts: 0, true: 0, elemental: 0, healing: 41200, active_dps: 0, pulse_dps: 0, span_dps: 0,
            active_hps: 1280, pulse_hps: 1450, span_hps: 890, active_seconds: 0, presence_seconds: 46.3, share_ratio: 0, children: [] },
        ],
        stage_devices: [{ unit_id: 'trap_042_originium', name: '源石祭坛', total_damage: 18500, physical: 0, arts: 0, true: 18500, elemental: 0, healing: 0 }],
      },
    };
  }
  const rounds: Record<number, object> = {};
  if (scene !== 'opening') {
    for (let n = 1; n < 9; n++) {
      const leak = n === 1 || n === 7 ? 0 : n % 3 + 1;
      rounds[n] = n === 6 ? { phase: 'settle', self_leaks: 2, leaks: counts(1, 2, 2, 1),
        leaks_status: 'reported', assists_status: 'skipped', all_players_leaked: true, assists_others: zero, self_leak_enemies: [enemy(0, 2)] }
        : { phase: 'settle', leaks: counts(0, 0, leak, 0), leaks_status: 'reported', self_leaks: leak,
          uncovered_leaks: {}, uncovered_status: 'reported', assists_status: 'reported', assists_others: counts(leak, 0, 0, 0),
          self_leak_enemies: leak ? [enemy(n % enemies.length, leak)] : [], assist_pairs: leak ? [pair(1, 3, leak)] : [],
          assist_enemies: leak ? [{ ...enemy(n % enemies.length, leak), killer: 1, owner: 3 }] : [] };
    }
    rounds[9] = { phase: scene === 'assisting' ? 'assist' : 'settle', self_leaks: 6, leaks: counts(0, 1, 6, 8), leaks_status: 'reported',
      ...(scene === 'settled' ? { assists_status: 'reported', assists_others: counts(8, 0, 0, 0),
        assist_pairs: [pair(1, 3, 3), pair(1, 2, 1), pair(1, 4, 4)], uncovered_leaks: { 3: 3, 4: 4 }, uncovered_status: 'reported',
        self_leak_enemies: [enemy(1, 3), enemy(4, 2), enemy(5, 1)], assist_enemies: [{ ...enemy(1, 3), killer: 1, owner: 3 }] } : {}) };
  }
  return { capture: { match: 1, round: scene === 'opening' ? 0 : 9, self: 3 }, players: {},
    battle_config: { mode_id: 'mode_multi_normal', boss_id: 'boss_1' }, rounds, spawn_plan: plans };
}
