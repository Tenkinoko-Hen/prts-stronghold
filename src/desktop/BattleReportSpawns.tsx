import { useState } from 'react';
import { Crown, Layers, List, ScanFace } from 'lucide-react';
import { confirmedCurrent, resolvePreviewRound, visibleSpawnRows, type BattleReport, type PreviewRoundFilter } from './battleReportData';
import { ReportRoundTimeline } from './ReportRoundTimeline';
import portraits from './enemyPortraits.json';

const slots = new Map(portraits.ids.map((id, index) => [id, index]));
const atlasRows = Math.ceil(portraits.ids.length / portraits.columns);
export const batchName = (value: number | null) => value === null ? '未定位' : value < 0 ? '额外出怪' : `第 ${value + 1} 批`;

export function EnemyAvatar({ id, size = 22 }: { id?: string; size?: number }) {
  const index = id ? slots.get(id) : undefined;
  if (index === undefined) {
    return <span className="d-report-no-portrait" aria-hidden="true" style={{ width: size, height: size, flexBasis: size }}><ScanFace size={Math.round(size * 0.68)} /></span>;
  }
  return <span className="d-report-portrait" aria-hidden="true" style={{
    width: size,
    height: size,
    flexBasis: size,
    backgroundSize: `${portraits.columns * 100}% ${atlasRows * 100}%`,
    backgroundPosition: `${(index % portraits.columns) * 100 / (portraits.columns - 1)}% ${Math.floor(index / portraits.columns) * 100 / (atlasRows - 1)}%`,
  }} />;
}

export function EnemyLabel({ id, name, count }: { id?: string; name?: string; count?: number | null }) {
  if (!name) return <>—</>;
  return <span className="d-report-enemy" title={name}><EnemyAvatar id={id} /><span className="d-enemy-name">{name}</span>{count !== undefined && <strong>×{count ?? '—'}</strong>}</span>;
}

type Spawn = BattleReport['preview'][number];
function summarizeRoundEnemies(batches: Map<string, Spawn[]>) {
  const merged = new Map<string, { id: string; name: string; count: number | null; boss?: true }>();
  for (const enemies of batches.values()) {
    for (const enemy of enemies) {
      const key = `${enemy.boss ? '1' : '0'}:${enemy.id}:${enemy.name}`;
      const existing = merged.get(key);
      if (!existing) merged.set(key, { id: enemy.id, name: enemy.name, count: enemy.count, boss: enemy.boss });
      else if (enemy.count !== null) existing.count = (existing.count ?? 0) + enemy.count;
    }
  }
  return [...merged.values()].sort((a, b) => Number(Boolean(b.boss)) - Number(Boolean(a.boss)));
}

export function SpawnRounds({ rows, current, byBatch = false }: { rows: Spawn[]; current?: number | null; byBatch?: boolean }) {
  const groups = new Map<number, Map<string, Spawn[]>>();
  for (const enemy of rows) {
    const batches = groups.get(enemy.round) ?? new Map<string, Spawn[]>();
    const batch = enemy.boss ? '领袖' : batchName(enemy.action);
    const enemies = batches.get(batch) ?? [];
    enemies.push(enemy);
    batches.set(batch, enemies);
    groups.set(enemy.round, batches);
  }
  return <div className="d-spawn-rounds" data-mode={byBatch ? 'batch' : 'summary'}>{[...groups].map(([number, batches]) => {
    const keyWave = [9, 12, 15].includes(number) || batches.has('领袖');
    const summary = byBatch ? null : summarizeRoundEnemies(batches);
    return <section key={number} className="d-spawn-round" aria-label={`R${number} 波次`} data-key-wave={keyWave}>
      <header>
        <div className="d-spawn-round-id"><b>R{number}</b>{number === current && <small>当前</small>}</div>
        <div className="d-spawn-round-tags">
          {keyWave && <span className="d-key-wave"><Crown size={11} />首领波次</span>}
          <span className="d-spawn-meta">{batches.size} 批</span>
        </div>
      </header>
      {summary ? <div className="d-spawn-summary">{summary.map(enemy =>
        <EnemyLabel key={`${enemy.id}-${enemy.name}`} id={enemy.id} name={enemy.name} count={enemy.count} />
      )}</div> : <div className="d-spawn-batches">{[...batches].map(([batch, enemies]) => <div className="d-spawn-batch" key={batch}>
        <small>{batch}</small>{enemies.map((enemy, i) => <EnemyLabel key={`${enemy.id}-${i}`}
          id={enemy.id} name={enemy.name} count={enemy.count} />)}
      </div>)}</div>}
    </section>;
  })}</div>;
}

export function SpawnPreview({ report, filter, onSelect, live = false }: {
  report?: BattleReport; filter: PreviewRoundFilter; onSelect(round: PreviewRoundFilter): void; live?: boolean;
}) {
  const [kind, setKind] = useState<'plan' | 'battle'>('plan');
  const [layout, setLayout] = useState<'summary' | 'batch'>('summary');
  const plans = report?.preview.some(row => row.kind === 'plan');
  const hasBattle = report?.preview.some(row => row.kind === 'battle');
  const battle = hasBattle && (!plans || kind === 'battle');
  const all = visibleSpawnRows(report, battle ? 'battle' : 'plan', '', '');
  const first = resolvePreviewRound(report, 'follow');
  const current = confirmedCurrent(report);
  const rows = all.filter(row => typeof filter === 'number' ? row.round === filter
    : filter === 'all' || first === 'all' || row.round >= first);
  const rounds = [...new Set(all.map(row => row.round))];
  const byBatch = typeof filter === 'number' || layout === 'batch';
  return <div className="d-spawn-view">
    <header className="d-report-heading"><h2>出怪预告</h2>
      <div className="d-spawn-controls">
        {typeof filter !== 'number' && <div className="d-spawn-mode" role="group" aria-label="显示方式">
          <button type="button" className="d-button d-small" aria-pressed={!byBatch} onClick={() => setLayout('summary')}>
            <Layers size={13} />按怪汇总</button>
          <button type="button" className="d-button d-small" aria-pressed={byBatch} onClick={() => setLayout('batch')}>
            <List size={13} />按批次</button>
        </div>}
        {plans && hasBattle && <select aria-label="编排来源" value={battle ? 'battle' : 'plan'}
          onChange={e => { const next = e.target.value as 'plan' | 'battle'; setKind(next);
            if (typeof filter === 'number' && !report?.preview.some(row => row.kind === next && row.round === filter)) onSelect('all');
          }}><option value="plan">预告</option><option value="battle">实战编排</option></select>}
        <ReportRoundTimeline selected={filter} first={first} available={rounds} onSelect={onSelect} />
      </div>
    </header>
    {filter === 'follow' && report && !current && <p className="d-muted">{first === 'all'
      ? '当前回合未确认，先显示全部预告' : `当前回合未确认，暂从 R${first} 显示`}</p>}
    {rows.length ? <SpawnRounds rows={rows} current={live ? current : null} byBatch={byBatch} /> : <p className="d-muted d-report-note">
      {typeof filter === 'number' ? `R${filter} ` : ''}暂无{battle ? '实战编排' : '出怪预告'}。</p>}
  </div>;
}
