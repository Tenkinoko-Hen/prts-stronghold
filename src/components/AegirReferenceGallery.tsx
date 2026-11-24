import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, ZoomIn, ZoomOut } from 'lucide-react';
import { AEGIR_REFERENCES, AEGIR_SOURCES, aegirImageUrl, aegirMapReferences, type AegirStage } from '../data/aegirReferences';
import { TACTICAL_MAPS } from '../data/strongholdData';
import { DesktopDialog } from '../desktop/DesktopDialog';
import './aegirGallery.css';

const groups = ['吞噬摆位', '道中', 'Boss战', '纠偏', '资料', '全部'] as const;
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

function defaultGroup({ mapId, stage, round }: Context): Group {
  if (mapId && stage) return aegirMapReferences(mapId, stage).length ? '本图' : '吞噬摆位';
  return round !== undefined && round < 5 ? '吞噬摆位' : stage ?? '吞噬摆位';
}

function referencesFor(group: Group, mapId?: string, stage?: AegirStage) {
  return group === '本图' && mapId && stage
    ? aegirMapReferences(mapId, stage)
    : AEGIR_REFERENCES.filter(item => group === '全部' || item.purpose === group);
}

function roundReference(items: readonly (typeof AEGIR_REFERENCES)[number][], round?: number) {
  if (round === undefined) return items[0];
  return items.filter(item => item.round !== undefined && item.round <= round)
    .sort((a, b) => a.round! - b.round!).at(-1) ?? items[0];
}

export function AegirReferenceGallery({ mapId, stage, round, initial, remember }: Context & {
  initial?: Selection;
  remember?(selection: Selection): void;
}) {
  const hasMap = Boolean(mapId && stage);
  const [selection, setSelection] = useState<Selection>(initial ?? { group: defaultGroup({ mapId, stage, round }), id: '', zoomed: false });
  const { group, id, zoomed } = selection;
  const select = (next: Selection) => { setSelection(next); remember?.(next); };
  const items = referencesFor(group, mapId, stage);
  const current = items.find(item => item.id === id) ?? roundReference(items, round);
  const index = current ? items.indexOf(current) : -1;
  const source = current && AEGIR_SOURCES[current.source];
  const terrain = current?.terrain || TACTICAL_MAPS.find(map => map.id === current?.mapId)?.shortName;
  const selectImage = (id: string) => select({ group, id, zoomed: false });
  const filters: readonly Group[] = hasMap ? ['本图', ...groups] : groups;

  return <section className="aegir-gallery" aria-label="阿戈尔站位图册">
    <div className="aegir-filters" role="group" aria-label="筛选阿戈尔配图">
      {filters.map(value => <button key={value} type="button" aria-pressed={group === value} onClick={() => {
        if (group !== value) select({ group: value, id: '', zoomed: false });
      }}>
        {value === '本图' ? `本图${stage === 'Boss战' ? ' · Boss' : ' · 道中'}` : value}<small>{referencesFor(value, mapId, stage).length}</small>
      </button>)}
    </div>
    {current && source ? <div className="aegir-body">
      <nav className="aegir-index" aria-label="阿戈尔配图目录">
        {items.map(item => <button key={item.id} type="button" aria-current={item === current ? 'true' : undefined} onClick={() => selectImage(item.id)}>
          <img src={aegirImageUrl(item.id)} alt="" loading="lazy" />
          <span>{item.title}</span>
        </button>)}
      </nav>
      <div className="aegir-detail">
        <select className="aegir-select" aria-label="选择阿戈尔配图" value={current.id} onChange={event => selectImage(event.target.value)}>
          {items.map((item, i) => <option key={item.id} value={item.id}>{i + 1}. {item.title}</option>)}
        </select>
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
        <div className="aegir-usage">
          <strong>{current.title}</strong>
          <small>{current.purpose}{terrain && ` · ${terrain}`}</small>
          <p>{current.note}</p>
        </div>
        <small className="aegir-source">来源：{current.source === 'nga079' ? `NGA · FireShot ${source.id}` : `贴吧 · ${source.id}`}《{source.title}》{current.location}</small>
      </div>
    </div> : <p>这张地图的{stage === 'Boss战' ? ' Boss 战' : '道中'}暂无已核对配图。切到「吞噬摆位」按相对方向参考。</p>}
  </section>;
}

export function AegirReferenceButton({ className, preview = false, ...context }: Context & { className: string; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const last = useRef<{ scope: string; selection: Selection } | null>(null);
  const scope = `${context.mapId ?? ''}/${context.stage ?? ''}/${context.round ?? ''}`;
  const initial = last.current?.scope === scope ? last.current.selection : undefined;
  const group = initial?.group ?? defaultGroup(context);
  const items = preview ? referencesFor(group, context.mapId, context.stage) : [];
  const image = items.find(item => item.id === initial?.id) ?? roundReference(items, context.round);
  return <>
    <button type="button" className={`${className} aegir-reference-trigger${preview ? ' is-preview' : ''}`} aria-label="阿戈尔站位" onClick={() => setOpen(true)}>
      {image && <img src={aegirImageUrl(image.id)} alt="" />}
      <span><Images size={14} aria-hidden="true" />{preview ? '打开站位图册' : '阿戈尔站位'}</span>
      {preview && <small>{image?.title ?? '双路守线 · 吞噬摆位 · Boss 战'}</small>}
    </button>
    {open && <DesktopDialog title="阿戈尔站位与配图" onClose={() => setOpen(false)}>
      <AegirReferenceGallery key={scope} {...context} initial={initial} remember={selection => { last.current = { scope, selection }; }} />
    </DesktopDialog>}
  </>;
}
