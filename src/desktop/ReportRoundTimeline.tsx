import { Radio } from 'lucide-react';
import { REPORT_ROUNDS, type ReportRoundFilter } from './battleReportData';

export function ReportRoundTimeline({ label, selected, available, current, onSelect, follow }: {
  label: string; selected: ReportRoundFilter; available: ReadonlySet<number>; current?: number | null;
  onSelect(round: ReportRoundFilter): void; follow?: { enabled: boolean; onEnable(): void };
}) {
  return <div className="d-report-timeline" role="group" aria-label={label}>
    <div className="d-report-timeline-track">
      <button className="d-button d-small" type="button" aria-pressed={selected === 'all'} onClick={() => onSelect('all')}>全部回合</button>
      {REPORT_ROUNDS.map(round => <button className="d-button d-small d-report-timeline-round" type="button" key={round}
        aria-pressed={selected === round} aria-current={current === round ? 'step' : undefined}
        data-available={available.has(round)} title={available.has(round) ? `R${round}` : `R${round} · 暂无记录`}
        onClick={() => onSelect(round)}>R{round}</button>)}
    </div>
    {follow && <button className="d-button d-small d-report-timeline-follow" type="button"
      aria-pressed={follow.enabled} onClick={follow.onEnable}><Radio size={13} aria-hidden="true" />跟随回合</button>}
  </div>;
}
