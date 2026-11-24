// 青逝痕 Tenkinoko 制作
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { OperatorAvatar } from '../components/OperatorAvatar';
import type { CompPhase, MetaCompGuide } from '../data/strongholdData';
import { evaluateCompUnderBans, getRecommendedPaceForRound, type BanPickState } from '../utils/tacticalLogic';
import { equipmentNames, isCorrection, mentionedOperators, roundOperators, type GuideOperator } from './guideContent';
import { OperatorDetails } from '../components/OperatorDetails';
import { StrategyBadge } from '../components/StrategyBadge';
import { RoundSync, type RoundSyncProgress } from './RoundSync';
import { DerivedText } from '../components/DerivedText';
import { loadoutSummary, summarizeBlockedReasons } from '../components/guidePresentation';
import { TacticalOperatorCard } from '../components/TacticalOperatorCard';
import { AegirReferenceButton } from '../components/AegirReferenceGallery';
import { isAegirGuide } from '../data/aegirErosion';

function EquipmentText({ text }: { text: string }) {
  const pattern = new RegExp(`(${equipmentNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{text.split(pattern).map((part, i) => equipmentNames.includes(part) ? <mark key={i}>{part}</mark> : part)}</>;
}

function PhaseInfo({ phase, compId, onOperator }: { phase: CompPhase; compId: string; onOperator(op: GuideOperator): void }) {
  return <>
    <div className="m-operators">{phase.fieldOperators.map((op, i) => <TacticalOperatorCard key={`${op.name}-${i}`} className="m-avatar-button"
      operator={op} compId={compId} onClick={() => onOperator(op)} />)}</div>
    {phase.benchOperators.length > 0 && <><h3>整备区</h3><div className="m-bench-avatars">{phase.benchOperators.map((op, i) => <button key={`${op.name}-${i}`} aria-label={`查看${op.name}详情`} onClick={() => onOperator({ ...op, role: '整备区' })}><OperatorAvatar name={op.name} tier={op.tier} size="sm" /></button>)}</div></>}
    <details className="m-phase-plan"><summary>{phase.rounds} · 阶段目标与操作</summary><p>{phase.shopTier}</p><p className="m-highlight">{phase.covenantTarget}</p><ul>{phase.keyActions.map((line, i) => <li key={i}>{line}</li>)}</ul></details>
  </>;
}

const guideTabs = ['阵容', '装备', '思路', '全程', '总览'] as const;

export function MobileGuide({ comp, round, bans, roundSyncProgress, onRound, onBack, onOpenImage }: {
  comp: MetaCompGuide; round: number; bans: BanPickState;
  roundSyncProgress: RefObject<RoundSyncProgress>;
  onRound(round: number): void; onBack(): void; onOpenImage(url: string, title: string): void;
}) {
  const [tab, setTab] = useState<(typeof guideTabs)[number]>('阵容');
  const [hudView, setHudView] = useState<'round' | 'formation' | 'loadout'>('round');
  const [quickPick, setQuickPick] = useState(false);
  const [operator, setOperator] = useState<GuideOperator | null>(null);
  const [fullAction, setFullAction] = useState(false);
  const [phaseOverride, setPhaseOverride] = useState<number | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const pace = getRecommendedPaceForRound(comp, round);
  const automaticPhaseIndex = Math.max(0, comp.phases.findIndex(item => item.phaseName === pace.activePhaseName));
  const phaseIndex = phaseOverride ?? automaticPhaseIndex;
  const phase = comp.phases[phaseIndex];
  const evaluation = evaluateCompUnderBans(comp, bans);
  const activePhase = comp.phases[automaticPhaseIndex];
  const action = pace.currentAction || comp.strategistTip;
  const relevant = roundOperators(comp, activePhase, action);
  const named = mentionedOperators(action);
  const operators = [...(named.length ? relevant : []), ...activePhase.fieldOperators.filter(op => !named.includes(op.name))].slice(0, 4);
  const selectTab = (value: (typeof guideTabs)[number]) => {
    setTab(value);
    setHudView(value === '装备' || value === '思路' ? 'loadout' : 'formation');
  };
  const manualRound = (value: number) => { window.PRTSRound?.pause(); setPhaseOverride(null); setQuickPick(false); onRound(Math.max(1, Math.min(15, value))); };
  const previewPhase = (index: number) => {
    setPhaseOverride(index === automaticPhaseIndex ? null : index);
    detailRef.current?.scrollTo({ top: 0 });
  };
  useEffect(() => { setPhaseOverride(null); }, [comp.id, round]);
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); setOperator(null); setFullAction(false); }, [comp.id, round, tab]);
  useEffect(() => {
    window.PRTSOverlay?.updateStrip(round, comp.title, action);
  }, [comp.title, round, action]);
  useEffect(() => {
    if (!quickPick) return;
    const dismiss = (event: PointerEvent) => { if (!pickRef.current?.contains(event.target as Node)) setQuickPick(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setQuickPick(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [quickPick]);
  useEffect(() => { if (tab === '全程') detailRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center' }); }, [tab, round]);
  return <div className="m-guide-page" data-hud-view={hudView}>
    <header className="m-workbar m-guide-workbar">
      <button className="m-icon-button" aria-label="返回选择方案" title="返回选择方案" onClick={onBack}><ArrowLeft size={15} /></button>
      <strong title={comp.title}>{comp.title}</strong>
      <div className="m-round-select" ref={pickRef}>
        <button className="m-round-trigger ak-skew-tag" aria-label={`选择回合，当前 R${round}`} aria-expanded={quickPick} onClick={() => setQuickPick(open => !open)}>R{String(round).padStart(2, '0')}/15 <ChevronDown size={12} /></button>
        {quickPick && <div className="m-round-menu" role="group" aria-label="回合快选">{Array.from({ length: 15 }, (_, i) => i + 1).map(value => <button key={value} aria-pressed={round === value} onClick={() => manualRound(value)}>R{value}</button>)}</div>}
      </div>
      <RoundSync round={round} progress={roundSyncProgress} onRound={onRound} />
      {isAegirGuide(comp.id) && <AegirReferenceButton key={comp.id} className="m-workbar-gallery" round={round} stage={round >= 14 ? 'Boss战' : '道中'} />}
      <div className="m-hud-round-nav">
        <button className="m-icon-button" aria-label="上一回合" disabled={round <= 1} onClick={() => manualRound(round - 1)}><ChevronLeft size={16} /></button>
        <button className="m-icon-button m-primary chamfer-box" aria-label="下一回合" disabled={round >= 15} onClick={() => manualRound(round + 1)}><ChevronRight size={16} /></button>
      </div>
      <div className="m-guide-tabs" aria-label="攻略内容">{guideTabs.map((label, index) => <button key={label} className="ak-skew-tag" aria-pressed={tab === label} onClick={() => selectTab(label)}><small>0{index + 1}</small>{label}</button>)}</div>
    </header>
    <div className="m-guide-layout">
    <section className="m-guide-action m-round-card" aria-label="本回合指令">
      <div className="m-action-heading"><strong>本回合指令</strong><span className="m-tier">参考 {pace.recommendedTier} 本</span><button aria-label="展开本回合完整指令" title="放大指令" onClick={() => setFullAction(true)}><Expand size={13} /></button></div>
      <p className="m-action-text round-signal" key={round}><DerivedText text={action} /></p>
      <div className="hazard-stripe" aria-hidden="true" />
      <div className="m-turn-operators" aria-label={named.length ? '本回合相关干员' : '当前阶段干员'}>
        {operators.map((op, index) => <TacticalOperatorCard key={`${op.name}-${index}`} compId={comp.id} operator={op} className="m-turn-operator" onClick={() => setOperator(op)} />)}
      </div>
    </section>
    <div className="m-guide-info">
      <div className="m-hud-detail-tabs">{(hudView === 'loadout' ? ['装备', '思路'] as const : ['阵容', '全程', '总览'] as const).map(label => <button key={label} aria-pressed={tab === label} onClick={() => selectTab(label)}>{label}</button>)}</div>
      <div className="m-guide-info-scroll" ref={detailRef}>
        {evaluation.blockedReasons.length > 0 && <details className="m-notice"><summary>{summarizeBlockedReasons(evaluation.blockedReasons, evaluation.statusLabel)}</summary><ul>{evaluation.blockedReasons.map(line => <li key={line}>{line}</li>)}</ul><p>{evaluation.pivotAdvice}</p></details>}
        {tab === '阵容' && phase && <section className="m-card m-formation"><div className="m-phase-heading"><h2>{phaseOverride === null ? '阶段阵容' : '预览阶段'} · {phase.fieldOperators.length} 人</h2><select aria-label="选择阵容阶段" value={phaseIndex} onChange={e => previewPhase(Number(e.target.value))}>{comp.phases.map((item, index) => <option key={index} value={index}>{item.phaseName} · {item.rounds}</option>)}</select>{phaseOverride !== null && <button className="m-action-pill" onClick={() => setPhaseOverride(null)}>回到 R{round}</button>}</div><PhaseInfo phase={phase} compId={comp.id} onOperator={setOperator} /></section>}
        {tab === '总览' && <section className="m-card m-overview"><h2>阶段路线</h2><nav aria-label="查看阶段编队">{comp.phases.map((item, index) => <button key={item.phaseName} aria-current={index === automaticPhaseIndex ? 'step' : undefined} onClick={() => { previewPhase(index); setTab('阵容'); }}>
          <small>{index + 1} · {item.rounds}</small><strong>{item.phaseName}</strong>{index === automaticPhaseIndex && <span>当前阶段</span>}
        </button>)}</nav><StrategyBadge text={comp.strategist} /></section>}
        {tab === '装备' && <section className="m-card"><h2>装备与技能</h2><p className="m-loadout-summary"><strong>核心出装</strong><EquipmentText text={loadoutSummary(comp)} /></p><div className="m-equipment-list">{comp.equipmentTips.map((tip, i) => {
          const names = mentionedOperators(tip);
          return <article className={`m-equipment-row ${isCorrection(tip) ? 'is-correction' : ''}`} key={i}>
            <div className="m-equipment-avatars">{names.slice(0, 2).map(name => <button key={name} aria-label={`查看${name}详情`} onClick={() => setOperator({ name, tier: '', role: '配装干员' })}><OperatorAvatar name={name} size="sm" /></button>)}{!names.length && <span>通用</span>}</div>
            <details><summary><span>{isCorrection(tip) ? '注意 · ' : ''}<EquipmentText text={tip.split(/[。；]/)[0]} /></span></summary><p><EquipmentText text={tip} /></p></details>
          </article>;
        })}</div></section>}
        {tab === '思路' && <section className="m-card"><StrategyBadge text={comp.strategist} detailed /><p>{comp.strategistTip}</p><p>{comp.coreHighlight}</p><p>{comp.subtitle}</p><p className="m-loadout-summary"><strong>核心出装</strong><EquipmentText text={loadoutSummary(comp)} /></p><div className="m-tags">{comp.covenants.map(cov => <span key={cov}>{cov}</span>)}</div></section>}
        {tab === '全程' && <section className="m-card"><h2>完整回合表</h2><ol className="m-timeline">{comp.roundPace.map(item => <li key={item.round} className={item.round === round ? 'is-active' : ''}><button aria-current={item.round === round ? 'step' : undefined} onClick={() => { manualRound(item.round); setTab('阵容'); }}><strong>R{item.round} · {item.tier} 本</strong><span><DerivedText text={item.action} /></span></button></li>)}</ol><h2>完整阶段操作</h2>{comp.phases.map((item, i) => <details key={i} className="m-subdetail"><summary>{item.phaseName} · {item.rounds}</summary><PhaseInfo phase={item} compId={comp.id} onOperator={setOperator} /></details>)}</section>}
        <div className="m-two-buttons"><button className="m-secondary" onClick={() => onOpenImage(comp.imageUrl, comp.title)}>原始攻略图</button>{comp.secondaryImageUrl && <button className="m-secondary" onClick={() => onOpenImage(comp.secondaryImageUrl!, `${comp.title} · 补充图`)}>补充图</button>}</div>
      </div>
    </div>
  </div>
    <nav className="m-hud-tabs" aria-label="悬浮窗视图">
      <button aria-pressed={hudView === 'round'} onClick={() => setHudView('round')}>本回合 · {operators.length} 人</button>
      <button aria-pressed={hudView === 'formation'} onClick={() => { setHudView('formation'); setTab('阵容'); }}>完整阵容 · {phase.fieldOperators.length} 人</button>
      <button aria-pressed={hudView === 'loadout'} onClick={() => { setHudView('loadout'); setTab('装备'); }}>出装与思路</button>
    </nav>
    {(operator || fullAction) && <div className="m-modal-backdrop" onClick={() => { setOperator(null); setFullAction(false); }}><section className="m-confirm m-operator-detail" role="dialog" aria-modal="true" aria-label={operator?.name || '本回合完整指令'} onClick={e => e.stopPropagation()}>
      <button className="m-icon-button m-close" aria-label="关闭详情" onClick={() => { setOperator(null); setFullAction(false); }}><X size={18} /></button>
      {operator ? <OperatorDetails key={operator.name} operator={operator} equipmentTips={comp.equipmentTips} compId={comp.id} /> : <><h2>R{round} · 参考 {pace.recommendedTier} 本</h2><p><DerivedText text={action} /></p><p className="m-muted">{pace.activePhaseName} · 按经济、来牌与承压调整。</p></>}
    </section></div>}
  </div>;
}
