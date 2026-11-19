import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Radar } from 'lucide-react';
import type { MetaCompGuide } from '../data/strongholdData';
import { evaluateCompUnderBans, getRecommendedPaceForRound, type BanPickState, type CompBanEvaluation } from '../utils/tacticalLogic';
import { OperatorAvatar } from '../components/OperatorAvatar';
import { equipmentNames, isCorrection, mentionedOperators, type GuideOperator } from '../mobile/guideContent';
import { OperatorDetails } from '../components/OperatorDetails';
import { StrategyBadge } from '../components/StrategyBadge';
import { DesktopDialog } from './DesktopDialog';
import { DesktopRouteOverview } from './DesktopRouteOverview';
import { loadoutSummary } from '../components/guidePresentation';
import { DerivedText } from '../components/DerivedText';
import { TacticalOperatorCard } from '../components/TacticalOperatorCard';
import { AegirReferenceButton } from '../components/AegirReferenceGallery';
import { isAegirGuide } from '../data/aegirErosion';

function EquipmentText({ text }: { text: string }) {
  const pattern = new RegExp(`(${equipmentNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{text.split(pattern).map((part, index) => equipmentNames.includes(part) ? <mark key={index}>{part}</mark> : part)}</>;
}

const guideTabs = ['打法与出装', '本局适配', '全回合轴'] as const;

interface Props {
  comp: MetaCompGuide; evaluations: CompBanEvaluation[]; bans: BanPickState; round: number;
  onRound(round: number): void; onSelectComp(id: string): void; onBack(): void;
  onOpenImage(url: string, title: string): void; onTransfers?(): void; onCovenants(): void;
}

export function DesktopCompGuide({ comp, evaluations, bans, round, onRound, onSelectComp, onBack, onOpenImage, onTransfers, onCovenants }: Props) {
  const [phaseOverride, setPhaseOverride] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'overview' | 'strategy' | 'equipment' | null>(null);
  const [operator, setOperator] = useState<GuideOperator | null>(null);
  const [tab, setTab] = useState<(typeof guideTabs)[number]>('打法与出装');
  const activeRound = useRef<HTMLButtonElement>(null);
  const pace = getRecommendedPaceForRound(comp, round);
  const automaticIndex = Math.max(0, comp.phases.findIndex(phase => phase.phaseName === pace.activePhaseName));
  const phaseIndex = phaseOverride ?? automaticIndex;
  const phase = comp.phases[phaseIndex] || comp.phases[0];
  const evaluation = evaluateCompUnderBans(comp, bans);
  useEffect(() => { setPhaseOverride(null); setDialog(null); setOperator(null); setTab('打法与出装'); }, [comp.id]);
  useEffect(() => { if (tab === '全回合轴') activeRound.current?.scrollIntoView({ block: 'center' }); }, [tab, round, comp.id]);
  const selectRound = (value: number) => { setPhaseOverride(null); onRound(Math.max(1, Math.min(15, value))); };
  const close = () => { setDialog(null); setOperator(null); };
  const firstSentence = (value: string) => value.split(/[。；]/)[0];
  const action = pace.currentAction || comp.strategistTip;
  const focused = phaseOverride === null ? mentionedOperators(action) : [];
  const dialogTitle = operator?.name || ({ overview: '阵容总览', strategy: '完整打法与适用条件', equipment: '核心装备与技能' }[dialog || 'strategy']);

  return <div className="d-guide" data-testid="desktop-guide">
    <header className="d-guide-header d-panel">
      <button data-testid="back-to-ban-select" className="d-button" onClick={onBack}><ArrowLeft size={15} />返回</button>
      <div className="d-guide-title"><h1 title={comp.title}>{comp.title}</h1></div>
      <select aria-label="快速切换当前跟打阵容" value={comp.id} onChange={e => onSelectComp(e.target.value)}><option value={comp.id}>切换阵容…</option>{evaluations.filter(ev => ev.comp.id !== comp.id).map(ev => <option key={ev.comp.id} value={ev.comp.id}>{ev.comp.title} · {ev.statusLabel}</option>)}</select>
      <div className="d-tags d-header-covenants">{comp.covenants.map(cov => <span key={cov} className={bans.bannedCovenants.some(name => cov.includes(name)) ? 'is-hit' : ''}>{cov}</span>)}</div>
      <button className="d-button d-overview-button" onClick={() => setDialog('overview')}><Radar size={15} />阵容总览</button>
      {isAegirGuide(comp.id)
        ? <AegirReferenceButton key={comp.id} className="d-button" round={round} stage={round >= 14 ? 'Boss战' : '道中'} />
        : <button className="d-button" onClick={() => onOpenImage(comp.imageUrl, comp.title)}><Maximize2 size={14} />看原图</button>}
    </header>
    <div className="d-guide-grid">
        <section className="d-panel d-phase-panel" aria-label="当前阶段阵容" data-phase-name={phase.phaseName}>
          <div className="d-phase-header"><div className="d-phase-toolbar"><div className="d-phase-tabs" aria-label="阵容阶段">
            {comp.phases.map((item, index) => <button key={item.phaseName} aria-pressed={phaseIndex === index} title={item.phaseName} onClick={() => setPhaseOverride(index === automaticIndex ? null : index)}>{index + 1} · {item.rounds}</button>)}
          </div><section className="d-bench" aria-label="整备区"><strong>整备区</strong><div className="d-bench-ops">
            {phase.benchOperators.map((op, index) => <button key={`${op.name}-${index}`} aria-label={`查看${op.name}详情`} onClick={() => setOperator({ ...op, role: '整备区' })}><OperatorAvatar name={op.name} tier={op.tier} size="sm" /></button>)}
          </div>{!phase.benchOperators.length && <span className="d-muted">无需固定挂件 · 留对子</span>}</section></div></div>
          <div className="d-phase-body" key={`${comp.id}-${phaseIndex}`}>
            <div className="d-section-head d-phase-name"><h3>{phase.phaseName} <small>上场 {phase.fieldOperators.length} 人</small></h3>{phaseOverride !== null ? <button className="d-text-button" onClick={() => setPhaseOverride(null)}>返回 R{round} 对应阶段</button> : <span className="d-muted">{phase.shopTier}</span>}</div>
            <div className="d-field-ops">{phase.fieldOperators.map((op, index) => <TacticalOperatorCard key={`${op.name}-${index}`} compId={comp.id} operator={op}
              className="d-deploy-card" focused={focused.some(name => op.name.includes(name))} onClick={() => setOperator(op)} />)}</div>
            <div className="d-tactical-brief">
              <section><h3>目标盟约与阶段操作</h3><p className="d-phase-target">{phase.covenantTarget}</p><ul className="d-key-actions">{phase.keyActions.map((line, index) => <li key={index}>{line}</li>)}</ul></section>
              <section><div className="d-section-head"><h3>核心装备与技能</h3><button className="d-text-button" onClick={() => setDialog('equipment')}>完整配装</button></div>
                <p className="d-loadout-summary"><EquipmentText text={loadoutSummary(comp)} /></p>
                <ul className="d-key-actions">{comp.equipmentTips.filter(tip => !isCorrection(tip)).slice(0, 2).map((tip, index) => <li key={index}><EquipmentText text={firstSentence(tip)} /></li>)}</ul>
              </section>
            </div>
          </div>
        </section>
      <aside className="d-guide-right">
        <section className="d-panel d-round-panel" aria-label="本回合指令">
          <div className="d-round-head"><div className="chamfer-box"><small>回合 / ROUND</small><strong>{String(round).padStart(2, '0')} <span>/ 15</span></strong></div><span className="d-tier">推荐 {pace.recommendedTier} 本</span></div>
          <div className="hazard-stripe" aria-hidden="true" />
          <div className="d-round-action prts-reticle" data-testid="round-action"><strong>R{round} · 本回合指令</strong><p className="round-signal" key={round}><DerivedText text={action} /></p></div>
          <div className="d-inline d-round-controls">
            <button className="d-icon" aria-label="上一回合" disabled={round <= 1} onClick={() => selectRound(round - 1)}><ChevronLeft size={16} /></button><button className="d-button d-primary d-small" disabled={round >= 15} onClick={() => selectRound(round + 1)}>下一回合<ChevronRight size={14} /></button>
          </div>
        </section>
        <section className="d-panel d-strategy-panel">
          <div className="d-guide-tabs" aria-label="战术资料">{guideTabs.map(label => <button key={label} className="ak-skew-tag" aria-pressed={tab === label} onClick={() => setTab(label)}>{label}</button>)}</div>
          <div className="d-guide-tab-content" key={tab}>
          {tab === '打法与出装' && <>
          <div className="d-strategy-summary"><p><strong>构筑</strong>{firstSentence(comp.coreHighlight)}</p><p><strong>节奏</strong>{comp.subtitle}</p></div>
          <p className="d-loadout-summary"><strong>出装</strong><EquipmentText text={loadoutSummary(comp)} /></p>
          <button className="d-strategy-open" aria-label="查看策略详情" onClick={() => setDialog('strategy')}><StrategyBadge text={comp.strategist} /><ChevronRight size={14} /></button>
          </>}
          {tab === '本局适配' && <div className={`d-fit d-fit-${evaluation.status}`}><strong>{evaluation.statusLabel}</strong>{evaluation.blockedReasons.length > 0 && <ul className="d-key-actions">{evaluation.blockedReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}<p>{evaluation.pivotAdvice || '当前未命中关键限制，按来牌与对局压力调整。'}</p></div>}
          {tab === '全回合轴' && <ol className="d-timeline">{comp.roundPace.map(item => <li key={item.round} className={item.round === round ? 'is-active' : ''}><button ref={item.round === round ? activeRound : null} className="d-button d-timeline-row" aria-current={item.round === round ? 'step' : undefined} onClick={() => selectRound(item.round)}><span>R{item.round} · {item.tier} 本</span><span><DerivedText text={item.action} /></span></button></li>)}</ol>}
          </div>
        </section>
        <section className="d-panel d-reference-panel"><div className="d-section-head"><h2>阵容参考原图</h2><div className="d-inline">{comp.secondaryImageUrl && <button className="d-text-button" onClick={() => onOpenImage(comp.secondaryImageUrl!, `${comp.title} · 补充图`)}>补充图</button>}<button className="d-icon" aria-label="放大阵容原图" onClick={() => onOpenImage(comp.imageUrl, comp.title)}><Maximize2 size={15} /></button></div></div>
          <button className="d-reference-image" aria-label="查看阵容原图" onClick={() => onOpenImage(comp.imageUrl, comp.title)}><img src={comp.imageUrl} alt={comp.title} /></button>
          <div className="d-reference-footer"><button className="d-text-button d-action-link-pill" onClick={onCovenants}>相关盟约</button>{onTransfers && <button className="d-text-button d-action-link-pill" onClick={onTransfers}>转职配方</button>}</div>
        </section>
      </aside>
    </div>
    <div className="d-round-foot"><span>回合</span><div className="d-round-track" aria-label="选择回合">{Array.from({ length: 15 }, (_, index) => index + 1).map(value => <button key={value} data-round={value} aria-pressed={round === value} onClick={() => selectRound(value)}>R{value}</button>)}</div></div>
    {(dialog || operator) && <DesktopDialog title={dialogTitle} onClose={close}>
      {dialog === 'overview' && <DesktopRouteOverview phases={comp.phases} initialIndex={phaseIndex} automaticIndex={automaticIndex} round={round} action={action} onPreview={index => { setPhaseOverride(index === automaticIndex ? null : index); close(); }} />}
      {operator && <OperatorDetails key={operator.name} operator={operator} equipmentTips={comp.equipmentTips} compId={comp.id} />}
      {dialog === 'strategy' && <><h3>{comp.title}</h3><p>{comp.subtitle}</p><h3>构筑与适用条件</h3><p>{comp.coreHighlight}</p><StrategyBadge text={comp.strategist} detailed /><p>{comp.strategistTip}</p></>}
      {dialog === 'equipment' && <div className="d-equipment-list">{comp.equipmentTips.map((tip, index) => <article key={index} className={isCorrection(tip) ? 'is-correction' : ''}><div>{mentionedOperators(tip).slice(0, 2).map(name => <OperatorAvatar key={name} name={name} size="sm" />)}</div><p><EquipmentText text={tip} /></p></article>)}</div>}
    </DesktopDialog>}
  </div>;
}
