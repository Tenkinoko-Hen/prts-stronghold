import { REPORT_ROUNDS } from '../battleReportData';

export type DemoScene = 'settled' | 'assisting' | 'opening' | 'solo_dps';
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
export function demoReport(scene: DemoScene) {
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
