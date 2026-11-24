import { useEffect, useState } from 'react';
import { Lock, ShieldCheck, Swords, Unlock, X } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { readBattleReport, reportBossRounds } from './battleReportData';
import { formatTelemetryRate, formatTelemetryTotal } from './combatTelemetry';
import type { HudOverlayState } from './battleReports';
import './desktop.css';
import './battleReports.css';

interface HudOpRow {
  key: string;
  name: string;
  damage: number;
  dps: number | null;
  share: number;
}

export default function HudStripApp({ previewState }: { previewState?: HudOverlayState }) {
  const hudApi = previewState ? undefined : window.electronAPI?.hud;
  const [state, setState] = useState<HudOverlayState>(
    previewState ?? {
      open: true,
      locked: false,
      shortcut: 'Ctrl+Shift+F10',
      shortcutAvailable: false,
      status: 'starting',
      report: null,
      guide: { round: 1, compTitle: '', paceTip: '' },
    },
  );

  useEffect(() => {
    if (previewState) {
      setState(previewState);
      return;
    }
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
  }, [hudApi, previewState]);

  let parsed = null;
  try {
    parsed = state.report ? readBattleReport(state.report) : null;
  } catch {
    parsed = null;
  }

  const roundNo = parsed?.current || parsed?.rounds.at(-1)?.number || state.guide.round || 1;
  const activeRound = parsed?.rounds.find(r => r.number === roundNo) ?? parsed?.rounds.at(-1);
  const selfSeat = parsed?.self ?? (parsed?.mode.startsWith('mode_single_') ? 1 : null);
  const selfLineup = selfSeat !== null ? parsed?.lineups[selfSeat] : undefined;
  const selfHp = selfSeat !== null ? parsed?.hp[selfSeat] : undefined;
  const selfLeaks = activeRound ? (activeRound.selfLeaks ?? (selfSeat !== null ? activeRound.leaks[selfSeat] : undefined)) : undefined;
  const selfAssists = activeRound && selfSeat !== null ? activeRound.assists[selfSeat] : undefined;

  // 1. Collect per-operator DPS / damage rows for current round (or latest boss round)
  const roundTele = parsed?.telemetry?.rounds[roundNo] ?? parsed?.telemetry ?? null;
  const opRows: HudOpRow[] = [];
  if (roundTele && roundTele.operators.length > 0) {
    const valid = roundTele.operators.filter(o => o.totalDamage > 0);
    const total = valid.reduce((s, o) => s + o.totalDamage, 0);
    for (const op of valid) {
      opRows.push({
        key: `${op.seat ?? 0}:${op.charId}`,
        name: op.name,
        damage: op.totalDamage,
        dps: op.activeDps ?? op.spanDps,
        share: total > 0 ? op.totalDamage / total : 0,
      });
    }
  } else if (parsed) {
    // Fallback: extract directly from active or latest boss round's official/uplink hits
    const bossRound = [activeRound, ...reportBossRounds(parsed).map(n => parsed!.rounds.find(r => r.number === n)).reverse()]
      .find(r => r && (r.bossOfficial.length > 0 || r.bossUplinkRows.length > 0));
    if (bossRound) {
      const hits = bossRound.bossOfficial.length ? bossRound.bossOfficial : bossRound.bossUplinkRows;
      const agg = new Map<string, { name: string; damage: number }>();
      for (const h of hits) {
        if (h.damage <= 0) continue;
        const k = `${h.seat}:${h.charId || h.identifier}`;
        const prev = agg.get(k);
        const name = h.operatorName || `干员 #${h.identifier}`;
        if (!prev) agg.set(k, { name, damage: h.damage });
        else prev.damage += h.damage;
      }
      const list = [...agg.entries()].sort((a, b) => b[1].damage - a[1].damage);
      const total = list.reduce((s, [, v]) => s + v.damage, 0);
      for (const [k, v] of list) {
        opRows.push({ key: k, name: v.name, damage: v.damage, dps: null, share: total > 0 ? v.damage / total : 0 });
      }
    }
  }

  const maxOpDamage = Math.max(1, ...opRows.map(o => o.damage));
  const bossPool = parsed?.telemetry?.enemyPool?.boss;
  const fullGuideText = PRODUCT_BRAND.mode === 'full' && state.guide.paceTip
    ? state.guide.paceTip
    : parsed?.difficulty || state.guide.compTitle || '';
  const deployedOps = selfLineup?.deployed ?? [];
  const nextSpawns = parsed?.preview.filter(p => p.round === roundNo && p.kind === 'plan').slice(0, 4) ?? [];

  return (
    <div
      style={{
        width: previewState ? '440px' : '100vw',
        height: previewState ? '176px' : '100vh',
        boxSizing: 'border-box',
        padding: '3px 4px',
        background: 'transparent',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans, "Microsoft YaHei", sans-serif)',
      }}
    >
      <section
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: state.locked ? 'rgba(11, 14, 20, 0.80)' : 'rgba(12, 16, 23, 0.95)',
          border: `1px solid ${state.locked ? 'rgba(255, 230, 0, 0.4)' : '#2d3644'}`,
          borderLeft: '3px solid #ffe600',
          borderRadius: '2px',
          color: '#f1f5f9',
          overflow: 'hidden',
        }}
      >
        {/* Top Compact Drag Header (26px) */}
        <header
          style={{
            flex: 'none',
            height: '26px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 7px',
            borderBottom: '1px solid rgba(45, 54, 68, 0.75)',
            WebkitAppRegion: state.locked ? 'no-drag' : 'drag',
            fontSize: '11.5px',
          } as React.CSSProperties}
        >
          <span
            style={{
              padding: '0 5px',
              background: 'rgba(255, 230, 0, 0.16)',
              color: '#ffe600',
              fontFamily: 'var(--font-mono, Consolas, monospace)',
              fontWeight: 700,
              borderRadius: '2px',
            }}
          >
            {parsed?.mode === 'mode_solo_stage' ? 'SOLO' : `R${String(roundNo).padStart(2, '0')}`}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '11px' }}>
            {[parsed?.difficulty, state.guide.compTitle, selfLineup?.shopLevel ? `${selfLineup.shopLevel}本` : ''].filter(Boolean).join(' · ') || `${PRODUCT_BRAND.shortName} 战术悬浮条`}
          </span>

          {state.locked ? (
            <span style={{ color: '#ffe600', fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
              穿透已锁 · {state.shortcut}
            </span>
          ) : (
            <div style={{ display: 'inline-flex', gap: '4px', flexShrink: 0, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => void hudApi?.setLocked(true)}
                title={`锁定鼠标穿透（${state.shortcut} 随时解锁）`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '1px 5px',
                  fontSize: '10.5px',
                  color: '#ffe600',
                  border: '1px solid rgba(255,230,0,0.45)',
                  background: 'rgba(255,230,0,0.1)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <Lock size={10} />穿透
              </button>
              <button
                type="button"
                onClick={() => void hudApi?.setOpen(false)}
                title="关闭悬浮条"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 4px',
                  color: '#94a3b8',
                  border: '1px solid #2d3644',
                  background: '#161c26',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </header>

        {/* Unified Vertically-Scrollable Body: Full Guide Text + Compact Per-Operator DPS */}
        <div
          className="d-hud-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {fullGuideText && (
            <div
              style={{
                flex: 'none',
                padding: '5px 8px',
                borderBottom: '1px solid rgba(45, 54, 68, 0.55)',
                background: 'rgba(255, 230, 0, 0.04)',
                fontSize: '11.5px',
                lineHeight: 1.42,
                color: '#e2e8f0',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {fullGuideText}
            </div>
          )}

          <div
            style={{
              flex: '1 0 auto',
              padding: '5px 8px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3.5px',
              fontSize: '11.5px',
            }}
          >
            {opRows.length > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', fontSize: '10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#00e5ff', fontWeight: 600 }}>
                    <Swords size={10} />当回合干员输出 · {opRows.length} 人（可向下滚动）
                  </span>
                  {bossPool && (
                    <span style={{ color: '#fca5a5', fontFamily: 'var(--font-mono, monospace)' }}>
                      首领余 {formatTelemetryTotal(bossPool.hp)}
                    </span>
                  )}
                </div>
                {opRows.map((op, i) => (
                  <div
                    key={op.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5em minmax(4.5em, 6.2em) 1fr auto auto',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '18px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <small style={{ color: '#64748b', fontFamily: 'var(--font-mono, monospace)', fontSize: '10px' }}>{i + 1}.</small>
                    <strong style={{ color: '#f1f5f9', fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</strong>
                    <span style={{ height: '5px', background: '#090c12', border: '1px solid #1e2633', borderRadius: '1px', overflow: 'hidden' }}>
                      <i style={{ display: 'block', height: '100%', width: `${Math.max(6, (op.damage / maxOpDamage) * 100)}%`, background: i === 0 ? '#ffe600' : '#00e5ff' }} />
                    </span>
                    <b style={{ color: '#f8fafc', fontFamily: 'var(--font-mono, monospace)', fontSize: '11px' }}>
                      {formatTelemetryTotal(op.damage)}
                    </b>
                    <small style={{ color: '#00e5ff', fontFamily: 'var(--font-mono, monospace)', fontSize: '10.5px', minWidth: '4.4em', textAlign: 'right' }}>
                      {op.dps != null ? formatTelemetryRate(op.dps) : `${Math.round(op.share * 100)}%`}
                    </small>
                  </div>
                ))}
              </>
            ) : parsed ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', fontSize: '11px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: selfLeaks === 0 ? '#34d399' : selfLeaks ? '#f87171' : '#cbd5e1', fontWeight: 600 }}>
                    <ShieldCheck size={11} />
                    {selfLeaks === undefined ? '本回合进行中' : selfLeaks === 0 ? '本路零漏' : `本路漏 ${selfLeaks} 只`}
                  </span>
                  {!!selfAssists && <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono, monospace)' }}>兜底 +{selfAssists}</span>}
                  {selfHp !== undefined && <span style={{ color: selfHp <= 5 ? '#f87171' : '#cbd5e1', fontFamily: 'var(--font-mono, monospace)' }}>血量 {selfHp}</span>}
                  {selfLineup?.deployedCount ? <span style={{ color: '#94a3b8' }}>在场 {selfLineup.deployedCount}/{selfLineup.pieceCount}</span> : null}
                </div>
                {deployedOps.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', paddingTop: '1px' }}>
                    {deployedOps.map(u => (
                      <span key={u.instId} style={{ padding: '0 5px', fontSize: '10.5px', background: '#161d29', border: `1px solid ${u.isGolden ? 'rgba(255,230,0,0.45)' : '#253042'}`, color: u.isGolden ? '#ffe600' : '#cbd5e1', borderRadius: '2px' }}>
                        {u.name}{u.isGolden ? '★' : ''}
                      </span>
                    ))}
                  </div>
                ) : nextSpawns.length > 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '10.5px', lineHeight: 1.4 }}>
                    本波预告：{nextSpawns.map(s => `${s.name}${s.count ? `×${s.count}` : ''}`).join(' · ')}
                  </div>
                ) : (
                  <span style={{ color: '#64748b', fontSize: '10.5px' }}>
                    普通波次实时追踪中 · 进入首领战后自动展示干员输出与 DPS
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: '#94a3b8', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: 'auto', marginBottom: 'auto' }}>
                <Unlock size={11} />
                等待进入卫戍对局 · 按 {state.shortcut} 切换鼠标点击穿透
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
