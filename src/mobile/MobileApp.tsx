import React, { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, ClipboardList, Crosshair, RotateCcw, ShieldBan, X } from 'lucide-react';
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES, BAN_SENSITIVE_OPERATORS, META_COMPS } from '../data/strongholdData';
import { getRecommendedPaceForRound, rankCompsByBanState } from '../utils/tacticalLogic';
import { MOBILE_SESSION_KEY, mobileReducer, restoreSession } from './mobileSession';
import { MobileReference } from './MobileReference';
import { CovenantScanner } from './CovenantScanner';
import { MobileGuide } from './MobileGuide';
import type { RoundSyncProgress } from './RoundSync';
import { StrategyBadge } from '../components/StrategyBadge';
import { OperatorAvatar } from '../components/OperatorAvatar';
import { summarizeBlockedReasons } from '../components/guidePresentation';
import './mobile.css';

const MatchReport = lazy(() => import('../../modules/battle-report/src/mobile/MatchReport'));
export default function MobileApp() {
  const [reportOpen, setReportOpen] = useState(false);
  const [session, dispatch] = useReducer(mobileReducer, null, () => {
    try { return restoreSession(localStorage.getItem(MOBILE_SESSION_KEY)); } catch { return restoreSession(null); }
  });
  const [storageError, setStorageError] = useState(false);
  const [operatorQuery, setOperatorQuery] = useState('');
  const [difficulty, setDifficulty] = useState('全部');
  const [image, setImage] = useState<{ url: string; title: string } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [resetPrompt, setResetPrompt] = useState(false);
  const [help, setHelp] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const overlay = new URLSearchParams(window.location.search).get('overlay') === '1';
  const scrollRef = useRef<HTMLElement>(null);
  const roundSyncProgress = useRef<RoundSyncProgress>({ id: '', handled: '', synchronized: false, pending: null });
  const comp = META_COMPS.find(item => item.id === session.compId);
  const round = comp ? session.rounds[comp.id] || 1 : 1;
  const ranked = rankCompsByBanState(META_COMPS, session.bans);
  const available = ranked.filter(item => item.status !== 'blocked');
  const filtered = available.filter(item => difficulty === '全部' || item.comp.difficulty === difficulty);
  const blocked = ranked.filter(item => item.status === 'blocked');
  const banCount = session.bans.bannedCovenants.length + session.bans.bannedOperators.length;
  const manualRound = (value: number) => { window.PRTSRound?.pause(); dispatch({ type: 'round', round: value }); };
  const openImage = (url: string, title: string) => { setZoom(100); setImage({ url, title }); };
  const startNewMatch = () => {
    window.PRTSScan?.reset();
    window.PRTSRound?.stop();
    roundSyncProgress.current = { id: '', handled: '', synchronized: false, pending: null };
    dispatch({ type: 'newMatch' });
    setResetPrompt(false);
  };

  useEffect(() => {
    try { localStorage.setItem(MOBILE_SESSION_KEY, JSON.stringify(session)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [session]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [session.step, session.compId]);

  const banButtons = (names: readonly string[], group: 'bannedCovenants' | 'bannedOperators') => <div className="m-ban-grid">
    {names.map(name => <button key={name} aria-pressed={session.bans[group].includes(name)}
      className={`m-ban ${session.bans[group].includes(name) ? 'is-banned' : ''}`}
      onClick={() => dispatch({ type: 'ban', group, name })}>
      <span>{name}</span><span className="m-ban-mark">{session.bans[group].includes(name) ? '受限' : group === 'bannedCovenants' && session.scanId && !session.confirmedCovenants?.includes(name) ? '未确认' : '可用'}</span>
    </button>)}
  </div>;

  const guiding = session.step === 'guide' && Boolean(comp);
  if (reportOpen) return <Suspense fallback={<p>正在打开战报…</p>}><MatchReport onGuide={() => setReportOpen(false)} /></Suspense>;
  return <div className={`mobile-app ${overlay ? 'is-overlay' : ''}${guiding ? ' is-guiding' : ''}`}>
    {!guiding && <header className="m-workbar"><strong>{session.step === 'ban' ? '识别与推荐' : session.step === 'plans' ? '选择方案' : '随行资料库'}</strong>
      <button className="m-icon-button" aria-label="开始新局" title="开始新局" onClick={() => setResetPrompt(true)}><RotateCcw size={16} /></button><button className="m-icon-button" aria-label="使用帮助" onClick={() => setHelp(true)}><CircleHelp size={17} /></button>
    </header>}
    {storageError && <p role="alert" className="m-warning">本机未能保存进度，关闭前请记下当前回合。</p>}
    <main className={`m-scroll ${session.step === 'guide' ? 'is-guide' : session.step === 'ban' ? 'is-scan' : ''}`} ref={scrollRef}>
      {session.step === 'ban' && <div className="m-scan-layout"><section className="m-scan-controls" aria-label="识别与校正">
        <CovenantScanner appliedId={session.scanId} onApply={scan => { dispatch({ type: 'applyScan', scan }); setCorrecting(false); }} />
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
        <div className="m-quick-plans">{available.slice(0, 2).map(({ comp: item, statusLabel, blockedReasons }, index) => <button key={item.id} className={`m-quick-plan ${index === 0 ? 'is-first' : ''}`} onClick={() => dispatch({ type: 'choose', id: item.id })}>
          <span className="m-quick-rank">{session.scanComplete ? index === 0 ? '首选' : '备选' : '候选'}</span><span><strong title={item.title}>{item.title}</strong><StrategyBadge text={item.strategist} /><small>{summarizeBlockedReasons(blockedReasons, statusLabel)} · {item.difficulty}</small></span><ArrowRight size={18} />
        </button>)}</div>
        {available.length === 0 && <p className="m-notice">当前条件没有可用方案，可校正条件或查看全部方案中的受限说明。</p>}
        <button className="m-text-button m-wide" onClick={() => dispatch({ type: 'step', step: 'plans' })}>查看全部方案 · {available.length} 套候选 <ArrowRight size={16} /></button>
        </section></div>}

      {session.step === 'plans' && <>
        <div className="m-plans-top"><div className="m-section-heading"><div><span className="m-eyebrow">02 / 选择路线</span><h1>本局可用方案</h1></div><span className="m-count">{available.length} 套</span></div>
        <button className="m-inline-back" onClick={() => dispatch({ type: 'step', step: 'ban' })}><ArrowLeft size={16} /> 重新识别 / 校正 · 受限 {banCount} 项</button></div>
        {session.scanComplete === false && <p className="m-warning">本次盟约尚未读全，以下为部分条件下的候选。请重新识别或核对缺项。</p>}
        <div className="m-chips" aria-label="阵容难度">{['全部', '新手轮椅', '进阶公式', '高难上限'].map(label => <button key={label} aria-pressed={difficulty === label} onClick={() => setDifficulty(label)}>{label}</button>)}</div>
        {filtered.length === 0 && <div className="m-card"><h2>暂无符合条件的方案</h2><p>可以修改 Ban、切回全部难度，或展开下方受限方案核对转型条件。</p></div>}
        <div className="m-plan-grid">{filtered.map(({ comp: item, score, statusLabel, blockedReasons, pivotAdvice }, index) => {
          const mainPhase = getRecommendedPaceForRound(item, 15).activePhaseName;
          const previewOps = item.phases.find(phase => phase.phaseName === mainPhase)?.fieldOperators || [];
          return <article className="m-card m-plan" key={item.id}>
          <div className="m-plan-meta"><span>{String(index + 1).padStart(2, '0')} · {item.difficulty}</span><strong>{score} <small>适配</small></strong></div>
          <h2>{item.title}</h2><StrategyBadge text={item.strategist} /><div className="m-tags">{item.covenants.map(cov => <span key={cov}>{cov}</span>)}</div>
          <div className="m-plan-avatars" aria-label="主阵容预览">{previewOps.map((op, i) => <OperatorAvatar key={`${op.name}-${i}`} name={op.name} tier={op.tier} size="sm" />)}</div>
          <details className="m-plan-explanation"><summary>核心思路</summary><p>{item.subtitle}</p><p className="m-muted">{item.coreHighlight}</p></details>
          {blockedReasons.length > 0 && <details className="m-notice"><summary>{summarizeBlockedReasons(blockedReasons, statusLabel)}</summary><ul>{blockedReasons.map(line => <li key={line}>{line}</li>)}</ul><p>{pivotAdvice}</p></details>}
          <button className="m-primary m-wide" aria-label={`选择方案 ${item.title}`} onClick={() => dispatch({ type: 'choose', id: item.id })}>{session.rounds[item.id] ? `继续 R${session.rounds[item.id]}` : '选这套 · 从 R1 开始'}<ArrowRight size={17} /></button>
          <span className="m-footnote">{statusLabel}</span>
        </article>; })}</div>
        {blocked.length > 0 && <details className="m-card"><summary>受限方案 <span>{blocked.length} 套</span><ChevronDown size={16} /></summary>{blocked.map(item => <div className="m-blocked" key={item.comp.id}><h3>{item.comp.title}</h3><ul>{item.blockedReasons.map(line => <li key={line}>{line}</li>)}</ul><p>{item.pivotAdvice}</p><button className="m-secondary m-wide" onClick={() => dispatch({ type: 'choose', id: item.comp.id })}>查看攻略与限制</button></div>)}</details>}
      </>}

      {guiding && comp && <MobileGuide comp={comp} round={round} bans={session.bans} roundSyncProgress={roundSyncProgress} onRound={value => dispatch({ type: 'round', round: value })} onBack={() => dispatch({ type: 'step', step: 'plans' })} onOpenImage={openImage} />}
      {session.step === 'library' && <MobileReference onOpenImage={openImage} />}
    </main>
    {guiding && <div className="m-round-controls"><button className="m-secondary chamfer-box" aria-label="上一回合" disabled={round <= 1} onClick={() => manualRound(round - 1)}><ArrowLeft size={17} /><span>上一回合</span></button><button className="m-primary chamfer-box" aria-label="下一回合" disabled={round >= 15} onClick={() => manualRound(round + 1)}><span>{round === 15 ? '已到终盘' : '下一回合'}</span><ArrowRight size={17} /></button></div>}
    <nav className="m-bottom-nav" aria-label="手机导航">{([
      ['ban', '识别', ShieldBan], ['plans', '方案', Crosshair], ['guide', '跟进', Check], ['library', '资料', BookOpen],
    ] as const).map(([step, title, Icon]) => <button key={step} aria-current={session.step === step ? 'page' : undefined} onClick={() => dispatch({ type: 'step', step })}><Icon size={19} /><span>{title}</span></button>)}
      {window.PRTSJournal && <button onClick={() => setReportOpen(true)}><ClipboardList size={19}/><span>战报</span></button>}</nav>
    {help && <div className="m-modal-backdrop" onClick={() => setHelp(false)}><section className="m-confirm" role="dialog" aria-modal="true" aria-label="使用帮助" onClick={e => e.stopPropagation()}><button className="m-icon-button m-close" aria-label="关闭帮助" onClick={() => setHelp(false)}><X size={18} /></button><h2>识别 → 选方案 → 跟进</h2><p>在游戏打开「确认本局信息」，露出核心盟约与两排附加盟约。点击识别，允许系统屏幕共享，读全后这里会显示推荐。</p><p>点击受限标签可改为可用；「补录 / 校正」可修改全部盟约。未确认项不代表可用。灰暗表示阵容受限，不代表其中所有干员被禁，核心干员仍需按游戏核对。</p><p>点击当前回合编号可快速跳转。开启自动回合后框选游戏回合数字，收起助手时同步，手动切换会暂停自动跟进。</p><p>截图只在内存中本机处理，不保存、不上传。攻略按经济、来牌与承压调整，推导内容已标注。</p></section></div>}
    {resetPrompt && <div className="m-modal-backdrop"><section className="m-confirm" role="dialog" aria-modal="true" aria-label="开始新局"><h2>开始新的一局？</h2><p>将清空本局 Ban 和所有方案的回合进度。</p><div className="m-two-buttons"><button className="m-secondary" onClick={() => setResetPrompt(false)}>继续本局</button><button className="m-primary" onClick={startNewMatch}>开始新局</button></div></section></div>}
    {image && <section className="m-image-modal" role="dialog" aria-modal="true" aria-label={image.title}><header><button className="m-icon-button" aria-label="关闭原图" onClick={() => setImage(null)}><X /></button><strong>{image.title}</strong><button className="m-secondary" onClick={() => setZoom(zoom >= 250 ? 100 : zoom + 50)}>{zoom}%</button></header><div className="m-image-scroll"><img src={image.url} alt={image.title} style={{ width: `${zoom}%`, maxWidth: 'none' }} /></div><p>拖动查看长图 · 点击比例放大 · 支持双指缩放</p></section>}
  </div>;
}
