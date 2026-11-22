import { useState, type ReactNode } from 'react';
import { ScanFace } from 'lucide-react';
import { REPORT_SEATS, groupEnemyOutcomes, hasBossDamage, ownLeakKinds, ownRoundLeaks, resolvePreviewRound, roundMetrics,
  visibleSpawnRows, waveOwner, type BattleReport, type BattleRound, type EnemyOutcome, type PreviewRoundFilter,
  type ReportRoundFilter } from './battleReportData';
import { ReportRoundTimeline } from './ReportRoundTimeline';
import type { ReportRecord } from './battleReports';
import portraits from './enemyPortraits.json';

const PHASES: Record<string, string> = {
  loading: '载入', special_prep: '特殊准备', prep: '准备', self: '防守', assist: '协防', boss: 'Boss 战',
  settle: '结算', end: '结束', pause: '暂停', battle_wait: '等待战斗', boss_wait: '等待 Boss 战',
};
const numbers = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
type Metric = ReturnType<typeof roundMetrics>[number];

export const formatReportNumber = (value: number | null | undefined) => value == null ? '—' : numbers.format(value);
const batchName = (value: number | null) => value === null ? '未定位' : value < 0 ? '额外出怪' : `第 ${value + 1} 批`;
const slots = new Map(portraits.ids.map((id, index) => [id, index]));
const atlasRows = Math.ceil(portraits.ids.length / portraits.columns);

function EnemyLabel({ id, name }: { id?: string; name?: string }) {
  if (!name) return <>—</>;
  const index = id ? slots.get(id) : undefined;
  return <span className="d-report-enemy" title={id}>{index === undefined
    ? <span className="d-report-no-portrait" title="暂无头像"><ScanFace size={18} aria-hidden="true" /></span>
    : <span className="d-report-portrait" aria-hidden="true" style={{
      backgroundSize: `${portraits.columns * 100}% ${atlasRows * 100}%`,
      backgroundPosition: `${(index % portraits.columns) * 100 / (portraits.columns - 1)}% ${Math.floor(index / portraits.columns) * 100 / (atlasRows - 1)}%`,
    }} />}{name}</span>;
}

export function reportPhase(data?: BattleRound) {
  if (data?.allPlayersLeaked) return '全员漏怪';
  if (data && ['settle', 'end', 'boss'].includes(data.phase)) return PHASES[data.phase];
  if (data?.assistsStatus === 'reported') return '协防已结算';
  if (data && data.phase !== 'assist' && (data.selfLeaks !== null || data.leaksStatus === 'observed')) return '本路已结算';
  if (data && Object.hasOwn(PHASES, data.phase)) return PHASES[data.phase];
  return '—';
}

export function seatName(seat: number, report?: BattleReport) {
  const id = report?.names[seat];
  const isSelf = report?.self === seat;
  const label = `${seat}号${isSelf ? ' · 我' : ''}`;
  return <span className={`d-report-seat d-report-seat-${seat}`} title={id ? `${id} · ${label}` : label}>
    <bdi>{seat}号</bdi>{id && <span className="d-report-seat-name">· {id}</span>}{isSelf && <small>我</small>}
  </span>;
}

type AssistData = Pick<BattleRound, 'assistPairs' | 'assistsStatus' | 'unattributedAssists'>
  & Partial<Pick<BattleRound, 'allPlayersLeaked' | 'hpCosts' | 'uncoveredLeaks' | 'uncoveredPartial'>>;

function visibleAssistPairs(data: AssistData, self: number | null, team = false) {
  if (team || self === null) return data.assistPairs;
  const own = data.assistPairs.filter(pair => pair.owner === self || pair.killer === self);
  return own.length ? own : data.assistPairs;
}

