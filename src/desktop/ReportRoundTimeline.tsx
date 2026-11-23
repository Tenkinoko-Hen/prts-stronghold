import { ListFilter } from 'lucide-react';
import type { PreviewRoundFilter, ReportRoundFilter } from './battleReportData';

export function ReportRoundTimeline({ selected, available, first, onSelect }: {
  selected: PreviewRoundFilter; available: number[]; first: ReportRoundFilter; onSelect(round: PreviewRoundFilter): void;
}) {
  return <>
    <label className="d-report-follow"><input type="checkbox" checked={selected === 'follow'}
      onChange={e => onSelect(e.target.checked ? 'follow' : 'all')} />仅看当前及后续回合</label>
    <label className="d-round-filter"><ListFilter size={14} /><select aria-label="筛选预告回合" value={selected}
      onChange={e => onSelect(e.target.value === 'all' || e.target.value === 'follow' ? e.target.value : Number(e.target.value))}>
      <option value="follow">{first === 'all' ? '跟随进度' : `R${first} 起`}</option>
      <option value="all">全部回合</option>{available.map(n => <option key={n} value={n}>R{n}</option>)}
    </select></label>
  </>;
}
