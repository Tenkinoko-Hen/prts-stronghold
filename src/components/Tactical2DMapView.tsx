import React, { useEffect, useState } from 'react';
import { DesktopDialog } from '../desktop/DesktopDialog';
import { BossRoutes } from './BossRoutes';
import { AegirReferenceButton } from './AegirReferenceGallery';
import {
  OperatorPlacement,
  TACTICAL_MAPS,
  TacticalMapData,
  TileKind,
} from '../data/strongholdData';
import {
  getStageRiskSummary,
  isInsideBossDangerZone,
} from '../utils/tacticalLogic';
import { OperatorAvatar } from './OperatorAvatar';
import { getPrimaryOperatorAvatar } from '../data/prtsAvatars';
import {
  Eye,
  ShieldAlert,
  Crosshair,
  Maximize2,
  Grid,
  Image as ImageIcon,
} from 'lucide-react';

interface Tactical2DMapViewProps {
  selectedMapId: string;
  onSelectMapId: (id: string) => void;
  stageMode: '道中' | 'Boss战';
  onChangeStageMode: (mode: '道中' | 'Boss战') => void;
  selectedPlacement: OperatorPlacement | null;
  onSelectPlacement: (p: OperatorPlacement) => void;
  onOpenImage: (url: string, title: string) => void;
}

const TILE_STYLES: Record<
  TileKind,
  { bg: string; border: string; label: string; labelColor: string }
> = {
  ground: {
    bg: 'bg-[#141C2B]',
    border: 'border-slate-800/90',
    label: '',
    labelColor: 'text-slate-600',
  },
  high: {
    bg: 'bg-[#22304A]',
    border: 'border-slate-600/80',
    label: '高台',
    labelColor: 'text-slate-400/70',
  },
  hole: {
    bg: 'bg-[#07090E]',
    border: 'border-slate-900',
    label: '落穴',
    labelColor: 'text-slate-600',
  },
  box: {
    bg: 'bg-[#2D241E]',
    border: 'border-amber-900/60',
    label: '障碍',
    labelColor: 'text-amber-500/70',
  },
  special: {
    bg: 'bg-[#2A1B3D]',
    border: 'border-purple-500/50',
    label: '装置',
    labelColor: 'text-purple-300/80',
  },
  blueGate: {
    bg: 'bg-sky-950/90',
    border: 'border-sky-400',
    label: '蓝门',
    labelColor: 'text-sky-300 font-bold',
  },
  redGate: {
    bg: 'bg-red-950/90',
    border: 'border-red-500',
    label: '红门',
    labelColor: 'text-red-300 font-bold',
  },
};

const ROLE_SLOT_STYLES: Record<
  OperatorPlacement['role'],
  { pillBg: string; ring: string; tagText: string }
> = {
  输出: {
    pillBg: 'bg-red-600 text-white border-red-300',
    ring: 'ring-2 ring-red-500 border-red-400 bg-red-950/80',
    tagText: 'text-red-300',
  },
  重装: {
    pillBg: 'bg-emerald-600 text-white border-emerald-300',
    ring: 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-950/80',
    tagText: 'text-emerald-300',
  },
  奶: {
    pillBg: 'bg-sky-600 text-white border-sky-300',
    ring: 'ring-2 ring-sky-400 border-sky-300 bg-sky-950/80',
    tagText: 'text-sky-300',
  },
};

