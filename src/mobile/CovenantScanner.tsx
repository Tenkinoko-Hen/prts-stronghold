import { useEffect, useState } from 'react';
import { ScanLine, Square } from 'lucide-react';
import { parseCovenantScan, type CovenantScan } from './covenantScan';

export function CovenantScanner({ appliedId, onApply }: { appliedId?: string; onApply(scan: CovenantScan): void }) {
  const [scan, setScan] = useState<CovenantScan | null>(null);
  const [error, setError] = useState('');
  const native = window.PRTSScan;
  const running = scan?.status === 'scanning' || scan?.status === 'permission';
  useEffect(() => {
    if (!native) return;
    const poll = () => {
      try { const result = parseCovenantScan(native.getState()); if (result) setScan(result); }
      catch { setError('无法读取识别状态，请重新打开助手。'); }
    };
    poll(); const timer = window.setInterval(poll, 700);
    return () => window.clearInterval(timer);
  }, [native]);
  useEffect(() => {
    if (scan?.status === 'ready' && scan.complete && scan.id && scan.id !== appliedId) onApply(scan);
  }, [scan, appliedId, onApply]);
  return <section className="m-card m-scan-card">
    <div className="m-scan-toolbar"><span>{running ? `识别中 · ${scan?.seenCovenants.length || 0}/26` : appliedId ? '本局盟约' : '打开游戏盟约总览'}</span><button className={appliedId ? 'm-secondary' : 'm-primary'} disabled={!native || running} onClick={() => {
      try { setError(''); native?.start(); } catch { setError('无法开始识别，请重新打开助手。'); }
    }}><ScanLine size={16} /> {running ? '正在识别' : appliedId ? '重新识别' : '识别盟约'}</button>
    {running && <button className="m-secondary" onClick={() => native?.stop()}><Square size={16} /> 停止</button>}</div>
    {error && <p className="m-warning" role="alert">{error}</p>}
    {scan && scan.status !== 'idle' && scan.id !== appliedId && <div role="status" aria-live="polite">
      <p className="m-highlight">{scan.message}</p>
      {!scan.complete && scan.missingCovenants.length > 0 && <details><summary>未确认的盟约</summary><p>{scan.missingCovenants.join('、')}</p></details>}
      {scan.status === 'incomplete' && scan.seenCovenants.length > 0 && <><p className="m-warning">未读全的盟约不会自动视为已确认可用。可重新识别，或先按部分条件查看候选。</p>
        <button className="m-secondary m-wide" onClick={() => onApply(scan)}>按已识别条件查看候选</button></>}
    </div>}
  </section>;
}
