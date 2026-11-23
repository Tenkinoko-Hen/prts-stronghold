import type { ReactNode } from 'react';
import { REPORT_SEATS, hasBossDamage, type BattleReport, type BattleRound } from './battleReportData';

const PHASES: Record<string, string> = {
  loading: '载入', special_prep: '特殊准备', prep: '准备', self: '防守', assist: '协防', boss: 'Boss 战',
  settle: '结算', end: '结束', pause: '暂停', battle_wait: '等待战斗', boss_wait: '等待 Boss 战',
};
const numbers = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
export const formatReportNumber = (value: number | null | undefined) => value == null ? '—' : numbers.format(value);

export function reportPhase(data?: BattleRound) {
  if (data?.allPlayersLeaked) return '全员漏怪';
  if (data && ['settle', 'end', 'boss'].includes(data.phase)) return PHASES[data.phase];
  if (data?.assistsStatus === 'reported') return '协防已结算';
  if (data && data.phase !== 'assist' && (data.selfLeaks !== null || data.leaksStatus === 'observed')) return '本路已结算';
  if (data && Object.hasOwn(PHASES, data.phase)) return PHASES[data.phase];
  return '—';
}

export function seatName(seat: number, report?: BattleReport, perspective = report?.self) {
  const id = report?.names[seat];
  const isSelf = perspective === seat;
  const label = `${seat}号${isSelf ? ' · 我' : ''}`;
  return <span className={`d-report-seat d-report-seat-${seat}`} title={id ? `${id} · ${label}` : label}>
    <bdi>{seat}号</bdi>{id && <span className="d-report-seat-name">· {id}</span>}{isSelf && <small>我</small>}
  </span>;
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
  const hasBreakdown = data && (data.bossUplinkRows.length > 0 || data.bossOfficial.length > 0
    || Object.keys(data.bossUplink).length > 0);
  const recorded = hasBossDamage(data);
  return <>
    {report?.rounds.some(row => row.number >= 14 && (Object.keys(row.bossPercent).length || Object.keys(row.bossDamage).length))
      && <div className="d-report-table"><table>
      <thead><tr><th scope="col">座位</th><th scope="col">R14 · 贡献 / 伤害</th><th scope="col">R15 · 贡献 / 伤害</th></tr></thead>
      <tbody>{REPORT_SEATS.map(seat => <tr key={seat}><th scope="row">{seatName(seat, report, perspective)}</th>
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
            <th scope="row">本端上报合计</th><td>{seatName(seat, report, perspective)}</td><td>—</td><td>—</td><td>{formatReportNumber(data.bossUplink[seat])}</td>
          </tr>)}
          {[...data.bossOfficial, ...data.bossUplinkRows].map((hit, i) => <tr key={i}>
            <th scope="row">{i < data.bossOfficial.length ? '官方榜单' : '本端上报'}</th>
            <td>{seatName(hit.seat, report, perspective)}</td><td>{hit.identifier}</td>
            <td>{hit.source === null ? '—' : bossSourceLabels[hit.source] ?? '未知'}</td><td>{formatReportNumber(hit.damage)}</td>
          </tr>)}
        </tbody>
      </table></div>
    </>}
  </>;
}
