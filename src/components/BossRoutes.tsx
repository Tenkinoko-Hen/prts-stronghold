// 青逝痕 Tenkinoko 制作
import { useState } from 'react';
import { BOSS_ROUTE_GUIDES, BOSS_ROUTE_TERRAINS } from '../data/bossRoutes';
import { BOSS_ENCOUNTERS, BOSS_RESEARCH_SOURCE, type BossEncounter, type BossStats } from '../data/bossEncounterData';
import { BossPatrol } from './BossPatrol';
import './bossRoutes.css';

type OpenImage = { onOpenImage(url: string, title: string): void };
const views = ['实战路线图', '领袖与随从', '巡逻点位'] as const;
const statsLabels = ['生命值', '开场攻击', '防御', '法抗', '基础间隔', '移速'];
const formatStat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
type ReportLeader = { encounter: BossEncounter; round: 14 | 15; highDifficulty?: boolean };

function StatList({ stats, healthUnit, leader = false }: { stats: BossStats; healthUnit?: '次'; leader?: boolean }) {
  return <dl className="boss-stat-list">
    {stats.map((value, index) => <div key={statsLabels[index]}>
      <dt>{index === 0 ? healthUnit ? '击倒次数（估）' : leader ? '配置血量' : statsLabels[0] : statsLabels[index]}</dt>
      <dd>{formatStat.format(value)}{index === 4 ? ' 秒' : index === 0 && healthUnit ? ' 次' : ''}</dd>
    </div>)}
  </dl>;
}

function BossStatsPanel({ leader }: { leader?: ReportLeader }) {
  const [boss, setBoss] = useState(leader ? Math.max(0, BOSS_ENCOUNTERS.indexOf(leader.encounter)) : 0);
  const [round, setRound] = useState<14 | 15>(leader?.round ?? 14);
  const encounter = BOSS_ENCOUNTERS[boss];
  const wave = encounter.rounds[round];
  return <div className="boss-stats">
    <div className="boss-route-controls">
      <label>领袖<select aria-label="选择领袖属性" value={boss} onChange={e => { setBoss(Number(e.target.value)); setRound(14); }}>
        {BOSS_ENCOUNTERS.map((item, index) => <option key={item.id} value={index}>{item.name}</option>)}
      </select></label>
      <label>回合<select aria-label="选择领袖回合" value={round} onChange={e => setRound(e.target.value === '15' && encounter.rounds[15] ? 15 : 14)}>
        <option value="14">R14 · 普通领袖</option>
        <option value="15" disabled={!encounter.rounds[15]}>{encounter.rounds[15] ? 'R15 · 隐秘核心' : 'R15 · 无隐秘变体'}</option>
      </select></label>
    </div>
    <p className="boss-section-kicker">终极模拟 · 模式血量与开场面板</p>
    {wave && <>
      <StatList stats={wave.stats} leader />
      <p className="boss-section-kicker">随行敌人 · 单人场 / 双人场</p>
      <div className="boss-wave-list">
        {wave.attendants.map(([name, category, solo, pair, stats, healthUnit]) => <details key={`${name}-${category}`}>
          <summary><strong>{name}</strong><small>{category}</small><span>{solo} / {pair}</span></summary>
          <StatList stats={stats} healthUnit={healthUnit} />
        </details>)}
      </div>
    </>}
    <small className="boss-source">领袖血量取客户端模式配置，其余数值为社区开场推算，技能和形态加成另计。随行数量按单场模板统计。来源：{BOSS_RESEARCH_SOURCE}。</small>
  </div>;
}

function BattleRouteImages({ onOpenImage, leader }: OpenImage & { leader?: ReportLeader }) {
  const [boss, setBoss] = useState<number | null>(!leader ? 0 : leader.encounter.id === 'enemy_2124_dyjsfg' ? 1 : null);
  const [highDifficulty, setHighDifficulty] = useState<boolean | null>(leader ? leader.highDifficulty ?? null : true);
  const [terrain, setTerrain] = useState<number | null>(leader ? null : 0);
  const guide = boss === null ? null : BOSS_ROUTE_GUIDES[boss];
  const difficulty = highDifficulty ? '终极 / 绝境' : '险境 / 标准';
  const crop = guide && highDifficulty !== null && (!highDifficulty || terrain !== null)
    ? `/assets/boss-routes/${guide.id}-${highDifficulty && terrain !== null ? terrain + 1 : 10}.png` : '';
  const title = `${guide?.title} · ${difficulty}${highDifficulty && terrain !== null ? ` · ${BOSS_ROUTE_TERRAINS[terrain]}` : ''}`;
  return <div className="boss-route-layout">
    <div className="boss-route-controls">
      <label>Boss<select aria-label="选择 Boss 路线" value={boss ?? ''} onChange={e => setBoss(Number(e.target.value))}><option value="" disabled>请选择路线</option>{BOSS_ROUTE_GUIDES.map((item, index) => <option key={item.id} value={index}>{item.title}</option>)}</select></label>
      <label>难度<select aria-label="选择路线难度" value={highDifficulty === null ? '' : String(highDifficulty)} onChange={e => setHighDifficulty(e.target.value === 'true')}><option value="" disabled>请选择难度</option><option value="true">终极 / 绝境</option><option value="false">险境 / 标准</option></select></label>
      {highDifficulty && <label>对照地形<select aria-label="选择路线地形" value={terrain ?? ''} onChange={e => setTerrain(Number(e.target.value))}><option value="" disabled>请选择地形</option>{BOSS_ROUTE_TERRAINS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>}
    </div>
    {!crop && <p>{!guide ? '请手选要对照的路线。' : highDifficulty === null ? '请手选路线难度。' : '战报未包含地形，请按本局地形选择。'}</p>}
    {crop && <>
    <p className="boss-route-sequence"><span>青色左路 L1 → L2 → L3 → L1</span><span>黄色右路 R1 → R2 → R3 → R1</span></p>
    <button className="boss-route-image" onClick={() => onOpenImage(crop, title)} aria-label="放大当前 Boss 路线"><img src={crop} alt={title} /></button>
    <p>{boss === 0 ? '右路 R1 在中央下端，先去右侧 R2，再回中央上端 R3。' : '右路 R1 在中央上端，先去右侧 R2，再回中央下端 R3。'} 左路均从中央上端 L1 出发。</p>
    </>}
    {guide && <button className="boss-route-original" onClick={() => onOpenImage(guide.url, guide.title)}>查看完整路线总图 · 对照地形</button>}
    <small className="boss-source">来源：用户提供的 @明日方舟吧 路线图。路线表示行进方向；按本局地形核对攻击范围。</small>
  </div>;
}

export function BossRoutes({ onOpenImage, leader }: OpenImage & { leader?: ReportLeader }) {
  const [view, setView] = useState<(typeof views)[number]>(leader ? '领袖与随从' : '实战路线图');
  return <section className="boss-routes" aria-label="Boss 属性与路线">
    <div className="boss-view-tabs" role="group" aria-label="Boss 资料分类">
      {views.map(label => <button key={label} type="button" aria-pressed={view === label} onClick={() => setView(label)}>{label}</button>)}
    </div>
    <div hidden={view !== '实战路线图'}><BattleRouteImages onOpenImage={onOpenImage} leader={leader} /></div>
    <div hidden={view !== '领袖与随从'}><BossStatsPanel leader={leader} /></div>
    <div hidden={view !== '巡逻点位'}><BossPatrol /></div>
  </section>;
}
