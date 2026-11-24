import { groupEnemyOutcomes, hasBossDamage, REPORT_SEATS, reportLeader, roundMetrics,
  type BattleReport, type BattleRound, type EnemyOutcome } from './battleReportData';
import { isSkippedAssistInferred, laneKinds, roundOutcome, sumMetrics, type LaneMetric } from './battleRoundOutcome';
import { formatTelemetryRate, formatTelemetryTotal, isSoloMode, isSoloStageMode } from './combatTelemetry';
import { REPORT_BRAND, type ReportBrand } from '../brand/productBrand';
import type { ReportRecord } from './battleReports';

const digits = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 });
const ratio = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const outcomeLabels = { clean: '全队无漏', assisting: '协防中', covered: '已兜住', partial: '部分兜住', breached: '全队均漏' };
const hasCounts = (table: Record<number, number>) => Object.keys(table).length > 0;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const exact = (value: number | undefined): LaneMetric => value === undefined ? undefined : { value };

export function isCombatRound(row: BattleRound) {
  return ['self', 'assist', 'boss', 'settle', 'end'].includes(row.phase) || row.selfLeaks !== null
    || row.allPlayersLeaked || row.bossEnded || hasBossDamage(row) || row.waveConfirmed.length > 0
    || row.assistPairs.length > 0 || row.unattributedAssists > 0 || row.uncoveredStatus === 'reported'
    || ['reported', 'skipped'].includes(row.assistsStatus)
    || [row.leaks, row.leakMinimums, row.assists, row.uncoveredLeaks, row.hpCosts].some(hasCounts)
    || row.rows.some(wave => (wave.leaked ?? 0) > 0 || wave.enemies.some(e => (e.leaked ?? 0) > 0)
      || (!row.bossGroups && wave.seat !== null && (wave.leaked === 0 || wave.enemies.some(e => e.leaked === 0))));
}

export function exportCount(metric: LaneMetric) {
  if (!metric) return '—';
  const n = digits.format(metric.value);
  return metric.quality === 'minimum' ? `≥${n}` : metric.quality === 'estimated' ? `≈${n}` : n;
}

function enemyList(kinds: EnemyOutcome[], total: number | undefined) {
  const grouped = groupEnemyOutcomes(kinds);
  const count = sum(grouped.map(enemy => enemy.count));
  if (total === undefined) return grouped;
  const known = count <= total ? count : 0;
  const result = count <= total ? grouped : [];
  if (total > known) result.push({ id: '', name: '未记录怪种', count: total - known, unitPower: null });
  return result;
}

function waveEscapes(waves: BattleRound['rows']) {
  const kinds = groupEnemyOutcomes(waves.flatMap(wave => wave.enemies.flatMap(e => e.id && e.leaked
    ? [{ id: e.id, name: e.name, count: e.leaked, unitPower: e.power }] : [])));
  const count = sum(waves.map(wave => wave.leaked ?? sum(wave.enemies.map(e => e.leaked ?? 0))));
  return { kinds, count };
}

