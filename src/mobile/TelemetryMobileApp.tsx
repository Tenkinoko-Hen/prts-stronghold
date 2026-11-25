// 青逝痕 Tenkinoko 制作
import { useMemo, useState } from 'react';
import { Activity, BookOpen, Check, Copy, ListTree, Radio, Swords, Table2 } from 'lucide-react';
import enemyPortraitsJson from '../desktop/enemyPortraits.json';
import enemyPortraitsUrl from '../desktop/enemyPortraits.webp';
import MatchReport from './MatchReport';
import {
  MobileCaptureToggle,
  useMobileCaptureSync,
  type MobileCaptureLogEntry,
  type MobileCaptureSeat,
} from './MobileCapturePanel';
import './telemetryMobile.css';

type LiteMobileTab = 'live' | 'matrix' | 'archive';
type LogFilter = 'all' | 'leak' | 'assist' | 'tier';

const portraitSlots = new Map(enemyPortraitsJson.ids.map((id, idx) => [id, idx]));
const portraitRows = Math.ceil(enemyPortraitsJson.ids.length / enemyPortraitsJson.columns);

function LiteEnemyIcon({ id, size = 15 }: { id?: string; size?: number }) {
  const index = id ? portraitSlots.get(id) : undefined;
  if (index === undefined) return null;
  const col = index % enemyPortraitsJson.columns;
  const row = Math.floor(index / enemyPortraitsJson.columns);
  return (
    <span
      className="mlite-enemy-icon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${enemyPortraitsUrl})`,
        backgroundSize: `${enemyPortraitsJson.columns * 100}% ${portraitRows * 100}%`,
        backgroundPosition: `${(col * 100) / (enemyPortraitsJson.columns - 1)}% ${(row * 100) / (portraitRows - 1)}%`,
      }}
    />
  );
}

