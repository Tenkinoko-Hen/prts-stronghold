import { mapBannedBondsToCovenants } from './covenantBonds';

export type TelemetryCaliber = 'active' | 'pulse' | 'span';
export type TelemetryMetricMode = 'damage' | 'healing';
export type ArenaScope = 'solo_stage' | 'solo_stronghold' | 'coop_defense' | 'coop_assist' | 'coop_boss';

export interface SummonTelemetry {
  unitId: string;
  name: string;
  totalDamage: number;
  physical: number;
  arts: number;
  trueDamage: number;
  elemental: number;
  healing: number;
  onField: boolean;
}

export interface OperatorTelemetry {
  charId: string;
  name: string;
  seat: number | null;
  onField: boolean;
  totalDamage: number;
  summonDamage: number;
  physical: number;
  arts: number;
  trueDamage: number;
  elemental: number;
  healing: number;
  activeDps: number | null;
  pulseDps: number | null;
  spanDps: number | null;
  activeHps: number | null;
  pulseHps: number | null;
  spanHps: number | null;
  activeSeconds: number | null;
  presenceSeconds: number | null;
  shieldGuarded: number | null;
  overkillTrimmed: number | null;
  skillDamage: number | null;
  mitigationRatio: number | null;
  hits: number | null;
  shareRatio: number;
  children: SummonTelemetry[];
}

export interface StageDeviceTelemetry {
  unitId: string;
  name: string;
  totalDamage: number;
  physical: number;
  arts: number;
  trueDamage: number;
  elemental: number;
  healing: number;
}

export interface EnemyPoolTelemetry {
  activeCount: number;
  defeatedCount: number;
  respawnResets: number;
  liveHp: number;
  liveMaxHp: number;
  boss: {
    enemyId: string;
    name: string;
    hp: number;
    maxHp: number;
  } | null;
}

export interface SquadSlot {
  chessId: string;
  charId: string;
  name: string;
  covenants: string[];
  isBanned: boolean;
}

export interface SeatLineup {
  seat: number;
  round: number | null;
  shopLevel: number | null;
  skillId: string;
  strategist: string;
  pieceCount: number;
  deployedCount: number;
  squad: SquadSlot[];
}

export interface CombatTelemetrySnapshot {
  scope: ArenaScope;
  source: string;
  coverage: 'full' | 'midstream' | 'protocol';
  inspectorStatus: string;
  retainedRound: number | null;
  stageId: string;
  stageName: string;
  logicSeconds: number | null;
  teamTotalDamage: number;
  teamTotalHealing: number | null;
  operators: OperatorTelemetry[];
  stageDevices: StageDeviceTelemetry[];
  enemyPool: EnemyPoolTelemetry | null;
  rounds: Record<number, CombatTelemetrySnapshot>;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 160) : '');
const asNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const asSeat = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 4 ? v : null;

const VALID_SCOPES = new Set<ArenaScope>([
  'solo_stage',
  'solo_stronghold',
  'coop_defense',
  'coop_assist',
  'coop_boss',
]);

export function isSoloStageMode(mode?: string): boolean {
  return mode === 'mode_solo_stage';
}

export function isSoloMode(mode?: string): boolean {
  return Boolean(mode && (mode === 'mode_solo_stage' || mode.startsWith('mode_single_')));
}

function readSummon(raw: unknown): SummonTelemetry | null {
  const row = asObj(raw);
  if (!row) return null;
  const unitId = asStr(row.unit_id);
  if (!unitId) return null;
  return {
    unitId,
    name: asStr(row.name) || unitId,
    totalDamage: asNum(row.total_damage) ?? 0,
    physical: asNum(row.physical) ?? 0,
    arts: asNum(row.arts) ?? 0,
    trueDamage: asNum(row.true) ?? 0,
    elemental: asNum(row.elemental) ?? 0,
    healing: asNum(row.healing) ?? 0,
    onField: row.on_field === true,
  };
}

