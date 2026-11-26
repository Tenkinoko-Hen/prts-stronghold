// 青逝痕 Tenkinoko 制作
import { useMemo, useState } from 'react';
import { Activity, BookOpen, ChevronLeft, ChevronRight, ListTree } from 'lucide-react';
import MatchReport from './MatchReport';
import {
  MobileBossRankCard,
  MobileCaptureToggle,
  MobileEnemyIcon,
  MobileLeakEnemiesPanel,
  MobileNextWavesPanel,
  MobileSeatCards,
  resolveMobileLeakEnemies,
  resolveMobileNextTwoWaves,
  useMobileCaptureSync,
  type MobileCaptureSeat,
  type MobileCaptureWave,
} from './MobileCapturePanel';
import './telemetryMobile.css';

type LiteMobileTab = 'live' | 'waves' | 'report';

export default function TelemetryMobileApp() {
  const { capture, supported, start, stop, restart } = useMobileCaptureSync();
  const [tab, setTab] = useState<LiteMobileTab>(() => (window.PRTSCapture ? 'live' : 'report'));
  const [cumulative, setCumulative] = useState(true);
  const [selectedRound, setSelectedRound] = useState(1);

  const curRound = Math.max(1, Math.min(15, capture?.round || 1));
  const rounds = useMemo(() => capture?.rounds ?? [], [capture?.rounds]);
  const allWaves: MobileCaptureWave[] = useMemo(() => capture?.allWaves ?? [], [capture?.allWaves]);
  const nextTwoWaves: MobileCaptureWave[] = useMemo(
    () => resolveMobileNextTwoWaves(capture, curRound),
    [capture, curRound],
  );

  const effectiveRound = cumulative ? 0 : Math.max(1, Math.min(curRound, selectedRound));

  // Build active 4-player display rows (cumulative OR selected single round)
  const displaySeats: MobileCaptureSeat[] = useMemo(() => {
    const baseSeats = capture?.seats ?? [];
    if (cumulative || baseSeats.length === 0) return baseSeats;
    const roundRec = rounds.find(r => r.round === effectiveRound);
    return baseSeats.map(s => {
      const cell = roundRec?.seats.find(c => c.seat === s.seat);
      return {
        ...s,
        leaked: cell?.leaked ?? 0,
        assisted: cell?.assisted ?? 0,
        covered: cell?.covered ?? 0,
        escaped: cell?.escaped ?? 0,
      };
    });
  }, [capture?.seats, cumulative, effectiveRound, rounds]);

  const maxMetric = useMemo(
    () => Math.max(1, ...displaySeats.map(s => Math.max(s.leaked, s.assisted))),
    [displaySeats],
  );

  const leakEnemies = useMemo(
    () => resolveMobileLeakEnemies(capture, cumulative, effectiveRound, curRound),
    [capture, cumulative, effectiveRound, curRound],
  );

  const summaryTotals = useMemo(() => {
    if (cumulative) {
      return {
        leaks: capture?.leak?.cumLeaks ?? capture?.leak?.totalLeaks ?? 0,
        assisted: capture?.leak?.cumAssisted ?? capture?.leak?.assistKills ?? 0,
        escaped: capture?.leak?.cumEscaped ?? capture?.leak?.uncoveredLeaks ?? 0,
      };
    }
    const r = rounds.find(item => item.round === effectiveRound);
    return {
      leaks: r?.totalLeaks ?? 0,
      assisted: r?.totalAssisted ?? 0,
      escaped: r?.totalEscaped ?? 0,
    };
  }, [capture?.leak, cumulative, effectiveRound, rounds]);

  const boss = capture?.boss;

  const stepRound = (delta: number) => {
    if (cumulative) {
      setCumulative(false);
      setSelectedRound(curRound);
      return;
    }
    setSelectedRound(prev => Math.max(1, Math.min(curRound, prev + delta)));
  };

  return (
    <div className="mlite-root">
      {/* Main Content Area (方案 1：精简三页签 实况 / 出怪 / 战报) */}
      {tab === 'report' ? (
        <div className="mlite-body">
          {rounds.length > 0 && (
            <section className="mlite-panel" aria-label="本局回合漏兜矩阵">
              <div className="mlite-panel-head">
                <span>// 本局 R01–R{String(curRound).padStart(2, '0')} 回合汇总</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                  漏{capture?.leak?.cumLeaks ?? 0} · 兜{capture?.leak?.cumAssisted ?? 0} · 逃{capture?.leak?.cumEscaped ?? 0}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="mlite-matrix-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>回合</th>
                      {(capture?.seats ?? []).map(s => (
                        <th key={s.seat} style={{ color: s.isSelf ? '#22d3ee' : undefined }}>
                          {s.isSelf ? '我·' : ''}{s.name.slice(0, 5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...rounds].reverse().map(r => (
                      <tr key={r.round}>
                        <td style={{ textAlign: 'left', fontWeight: 800, color: r.totalEscaped > 0 ? '#ff8080' : '#cbd5e1' }}>
                          R{String(r.round).padStart(2, '0')}
                        </td>
                        {r.seats.map(cell => (
                          <td key={cell.seat}>
                            {cell.assisted === 0 && cell.leaked === 0 ? (
                              <span style={{ color: '#475569' }}>0</span>
                            ) : (
                              <span style={{ display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
                                {cell.assisted > 0 && <b style={{ color: '#67e8f9' }}>兜+{cell.assisted}</b>}
                                {cell.leaked > 0 && (
                                  <b style={{ color: cell.escaped > 0 ? '#ff8080' : '#fbbf24' }}>
                                    漏{cell.leaked}{cell.escaped > 0 ? `(逃${cell.escaped})` : ''}
                                  </b>
                                )}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <MatchReport />
        </div>
      ) : (
        <main className="mlite-body">
          <MobileCaptureToggle
            capture={capture}
            supported={supported}
            onStart={start}
            onStop={stop}
            onRestart={restart}
          />

          {tab === 'live' && (
            <>
              {/* 1. Scope Switch + High-Contrast Color Stat Pills */}
              <div className="mlite-scope-bar">
                <div className="mlite-scope-left">
                  <div className="mlite-seg" role="group" aria-label="统计范围">
                    <button
                      type="button"
                      className={cumulative ? 'is-active' : ''}
                      onClick={() => setCumulative(true)}
                    >
                      累计
                    </button>
                    <button
                      type="button"
                      className={!cumulative ? 'is-active-round' : ''}
                      onClick={() => {
                        setCumulative(false);
                        setSelectedRound(curRound);
                      }}
                    >
                      单回合
                    </button>
                  </div>
                  <div className="mlite-stepper">
                    <button type="button" onClick={() => stepRound(-1)} aria-label="上一回合">
                      <ChevronLeft size={12} />
                    </button>
                    <span>{cumulative ? `R1-${String(curRound).padStart(2, '0')}` : `R${String(effectiveRound).padStart(2, '0')}`}</span>
                    <button type="button" onClick={() => stepRound(1)} aria-label="下一回合">
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>

                <div className="mlite-top-pills">
                  <span className={`mlite-pill${summaryTotals.leaks > 0 ? ' is-leak' : ''}`}>漏 {summaryTotals.leaks}</span>
                  <span className={`mlite-pill${summaryTotals.assisted > 0 ? ' is-assist' : ''}`}>兜 {summaryTotals.assisted}</span>
                  <span className={`mlite-pill${summaryTotals.escaped > 0 ? ' is-escape' : ''}`}>
                    {summaryTotals.escaped > 0 ? `逃 ${summaryTotals.escaped}` : '零逃'}
                  </span>
                </div>
              </div>

              {/* 2. 2x2 Four-Player Dual-Track Cards (+ HP + Shop Tier + Active Covenants) */}
              {displaySeats.length > 0 ? (
                <MobileSeatCards seats={displaySeats} maxMetric={maxMetric} />
              ) : (
                <section className="mlite-panel">
                  <div className="mlite-empty">开启上方「本机实时抓包」进入对局后，自动显示 4 人双轨兜漏、本数与实时激活盟约</div>
                </section>
              )}

              {/* 2.5 Leaked Enemies Strip (本回合/累计高漏怪种) */}
              <MobileLeakEnemiesPanel
                enemies={leakEnemies}
                cumulative={cumulative}
                effectiveRound={effectiveRound}
                iconClassName="mlite-enemy-icon"
              />

              {/* 3. Next 2 Waves Forecast (未来两波怪潮预计) */}
              <MobileNextWavesPanel
                waves={nextTwoWaves}
                totalWavesCount={allWaves.length}
                onOpenAllWaves={() => setTab('waves')}
                emptyText="等待服务端同步下两波出怪清单…"
                waveIconSize={14}
                iconClassName="mlite-enemy-icon"
              />

              {/* 4. Boss MMO Ranking & DPS Card (auto-shown during Boss stage) */}
              <MobileBossRankCard boss={boss} brand="telemetry" iconClassName="mlite-enemy-icon" />
            </>
          )}

          {tab === 'waves' && (
            <section className="mlite-panel" aria-label="全波次出怪总览">
              <div className="mlite-panel-head">
                <span>// 全波次出怪总览（当前 R{String(curRound).padStart(2, '0')}）</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>已同步 {allWaves.length} 波</span>
              </div>
              {allWaves.length > 0 ? (
                allWaves.map(w => {
                  const isBoss = w.round >= 14;
                  const isCur = w.round === curRound;
                  const nextIdx = nextTwoWaves.findIndex(nw => nw.round === w.round);
                  const isPast = w.round < curRound;
                  const rowCls = isBoss
                    ? 'is-boss'
                    : isCur
                      ? 'is-cur'
                      : nextIdx === 0
                        ? 'is-next1'
                        : nextIdx === 1
                          ? 'is-next2'
                          : isPast
                            ? 'is-past'
                            : '';
                  return (
                    <div key={w.round} className={`mlite-wave-row ${rowCls}`}>
                      <span className="mlite-wave-badge">
                        {isBoss ? `R${w.round} BOSS` : nextIdx === 0 ? `▶ R${String(w.round).padStart(2, '0')}` : `R${String(w.round).padStart(2, '0')}`}
                      </span>
                      <div className="mlite-enemy-chips">
                        {w.enemies.map(e => (
                          <span key={`${w.round}-${e.id}-${e.name}`} className="mlite-enemy-chip">
                            <MobileEnemyIcon id={e.id} size={14} className="mlite-enemy-icon" />
                            <span>{e.name}</span>
                            <b>×{e.count}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="mlite-empty">尚未同步波次出怪表，进入卫戍对局后自动展开 R01–R15 怪物图标清单</div>
              )}
            </section>
          )}
        </main>
      )}

      {/* Fixed Bottom 3-Tab Navigation (方案 1：实况 / 出怪 / 战报) */}
      <nav className="mlite-bottom-nav" role="tablist" aria-label="战报仪底栏导航">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          className={tab === 'live' ? 'is-active' : ''}
          onClick={() => setTab('live')}
        >
          <Activity size={13} />实况
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'waves'}
          className={tab === 'waves' ? 'is-active' : ''}
          onClick={() => setTab('waves')}
        >
          <ListTree size={13} />出怪
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'report'}
          className={tab === 'report' ? 'is-active' : ''}
          onClick={() => setTab('report')}
        >
          <BookOpen size={13} />战报
        </button>
      </nav>
    </div>
  );
}
