// 青逝痕 Tenkinoko 制作
import { useId, useState } from 'react';
import { PATROL_BOARDS, PATROL_SPAWN, PATROL_WAYPOINTS, type PatrolBoard } from '../data/bossPatrolData';

const patrolBosses = ['假想敌：铳', '假想敌：鳍', '矩兽'] as const;
const sides = ['双路', '左路', '右路'] as const;
const cell = 32;
const tileStyles: Record<string, { color: string; name: string }> = {
  '#': { color: '#181d1b', name: '边界' }, '.': { color: '#303a32', name: '地面' },
  '^': { color: '#43596d', name: '不可部署地面' }, W: { color: '#101614', name: '障碍' },
  B: { color: '#204a6f', name: '目标点' }, T: { color: '#584861', name: '传送点' },
  S: { color: '#4b4a33', name: '特殊地块' }, I: { color: '#654330', name: '侵蚀地块' },
  M: { color: '#3c4a47', name: '沼泽' }, G: { color: '#3d5336', name: '草地' },
  A: { color: '#66603a', name: '加速地块' },
};

const center = ([x, y]: readonly [number, number]) => [(x + 0.5) * cell, (y + 0.5) * cell] as const;
const spawn = center(PATROL_SPAWN);

function PatrolBoardView({ board, boss, side }: { board: PatrolBoard; boss: string; side: (typeof sides)[number] }) {
  const id = useId();
  const routes = [
    { name: '左路', color: '#89e5df', points: PATROL_WAYPOINTS.left },
    { name: '右路', color: '#f9d869', points: boss === '矩兽' ? PATROL_WAYPOINTS.rightBeast : PATROL_WAYPOINTS.right },
  ].filter(route => side === '双路' || side === route.name);
  const boardWidth = 17 * cell;
  const boardHeight = 5 * cell;
  return <svg viewBox={`0 0 ${boardWidth} ${boardHeight}`} role="img" aria-label={`${boss} · 战场 #${board.id} · ${side}巡逻点位示意`}>
    <defs>{routes.map(({ name, color }, index) => <marker key={name} id={`${id}-${index}`} viewBox="0 0 8 8" refX="4" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M0 0 L8 4 L0 8 Z" fill={color} />
    </marker>)}</defs>
    {board.tiles.flatMap((row, y) => [...row].map((kind, x) => <rect key={`${x}/${y}`} x={x * cell + 0.5} y={y * cell + 0.5} width={cell - 1} height={cell - 1} fill={tileStyles[kind].color} />))}
    {board.objects.map(([x, y, kind]) => <g key={`${x}/${y}`} transform={`translate(${x * cell + 2} ${y * cell + 2})`}>
      <rect width={kind === '箱台' ? 22 : 13} height="12" rx="1" fill="#65462a" stroke="#cb9760" />
      <text x="2" y="9" fontSize="9" fill="#ffdcab">{kind}</text>
    </g>)}
    {routes.map(({ name, color, points }, index) => {
      const stops = [spawn, ...points.map(center)];
      const ends = [...stops.slice(1), stops[1]];
      return <g key={name}>
        {stops.map(([x, y], i) => {
          const [endX, endY] = ends[i];
          return <polyline key={i} points={`${x},${y} ${(x + endX) / 2},${(y + endY) / 2} ${endX},${endY}`}
            stroke={color} strokeWidth="1.8" strokeDasharray={i === 0 ? '2 4' : '5 4'} fill="none" markerMid={`url(#${id}-${index})`} />;
        })}
        {stops.slice(1).map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="9" fill="#141c1b" stroke={color} strokeWidth="1.4" />
          <text y="4" textAnchor="middle" fontWeight="bold" fontSize="12" fill={color}>{i + 1}</text>
        </g>)}
      </g>;
    })}
    <g transform={`translate(${spawn.join(' ')})`}>
      <circle r="9" fill="#232821" stroke="#dce3dd" />
      <text y="4" textAnchor="middle" fontSize="10" fill="#fff">出</text>
    </g>
  </svg>;
}

export function BossPatrol() {
  const [boss, setBoss] = useState<(typeof patrolBosses)[number]>('假想敌：铳');
  const [boardId, setBoardId] = useState('01');
  const [side, setSide] = useState<(typeof sides)[number]>('双路');
  const board = PATROL_BOARDS.find(item => item.id === boardId) ?? PATROL_BOARDS[0];
  return <div className="boss-patrol">
    <div className="boss-route-controls">
      <label>领袖<select aria-label="选择巡逻领袖" value={boss} onChange={e => setBoss(e.target.value as typeof boss)}>{patrolBosses.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>战场<select aria-label="选择巡逻战场" value={boardId} onChange={e => setBoardId(e.target.value)}>{PATROL_BOARDS.map(item => <option key={item.id} value={item.id}>战场 #{item.id}</option>)}</select></label>
      <label>看哪一路<select aria-label="选择巡逻方向" value={side} onChange={e => setSide(e.target.value as typeof side)}>{sides.map(name => <option key={name}>{name}</option>)}</select></label>
    </div>
    <p className="boss-section-kicker">R14 · 普通领袖巡逻 · {boardId === '01' ? '标准 / 险境' : '险境 / 绝境 / 终极'}</p>
    <figure>
      <PatrolBoardView board={board} boss={boss} side={side} />
      <figcaption className="boss-route-sequence">
        {side !== '右路' && <span className="patrol-left">青 · 左路</span>}{side !== '左路' && <span className="patrol-right">黄 · 右路</span>}
        <span>出生 → 1 → 2 → 3 → 1</span>
      </figcaption>
    </figure>
    <div className="boss-patrol-legend" aria-label="战场图例">
      {Object.entries(tileStyles).filter(([kind]) => kind !== '#' && board.tiles.some(row => row.includes(kind))).map(([kind, style]) => <span key={kind}><i style={{ backgroundColor: style.color }} />{style.name}</span>)}
      {board.objects.length > 0 && <span>箱 / 台：初始箱子 / 平台</span>}
    </div>
    <p>{boss === '矩兽' ? '矩兽右路先走上侧的 1 号点。' : '铳、鳍右路先走下侧的 1 号点。'} 单人模板仅走左路。</p>
    <small className="boss-source">虚线表示巡逻顺序。具体拐弯取决于地形和装置。战场编号独立于 2D 站位图。来源：客户端 6f63c14e · act3autochess（h07_02、h07_10、h07_11）。</small>
  </div>;
}
