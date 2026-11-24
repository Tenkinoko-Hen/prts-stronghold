// 青逝痕 Tenkinoko 制作
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

export interface PieceUnit {
  instId: number;
  chessId: string;
  charId: string;
  name: string;
  tier: number;
  isGolden: boolean;
}

export interface EquipUnit {
  instId: number;
  identifier: number;
  chessId: string;
  trapId: string;
  name: string;
  tier: number;
  isGolden: boolean;
  itemType: string;
}

export interface ShopGood {
  kind: 'operator' | 'equip';
  slot: number;
  price: number;
  frozen: boolean;
  charId?: string;
  trapId?: string;
  chessId?: string;
  name: string;
  tier: number;
}

export interface SeatLineup {
  seat: number;
  round: number | null;
  shopLevel: number | null;
  skillId: string;
  strategist: string;
  pieceCount: number;
  deployedCount: number;
  deployed: PieceUnit[];
  bench: PieceUnit[];
  equips: EquipUnit[];
  shopGoods: ShopGood[];
  squad: SquadSlot[];
}

export interface TimelinePoint {
  t: number;
  dps: number;
  total: number;
}

export interface DeckPoolOperator {
  charId: string;
  name: string;
  tier: number;
  covenants: string[];
  totalCopies: number;
  takenBy: Record<number, number>;
  takenTotal: number;
  remaining: number;
  inShopSeats: number[];
}

export interface DeckPoolEquip {
  trapId: string;
  chessId: string;
  name: string;
  tier: number;
  itemType: string;
  giveBondId: string;
  takenBy: Record<number, number>;
  takenTotal: number;
  inShopSeats: number[];
}

export interface DeckPoolTierSummary {
  tier: number;
  operatorKinds: number;
  totalCopies: number;
  takenCopies: number;
  remainingCopies: number;
  equipKinds: number;
}

export interface DeckPoolSnapshot {
  modeId: string;
  isSingle: boolean;
  shopSlots: Record<number, { char: number; item: number; upgradePrice: number }>;
  tierSummary: DeckPoolTierSummary[];
  operators: DeckPoolOperator[];
  equips: DeckPoolEquip[];
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
  timeline: TimelinePoint[];
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
  const timeline: TimelinePoint[] = asArr(obj.timeline).flatMap(item => {
    const pt = asObj(item);
    const t = asNum(pt?.t);
    const dps = asNum(pt?.dps);
    const total = asNum(pt?.total);
    if (t === null || dps === null || total === null) return [];
    return [{ t, dps, total }];
  });
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
    timeline,
    rounds,
  };
}

function readPieces(raw: unknown): PieceUnit[] {
  return asArr(raw).flatMap(item => {
    const row = asObj(item);
    const charId = asStr(row?.char_id);
    if (!row || !charId) return [];
    return [{
      instId: Math.trunc(asNum(row.inst_id) ?? 0),
      chessId: asStr(row.chess_id),
      charId,
      name: asStr(row.name) || charId,
      tier: Math.trunc(asNum(row.tier) ?? 0),
      isGolden: row.is_golden === true,
    }];
  });
}

function readEquips(raw: unknown): EquipUnit[] {
  return asArr(raw).flatMap(item => {
    const row = asObj(item);
    const name = asStr(row?.name);
    if (!row || !name) return [];
    return [{
      instId: Math.trunc(asNum(row.inst_id) ?? 0),
      identifier: Math.trunc(asNum(row.identifier) ?? 0),
      chessId: asStr(row.chess_id),
      trapId: asStr(row.trap_id),
      name,
      tier: Math.trunc(asNum(row.tier) ?? 0),
      isGolden: row.is_golden === true,
      itemType: asStr(row.item_type) || 'EQUIP',
    }];
  });
}

function readShopGoods(raw: unknown): ShopGood[] {
  return asArr(raw).flatMap(item => {
    const row = asObj(item);
    const name = asStr(row?.name);
    if (!row || !name) return [];
    const kind = row.kind === 'equip' ? 'equip' : 'operator';
    return [{
      kind,
      slot: Math.trunc(asNum(row.slot) ?? 0),
      price: Math.trunc(asNum(row.price) ?? 0),
      frozen: row.frozen === true,
      ...(asStr(row.char_id) ? { charId: asStr(row.char_id) } : {}),
      ...(asStr(row.trap_id) ? { trapId: asStr(row.trap_id) } : {}),
      ...(asStr(row.chess_id) ? { chessId: asStr(row.chess_id) } : {}),
      name,
      tier: Math.trunc(asNum(row.tier) ?? 0),
    }];
  });
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
      deployed: readPieces(entry.deployed),
      bench: readPieces(entry.bench),
      equips: readEquips(entry.equips),
      shopGoods: readShopGoods(entry.shop_goods),
      squad,
    };
  }
  return result;
}

