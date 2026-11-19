import React, { useState } from 'react';
import { COVENANT_GUIDES, SUB_COVENANT_GUIDES, TACTICAL_MAPS, TRANSFER_ITEM_RECIPES, UNIVERSAL_STACKERS, UPLOADED_GALLERY_ITEMS } from '../data/strongholdData';
import { calculateStackingProjection } from '../utils/tacticalLogic';
import { BossRoutes } from '../components/BossRoutes';
import { AegirReferenceButton, AegirReferenceGallery } from '../components/AegirReferenceGallery';

export function MobileReference({ onOpenImage }: { onOpenImage: (url: string, title: string) => void }) {
  const [tab, setTab] = useState('原图');
  const [query, setQuery] = useState('');
  const [mapId, setMapId] = useState(TACTICAL_MAPS[0].id);
  const [boss, setBoss] = useState(true);
  const [placement, setPlacement] = useState<string | null>(null);
  const [field, setField] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [rounds, setRounds] = useState(5);
  const [price, setPrice] = useState(6);
  const [triggers, setTriggers] = useState(8);
  const [base, setBase] = useState(2);
  const [cap, setCap] = useState(24);
  const map = TACTICAL_MAPS.find(item => item.id === mapId)!;
  const layout = boss ? map.bossStage : map.midStage;
  const selected = layout.placements.find(item => item.id === placement);
  const projection = calculateStackingProjection({ activeFieldIds: field, activeBenchIds: bench, frontTargetSellPrice: price, combatTriggerCount: triggers, baseStacksPerTrigger: base, baseCombatCap: cap, rounds });
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(item => item !== id) : [...list, id];

  return <div className={`m-reference ${tab === 'Boss路线' ? 'is-boss-routes' : ''}`}>
    <div className="m-section-heading"><div><span className="m-eyebrow">REFERENCE / 随时查阅</span><h1>资料手册</h1></div></div>
    <div className="m-chips">{['原图', 'Boss路线', '盟约', '转职', '站位', '阿戈尔', '叠层'].map(label => <button key={label} aria-pressed={tab === label} onClick={() => { setTab(label); setQuery(''); }}>{label}</button>)}</div>
    {tab === 'Boss路线' && <BossRoutes onOpenImage={onOpenImage} />}
    {tab === '阿戈尔' && <AegirReferenceGallery />}
    {['原图', '盟约', '转职'].includes(tab) && <input className="m-input" aria-label="搜索资料" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索名称或关键词" />}
    {tab === '原图' && <><p className="m-muted">{UPLOADED_GALLERY_ITEMS.length} 张原始资料，点击查看与放大。</p><div className="m-gallery">{UPLOADED_GALLERY_ITEMS.filter(item => JSON.stringify(item).includes(query.trim())).map(item => <button key={item.id} onClick={() => onOpenImage(item.url, item.title)}><img loading="lazy" src={item.url} alt="" /><strong>{item.title}</strong></button>)}</div></>}
    {tab === '盟约' && [...COVENANT_GUIDES, ...SUB_COVENANT_GUIDES].filter(item => JSON.stringify(item).includes(query.trim())).map(item => <details className="m-card" key={item.id}><summary>{item.name}<span>{item.difficulty}</span></summary><p>{item.subtitle}</p><h3>盟约效果</h3><p>{item.pactSummary}</p><h3>叠层核心</h3><p>{item.stackCore}</p><div className="m-tags">{item.synergySubPacts.map((tag, i) => <span key={i}>{tag}</span>)}</div>{item.operators.map((op, i) => <div className="m-reference-row" key={i}><h3>{op.name} · {op.tier}</h3><small>{op.category}</small><p>{op.effect}</p></div>)}<ul>{item.proTips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>{item.imageUrl && <button className="m-secondary" onClick={() => onOpenImage(item.imageUrl, item.name)}>查看原图</button>}</details>)}
    {tab === '转职' && <><p className="m-muted">变形同构体 [VI] ＋ 催化装备 → 目标转职</p>{TRANSFER_ITEM_RECIPES.filter(item => JSON.stringify(item).includes(query.trim())).map(item => <details className="m-card" key={item.id}><summary>{item.targetCovenant}<span>{item.category}</span></summary><p className="m-highlight">变形同构体 [VI] ＋ {item.baseEquipmentName} [{item.equipmentTier}]</p><p>{item.tacticalNote}</p><p>免费来源：{item.freeSourceOperators.join('、') || '无固定来源'}</p><p>推荐携带：{item.bestRecipients.join('、')}</p></details>)}</>}
    {tab === '站位' && <>
      <div className="m-two-buttons">
        <button className="m-action-pill" onClick={() => setTab('Boss路线')}>查看 Boss 行进路线</button>
        <AegirReferenceButton className="m-action-pill m-aegir-button" mapId={map.id} stage={boss ? 'Boss战' : '道中'} />
      </div>
      <details className="m-card"><summary>选择地图<span>{map.shortName}</span></summary><div className="m-map-picker">{TACTICAL_MAPS.map(item => <button className="m-secondary" key={item.id} aria-pressed={mapId === item.id} onClick={() => { setMapId(item.id); setPlacement(null); }}>{item.name}</button>)}</div></details>
      <div className="m-chips">{[false, true].map(isBoss => <button key={String(isBoss)} aria-pressed={boss === isBoss} onClick={() => { setBoss(isBoss); setPlacement(null); }}>{isBoss ? 'Boss 战' : '道中'}</button>)}</div>
      <section className="m-card"><h2>{map.shortName} · {layout.stageName}</h2><p>{map.summary}</p><p>{layout.description}</p>
        <div className="m-board">{layout.tiles.flatMap((row, z) => row.map((tile, x) => {
          const ops = layout.placements.filter(op => op.x === x && op.z === z);
          const zone = layout.bossDangerZone;
          const danger = zone && x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
          return <button key={`${x}-${z}`} className={`tile-${tile} ${danger ? 'is-danger' : ''}`} disabled={!ops.length} aria-label={ops.length ? ops.map(op => op.label).join('、') : `${x + 1},${z + 1} ${tile}`} onClick={() => setPlacement(ops[0]?.id || null)}>{ops[0] ? `${ops[0].priority}${ops[0].direction}` : tile === 'blueGate' ? '蓝' : tile === 'redGate' ? '红' : ''}</button>;
        }))}</div><p className="m-footnote">数字为部署优先级，箭头为朝向；点格子看职责。红框为危险区。</p>
        {selected && <div className="m-notice"><h3>{selected.label} · {selected.direction}</h3><p>{selected.tip}</p><p>{selected.recommendedOps.join('、')}</p></div>}
        <ul>{layout.tacticalNotes.map((line, i) => <li key={i}>{line}</li>)}</ul>
        <details><summary>全部部署点</summary>{layout.placements.map(item => <div className="m-reference-row" key={item.id}><h3>{item.priority}. {item.label} · {item.direction}</h3><p>{item.tip}</p><p>{item.recommendedOps.join('、')}</p></div>)}</details>
        <button className="m-secondary m-wide" onClick={() => onOpenImage(map.imageUrl, map.name)}>打开原始站位图</button>
      </section>
    </>}
    {tab === '叠层' && <>
      <section className="m-card"><h2>叠层估算</h2><p className="m-footnote">沿用桌面计算规则，估算值以实际触发次数为准。</p>
        <div className="m-number-grid">{([
          ['预计回合', rounds, setRounds, 1, 15], ['目标售价', price, setPrice, 1, 99], ['每回合触发', triggers, setTriggers, 0, 99], ['基础每次叠层', base, setBase, 0, 99], ['战斗基础上限', cap, setCap, 0, 999],
        ] as const).map(([label, value, setter, min, max]) => <label className="m-field" key={label}>{label}<input type="number" min={min} max={max} value={value} onChange={e => setter(Math.max(min, Math.min(max, Number(e.target.value) || min)))} /></label>)}</div>
        <div className="m-result"><span>每回合 <strong>{projection.totalStacksPerRound}</strong></span><span>{rounds} 回合 <strong>{projection.projectedTotalStacks}</strong></span></div>
        <p>远见 80 层：{projection.foresight80Unlocked ? '已达' : '未达'} · 190 层：{projection.foresight190Unlocked ? '已达' : '未达'}</p>
        <details><summary>计算明细</summary><ul>{projection.breakdown.map((line, i) => <li key={i}>{line.label}：{line.value}</li>)}</ul></details>
      </section>
      <h2>上场与整备区</h2><p className="m-muted">同一干员只选一个位置。</p>
      {UNIVERSAL_STACKERS.map(op => <details className="m-card" key={op.id}><summary>{op.name} · {op.tier}<span>{field.includes(op.id) ? '已上场' : bench.includes(op.id) ? '整备区' : op.tag}</span></summary><p>{op.description}</p><p>{op.timing} · {op.targetZone}</p><p>搭档：{op.bestPartner}</p><div className="m-two-buttons"><button className="m-secondary" aria-pressed={field.includes(op.id)} onClick={() => { setField(toggle(field, op.id)); setBench(bench.filter(id => id !== op.id)); }}>上场 {field.includes(op.id) ? '✓' : ''}</button>{op.worksOnBench && <button className="m-secondary" aria-pressed={bench.includes(op.id)} onClick={() => { setBench(toggle(bench, op.id)); setField(field.filter(id => id !== op.id)); }}>整备区 {bench.includes(op.id) ? '✓' : ''}</button>}</div></details>)}
    </>}
  </div>;
}
