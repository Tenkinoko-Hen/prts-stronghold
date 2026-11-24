// 青逝痕 Tenkinoko 制作
import { reference, strategiesFor } from './referenceData';
import './reference.css';

export function StrategyBadge({ text, detailed = false }: { text: string; detailed?: boolean }) {
  const strategies = strategiesFor(text);
  return <span className={`strategy-badge ${detailed ? 'is-detailed' : ''}`}>
    <span className="strategy-heading" title={text}><span className="strategy-faces">{strategies.map(strategy => <img key={strategy.name} src={strategy.image} alt={`${strategy.name}策略头像`} title={`${strategy.name} · ${strategy.title}`} />)}</span><span>{text}</span></span>
    {detailed && strategies.map(strategy => <span className="strategy-effect" key={strategy.name}><strong>{strategy.name} · {strategy.title}</strong><span>{strategy.effect}</span></span>)}
    {detailed && strategies.length > 0 && <small className="reference-caption">PRTS 盟约记录快照 · {reference.date}；与游戏不同时以本局为准。</small>}
  </span>;
}
