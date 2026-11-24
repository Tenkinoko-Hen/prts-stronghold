import { useState } from 'react';
import { UserRoundPen } from 'lucide-react';
import { DesktopDialog } from './DesktopDialog';
import { REPORT_SEATS, type BattleReport } from './battleReportData';
import { seatName } from './BattleReportPanels';
import { canConfirmSelfSeat, canEditPlayerNames, MAX_MANUAL_NAME_LENGTH, type ManualNames, type ReportRecord,
  type ReportSeat } from './battleReports';

export function BattleReportRoster({ entry, report, seat, onViewSeat, onSave, onSetSelfSeat }: {
  seat: number | null; onViewSeat(seat: ReportSeat): void;
  entry: ReportRecord; report: BattleReport; onSave(names: ManualNames): void; onSetSelfSeat(seat: ReportSeat | null): void;
}) {
  const [draft, setDraft] = useState<ManualNames | null>(null);
  const [draftSeat, setDraftSeat] = useState<ReportSeat | null>(null);
  const captured = entry.report.names;
  const editable = canEditPlayerNames(entry) && REPORT_SEATS.some(seat => !captured[seat]);
  const canConfirmSelf = canConfirmSelfSeat(entry);
  return <div className="d-report-roster" role="group" aria-label="本局队伍 · 切换我的视角">
    {REPORT_SEATS.map(id => <button key={id} type="button" className="d-seat-button" aria-pressed={seat === id}
      aria-label={`切换到${id}号视角${report.names[id] ? ` · ${report.names[id]}` : ''}`} onClick={() => onViewSeat(id)}
      title={`${id}号${report.names[id] ? ` · ${report.names[id]}${captured[id] ? '' : '（手填）'}` : ''}${report.self === id ? ' · 本机席位' : ''}`}>
      {seatName(id, report, seat)}</button>)}
    {(editable || canConfirmSelf) && <button type="button" className="d-icon d-roster-edit" aria-label="昵称与本机席位"
      title={editable ? '补录昵称 / 本机席位' : '本机席位'} onClick={() => { setDraft({ ...entry.manualNames }); setDraftSeat(entry.manualSelfSeat ?? null); }}>
      <UserRoundPen size={15} />{editable && <span>补录昵称</span>}</button>}
    {draft && <DesktopDialog title="昵称与本机席位" onClose={() => setDraft(null)}>
      <form className="d-report-roster-form" autoComplete="off" onSubmit={event => {
        event.preventDefault();
        if (canConfirmSelf && draftSeat !== (entry.manualSelfSeat ?? null)) onSetSelfSeat(draftSeat);
        onSave(draft);
        setDraft(null);
      }}>
        <p className="d-muted">补录仅在本机本次运行有效。游戏已提供的昵称不能修改。</p>
        {REPORT_SEATS.map(seat => <label key={seat}>
          <span>{seat}号{report.self === seat ? ' · 本机' : ''}</span>
          <input type="text" value={captured[seat] || draft[seat] || ''} readOnly={Boolean(captured[seat])}
            maxLength={MAX_MANUAL_NAME_LENGTH} spellCheck={false} placeholder="游戏内昵称"
            onChange={event => setDraft({ ...draft, [seat]: event.currentTarget.value })} />
          {captured[seat] && <small className="d-muted">游戏名单</small>}
        </label>)}
        {canConfirmSelf && <label>本机席位<select value={draftSeat ?? ''} onChange={e => setDraftSeat(e.target.value ? Number(e.target.value) as ReportSeat : null)}>
          <option value="">未确认</option>{REPORT_SEATS.map(id => <option key={id} value={id}>{id}号</option>)}</select></label>}
        <div className="d-inline d-report-roster-actions">
          <button className="d-button" type="button" onClick={() => setDraft(null)}>取消</button>
          <button className="d-button d-primary" type="submit">应用到本局</button>
        </div>
      </form>
    </DesktopDialog>}
  </div>;
}
