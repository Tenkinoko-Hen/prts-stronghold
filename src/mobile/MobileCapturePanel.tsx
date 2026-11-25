// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Radio, ShieldAlert, Square } from 'lucide-react';
import enemyPortraitsJson from '../desktop/enemyPortraits.json';
import enemyPortraitsUrl from '../desktop/enemyPortraits.webp';

const portraitSlots = new Map(enemyPortraitsJson.ids.map((id, index) => [id, index]));
const portraitRows = Math.ceil(enemyPortraitsJson.ids.length / enemyPortraitsJson.columns);

function MobileEnemyIcon({ id, size = 16 }: { id?: string; size?: number }) {
  const index = id ? portraitSlots.get(id) : undefined;
  if (index === undefined) return null;
  const col = index % enemyPortraitsJson.columns;
  const row = Math.floor(index / enemyPortraitsJson.columns);
  return (
    <span
      className="m-enemy-icon"
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
  summary: string;
  enemies: MobileCaptureEnemy[];
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
  allWaves?: MobileCaptureWave[];
  shopLevels?: Record<string, number>;
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
      reset(): void;
    };
  }
}

export function useMobileCaptureSync(
  onAutoSync?: (data: { matchSerial: number; bansConfirmed: boolean; bannedCovenants: string[]; round: number }) => void,
) {
  const bridge = window.PRTSCapture;
  const [capture, setCapture] = useState<MobileCaptureState | null>(null);
  const lastSyncKey = useRef('');

  const poll = useCallback(() => {
    if (!bridge) return;
    try {
      const next = JSON.parse(bridge.getState()) as MobileCaptureState;
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
    const timer = window.setInterval(poll, 900);
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

  return { capture, supported: Boolean(bridge), start, stop, poll };
}

export function MobileCaptureToggle({
  capture,
  supported,
  onStart,
  onStop,
}: {
  capture: MobileCaptureState | null;
  supported: boolean;
  onStart(): void;
  onStop(): void;
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
        <p className="m-capture-err"><AlertTriangle size={12} /> {capture.message}</p>
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