function describeRound(row: BattleRound, report: BattleReport, live: boolean) {
  // 文档是全队口径，不随页面上临时切换的观察席位变化。
  const outcome = roundOutcome(row, report, null, live);
  const unassigned = waveEscapes(row.rows.filter(w => row.bossGroups || w.seat === null));
  const lanes = REPORT_SEATS.map(seat => {
    const [leaks, helps] = roundMetrics(row, seat, report.self);
    const wave = waveEscapes(row.bossGroups ? [] : row.rows.filter(w => w.seat === seat));
    const confirmed = !row.bossGroups && row.waveConfirmed.includes(seat);
    const minimum = Math.max(wave.count, row.leakMinimums[seat] ?? 0);
    const observedLeaks: LaneMetric = confirmed && wave.count >= minimum ? exact(wave.count)
      : minimum > 0 ? { value: minimum, quality: 'minimum' } : undefined;
    const metric = leaks ?? observedLeaks;
    const own = seat === report.self && row.selfLeakEnemies?.length ? groupEnemyOutcomes(row.selfLeakEnemies) : null;
    const conflict = seat === report.self && row.selfLeaks !== null && row.leaks[seat] !== undefined && row.selfLeaks !== row.leaks[seat];
    // 两份明细可能指向同一批逃脱；只用同席、同总数且包含本路证据的完整波次替代，不相加。
    const completeWave = own && confirmed && !conflict && !metric?.quality && wave.count === metric?.value
      && sum(wave.kinds.map(e => e.count)) === wave.count
      && own.every(e => wave.kinds.some(w => w.id === e.id && w.count >= e.count));
    const assisted = groupEnemyOutcomes(row.assistEnemies.filter(e => e.owner === seat));
    const baseKinds = own && !completeWave ? own : conflict ? [] : wave.kinds;
    const kinds = baseKinds.length ? baseKinds : (!conflict && assisted.length ? assisted : []);
    const pairs = sum(row.assistPairs.filter(p => p.killer === seat && p.owner !== seat).map(p => p.count));
    return { seat, leaks: metric, kinds: enemyList(kinds, metric?.quality === 'estimated' ? undefined : metric?.value), waveCount: wave.count,
      helps: helps ?? (pairs ? { value: pairs, quality: 'minimum' as const }
        : (outcome.tone === 'clean' && !unassigned.count) || row.assistsStatus === 'skipped' ? exact(0) : undefined) };
  });
  let gross = sumMetrics(lanes.map(lane => lane.leaks));
  if (unassigned.count) {
    const waveMinimum = unassigned.count + sum(lanes.map(lane => lane.waveCount));
    if (!gross || waveMinimum > gross.value) gross = { value: waveMinimum, quality: 'minimum' };
  }
  if (report.self === null && row.selfLeaks !== null && (!gross || row.selfLeaks > gross.value))
    gross = { value: row.selfLeaks, quality: 'minimum' };
  const skippedInferred = isSkippedAssistInferred(row, report);
  if (outcome.tone === 'breached' && !skippedInferred && (!gross || gross.quality)) {
    const minimum = sum(lanes.map(lane => Math.max(1, row.leakMinimums[lane.seat] ?? 0,
      lane.leaks && lane.leaks.quality !== 'estimated' ? lane.leaks.value : 0)));
    gross = { value: Math.max(minimum, gross?.quality === 'minimum' ? gross.value : 0), quality: 'minimum' };
  }
  const disputedClean = outcome.tone === 'clean' && (gross?.value ?? 0) > 0;
  const tone = disputedClean ? 'unknown' : outcome.tone;
  const remaining = sum(Object.values(row.uncoveredLeaks));
  const net: LaneMetric = row.uncoveredStatus === 'reported' ? exact(remaining) : tone === 'clean' ? exact(0)
    : skippedInferred ? { value: row.selfLeaks!, quality: 'minimum' }
    : row.assistsStatus === 'skipped' || tone === 'breached' ? gross?.quality === 'partial' ? { ...gross, quality: 'minimum' } : gross
    : remaining > 0 ? { value: remaining, quality: 'minimum' } : undefined;
  const links = row.assistPairs.map(pair => {
    const kinds = enemyList(row.assistEnemies.filter(e => e.killer === pair.killer && e.owner === pair.owner), pair.count);
    return `${pair.killer}号 → ${pair.owner}号 ${pair.killer === pair.owner ? '自补' : '兜底'} ${pair.count} 只（${kinds.map(e => `${e.name}×${e.count}`).join('、')}）`;
  });
  let unknownOwner = row.unattributedAssists;
  for (const { seat, helps } of lanes) {
    const known = sum(row.assistPairs.filter(p => p.killer === seat && p.owner !== seat).map(p => p.count));
    const difference = (helps?.value ?? 0) - known;
    if (difference > 0) {
      links.push(`${seat}号 → 未确认席位 兜底 ${difference} 只（未记录怪种×${difference}）`);
      unknownOwner -= difference;
    }
  }
  if (unknownOwner > 0) links.push(`未确认漏怪席位的协防击杀：${unknownOwner} 只`);
  const enemies = [{ label: '漏怪', kinds: groupEnemyOutcomes(lanes.flatMap(lane => lane.kinds)) },
    { label: '协防', kinds: groupEnemyOutcomes(row.assistPairs.flatMap(pair =>
      enemyList(row.assistEnemies.filter(e => e.killer === pair.killer && e.owner === pair.owner), pair.count))) }];
  if (unassigned.count) enemies.push({ label: '波次漏怪（席位未确认）', kinds: enemyList(unassigned.kinds, unassigned.count) });
  if (report.self === null && row.selfLeaks)
    enemies.push({ label: '本机漏怪（席位未确认）', kinds: enemyList(laneKinds(row, report, null), row.selfLeaks) });
  return { number: row.number, tone,
    label: disputedClean ? '队伍战况待确认' : skippedInferred ? '未进协防 · 本路净漏'
      : outcome.tone === 'unknown' ? outcome.label : outcomeLabels[outcome.tone],
    lanes, gross, net, helps: sumMetrics(lanes.map(lane => lane.helps)), links, enemies: enemies.filter(group => group.kinds.length) };
}