function AssistSummary({ data, report, team = false, ownLeaks }: {
  data: AssistData; report?: BattleReport; team?: boolean; ownLeaks?: number;
}) {
  const self = report?.self ?? null;
  const pairs = visibleAssistPairs(data, self, team);
  const unmatched = data.unattributedAssists;
  const otherPairs = data.assistPairs.length - pairs.length;
  const ownHpLoss = self === null ? 0 : data.hpCosts?.[self] ?? 0;
  const ownCover = self !== null && data.assistPairs.some(pair => pair.owner === self);
  const observedUncovered = self === null ? 0 : data.uncoveredLeaks?.[self] ?? 0;
  const uncoveredCount = observedUncovered || (ownHpLoss > 0 && !ownCover ? ownLeaks ?? 0 : 0);
  const hasUncoveredLeak = !team && (data.allPlayersLeaked || ownHpLoss > 0 || observedUncovered > 0);
  const uncovered = hasUncoveredLeak
    ? `${ownCover ? '仍有本路漏怪未兜住' : '无人兜底'}${uncoveredCount > 0
      ? ` · 漏怪 ${data.uncoveredPartial && observedUncovered > 0 ? '≥' : ''}${formatReportNumber(uncoveredCount)} 只` : ''}`
      + `${ownHpLoss > 0 ? ` · 扣血 ${formatReportNumber(ownHpLoss)} 点` : ''}`
    : undefined;
  const player = (seat: number) => seat === self ? <strong>我</strong> : seatName(seat, report);
  const list = <ul className="d-report-assists">
    {pairs.map(({ killer, owner, count }) => <li key={`${killer}:${owner}`}>
      {player(killer)} {killer === owner ? '拦下自己的漏怪' : <>帮 {player(owner)} 兜底</>} <strong>{formatReportNumber(count)} 只</strong>
    </li>)}
    {unmatched > 0 && <li className="d-muted">{pairs.length ? '另有' : '已记录'} {formatReportNumber(unmatched)} 只协防击杀，未能确认漏怪者</li>}
  </ul>;
  const empty = uncovered || (data.assistsStatus === 'skipped' ? '本回合未进入协防'
    : data.assistsStatus === 'reported' ? '已结算，未记录到协防击杀' : '尚未记录协防');
  return <>
    {pairs.length || unmatched ? list : <span className="d-muted">{empty}</span>}
    {uncovered && (pairs.length > 0 || unmatched > 0) && <small className="d-muted d-report-assist-note">{uncovered}</small>}
    {otherPairs > 0 && <small className="d-muted d-report-assist-note">另有队友间兜底，点回合可查看</small>}
    {data.assistsStatus === 'observed' && <small className="d-muted d-report-assist-note">部分协防记录</small>}
  </>;
}

function EnemyOutcomes({ label, enemies, total }: { label: string; enemies: EnemyOutcome[]; total: number }) {
  if (total <= 0) return null;
  const known = enemies.reduce((sum, enemy) => sum + enemy.count, 0);
  const rows = known <= total ? enemies : [];
  const missing = rows === enemies ? total - known : total;
  return <div className="d-report-outcome">
    <span className="d-report-outcome-label">{label}</span>
    <ul className="d-report-outcome-chips">
      {rows.map(enemy => <li key={enemy.id}><EnemyLabel id={enemy.id} name={enemy.name} /><strong>×{formatReportNumber(enemy.count)}</strong></li>)}
      {missing > 0 && <li className="d-muted d-report-outcome-unknown">{rows.length ? '另有 ' : ''}{formatReportNumber(missing)} 只未识别怪物</li>}
    </ul>
  </div>;
}

function RoundOutcomes({ data, report, leaks }: { data: BattleRound; report: BattleReport; leaks: number | undefined }) {
  const pairs = visibleAssistPairs(data, report.self);
  const cover = pairs.reduce((sum, pair) => sum + pair.count, data.unattributedAssists);
  const enemies = groupEnemyOutcomes(data.assistEnemies.filter(enemy => pairs.some(pair => pair.killer === enemy.killer && pair.owner === enemy.owner)));
  if (!leaks && !cover) return <span className="d-muted">—</span>;
  return <div className="d-report-outcomes">
    <EnemyOutcomes label="本路漏怪" enemies={ownLeakKinds(data, report)} total={leaks ?? 0} />
    <EnemyOutcomes label="已兜住" enemies={enemies} total={cover} />
  </div>;
}

function metricText(metric: Metric) {
  if (!metric) return '—';
  const value = formatReportNumber(metric.value);
  return metric.quality === 'minimum' ? `≥${value}` : metric.quality === 'estimated' ? `≈${value}` : `${value}${metric.quality ? '*' : ''}`;
}

function sumMetrics(values: Metric[]) {
  const known = values.filter(value => value !== undefined);
  if (!known.length) return undefined;
  return {
    value: known.reduce((sum, metric) => sum + metric.value, 0),
    quality: known.some(metric => metric.quality === 'minimum') ? 'minimum'
      : known.some(metric => metric.quality) || known.length < values.length ? 'partial' : undefined,
  } satisfies Metric;
}