export const Tactical2DMapView: React.FC<Tactical2DMapViewProps> = ({
  selectedMapId, onSelectMapId, stageMode, onChangeStageMode, selectedPlacement, onSelectPlacement, onOpenImage,
}) => {
  const [displayMode, setDisplayMode] = useState<'split' | 'original'>('split');
  const [showDangerZone, setShowDangerZone] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);
  const activeMap = TACTICAL_MAPS.find(map => map.id === selectedMapId) || TACTICAL_MAPS[0];
  const currentLayout = stageMode === '道中' ? activeMap.midStage : activeMap.bossStage;
  const riskSummary = getStageRiskSummary(currentLayout);
  const placements = new Map(currentLayout.placements.map(placement => [`${placement.x},${placement.z}`, placement]));
  const displayOps = new Map<string, string>();
  const usedOps = new Set<string>();
  currentLayout.placements.forEach(placement => {
    const name = placement.recommendedOps.find(op => !usedOps.has(op)) || placement.recommendedOps[0] || '';
    usedOps.add(name); displayOps.set(placement.id, name);
  });
  useEffect(() => { setInspectorOpen(false); setNotesOpen(false); }, [selectedMapId, stageMode]);
  return <main className="desktop-page d-map-page">
    <nav className="d-map-list" aria-label="选择战术地图">{TACTICAL_MAPS.map(map => <button key={map.id} aria-pressed={map.id === activeMap.id} onClick={() => onSelectMapId(map.id)} title={map.name}>
      <img src={map.imageUrl} alt="" /><span><small>{map.region}</small><strong>{map.shortName}</strong></span>
    </button>)}</nav>
    <div className="d-map-controls d-panel"><h1 title={activeMap.name}>{activeMap.name}</h1><div className="d-map-counts"><span className="d-count-dps">输出 ×{riskSummary.dpsCount}</span><span className="d-count-tank">重装 ×{riskSummary.defenderCount}</span><span className="d-count-heal">奶 ×{riskSummary.medicCount}</span></div>
      <div className="d-tabs">{(['道中', 'Boss战'] as const).map(mode => <button key={mode} aria-pressed={stageMode === mode} onClick={() => onChangeStageMode(mode)}>{mode}</button>)}</div>
      {currentLayout.bossDangerZone && <button className={`d-button d-small ${showDangerZone ? 'd-warning' : ''}`} aria-pressed={showDangerZone} onClick={() => setShowDangerZone(value => !value)}>Boss 红框 {showDangerZone ? '开' : '关'}</button>}
      <div className="d-tabs"><button aria-pressed={displayMode === 'split'} onClick={() => setDisplayMode('split')}><Grid size={13} />同屏</button><button aria-pressed={displayMode === 'original'} onClick={() => setDisplayMode('original')}><ImageIcon size={13} />原图</button></div>
    </div>
    <div className={`d-map-body ${displayMode === 'original' ? 'is-original' : ''}`}>
      <section className="d-panel d-map-reference"><div className="d-section-head"><h2><Eye size={15} />道中 / Boss 战原图</h2><div className="d-inline">
        <AegirReferenceButton className="d-button d-small" mapId={activeMap.id} stage={stageMode} />
        <button className="d-icon" aria-label="放大战术原图" onClick={() => onOpenImage(activeMap.imageUrl, activeMap.name)}><Maximize2 size={15} /></button>
      </div></div>
        <button className="d-reference-image" onClick={() => onOpenImage(activeMap.imageUrl, activeMap.name)} aria-label="查看完整站位原图"><img src={activeMap.imageUrl} alt={`${activeMap.name} 道中与Boss战完整原图`} /></button>
        <button className="d-map-note" onClick={() => setNotesOpen(true)}><span>{currentLayout.description}</span><span className="d-gold">全部站位要点 ›</span></button>
      </section>
      {displayMode === 'split' && <section className="d-panel d-board-panel"><div className="d-section-head"><h2>2D 战术棋盘 · {stageMode}</h2><div className="d-board-legend"><span>■ 高台</span><span>□ 地面</span>{currentLayout.bossDangerZone && <span className="d-warning">┄ Boss 范围</span>}</div></div>
        <div data-testid="tactical-2d-grid" className="d-board-grid">{currentLayout.tiles.map((row, z) => row.map((kind, x) => {
          const placement = placements.get(`${x},${z}`);
          const tile = TILE_STYLES[kind];
          const danger = showDangerZone && isInsideBossDangerZone(x, z, currentLayout.bossDangerZone);
          const name = placement ? displayOps.get(placement.id) || '' : '';
          const avatar = name ? getPrimaryOperatorAvatar(name) : null;
          return <button key={`${x}-${z}`} type="button" data-cell={`${x + 1},${z + 1}`} disabled={!placement}
            aria-label={placement ? `${placement.label}，${name}，坐标${x + 1},${z + 1}，查看替代干员` : `${tile.label || '地面'}，${x + 1},${z + 1}`}
            className={`d-board-cell ${tile.bg} ${tile.border} ${danger ? 'is-danger' : ''} ${placement ? ROLE_SLOT_STYLES[placement.role].ring : ''} ${placement && inspectorOpen && selectedPlacement?.id === placement.id ? 'is-selected' : ''}`}
            onClick={() => { if (placement) { onSelectPlacement(placement); setInspectorOpen(true); } }}>
            {placement ? <><span className={`d-slot-role ${ROLE_SLOT_STYLES[placement.role].pillBg}`}>{placement.label}</span><span className="d-slot-avatar">{avatar ? <img src={avatar} alt={name} /> : name.slice(0, 2)}</span><span className="d-slot-name">{name}</span></> : <><span className="d-cell-coordinate">{x + 1},{z + 1}</span><span className={tile.labelColor}>{tile.label}</span>{danger && <small>Boss区</small>}</>}
          </button>;
        }))}</div>
        <footer className="d-board-footer"><span>6 × 10 · 点击干员查看站位</span><button className="d-text-button" onClick={() => setRoutesOpen(true)}>Boss 路线</button><button className="d-text-button" onClick={() => setNotesOpen(true)}>站位要点</button></footer>
      </section>}
    </div>
    {routesOpen && <DesktopDialog title="Boss 路线 · 按难度与地形核对" onClose={() => setRoutesOpen(false)}><BossRoutes onOpenImage={(url, title) => { setRoutesOpen(false); onOpenImage(url, title); }} /></DesktopDialog>}
    {notesOpen && <DesktopDialog title={`${activeMap.name} · ${stageMode}`} onClose={() => setNotesOpen(false)}><p>{currentLayout.description}</p><ul>{currentLayout.tacticalNotes.map(note => <li key={note}>{note}</li>)}</ul><p>{activeMap.summary}</p></DesktopDialog>}
    {inspectorOpen && selectedPlacement && <DesktopDialog title={`槽位：${selectedPlacement.label}`} onClose={() => setInspectorOpen(false)}><section data-testid="selected-slot-inspector"><p><Crosshair className="inline" size={15} /> {selectedPlacement.elevation === 'high' ? '高台位' : '地面位'} · ({selectedPlacement.x + 1}, {selectedPlacement.z + 1})</p>
      {isInsideBossDangerZone(selectedPlacement.x, selectedPlacement.z, currentLayout.bossDangerZone) && <p className="d-warning"><ShieldAlert className="inline" size={15} />位于 Boss 攻击范围</p>}
      <p>{selectedPlacement.tip}</p><h3>推荐干员</h3><div className="d-slot-options">{selectedPlacement.recommendedOps.map((name, index) => <div key={name}><OperatorAvatar name={name} size="md" /><small>{index === 0 ? '首选' : '替补'}</small></div>)}</div>
    </section></DesktopDialog>}
  </main>;
};
