// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Radio, ShieldAlert, Square } from 'lucide-react';

export interface MobileCaptureEnemy {
  id?: string;
  name: string;
  count: number;
}

export interface MobileCaptureLeak {
  round: number;
  selfLeaks: number;
  totalLeaks: number;
  assistKills: number;
  uncoveredLeaks: number;
  summary: string;
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
                : capture?.round ? `R${capture.round} · ${capture.messages} 帧` : '等进局自动Ban选…')
              : '免Root · 自动Ban/出怪/漏怪'}
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
  if (!capture || !capture.running) return null;
  const hasForecast = Boolean(capture.forecastText);
  const hasLeak = Boolean(capture.leak?.summary) && (
    capture.leak.selfLeaks > 0 || capture.leak.totalLeaks > 0 || capture.leak.uncoveredLeaks > 0
  );
  if (!hasForecast && !hasLeak) return null;

  return (
    <div className="m-live-wave" aria-label="本机实时战报">
      {hasForecast && (
        <div className="m-live-row is-spawn">
          <span className="m-live-tag">
            {capture.forecastRound > capture.round ? `下回合 R${capture.forecastRound}` : `本回合 R${capture.forecastRound}`}
          </span>
          <span className="m-live-val">{capture.forecastText}</span>
        </div>
      )}
      {hasLeak && (
        <div className="m-live-row is-leak">
          <span className="m-live-tag"><ShieldAlert size={11} /> 漏怪兜底</span>
          <span className="m-live-val">{capture.leak.summary}</span>
        </div>
      )}
    </div>
  );
}
