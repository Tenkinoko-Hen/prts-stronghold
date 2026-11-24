// 青逝痕 Tenkinoko 制作
import { useState } from 'react';
import { Heart, RotateCcw, Skull, UserRoundPen } from 'lucide-react';
import { DesktopDialog } from './DesktopDialog';
import { REPORT_SEATS, type BattleReport } from './battleReportData';
import { seatDisplayText, seatName } from './BattleReportPanels';
import { isSoloMode } from './combatTelemetry';
import { canConfirmSelfSeat, canEditPlayerNames, MAX_MANUAL_NAME_LENGTH, type ManualNames, type ReportRecord,
  type ReportSeat } from './battleReports';

export function BattleReportRoster({ entry, report, seat, onViewSeat, onResetPerspective, onSave, onSetSelfSeat }: {
  seat: number | null;
  onViewSeat(seat: ReportSeat): void;
  onResetPerspective?(): void;
  entry: ReportRecord;
  report: BattleReport;
  onSave(names: ManualNames): void;
  onSetSelfSeat(seat: ReportSeat | null): void;
}) {
  const [draft, setDraft] = useState<ManualNames | null>(null);
  const [draftSeat, setDraftSeat] = useState<ReportSeat | null>(null);
  const solo = isSoloMode(report.mode);
  const seats = solo ? ([1] as const) : REPORT_SEATS;
  const captured = entry.report.names;
  const editable = !solo && canEditPlayerNames(entry) && REPORT_SEATS.some(s => !captured[s]);
  const canConfirmSelf = !solo && canConfirmSelfSeat(entry);
  const viewingOther = !solo && report.self !== null && seat !== null && seat !== report.self;

  return <div className="d-report-roster" role="group" aria-label={solo ? '单兵作战视角' : '本局队伍 · 切换查看视角'}>
    {solo && <span className="d-solo-pill">SOLO</span>}
    {seats.map(id => {
      const elimRound = report.eliminated[id];
      const hp = report.hp[id];
      const isEliminated = elimRound !== undefined;
      const isSelected = (seat ?? report.self ?? 1) === id;
      const isSelf = report.self === id;
      return <button
        key={id}
        type="button"
        className="d-seat-button"
        data-eliminated={isEliminated}
        data-self={isSelf}
        aria-pressed={isSelected}
        aria-label={`切换到${id}号视角${report.names[id] ? ` · ${report.names[id]}` : ''}${isEliminated ? `（R${elimRound} 已淘汰）` : ''}`}
        onClick={() => onViewSeat(id)}
        title={`${id}号${report.names[id] ? ` · ${report.names[id]}${captured[id] ? '' : '（手填）'}` : ''}${isSelf ? ' · 本机席位' : ''}${isEliminated ? ` · R${elimRound} 已淘汰` : hp !== undefined ? ` · 剩余生命 ${hp}` : ''}`}
      >
        {/* 黄色「我」标永远只归属真正的本机席位 report.self，绝不因切换视角漂移 */}
        {seatName(id, report, report.self)}
        {isEliminated ? (
          <span className="d-seat-elim-tag" title={`第 ${elimRound} 回合阵亡淘汰`}>
            <Skull size={10} />R{elimRound}
          </span>
        ) : hp !== undefined && hp > 0 ? (
          <span className="d-seat-hp-tag" title={`当前剩余生命 ${hp}`}>
            <Heart size={9} />{hp}
          </span>
        ) : null}
      </button>;
    })}
    {viewingOther && onResetPerspective && (
      <button
        type="button"
        className="d-button d-small d-back-self-btn"
        onClick={onResetPerspective}
        title={`当前正在查看 ${seatDisplayText(seat!, report)} 视角，点击切回本机席位`}
      >
        <RotateCcw size={11} />回我视角
      </button>
    )}
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
        {REPORT_SEATS.map(s => <label key={s}>
          <span>{s}号{report.self === s ? ' · 本机' : ''}</span>
          <input type="text" value={captured[s] || draft[s] || ''} readOnly={Boolean(captured[s])}
            maxLength={MAX_MANUAL_NAME_LENGTH} spellCheck={false} placeholder="游戏内昵称"
            onChange={event => setDraft({ ...draft, [s]: event.currentTarget.value })} />
          {captured[s] && <small className="d-muted">游戏名单</small>}
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
