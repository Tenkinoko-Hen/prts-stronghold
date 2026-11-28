// 青逝痕 Tenkinoko 制作
import type { ReactNode } from 'react';
import { ChevronRight, Flame, Skull, Trophy } from 'lucide-react';
import type { BossEncounter } from '../data/bossEncounterData';
import { REPORT_SEATS, hasBossDamage, isHiddenBossRound, reportBossRounds, type BattleReport, type BattleRound } from './battleReportData';
import { EnemyAvatar } from './BattleReportSpawns';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { formatTelemetryTotal, isSoloMode } from './combatTelemetry';
import { normalizeOperatorName } from './covenantBonds';
import { formatAxisNumber, niceTicks, PRTS_CHART, PRTS_FONT_NUM, PRTS_FONT_SANS } from './prtsChartKit';

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
const PEER_PALETTE = ['#3698CC', '#498A9E', '#3FA67A', '#7C85B8'] as const;

function bossSeatColor(seat: number, isSelf: boolean): string {
  if (isSelf) return PRTS_CHART.ochre;
  return PEER_PALETTE[(seat - 1) % PEER_PALETTE.length];
}

interface BossDonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function BossContributionDonut({
  slices,
  centerValue,
  centerSub,
}: {
  slices: BossDonutSlice[];
  centerValue: string;
  centerSub: string;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  const r = 42;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox="0 0 120 120" className="d-boss-donut-svg" role="img" aria-label={`${centerSub} ${centerValue}`}>
      {/* Outer precision dashed reticle */}
      <circle cx="60" cy="60" r="53" fill="none" stroke="#1f2735" strokeWidth="1" strokeDasharray="2 5" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="#181f2a" strokeWidth="11" />
      {total > 0 && slices.map(slice => {
        const ratio = slice.value / total;
        const dash = Math.max(0, ratio * circ - (slices.length > 1 ? 1.5 : 0));
        const curOffset = offset;
        offset += ratio * circ;
        return (
          <circle
            key={slice.key}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={slice.color}
            strokeWidth="11"
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-curOffset}
            strokeLinecap="butt"
            transform="rotate(-90 60 60)"
          >
            <title>{`${slice.label}: ${formatTelemetryTotal(slice.value)} (${leaderDigits.format(ratio * 100)}%)`}</title>
          </circle>
        );
      })}
      <text x="60" y="57" textAnchor="middle" fill={PRTS_CHART.labelStrong} fontSize="15.5" fontWeight="700" fontFamily={PRTS_FONT_NUM}>
        {centerValue}
      </text>
      <text x="60" y="71" textAnchor="middle" fill={PRTS_CHART.labelMuted} fontSize="9.5" fontFamily={PRTS_FONT_SANS}>
        {centerSub}
      </text>
    </svg>
  );
}