function describeBoss(row: BattleRound, report: BattleReport) {
  const number = row.number;
  const leader = reportLeader(report, number);
  const seats = REPORT_SEATS.map(seat => {
    const server = row.bossDamage[seat];
    if (server !== undefined) return { seat, damage: exact(server), source: row.bossStatus === 'settlement' ? '服务器结算' : '服务器记录' };
    // 榜单、上报和服务器数据可能是同一笔伤害，不跨来源相加。
    const official = row.bossOfficial.filter(hit => hit.seat === seat);
    const uplinkHits = row.bossUplinkRows.filter(hit => hit.seat === seat);
    const local = row.bossUplink[seat] ?? (uplinkHits.length ? sum(uplinkHits.map(hit => hit.damage)) : undefined);
    const value = official.length ? sum(official.map(hit => hit.damage)) : local;
    return { seat, damage: value === undefined ? undefined : { value, quality: 'partial' as const },
      source: official.length ? '榜单明细' : local !== undefined ? '本端上报' : row.bossPercent[seat] !== undefined ? '仅血量比例' : '未记录' };
  });
  const total = sumMetrics(seats.map(s => s.damage));
  const rawHits = row.bossOfficial.length ? row.bossOfficial : row.bossUplinkRows;
  const opMap = new Map<string, { name: string; seat: number; damage: number }>();
  for (const hit of rawHits) {
    if (hit.damage <= 0) continue;
    const key = `${hit.seat}:${hit.charId || hit.identifier}`;
    const name = hit.operatorName || `干员 #${hit.identifier}`;
    const prev = opMap.get(key);
    if (!prev) opMap.set(key, { name, seat: hit.seat, damage: hit.damage });
    else prev.damage += hit.damage;
  }
  const opList = [...opMap.values()].sort((a, b) => b.damage - a.damage);
  const opTotal = sum(opList.map(o => o.damage));
  const operators = opList.slice(0, 8).map(op => {
    const share = opTotal > 0 ? (op.damage / opTotal) * 100 : 0;
    return {
      name: op.name,
      seat: op.seat,
      damage: op.damage,
      damageText: formatTelemetryTotal(op.damage),
      share,
      shareText: `${ratio.format(share)}%`,
    };
  });
  return { number, name: leader?.name ?? '未识别首领', inferred: row.bossRoundInferred, total,
    bossHp: row.bossHp ?? null,
    defeated: report.defeatedBossRounds.includes(number),
    operators,
    seats: seats.map(s => {
      // 采集字段 bossPercent 的分母是 Boss 血量，不是四人总伤。
      const share = total && !total.quality && s.damage ? (total.value ? s.damage.value / total.value * 100 : 0) : null;
      const percent = row.bossPercent[s.seat];
      return { ...s, share, shareText: share === null ? '—' : `${ratio.format(share)}%`,
        hpShare: percent === undefined ? null : `${digits.format(percent)}%` };
    }) };
}

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (d: Date) => [String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate()), pad(d.getHours()), pad(d.getMinutes())];
const localTime = (d: Date) => { const [y, m, day, h, min] = parts(d); return `${y}-${m}-${day} ${h}:${min}`; };

