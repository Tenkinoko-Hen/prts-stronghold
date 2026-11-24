// 青逝痕 Tenkinoko 制作
import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CompPhase } from '../data/strongholdData';
import { DerivedText } from '../components/DerivedText';

const contours = [[84, 105, 1, .76, 10], [180, 74, 1.22, .74, 12], [249, 166, .92, 1.27, 13],
  [102, 209, 1.14, 1.13, 14], [195, 242, .8, .6, 7]].flatMap(([x, y, sx, sy, count], basin) =>
  Array.from({ length: count }, (_, k) => Array.from({ length: 60 }, (_, j) => {
    const angle = j / 60 * Math.PI * 2;
    const r = (9 + k * 5.1) * (1 + .14 * Math.sin(3 * angle + basin) + .1 * Math.sin(5 * angle + k / 9));
    return `${(x + r * sx * Math.cos(angle)).toFixed(1)},${(y + r * sy * Math.sin(angle)).toFixed(1)}`;
  }).join(' ')));

function RouteDial({ count, current, selected }: { count: number; current: number; selected: number }) {
  const id = useId();
  const route = [[44, 216], [77, 200], [102, 179], [132, 179], [161, 146], [195, 138], [217, 110], [270, 85]];
  const nodes = Array.from({ length: count }, (_, i) => {
    const position = 1 + (route.length - 2) * (count === 1 ? .5 : i / (count - 1));
    const start = route[Math.floor(position)];
    const end = route[Math.ceil(position)];
    return start.map((value, coord) => value + (end[coord] - value) * (position % 1));
  });
  return <svg viewBox="0 0 320 320" aria-hidden="true">
    <defs>
      <clipPath id={`${id}-terrain`}><circle cx="160" cy="160" r="135" /></clipPath>
      <pattern id={`${id}-grid`} width="18" height="18" patternUnits="userSpaceOnUse"><path d="M18 0H0V18" fill="none" stroke="#70756b" strokeWidth=".4" /></pattern>
    </defs>
    <circle cx="160" cy="160" r="153" fill="#171919" stroke="#82857d" />
    <circle cx="160" cy="160" r="145" fill="none" stroke="#aaa99c" strokeWidth="3" strokeDasharray="1 6.5" />
    <circle cx="160" cy="160" r="135" fill="#242920" stroke="#8a8e82" />
    <g clipPath={`url(#${id}-terrain)`}>
      <circle cx="160" cy="160" r="135" fill={`url(#${id}-grid)`} />
      <g fill="none" stroke="#7b8374" strokeWidth=".65" opacity=".62">{contours.map((points, i) => <polygon key={i} points={points} />)}</g>
      <polyline points={route.join(' ')} fill="none" stroke="#fbe634" strokeWidth="23" opacity=".18" />
      <polyline points={route.join(' ')} fill="none" stroke="#fbe634" strokeWidth="2.5" />
      <polyline points={route.join(' ')} transform="translate(2 9)" fill="none" stroke="#fbe634" strokeDasharray="3 5" />
    </g>
    {nodes.map(([x, y], i) => <g key={i}>
      {i === selected && <circle cx={x} cy={y} r="17" fill="#fbe634" opacity=".24" />}
      <circle cx={x} cy={y} r="9" fill={i === current ? '#fbe634' : '#202322'} stroke="#f9efae" strokeWidth="2" />
      <text x={x} y={y + 3.5} fill={i === current ? '#171919' : '#f9efae'} textAnchor="middle" fontSize="10" fontWeight="bold">{i + 1}</text>
    </g>)}
    <path d="M36 81 A145 145 0 0 1 117 20 M293 219 A145 145 0 0 1 214 295" fill="none" stroke="#e7e9dc" strokeWidth="4" />
    <path d="M32 230 A145 145 0 0 0 171 305" fill="none" stroke="#fbe634" strokeWidth="4" />
  </svg>;
}

export function DesktopRouteOverview({ phases, initialIndex, automaticIndex, round, action, onPreview }: {
  phases: CompPhase[]; initialIndex: number; automaticIndex: number; round: number; action: string; onPreview(index: number): void;
}) {
  const [selected, setSelected] = useState(initialIndex);
  const phase = phases[selected];
  return <div className="d-route-overview">
    <nav aria-label="选择总览阶段">{phases.map((item, i) => <button key={item.phaseName} aria-pressed={i === selected} onClick={() => setSelected(i)}>
      <small>{`0${i + 1}`.slice(-2)} / {item.rounds}{i === automaticIndex && ' · 当前'}</small>
      <strong>{item.phaseName}</strong>
    </button>)}</nav>
    <figure><RouteDial count={phases.length} current={automaticIndex} selected={selected} />
      <figcaption>◆ {selected === automaticIndex ? '当前阶段' : '预览阶段'} · {phase.rounds}</figcaption>
    </figure>
    <aside className="d-route-brief">
      <small>R{round} / 15 · 本回合指令</small><p><DerivedText text={action} /></p>
      <h3>{phase.phaseName}</h3><p>{phase.shopTier} · {phase.covenantTarget}</p>
      <button className="d-button d-small" onClick={() => onPreview(selected)}>查看阶段编队<ChevronRight size={14} /></button>
    </aside>
  </div>;
}
