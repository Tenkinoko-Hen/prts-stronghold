import { REPORT_ROUNDS } from '../battleReportData';

export type DemoScene = 'settled' | 'assisting' | 'opening';
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
