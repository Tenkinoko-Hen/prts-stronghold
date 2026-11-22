import { useState } from 'react';
import { DesktopDialog } from './DesktopDialog';
import { REPORT_SEATS, type BattleReport } from './battleReportData';
import { seatName } from './BattleReportPanels';
import { canConfirmSelfSeat, canEditPlayerNames, MAX_MANUAL_NAME_LENGTH, type ManualNames, type ReportRecord,
  type ReportSeat } from './battleReports';

export function BattleReportRoster({ entry, report, onSave, onSetSelfSeat }: {
  entry: ReportRecord; report: BattleReport; onSave(names: ManualNames): void; onSetSelfSeat(seat: ReportSeat | null): void;
}) {
  const [draft, setDraft] = useState<ManualNames | null>(null);
  const captured = entry.report.names;
  const editable = canEditPlayerNames(entry) && REPORT_SEATS.some(seat => !captured[seat]);
  const canConfirmSelf = canConfirmSelfSeat(entry);
  if (!editable && !canConfirmSelf && !REPORT_SEATS.some(seat => report.names[seat])) return null;

  return <section className="d-report-roster" aria-label="本局队伍">
    <span className="d-muted">队伍</span>
    <ul className="d-report-roster-list">
      {REPORT_SEATS.map(seat => <li key={seat}>
        {seatName(seat, report)}
        {!captured[seat] && report.names[seat] && <small className="d-muted">手填</small>}
      </li>)}
    </ul>
    {canConfirmSelf && <div className="d-report-self-picker">
      <span className="d-muted">我的位置{entry.manualSelfSeat ? ` · 已选 ${entry.manualSelfSeat}号` : ' · 未确认'}</span>
      <div role="group" aria-label="确认本机席位">
        {REPORT_SEATS.map(seat => <button key={seat} type="button" className="d-button d-small"
          aria-pressed={entry.manualSelfSeat === seat} onClick={() => onSetSelfSeat(seat)}>{seat}号</button>)}
        {entry.manualSelfSeat !== undefined && <button type="button" className="d-button d-small"
          onClick={() => onSetSelfSeat(null)}>重置</button>}
      </div>
    </div>}
    {editable && <button type="button" className="d-button d-small" onClick={() => setDraft({ ...entry.manualNames })}>补录昵称</button>}
    {draft && <DesktopDialog title="补录本局昵称" onClose={() => setDraft(null)}>
      <form className="d-report-roster-form" autoComplete="off" onSubmit={event => {
        event.preventDefault();
        onSave(draft);
        setDraft(null);
      }}>
        <p className="d-muted">请先对照游戏确认席位，不要按截图顺序填写。可留空；自动采到的名字优先。手填内容是显示昵称，不是账号 ID；仅在本机本次运行显示，不写入诊断或文件。</p>
        {REPORT_SEATS.map(seat => <label key={seat}>
          <span>{seat}号{report.self === seat ? ' · 我' : ''}</span>
          <input type="text" value={captured[seat] || draft[seat] || ''} readOnly={Boolean(captured[seat])}
            maxLength={MAX_MANUAL_NAME_LENGTH} spellCheck={false} placeholder="游戏内昵称"
            onChange={event => setDraft({ ...draft, [seat]: event.currentTarget.value })} />
          {captured[seat] && <small className="d-muted">游戏名单</small>}
        </label>)}
        <div className="d-inline d-report-roster-actions">
          <button className="d-button" type="button" onClick={() => setDraft(null)}>取消</button>
          <button className="d-button d-primary" type="submit">应用到本局</button>
        </div>
      </form>
    </DesktopDialog>}
  </section>;
}
