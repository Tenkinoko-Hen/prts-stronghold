import { BOSS_ENCOUNTERS } from '../data/bossEncounterData';
import { readCombatTelemetry, readDeckPool, readSeatLineups, type CombatTelemetrySnapshot, type DeckPoolSnapshot, type SeatLineup } from './combatTelemetry';
import { mapBannedBondsToCovenants } from './covenantBonds';

export const REPORT_SEATS = [1, 2, 3, 4] as const;
export const REPORT_ROUNDS = Array.from({ length: 15 }, (_, i) => i + 1);
export type ReportRoundFilter = number | 'all';
export type PreviewRoundFilter = ReportRoundFilter | 'follow';

const modes: Readonly<Record<string, string>> = {
  mode_solo_stage: '单人作战关卡',
  mode_training_2: '入门协议',
  mode_single_funny: '极速模拟',
  mode_multi_funny: '标准模拟', mode_multi_normal: '险境模拟', mode_multi_hard: '绝境模拟', mode_multi_abyss: '终极模拟',
};
const bossIds = [
  'enemy_9013_acstmk', 'enemy_9017_achunt', 'enemy_9021_acduml', 'enemy_1521_dslily', 'enemy_2016_csphtm',
  'enemy_9032_aclionk', 'enemy_9033_acdeer', 'enemy_9013_acstmk_2', 'enemy_9017_achunt_2', 'enemy_9021_acduml_2',
  'enemy_9029_acfnc', 'enemy_9035_acspider', 'enemy_9037_aceel', 'enemy_9029_acfnc_2', 'enemy_9035_acspider_2',
  'enemy_9037_aceel_2', 'enemy_2124_dyjsfg',
];
const bossToken = (id: string) => {
  const match = /^boss_([1-9]\d?)$/.exec(id);
  return match ? bossIds[Number(match[1]) - 1] ?? '' : id;
};
const bossEncounter = (id: string, isHidden: boolean) => {
  const token = bossToken(id);
  return BOSS_ENCOUNTERS.find(encounter =>
    encounter.rounds[isHidden ? 15 : 14] && (isHidden ? `${encounter.id}_2` : encounter.id) === token)
    ?? (!isHidden ? BOSS_ENCOUNTERS.find(encounter => encounter.id === token) : undefined);
};
const spawnKey = (round: number, action: number | null, id: string, count: number | null) =>
  `${round}:${action}:${id}:${count}`;

type ObjectData = Record<string, unknown>;
const object = (value: unknown): ObjectData | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectData : null;
const array = (value: unknown) => Array.isArray(value) ? value as unknown[] : [];
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 200) : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const leakCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const round = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 15 ? value : null;
const seat = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
const action = (value: unknown) => value === -1 ? -1 : number(value);
const numberTable = (value: unknown) => Object.fromEntries(REPORT_SEATS.flatMap(id => {
  const data = number(object(value)?.[id]);
  return data === null ? [] : [[id, data]];
}));
// 保留“明确确认”与“未提供依据”的区别；仅在桌面内存中随回合复制，不写入 JSON。
const confirmedBossBasis = Symbol('confirmedBossBasis');
const confirmedBossRound = { [confirmedBossBasis]: true };

