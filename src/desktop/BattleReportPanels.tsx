import type { ReactNode } from 'react';
import { ChevronRight, Flame, Trophy } from 'lucide-react';
import type { BossEncounter } from '../data/bossEncounterData';
import { REPORT_SEATS, hasBossDamage, isHiddenBossRound, reportBossRounds, type BattleReport, type BattleRound } from './battleReportData';
import { EnemyAvatar } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { formatTelemetryTotal, isSoloMode } from './combatTelemetry';

const PHASES: Record<string, string> = {
  loading: '载入', special_prep: '特殊准备', prep: '准备', self: '防守', assist: '协防', boss: 'Boss 战',
  settle: '结算', end: '结束', pause: '暂停', battle_wait: '等待战斗', boss_wait: '等待 Boss 战',
};
const numbers = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const leaderDigits = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
export const formatReportNumber = (value: number | null | undefined) => value == null ? '—' : numbers.format(value);

export function reportPhase(data?: BattleRound) {
  if (data?.allPlayersLeaked) return '全员漏怪';
  if (data && ['settle', 'end', 'boss'].includes(data.phase)) return PHASES[data.phase];
  if (data?.assistsStatus === 'reported') return '协防已结算';
  if (data && data.phase !== 'assist' && (data.selfLeaks !== null || data.leaksStatus === 'observed')) return '本路已结算';
  if (data && Object.hasOwn(PHASES, data.phase)) return PHASES[data.phase];
  return '—';
}

export function seatDisplayText(seat: number, report?: BattleReport) {
  const id = report?.names[seat]?.trim();
  return id || `${seat}号`;
}

export function seatName(seat: number, report?: BattleReport, selfOverride = report?.self) {
  const id = report?.names[seat]?.trim();
  // 只要已确认本机席位 report.self，「我」徽章永远只跟随真实本机席位，不随视角切换漂移
  const actualSelf = report?.self !== null && report?.self !== undefined ? report.self : selfOverride;
  const isSelf = actualSelf === seat;
  const fallback = `${seat}号`;
  const title = id ? `${id}（${fallback}${isSelf ? ' · 我' : ''}）` : `${fallback}${isSelf ? ' · 我' : ''}`;
  return <span className={`d-report-seat d-report-seat-${seat}`} title={title}>
    {id ? <span className="d-report-seat-name">{id}</span> : <bdi>{fallback}</bdi>}{isSelf && <small>我</small>}
  </span>;
}

export function LeaderInlineBar({ encounter, round, hidden = round === 15, liveHp, onOpen }: {
  encounter: BossEncounter;
  round: number;
  hidden?: boolean;
  liveHp?: number | null;
  onOpen(): void;
}) {
  const wave = (hidden ? encounter.rounds[15] : undefined) ?? encounter.rounds[14];
  const [hp, atk, def, res, interval, speed] = wave.stats;
  const portraitId = hidden && encounter.rounds[15] ? `${encounter.id}_2` : encounter.id;
  const displayHp = liveHp && liveHp > 0 ? liveHp : hp;
  return (
    <button
      type="button"
      className="d-report-leader"
      onClick={onOpen}
      aria-label={`查看 ${encounter.name} 详细属性、随从与实战路线`}
      title="点击查看领袖详细面板、随行敌人与路线站位"
    >
      <EnemyAvatar id={portraitId} size={30} />
      <strong className="d-leader-name">{encounter.name}</strong>
      <span className="d-leader-stats">
        <span><small>{liveHp && liveHp > 0 ? '实局血量' : '参考生命'}</small><b>{leaderDigits.format(displayHp)}</b></span>
        <span><small>攻击</small><b>{leaderDigits.format(Math.round(atk))}</b></span>
        <span><small>防御</small><b>{leaderDigits.format(def)}</b></span>
        <span><small>法抗</small><b>{leaderDigits.format(res)}</b></span>
        <span><small>间隔</small><b>{leaderDigits.format(interval)}s</b></span>
        <span><small>移速</small><b>{leaderDigits.format(speed)}</b></span>
      </span>
      <span className="d-leader-more">详情与路线<ChevronRight size={14} /></span>
    </button>
  );
}

