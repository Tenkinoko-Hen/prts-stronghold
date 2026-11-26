// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ListTree, Radio, ShieldAlert, Square, Swords } from 'lucide-react';
import enemyPortraitsJson from '../desktop/enemyPortraits.json';
import enemyPortraitsUrl from '../desktop/enemyPortraits.webp';

const BOSS_IDS = [
  'enemy_9013_acstmk',
  'enemy_9017_achunt',
  'enemy_9021_acduml',
  'enemy_1521_dslily',
  'enemy_2016_csphtm',
  'enemy_9032_aclionk',
  'enemy_9033_acdeer',
  'enemy_9013_acstmk_2',
  'enemy_9017_achunt_2',
  'enemy_9021_acduml_2',
  'enemy_9029_acfnc',
  'enemy_9035_acspider',
  'enemy_9037_aceel',
  'enemy_9029_acfnc_2',
  'enemy_9035_acspider_2',
  'enemy_9037_aceel_2',
  'enemy_2124_dyjsfg',
] as const;

const portraitSlots = new Map(enemyPortraitsJson.ids.map((id, index) => [id, index]));
const portraitRows = Math.ceil(enemyPortraitsJson.ids.length / enemyPortraitsJson.columns);

export function resolveEnemyPortraitIndex(rawId?: string): number | undefined {
  if (!rawId) return undefined;
  const trimmed = rawId.trim();
  if (!trimmed) return undefined;
  let enemyId = trimmed;
  const bossMatch = /^boss_(\d+)$/.exec(trimmed);
  if (bossMatch) {
    const idx = Number(bossMatch[1]) - 1;
    if (idx >= 0 && idx < BOSS_IDS.length) {
      enemyId = BOSS_IDS[idx];
    }
  }
  const direct = portraitSlots.get(enemyId);
  if (direct !== undefined) return direct;
  if (enemyId.endsWith('_2') || enemyId.endsWith('_3')) {
    return portraitSlots.get(enemyId.slice(0, -2));
  }
  return undefined;
}

