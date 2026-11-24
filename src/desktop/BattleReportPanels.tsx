import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { BossEncounter } from '../data/bossEncounterData';
import { REPORT_SEATS, hasBossDamage, type BattleReport, type BattleRound } from './battleReportData';
import { EnemyAvatar } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { isSoloMode } from './combatTelemetry';

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

export function seatName(seat: number, report?: BattleReport, perspective = report?.self) {
  const id = report?.names[seat]?.trim();
  const isSelf = perspective === seat;
  const fallback = `${seat}号`;
  const title = id ? `${id}（${fallback}${isSelf ? ' · 我' : ''}）` : `${fallback}${isSelf ? ' · 我' : ''}`;
  return <span className={`d-report-seat d-report-seat-${seat}`} title={title}>
    {id ? <span className="d-report-seat-name">{id}</span> : <bdi>{fallback}</bdi>}{isSelf && <small>我</small>}
  </span>;
}

export function LeaderInlineBar({ encounter, round, liveHp, onOpen }: {
  encounter: BossEncounter;
  round: 14 | 15;
  liveHp?: number | null;
  onOpen(): void;
}) {
  const wave = encounter.rounds[round] ?? encounter.rounds[14];
  const [hp, atk, def, res, interval, speed] = wave.stats;
  const portraitId = round === 15 && encounter.rounds[15] ? `${encounter.id}_2` : encounter.id;
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
        <span><small>{liveHp && liveHp > 0 ? '实局血量' : '生命'}</small><b>{leaderDigits.format(displayHp)}</b></span>
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
  report?: BattleReport; seat?: number | null; number: 14 | 15; onRound(round: number): void; reference: ReactNode; onPreview(round: number): void;
}) {
  const data = report?.rounds.find(row => row.number === number);
  const solo = isSoloMode(report?.mode);
  const seats = solo ? ([1] as const) : REPORT_SEATS;
  const hasBreakdown = data && (data.bossUplinkRows.length > 0 || data.bossOfficial.length > 0
    || Object.keys(data.bossUplink).length > 0);
  const recorded = hasBossDamage(data);
  return <>
    {report?.rounds.some(row => row.number >= 14 && (Object.keys(row.bossPercent).length || Object.keys(row.bossDamage).length))
      && <div className="d-report-table"><table>
      <thead><tr><th scope="col">座位</th><th scope="col">R14 · 贡献 / 伤害</th><th scope="col">R15 · 贡献 / 伤害</th></tr></thead>
      <tbody>{seats.map(seat => <tr key={seat}><th scope="row">{seatName(seat, report, perspective)}</th>
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
        {([14, 15] as const).map(round => {
          const defeated = report?.defeatedBossRounds.includes(round);
          return <button type="button" className="d-button d-small" key={round}
            aria-pressed={number === round} onClick={() => onRound(round)}>R{round}{defeated ? ' · 已击败' : ''}</button>;
        })}
      </div>
    </div>
    {reference}
    {data && (recorded || data.bossHp !== null || report?.defeatedBossRounds.includes(number)) && <p className="d-muted">
      {report?.defeatedBossRounds.includes(number) && <strong className="d-success">已击败首领 · </strong>}
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
      {report && !report.current && <span className="d-report-npcap-hint">当前仅收到客户端上行结算、未取得服务端下行场景（Windows 内置通道可能受防火墙拦截）。建议安装 Npcap 后以管理员身份重启应用，将自动切换驱动通道获取完整 Boss 伤害与队友昵称。</span>}
      <span>请按 Ctrl+Shift+F9 查看采集诊断，核对 Boss 结算是否入表。</span>
      <RoundPreviewLink report={report} number={number} open={onPreview} />
    </div>}
    {data && hasBreakdown && <>
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
    </>}
  </>;
}
