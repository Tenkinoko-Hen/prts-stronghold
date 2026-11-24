import React, { useState } from 'react';
import { ClipboardPaste, Monitor, ScanLine, X } from 'lucide-react';
import { desktopOcr } from '../desktop/covenantOcr';
import type { CaptureSource, DesktopCovenantScan as ScanState } from '../desktop/covenantOcr';
import { DesktopDialog } from '../desktop/DesktopDialog';

interface Props { scan: ScanState | null; onCancel(): Promise<void> }

export function DesktopScanStatus({ scan, onCancel, floating = false }: Props & { floating?: boolean }) {
  const [dismissed, setDismissed] = useState('');
  const [cancelError, setCancelError] = useState('');
  const busy = scan?.status === 'scanning';
  if (floating && (!scan || ['idle', 'ready'].includes(scan.status) || scan.id === dismissed)) return null;
  if (desktopOcr && (!scan || (scan.status === 'idle' && !scan.message))) return null;

  return <div className={`d-scan-status${floating ? ' d-scan-float' : ''}`} aria-live="polite">
    {floating && scan && !busy && <button className="d-icon" aria-label="关闭识别提示" onClick={() => setDismissed(scan.id)}><X size={16} /></button>}
    <p>{!desktopOcr ? '网页预览 · 自动识别请使用 Windows 版' : scan?.message}{scan?.elapsedMs != null && ` · ${(scan.elapsedMs / 1000).toFixed(1)} 秒`}</p>
    {scan?.status === 'incomplete' && <p className="d-warning">待确认：{scan.missingCovenants.join('、')}</p>}
    {scan?.status === 'ready' && <p className="d-success">已开始新局，右侧推荐已更新。</p>}
    {busy && <button className="d-button d-small" onClick={() => {
      setCancelError('');
      void onCancel().catch(() => setCancelError(scan.id));
    }}>取消识别</button>}
    {busy && cancelError === scan.id && <p role="alert" className="d-warning">无法取消识别，请重试。</p>}
  </div>;
}

export function DesktopCovenantScan({ scan, onCancel }: Props) {
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const api = desktopOcr;
  const busy = scan?.status === 'scanning';
  const act = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); } catch { setError('操作未完成，请重试。'); }
  };
  const refresh = () => act(async () => {
    if (!api) return;
    setLoading(true);
    try { setSources(await api.listSources()); } finally { setLoading(false); }
  });
  return <section className="d-scan" aria-label="Windows 盟约识别">
    <p className="d-muted">打开游戏「确认本局信息」，露出核心与两排附加盟约。</p>
    <div className="d-source-row"><button className="d-button d-small" disabled={!api || busy || loading} onClick={() => void refresh()}><Monitor size={14} />{loading ? '读取中…' : '选择窗口'}</button><span title={scan?.sourceName}>{scan?.sourceName || '尚未选择游戏窗口'}</span></div>
    <div className="d-scan-actions"><button data-testid="ocr-start" className="d-button d-primary" disabled={!api || busy || !scan?.sourceId} onClick={() => api && void act(() => api.start('window'))}><ScanLine size={16} />{busy ? '正在识别…' : '识别盟约 Ban'}</button>
      <button data-testid="ocr-paste" className="d-button" disabled={!api || busy} onClick={() => api && void act(() => api.start('clipboard'))}><ClipboardPaste size={15} />粘贴截图</button></div>
    <DesktopScanStatus scan={scan} onCancel={onCancel} />
    {scan?.shortcutAvailable && <p className="d-muted d-shortcut">Ctrl + Shift + F8 · 本机识别</p>}
    {error && <p role="alert" className="d-warning">{error}</p>}
    {sources && <DesktopDialog title="选择游戏窗口或屏幕" onClose={() => setSources(null)}><p className="d-muted">采集黑屏时可选整个屏幕，或使用粘贴截图。</p><div className="d-source-grid">{sources.map(source => <button key={source.id} disabled={busy} onClick={() => api && void act(async () => { await api.selectSource(source.id); setSources(null); })}><img src={source.thumbnail} alt="" /><span title={source.name}>{source.name}</span></button>)}{!sources.length && <p>未找到可采集窗口，请先打开游戏。</p>}</div></DesktopDialog>}
  </section>;
}