export function MobileEnemyIcon({
  id,
  size = 16,
  className = 'm-enemy-icon',
}: {
  id?: string;
  size?: number;
  className?: string;
}) {
  const index = resolveEnemyPortraitIndex(id);
  if (index === undefined) return null;
  const col = index % enemyPortraitsJson.columns;
  const row = Math.floor(index / enemyPortraitsJson.columns);
  return (
    <span
      className={className}
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

export interface MobileCaptureEnemy {
  id?: string;
  name: string;
  count: number;
}

export interface MobileCaptureLeak {
  round: number;
  selfLeaks?: number;
  totalLeaks: number;
  assistKills: number;
  uncoveredLeaks: number;
  cumLeaks?: number;
  cumAssisted?: number;
  cumEscaped?: number;
  summary: string;
  enemies: MobileCaptureEnemy[];
}

export interface MobileCaptureBond {
  name: string;
  count: number;
  threshold: number;
  active: boolean;
}

export interface MobileCaptureSeat {
  seat: number;
  name: string;
  isSelf: boolean;
  hp: number;
  shopLevel: number;
  leaked: number;
  assisted: number;
  covered: number;
  escaped: number;
  bonds?: MobileCaptureBond[];
}

export interface MobileCaptureRoundSummary {
  round: number;
  totalLeaks: number;
  totalAssisted: number;
  totalEscaped: number;
  seats: Array<{ seat: number; leaked: number; assisted: number; covered: number; escaped: number }>;
  enemies: MobileCaptureEnemy[];
}

export interface MobileCaptureBoss {
  enemyId: string;
  name: string;
  hp: number;
  maxHp: number;
  hpPct: number;
  teamDamage: number;
  teamDps: number;
  elapsedSec: number;
  players: Array<{
    rank: number;
    seat: number;
    name: string;
    isSelf: boolean;
    damage: number;
    dps: number;
    sharePct: number;
  }>;
}

export interface MobileCaptureLogEntry {
  seq: number;
  ts: number;
  round: number;
  kind: 'match' | 'assist' | 'escape' | 'leak' | 'tier' | 'boss' | string;
  actorSeat: number;
  actorName: string;
  targetSeat: number;
  targetName: string;
  enemyId: string;
  enemyName: string;
  count: number;
  detail: string;
}

export interface MobileCaptureWave {
  round: number;
  enemies: MobileCaptureEnemy[];
}

export interface MobileCaptureState {
  running: boolean;
  status: 'idle' | 'permission' | 'running' | 'error';
  message: string;
  packets: number;
  messages: number;
  matchSerial: number;
  round: number;
  phase: string;
  selfSeat: number;
  selfHp: number;
  bossHp: number;
  bossTotalDamage: number;
  bansConfirmed: boolean;
  bannedCovenants: string[];
  forecastRound: number;
  forecastEnemies: MobileCaptureEnemy[];
  forecastText: string;
  nextTwoWaves?: MobileCaptureWave[];
  allWaves?: MobileCaptureWave[];
  shopLevels?: Record<string, number>;
  seats?: MobileCaptureSeat[];
  rounds?: MobileCaptureRoundSummary[];
  boss?: MobileCaptureBoss;
  logSeq?: number;
  logs?: MobileCaptureLogEntry[];
  leak: MobileCaptureLeak;
  updatedAt: number;
}

declare global {
  interface Window {
    PRTSCapture?: {
      getState(): string;
      isRunning(): boolean;
      start(): void;
      stop(): void;
      restart?(): void;
      reset(): void;
    };
  }
}

export function useMobileCaptureSync(
  onAutoSync?: (data: { matchSerial: number; bansConfirmed: boolean; bannedCovenants: string[]; round: number }) => void,
) {
  const bridge = typeof window !== 'undefined' ? window.PRTSCapture : undefined;
  const [capture, setCapture] = useState<MobileCaptureState | null>(() => {
    if (!bridge) return null;
    try {
      const raw = bridge.getState();
      return raw ? (JSON.parse(raw) as MobileCaptureState) : null;
    } catch {
      return null;
    }
  });
  const lastSyncKey = useRef('');
  const lastStateFingerprint = useRef('');

  const poll = useCallback(() => {
    if (!bridge) return;
    try {
      const raw = bridge.getState();
      if (raw === lastStateFingerprint.current) return;
      lastStateFingerprint.current = raw;
      const next = JSON.parse(raw) as MobileCaptureState;
      setCapture(next);
      if (onAutoSync && next.running && (next.bansConfirmed || next.bannedCovenants?.length > 0 || next.round > 0)) {
        const key = `${next.matchSerial}|${next.bansConfirmed ? 1 : 0}|${next.round}|${(next.bannedCovenants || []).join(',')}`;
        if (key !== lastSyncKey.current) {
          lastSyncKey.current = key;
          onAutoSync({
            matchSerial: next.matchSerial || 1,
            bansConfirmed: Boolean(next.bansConfirmed),
            bannedCovenants: next.bannedCovenants || [],
            round: next.round || 0,
          });
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [bridge, onAutoSync]);

  useEffect(() => {
    if (!bridge) return;
    poll();
    const timer = window.setInterval(poll, 350);
    return () => window.clearInterval(timer);
  }, [bridge, poll]);

  const start = useCallback(() => {
    if (!bridge) return;
    bridge.start();
    poll();
  }, [bridge, poll]);

  const stop = useCallback(() => {
    if (!bridge) return;
    bridge.stop();
    poll();
  }, [bridge, poll]);

  const restart = useCallback(() => {
    if (!bridge) return;
    if (bridge.restart) bridge.restart();
    else bridge.start();
    poll();
  }, [bridge, poll]);

  return { capture, supported: Boolean(bridge), start, stop, restart, poll };
}

export function MobileCaptureToggle({
  capture,
  supported,
  onStart,
  onStop,
  onRestart,
}: {
  capture: MobileCaptureState | null;
  supported: boolean;
  onStart(): void;
  onStop(): void;
  onRestart?(): void;
}) {
  if (!supported) return null;
  const running = Boolean(capture?.running);
  const pending = capture?.status === 'permission';
  return (
    <section className={`m-capture-bar${running ? ' is-running' : ''}`}>
      <div className="m-capture-row">
        <span className="m-capture-title">
          <Radio size={13} />
          <strong>{running ? '本机抓包运行中' : '本机实时抓包'}</strong>
          <small>
            {running
              ? (capture?.bansConfirmed
                ? `✓ 已自动Ban选(${capture.bannedCovenants.length}) · ${capture.round ? `R${capture.round}` : '待开打'}`
                : capture?.round
                  ? `R${capture.round} · ${capture.messages} 帧`
                  : capture?.messages
                    ? `已收 ${capture.messages} 帧 · 等待开局 300 帧`
                    : '开局前开启自动Ban（已在1/3界面请点重扫）')
              : '免Root · 开局前开启可自动Ban/出怪/4人漏兜'}
          </small>
        </span>
        <button
          type="button"
          className={running ? 'm-secondary' : 'm-capture-start'}
          disabled={pending}
          onClick={running ? onStop : onStart}
        >
          {running ? <><Square size={12} /> 停止</> : <><Activity size={13} /> {pending ? '授权中…' : '开启'}</>}
        </button>
      </div>
      {capture?.status === 'error' && capture.message && (
        <div className="m-capture-err" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 160 }}>
            <AlertTriangle size={12} /> {capture.message}
          </span>
          <button
            type="button"
            className="m-capture-start"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 10.5 }}
            onClick={onRestart || onStart}
          >
            一键重连
          </button>
        </div>
      )}
    </section>
  );
}

export function MobileLiveWaveStrip({ capture }: { capture?: MobileCaptureState | null }) {
  const [showAllWaves, setShowAllWaves] = useState(false);
  if (!capture || !capture.running) return null;
  const forecastList = capture.forecastEnemies || [];
  const allWaves = capture.allWaves || [];
  const hasForecast = forecastList.length > 0 || Boolean(capture.forecastText);
  const leakEnemies = capture.leak?.enemies || [];
  const hasLeak = Boolean(capture.leak) && (
    (capture.leak.selfLeaks ?? 0) > 0
    || capture.leak.totalLeaks > 0
    || capture.leak.assistKills > 0
    || capture.leak.uncoveredLeaks > 0
  );
  if (!hasForecast && !hasLeak && allWaves.length === 0) return null;

  return (
    <div className="m-live-wave" aria-label="本机实时战报">
      {(hasForecast || allWaves.length > 0) && (
        <div className="m-live-row is-spawn">
          <span className="m-live-tag">
            {capture.forecastRound > capture.round ? `下波 R${capture.forecastRound}` : `本波 R${capture.forecastRound || capture.round || 1}`}
          </span>
          {forecastList.length > 0 ? (
            <div className="m-live-chips">
              {forecastList.slice(0, 6).map((enemy, idx) => (
                <span className="m-enemy-chip" key={`${enemy.id || enemy.name}-${idx}`}>
                  <MobileEnemyIcon id={enemy.id} size={16} />
                  <span>{enemy.name}</span>
                  <b>×{enemy.count}</b>
                </span>
              ))}
            </div>
          ) : (
            <span className="m-live-val">{capture.forecastText || `已同步 ${allWaves.length} 波`}</span>
          )}
          {allWaves.length > 0 && (
            <button
              type="button"
              className={`m-waves-toggle${showAllWaves ? ' is-open' : ''}`}
              onClick={() => setShowAllWaves(v => !v)}
            >
              {showAllWaves ? '收起' : `完整(${allWaves.length})`}
            </button>
          )}
        </div>
      )}
      {showAllWaves && allWaves.length > 0 && (
        <div className="m-all-waves-list" aria-label="所有波次出怪总览">
          {allWaves.map(w => {
            const isCur = w.round === capture.round;
            const isNext = w.round === capture.forecastRound && w.round > capture.round;
            const isBoss = w.round >= 14;
            const isPast = capture.round > 0 && w.round < capture.round;
            return (
              <div
                key={w.round}
                className={`m-all-wave-item${isCur ? ' is-cur' : isNext ? ' is-next' : isBoss ? ' is-boss' : ''}${isPast ? ' is-past' : ''}`}
              >
                <span className="m-all-wave-r">R{String(w.round).padStart(2, '0')}</span>
                <div className="m-live-chips">
                  {w.enemies.map((enemy, idx) => (
                    <span className={`m-enemy-chip${isBoss ? ' is-leak' : ''}`} key={`${w.round}-${enemy.id || enemy.name}-${idx}`}>
                      <MobileEnemyIcon id={enemy.id} size={14} />
                      <span>{enemy.name}</span>
                      <b>×{enemy.count}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {hasLeak && (
        <div className="m-live-row is-leak">
          <span className="m-live-tag"><ShieldAlert size={11} /> 漏兜</span>
          <div className="m-live-chips">
            {capture.leak.summary && <span className="m-live-leak-stat">{capture.leak.summary}</span>}
            {leakEnemies.slice(0, 5).map((enemy, idx) => (
              <span className="m-enemy-chip is-leak" key={`${enemy.id || enemy.name}-${idx}`}>
                <MobileEnemyIcon id={enemy.id} size={15} />
                <span>{enemy.name}</span>
                <b>×{enemy.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function clampBondCount(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(999, Math.max(0, Math.trunc(raw)));
}

export interface VisibleMobileBondsResult {
  shown: MobileCaptureBond[];
  hiddenCount: number;
  all: MobileCaptureBond[];
  title: string;
}

export function visibleMobileBonds(
  bonds: MobileCaptureBond[] | undefined,
  maxShown = 4,
): VisibleMobileBondsResult {
  const all = (bonds ?? [])
    .map(b => ({ ...b, count: clampBondCount(b.count) }))
    .filter(b => b.active);
  const limit = Math.max(0, Math.trunc(maxShown));
  const shown = all.slice(0, limit);
  const hiddenCount = Math.max(0, all.length - limit);
  const title = all
    .map(b => `${b.name} ${b.count}${b.active ? '' : b.threshold ? `/${b.threshold}（未激活）` : '（未激活）'}`)
    .join(' · ');
  return { shown, hiddenCount, all, title };
}

export function resolveMobileLeakEnemies(
  capture: MobileCaptureState | null | undefined,
  cumulative: boolean,
  effectiveRound: number,
  curRound: number,
): MobileCaptureEnemy[] {
  if (cumulative) {
    return capture?.leak?.enemies ?? [];
  }
  const roundEnemies = capture?.rounds?.find(r => r.round === effectiveRound)?.enemies;
  if (roundEnemies && roundEnemies.length > 0) {
    return roundEnemies;
  }
  return effectiveRound === curRound ? (capture?.leak?.enemies ?? []) : [];
}

export function resolveMobileNextTwoWaves(
  capture: MobileCaptureState | null | undefined,
  curRound: number,
): MobileCaptureWave[] {
  if (capture?.nextTwoWaves && capture.nextTwoWaves.length > 0) {
    return capture.nextTwoWaves;
  }
  const allWaves = capture?.allWaves ?? [];
  const upcoming = allWaves.filter(w => w.round >= curRound).slice(0, 2);
  return upcoming.length > 0 ? upcoming : allWaves.slice(-2);
}

function fmtTelemetryWan(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

export function MobileSeatCards({
  seats,
  maxMetric,
}: {
  seats: MobileCaptureSeat[];
  maxMetric: number;
}) {
  return (
    <section className="mlite-seat-grid" aria-label="4人实时兜漏与盟约态势">
      {seats.map(s => {
        const aPct = (s.assisted / maxMetric) * 100;
        const cPct = (s.covered / maxMetric) * 100;
        const ePct = (s.escaped / maxMetric) * 100;
        const bonds = visibleMobileBonds(s.bonds, 4);
        return (
          <div
            key={s.seat}
            className={`mlite-seat-card${s.isSelf ? ' is-self' : ''}${s.escaped > 0 ? ' is-escaped' : ''}`}
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

            {bonds.shown.length > 0 && (
              <div className="mlite-bonds-row" aria-label="当前盟约" title={bonds.title}>
                {bonds.shown.map(b => {
                  const tierCls = b.count >= 500 ? ' is-max' : b.count >= 100 ? ' is-high' : '';
                  const chipTitle = `${b.name} ${b.count}${b.threshold ? `/${b.threshold}` : ''}${b.active ? '（已激活）' : ''}`;
                  return (
                    <span
                      key={b.name}
                      className={`mlite-bond-chip${b.active ? ' is-active' : ''}${tierCls}`}
                      title={chipTitle}
                    >
                      {b.name}{b.count}
                    </span>
                  );
                })}
                {bonds.hiddenCount > 0 && (
                  <span className="mlite-bond-more" title={bonds.title}>
                    +{bonds.hiddenCount}
                  </span>
                )}
              </div>
            )}

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
                    <span style={{ color: '#ff8080', marginLeft: 2 }}>逃{s.escaped}</span>
                  </>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function MobileLeakEnemiesPanel({
  enemies,
  cumulative,
  effectiveRound,
  iconClassName = 'mlite-enemy-icon',
}: {
  enemies: MobileCaptureEnemy[];
  cumulative: boolean;
  effectiveRound: number;
  iconClassName?: string;
}) {
  if (enemies.length === 0) return null;
  const total = enemies.reduce((sum, e) => sum + Math.max(0, e.count || 0), 0);
  const title = cumulative
    ? `累计高漏怪种（共 ${total} 只）`
    : `R${String(effectiveRound).padStart(2, '0')} 漏怪怪种（共 ${total} 只）`;

  return (
    <section className="mlite-panel mlite-leak-panel" aria-label={title}>
      <div className="mlite-panel-head">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ShieldAlert size={12} />
          {title}
        </span>
      </div>
      <div className="mlite-enemy-chips">
        {enemies.map((e, idx) => (
          <span key={`${e.id || e.name}-${idx}`} className="mlite-enemy-chip is-leak">
            <MobileEnemyIcon id={e.id} size={15} className={iconClassName} />
            <span>{e.name}</span>
            <b>×{e.count}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

export function MobileNextWavesPanel({
  waves,
  totalWavesCount,
  onOpenAllWaves,
  emptyText,
  waveIconSize = 15,
  iconClassName = 'mlite-enemy-icon',
}: {
  waves: MobileCaptureWave[];
  totalWavesCount: number;
  onOpenAllWaves?: () => void;
  emptyText?: string;
  waveIconSize?: number;
  iconClassName?: string;
}) {
  return (
    <section className="mlite-panel" aria-label="未来两波怪潮预计">
      <div className="mlite-panel-head">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ListTree size={12} />未来两波怪潮预计
        </span>
        {onOpenAllWaves && totalWavesCount > 0 && (
          <button type="button" className="mlite-link-btn" onClick={onOpenAllWaves}>
            完整({totalWavesCount}) →
          </button>
        )}
      </div>
      {waves.length > 0 ? (
        waves.map((w, idx) => (
          <div
            key={w.round}
            className={`mlite-wave-row${w.round >= 14 ? ' is-boss' : idx === 0 ? ' is-next1' : ' is-next2'}`}
          >
            <span className="mlite-wave-badge">
              {idx === 0 ? `下波 R${String(w.round).padStart(2, '0')}` : `预 R${String(w.round).padStart(2, '0')}`}
            </span>
            <div className="mlite-enemy-chips">
              {w.enemies.map((e, eIdx) => (
                <span key={`${w.round}-${e.id || e.name}-${eIdx}`} className="mlite-enemy-chip">
                  <MobileEnemyIcon id={e.id} size={waveIconSize} className={iconClassName} />
                  <span>{e.name}</span>
                  <b>×{e.count}</b>
                </span>
              ))}
            </div>
          </div>
        ))
      ) : (
        emptyText ? <div className="mlite-empty" style={{ padding: '8px 6px' }}>{emptyText}</div> : null
      )}
    </section>
  );
}

export function MobileBossRankCard({
  boss,
  brand = 'telemetry',
  iconClassName = 'mlite-enemy-icon',
}: {
  boss?: MobileCaptureBoss | null;
  brand?: 'full' | 'telemetry';
  iconClassName?: string;
}) {
  if (!boss || (boss.teamDamage <= 0 && boss.hp < 0)) return null;
  const selfNameColor = brand === 'full' ? '#ffe600' : '#67e8f9';
  return (
    <section className="mlite-panel mlite-boss-panel" aria-label="首领实时战况">
      <div className="mlite-panel-head">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Swords size={12} />
          <MobileEnemyIcon id={boss.enemyId} size={16} className={iconClassName} />
          {boss.name} · {boss.hpPct >= 0 ? `HP ${boss.hpPct}%` : '首领战'}
        </span>
        <span className="mlite-boss-total">
          全队 {fmtTelemetryWan(boss.teamDamage)} ({fmtTelemetryWan(boss.teamDps)}/s)
        </span>
      </div>
      <div className="mlite-boss-rows">
        {boss.players.map(p => (
          <div key={p.seat} className="mlite-boss-row">
            <b style={{ color: p.rank === 1 ? '#fde047' : '#94a3b8', minWidth: 20 }}>#{p.rank}</b>
            <span className="mlite-boss-name" style={{ color: p.isSelf ? selfNameColor : '#e2e8f0' }}>
              {p.isSelf ? '我·' : ''}{p.name}
            </span>
            <b style={{ color: '#ffffff' }}>{fmtTelemetryWan(p.damage)}</b>
            <span className="mlite-boss-share">{p.sharePct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