function readSeatCountMap(raw: unknown): Record<number, number> {
  const obj = asObj(raw);
  if (!obj) return {};
  const out: Record<number, number> = {};
  for (const s of [1, 2, 3, 4]) {
    const n = asNum(obj[s] ?? obj[String(s)]);
    if (n !== null && n > 0) out[s] = Math.trunc(n);
  }
  return out;
}

export function readDeckPool(raw: unknown): DeckPoolSnapshot | null {
  const obj = asObj(raw);
  if (!obj) return null;
  const operators: DeckPoolOperator[] = asArr(obj.operators).flatMap(item => {
    const row = asObj(item);
    const charId = asStr(row?.char_id);
    if (!row || !charId) return [];
    const tier = Math.trunc(asNum(row.tier) ?? 0);
    if (tier < 1 || tier > 6) return [];
    const totalCopies = Math.trunc(asNum(row.total_copies) ?? 0);
    const takenTotal = Math.trunc(asNum(row.taken_total) ?? 0);
    const remaining = Math.trunc(asNum(row.remaining) ?? Math.max(0, totalCopies - takenTotal));
    return [{
      charId,
      name: asStr(row.name) || charId,
      tier,
      covenants: mapBannedBondsToCovenants(row.bonds),
      totalCopies,
      takenBy: readSeatCountMap(row.taken_by),
      takenTotal,
      remaining,
      inShopSeats: asArr(row.in_shop_seats).flatMap(v => {
        const s = asSeat(v);
        return s === null ? [] : [s];
      }),
    }];
  });
  const equips: DeckPoolEquip[] = asArr(obj.equips).flatMap(item => {
    const row = asObj(item);
    const trapId = asStr(row?.trap_id);
    if (!row || !trapId) return [];
    const tier = Math.trunc(asNum(row.tier) ?? 0);
    if (tier < 1 || tier > 6) return [];
    return [{
      trapId,
      chessId: asStr(row.chess_id),
      name: asStr(row.name) || trapId,
      tier,
      itemType: asStr(row.item_type) || 'EQUIP',
      giveBondId: asStr(row.give_bond_id),
      takenBy: readSeatCountMap(row.taken_by),
      takenTotal: Math.trunc(asNum(row.taken_total) ?? 0),
      inShopSeats: asArr(row.in_shop_seats).flatMap(v => {
        const s = asSeat(v);
        return s === null ? [] : [s];
      }),
    }];
  });
  if (!operators.length && !equips.length) return null;
  const slotsObj = asObj(obj.shop_slots);
  const shopSlots: DeckPoolSnapshot['shopSlots'] = {};
  for (let lv = 1; lv <= 6; lv++) {
    const s = asObj(slotsObj?.[lv] ?? slotsObj?.[String(lv)]);
    shopSlots[lv] = {
      char: Math.trunc(asNum(s?.char) ?? (lv === 1 ? 3 : lv <= 3 ? 4 : 5)),
      item: Math.trunc(asNum(s?.item) ?? 1),
      upgradePrice: Math.trunc(asNum(s?.upgrade_price) ?? 0),
    };
  }
  const tierSummary: DeckPoolTierSummary[] = asArr(obj.tier_summary).flatMap(item => {
    const row = asObj(item);
    const tier = Math.trunc(asNum(row?.tier) ?? 0);
    if (!row || tier < 1 || tier > 6) return [];
    return [{
      tier,
      operatorKinds: Math.trunc(asNum(row.operator_kinds) ?? 0),
      totalCopies: Math.trunc(asNum(row.total_copies) ?? 0),
      takenCopies: Math.trunc(asNum(row.taken_copies) ?? 0),
      remainingCopies: Math.trunc(asNum(row.remaining_copies) ?? 0),
      equipKinds: Math.trunc(asNum(row.equip_kinds) ?? 0),
    }];
  });
  return {
    modeId: asStr(obj.mode_id),
    isSingle: obj.is_single === true,
    shopSlots,
    tierSummary,
    operators,
    equips,
  };
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
