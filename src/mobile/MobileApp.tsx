// 青逝痕 Tenkinoko 制作
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Crosshair, RotateCcw, ShieldBan, Star, Wifi, X } from 'lucide-react';
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES, BAN_SENSITIVE_OPERATORS, META_COMPS } from '../data/strongholdData';
import { getRecommendedPaceForRound, rankCompsByBanState } from '../utils/tacticalLogic';
import { MOBILE_FAVORITES_KEY, MOBILE_SESSION_KEY, mobileReducer, restoreFavorites, restoreSession, toggleFavoriteId } from './mobileSession';
import { MobileReference } from './MobileReference';
import { CovenantScanner, useCovenantScanner } from './CovenantScanner';
import type { CovenantScan } from './covenantScan';
import { MobileGuide } from './MobileGuide';
import MatchReport from './MatchReport';
import { isSecondScreenActive, MobileLanPanel, useMobileLanSync } from './MobileLanPanel';
import { MobileCaptureToggle, useMobileCaptureSync } from './MobileCapturePanel';
import { MobileSecondScreen } from './MobileSecondScreen';
import type { RoundSyncProgress } from './RoundSync';
import { StrategyBadge } from '../components/StrategyBadge';
import { OperatorAvatar } from '../components/OperatorAvatar';
import { summarizeBlockedReasons } from '../components/guidePresentation';
import './mobile.css';
import './telemetryMobile.css';