interface Enemy {
  id: string;
  name: string;
  count: number | null;
  leaked: number | null;
  power: number | null;
}
export interface EnemyOutcome { id: string; name: string; count: number; unitPower: number | null }
interface AssistEnemy extends EnemyOutcome { killer: number; owner: number }
interface UncoveredEnemy extends EnemyOutcome { owner: number }
interface WaveRow {
  seat: number | null;
  action: number | null;
  planned: number | null;
  leaked: number | null;
  power: number | null;
  unpriced: number;
  enemies: Enemy[];
}
interface Spawn extends Pick<Enemy, 'id' | 'name' | 'count'> {
  round: number;
  action: number | null;
  kind: 'plan' | 'battle';
  boss?: true;
}
export interface BossHit {
  seat: number;
  identifier: number;
  source: number | null;
  damage: number;
  charId?: string;
  operatorName?: string;
}
export interface BattleRound {
  number: number;
  phase: string;
  leaks: Record<number, number>;
  leaksStatus: string;
  leakMinimums: Record<number, number>;
  uncoveredLeaks: Record<number, number>;
  uncoveredStatus: string;
  unassignedSelfLeaks: number | null;
  selfLeaks: number | null;
  selfLeakEnemies: EnemyOutcome[] | null;
  skippedCosts: Record<number, number>;
  assists: Record<number, number>;
  assistsStatus: string;
  assistsPartial: boolean;
  assistPairs: { killer: number; owner: number; count: number }[];
  assistEnemies: AssistEnemy[];
  uncoveredEnemies: UncoveredEnemy[];
  unattributedAssists: number;
  hpCosts: Record<number, number>;
  allPlayersLeaked: boolean;
  bossDamage: Record<number, number>;
  bossPercent: Record<number, number>;
  bossUplink: Record<number, number>;
  bossUplinkRows: BossHit[];
  bossOfficial: BossHit[];
  bossStatus: string;
  bossRoundInferred: boolean;
  bossEnded: boolean;
  bossHp: number | null;
  bossPlanId: string;
  bossGroups: boolean;
  waveConfirmed: number[];
  rows: WaveRow[];
}
export interface BattleReport {
  match: number | null;
  current: number | null;
  self: number | null;
  selfBySettlement: boolean;
  selfManual: boolean;
  mode: string;
  difficulty: string;
  boss: string;
  hiddenBoss: string;
  bossRounds: number[];
  bannedCovenants: string[];
  defeatedBossRounds: number[];
  names: Record<number, string>;
  hp: Record<number, number>;
  eliminated: Record<number, number>;
  rounds: BattleRound[];
  preview: Spawn[];
  lineups: Record<number, SeatLineup>;
  deckPool: DeckPoolSnapshot | null;
  telemetry: CombatTelemetrySnapshot | null;
}

function readEnemy(value: unknown): Enemy | null {
  const row = object(value);
  if (!row) return null;
  const id = text(row.id);
  return { id, name: text(row.name) || id || '未识别敌人', count: number(row.planned),
    leaked: number(row.leaked), power: number(row.unit_power) };
}

function readEnemyOutcome(value: unknown): EnemyOutcome | null {
  const row = object(value);
  const id = text(row?.id);
  const count = leakCount(row?.count);
  return id && count ? { id, name: text(row?.name) || id, count, unitPower: number(row?.unit_power) } : null;
}

