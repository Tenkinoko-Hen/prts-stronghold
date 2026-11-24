import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Download, Link2, Unlink, Wifi } from 'lucide-react';
import { readBattleReport, type BattleReport } from '../desktop/battleReportData';
import { formatTelemetryRate, formatTelemetryTotal } from '../desktop/combatTelemetry';

export interface MobileLanPayload {
  seq: number;
  at: number;
  product?: string;
  productName?: string;
  status?: string;
  guide?: {
    bannedCovenants?: string[];
    currentRound?: number;
    selectedCompId?: string;
    compTitle?: string;
    paceTip?: string;
  };
  report?: unknown;
}

export interface MobileLanBridgeState {
  active: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  host: string;
  port: number;
  error: string;
  lastSyncAt: number;
  peerProduct: string;
  payload: MobileLanPayload | null;
}

declare global {
  interface Window {
    PRTSLan?: {
      getState(): string;
      connect(hostPort: string, pin: string): boolean;
      disconnect(): void;
    };
    PRTSOverlay?: {
      updateStrip(round: number, headline: string, detail: string): void;
      enterStrip(locked: boolean): void;
    };
  }
}

export function MobileLanPanel({
  onSyncGuide,
  onImportReport,
}: {
  onSyncGuide?: (data: { bannedCovenants: string[]; round: number; selectedCompId?: string }) => void;
  onImportReport?: (report: BattleReport) => void;
}) {
  const bridge = window.PRTSLan;
  const [lan, setLan] = useState<MobileLanBridgeState | null>(null);
  const [hostInput, setHostInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const lastAppliedSeq = useRef<number>(0);

  const poll = useCallback(() => {
    if (!bridge) return;
    try {
      const next = JSON.parse(bridge.getState()) as MobileLanBridgeState;
      setLan(next);
      setHostInput(prev => prev || (next.host ? `${next.host}:${next.port || 39527}` : ''));
      if (next.status === 'connected' && next.payload && next.payload.seq !== lastAppliedSeq.current) {
        lastAppliedSeq.current = next.payload.seq;
        if (onSyncGuide) {
          let reportBans: string[] = [];
          let reportRound = 0;
          try {
            if (next.payload.report) {
              const parsed = readBattleReport(next.payload.report);
              reportBans = parsed.bannedCovenants;
              reportRound = parsed.current || parsed.rounds.at(-1)?.number || 0;
            }
          } catch {}
          const bans = reportBans.length
            ? reportBans
            : (next.payload.guide?.bannedCovenants ?? []);
          const round = reportRound || next.payload.guide?.currentRound || 0;
          if (bans.length > 0 || round > 0) {
            onSyncGuide({
              bannedCovenants: bans,
              round: round || 1,
              selectedCompId: next.payload.guide?.selectedCompId,
            });
          }
        }
      }
    } catch {
      // ignore bridge parse error
    }
  }, [bridge, onSyncGuide]);

  useEffect(() => {
    if (!bridge) return;
    poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, [bridge, poll]);

  if (!bridge) return null;

  let liveReport: BattleReport | null = null;
  try {
    if (lan?.payload?.report) liveReport = readBattleReport(lan.payload.report);
  } catch {
    liveReport = null;
  }
  const topOps = (liveReport?.telemetry?.operators ?? []).filter(o => o.totalDamage > 0).slice(0, 4);
  const connected = lan?.status === 'connected';

  return (
    <section className="m-card" style={{ borderLeft: `3px solid ${connected ? '#34d399' : '#eab308'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px' }}>
          <Wifi size={15} />
          {connected ? `已连电脑副屏 · ${lan?.peerProduct || 'PC'}` : '电脑无线副屏同步'}
        </strong>
        <button
          type="button"
          className="m-text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {connected ? (expanded ? '收起设置' : '配对详情') : (expanded ? '收起' : '连接电脑')}
        </button>
      </div>

      {connected && topOps.length > 0 && (
        <div style={{ display: 'grid', gap: '4px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #26313d' }}>
          <small className="m-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Cpu size={12} />PC 实时干员算力榜（激战秒伤）
          </small>
          {topOps.map((op, i) => (
            <div key={op.charId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
              <span>{i + 1}. <strong>{op.name}</strong></span>
              <span style={{ fontFamily: 'monospace', color: '#ffe600' }}>
                {formatTelemetryTotal(op.totalDamage)}
                {op.activeDps != null ? ` (${formatTelemetryRate(op.activeDps)})` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {connected && liveReport && onImportReport && (
        <button
          type="button"
          className="m-primary m-wide"
          style={{ marginTop: '8px' }}
          onClick={() => onImportReport(liveReport!)}
        >
          <Download size={15} />同步电脑端战报至本机并可存相册
        </button>
      )}

      {(expanded || lan?.status === 'error' || lan?.status === 'connecting' || lan?.status === 'reconnecting') && (
        <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
          <p className="m-footnote" style={{ margin: 0 }}>
            在电脑端顶部点击「无线副屏」，填入电脑内网地址与 4 位配对码即可免 Root 实时同步 Ban、回合与 DPS。
          </p>
          <input
            className="m-input"
            aria-label="电脑局域网地址"
            placeholder="例如 192.168.1.10:39527"
            value={hostInput}
            onChange={e => setHostInput(e.target.value)}
          />
          <input
            className="m-input"
            aria-label="4位配对码"
            inputMode="numeric"
            maxLength={4}
            placeholder="4 位数字配对码"
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          {lan?.error && <p className="m-warning" style={{ margin: 0 }}>{lan.error}</p>}
          <div className="m-two-buttons">
            {lan?.active ? (
              <button type="button" className="m-secondary" onClick={() => { bridge.disconnect(); poll(); }}>
                <Unlink size={15} />断开副屏
              </button>
            ) : (
              <button
                type="button"
                className="m-primary"
                onClick={() => { bridge.connect(hostInput, pinInput); poll(); }}
              >
                <Link2 size={15} />配对连接
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