function fmtClock(ts: number): string {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtWan(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

function logKindMeta(kind: string): { label: string; color: string } {
  switch (kind) {
    case 'escape': return { label: '逃逸扣血', color: '#ff8080' };
    case 'assist': return { label: '协防兜底', color: '#67e8f9' };
    case 'leak': return { label: '本路漏出', color: '#fbbf24' };
    case 'tier': return { label: '科技升本', color: '#7dd3fc' };
    case 'boss': return { label: '首领阶段', color: '#fca5a5' };
    case 'match': return { label: '对局连接', color: '#22d3ee' };
    default: return { label: '战况记录', color: '#cbd5e1' };
  }
}

function formatLogPlainText(entry: MobileCaptureLogEntry): string {
  const meta = logKindMeta(entry.kind).label;
  const r = `R${String(Math.max(1, entry.round)).padStart(2, '0')}`;
  if (entry.kind === 'assist') {
    return `[${r} ${fmtClock(entry.ts)}] [${meta}] ${entry.actorName} 帮兜 ${entry.targetName} ${entry.enemyName || ''}`.trim();
  }
  if (entry.kind === 'escape' || entry.kind === 'leak') {
    return `[${r} ${fmtClock(entry.ts)}] [${meta}] ${entry.actorName} ${entry.enemyName || entry.detail}`.trim();
  }
  if (entry.kind === 'tier') {
    return `[${r} ${fmtClock(entry.ts)}] [${meta}] ${entry.actorName} ${entry.detail}`.trim();
  }
  return `[${r} ${fmtClock(entry.ts)}] [${meta}] ${entry.detail}${entry.enemyName ? ` · ${entry.enemyName}` : ''}`;
}

export default function TelemetryMobileApp() {
  const { capture, supported, start, stop, restart } = useMobileCaptureSync();
  const [tab, setTab] = useState<LiteMobileTab>(() => (window.PRTSCapture ? 'live' : 'archive'));
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [seatFilter, setSeatFilter] = useState<number | null>(null);
  const [showWaves, setShowWaves] = useState(false);
  const [copied, setCopied] = useState(false);

  const seats: MobileCaptureSeat[] = useMemo(() => capture?.seats ?? [], [capture?.seats]);
  const logs: MobileCaptureLogEntry[] = useMemo(() => capture?.logs ?? [], [capture?.logs]);
  const rounds = useMemo(() => capture?.rounds ?? [], [capture?.rounds]);
  const boss = capture?.boss;
  const allWaves = useMemo(() => capture?.allWaves ?? [], [capture?.allWaves]);

  const maxMetric = useMemo(
    () => Math.max(1, ...seats.map(s => Math.max(s.leaked, s.assisted))),
    [seats],
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(item => {
      if (logFilter === 'leak' && item.kind !== 'leak' && item.kind !== 'escape') return false;
      if (logFilter === 'assist' && item.kind !== 'assist') return false;
      if (logFilter === 'tier' && item.kind !== 'tier' && item.kind !== 'boss' && item.kind !== 'match') return false;
      if (seatFilter !== null && item.actorSeat !== seatFilter && item.targetSeat !== seatFilter) return false;
      return true;
    });
  }, [logFilter, logs, seatFilter]);

  const totalLeaks = capture?.leak?.cumLeaks ?? capture?.leak?.totalLeaks ?? 0;
  const totalAssisted = capture?.leak?.cumAssisted ?? capture?.leak?.assistKills ?? 0;
  const totalEscaped = capture?.leak?.cumEscaped ?? capture?.leak?.uncoveredLeaks ?? 0;

  const handleCopyLogs = async () => {
    const header = `卫戍战报仪 · R${String(capture?.round || 1).padStart(2, '0')} · 漏${totalLeaks} / 兜${totalAssisted} / 逃${totalEscaped}`;
    const seatLines = seats.map(s =>
      `${s.isSelf ? '[我]' : ''}${s.name}(♥${s.hp >= 0 ? s.hp : '—'}${s.shopLevel ? ` ${s.shopLevel}本` : ''}): 兜+${s.assisted} / 漏${s.leaked}${s.escaped ? `(逃${s.escaped})` : ''}`,
    );
    const logLines = filteredLogs.slice(0, 40).map(formatLogPlainText);
    const payload = [header, ...seatLines, '--- 实时 Logs ---', ...logLines].join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restrictions on older WebView
    }
  };

  return (
    <div className="mlite-root">
      {/* 1. Compact Electric-Cyan Telemetry Topbar */}
      <header className="mlite-topbar">
        <div className="mlite-brand">
          <span className="mlite-chip">卫戍战报仪</span>
          <span
            className={`mlite-heartbeat${capture?.running ? ' is-live' : capture?.status === 'error' ? ' is-err' : ''}`}
          >
            <Radio size={12} />
            {capture?.running
              ? `抓包中 · ${capture.round ? `R${String(capture.round).padStart(2, '0')}` : '待进局'} (${capture.messages}帧)`
              : capture?.status === 'error'
                ? '已退回游戏直连'
                : supported
                  ? '待开启抓包'
                  : '历史战报模式'}
          </span>
        </div>

        <div className="mlite-top-pills" aria-label="本局累计漏兜汇总">
          <span className={`mlite-pill${totalLeaks > 0 ? ' is-leak' : ''}`}>漏 {totalLeaks}</span>
          <span className={`mlite-pill${totalAssisted > 0 ? ' is-assist' : ''}`}>兜 {totalAssisted}</span>
          <span className={`mlite-pill${totalEscaped > 0 ? ' is-escape' : ''}`}>
            {totalEscaped > 0 ? `逃 ${totalEscaped}` : '零逃'}
          </span>
        </div>
      </header>

      {/* 2. 3-Tab Pure Telemetry Navigation */}
      <nav className="mlite-tabs" role="tablist" aria-label="战报仪视图切换">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          className={tab === 'live' ? 'is-active' : ''}
          onClick={() => setTab('live')}
        >
          <Activity size={13} />实时 Logs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'matrix'}
          className={tab === 'matrix' ? 'is-active' : ''}
          onClick={() => setTab('matrix')}
        >
          <Table2 size={13} />回合矩阵
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'archive'}
          className={tab === 'archive' ? 'is-active' : ''}
          onClick={() => setTab('archive')}
        >
          <BookOpen size={13} />战报导出 / 副屏
        </button>
      </nav>

      {/* 3. Main Content */}
      {tab === 'archive' ? (
        <MatchReport />
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
            <div className="mlite-split">
              {/* Left Column: 4-Seat Dual-Track Cards + Boss MMO Ranking + All-Waves */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <section className="mlite-panel" aria-label="4人实时兜漏态势">
                  <div className="mlite-panel-head">
                    <span>// 4人态势 {capture?.round ? `· R${String(capture.round).padStart(2, '0')}` : ''}</span>
                    {seatFilter !== null && (
                      <button
                        type="button"
                        className="mlite-copy-btn"
                        onClick={() => setSeatFilter(null)}
                      >
                        显示全员
                      </button>
                    )}
                  </div>
                  {seats.length > 0 ? (
                    <div className="mlite-seat-list">
                      {seats.map(s => {
                        const aPct = (s.assisted / maxMetric) * 100;
                        const cPct = (s.covered / maxMetric) * 100;
                        const ePct = (s.escaped / maxMetric) * 100;
                        return (
                          <div
                            key={s.seat}
                            className={`mlite-seat-card${s.isSelf ? ' is-self' : ''}${s.escaped > 0 ? ' is-escaped' : ''}${seatFilter === s.seat ? ' is-selected' : ''}`}
                            onClick={() => setSeatFilter(prev => (prev === s.seat ? null : s.seat))}
                            title="点击按该席位过滤右侧 Logs"
                          >
                            <div className="mlite-seat-top">
                              <span className="mlite-seat-name">
                                {s.isSelf && <b className="mlite-me-tag">我</b>}
                                {s.name}
                              </span>
                              <span className="mlite-hp-tier">
                                <b style={{ color: s.hp >= 0 && s.hp <= 5 ? '#ff7875' : '#34d399' }}>
                                  ♥{s.hp >= 0 ? s.hp : '—'}
                                </b>
                                {s.shopLevel > 0 && <span className="mlite-tier-badge">{s.shopLevel}本</span>}
                              </span>
                            </div>
                            <div className="mlite-track-row">
                              <span style={{ color: s.assisted > 0 ? '#00e5ff' : '#64748b' }}>兜</span>
                              <div className="mlite-track">
                                {aPct > 0 && <span style={{ width: `${aPct}%`, background: '#00e5ff' }} />}
                              </div>
                              <span className="mlite-track-num" style={{ color: s.assisted > 0 ? '#67e8f9' : '#475569' }}>
                                {s.assisted > 0 ? `+${s.assisted}` : '0'}
                              </span>
                            </div>
                            <div className="mlite-track-row">
                              <span style={{ color: s.escaped > 0 ? '#ff6b6b' : s.leaked > 0 ? '#fbbf24' : '#64748b' }}>漏</span>
                              <div className="mlite-track">
                                {cPct > 0 && <span style={{ width: `${cPct}%`, background: '#fb923c' }} />}
                                {ePct > 0 && <span style={{ width: `${ePct}%`, background: '#ff4d4f' }} />}
                              </div>
                              <span className="mlite-track-num">
                                {s.leaked === 0 ? (
                                  <span style={{ color: '#475569' }}>0</span>
                                ) : s.escaped === 0 ? (
                                  <span style={{ color: '#fbbf24' }}>{s.leaked}</span>
                                ) : (
                                  <>
                                    <span style={{ color: '#fbbf24' }}>{s.leaked}</span>
                                    <span style={{ color: '#ff8080', marginLeft: 3 }}>逃{s.escaped}</span>
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mlite-empty">开启上方本机抓包后，进入卫戍对局自动同步 4 人双轨兜漏与科技本数</div>
                  )}
                </section>

                {/* Boss MMO DPS Card */}
                {boss && (boss.teamDamage > 0 || boss.hp >= 0) && (
                  <section className="mlite-panel" style={{ borderColor: 'rgba(255,77,79,0.55)' }}>
                    <div className="mlite-panel-head" style={{ color: '#fca5a5' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Swords size={12} />
                        <LiteEnemyIcon id={boss.enemyId} size={16} />
                        {boss.name} · {boss.hpPct >= 0 ? `HP ${boss.hpPct}%` : '首领战'}
                      </span>
                      <span style={{ color: '#fde047', fontFamily: 'Consolas, monospace' }}>
                        全队 {fmtWan(boss.teamDamage)} ({fmtWan(boss.teamDps)}/s)
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {boss.players.map(p => (
                        <div key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'Consolas, monospace' }}>
                          <b style={{ color: p.rank === 1 ? '#fde047' : '#94a3b8', minWidth: 18 }}>#{p.rank}</b>
                          <span style={{ flex: 1, color: p.isSelf ? '#67e8f9' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.isSelf ? '我·' : ''}{p.name}
                          </span>
                          <b style={{ color: '#ffffff' }}>{fmtWan(p.damage)}</b>
                          <span style={{ color: '#94a3b8', minWidth: 40, textAlign: 'right' }}>{p.sharePct.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Collapsible All-Waves Schedule */}
                {allWaves.length > 0 && (
                  <section className="mlite-panel">
                    <div className="mlite-panel-head">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <ListTree size={12} />出怪波次 ({allWaves.length})
                      </span>
                      <button type="button" className="mlite-copy-btn" onClick={() => setShowWaves(v => !v)}>
                        {showWaves ? '收起' : '展开全部'}
                      </button>
                    </div>
                    {showWaves && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}>
                        {allWaves.map(w => (
                          <div key={w.round} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 10 }}>
                            <b style={{ background: w.round >= 14 ? '#ff4d4f' : '#1e293b', color: '#fff', padding: '1px 5px', borderRadius: 2, fontFamily: 'Consolas, monospace' }}>
                              R{String(w.round).padStart(2, '0')}
                            </b>
                            {w.enemies.map(e => (
                              <span key={`${w.round}-${e.id}-${e.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#111a27', padding: '1px 4px', borderRadius: 2 }}>
                                <LiteEnemyIcon id={e.id} size={13} />
                                {e.name}<b style={{ color: '#fde047' }}>×{e.count}</b>
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>

              {/* Right Column: Deduplicated Real-Time Logs Stream */}
              <section className="mlite-panel" aria-label="实时 Logs 回显流">
                <div className="mlite-panel-head" style={{ flexWrap: 'wrap' }}>
                  <span>// 实时 LOGS 回显 ({filteredLogs.length})</span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <div className="mlite-filters">
                      {([
                        ['all', '全部'],
                        ['leak', '漏逃'],
                        ['assist', '兜底'],
                        ['tier', '科技'],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={logFilter === id ? 'is-active' : ''}
                          onClick={() => setLogFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mlite-copy-btn"
                      onClick={() => void handleCopyLogs()}
                      disabled={filteredLogs.length === 0 && seats.length === 0}
                    >
                      {copied ? <><Check size={11} />已复制</> : <><Copy size={11} />复制日志</>}
                    </button>
                  </div>
                </div>

                {filteredLogs.length > 0 ? (
                  <div className="mlite-log-stream">
                    {filteredLogs.map(entry => {
                      const meta = logKindMeta(entry.kind);
                      return (
                        <article key={entry.seq} className={`mlite-log-item kind-${entry.kind}`}>
                          <div className="mlite-log-meta">
                            <strong style={{ color: meta.color }}>
                              R{String(Math.max(1, entry.round)).padStart(2, '0')} · {meta.label}
                            </strong>
                            <span>{fmtClock(entry.ts)}</span>
                          </div>
                          <div className="mlite-log-msg">
                            {entry.kind === 'assist' ? (
                              <>
                                <b style={{ color: '#67e8f9' }}>{entry.actorName}</b>
                                <span style={{ color: '#94a3b8' }}>帮兜</span>
                                {entry.targetName && <b>{entry.targetName}</b>}
                                <LiteEnemyIcon id={entry.enemyId} size={14} />
                                {entry.enemyName && <span style={{ color: '#fde047' }}>{entry.enemyName}</span>}
                              </>
                            ) : entry.kind === 'escape' || entry.kind === 'leak' ? (
                              <>
                                <b style={{ color: entry.kind === 'escape' ? '#ff8080' : '#fbbf24' }}>{entry.actorName}</b>
                                <LiteEnemyIcon id={entry.enemyId} size={14} />
                                <span>{entry.enemyName || entry.detail}</span>
                              </>
                            ) : entry.kind === 'tier' ? (
                              <>
                                <b>{entry.actorName}</b>
                                <span style={{ color: '#7dd3fc' }}>{entry.detail}</span>
                              </>
                            ) : (
                              <>
                                <LiteEnemyIcon id={entry.enemyId} size={14} />
                                <span>{entry.detail}{entry.enemyName ? ` · ${entry.enemyName}` : ''}</span>
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mlite-empty">
                    {capture?.running
                      ? '本机抓包运行中，等待对局事件推送（毫秒级去重回显，漏怪、帮兜、逃逸与升本自动上屏）…'
                      : '点击上方「开启」启动免 Root 本机抓包，亦可随时切到顶部「迷你条」在游戏内悬停查看'}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'matrix' && (
            <section className="mlite-panel" aria-label="回合漏兜矩阵">
              <div className="mlite-panel-head">
                <span>// R01–R15 回合漏兜矩阵</span>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>累计 漏{totalLeaks} · 兜{totalAssisted} · 逃{totalEscaped}</span>
              </div>
              {rounds.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="mlite-matrix-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>回合</th>
                        {seats.map(s => (
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
              ) : (
                <div className="mlite-empty">尚未捕获回合漏兜数据；进入战斗回合后自动按 R01–R15 填表</div>
              )}
            </section>
          )}
        </main>
      )}
    </div>
  );
}
