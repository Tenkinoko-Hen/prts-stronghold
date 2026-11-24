import { confirmedCurrent, groupEnemyOutcomes, ownLeakKinds, REPORT_SEATS, roundMetrics,
  type BattleReport, type BattleRound, type EnemyOutcome } from './battleReportData';

export type LaneMetric = ReturnType<typeof roundMetrics>[number];
export type OutcomeTone = 'clean' | 'assisting' | 'covered' | 'partial' | 'breached' | 'unknown';
type Outcome = { tone: OutcomeTone; label: string; note: string };

export function laneLeaks(row: BattleRound, report: BattleReport, seat: number | null): LaneMetric {
  if (seat !== null) return roundMetrics(row, seat, report.self)[0];
  return row.selfLeaks === null ? undefined : { value: row.selfLeaks };
}

export function laneKinds(row: BattleRound, report: BattleReport, seat: number | null) {
  const base = seat === report.self
    ? ownLeakKinds(row, report)
    : ownLeakKinds({ ...row, selfLeaks: null, selfLeakEnemies: null }, { ...report, self: seat });
  if (base.length > 0 || seat === null) return base;
  const conflict = seat === report.self && row.selfLeaks !== null && row.leaks[seat] !== undefined && row.selfLeaks !== row.leaks[seat];
  if (conflict) return [];
  // 无论该席位漏怪被队友兜住（assistEnemies）还是未兜住（uncoveredEnemies），均回填已识别怪种。
  const fromOutcome = groupEnemyOutcomes([
    ...row.assistEnemies.filter(e => e.owner === seat),
    ...row.uncoveredEnemies.filter(e => e.owner === seat),
  ]);
  if (!fromOutcome.length) return [];
  const metric = laneLeaks(row, report, seat);
  const count = fromOutcome.reduce((sum, e) => sum + e.count, 0);
  return metric === undefined || metric.quality === 'estimated' || count <= metric.value ? fromOutcome : [];
}

export function roundTeamKinds(row: BattleRound, report: BattleReport, excludeSeat: number | null = null): EnemyOutcome[] {
  const seatKinds = REPORT_SEATS.filter(id => id !== excludeSeat).flatMap(id => laneKinds(row, report, id));
  const unassignedWave = row.rows
    .filter(w => row.bossGroups || w.seat === null)
    .flatMap(w => w.enemies.flatMap(e => e.id && e.leaked ? [{ id: e.id, name: e.name, count: e.leaked, unitPower: e.power }] : []));
  return groupEnemyOutcomes([...seatKinds, ...unassignedWave]);
}

export function roundDisplayEnemies(row: BattleRound, report: BattleReport, seat: number | null): {
  enemies: EnemyOutcome[];
  metric: LaneMetric;
} {
  const ownMetric = laneLeaks(row, report, seat);
  if (ownMetric?.value) {
    return { enemies: laneKinds(row, report, seat), metric: ownMetric };
  }
  const teamKinds = roundTeamKinds(row, report, null);
  const seatMetrics = REPORT_SEATS.map(id => roundMetrics(row, id, report.self)[0]);
  const teamLeaks = sumMetrics(seatMetrics);
  const assistTotal = row.assistPairs.reduce((s, p) => s + p.count, row.unattributedAssists);
  const uncoveredTotal = Object.values(row.uncoveredLeaks).reduce((a, b) => a + b, 0);
  const knownCount = teamKinds.reduce((s, e) => s + e.count, 0);
  const fallbackCount = Math.max(teamLeaks?.value ?? 0, assistTotal + uncoveredTotal, knownCount);
  if (fallbackCount > 0) {
    const metric: LaneMetric = teamLeaks && teamLeaks.value >= knownCount
      ? teamLeaks
      : { value: fallbackCount, quality: row.leaksStatus === 'reported' ? undefined : 'minimum' };
    return { enemies: teamKinds, metric };
  }
  return { enemies: [], metric: ownMetric };
}

export function metricText(metric: LaneMetric) {
  if (!metric) return '—';
  return metric.quality === 'minimum' ? `≥${metric.value}` : metric.quality === 'estimated' ? `≈${metric.value}`
    : String(metric.value);
}

export function sumMetrics(values: LaneMetric[]): LaneMetric {
  const known = values.filter(value => value !== undefined);
  if (!known.length) return undefined;
  return { value: known.reduce((sum, metric) => sum + metric.value, 0),
    quality: known.some(metric => metric.quality === 'estimated') ? 'estimated'
      : known.some(metric => metric.quality === 'minimum') ? 'minimum'
      : known.some(metric => metric.quality) || known.length < values.length ? 'partial' : undefined };
}

