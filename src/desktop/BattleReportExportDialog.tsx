import { useEffect, useMemo, useState } from 'react';
import { FileDown, Hourglass, ImageDown } from 'lucide-react';
import { DesktopDialog } from './DesktopDialog';
import { renderBattleReportHtml } from './battleReportDocument';
import { renderBattleReportPng } from './battleReportImage';
import { buildReportPortraitStrip, type ExportPortraitStrip } from './battleReportPortraits';
import type { ReportSummary } from './battleReportExport';
import documentCss from './battleReportDocument.css?raw';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BattleReportExportDialog({ report, onClose }: { report: ReportSummary; onClose(): void }) {
  const [portraits, setPortraits] = useState<ExportPortraitStrip | undefined>();
  useEffect(() => {
    let active = true;
    void buildReportPortraitStrip(report)
      .then(strip => { if (active) setPortraits(strip); })
      .catch(() => { if (active) setPortraits(undefined); });
    return () => { active = false; };
  }, [report]);
  const html = useMemo(() => renderBattleReportHtml(report, documentCss, undefined, portraits), [report, portraits]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saveImage = async () => {
    setBusy(true);
    setError('');
    try { download(await renderBattleReportPng(html), `${report.filename}.png`); }
    catch { setError('长图未能生成，请重试或下载文档。'); }
    finally { setBusy(false); }
  };
  return <DesktopDialog title="导出战报文档" onClose={onClose}>
    <div className="d-export-dialog">
      <div className="d-export-toolbar">
        <button type="button" className="d-button d-primary" title="下载完整战报长图（PNG）" disabled={busy} aria-busy={busy}
          onClick={saveImage}>{busy ? <Hourglass size={15} /> : <ImageDown size={15} />}下载图片</button>
        <button type="button" className="d-button" title="下载离线 HTML 文档"
          onClick={() => download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${report.filename}.html`)}>
          <FileDown size={15} />下载文档</button>
        {error && <span role="alert">{error}</span>}
      </div>
      <div className="d-export-preview">
        <iframe title="战报 HTML 视觉预览" srcDoc={html} sandbox="allow-same-origin" />
      </div>
    </div>
  </DesktopDialog>;
}