export function RoundMatrix({ report, active, onRound }: {
  report?: BattleReport; active?: number; onRound(round: number): void;
}) {
  if (!report?.rounds.length) return <p className="d-muted d-report-note">{report?.preview.length
    ? `已收到 ${report.preview.length} 条预告，尚无实战回合。` : '暂无回合记录。'}</p>;
  const local = report.rounds.flatMap(row => ownRoundLeaks(row, report) ?? []);
  const self = report.self;
  return <>
    <div className="d-section-head"><h2>已记录 {report.rounds.length} 个回合</h2></div>
    <div className="d-report-summary">
      <span className="d-report-identity"><strong>我</strong> · {self === null ? '席位未确认' : `${self}号`}
        {report.selfBySettlement && <small className="d-muted">结算关联</small>}
        {report.selfManual && <small className="d-muted">手动确认</small>}
        {self !== null && report.names[self] && <bdi className="d-report-self-id">{report.names[self]}</bdi>}</span>
      <span>本路已记录漏怪 <strong>{local.length ? formatReportNumber(local.reduce((a, b) => a + b, 0)) : '—'}</strong></span>
    </div>
    <div className="d-report-table d-report-compact" tabIndex={0} aria-label="逐回合本路结算"><table>
      <thead><tr><th scope="col">回合</th><th scope="col">我漏怪</th><th scope="col">兜底与协防</th><th scope="col">怪物记录</th></tr></thead>
      <tbody>{report.rounds.slice().reverse().map(row => {
        const leaks = ownRoundLeaks(row, report);
        return <tr key={row.number} data-current={row.number === active}>
          <th scope="row"><button type="button" className="d-report-round-link" onClick={() => onRound(row.number)}
            aria-label={`查看 R${row.number} 回合详情`}>R{row.number}</button></th>
          <td>{leaks === undefined ? <span className="d-muted">未记录</span>
            : <strong className="d-report-own-leaks">{formatReportNumber(leaks)} 只</strong>}</td>
          <td><AssistSummary data={row} report={report} ownLeaks={leaks} /></td>
          <td><RoundOutcomes data={row} report={report} leaks={leaks} /></td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="d-muted d-report-legend">本路漏怪按进入协防前计数，已被兜住的也计在内。{self === null && '席位未确认，协防只列已识别的双方。'}</p>
  </>;
}

function RoundPreviewLink({ report, number, open }: { report?: BattleReport; number: number; open(round: number): void }) {
  const count = report?.preview.filter(row => row.round === number && row.kind === 'plan').length;
  return count ? <button type="button" className="d-button d-small" onClick={() => open(number)}>查看 R{number} 出怪预告 · {count} 条</button> : null;
}

function sumAssists(rounds: BattleRound[]): AssistData {
  const pairs = new Map<string, BattleRound['assistPairs'][number]>();
  let unattributedAssists = 0;
  for (const round of rounds) {
    unattributedAssists += round.unattributedAssists;
    for (const pair of round.assistPairs) {
      const key = `${pair.killer}:${pair.owner}`;
      pairs.set(key, { ...pair, count: (pairs.get(key)?.count ?? 0) + pair.count });
    }
  }
  const assistsStatus = rounds.every(round => round.assistsStatus === 'skipped') ? 'skipped'
    : rounds.every(round => ['reported', 'skipped'].includes(round.assistsStatus)) ? 'reported'
    : rounds.some(round => ['reported', 'observed'].includes(round.assistsStatus)) ? 'observed' : 'unknown';
  return { assistPairs: [...pairs.values()], assistsStatus, unattributedAssists };
}

export function WaveDetails({ report, round, onRound, onPreview }: {
  report?: BattleReport; round: ReportRoundFilter; onRound(round: ReportRoundFilter): void; onPreview(round: number): void;
}) {
  const all = round === 'all';
  const recorded = report?.rounds ?? [];
  const active = all ? undefined : recorded.find(row => row.number === round);
  const rows = all ? recorded : active ? [active] : [];
  const timeline = <ReportRoundTimeline label="回合详情" selected={round} current={report?.current}
    available={new Set(recorded.map(row => row.number))} onSelect={onRound} />;
  if (!report || !rows.length) return <>{timeline}<div className="d-report-empty">
    <span>{all ? '暂无回合记录。' : `R${round} 暂无实战记录。`}</span>
    {round !== 'all' && <RoundPreviewLink report={report} number={round} open={onPreview} />}
  </div></>;
  const total = (values: Metric[]) => all ? sumMetrics(values) : values[0];
  const leaks = total(rows.map(row => {
    const value = ownRoundLeaks(row, report);
    return value === undefined ? undefined : { value };
  }));
  const waves = active?.rows.filter(wave => wave.seat !== null || wave.leaked !== null) ?? [];
  const assists = all ? sumAssists(rows) : rows[0];
  return <>
    {timeline}
    <div className="d-section-head d-report-subhead">
      <h2>{all ? '全部回合累计' : `R${round} · ${reportPhase(active)}`}</h2>
      {all && <small className="d-muted">已知数据合计 · 已记录 {rows.length} 回合</small>}
    </div>
    <div className="d-report-summary">
      <span>我漏怪 <strong>{leaks ? `${metricText(leaks)} 只` : '未记录'}</strong></span>
      {report.self !== null && seatName(report.self, report)}
    </div>
    {Boolean(leaks?.value) && <div className="d-report-outcomes"><EnemyOutcomes label="本路漏怪"
      enemies={groupEnemyOutcomes(rows.flatMap(row => ownLeakKinds(row, report)))} total={leaks!.value} /></div>}
    <div className="d-report-seat-cards">
      {REPORT_SEATS.map(seat => {
        const lane = rows.map(row => roundMetrics(row, seat, report.self));
        return <div key={seat}>{seatName(seat, report)}
          <strong>{metricText(total(lane.map(values => values[0])))} 只</strong>
          <small>漏怪 · 协防 {metricText(total(lane.map(values => values[1])))} 只</small>
        </div>;
      })}
    </div>
    <section className="d-report-assist-detail">
      <h3>{all ? '兜底合计' : '本回合兜底'}</h3><AssistSummary data={assists} report={report} team={all}
        ownLeaks={active ? ownRoundLeaks(active, report) : undefined} />
    </section>
    <p className="d-muted d-report-legend">— 未记录 · * 部分记录 · ≈ 估算 · ≥ 已知下限</p>
    {waves.length ? <div className="d-report-table"><table>
      <thead><tr>{[active?.bossGroups ? '战区' : '玩家', '批次', '敌人', '计划', '漏怪'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{waves.flatMap((wave, i) => (wave.enemies.length ? wave.enemies : [undefined]).map((enemy, j) => <tr key={`${i}-${j}`}>
        {j === 0 && <><th rowSpan={Math.max(1, wave.enemies.length)} scope="row">{wave.seat !== null && !active?.bossGroups ? seatName(wave.seat, report) : waveOwner(wave.seat, active?.bossGroups ?? false)}</th>
          <td rowSpan={Math.max(1, wave.enemies.length)}>{batchName(wave.action)}</td></>}
        <td><EnemyLabel id={enemy?.id} name={enemy?.name} /></td>
        <td>{formatReportNumber(enemy?.count ?? (enemy ? null : wave.planned))}</td>
        <td>{formatReportNumber(enemy?.leaked ?? (enemy ? null : wave.leaked))}</td>
      </tr>))}</tbody>
    </table></div> : active && <div className="d-report-empty"><span>R{active.number} 暂无战斗编排。</span>
      <RoundPreviewLink report={report} number={active.number} open={onPreview} /></div>}
  </>;
}

const bossSourceLabels: Record<number, string> = { 0: '未知', 1: '干员', 2: '法术／陷阱', 3: '无攻击实例' };

export function BossDamage({ report, number, onRound, reference, onPreview }: {
  report?: BattleReport; number: 14 | 15; onRound(round: number): void; reference: ReactNode; onPreview(round: number): void;
}) {
  const data = report?.rounds.find(row => row.number === number);
  const hasBreakdown = data && (data.bossUplinkRows.length > 0 || data.bossOfficial.length > 0
    || Object.keys(data.bossUplink).length > 0);
  const recorded = hasBossDamage(data);
  return <>
    {report?.rounds.some(row => row.number >= 14 && (Object.keys(row.bossPercent).length || Object.keys(row.bossDamage).length))
      && <div className="d-report-table"><table>
      <thead><tr><th scope="col">座位</th><th scope="col">R14 · 贡献 / 伤害</th><th scope="col">R15 · 贡献 / 伤害</th></tr></thead>
      <tbody>{REPORT_SEATS.map(seat => <tr key={seat}><th scope="row">{seatName(seat, report)}</th>
        {([14, 15] as const).map(round => {
          const row = report?.rounds.find(item => item.number === round);
          const percent = row?.bossPercent[seat], damage = row?.bossDamage[seat];
          return <td key={round}>{percent !== undefined ? `${formatReportNumber(percent)}%${damage !== undefined ? ` · ${formatReportNumber(damage)}` : ''}` : formatReportNumber(damage)}</td>;
        })}
      </tr>)}</tbody>
    </table></div>}
    <div className="d-section-head">
      <h2>Boss 明细</h2>
      <div className="d-inline">
        {([14, 15] as const).map(round => <button type="button" className="d-button d-small" key={round}
          aria-pressed={number === round} onClick={() => onRound(round)}>R{round}</button>)}
      </div>
    </div>
    {reference}
    {data && (recorded || data.bossHp !== null) && <p className="d-muted">
      {data.bossHp !== null && <>Boss 血量 {formatReportNumber(data.bossHp)} · </>}
      {data.bossStatus === 'settlement' ? '已取得服务器伤害结算'
        : data.bossEnded ? '战斗阶段已结束，未取得服务器伤害结算'
          : data.bossStatus === 'reported' ? '已记录伤害，未取得服务器结算'
            : data.bossOfficial.length ? '已收到榜单，未取得服务器伤害结算'
              : hasBreakdown ? '仅有本端伤害上报，未取得全队结算' : '未取得伤害结算'}
      {data.bossRoundInferred && ' · 回合按最近确认进度关联，等待场景校正'}
    </p>}
    {!recorded && <div className="d-report-empty"><span>{data?.bossEnded ? `R${number} Boss 战斗阶段已结束，但未采到伤害。`
      : data?.phase === 'boss' ? `已采到 R${number} Boss 开战阶段，尚未采到伤害。`
        : `未采到 R${number} 的 Boss 战阶段或伤害。`}</span>
      <span>请按 Ctrl+Shift+F9 查看采集诊断，核对 Boss 结算是否入表。</span>
      <RoundPreviewLink report={report} number={number} open={onPreview} />
    </div>}
    {data && hasBreakdown && <>
      <div className="d-report-table"><table>
        <thead><tr>{['来源', '座位', '攻击编号', '类型', '伤害'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {REPORT_SEATS.filter(seat => data.bossUplink[seat] !== undefined).map(seat => <tr key={`sum-${seat}`}>
            <th scope="row">本端上报合计</th><td>{seatName(seat, report)}</td><td>—</td><td>—</td><td>{formatReportNumber(data.bossUplink[seat])}</td>
          </tr>)}
          {[...data.bossOfficial, ...data.bossUplinkRows].map((hit, i) => <tr key={i}>
            <th scope="row">{i < data.bossOfficial.length ? '官方榜单' : '本端上报'}</th>
            <td>{seatName(hit.seat, report)}</td><td>{hit.identifier}</td>
            <td>{hit.source === null ? '—' : bossSourceLabels[hit.source] ?? '未知'}</td><td>{formatReportNumber(hit.damage)}</td>
          </tr>)}
        </tbody>
      </table></div>
    </>}
  </>;
}

export function SpawnPreview({ report, filter, onSelect }: {
  report?: BattleReport; filter: PreviewRoundFilter; onSelect(round: PreviewRoundFilter): void;
}) {
  const [kind, setKind] = useState<'plan' | 'battle'>('plan');
  const plans = report?.preview.some(row => row.kind === 'plan');
  const hasBattle = report?.preview.some(row => row.kind === 'battle');
  const battle = hasBattle && (!plans || kind === 'battle');
  const round = resolvePreviewRound(report, filter);
  const available = new Set(report?.preview.filter(row => row.kind === (battle ? 'battle' : 'plan')).map(row => row.round));
  const rows = visibleSpawnRows(report, battle ? 'battle' : 'plan', round === 'all' ? '' : String(round), '');
  const sections = new Map<number, typeof rows>();
  for (const enemy of rows) {
    const group = sections.get(enemy.round);
    if (group) group.push(enemy);
    else sections.set(enemy.round, [enemy]);
  }
  return <>
    <ReportRoundTimeline label="出怪预告回合" selected={round} current={report?.current} available={available}
      onSelect={onSelect} follow={{ enabled: filter === 'follow', onEnable: () => onSelect('follow') }} />
    {(plans && hasBattle || filter === 'follow' && !report?.current && report) && <div className="d-report-preview-meta">
      {plans && hasBattle && <div className="d-report-view-switch" role="group" aria-label="出怪列表">
        <button className="d-button d-small" type="button" aria-pressed={!battle} onClick={() => setKind('plan')}>预告</button>
        <button className="d-button d-small" type="button" aria-pressed={Boolean(battle)} onClick={() => setKind('battle')}>实战编排</button>
      </div>}
      {filter === 'follow' && !report?.current && <small className="d-muted">
        {round === 'all' ? '当前回合未确认，先显示全部预告'
          : round > (report?.rounds.at(-1)?.number ?? 0) ? `当前回合未确认，先显示 R${round} 预告`
            : `当前回合未确认，暂显示最近记录 R${round}`}
      </small>}
    </div>}
    {rows.length ? <div className="d-report-table d-report-scroll-table d-report-spawns" tabIndex={0} aria-label={battle ? '实战编排' : '出怪预告'}><table>
      <thead><tr><th scope="col">回合</th><th scope="col">批次</th><th scope="col">敌人</th>
        <th scope="col">{battle ? '已记录合计' : '数量'}</th></tr></thead>
      {[...sections].map(([number, enemies]) => <tbody key={number}>{enemies.map((enemy, i) => <tr key={i}>
        {i === 0 && <th scope="rowgroup" rowSpan={enemies.length}>R{number}</th>}
        <td>{enemy.boss ? 'Boss' : batchName(enemy.action)}</td><td><EnemyLabel id={enemy.id} name={enemy.name} /></td>
        <td className="d-report-spawn-count">{formatReportNumber(enemy.count)}</td>
      </tr>)}</tbody>)}
    </table></div> : <p className="d-muted d-report-note">{round !== 'all'
      ? `R${round} 暂无${battle ? '实战编排' : '出怪预告'}。` : '暂无出怪预告。'}</p>}
  </>;
}

const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

export function ReportHistory({ records, liveKey, onOpen }: {
  records: ReportRecord[]; liveKey?: string; onOpen(key: string): void;
}) {
  if (!records.length) return <p className="d-muted d-report-note">暂无记录。实时对局和导入的 JSON 会列在这里。</p>;
  return <>
    <div className="d-report-table"><table>
      <thead>
        <tr><th scope="col" rowSpan={2}>对局</th><th scope="col" rowSpan={2}>记录时间</th><th scope="col" rowSpan={2}>难度</th>
          <th scope="col" rowSpan={2}>进度</th><th scope="col" rowSpan={2}>本路漏怪</th><th scope="colgroup" colSpan={4}>漏怪合计</th><th scope="col" rowSpan={2}>操作</th></tr>
        <tr>{REPORT_SEATS.map(seat => <th scope="col" key={seat}>{seat}号</th>)}</tr>
      </thead>
      <tbody>{records.map(entry => {
        const last = entry.report.rounds.at(-1);
        return <tr key={entry.key}>
          <th scope="row" title={entry.label}>{entry.label}{entry.key === liveKey ? ' · 最新' : ''}</th>
          <td>{dateTime.format(entry.seenAt)}</td><td>{entry.report.difficulty || '—'}</td>
          <td>{last ? `R${last.number} · ${reportPhase(last)}` : '—'}</td>
          <td>{metricText(sumMetrics(entry.report.rounds.map(row => {
            const value = ownRoundLeaks(row, entry.report);
            return value === undefined ? undefined : { value };
          })))}</td>
          {REPORT_SEATS.map(seat => <td key={seat}>{metricText(sumMetrics(entry.report.rounds.map(row => roundMetrics(row, seat, entry.report.self)[0])))}</td>)}
          <td><button className="d-button d-small" type="button" onClick={() => onOpen(entry.key)}>查看</button></td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="d-muted d-report-legend">当前运行期间的对局与导入记录</p>
  </>;
}
