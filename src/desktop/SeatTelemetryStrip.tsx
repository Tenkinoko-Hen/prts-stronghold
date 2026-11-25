// 青逝痕 Tenkinoko 制作
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Skull } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { REPORT_SEATS, roundMetrics, type BattleReport } from './battleReportData';
import { seatDisplayText } from './BattleReportPanels';
import type { ReportSeat } from './battleReports';
import { isSoloMode } from './combatTelemetry';
import { visibleSeatCovenants } from './covenantBonds';

export interface SeatTelemetryStripProps {
  report: BattleReport;
  focusSeat: number | null;
  onSelectSeat?(seat: ReportSeat): void;
  onResetPerspective?(): void;
  layout?: 'auto-4col' | 'grid-2x2';
  compact?: boolean;
  showScopeBar?: boolean;
  title?: string;
}

export function SeatTelemetryStrip({
  report,
  focusSeat,
  onSelectSeat,
  onResetPerspective,
  layout = 'auto-4col',
  compact = false,
  showScopeBar = true,
  title,
}: SeatTelemetryStripProps) {
  const solo = isSoloMode(report.mode);
  const maxRound = Math.max(1, Math.min(15, report.current || report.rounds.at(-1)?.number || 1));
  const [cumulative, setCumulative] = useState(true);
  const [selectedRound, setSelectedRound] = useState(maxRound);

  useEffect(() => {
    if (cumulative) setSelectedRound(maxRound);
  }, [cumulative, maxRound]);

  const effectiveRound = Math.max(1, Math.min(maxRound, selectedRound));

  const { cards, maxMetric, totalLeaks, totalAssists, totalEscaped } = useMemo(() => {
    const seats = solo ? ([1] as const) : REPORT_SEATS;
    const targetRounds = cumulative
      ? report.rounds
      : report.rounds.filter(r => r.number === effectiveRound);

    const list = seats.map(s => {
      const lineup = report.lineups[s];
      const hp = report.hp[s];
      const elim = report.eliminated[s];
      let leaks = 0;
      let assists = 0;
      let escaped = 0;
      for (const r of targetRounds) {
        if (elim !== undefined && r.number > elim) continue;
        const [lk, as] = roundMetrics(r, s, report.self);
        const rLeak = lk?.value ?? 0;
        const rEsc = Math.min(rLeak, r.uncoveredLeaks[s] ?? 0);
        leaks += rLeak;
        escaped += rEsc;
        assists += as?.value ?? 0;
      }
      const covered = Math.max(0, leaks - escaped);
      const bonds = visibleSeatCovenants(lineup, report.deckPool, compact ? 3 : 4);
      return {
        seat: s,
        label: seatDisplayText(s, report),
        isSelf: report.self === s,
        isFocus: focusSeat === s,
        hp,
        shopLevel: lineup?.shopLevel ?? null,
        elim,
        eliminated: elim !== undefined,
        leaks,
        covered,
        escaped,
        assists,
        bonds,
      };
    });

    const maxM = Math.max(1, ...list.map(c => Math.max(c.leaks, c.assists)));
    return {
      cards: list,
      maxMetric: maxM,
      totalLeaks: list.reduce((sum, c) => sum + c.leaks, 0),
      totalAssists: list.reduce((sum, c) => sum + c.assists, 0),
      totalEscaped: list.reduce((sum, c) => sum + c.escaped, 0),
    };
  }, [compact, cumulative, effectiveRound, focusSeat, report, solo]);

  const stepRound = (delta: number) => {
    if (cumulative) {
      setCumulative(false);
      setSelectedRound(maxRound);
      return;
    }
    setSelectedRound(prev => Math.max(1, Math.min(maxRound, prev + delta)));
  };

  const isLiteBrand = PRODUCT_BRAND.mode === 'telemetry';

  return (
    <section
      className="d-unified-seats"
      data-layout={solo ? 'solo' : layout}
      data-compact={compact}
      data-brand={isLiteBrand ? 'lite' : 'full'}
      aria-label={solo ? '单兵实时态势' : '四席实时态势'}
    >
      {showScopeBar && (
        <header className="d-unified-seats-bar">
          <div className="d-unified-seats-left">
            {title && (
              <span className="d-unified-seats-title">
                <b className="d-unified-slash">//</b>
                {title}
              </span>
            )}
            <div className="d-unified-seg" role="group" aria-label="漏兜统计范围">
              <button
                type="button"
                data-active={cumulative}
                onClick={() => setCumulative(true)}
              >
                累计
              </button>
              <button
                type="button"
                data-active-round={!cumulative}
                onClick={() => {
                  setCumulative(false);
                  setSelectedRound(maxRound);
                }}
              >
                单回合
              </button>
            </div>
            <div className="d-unified-stepper">
              <button type="button" onClick={() => stepRound(-1)} aria-label="上一回合" title="上一回合">
                <ChevronLeft size={12} />
              </button>
              <span>{cumulative ? `R1-${String(maxRound).padStart(2, '0')}` : `R${String(effectiveRound).padStart(2, '0')}`}</span>
              <button type="button" onClick={() => stepRound(1)} aria-label="下一回合" title="下一回合">
                <ChevronRight size={12} />
              </button>
            </div>
            {onResetPerspective && focusSeat !== null && focusSeat !== report.self && !solo && (
              <button type="button" className="d-unified-reset-btn" onClick={onResetPerspective}>
                回自己视角
              </button>
            )}
          </div>

          {!solo && (
            <div className="d-unified-pills" aria-label="队伍漏兜汇总">
              <span className="d-unified-pill" data-tone={totalLeaks > 0 ? 'leak' : 'muted'}>
                漏 {totalLeaks}
              </span>
              <span className="d-unified-pill" data-tone={totalAssists > 0 ? 'assist' : 'muted'}>
                兜 {totalAssists}
              </span>
              <span className="d-unified-pill" data-tone={totalEscaped > 0 ? 'escape' : 'muted'}>
                {totalEscaped > 0 ? `逃 ${totalEscaped}` : '零逃'}
              </span>
            </div>
          )}
        </header>
      )}

      <div className="d-unified-seats-grid">
        {cards.map(card => {
          const assistPct = (card.assists / maxMetric) * 100;
          const coveredPct = (card.covered / maxMetric) * 100;
          const escapedPct = (card.escaped / maxMetric) * 100;
          const interactive = Boolean(onSelectSeat && !solo);
          const Tag = interactive ? 'button' : 'div';
          return (
            <Tag
              key={card.seat}
              {...(interactive ? { type: 'button' as const, onClick: () => onSelectSeat?.(card.seat) } : {})}
              className="d-unified-seat-card"
              data-self={card.isSelf}
              data-focus={card.isFocus}
              data-escaped={card.escaped > 0 && !card.eliminated}
              data-eliminated={card.eliminated}
              title={interactive ? '点击切换主视角席位' : undefined}
            >
              <div className="d-unified-seat-top">
                <span className="d-unified-seat-ident">
                  {card.isSelf && <b className="d-unified-me-tag">我</b>}
                  {!card.isSelf && card.isFocus && <b className="d-unified-view-tag">视角</b>}
                  <span className="d-unified-seat-name">{card.label}</span>
                </span>
                <span className="d-unified-seat-meta">
                  {card.eliminated ? (
                    <span className="d-unified-elim-tag">
                      <Skull size={11} />R{card.elim}淘汰
                    </span>
                  ) : (
                    <>
                      <span className="d-unified-hp" data-low={(card.hp ?? 99) <= 5}>
                        <Heart size={10} />
                        <b>{card.hp ?? '—'}</b>
                      </span>
                      <span className="d-unified-tier-chip">
                        {card.shopLevel ? `${card.shopLevel}本` : '—'}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {!card.eliminated && card.bonds.shown.length > 0 && (
                <div className="d-unified-bonds" aria-label="当前激活盟约">
                  {card.bonds.shown.map(b => (
                    <span
                      key={b.name}
                      className="d-unified-bond-chip"
                      data-active={b.active}
                      title={`${b.name} ${b.count}/${b.threshold}${b.active ? '（已激活）' : ''}`}
                    >
                      {compact ? b.shortName : b.name}{b.count}
                    </span>
                  ))}
                  {card.bonds.hiddenCount > 0 && (
                    <span className="d-unified-bond-more">+{card.bonds.hiddenCount}</span>
                  )}
                </div>
              )}

              {card.eliminated ? (
                <div className="d-unified-recycled">持卡已回流共享池</div>
              ) : (
                <div className="d-unified-bars">
                  <div className="d-unified-bar-row">
                    <span className="d-unified-bar-tag" data-tone={card.assists > 0 ? 'assist' : undefined}>兜</span>
                    <span className="d-unified-bar-track">
                      {assistPct > 0 && <i className="is-assist" style={{ width: `${assistPct}%` }} />}
                    </span>
                    <b className="d-unified-bar-val" data-tone={card.assists > 0 ? 'assist' : undefined}>
                      {card.assists > 0 ? `+${card.assists}` : '0'}
                    </b>
                  </div>
                  <div className="d-unified-bar-row">
                    <span className="d-unified-bar-tag" data-tone={card.escaped > 0 ? 'escape' : card.leaks > 0 ? 'leak' : undefined}>漏</span>
                    <span className="d-unified-bar-track">
                      {coveredPct > 0 && <i className="is-covered" style={{ width: `${coveredPct}%` }} />}
                      {escapedPct > 0 && <i className="is-escaped" style={{ width: `${escapedPct}%` }} />}
                    </span>
                    <b className="d-unified-bar-val" data-tone={card.escaped > 0 ? 'escape' : card.leaks > 0 ? 'leak' : undefined}>
                      {card.leaks === 0 ? '0' : card.escaped > 0 ? `${card.leaks} 逃${card.escaped}` : `${card.leaks}`}
                    </b>
                  </div>
                </div>
              )}
            </Tag>
          );
        })}
      </div>
    </section>
  );
}
