import { useState } from 'react';
import { BOSS_ROUTE_GUIDES, BOSS_ROUTE_TERRAINS } from '../data/bossRoutes';
import './bossRoutes.css';

export function BossRoutes({ onOpenImage }: { onOpenImage(url: string, title: string): void }) {
  const [boss, setBoss] = useState(0);
  const [highDifficulty, setHighDifficulty] = useState(true);
  const [terrain, setTerrain] = useState(0);
  const guide = BOSS_ROUTE_GUIDES[boss];
  const difficulty = highDifficulty ? '终极 / 绝境' : '险境 / 标准';
  const crop = `/assets/boss-routes/${guide.id}-${highDifficulty ? terrain + 1 : 10}.png`;
  const title = `${guide.title} · ${difficulty}${highDifficulty ? ` · ${BOSS_ROUTE_TERRAINS[terrain]}` : ''}`;
  return <section className="boss-routes" aria-label="Boss 路线图">
    <div className="boss-route-controls">
      <label>Boss<select aria-label="选择 Boss 路线" value={boss} onChange={e => setBoss(Number(e.target.value))}>{BOSS_ROUTE_GUIDES.map((item, index) => <option key={item.id} value={index}>{item.title}</option>)}</select></label>
      <label>难度<select aria-label="选择路线难度" value={String(highDifficulty)} onChange={e => setHighDifficulty(e.target.value === 'true')}><option value="true">终极 / 绝境</option><option value="false">险境 / 标准</option></select></label>
      {highDifficulty && <label>对照地形<select aria-label="选择路线地形" value={terrain} onChange={e => setTerrain(Number(e.target.value))}>{BOSS_ROUTE_TERRAINS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>}
    </div>
    <p className="boss-route-sequence"><span>青色左路 L1 → L2 → L3 → L1</span><span>黄色右路 R1 → R2 → R3 → R1</span></p>
    <button className="boss-route-image" onClick={() => onOpenImage(crop, title)} aria-label="放大当前 Boss 路线"><img src={crop} alt={title} /></button>
    <p>{boss === 0 ? '右路 R1 在中央下端，先去右侧 R2，再回中央上端 R3。' : '右路 R1 在中央上端，先去右侧 R2，再回中央下端 R3。'} 左路均从中央上端 L1 出发。</p>
    <button className="boss-route-original" onClick={() => onOpenImage(guide.url, guide.title)}>查看完整路线总图 · 对照地形</button>
    <small>来源：用户提供的 @明日方舟吧 路线图。路线表示行进方向，不代表攻击范围；按本局地形核对。</small>
  </section>;
}