export function summarizeBattleReport(
  entry: Pick<ReportRecord, 'label' | 'seenAt'>,
  report: BattleReport,
  live: boolean,
  at: Date,
  brand: ReportBrand = REPORT_BRAND,
) {
  const combat = report.rounds.filter(isCombatRound).sort((a, b) => a.number - b.number);
  const rounds = combat.map(row => describeRound(row, report, live));
  const bosses = combat.filter(row => row.phase === 'boss' || row.bossEnded || hasBossDamage(row) || report.bossRounds.includes(row.number))
    .map(row => describeBoss(row, report));
  const players = REPORT_SEATS.map((seat, i) => {
    const elimRound = report.eliminated[seat];
    const activeLanes = rounds
      .filter(row => elimRound === undefined || row.number <= elimRound)
      .map(row => row.lanes[i]);
    const confirmed = activeLanes.filter(lane => lane.leaks && !lane.leaks.quality);
    const clean = confirmed.filter(lane => lane.leaks!.value === 0).length;
    const lineup = report.lineups[seat];
    const deployed = [...(lineup?.deployed ?? [])]
      .sort((a, b) => Number(b.isGolden) - Number(a.isGolden) || b.tier - a.tier)
      .slice(0, 6)
      .map(u => ({ name: u.name, isGolden: u.isGolden }));
    return { seat, name: report.names[seat] || '未记录昵称', self: seat === report.self,
      eliminatedRound: elimRound,
      hp: report.hp[seat] ?? null,
      shopLevel: lineup?.shopLevel ?? null,
      strategist: lineup?.strategist || '',
      deployed,
      leaks: sumMetrics(activeLanes.map(lane => lane.leaks)),
      helps: sumMetrics(activeLanes.map(lane => lane.helps)), boss: sumMetrics(bosses.map(boss => boss.seats[i].damage)),
      cleanPct: confirmed.length ? (clean / confirmed.length) * 100 : null,
      cleanRatio: confirmed.length ? `${ratio.format(clean / confirmed.length * 100)}%（${clean}/${confirmed.length}）` : '—' };
  });
  const most = Math.max(...players.map(p => p.helps?.value ?? 0));
  const allHelpsKnown = players.every(p => p.helps && !p.helps.quality);
  const safeName = entry.label.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').trim().slice(0, 80).replace(/[. ]+$/, '') || '本地对局';
  const [year, month, day, hour, minute] = parts(at);
  const gross = sumMetrics(rounds.map(r => r.gross));
  const helps = sumMetrics(rounds.map(r => r.helps));
  const net = sumMetrics(rounds.map(r => r.net));
  const hasPartial = [gross, helps, net, ...players.flatMap(p => [p.leaks, p.helps, p.boss]),
    ...bosses.flatMap(b => [b.total, ...b.seats.map(s => s.damage)])].some(m => Boolean(m?.quality));
  const midstream = report.telemetry?.coverage === 'midstream';
  const telemetryOperators = (report.telemetry?.operators ?? []).slice(0, 16).map(op => ({
    name: op.name,
    seat: op.seat,
    totalText: formatTelemetryTotal(op.totalDamage, midstream),
    shareText: `${ratio.format(op.shareRatio * 100)}%`,
    sharePercent: Math.min(100, op.shareRatio * 100),
    activeDpsText: formatTelemetryRate(op.activeDps),
    channelsText: [
      op.physical > 0 ? `物 ${formatTelemetryTotal(op.physical)}` : '',
      op.arts > 0 ? `法 ${formatTelemetryTotal(op.arts)}` : '',
      op.elemental > 0 ? `元 ${formatTelemetryTotal(op.elemental)}` : '',
      op.trueDamage > 0 ? `真 ${formatTelemetryTotal(op.trueDamage)}` : '',
      op.healing > 0 ? `疗 ${formatTelemetryTotal(op.healing)}` : '',
    ].filter(Boolean).join(' · ') || '—',
  }));
  const soloStage = isSoloStageMode(report.mode);
  const solo = isSoloMode(report.mode);
  const title = soloStage
    ? `${report.difficulty || '单人作战关卡'} · 算力遥测战报`
    : '卫戍协议 · 局内详情战报';
  return { title, name: entry.label, difficulty: report.difficulty || '', start: localTime(new Date(entry.seenAt)), exported: localTime(at),
    filename: `${brand.exportPrefix}_${safeName}_${year}${month}${day}-${hour}${minute}`, rounds, bosses, hasPartial,
    solo, soloStage, telemetryOperators,
    players: players.map(p => ({ ...p, top: most > 0 && p.helps?.value === most ? (allHelpsKnown ? '协防最多' : '已记录协防最多') : '' })),
    clean: rounds.filter(row => row.tone === 'clean').length, gross, helps, net };
}

export type ReportSummary = ReturnType<typeof summarizeBattleReport>;