function readOperator(raw: unknown): OperatorTelemetry | null {
  const row = asObj(raw);
  if (!row) return null;
  const charId = asStr(row.char_id);
  if (!charId) return null;
  return {
    charId,
    name: asStr(row.name) || charId,
    seat: asSeat(row.seat),
    onField: row.on_field === true,
    totalDamage: asNum(row.total_damage) ?? 0,
    summonDamage: asNum(row.summon_damage) ?? 0,
    physical: asNum(row.physical) ?? 0,
    arts: asNum(row.arts) ?? 0,
    trueDamage: asNum(row.true) ?? 0,
    elemental: asNum(row.elemental) ?? 0,
    healing: asNum(row.healing) ?? 0,
    activeDps: asNum(row.active_dps),
    pulseDps: asNum(row.pulse_dps),
    spanDps: asNum(row.span_dps),
    activeHps: asNum(row.active_hps),
    pulseHps: asNum(row.pulse_hps),
    spanHps: asNum(row.span_hps),
    activeSeconds: asNum(row.active_seconds),
    presenceSeconds: asNum(row.presence_seconds),
    shieldGuarded: asNum(row.shield_guarded),
    overkillTrimmed: asNum(row.overkill_trimmed),
    skillDamage: asNum(row.skill_damage),
    mitigationRatio: asNum(row.mitigation_ratio),
    hits: asNum(row.hits),
    shareRatio: Math.min(1, Math.max(0, asNum(row.share_ratio) ?? 0)),
    children: asArr(row.children).flatMap(item => readSummon(item) ?? []),
  };
}

function readDevice(raw: unknown): StageDeviceTelemetry | null {
  const row = asObj(raw);
  if (!row) return null;
  const unitId = asStr(row.unit_id);
  if (!unitId) return null;
  return {
    unitId,
    name: asStr(row.name) || unitId,
    totalDamage: asNum(row.total_damage) ?? 0,
    physical: asNum(row.physical) ?? 0,
    arts: asNum(row.arts) ?? 0,
    trueDamage: asNum(row.true) ?? 0,
    elemental: asNum(row.elemental) ?? 0,
    healing: asNum(row.healing) ?? 0,
  };
}

function readEnemyPool(raw: unknown): EnemyPoolTelemetry | null {
  const pool = asObj(raw);
  if (!pool) return null;
  const bossObj = asObj(pool.boss);
  return {
    activeCount: Math.trunc(asNum(pool.active_count) ?? 0),
    defeatedCount: Math.trunc(asNum(pool.defeated_count) ?? 0),
    respawnResets: Math.trunc(asNum(pool.respawn_resets) ?? 0),
    liveHp: asNum(pool.live_hp) ?? 0,
    liveMaxHp: asNum(pool.live_max_hp) ?? 0,
    boss: bossObj
      ? {
          enemyId: asStr(bossObj.enemy_id),
          name: asStr(bossObj.name) || asStr(bossObj.enemy_id) || '首领单位',
          hp: asNum(bossObj.hp) ?? 0,
          maxHp: asNum(bossObj.max_hp) ?? 0,
        }
      : null,
  };
}

export function readCombatTelemetry(raw: unknown, allowNested = true): CombatTelemetrySnapshot | null {
  const obj = asObj(raw);
  if (!obj) return null;
  const rawScope = asStr(obj.scope) as ArenaScope;
  const scope: ArenaScope = VALID_SCOPES.has(rawScope) ? rawScope : 'coop_defense';
  const rawCov = asStr(obj.coverage);
  const coverage = rawCov === 'midstream' ? 'midstream' : rawCov === 'protocol' ? 'protocol' : 'full';
  const operators = asArr(obj.operators).flatMap(item => readOperator(item) ?? []);
  const stageDevices = asArr(obj.stage_devices).flatMap(item => readDevice(item) ?? []);
  const enemyPool = readEnemyPool(obj.enemy_pool);
  const roundsObj = allowNested ? asObj(obj.rounds) : null;
  const rounds: Record<number, CombatTelemetrySnapshot> = {};
  if (roundsObj) {
    for (const [k, v] of Object.entries(roundsObj)) {
      const rNo = Number(k);
      if (Number.isInteger(rNo) && rNo >= 1 && rNo <= 15) {
        const parsed = readCombatTelemetry(v, false);
        if (parsed) rounds[rNo] = parsed;
      }
    }
  }
  if (!operators.length && !stageDevices.length && !enemyPool && !Object.keys(rounds).length) {
    return null;
  }
  const retained = asNum(obj.retained_round);
  return {
    scope,
    source: asStr(obj.source) || 'memory_readonly',
    coverage,
    inspectorStatus: asStr(obj.inspector_status) || 'standby',
    retainedRound: retained && retained >= 1 && retained <= 15 ? Math.trunc(retained) : null,
    stageId: asStr(obj.stage_id),
    stageName: asStr(obj.stage_name),
    logicSeconds: asNum(obj.logic_seconds),
    teamTotalDamage: asNum(obj.team_total_damage) ?? operators.reduce((s, o) => s + o.totalDamage, 0),
    teamTotalHealing: asNum(obj.team_total_healing),
    operators,
    stageDevices,
    enemyPool,
    rounds,
  };
}