function RoundPreviewLink({ report, number, open }: { report?: BattleReport; number: number; open(round: number): void }) {
  const count = report?.preview.filter(row => row.round === number && row.kind === 'plan').length;
  return count ? <button type="button" className="d-button d-small" onClick={() => open(number)}>查看 R{number} 出怪预告 · {count} 条</button> : null;
}

const bossSourceLabels: Record<number, string> = { 0: '未知', 1: '干员', 2: '法术／陷阱', 3: '无攻击实例' };

export function BossDamage({ report, seat: perspective = report?.self, number, onRound, reference, onPreview }: {
  report?: BattleReport; seat?: number | null; number: number; onRound(round: number): void; reference: ReactNode; onPreview(round: number): void;
}) {
  const bossRoundList = reportBossRounds(report);
  const data = report?.rounds.find(row => row.number === number);
  const solo = isSoloMode(report?.mode);
  const seats = solo ? ([1] as const) : REPORT_SEATS;
  const hasBreakdown = Boolean(data && (data.bossUplinkRows.length > 0 || data.bossOfficial.length > 0
    || Object.keys(data.bossUplink).length > 0));
  const recorded = hasBossDamage(data);
  const defeated = Boolean(report?.defeatedBossRounds.includes(number));

  // Aggregate per-seat damage for visual bars (prefer server bossDamage, else official sum, else uplink)
  const seatDamages = seats.map(s => {
    const serverDmg = data?.bossDamage[s];
    const officialSum = (data?.bossOfficial ?? []).filter(h => h.seat === s).reduce((acc, h) => acc + h.damage, 0);
    const uplinkSum = data?.bossUplink[s] ?? (data?.bossUplinkRows ?? []).filter(h => h.seat === s).reduce((acc, h) => acc + h.damage, 0);
    const damage = serverDmg !== undefined ? serverDmg : (officialSum > 0 ? officialSum : (uplinkSum > 0 ? uplinkSum : null));
    const percent = data?.bossPercent[s] ?? (damage !== null && data?.bossHp ? Math.floor((damage / data.bossHp) * 100) : null);
    const elimRound = report?.eliminated[s];
    const eliminated = elimRound !== undefined && number > elimRound;
    return { seat: s, damage, percent, eliminated, elimRound };
  });
  const teamTotalDamage = seatDamages.reduce((acc, row) => acc + (row.damage ?? 0), 0);
  const maxSeatDamage = Math.max(1, ...seatDamages.map(row => row.damage ?? 0));
  const bossMaxHp = data?.bossHp ?? null;
  const bossDamagePct = bossMaxHp && bossMaxHp > 0 ? Math.min(100, (teamTotalDamage / bossMaxHp) * 100) : null;

  // Aggregate operator contributions for graphical horizontal bar chart (prefer official, fallback uplink)
  const rawHits = data?.bossOfficial.length ? data.bossOfficial : (data?.bossUplinkRows ?? []);
  const opAggMap = new Map<string, { key: string; seat: number; name: string; identifier: number; damage: number }>();
  for (const hit of rawHits) {
    if (hit.damage <= 0) continue;
    const key = `${hit.seat}:${hit.charId || hit.identifier}`;
    const prev = opAggMap.get(key);
    const name = hit.operatorName || `干员 #${hit.identifier}`;
    if (!prev) {
      opAggMap.set(key, { key, seat: hit.seat, name, identifier: hit.identifier, damage: hit.damage });
    } else {
      prev.damage += hit.damage;
    }
  }
  const opBars = [...opAggMap.values()].sort((a, b) => b.damage - a.damage);
  const opTotal = opBars.reduce((acc, item) => acc + item.damage, 0);
  const opMax = Math.max(1, ...opBars.map(item => item.damage));

  return <div className="d-boss-shell">
    <div className="d-section-head">
      <h2>Boss 伤害剖析</h2>
      <div className="d-inline">
        {bossRoundList.map(round => {
          const isDefeated = report?.defeatedBossRounds.includes(round);
          const isHidden = isHiddenBossRound(report, round);
          return <button type="button" className="d-button d-small" key={round}
            aria-pressed={number === round} onClick={() => onRound(round)}>
            R{round}{isHidden ? ' · 隐藏' : ''}{isDefeated ? ' · 已击败' : ''}
          </button>;
        })}
      </div>
    </div>

    {reference}

    {data && (recorded || bossMaxHp !== null || defeated) && (
      <section className="d-boss-visual-card" aria-label={`R${number} 首领伤害可视化`}>
        <header className="d-boss-vis-head">
          <div className="d-boss-vis-title">
            {defeated ? <span className="d-boss-badge is-win"><Trophy size={12} />已击败首领</span>
              : <span className="d-boss-badge"><Flame size={12} />R{number} 首领战</span>}
            <span className="d-muted">
              {data.bossStatus === 'settlement' ? '已取得服务器伤害结算'
                : data.bossEnded ? '首领阶段已结束'
                  : data.bossStatus === 'reported' ? '实时伤害快照'
                    : data.bossOfficial.length ? '已收到榜单，未取得服务器伤害结算'
                      : hasBreakdown ? '本端上报口径' : '等待伤害入表'}
              {data.bossRoundInferred ? ' · 回合按最近确认进度关联，等待场景校正' : ''}
            </span>
          </div>
          <div className="d-boss-vis-totals">
            <span>累计输出 <b>{formatTelemetryTotal(teamTotalDamage)}</b></span>
            {bossMaxHp !== null && <span>首领血量 <b>{formatTelemetryTotal(bossMaxHp)}</b></span>}
          </div>
        </header>

        {bossDamagePct !== null && (
          <div className="d-boss-hp-progress">
            <div className="d-boss-hp-labels">
              <small><b className="d-prts-slash">//</b>首领削血进度</small>
              <b>{defeated ? '100%（已击破）' : `${leaderDigits.format(bossDamagePct)}%`}</b>
            </div>
            <div className="d-boss-hp-bar">
              <span style={{ width: `${defeated ? 100 : bossDamagePct}%` }} data-win={defeated} />
              <i className="d-hp-tick" style={{ left: '25%' }} />
              <i className="d-hp-tick" style={{ left: '50%' }} />
              <i className="d-hp-tick" style={{ left: '75%' }} />
            </div>
          </div>
        )}

        <div className="d-boss-seat-bars">
          {seatDamages.map(row => {
            const share = teamTotalDamage > 0 && row.damage !== null ? (row.damage / teamTotalDamage) * 100 : null;
            const barW = row.damage && row.damage > 0 ? Math.max(4, (row.damage / maxSeatDamage) * 100) : 0;
            return (
              <div key={row.seat} className="d-boss-seat-row" data-eliminated={row.eliminated} data-self={report?.self === row.seat}>
                <span className="d-boss-seat-who">
                  {seatName(row.seat, report, perspective)}
                  {row.eliminated && <small className="d-elim-inline">R{row.elimRound}阵亡</small>}
                </span>
                <span className="d-bar-track d-bar-axis-grid" aria-hidden="true">
                  {barW > 0 && <i className={report?.self === row.seat ? 'is-ochre' : `seat-fill-${row.seat}`} style={{ width: `${barW}%` }} />}
                </span>
                <span className="d-boss-seat-nums">
                  <b>{row.damage !== null ? formatTelemetryTotal(row.damage) : '—'}</b>
                  <small>
                    {row.percent !== null ? `血量 ${row.percent}%` : share !== null ? `占比 ${leaderDigits.format(share)}%` : '—'}
                  </small>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    )}

    {opBars.length > 0 && (
      <section className="d-boss-op-chart" aria-label="参战干员首领输出排行">
        <header className="d-tele-subhead">
          <span><b className="d-prts-slash">//</b>参战干员首领输出分布（Top {Math.min(12, opBars.length)}）</span>
          <small>{data?.bossOfficial.length ? '源自官方榜单' : '源自本端上报'} · 合计 {formatTelemetryTotal(opTotal)}</small>
        </header>
        <div className="d-boss-op-rows">
          {opBars.slice(0, 12).map((op, idx) => {
            const pct = opTotal > 0 ? (op.damage / opTotal) * 100 : 0;
            const w = Math.max(4, (op.damage / opMax) * 100);
            return (
              <div key={op.key} className="d-boss-op-row">
                <span className="d-tele-rank">#{String(idx + 1).padStart(2, '0')}</span>
                <CompactOperatorBadge name={op.name} size={24} />
                <span className="d-boss-op-name">
                  <strong>{op.name}</strong>
                  {!solo && <small>{seatDisplayText(op.seat, report)}</small>}
                </span>
                <span className="d-bar-track d-bar-axis-grid" aria-hidden="true">
                  <i className={idx === 0 ? 'is-ochre' : 'is-out'} style={{ width: `${w}%` }} />
                </span>
                <span className="d-boss-op-val">
                  <b>{formatTelemetryTotal(op.damage)}</b>
                  <small>{leaderDigits.format(pct)}%</small>
                </span>
              </div>
            );
          })}
          <div className="d-boss-axis-scale" aria-hidden="true">
            <span /><span /><span />
            <div><small>0</small><small>{formatTelemetryTotal(opMax * 0.5)}</small><small>{formatTelemetryTotal(opMax)}</small></div>
            <span />
          </div>
        </div>
      </section>
    )}

    {!recorded && <div className="d-report-empty"><span>{data?.bossEnded ? `R${number} Boss 战斗阶段已结束，但未采到伤害。`
      : data?.phase === 'boss' ? `已采到 R${number} Boss 开战阶段，尚未采到伤害。`
        : `未采到 R${number} 的 Boss 战阶段或伤害。`}</span>
      {report && !report.current && <span className="d-report-npcap-hint">当前仅收到客户端上行结算、未取得服务端下行场景（Windows 内置通道可能受防火墙拦截）。建议安装 Npcap 后以管理员身份重启应用，将自动切换驱动通道获取完整 Boss 伤害与队友昵称。</span>}
      <span>请按 Ctrl+Shift+F9 查看采集诊断，核对 Boss 结算是否入表。</span>
      <RoundPreviewLink report={report} number={number} open={onPreview} />
    </div>}

    {data && hasBreakdown && (
      <details className="d-round-fold">
        <summary>原始 Boss 伤害明细表（{data.bossOfficial.length + data.bossUplinkRows.length} 条）</summary>
        <div className="d-report-table"><table>
          <thead><tr>{['来源', '座位', '参战干员 / 编号', '类型', '伤害'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            {seats.filter(seat => data.bossUplink[seat] !== undefined).map(seat => <tr key={`sum-${seat}`}>
              <th scope="row">本端上报合计</th><td>{seatName(seat, report, perspective)}</td><td>—</td><td>—</td><td>{formatReportNumber(data.bossUplink[seat])}</td>
            </tr>)}
            {[...data.bossOfficial, ...data.bossUplinkRows].map((hit, i) => <tr key={i}>
              <th scope="row">{i < data.bossOfficial.length ? '官方榜单' : '本端上报'}</th>
              <td>{seatName(hit.seat, report, perspective)}</td>
              <td>{hit.operatorName ? <span className="d-boss-op"><CompactOperatorBadge name={hit.operatorName} size={20} /><span>{hit.operatorName}</span><small className="d-muted">#{hit.identifier}</small></span> : hit.identifier}</td>
              <td>{hit.source === null ? '—' : bossSourceLabels[hit.source] ?? '未知'}</td><td>{formatReportNumber(hit.damage)}</td>
            </tr>)}
          </tbody>
        </table></div>
      </details>
    )}
  </div>;
}