function BossSeatColumnSvg({
  rows,
}: {
  rows: Array<{ seat: number; label: string; damage: number; color: string; eliminated: boolean }>;
}) {
  const maxVal = Math.max(1, ...rows.map(r => r.damage));
  const scale = niceTicks(maxVal, 4);
  const w = 440;
  const h = 148;
  const padL = 44;
  const padR = 14;
  const padT = 18;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const slotW = plotW / Math.max(1, rows.length);
  const barW = Math.min(40, Math.max(16, slotW * 0.44));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="d-prts-svg d-boss-col-svg" role="img" aria-label="各席位首领伤害柱状对比">
      {scale.ticks.map(t => {
        const y = padT + plotH - (t / scale.top) * plotH;
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke={t === 0 ? PRTS_CHART.axisLine : PRTS_CHART.gridLine} strokeWidth="1" strokeDasharray={t === 0 ? undefined : '2 3'} />
            <text x={padL - 6} y={y + 3.5} textAnchor="end" fill={PRTS_CHART.labelMuted} fontSize="9.5" fontFamily={PRTS_FONT_NUM}>
              {formatAxisNumber(t)}
            </text>
          </g>
        );
      })}
      {rows.map((row, idx) => {
        const cx = padL + slotW * (idx + 0.5);
        const bh = row.damage > 0 ? Math.max(3, (row.damage / scale.top) * plotH) : 0;
        const y = padT + plotH - bh;
        return (
          <g key={row.seat} opacity={row.eliminated && row.damage <= 0 ? 0.45 : 1}>
            {bh > 0 && (
              <>
                <rect x={cx - barW / 2} y={y} width={barW} height={bh} fill={row.color} rx="1" />
                <text x={cx} y={y - 4} textAnchor="middle" fill={PRTS_CHART.labelStrong} fontSize="10" fontWeight="700" fontFamily={PRTS_FONT_NUM}>
                  {formatTelemetryTotal(row.damage)}
                </text>
              </>
            )}
            <text x={cx} y={h - 9} textAnchor="middle" fill={PRTS_CHART.labelMuted} fontSize="10" fontFamily={PRTS_FONT_SANS}>
              {row.label.length > 7 ? `${row.label.slice(0, 6)}…` : row.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function isBossUplinkOnlyMissingDownlink(
  report: BattleReport | undefined,
  data: BattleReport['rounds'][number] | undefined,
): boolean {
  if (!report || report.current || !data) return false;
  const hasUplink = data.bossUplinkRows.length > 0 || Object.keys(data.bossUplink).length > 0;
  if (!hasUplink) return false;
  const hasDownlink = data.bossStatus === 'settlement'
    || data.bossStatus === 'reported'
    || data.bossOfficial.length > 0
    || Object.keys(data.bossDamage).length > 0;
  return !hasDownlink;
}

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
  const uplinkOnlyNoDownlink = isBossUplinkOnlyMissingDownlink(report, data);
  const defeated = Boolean(report?.defeatedBossRounds.includes(number));
  const bossMaxHp = data?.bossHp ?? null;

  // Aggregate per-seat damage (prefer server bossDamage, else official sum, else uplink)
  const seatDamages = seats.map(s => {
    const serverDmg = data?.bossDamage[s];
    const officialSum = (data?.bossOfficial ?? []).filter(h => h.seat === s).reduce((acc, h) => acc + h.damage, 0);
    const uplinkSum = data?.bossUplink[s] ?? (data?.bossUplinkRows ?? []).filter(h => h.seat === s).reduce((acc, h) => acc + h.damage, 0);
    const damage = serverDmg !== undefined ? serverDmg : (officialSum > 0 ? officialSum : (uplinkSum > 0 ? uplinkSum : null));
    // Avoid mixing stale boss_ratio (366) with newer official rank sum when server settlement hasn't arrived
    const hpPct = serverDmg !== undefined && data?.bossPercent[s] !== undefined
      ? data.bossPercent[s]
      : (damage !== null && bossMaxHp && bossMaxHp > 0 ? (damage / bossMaxHp) * 100 : data?.bossPercent[s] ?? null);
    const elimRound = report?.eliminated[s];
    const eliminated = elimRound !== undefined && number > elimRound;
    const isSelf = report?.self === s;
    return {
      seat: s,
      isSelf,
      color: bossSeatColor(s, isSelf),
      label: seatDisplayText(s, report),
      damage,
      hpPct,
      eliminated,
      elimRound,
    };
  });

  const teamTotalDamage = seatDamages.reduce((acc, row) => acc + (row.damage ?? 0), 0);
  const bossDamagePct = bossMaxHp && bossMaxHp > 0 ? Math.min(100, (teamTotalDamage / bossMaxHp) * 100) : null;
  const bossRemainHp = bossMaxHp !== null ? (defeated ? 0 : Math.max(0, bossMaxHp - teamTotalDamage)) : null;

  // Aggregate operator contributions (prefer official, fallback uplink)
  const rawHits = data?.bossOfficial.length ? data.bossOfficial : (data?.bossUplinkRows ?? []);
  const opAggMap = new Map<string, { key: string; seat: number; name: string; identifier: number; damage: number }>();
  for (const hit of rawHits) {
    if (hit.damage <= 0) continue;
    const key = `${hit.seat}:${hit.charId || hit.identifier}`;
    const prev = opAggMap.get(key);
    const rawName = hit.operatorName || `干员 #${hit.identifier}`;
    const name = normalizeOperatorName(rawName) || rawName;
    if (!prev) {
      opAggMap.set(key, { key, seat: hit.seat, name, identifier: hit.identifier, damage: hit.damage });
    } else {
      prev.damage += hit.damage;
    }
  }
  const opBars = [...opAggMap.values()].sort((a, b) => b.damage - a.damage);
  const opTotal = opBars.reduce((acc, item) => acc + item.damage, 0);
  const shareDenom = teamTotalDamage > 0 ? Math.max(teamTotalDamage, opTotal) : opTotal;
  const opMax = Math.max(1, ...opBars.map(item => item.damage));
  const opScale = niceTicks(opMax, 4);
  const mvpOp = opBars[0] ?? null;
  const hasLiveBossDamage = Boolean(
    data && (
      Object.values(data.bossDamage).some(v => v > 0)
      || Object.values(data.bossUplink).some(v => v > 0)
      || Object.values(data.bossPercent).some(v => v > 0)
    ),
  );

  // Segmented Boss HP Bar slices (proportional to Boss Max HP, scaled down cleanly if overkill)
  const rawSegTotalPct = bossMaxHp && bossMaxHp > 0
    ? seatDamages.reduce((sum, r) => sum + ((r.damage ?? 0) > 0 ? ((r.damage ?? 0) / bossMaxHp) * 100 : 0), 0)
    : 0;
  const segScale = rawSegTotalPct > 100 ? 100 / rawSegTotalPct : 1;
  const hpSegments = bossMaxHp && bossMaxHp > 0
    ? seatDamages
        .filter(r => (r.damage ?? 0) > 0)
        .sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))
        .map(r => {
          const truePct = ((r.damage ?? 0) / bossMaxHp) * 100;
          return { ...r, truePct, widthPct: truePct * segScale };
        })
    : [];
  const usedWidthPct = defeated ? 100 : Math.min(100, hpSegments.reduce((s, seg) => s + seg.widthPct, 0));
  const remainPct = defeated ? 0 : Math.max(0, 100 - usedWidthPct);

  // Donut data: in solo mode with operator data -> operator share donut; in coop -> seat contribution donut
  const useSoloOpDonut = solo && opBars.length > 0;
  const donutSlices: BossDonutSlice[] = useSoloOpDonut
    ? (() => {
        const top: BossDonutSlice[] = opBars.slice(0, 4).map((op, i) => ({
          key: op.key,
          label: op.name,
          value: op.damage,
          color: PRTS_CHART.series[i % PRTS_CHART.series.length],
        }));
        const rest = opBars.slice(4).reduce((s, o) => s + o.damage, 0);
        if (rest > 0) top.push({ key: 'rest', label: `其余 ${opBars.length - 4} 人`, value: rest, color: '#475569' });
        return top;
      })()
    : seatDamages
        .filter(r => (r.damage ?? 0) > 0)
        .sort((a, b) => (b.damage ?? 0) - (a.damage ?? 0))
        .map(r => ({
          key: `seat-${r.seat}`,
          label: r.label,
          value: r.damage ?? 0,
          color: r.color,
        }));

  const activeSeatRows = seatDamages.filter(r => !r.eliminated || (r.damage ?? 0) > 0);
  const deadSeatRows = seatDamages.filter(r => r.eliminated && !(r.damage && r.damage > 0));
  const seatColorBySeat = new Map<number, string>(seatDamages.map(r => [r.seat, r.color]));

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
      <>
        {/* Tier 1: Compact Hero KPI Strip + Multi-Seat Segmented Boss HP Bar */}
        <section className="d-boss-hero" aria-label={`R${number} 首领削血总览`}>
          <header className="d-boss-hero-head">
            <div className="d-boss-vis-title">
              {defeated ? <span className="d-boss-badge is-win"><Trophy size={12} />已击败首领</span>
                : <span className="d-boss-badge"><Flame size={12} />R{number} 首领战</span>}
              <span className="d-muted">
                {data.bossStatus === 'settlement' ? '已取得服务器伤害结算'
                  : data.bossEnded ? '首领阶段已结束'
                    : data.bossStatus === 'reported'
                      ? (data.bossOfficial.length ? '已同步实时伤害与官方榜单' : '实时伤害快照')
                      : data.bossOfficial.length
                        ? (hasLiveBossDamage ? '已同步实时伤害与官方榜单' : '已收到榜单，未取得服务器伤害结算')
                        : hasBreakdown ? '本端上报口径' : '等待伤害入表'}
                {data.bossRoundInferred ? ' · 回合按最近确认进度关联，等待场景校正' : ''}
              </span>
            </div>

            <div className="d-boss-kpi-strip">
              <div className="d-boss-kpi is-primary">
                <small>{solo ? '累计输出' : '全队输出'}</small>
                <b>{formatTelemetryTotal(teamTotalDamage)}</b>
              </div>
              {bossMaxHp !== null && (
                <div className="d-boss-kpi">
                  <small>首领血量</small>
                  <b>{formatTelemetryTotal(bossMaxHp)}</b>
                </div>
              )}
              {bossRemainHp !== null && (
                <div className="d-boss-kpi">
                  <small>首领剩余</small>
                  <b className={defeated ? 'is-win' : 'is-alert'}>
                    {defeated ? '已击破' : formatTelemetryTotal(bossRemainHp)}
                  </b>
                </div>
              )}
              {mvpOp && (
                <div className="d-boss-kpi is-mvp">
                  <small>主力输出</small>
                  <b>
                    {mvpOp.name}
                    <em>{shareDenom > 0 ? `${leaderDigits.format((mvpOp.damage / shareDenom) * 100)}%` : ''}</em>
                  </b>
                </div>
              )}
            </div>
          </header>

          {uplinkOnlyNoDownlink && (
            <div className="d-report-npcap-hint" role="note">
              当前未检测到 Npcap 下行（仅本端上报口径），队友昵称/头像与部分队友首领伤害可能缺失。建议安装 Npcap 后以管理员身份重启应用，将自动切换驱动通道获取完整首领战报。
            </div>
          )}

          {bossDamagePct !== null && (
            <div className="d-boss-hp-segmented">
              <div className="d-boss-hp-labels">
                <small><b className="d-prts-slash">//</b>首领削血分布（按席位归因）</small>
                <b>
                  {defeated
                    ? '100% · 已击破'
                    : `已削血 ${leaderDigits.format(bossDamagePct)}% · 剩余 ${leaderDigits.format(remainPct)}%`}
                </b>
              </div>
              <div className="d-boss-seg-track" role="img" aria-label={`首领削血 ${leaderDigits.format(bossDamagePct)}%`}>
                {hpSegments.map(seg => (
                  <span
                    key={seg.seat}
                    className="d-boss-seg-fill"
                    style={{ width: `${seg.widthPct}%`, background: seg.color }}
                    title={`${seg.label}: ${formatTelemetryTotal(seg.damage)}（削血 ${leaderDigits.format(seg.truePct)}%）`}
                  >
                    {seg.widthPct >= 14 && (
                      <em>{seg.label} {leaderDigits.format(seg.truePct)}%</em>
                    )}
                  </span>
                ))}
                {remainPct > 0 && (
                  <span className="d-boss-seg-remain" style={{ width: `${remainPct}%` }}>
                    {remainPct >= 14 && <em>剩余 {leaderDigits.format(remainPct)}%</em>}
                  </span>
                )}
              </div>
              <div className="d-boss-seg-ruler" aria-hidden="true">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>
          )}
        </section>

        {/* Tier 2: 2-Column Complementary Multi-Chart Matrix */}
        <div className="d-boss-charts-grid">
          {/* Left Panel: Precision Ring Donut + Active Breakdown + Compact Eliminated Footer */}
          <section className="d-boss-panel" aria-label={useSoloOpDonut ? '干员伤害占比环图' : '团队输出贡献环图'}>
            <header className="d-tele-subhead">
              <span><b className="d-prts-slash">//</b>{useSoloOpDonut ? '干员伤害占比' : '团队输出构成'}</span>
              <small>{useSoloOpDonut ? `${opBars.length} 名干员` : `${activeSeatRows.length} 席参战`}</small>
            </header>

            <div className="d-boss-donut-wrap">
              <BossContributionDonut
                slices={donutSlices}
                centerValue={
                  !useSoloOpDonut && teamTotalDamage > 0
                    ? formatTelemetryTotal(teamTotalDamage)
                    : defeated ? '100%'
                      : bossDamagePct !== null ? `${leaderDigits.format(bossDamagePct)}%`
                        : formatTelemetryTotal(teamTotalDamage)
                }
                centerSub={
                  !useSoloOpDonut && teamTotalDamage > 0
                    ? '全队输出'
                    : bossDamagePct !== null ? '削血进度' : '累计输出'
                }
              />

              <div className="d-boss-contrib-list">
                {useSoloOpDonut ? (
                  donutSlices.map(s => {
                    const share = opTotal > 0 ? (s.value / opTotal) * 100 : 0;
                    return (
                      <div key={s.key} className="d-boss-contrib-item">
                        <i style={{ background: s.color }} />
                        <span className="d-boss-contrib-name">{s.label}</span>
                        <b>{formatTelemetryTotal(s.value)}</b>
                        <small>{leaderDigits.format(share)}%</small>
                      </div>
                    );
                  })
                ) : (
                  activeSeatRows.map(row => {
                    const teamShare = teamTotalDamage > 0 && row.damage !== null ? (row.damage / teamTotalDamage) * 100 : null;
                    return (
                      <div key={row.seat} className="d-boss-contrib-item" data-self={row.isSelf}>
                        <i style={{ background: row.color }} />
                        <span className="d-boss-contrib-name">{seatName(row.seat, report, perspective)}</span>
                        <b>{row.damage !== null ? formatTelemetryTotal(row.damage) : '—'}</b>
                        <small>
                          {teamShare !== null ? `队 ${leaderDigits.format(teamShare)}%`
                            : row.hpPct !== null ? `血 ${leaderDigits.format(row.hpPct)}%` : '—'}
                        </small>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {!solo && deadSeatRows.length > 0 && (
              <div className="d-boss-dead-strip">
                <span className="d-boss-dead-label"><Skull size={11} />未参战</span>
                <div className="d-boss-dead-tags">
                  {deadSeatRows.map(row => (
                    <span key={row.seat} className="d-boss-dead-chip">
                      {row.label} <small>R{row.elimRound}阵亡</small>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Right Panel: Micro-Grid Ranked Operator Chart (or Seat Column Chart fallback) */}
          <section className="d-boss-panel" aria-label={opBars.length > 0 ? '参战干员首领输出排行' : '各席位首领伤害对比'}>
            {opBars.length > 0 ? (
              <>
                <header className="d-tele-subhead">
                  <span><b className="d-prts-slash">//</b>参战干员首领输出排行（Top {Math.min(10, opBars.length)}）</span>
                  <small>
                    {data.bossOfficial.length
                      ? (teamTotalDamage > opTotal * 1.01
                          ? `官方前${opBars.length}干员合计 ${formatTelemetryTotal(opTotal)}（其余席位见左侧总览）`
                          : `源自官方榜单 · 合计 ${formatTelemetryTotal(opTotal)}`)
                      : `源自本端上报 · 合计 ${formatTelemetryTotal(opTotal)}`}
                  </small>
                </header>

                <div className="d-boss-op-chart-body">
                  {opBars.slice(0, 10).map((op, idx) => {
                    const pct = shareDenom > 0 ? (op.damage / shareDenom) * 100 : 0;
                    const barW = Math.max(2.5, (op.damage / opScale.top) * 100);
                    const barColor = solo
                      ? PRTS_CHART.series[idx % PRTS_CHART.series.length]
                      : (seatColorBySeat.get(op.seat) ?? (idx === 0 ? PRTS_CHART.ochre : PRTS_CHART.blue));
                    return (
                      <div key={op.key} className="d-boss-op-row" data-top={idx === 0}>
                        <span className="d-tele-rank">#{String(idx + 1).padStart(2, '0')}</span>
                        <CompactOperatorBadge name={op.name} size={24} />
                        <span className="d-boss-op-name">
                          <strong>{op.name}</strong>
                          {!solo && (
                            <small>
                              <em className="d-seat-dot" style={{ background: barColor }} />
                              {seatDisplayText(op.seat, report)}
                            </small>
                          )}
                        </span>
                        <span className="d-boss-grid-track" aria-hidden="true">
                          {opScale.ticks.slice(1, -1).map(t => (
                            <s key={t} className="d-grid-vtick" style={{ left: `${(t / opScale.top) * 100}%` }} />
                          ))}
                          <i className="d-boss-op-fill" style={{ width: `${barW}%`, background: barColor }} />
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
                    <div className="d-boss-axis-ticks">
                      {opScale.ticks.map(t => (
                        <small key={t}>{formatAxisNumber(t)}</small>
                      ))}
                    </div>
                    <span />
                  </div>
                </div>
              </>
            ) : (
              <>
                <header className="d-tele-subhead">
                  <span><b className="d-prts-slash">//</b>各席位首领伤害柱图</span>
                  <small>合计 {formatTelemetryTotal(teamTotalDamage)}</small>
                </header>
                <BossSeatColumnSvg
                  rows={seatDamages.map(r => ({
                    seat: r.seat,
                    label: r.label,
                    damage: r.damage ?? 0,
                    color: r.color,
                    eliminated: r.eliminated,
                  }))}
                />
              </>
            )}
          </section>
        </div>
      </>
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
              <td>{hit.operatorName ? (() => {
                const clean = normalizeOperatorName(hit.operatorName) || hit.operatorName;
                return <span className="d-boss-op"><CompactOperatorBadge name={clean} size={20} /><span>{clean}</span><small className="d-muted">#{hit.identifier}</small></span>;
              })() : hit.identifier}</td>
              <td>{hit.source === null ? '—' : bossSourceLabels[hit.source] ?? '未知'}</td><td>{formatReportNumber(hit.damage)}</td>
            </tr>)}
          </tbody>
        </table></div>
      </details>
    )}
  </div>;
}