export function groupEnemyOutcomes(enemies: EnemyOutcome[]): EnemyOutcome[] {
  const byId = new Map<string, EnemyOutcome>();
  for (const enemy of enemies) {
    const current = byId.get(enemy.id);
    if (!current) byId.set(enemy.id, { ...enemy });
    else {
      current.count += enemy.count;
      if (current.unitPower !== enemy.unitPower) current.unitPower = null;
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function bossHits(value: unknown, official: boolean): BossHit[] {
  return array(value).flatMap(value => {
    const row = object(value);
    const player = seat(row?.player);
    const identifier = number(row?.[official ? 'identifier' : 'attacker']);
    const damage = number(row?.damage);
    if (player === null || identifier === null || damage === null) return [];
    const charId = text(row?.char_id);
    const operatorName = text(row?.operator_name);
    return [{
      seat: player,
      identifier,
      source: official ? null : number(row?.source),
      damage,
      ...(charId ? { charId } : {}),
      ...(operatorName ? { operatorName } : {}),
    }];
  });
}

export function readBattleReport(input: unknown): BattleReport {
  const root = object(input);
  const players = object(root?.players);
  const rounds = object(root?.rounds);
  if (!root || !players || !rounds) throw new Error('战报快照缺少玩家或回合数据。');
  const capture = object(root.capture);
  const config = object(root.battle_config);
  const mode = text(config?.mode_id);
  const preview: Spawn[] = array(root.spawn_plan).flatMap(value => {
    const row = object(value);
    const index = round(row?.round);
    const id = text(row?.enemy_id);
    if (index === null || !id) return [];
    return [{ id, name: text(row?.name) || id, round: index, action: action(row?.action), count: number(row?.count), kind: 'plan' }];
  });
  const knownBatches = new Set(preview.map(item => spawnKey(item.round, item.action, item.id, item.count)));
  const enemyNames = new Map(preview.map(item => [item.id, item.name]));
  const result: BattleRound[] = [];
  for (const index of REPORT_ROUNDS) {
    const row = object(rounds[index]);
    if (!row) continue;
    const waveReport = object(row.wave_power);
    const bossGroups = waveReport?.boss_groups === true;
    const lines = array(waveReport?.rows).flatMap(value => {
      const wave = object(value);
      if (!wave) return [];
      return [{ seat: bossGroups ? number(wave.player) : seat(wave.player), action: action(wave.action),
        planned: number(wave.planned), leaked: number(wave.leaked), power: number(wave.power),
        unpriced: number(wave.unpriced) ?? 0, enemies: array(wave.enemies).flatMap(value => readEnemy(value) ?? []) }];
    });
    const bossPlanId = text(object(row.boss_plan)?.id);
    const isBossCandidate = index >= 14 || row.phase === 'boss' || row.boss_ended === true || Boolean(bossPlanId);
    const encounter = isBossCandidate ? bossEncounter(bossPlanId, index === 15) : undefined;
    if (encounter) {
      const id = bossToken(bossPlanId);
      if (!preview.some(item => item.round === index && item.id === id)) {
        preview.push({ id, name: encounter.name, round: index, action: null, count: 1, kind: 'plan', boss: true });
      }
    }
    for (const wave of lines) {
      for (const enemy of wave.enemies) {
        if (!enemy.count) continue;
        const publicPlan = wave.seat === null;
        if (publicPlan && knownBatches.has(spawnKey(index, wave.action, enemy.id, enemy.count))) continue;
        preview.push({ id: enemy.id, name: enemy.name, count: enemy.count, round: index, action: wave.action,
          kind: publicPlan ? 'plan' : 'battle' });
      }
    }
    for (const extra of array(row.prep_extras)) {
      const item = object(extra);
      const player = seat(item?.player);
      const id = text(item?.enemy_id);
      const count = number(item?.count);
      if (!id || !count || player === null || (!bossGroups && lines.some(wave => wave.seat === player
          && wave.action === -1 && wave.enemies.some(enemy => enemy.id === id && enemy.count)))) continue;
      preview.push({ id, name: enemyNames.get(id) ?? id, count, round: index, action: -1, kind: 'plan' });
    }
    const skippedCosts = numberTable(row.skipped_hp_costs);
    const hpCosts = numberTable(row.hp_costs);
    const assistsStatus = text(row.assists_others_status ?? row.assists_status);
    const pairs = new Map<string, BattleRound['assistPairs'][number]>();
    for (const value of array(row.assist_pairs)) {
      const pair = object(value);
      const killer = seat(pair?.killer), owner = seat(pair?.owner), count = leakCount(pair?.count);
      if (killer === null || owner === null || !count) continue;
      const key = `${killer}:${owner}`;
      pairs.set(key, { killer, owner, count: (pairs.get(key)?.count ?? 0) + count });
    }
    const assistPairs = [...pairs.values()];
    // Older imports may carry only each killer's total. Retain those observations without guessing the owner.
    const killTotals = object(row.assists);
    const unmatched = Math.max(leakCount(row.unattributed_assists) ?? 0, REPORT_SEATS.reduce((sum, killer) => sum + Math.max(0, (leakCount(killTotals?.[killer]) ?? 0)
      - assistPairs.filter(pair => pair.killer === killer).reduce((total, pair) => total + pair.count, 0)), 0));
    const assists = numberTable(row.assists_others);
    if (!object(row.assists_others)) for (const killer of REPORT_SEATS) {
      const known = assistPairs.filter(pair => pair.killer === killer);
      const others = known.reduce((n, pair) => n + (pair.owner !== killer ? pair.count : 0), 0);
      if (others || killTotals?.[killer] === known.reduce((n, pair) => n + pair.count, 0)) assists[killer] = others;
    }
    const uncovered = object(row.uncovered_leaks);
    const inferred = row.boss_round_basis === 'inferred';
    const confirmed = row.boss_round_basis === 'confirmed' || (!inferred && (row.phase === 'boss' || row.boss_ended === true));
    result.push({
      number: index, phase: text(row.phase), leaks: numberTable(row.leaks), leaksStatus: text(row.leaks_status),
      leakMinimums: numberTable(row.leak_minimums), uncoveredLeaks: numberTable(uncovered),
      uncoveredStatus: uncovered ? text(row.uncovered_status) : '', skippedCosts,
      unassignedSelfLeaks: leakCount(row.unassigned_self_leaks),
      selfLeaks: leakCount(row.self_leaks) ?? leakCount(row.unassigned_self_leaks),
      selfLeakEnemies: Array.isArray(row.self_leak_enemies) ? row.self_leak_enemies.flatMap(value => readEnemyOutcome(value) ?? []) : null,
      assists, assistsStatus: text(row.assists_status),
      assistsPartial: (assistsStatus !== 'reported' && assistsStatus !== 'skipped') || (!object(row.assists_others) && unmatched > 0),
      assistPairs,
      assistEnemies: array(row.assist_enemies).flatMap(value => {
        const enemy = readEnemyOutcome(value), data = object(value);
        const killer = seat(data?.killer), owner = seat(data?.owner);
        if (!enemy || killer === null || owner === null || !pairs.has(`${killer}:${owner}`)) return [];
        return [{ ...enemy, killer, owner }];
      }),
      uncoveredEnemies: array(row.uncovered_enemies).flatMap(value => {
        const enemy = readEnemyOutcome(value), data = object(value);
        const owner = seat(data?.owner);
        if (!enemy || owner === null) return [];
        return [{ ...enemy, owner }];
      }),
      unattributedAssists: unmatched,
      hpCosts: Object.keys(hpCosts).length ? hpCosts : skippedCosts, allPlayersLeaked: row.all_players_leaked === true,
      bossDamage: numberTable(row.boss_damage), bossPercent: numberTable(row.boss_percent), bossUplink: numberTable(row.boss_uplink),
      bossUplinkRows: bossHits(row.boss_uplink_rows, false), bossOfficial: bossHits(row.boss_official, true),
      bossStatus: text(row.boss_status), bossRoundInferred: inferred, ...(confirmed ? confirmedBossRound : {}),
      bossEnded: row.boss_ended === true, bossHp: number(row.boss_hp), bossPlanId, bossGroups,
      waveConfirmed: array(waveReport?.confirmed_players).flatMap(value => seat(value) ?? []), rows: lines,
    });
  }
  const bannedCovenants = mapBannedBondsToCovenants(config?.banned_bonds);
  const defeatedBossRounds = [...new Set(array(root.defeated_boss_rounds)
    .flatMap(value => {
      const r = round(value);
      return r === null ? [] : [r];
    }))].sort((a, b) => a - b);
  const lineups = readSeatLineups(root.lineups);
  const deckPool = readDeckPool(root.deck_pool);
  const telemetry = readCombatTelemetry(root.telemetry);
  const declaredBossRounds = [...new Set(array(root.boss_rounds).flatMap(v => {
    const r = round(v);
    return r === null ? [] : [r];
  }))];
  const observedBossRounds = result
    .filter(r => r.phase === 'boss' || r.bossEnded || hasBossDamage(r) || Boolean(r.bossPlanId))
    .map(r => r.number);
  const defaultModeBossRounds = mode === 'mode_single_funny' ? [9]
    : mode === 'mode_training_2' ? [4]
    : mode === 'mode_multi_funny' || /^mode_single_[1-4]$/.test(mode) ? [14]
    : [14, 15];
  const bossRounds = [...new Set([
    ...(declaredBossRounds.length ? declaredBossRounds : defaultModeBossRounds),
    ...observedBossRounds,
    ...defeatedBossRounds,
  ])].sort((a, b) => a - b);
  if (!result.length && !preview.length && !mode && !bannedCovenants.length && !telemetry && !Object.keys(lineups).length && !deckPool) {
    throw new Error('战报里没有对局数据。');
  }
  const single = /^mode_single_(\d+)$/.exec(mode);
  const modeName = text(config?.mode_name);
  const stageName = text(config?.stage_name);
  const self = seat(capture?.self);
  return { match: number(capture?.match), current: round(capture?.round), self, mode,
    selfBySettlement: self !== null && capture?.self_basis === 'help',
    selfManual: false,
    difficulty: modeName || (single ? `单人规程 Lv.${single[1]}` : stageName || (Object.hasOwn(modes, mode) ? modes[mode] : '')),
    boss: text(config?.boss_id), hiddenBoss: text(config?.hidden_boss_id),
    bossRounds,
    bannedCovenants, defeatedBossRounds,
    names: Object.fromEntries(REPORT_SEATS.map(id => [id, text(players[id]).trim()])),
    hp: numberTable(root.hp), eliminated: numberTable(root.eliminated), rounds: result,
    preview: preview.sort((a, b) => a.round - b.round),
    lineups,
    deckPool,
    telemetry,
  };
}

export const ownRoundLeaks = (row: BattleRound, report: BattleReport) =>
  row.selfLeaks ?? (report.self === null ? undefined : row.leaks[report.self]);

export function ownLeakKinds(row: BattleRound, report: BattleReport): EnemyOutcome[] {
  const total = ownRoundLeaks(row, report);
  if (!total) return [];
  const self = report.self;
  const agrees = self !== null && (row.selfLeaks === null || row.leaks[self] === undefined || row.leaks[self] === row.selfLeaks);
  const fromWave = () => agrees && !row.bossGroups ? row.rows.filter(wave => wave.seat === self).flatMap(wave =>
    wave.enemies.flatMap(enemy => enemy.id && enemy.leaked ? [{ id: enemy.id, name: enemy.name,
      count: enemy.leaked, unitPower: enemy.power }] : [])) : [];
  const known = row.selfLeakEnemies?.length ? row.selfLeakEnemies : fromWave();
  return known.reduce((count, enemy) => count + enemy.count, 0) <= total ? groupEnemyOutcomes(known) : [];
}

export function confirmedCurrent(report?: BattleReport) {
  return report?.current && report.current >= (report.rounds.at(-1)?.number ?? 0) ? report.current : null;
}

export function resolvePreviewRound(report: BattleReport | undefined, selected: PreviewRoundFilter): ReportRoundFilter {
  if (selected !== 'follow') return selected;
  const current = confirmedCurrent(report);
  if (current) return current;
  const lastObserved = report?.rounds.at(-1)?.number ?? 0;
  const nextForecast = report?.preview.reduce<number | undefined>((nearest, row) =>
    row.round > lastObserved && (nearest === undefined || row.round < nearest) ? row.round : nearest, undefined);
  return (nextForecast ?? lastObserved) || 'all';
}

export function visibleSpawnRows(report: BattleReport | undefined, kind: Spawn['kind'], filterRound: string, query: string) {
  const keyword = query.trim().toLowerCase();
  let rows = report?.preview.filter(item => item.kind === kind && (!filterRound || item.round === Number(filterRound))
    && (!keyword || item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword))) ?? [];
  if (kind === 'battle') {
    // Once the seat column is hidden, identical batches from different routes are shown as a recorded total.
    const totals = new Map<string, Spawn>();
    for (const row of rows) {
      const key = `${row.round}:${row.action}:${row.id}`;
      const saved = totals.get(key);
      if (!saved) totals.set(key, { ...row });
      else if (row.count !== null) saved.count = (saved.count ?? 0) + row.count;
    }
    rows = [...totals.values()];
  }
  const group = (row: Spawn) => row.boss ? 3 : row.action === null ? 2 : row.action === -1 ? 1 : 0;
  return rows.sort((a, b) => a.round - b.round || group(a) - group(b) || (a.action ?? 0) - (b.action ?? 0));
}

export function reportProgress(report: BattleReport | undefined, live: boolean) {
  const latest = report?.rounds.at(-1);
  const number = Math.max(report?.current ?? 0, latest?.number ?? 0) || undefined;
  const label = !number ? (live ? '等待本局记录' : '等待回合记录')
    : !live ? `记录至 R${number}`
    : latest?.number === number && latest.phase === 'end' ? `已结束 · R${number}`
    : report?.current === number ? `最近确认 R${number}` : `最近记录 R${number} · 当前回合未确认`;
  return { number, label };
}

const hasValues = (values: Record<number, number>) => Object.keys(values).length > 0;
const hasServerTotals = (row: BattleRound) => hasValues(row.bossDamage) || hasValues(row.bossPercent);
const hasUplink = (row: BattleRound) => hasValues(row.bossUplink) || row.bossUplinkRows.length > 0;

export function hasBossDamage(row: BattleRound | undefined) {
  return !!row && (hasServerTotals(row) || hasUplink(row) || row.bossOfficial.length > 0);
}

function resolveBossTotals(source: BattleRound, official: BossHit[]) {
  if (source.bossOfficial === official || !official.length) return source;
  const ranked = official.filter(hit => hit.damage > 0);
  if (!ranked.length) return source;
  // 跨快照时沿用分析器的规则：正数榜单可推翻全零快照；混合快照只撤回同席位的零。
  const anyDamage = Object.values(source.bossDamage).some(value => value > 0);
  const revoked = REPORT_SEATS.filter(seat => source.bossDamage[seat] === 0 && (!anyDamage || ranked.some(hit => hit.seat === seat)));
  if (!revoked.length) return source;
  const bossDamage = { ...source.bossDamage }, bossPercent = { ...source.bossPercent };
  for (const seat of revoked) {
    delete bossDamage[seat];
    if (bossPercent[seat] === 0) delete bossPercent[seat];
  }
  return { bossDamage, bossPercent, bossStatus: hasValues(bossDamage) ? source.bossStatus : 'unknown' };
}

export function mergeBossRound(old: BattleRound, row: BattleRound): BattleRound {
  const official = !row.bossOfficial.length && old.bossOfficial.length ? old.bossOfficial : row.bossOfficial;
  const totals = resolveBossTotals(!hasServerTotals(row) && hasServerTotals(old) ? old : row, official);
  const uplink = !hasUplink(row) && hasUplink(old) ? old : row;
  const keepConfirmation = confirmedBossBasis in old && !(confirmedBossBasis in row);
  const inferred = !(confirmedBossBasis in row) && !keepConfirmation && (row.bossRoundInferred || old.bossRoundInferred);
  const ended = row.bossEnded || old.bossEnded, hp = row.bossHp ?? old.bossHp;
  if (totals === row && uplink === row && official === row.bossOfficial && !keepConfirmation && inferred === row.bossRoundInferred
      && ended === row.bossEnded && hp === row.bossHp) return row;
  return { ...row, ...(keepConfirmation ? confirmedBossRound : {}),
    bossDamage: totals.bossDamage, bossPercent: totals.bossPercent, bossStatus: totals.bossStatus,
    bossUplink: uplink.bossUplink, bossUplinkRows: uplink.bossUplinkRows, bossOfficial: official,
    bossRoundInferred: inferred, bossEnded: ended, bossHp: hp };
}

export function reportBossRounds(report: BattleReport | undefined): number[] {
  if (!report) return [14, 15];
  if (report.bossRounds.length) return report.bossRounds;
  return [14, 15];
}

export function isHiddenBossRound(report: BattleReport | undefined, roundNo: number): boolean {
  if (roundNo === 15) return true;
  const list = reportBossRounds(report);
  return list.length >= 2 && list.indexOf(roundNo) > 0;
}

export function defaultBossRound(report: BattleReport | undefined): number {
  const candidates = reportBossRounds(report);
  // Prefer the latest Boss round that actually has recorded damage
  for (let i = candidates.length - 1; i >= 0; i--) {
    const r = candidates[i];
    if (hasBossDamage(report?.rounds.find(row => row.number === r))) return r;
  }
  // Next prefer a Boss round currently fighting, ended, or matching current round
  for (let i = candidates.length - 1; i >= 0; i--) {
    const r = candidates[i];
    const row = report?.rounds.find(item => item.number === r);
    if (row?.bossEnded || row?.phase === 'boss' || report?.current === r) return r;
  }
  return candidates[0] ?? 14;
}

interface Metric { value: number; quality?: 'partial' | 'estimated' | 'minimum' }

function directLeakPower(data: BattleRound): Metric | undefined {
  if (data.selfLeaks === null || data.selfLeakEnemies === null) return;
  if (data.selfLeaks === 0) return { value: 0 };
  const typed = data.selfLeakEnemies.reduce((sum, enemy) => sum + enemy.count, 0);
  if (typed > data.selfLeaks) return;
  const priced = data.selfLeakEnemies.filter(enemy => enemy.unitPower !== null);
  if (!priced.length) return;
  return { value: priced.reduce((sum, enemy) => sum + enemy.count * enemy.unitPower!, 0),
    quality: priced.reduce((sum, enemy) => sum + enemy.count, 0) < data.selfLeaks ? 'partial' : undefined };
}

export function ownLeakPower(data: BattleRound, report: BattleReport) {
  return report.self === null ? directLeakPower(data) : roundMetrics(data, report.self, report.self)[3];
}

export function roundMetrics(data: BattleRound | undefined, id: number, self?: number | null): (Metric | undefined)[] {
  if (!data) return [undefined, undefined, undefined, undefined];
  const own = self === id ? data.selfLeaks : null;
  const leaks = own ?? data.leaks[id], skipped = data.skippedCosts[id], assists = data.assists[id], hp = data.hpCosts[id];
  const conflicting = own !== null && data.leaks[id] !== undefined && own !== data.leaks[id];
  const rows = data.bossGroups ? [] : data.rows.filter(row => row.seat === id);
  const confirmed = data.waveConfirmed.includes(id);
  const missingLeaks = leaks !== undefined && leaks > rows.reduce((sum, row) => sum + (row.leaked ?? 0), 0);
  const unpriced = missingLeaks || rows.some(row => row.unpriced > 0 || (row.leaked && row.power === null));
  const priced = rows.filter(row => row.power !== null);
  const power = priced.length ? priced.reduce((sum, row) => sum + (row.power ?? 0), 0) : confirmed || leaks === 0 ? 0 : null;
  return [
    leaks !== undefined ? { value: leaks, quality: own !== null || data.leaksStatus === 'reported' ? undefined
      : data.leakMinimums[id] !== undefined ? 'minimum' : 'partial' }
      : skipped !== undefined ? (skipped === 0 ? { value: 0 } : { value: Math.min(skipped, 10), quality: skipped >= 10 ? 'minimum' : 'estimated' }) : undefined,
    assists === undefined ? undefined : { value: assists, quality: data.assistsPartial ? 'partial' : undefined },
    hp === undefined ? undefined : { value: hp },
    (own !== null ? directLeakPower(data) : undefined) ?? (data.bossGroups || conflicting || power === null || (power === 0 && unpriced) ? undefined
      : { value: power, quality: unpriced || (power > 0 && !confirmed) ? 'partial' : undefined }),
  ];
}

export function waveOwner(player: number | null, bossGroups: boolean) {
  return player === null ? '公共编排' : bossGroups ? `战区 ${player}` : `${player} 号`;
}

export function reportLeader(report: BattleReport, round: number) {
  const data = report.rounds.find(row => row.number === round);
  const hidden = isHiddenBossRound(report, round);
  const known = (id: string) => bossEncounter(id, hidden);
  // R15 的计划有时沿用 R14 普通领袖。只认该回合有效的模板。
  const plan = known(data?.bossPlanId ?? '');
  if (plan) return plan;
  const configured = known(hidden ? report.hiddenBoss : report.boss);
  const candidatesFor = (ids: string[]) => [...new Set(ids.flatMap(id => known(id) ?? []))];
  const recorded = candidatesFor((data?.rows ?? []).filter(row => row.seat !== null)
    .flatMap(row => row.enemies.map(enemy => enemy.id)));
  const candidates = recorded.length ? recorded
    : candidatesFor(report.preview.filter(row => row.round === round && row.kind === 'plan').map(row => row.id));
  return candidates.find(item => item === configured)
    ?? (candidates.length === 1 ? candidates[0] : candidates.length === 0 ? configured ?? null : null);
}
