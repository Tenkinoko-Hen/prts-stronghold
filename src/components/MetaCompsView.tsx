import { StrategyBadge } from './StrategyBadge';
import React, { useEffect, useState } from 'react';
import { Ban, Check, ChevronLeft, ChevronRight, CircleHelp, RotateCcw } from 'lucide-react';
import { DesktopBanSync } from './DesktopBanSync';
import { type BattleBanSyncState } from '../desktop/battleBanSync';
import { DesktopDialog } from '../desktop/DesktopDialog';
import { DesktopCompGuide } from '../desktop/DesktopCompGuide';
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES, BAN_SENSITIVE_OPERATORS, META_COMPS } from '../data/strongholdData';
import { type BanPickState, getRecommendedPaceForRound, rankCompsByBanState } from '../utils/tacticalLogic';
import { OperatorAvatar } from './OperatorAvatar';
import { summarizeBlockedReasons } from './guidePresentation';

interface MetaCompsViewProps {
  visible: boolean;
  banState: BanPickState;
  onChangeBanState: React.Dispatch<React.SetStateAction<BanPickState>>;
  banSync: BattleBanSyncState;
  onResyncBans(): void;
  onClearBans(): Promise<void>;
  selectedCompId: string;
  onSelectCompId(id: string): void;
  currentRound: number;
  liveRound?: number | null;
  autoFollowRound?: boolean;
  onToggleAutoFollow?(): void;
  onChangeRound(round: number): void;
  onOpenImage(url: string, title: string): void;
  onJumpTo2DMap(): void;
  onJumpToPriorityCovenants(): void;
  onJumpToTransfers?(): void;
}

