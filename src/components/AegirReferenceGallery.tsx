import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, ZoomIn, ZoomOut } from 'lucide-react';
import { AEGIR_REFERENCES, AEGIR_SOURCES, aegirImageUrl, aegirMapReferences, type AegirStage } from '../data/aegirReferences';
import { TACTICAL_MAPS } from '../data/strongholdData';
import { DesktopDialog } from '../desktop/DesktopDialog';
import './aegirGallery.css';

const groups = ['道中', 'Boss战', '纠偏', '资料', '全部'] as const;
type Group = (typeof groups)[number] | '本图';

interface Context {
  mapId?: string;
  stage?: AegirStage;
  round?: number;
}

interface Selection {
  group: Group;
  id: string;
  zoomed: boolean;
}

export function AegirReferenceGallery({ mapId, stage, round, initial, remember }: Context & {
  initial?: Selection;
  remember?(selection: Selection): void;
}) {
  const hasMap = Boolean(mapId && stage);
  const [selection, setSelection] = useState<Selection>(initial ?? { group: hasMap ? '本图' : stage ?? '道中', id: '', zoomed: false });
  const { group, id, zoomed } = selection;
  const select = (next: Selection) => { setSelection(next); remember?.(next); };
  const items = group === '本图' && mapId && stage
    ? aegirMapReferences(mapId, stage)
    : AEGIR_REFERENCES.filter(item => group === '全部' || item.purpose === group);
  const current = items.find(item => item.id === id) ??
    (round === undefined ? undefined : items.filter(item => item.round !== undefined && item.round <= round).at(-1)) ??
    items[0];
  const index = current ? items.indexOf(current) : -1;
  const source = current && AEGIR_SOURCES[current.source];
  const terrain = current?.terrain || TACTICAL_MAPS.find(map => map.id === current?.mapId)?.shortName;
  const selectImage = (id: string) => select({ group, id, zoomed: false });

  return <section className="aegir-gallery" aria-label="阿戈尔站位图册">
    <div className="aegir-pickers">
      <label>用途<select aria-label="筛选阿戈尔配图" value={group} onChange={event => select({ group: event.target.value as Group, id: '', zoomed: false })}>
        {hasMap && <option value="本图">本图 · {stage}</option>}
        {groups.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>配图<select aria-label="选择阿戈尔配图" value={current?.id ?? ''} disabled={!current} onChange={event => selectImage(event.target.value)}>
        {items.length ? items.map((item, i) => <option key={item.id} value={item.id}>{i + 1}. {item.title}</option>) : <option value="">暂无配图</option>}
      </select></label>
    </div>
    {current && source ? <>
      <div className="aegir-usage">
        <strong>{current.title}</strong>
        <small>{current.purpose}{terrain && ` · ${terrain}`}</small>
        <p>{current.note}</p>
      </div>
      <div className="aegir-tools">
        <button type="button" aria-label="上一张阿戈尔配图" disabled={index <= 0} onClick={() => selectImage(items[index - 1].id)}><ChevronLeft size={16} /></button>
        <span aria-live="polite">{index + 1} / {items.length}</span>
        <button type="button" aria-label="下一张阿戈尔配图" disabled={index >= items.length - 1} onClick={() => selectImage(items[index + 1].id)}><ChevronRight size={16} /></button>
        <button type="button" className="aegir-zoom" aria-pressed={zoomed} onClick={() => select({ ...selection, id: current.id, zoomed: !zoomed })}>
          {zoomed ? <ZoomOut size={15} /> : <ZoomIn size={15} />}{zoomed ? '适应窗口' : '放大原图'}
        </button>
      </div>
      <div key={`${current.id}-${zoomed}`} className={`aegir-frame${zoomed ? ' is-zoomed' : ''}`} tabIndex={zoomed ? 0 : undefined} aria-label={zoomed ? '放大的站位原图' : undefined}>
        <img src={aegirImageUrl(current.id)} alt={current.title} />
      </div>
      <small className="aegir-source">来源：贴吧《{source.title}》{current.location} · {source.id}</small>
    </> : <p>这张地图的{stage === 'Boss战' ? ' Boss 战' : '道中'}暂无已核对的阿戈尔站位。可选择其他用途看相对站位与纠偏。</p>}
  </section>;
}

export function AegirReferenceButton({ className, iconOnly = false, ...context }: Context & { className: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const last = useRef<{ scope: string; selection: Selection } | null>(null);
  const scope = `${context.mapId ?? ''}/${context.stage ?? ''}/${context.round ?? ''}`;
  return <>
    <button type="button" className={className} aria-label={iconOnly ? '阿戈尔站位' : undefined} title={iconOnly ? '阿戈尔站位' : undefined} onClick={() => setOpen(true)}><Images size={14} />{!iconOnly && '阿戈尔站位'}</button>
    {open && <DesktopDialog title="阿戈尔站位与配图" onClose={() => setOpen(false)}>
      <AegirReferenceGallery key={scope} {...context} initial={last.current?.scope === scope ? last.current.selection : undefined} remember={selection => { last.current = { scope, selection }; }} />
    </DesktopDialog>}
  </>;
}