export function isSkippedAssistInferred(row: BattleRound, report: BattleReport) {
  return report.current === null && (row.selfLeaks ?? 0) > 0
    && (!row.assistsStatus || row.assistsStatus === 'unknown')
    && (!row.uncoveredStatus || row.uncoveredStatus === 'unknown')
    && row.assistPairs.length === 0 && row.unattributedAssists === 0
    && report.rounds.some(other => other.number > row.number)
    && report.rounds.some(other => other.assistsStatus === 'reported');
}

export function roundOutcome(row: BattleRound, report: BattleReport, seat: number | null, live: boolean): Outcome {
  const complete = row.leaksStatus === 'reported' && REPORT_SEATS.every(id => row.leaks[id] !== undefined)
    && !(row.selfLeaks !== null && (report.self === null ? row.selfLeaks > Math.max(...Object.values(row.leaks))
      : row.leaks[report.self] !== row.selfLeaks));
  const initial = Object.values(row.leaks).reduce((a, b) => a + b, 0);
  const remaining = Object.values(row.uncoveredLeaks).reduce((a, b) => a + b, 0);
  const covered = row.assistPairs.reduce((sum, pair) => sum + pair.count, row.unattributedAssists);
  const exactRemaining = row.uncoveredStatus === 'reported';
  const count = (n: number) => `${exactRemaining ? '' : '≥'}${n} 只`;
  if (row.allPlayersLeaked || (row.assistsStatus === 'skipped' && complete && REPORT_SEATS.every(id => row.leaks[id] > 0))) {
    const minimum = REPORT_SEATS.reduce((sum, id) => sum + Math.max(1, row.leaks[id] ?? 0,
      row.leakMinimums[id] ?? 0, id === report.self ? row.selfLeaks ?? 0 : 0), 0);
    return { tone: 'breached', label: '全队均漏', note: `全员失守 · 共漏 ${complete ? initial : `≥${minimum}`} 只 · 无人可协防` };
  }
  if (complete && initial === 0 && !covered && !remaining && !Object.values(row.hpCosts).some(n => n > 0))
    return { tone: 'clean', label: '全队无漏', note: '全员守住 · 无需协防' };
  const hasLeaks = initial > 0 || (row.selfLeaks ?? 0) > 0 || covered > 0 || remaining > 0;
  const own = laneLeaks(row, report, seat);
  const saved = row.assistPairs.reduce((n, pair) => n + (pair.owner === seat ? pair.count : 0), 0);
  const left = seat === null ? undefined : row.uncoveredLeaks[seat] ?? (exactRemaining ? 0 : undefined);
  if (left && (saved > 0 || (own && !own.quality && exactRemaining && left < own.value)))
    return { tone: 'partial', label: `本路未兜住 ${count(left)}`, note: '本路部分兜住' };
  if (left && own && !own.quality && exactRemaining && left === own.value && !saved)
    return { tone: 'breached', label: '本路无人兜底', note: `本路未兜住 ${count(left)}` };
  if (live && confirmedCurrent(report) === row.number && row.phase === 'assist' && hasLeaks && !remaining
      && !['reported', 'observed'].includes(row.uncoveredStatus) && !['reported', 'skipped'].includes(row.assistsStatus))
    return { tone: 'assisting', label: '协防中', note: '协防进行中 · 待结算' };
  if (own && own.value > 0 && ((exactRemaining && left === 0) || (!own.quality && saved === own.value && !left)))
    return { tone: 'covered', label: '本路已兜住', note: '本路漏怪已全额兜住' };
  if (remaining > 0 && (covered > 0 || (complete && exactRemaining && remaining < initial)))
    return { tone: 'partial', label: '队伍部分兜住', note: `全队未兜住 ${count(remaining)}` };
  if (hasLeaks && exactRemaining && !remaining)
    return { tone: 'covered', label: '全队已兜住', note: '全队漏怪已全额兜住' };
  if (remaining) return { tone: 'unknown', label: `未兜住 ${count(remaining)}`, note: '已记录队伍漏怪，兜底情况未确认' };
  if (isSkippedAssistInferred(row, report)) {
    return { tone: 'breached', label: '未进协防 · 本路净漏',
      note: '本路漏怪且本回合未触发协防结算（全队均漏时会跳过协防；安装 Npcap 获取下行场景后可确认全队扣血）' };
  }
  return { tone: 'unknown', label: row.assistsStatus === 'skipped' ? '未进入协防'
    : row.phase === 'assist' ? '结算未确认' : hasLeaks ? '兜底未确认' : '战况未确认',
  note: covered ? `已记录 ${covered} 只协防击杀，完整结果未确认` : '暂无完整队伍结算' };
}