export function MetaCompsView(props: MetaCompsViewProps) {
  const { banState, onChangeBanState, banSync, onResyncBans, onClearBans, selectedCompId, onSelectCompId } = props;
  const [stage, setStage] = useState<'picker' | 'detail'>('picker');
  const [difficulty, setDifficulty] = useState('全部');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<'operators' | 'help' | 'reset' | null>(null);
  const [resetError, setResetError] = useState('');
  const evaluations = rankCompsByBanState(META_COMPS, banState);
  const filtered = evaluations.filter(ev => difficulty === '全部' || ev.comp.difficulty === difficulty);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  const activeComp = META_COMPS.find(comp => comp.id === selectedCompId) || META_COMPS[0];
  useEffect(() => { setPage(0); }, [difficulty, banState]);
  const toggle = (key: keyof BanPickState, name: string) => onChangeBanState(previous => ({ ...previous,
    [key]: previous[key].includes(name) ? previous[key].filter(item => item !== name) : [...previous[key], name],
  }));
  const reset = async () => {
    try { await onClearBans(); props.onChangeRound(1); setDialog(null); setResetError(''); }
    catch { setResetError('重置未完成，请重试。'); }
  };
  const chips = (names: readonly string[], group: string) => <div className="d-ban-grid">{names.map(name => {
    const banned = banState.bannedCovenants.includes(name);
    return <button key={name} type="button" data-testid={`ban-${group}-${name}`} aria-pressed={banned}
      aria-label={`${name}：${banned ? '受限，点击改为可用' : '未设为受限，点击标记受限'}`} className={banned ? 'is-banned' : ''}
      onClick={() => toggle('bannedCovenants', name)}>{banned && <Ban size={11} />}<span>{name}</span></button>;
  })}</div>;

  return <main className="desktop-page" hidden={!props.visible}>
    {stage === 'picker' ? <div className="d-picker" data-testid="desktop-picker">
      <aside className="d-pick-side d-panel">
        <div className="d-section-head"><h1><span className="d-step">1</span>本局禁选</h1><div className="d-inline">
          <button className="d-icon" aria-label="禁选与筛选帮助" onClick={() => setDialog('help')}><CircleHelp size={17} /></button>
          <button className="d-button d-small" data-testid="clear-bans" onClick={() => { setResetError(''); setDialog('reset'); }}><RotateCcw size={13} />新局</button>
        </div></div>
        <DesktopBanSync sync={banSync} currentBanned={banState.bannedCovenants} onResync={onResyncBans} />
        <section className="d-corrections" aria-label="核对与校正">
          <div className="d-section-head"><h2>核对与校正</h2><span className="d-muted">{banState.bannedCovenants.length} 项受限</span></div>
          <h3>核心盟约 <small>10</small></h3>{chips(ALL_CORE_COVENANT_NAMES, 'core')}
          <h3>附加盟约 <small>16</small></h3>{chips(ALL_SUB_COVENANT_NAMES, 'sub')}
          <details className="d-op-ban-fold" open={banState.bannedOperators.length > 0}>
            <summary>手动禁用核心干员 <small>{banState.bannedOperators.length}</small></summary>
            <div className="d-banned-operators">{banState.bannedOperators.map(name => <button key={name} onClick={() => toggle('bannedOperators', name)} title="点击移除禁用">{name} ×</button>)}<button className="d-ban-placeholder" onClick={() => setDialog('operators')}>＋ 标记本局被禁核心干员</button></div>
          </details>
          <p className="d-muted d-correction-note">点标签切换受限。附加盟约受限不代表其全部干员被禁。</p>
        </section>
      </aside>
      <section className="d-pick-main d-panel" aria-label="选择本局阵容">
        <div className="d-picker-heading"><h2><span className="d-step d-step-gold">2</span>选择本局阵容 <small>{filtered.length} 套</small></h2><div className="d-tabs" aria-label="阵容难度筛选">
          {['全部', '新手轮椅', '进阶公式', '高难上限'].map(item => <button key={item} aria-pressed={difficulty === item} onClick={() => setDifficulty(item)}>{item}</button>)}
        </div></div>
        <div className="d-comp-grid">{filtered.slice(currentPage * 6, currentPage * 6 + 6).map((ev, index) => {
          const comp = ev.comp;
          const mainPhaseName = getRecommendedPaceForRound(comp, 15).activePhaseName;
          const previewOps = comp.phases.find(phase => phase.phaseName === mainPhaseName)?.fieldOperators.slice(0, 5) || [];
          return <button key={comp.id} type="button" data-testid={`comp-card-${comp.id}`} className={`d-comp-card ${selectedCompId === comp.id ? 'is-selected' : ''}`} onClick={() => { onSelectCompId(comp.id); setStage('detail'); }}>
            <div className="d-card-kicker"><span>TOP {currentPage * 6 + index + 1} · {comp.difficulty}</span><StrategyBadge text={comp.strategist} /></div>
            <h3>{comp.title}</h3>
            <div className="d-preview-ops">{previewOps.map((op, i) => <OperatorAvatar key={`${op.name}-${i}`} name={op.name} tier={op.tier} size="sm" />)}</div>
            <div className="d-tags">{comp.covenants.map(cov => <span key={cov} className={banState.bannedCovenants.some(name => cov.includes(name)) ? 'is-hit' : ''}>{cov}</span>)}</div>
            <div className={`d-fit d-fit-${ev.status}`}><strong>{ev.status === 'optimal' ? <Check size={14} /> : <Ban size={14} />}{ev.statusLabel}</strong><span title={ev.blockedReasons.join('；') || comp.subtitle}>{summarizeBlockedReasons(ev.blockedReasons, comp.subtitle)}</span></div>
            <span className="d-card-enter">{ev.blockedReasons.length ? '查看方案与替代组件' : '进入逐回合跟打'} <ChevronRight size={14} /></span>
          </button>;
        })}{!filtered.length && <p className="d-empty">此分类暂无阵容，请选择其他分类。</p>}</div>
        <footer className="d-pagination"><span className="d-muted">适配分表示构筑风险；查看方案核对发牌与核心。</span><div className="d-inline">
          <button className="d-icon" aria-label="上一页阵容" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
          <span data-testid="comp-page">{currentPage + 1} / {pageCount}</span>
          <button className="d-icon" aria-label="下一页阵容" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
        </div></footer>
      </section>
    </div> : <DesktopCompGuide comp={activeComp} evaluations={evaluations} bans={banState} round={props.currentRound}
      liveRound={props.liveRound} autoFollowRound={props.autoFollowRound} onToggleAutoFollow={props.onToggleAutoFollow}
      onRound={props.onChangeRound} onSelectComp={onSelectCompId} onBack={() => setStage('picker')}
      onOpenImage={props.onOpenImage} onTransfers={props.onJumpToTransfers} onCovenants={props.onJumpToPriorityCovenants} />}
    {dialog === 'operators' && <DesktopDialog title="本局禁用核心干员" onClose={() => setDialog(null)}><div className="d-ban-operator-grid">{BAN_SENSITIVE_OPERATORS.map(op => <button key={op.name} data-testid={`ban-op-${op.name}`} aria-pressed={banState.bannedOperators.includes(op.name)} onClick={() => toggle('bannedOperators', op.name)}><OperatorAvatar name={op.name} size="sm" /><span>{banState.bannedOperators.includes(op.name) ? '已禁用' : '未禁用'}</span></button>)}</div></DesktopDialog>}
    {dialog === 'help' && <DesktopDialog title="禁选与筛选帮助" onClose={() => setDialog(null)}><p>Windows 版通过本地实时采集自动从开局场景同步本局 Ban 盟约（需安装 Npcap 并以管理员身份启动），也可随时直接点击下方标签手动勾选或修改。</p><p>所有抓包数据仅在本机内存中处理，不保存原始包、不上传网络。附加盟约受限不代表其全部干员被禁，实际被禁的核心干员可在「手动禁用干员」中补充标记。</p><p>适配分衡量构筑风险，不是胜率。攻略标注「推导」的回合由多份资料补全，请根据经济、来牌与承压调整。</p></DesktopDialog>}
    {dialog === 'reset' && <DesktopDialog title="开始新局" onClose={() => setDialog(null)}><p>清空本局盟约与干员禁用条件，并回到 R1？</p><div className="d-inline"><button className="d-button" onClick={() => setDialog(null)}>保留本局</button><button className="d-button d-primary" onClick={() => void reset()}>确认开始新局</button></div>{resetError && <p role="alert">{resetError}</p>}</DesktopDialog>}
  </main>;
}