export default function MobileApp() {
  const [session, dispatch] = useReducer(mobileReducer, null, () => {
    try { return restoreSession(localStorage.getItem(MOBILE_SESSION_KEY)); } catch { return restoreSession(null); }
  });
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return restoreFavorites(localStorage.getItem(MOBILE_FAVORITES_KEY)); } catch { return []; }
  });
  const [storageError, setStorageError] = useState(false);
  const [operatorQuery, setOperatorQuery] = useState('');
  const [difficulty, setDifficulty] = useState('全部');
  const [image, setImage] = useState<{ url: string; title: string } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [resetPrompt, setResetPrompt] = useState(false);
  const [help, setHelp] = useState(false);
  const [lanModal, setLanModal] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [reportCum, setReportCum] = useState(true);
  const [reportRound, setReportRound] = useState(1);
  const overlay = new URLSearchParams(window.location.search).get('overlay') === '1';
  const scrollRef = useRef<HTMLElement>(null);
  const roundSyncProgress = useRef<RoundSyncProgress>({ id: '', handled: '', synchronized: false, pending: null });
  const comp = META_COMPS.find(item => item.id === session.compId);
  const round = comp ? session.rounds[comp.id] || 1 : 1;
  const favSet = useMemo(() => new Set(favorites), [favorites]);
  const ranked = rankCompsByBanState(META_COMPS, session.bans);
  const available = useMemo(() => {
    const viable = ranked.filter(item => item.status !== 'blocked');
    return [...viable].sort((a, b) => Number(favSet.has(b.comp.id)) - Number(favSet.has(a.comp.id)));
  }, [ranked, favSet]);
  const filtered = available.filter(item => {
    if (difficulty === '全部') return true;
    if (difficulty === '已收藏') return favSet.has(item.comp.id);
    return item.comp.difficulty === difficulty;
  });
  const blocked = ranked.filter(item => item.status === 'blocked');
  const banCount = session.bans.bannedCovenants.length + session.bans.bannedOperators.length;
  const toggleFavorite = (id: string) => setFavorites(prev => toggleFavoriteId(prev, id));
  const manualRound = (value: number) => { window.PRTSRound?.pause(); dispatch({ type: 'round', round: value }); };
  const openImage = (url: string, title: string) => { setZoom(100); setImage({ url, title }); };
  const resetRoundSync = useCallback(() => {
    window.PRTSRound?.stop();
    roundSyncProgress.current = { id: '', handled: '', synchronized: false, pending: null };
  }, []);
  const applyScan = useCallback((scan: CovenantScan) => {
    if (scan.status === 'ready') {
      resetRoundSync();
      setResetPrompt(false);
      setHelp(false);
      setImage(null);
    }
    dispatch({ type: 'applyScan', scan });
    setCorrecting(false);
  }, [resetRoundSync]);
  const scanner = useCovenantScanner(session.scanId, applyScan);
  const handleLanSync = useCallback((data: { bannedCovenants: string[]; round: number; selectedCompId?: string }) => {
    dispatch({ type: 'applyLanSync', ...data });
  }, []);
  const handleCaptureSync = useCallback((data: { matchSerial: number; bansConfirmed: boolean; bannedCovenants: string[]; round: number }) => {
    dispatch({ type: 'applyCaptureSync', ...data });
  }, []);
  const lanSync = useMobileLanSync(handleLanSync);
  const captureSync = useMobileCaptureSync(handleCaptureSync);
  const secondScreenOn = isSecondScreenActive(lanSync.lan);
  useEffect(() => {
    window.PRTSDisplay?.setSecondScreenMode(secondScreenOn);
  }, [secondScreenOn]);
  const startNewMatch = () => {
    window.PRTSScan?.reset();
    resetRoundSync();
    dispatch({ type: 'newMatch' });
    setResetPrompt(false);
  };

  useEffect(() => {
    try { localStorage.setItem(MOBILE_SESSION_KEY, JSON.stringify(session)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [session]);
  useEffect(() => {
    try { localStorage.setItem(MOBILE_FAVORITES_KEY, JSON.stringify(favorites)); } catch {}
  }, [favorites]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [session.step, session.compId]);

  // 悬浮窗按需获取输入焦点：仅在聚焦输入框时弹出软键盘，平时保持 FLAG_NOT_FOCUSABLE 不抢游戏触控
  useEffect(() => {
    if (!overlay || !window.PRTSOverlay?.setFocusable) return;
    let blurTimer: number | null = null;
    const isTextInput = (el: EventTarget | null) =>
      el instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(el.type)
      || el instanceof HTMLTextAreaElement;
    const onFocusIn = (ev: FocusEvent) => {
      if (isTextInput(ev.target)) {
        if (blurTimer !== null) { window.clearTimeout(blurTimer); blurTimer = null; }
        window.PRTSOverlay?.setFocusable?.(true);
      }
    };
    const onFocusOut = () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        blurTimer = null;
        if (!isTextInput(document.activeElement)) {
          window.PRTSOverlay?.setFocusable?.(false);
        }
      }, 90);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.PRTSOverlay?.setFocusable?.(false);
    };
  }, [overlay]);

  // 悬浮窗从球/条重新展开时自动关闭陈旧的大图弹窗；监听战术迷你条的 ◀ ▶ 回合步进
  useEffect(() => {
    const onExpanded = () => setImage(null);
    const onStripRound = (ev: Event) => {
      const next = Number((ev as CustomEvent).detail);
      if (Number.isFinite(next) && next >= 1 && next <= 15) {
        window.PRTSRound?.pause();
        dispatch({ type: 'round', round: Math.trunc(next) });
      }
    };
    window.addEventListener('prts-overlay-expanded', onExpanded);
    window.addEventListener('prts-strip-round', onStripRound);
    return () => {
      window.removeEventListener('prts-overlay-expanded', onExpanded);
      window.removeEventListener('prts-strip-round', onStripRound);
    };
  }, []);

  const banButtons = (names: readonly string[], group: 'bannedCovenants' | 'bannedOperators') => <div className="m-ban-grid">
    {names.map(name => <button key={name} aria-pressed={session.bans[group].includes(name)}
      className={`m-ban ${session.bans[group].includes(name) ? 'is-banned' : ''}`}
      onClick={() => dispatch({ type: 'ban', group, name })}>
      <span>{name}</span><span className="m-ban-mark">{session.bans[group].includes(name) ? '受限' : group === 'bannedCovenants' && session.scanId && !session.confirmedCovenants?.includes(name) ? '未确认' : '可用'}</span>
    </button>)}
  </div>;

  const guiding = session.step === 'guide' && Boolean(comp);
  if (secondScreenOn && lanSync.lan) {
    return (
      <MobileSecondScreen
        lan={lanSync.lan}
        onDisconnect={lanSync.disconnect}
        productMode={lanSync.lan.payload?.product === 'telemetry' ? 'telemetry' : 'full'}
      />
    );
  }
  return <div className={`mobile-app ${overlay ? 'is-overlay' : ''}${guiding ? ' is-guiding' : ''}`}>
    {!guiding && <header className="m-workbar"><strong>{session.step === 'ban' ? '识别与推荐' : session.step === 'plans' ? '选择方案' : session.step === 'report' ? '局内战报与导出' : '随行资料库'}</strong>
      {overlay && lanSync.supported && <button className={`m-icon-button m-lan-trigger${lanSync.lan?.status === 'connected' ? ' is-connected' : ''}`} aria-label="无线副屏配对" title="无线副屏配对" onClick={() => setLanModal(true)}><Wifi size={16} /></button>}
      <button className="m-icon-button" aria-label="开始新局" title="开始新局" onClick={() => setResetPrompt(true)}><RotateCcw size={16} /></button><button className="m-icon-button" aria-label="使用帮助" onClick={() => setHelp(true)}><CircleHelp size={17} /></button>
    </header>}
    {storageError && <p role="alert" className="m-warning">本机未能保存进度，关闭前请记下当前回合。</p>}
    <main className={`m-scroll ${session.step === 'guide' ? 'is-guide' : session.step === 'ban' ? 'is-scan' : ''}`} ref={scrollRef}>
      {session.step === 'ban' && <div className="m-scan-layout"><section className="m-scan-controls" aria-label="识别与校正">
        <CovenantScanner appliedId={session.scanId} scanner={scanner} />
        <MobileCaptureToggle
          capture={captureSync.capture}
          supported={captureSync.supported}
          onStart={captureSync.start}
          onStop={captureSync.stop}
          onRestart={captureSync.restart}
        />
        {!overlay && <MobileLanPanel
          sharedLan={lanSync.lan}
          onConnect={lanSync.connect}
          onDisconnect={lanSync.disconnect}
        />}
        <div className="m-ban-result"><div className="m-result-heading"><strong>{session.scanComplete ? '26 项已确认' : session.scanId ? `已确认 ${session.confirmedCovenants?.length || 0}/26` : '本局条件'} · {session.bans.bannedCovenants.length} 项受限</strong><button className="m-text-button" aria-expanded={correcting} onClick={() => setCorrecting(true)}>补录 / 校正</button></div>
          <div className="m-restricted-chips">{session.bans.bannedCovenants.map(name => <button key={name} onClick={() => dispatch({ type: 'ban', group: 'bannedCovenants', name })} aria-label={`将${name}改为可用`}>{name}<X size={12} /></button>)}</div>
        </div>
        {session.scanComplete === false && <p className="m-warning">仍有 {26 - (session.confirmedCovenants?.length || 0)} 项未确认，以下仅为候选，请补录或重新识别。</p>}
        <dialog className="m-correction-dialog" ref={element => { if (!element) return; if (correcting && !element.open) element.showModal(); else if (!correcting && element.open) element.close(); }} onClose={() => setCorrecting(false)} aria-label="核对盟约与干员">
        <header><strong>核对盟约与干员 · {banCount} 项受限</strong><button className="m-icon-button" aria-label="关闭校正" onClick={() => setCorrecting(false)}><X size={16} /></button></header>
        <div className="m-correction-content">
        <div className="m-ban-sections"><section className="m-card"><h2>核心盟约 <small>10</small></h2>{banButtons(ALL_CORE_COVENANT_NAMES, 'bannedCovenants')}</section>
        <section className="m-card"><h2>附加盟约 <small>16</small></h2>{banButtons(ALL_SUB_COVENANT_NAMES, 'bannedCovenants')}<p className="m-footnote">附加盟约被 Ban 时仍需核对存活干员与转职，推荐会保留可调整的方案。</p></section>
        </div>
        <details className="m-card"><summary>核心干员 <span>{session.bans.bannedOperators.length} 项已禁</span><ChevronDown size={16} /></summary>
          <input className="m-input" aria-label="搜索核心干员" placeholder="搜索干员" value={operatorQuery} onChange={e => setOperatorQuery(e.target.value)} />
          {banButtons(BAN_SENSITIVE_OPERATORS.filter(op => op.name.includes(operatorQuery.trim())).map(op => op.name), 'bannedOperators')}
        </details>
        {banCount > 0 && <button className="m-text-button" onClick={() => { window.PRTSScan?.reset(); dispatch({ type: 'clearBans' }); }}>清空 Ban 选择</button>}
        </div></dialog>
        </section><section className="m-recommendations" aria-label="本局推荐方案">
        <div className="m-quick-plans">{available.slice(0, 2).map(({ comp: item, statusLabel, blockedReasons }, index) => {
          const isFav = favSet.has(item.id);
          return <div key={item.id} className={`m-quick-plan-row ${index === 0 ? 'is-first' : ''}${isFav ? ' is-fav' : ''}`}>
            <button className="m-quick-plan" onClick={() => dispatch({ type: 'choose', id: item.id })}>
              <span className={`m-quick-rank${isFav ? ' is-fav' : ''}`}>{isFav ? '★收藏' : session.scanComplete ? (index === 0 ? '首选' : '备选') : '候选'}</span>
              <span><strong title={item.title}>{item.title}</strong><StrategyBadge text={item.strategist} /><small>{summarizeBlockedReasons(blockedReasons, statusLabel)} · {item.difficulty}</small></span>
              <ArrowRight size={17} />
            </button>
            <button type="button" className={`m-star-btn${isFav ? ' is-active' : ''}`} aria-pressed={isFav} aria-label={isFav ? `取消收藏 ${item.title}` : `收藏 ${item.title}`} title={isFav ? '取消收藏' : '收藏并置顶'} onClick={() => toggleFavorite(item.id)}>
              <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
            </button>
          </div>;
        })}</div>
        {available.length === 0 && <p className="m-notice">当前条件没有可用方案，可校正条件或查看全部方案中的受限说明。</p>}
        <button className="m-text-button m-wide" onClick={() => dispatch({ type: 'step', step: 'plans' })}>查看全部方案 · {available.length} 套候选 <ArrowRight size={16} /></button>
        </section></div>}

      {session.step === 'plans' && <>
        <div className="m-plans-compact-bar">
          <button className="m-compact-back" onClick={() => dispatch({ type: 'step', step: 'ban' })}><ArrowLeft size={13} /> 校正({banCount}禁)</button>
          <span className="m-compact-count">可用 {available.length} 套</span>
          <div className="m-chips m-chips-compact" aria-label="阵容难度">
            {([
              ['全部', '全部'],
              ['已收藏', favorites.length > 0 ? `★${favorites.length}` : '★收藏'],
              ['新手轮椅', '新手'],
              ['进阶公式', '进阶'],
              ['高难上限', '高难'],
            ] as const).map(([key, label]) => (
              <button key={key} aria-pressed={difficulty === key} onClick={() => setDifficulty(key)}>{label}</button>
            ))}
          </div>
        </div>
        {session.scanComplete === false && <p className="m-warning">本次盟约尚未读全，以下为候选方案。</p>}
        {filtered.length === 0 && <div className="m-card"><h2>{difficulty === '已收藏' ? '还没有可用的收藏阵容' : '暂无符合条件的方案'}</h2><p>{difficulty === '已收藏' ? '点击任意方案右上角星标即可收藏并置顶。' : '可以修改 Ban 或切回全部难度。'}</p></div>}
        <div className="m-plan-grid m-plan-grid-compact">{filtered.map(({ comp: item, score, statusLabel, blockedReasons, pivotAdvice }, index) => {
          const mainPhase = getRecommendedPaceForRound(item, 15).activePhaseName;
          const previewOps = item.phases.find(phase => phase.phaseName === mainPhase)?.fieldOperators || [];
          const isFav = favSet.has(item.id);
          const resumedRound = session.rounds[item.id];
          return <article
            className={`m-card m-plan m-plan-compact${isFav ? ' is-fav' : ''}${session.compId === item.id ? ' is-selected' : ''}`}
            key={item.id}
            onClick={(ev) => {
              if ((ev.target as HTMLElement).closest('button,details,summary')) return;
              dispatch({ type: 'choose', id: item.id });
            }}
          >
            <div className="m-plan-toprow">
              <span className="m-plan-rank">{String(index + 1).padStart(2, '0')}</span>
              <h2 className="m-plan-title" title={item.title}>{item.title}</h2>
              <strong className="m-plan-score">{score}</strong>
              <button type="button" className={`m-star-btn m-star-sm${isFav ? ' is-active' : ''}`} aria-pressed={isFav} aria-label={isFav ? `取消收藏 ${item.title}` : `收藏 ${item.title}`} title={isFav ? '取消收藏' : '收藏并置顶'} onClick={() => toggleFavorite(item.id)}>
                <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
              </button>
              <button type="button" className="m-plan-go" aria-label={`选择方案 ${item.title}`} onClick={() => dispatch({ type: 'choose', id: item.id })}>
                {resumedRound ? `R${resumedRound}` : '跟打'}<ArrowRight size={12} />
              </button>
            </div>
            <div className="m-plan-subrow">
              <StrategyBadge text={item.strategist} />
              <span className="m-plan-diff">{item.difficulty}</span>
              <div className="m-tags m-tags-compact">{item.covenants.map(cov => <span key={cov}>{cov}</span>)}</div>
            </div>
            <div className="m-plan-avatars m-plan-avatars-compact" aria-label="主阵容预览">
              {previewOps.map((op, i) => <OperatorAvatar key={`${op.name}-${i}`} name={op.name} tier={op.tier} size="sm" />)}
            </div>
            {blockedReasons.length > 0 && <details className="m-notice m-notice-compact"><summary>{summarizeBlockedReasons(blockedReasons, statusLabel)}</summary><ul>{blockedReasons.map(line => <li key={line}>{line}</li>)}</ul><p>{pivotAdvice}</p></details>}
          </article>;
        })}</div>
        {blocked.length > 0 && <details className="m-card m-blocked-fold"><summary>受限方案 <span>{blocked.length} 套</span><ChevronDown size={15} /></summary>{blocked.map(item => <div className="m-blocked" key={item.comp.id}><h3>{item.comp.title}</h3><ul>{item.blockedReasons.map(line => <li key={line}>{line}</li>)}</ul><p>{item.pivotAdvice}</p><button className="m-secondary m-wide" onClick={() => dispatch({ type: 'choose', id: item.comp.id })}>查看攻略与限制</button></div>)}</details>}
      </>}

      {guiding && comp && <>
        {!overlay && <MobileLanPanel
          sharedLan={lanSync.lan}
          onConnect={lanSync.connect}
          onDisconnect={lanSync.disconnect}
        />}
        <MobileGuide
          comp={comp}
          round={round}
          bans={session.bans}
          ownedMap={session.ownedOperators?.[comp.id] || {}}
          liveCapture={captureSync.capture}
          roundSyncProgress={roundSyncProgress}
          onRound={value => dispatch({ type: 'round', round: value })}
          onToggleOwned={name => dispatch({ type: 'toggleOwned', compId: comp.id, name })}
          onClearOwned={() => dispatch({ type: 'clearOwned', compId: comp.id })}
          onBack={() => dispatch({ type: 'step', step: 'plans' })}
          onOpenImage={openImage}
        />
      </>}
      {session.step === 'report' && (() => {
        const cap = captureSync.capture;
        const capRound = Math.max(1, Math.min(15, cap?.round || round || 1));
        const capRounds = cap?.rounds ?? [];
        const effRound = reportCum ? 0 : Math.max(1, Math.min(capRound, reportRound));
        const baseSeats = cap?.seats ?? [];
        const dispSeats = reportCum || baseSeats.length === 0
          ? baseSeats
          : baseSeats.map(s => {
              const cell = capRounds.find(r => r.round === effRound)?.seats.find(c => c.seat === s.seat);
              return {
                ...s,
                leaked: cell?.leaked ?? 0,
                assisted: cell?.assisted ?? 0,
                covered: cell?.covered ?? 0,
                escaped: cell?.escaped ?? 0,
              };
            });
        const maxM = Math.max(1, ...dispSeats.map(s => Math.max(s.leaked, s.assisted)));
        const curRec = capRounds.find(r => r.round === effRound);
        const totLeak = reportCum ? (cap?.leak?.cumLeaks ?? cap?.leak?.totalLeaks ?? 0) : (curRec?.totalLeaks ?? 0);
        const totAssist = reportCum ? (cap?.leak?.cumAssisted ?? cap?.leak?.assistKills ?? 0) : (curRec?.totalAssisted ?? 0);
        const totEsc = reportCum ? (cap?.leak?.cumEscaped ?? cap?.leak?.uncoveredLeaks ?? 0) : (curRec?.totalEscaped ?? 0);
        return (
          <div className="mlite-full-brand" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MobileCaptureToggle
              capture={cap}
              supported={captureSync.supported}
              onStart={captureSync.start}
              onStop={captureSync.stop}
              onRestart={captureSync.restart}
            />
            {dispSeats.length > 0 && (
              <>
                <div className="mlite-scope-bar">
                  <div className="mlite-scope-left">
                    <div className="mlite-seg" role="group" aria-label="统计范围">
                      <button type="button" className={reportCum ? 'is-active' : ''} onClick={() => setReportCum(true)}>累计</button>
                      <button type="button" className={!reportCum ? 'is-active-round' : ''} onClick={() => { setReportCum(false); setReportRound(capRound); }}>单回合</button>
                    </div>
                    <div className="mlite-stepper">
                      <button type="button" aria-label="上一回合" onClick={() => { if (reportCum) { setReportCum(false); setReportRound(capRound); } else setReportRound(p => Math.max(1, p - 1)); }}><ChevronLeft size={12} /></button>
                      <span>{reportCum ? `R1-${String(capRound).padStart(2, '0')}` : `R${String(effRound).padStart(2, '0')}`}</span>
                      <button type="button" aria-label="下一回合" onClick={() => { if (reportCum) { setReportCum(false); setReportRound(capRound); } else setReportRound(p => Math.min(capRound, p + 1)); }}><ChevronRight size={12} /></button>
                    </div>
                  </div>
                  <div className="mlite-top-pills">
                    <span className={`mlite-pill${totLeak > 0 ? ' is-leak' : ''}`}>漏 {totLeak}</span>
                    <span className={`mlite-pill${totAssist > 0 ? ' is-assist' : ''}`}>兜 {totAssist}</span>
                    <span className={`mlite-pill${totEsc > 0 ? ' is-escape' : ''}`}>{totEsc > 0 ? `逃 ${totEsc}` : '零逃'}</span>
                  </div>
                </div>
                <section className="mlite-seat-grid" aria-label="4人实时兜漏与盟约态势">
                  {dispSeats.map(s => {
                    const aPct = (s.assisted / maxM) * 100;
                    const cPct = (s.covered / maxM) * 100;
                    const ePct = (s.escaped / maxM) * 100;
                    const visibleBonds = (s.bonds ?? []).filter(b => b.active || b.count >= 2).slice(0, 4);
                    return (
                      <div key={s.seat} className={`mlite-seat-card${s.isSelf ? ' is-self' : ''}${s.escaped > 0 ? ' is-escaped' : ''}`}>
                        <div className="mlite-seat-top">
                          <span className="mlite-seat-name">
                            {s.isSelf && <b className="mlite-me-tag">我</b>}
                            {s.name}
                          </span>
                          <span className="mlite-hp-tier">
                            <b style={{ color: s.hp >= 0 && s.hp <= 5 ? '#ff7875' : '#34d399' }}>♥{s.hp >= 0 ? s.hp : '—'}</b>
                            {s.shopLevel > 0 && <span className="mlite-tier-badge">{s.shopLevel}本</span>}
                          </span>
                        </div>
                        {visibleBonds.length > 0 && (
                          <div className="mlite-bonds-row">
                            {visibleBonds.map(b => (
                              <span key={b.name} className={`mlite-bond-chip${b.active ? ' is-active' : ''}`}>{b.name}{b.count}</span>
                            ))}
                          </div>
                        )}
                        <div className="mlite-track-row">
                          <span style={{ color: s.assisted > 0 ? '#00e5ff' : '#64748b' }}>兜</span>
                          <div className="mlite-track">{aPct > 0 && <span style={{ width: `${aPct}%`, background: '#00e5ff' }} />}</div>
                          <span className="mlite-track-num" style={{ color: s.assisted > 0 ? '#67e8f9' : '#475569' }}>{s.assisted > 0 ? `+${s.assisted}` : '0'}</span>
                        </div>
                        <div className="mlite-track-row">
                          <span style={{ color: s.escaped > 0 ? '#ff6b6b' : s.leaked > 0 ? '#fbbf24' : '#64748b' }}>漏</span>
                          <div className="mlite-track">
                            {cPct > 0 && <span style={{ width: `${cPct}%`, background: '#fb923c' }} />}
                            {ePct > 0 && <span style={{ width: `${ePct}%`, background: '#ff4d4f' }} />}
                          </div>
                          <span className="mlite-track-num">
                            {s.leaked === 0 ? <span style={{ color: '#475569' }}>0</span> : s.escaped === 0 ? <span style={{ color: '#fbbf24' }}>{s.leaked}</span> : <><span style={{ color: '#fbbf24' }}>{s.leaked}</span><span style={{ color: '#ff8080', marginLeft: 2 }}>逃{s.escaped}</span></>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </section>
                {capRounds.length > 0 && (
                  <section className="mlite-panel" aria-label="本局回合漏兜矩阵">
                    <div className="mlite-panel-head">
                      <span>// 本局 R01–R{String(capRound).padStart(2, '0')} 回合漏兜矩阵</span>
                      <span style={{ color: '#94a3b8', fontWeight: 600 }}>漏{cap?.leak?.cumLeaks ?? 0} · 兜{cap?.leak?.cumAssisted ?? 0} · 逃{cap?.leak?.cumEscaped ?? 0}</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="mlite-matrix-table">
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>回合</th>
                            {baseSeats.map(s => (
                              <th key={s.seat} style={{ color: s.isSelf ? '#ffe600' : undefined }}>{s.isSelf ? '我·' : ''}{s.name.slice(0, 5)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...capRounds].reverse().map(r => (
                            <tr key={r.round}>
                              <td style={{ textAlign: 'left', fontWeight: 800, color: r.totalEscaped > 0 ? '#ff8080' : '#cbd5e1' }}>R{String(r.round).padStart(2, '0')}</td>
                              {r.seats.map(cell => (
                                <td key={cell.seat}>
                                  {cell.assisted === 0 && cell.leaked === 0 ? (
                                    <span style={{ color: '#475569' }}>0</span>
                                  ) : (
                                    <span style={{ display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
                                      {cell.assisted > 0 && <b style={{ color: '#67e8f9' }}>兜+{cell.assisted}</b>}
                                      {cell.leaked > 0 && <b style={{ color: cell.escaped > 0 ? '#ff8080' : '#fbbf24' }}>漏{cell.leaked}{cell.escaped > 0 ? `(逃${cell.escaped})` : ''}</b>}
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
              </>
            )}
            <MatchReport />
          </div>
        );
      })()}
      {session.step === 'library' && <MobileReference onOpenImage={openImage} />}
    </main>
    {guiding && <div className="m-round-controls"><button className="m-secondary chamfer-box" aria-label="上一回合" disabled={round <= 1} onClick={() => manualRound(round - 1)}><ArrowLeft size={17} /><span>上一回合</span></button><button className="m-primary chamfer-box" aria-label="下一回合" disabled={round >= 15} onClick={() => manualRound(round + 1)}><span>{round === 15 ? '已到终盘' : '下一回合'}</span><ArrowRight size={17} /></button></div>}
    <nav className="m-bottom-nav" aria-label="手机导航">{([
      ['ban', '识别', ShieldBan], ['plans', '方案', Crosshair], ['guide', '跟进', Check], ['report', '战报', Activity], ['library', '资料', BookOpen],
    ] as const).map(([step, title, Icon]) => (
      <button
        key={step}
        aria-current={session.step === step ? 'page' : undefined}
        onClick={() => {
          if (step === 'guide' && !session.compId) {
            const fallbackId = filtered[0]?.comp.id || available[0]?.comp.id || ranked[0]?.comp.id;
            if (fallbackId) {
              dispatch({ type: 'choose', id: fallbackId });
              return;
            }
          }
          dispatch({ type: 'step', step });
        }}
      >
        <Icon size={19} /><span>{title}</span>
      </button>
    ))}</nav>
    {help && <div className="m-modal-backdrop" onClick={() => setHelp(false)}><section className="m-confirm" role="dialog" aria-modal="true" aria-label="使用帮助" onClick={e => e.stopPropagation()}><button className="m-icon-button m-close" aria-label="关闭帮助" onClick={() => setHelp(false)}><X size={18} /></button><h2>识别 → 选方案 → 跟进</h2><p><b>本机实时抓包（免 Root）</b>：开启后仅旁路解析明日方舟对局 TCP 帧，自动同步本局 Ban、回合、<b>下回合出怪种类</b>与<b>实时漏怪/协防兜底数</b>（与系统梯子/加速器互斥，不点开启则保持纯离线模式）。</p><p><b>悬浮球快捷手势</b>：单击展开侧栏、双击一键扫盟约、长按切换顶部战术迷你条；迷你条支持 2~3 行完整显示不截断，点正文可一键折叠，右上角可随时切「兜底」查看应急止损。</p><p><b>核心打卡与收藏</b>：点击干员角标打卡（<b>✓ 已到手 / ★ 已精锐</b>）同步缺卡清单；常用阵容可点星标收藏置顶；展开浮窗时窗外点击直达游戏。</p></section></div>}
    {lanModal && <div className="m-modal-backdrop" onClick={() => setLanModal(false)}><section className="m-confirm m-lan-modal" role="dialog" aria-modal="true" aria-label="无线副屏配对" onClick={e => e.stopPropagation()}><button className="m-icon-button m-close" aria-label="关闭无线副屏设置" onClick={() => setLanModal(false)}><X size={18} /></button><h2>电脑无线副屏</h2><MobileLanPanel sharedLan={lanSync.lan} onConnect={lanSync.connect} onDisconnect={lanSync.disconnect} /></section></div>}
    {resetPrompt && <div className="m-modal-backdrop"><section className="m-confirm" role="dialog" aria-modal="true" aria-label="开始新局"><h2>开始新的一局？</h2><p>将清空本局 Ban、已抓干员打卡与各方案回合进度（收藏阵容会保留）。</p><div className="m-two-buttons"><button className="m-secondary" onClick={() => setResetPrompt(false)}>继续本局</button><button className="m-primary" onClick={startNewMatch}>开始新局</button></div></section></div>}
    {image && <section className="m-image-modal" role="dialog" aria-modal="true" aria-label={image.title}><header><button className="m-icon-button" aria-label="关闭原图" onClick={() => setImage(null)}><X /></button><strong>{image.title}</strong><button className="m-secondary" onClick={() => setZoom(zoom >= 250 ? 100 : zoom + 50)}>{zoom}%</button></header><div className="m-image-scroll"><img src={image.url} alt={image.title} style={{ width: `${zoom}%`, maxWidth: 'none' }} /></div><p>拖动查看长图 · 点击比例放大 · 支持双指缩放</p></section>}
  </div>;
}