export function readSeatLineups(raw: unknown): Record<number, SeatLineup> {
  const root = asObj(raw);
  if (!root) return {};
  const result: Record<number, SeatLineup> = {};
  for (const seatId of [1, 2, 3, 4]) {
    const entry = asObj(root[seatId] ?? root[String(seatId)]);
    if (!entry) continue;
    const squad: SquadSlot[] = asArr(entry.squad).flatMap(item => {
      const slot = asObj(item);
      const charId = asStr(slot?.char_id);
      if (!slot || !charId) return [];
      return [{
        chessId: asStr(slot.chess_id),
        charId,
        name: asStr(slot.name) || charId,
        covenants: mapBannedBondsToCovenants(slot.bonds),
        isBanned: slot.is_banned === true,
      }];
    });
    const roundNo = asNum(entry.round);
    const shopLevel = asNum(entry.shop_level);
    result[seatId] = {
      seat: seatId,
      round: roundNo && roundNo >= 1 && roundNo <= 15 ? Math.trunc(roundNo) : null,
      shopLevel: shopLevel && shopLevel >= 1 && shopLevel <= 6 ? Math.trunc(shopLevel) : null,
      skillId: asStr(entry.skill_id),
      strategist: asStr(entry.strategist),
      pieceCount: Math.trunc(asNum(entry.piece_count) ?? 0),
      deployedCount: Math.trunc(asNum(entry.deployed_count) ?? 0),
      squad,
    };
  }
  return result;
}

export function operatorRateForCaliber(
  op: OperatorTelemetry,
  caliber: TelemetryCaliber,
  metric: TelemetryMetricMode,
): number | null {
  if (metric === 'healing') {
    return caliber === 'active' ? op.activeHps : caliber === 'pulse' ? op.pulseHps : op.spanHps;
  }
  return caliber === 'active' ? op.activeDps : caliber === 'pulse' ? op.pulseDps : op.spanDps;
}

const fullFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

export function formatTelemetryTotal(value: number | null | undefined, midstream = false): string {
  if (value == null) return '—';
  const prefix = midstream && value > 0 ? '≥' : '';
  if (value >= 100_000_000) return `${prefix}${decFmt.format(value / 100_000_000)}亿`;
  if (value >= 100_000) return `${prefix}${decFmt.format(value / 10_000)}万`;
  return `${prefix}${fullFmt.format(Math.round(value))}`;
}

export function formatTelemetryRate(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value <= 0) return '0 /s';
  if (value >= 100_000) return `${decFmt.format(value / 10_000)}万/s`;
  return `${fullFmt.format(Math.round(value))} /s`;
}

export const SCOPE_LABELS: Readonly<Record<ArenaScope, string>> = {
  solo_stage: 'SOLO · 单人作战关卡',
  solo_stronghold: 'SOLO · 单人卫戍规程',
  coop_defense: 'CO-OP · 本路防守域',
  coop_assist: 'CO-OP · 协防支援域',
  coop_boss: 'BOSS · 首领攻坚域',
};

export const CALIBER_LABELS: Readonly<Record<TelemetryCaliber, { short: string; tip: string }>> = {
  active: { short: '激战秒伤', tip: '仅统计干员实际交战脉冲窗（1.5s 合并并截断当前时刻），挂机等怪不拉低秒伤' },
  pulse: { short: '5s 脉冲', tip: '近 5 个游戏逻辑秒滑动瞬时速率（自动剔除暂停与倍速干扰）' },
  span: { short: '在场均伤', tip: '累计输出 ÷ 干员已认证在场逻辑秒' },
};
