import { useEffect, useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { readBattleReport } from './battleReportData';
import { formatTelemetryRate, formatTelemetryTotal } from './combatTelemetry';
import type { HudOverlayState } from './battleReports';
import './desktop.css';

export default function HudStripApp() {
  const hudApi = window.electronAPI?.hud;
  const [state, setState] = useState<HudOverlayState>({
    open: true,
    locked: false,
    shortcut: 'Ctrl+Shift+F10',
    shortcutAvailable: false,
    status: 'starting',
    report: null,
    guide: { round: 1, compTitle: '', paceTip: '' },
  });

  useEffect(() => {
    if (!hudApi) return;
    let mounted = true;
    const remove = hudApi.onState(next => {
      if (mounted) setState(next);
    });
    void hudApi.getState().then(next => {
      if (mounted) setState(next);
    }).catch(() => {});
    return () => {
      mounted = false;
      remove();
    };
  }, [hudApi]);

  let parsed = null;
  try {
    parsed = state.report ? readBattleReport(state.report) : null;
  } catch {
    parsed = null;
  }

  const roundNo = parsed?.current || parsed?.rounds.at(-1)?.number || state.guide.round || 1;
  const topOps = (parsed?.telemetry?.operators ?? []).filter(op => op.totalDamage > 0).slice(0, 4);
  const bossPool = parsed?.telemetry?.enemyPool?.boss;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        boxSizing: 'border-box',
        padding: '4px 6px',
        background: 'transparent',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans, "Microsoft YaHei", sans-serif)',
      }}
    >
      <section
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateRows: '28px 1fr',
          background: state.locked ? 'rgba(11, 14, 20, 0.78)' : 'rgba(13, 17, 24, 0.94)',
          border: `1px solid ${state.locked ? 'rgba(255, 230, 0, 0.35)' : '#2d3644'}`,
          borderLeft: '3px solid #ffe600',
          borderRadius: '2px',
          color: '#f1f5f9',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 8px',
            borderBottom: '1px solid rgba(45, 54, 68, 0.75)',
            WebkitAppRegion: state.locked ? 'no-drag' : 'drag',
            fontSize: '12px',
          } as React.CSSProperties}
        >
          <span
            style={{
              padding: '1px 6px',
              background: 'rgba(255, 230, 0, 0.16)',
              color: '#ffe600',
              fontFamily: 'var(--font-mono, Consolas, monospace)',
              fontWeight: 700,
              borderRadius: '2px',
            }}
          >
            {parsed?.mode === 'mode_solo_stage' ? 'SOLO' : `R${String(roundNo).padStart(2, '0')}`}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: '#cbd5e1',
              fontSize: '11.5px',
            }}
          >
            {PRODUCT_BRAND.mode === 'full' && state.guide.paceTip
              ? state.guide.paceTip
              : parsed?.difficulty || state.guide.compTitle || `${PRODUCT_BRAND.shortName} 实时算力微缩条`}
          </span>

          {state.locked ? (
            <span style={{ color: '#ffe600', fontSize: '10.5px', fontFamily: 'var(--font-mono, monospace)' }}>
              穿透已锁 · {state.shortcut}
            </span>
          ) : (
            <div style={{ display: 'inline-flex', gap: '4px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => void hudApi?.setLocked(true)}
                title={`锁定鼠标穿透（${state.shortcut} 随时解锁）`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  color: '#ffe600',
                  border: '1px solid rgba(255,230,0,0.45)',
                  background: 'rgba(255,230,0,0.1)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <Lock size={11} />穿透
              </button>
              <button
                type="button"
                onClick={() => void hudApi?.setOpen(false)}
                title="关闭微缩条"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 5px',
                  color: '#94a3b8',
                  border: '1px solid #2d3644',
                  background: '#161c26',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </header>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 10px',
            fontSize: '12px',
            overflow: 'hidden',
          }}
        >
          {topOps.length > 0 ? (
            topOps.map((op, i) => (
              <span
                key={op.charId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '4px',
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <small style={{ color: '#64748b', fontFamily: 'var(--font-mono, monospace)' }}>{i + 1}.</small>
                <strong style={{ color: '#f1f5f9', fontSize: '12px' }}>{op.name}</strong>
                <b style={{ color: '#00e5ff', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
                  {op.activeDps != null ? formatTelemetryRate(op.activeDps) : formatTelemetryTotal(op.totalDamage)}
                </b>
              </span>
            ))
          ) : bossPool ? (
            <span style={{ color: '#fca5a5', fontSize: '12px' }}>
              首领 {bossPool.name} · 剩余 {formatTelemetryTotal(bossPool.hp)} / {formatTelemetryTotal(bossPool.maxHp)}
            </span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Unlock size={12} />
              等待局内算力或回合结算数据 · 按 {state.shortcut} 切换鼠标点击穿透
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
