// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useState } from 'react';
import { ScanLine, Square } from 'lucide-react';
import { parseCovenantScan, type CovenantScan } from './covenantScan';

export function useCovenantScanner(appliedId: string | undefined, onApply: (scan: CovenantScan) => void) {
  const [scan, setScan] = useState<CovenantScan | null>(null);
  const [error, setError] = useState('');
  const native = window.PRTSScan;
  const read = useCallback(() => {
    if (!native) return null;
    try {
      const result = parseCovenantScan(native.getState());
      setScan(result);
      return result;
    } catch {
      setError('无法读取识别状态，请重新打开助手。');
      return null;
    }
  }, [native]);
  useEffect(() => {
    if (!native) return;
    const poll = () => {
      const result = read();
      if (result?.status === 'ready' && result.id && result.id !== appliedId) onApply(result);
    };
    poll(); const timer = window.setInterval(poll, 700);
    return () => window.clearInterval(timer);
  }, [native, read, appliedId, onApply]);
  const control = (action: 'start' | 'stop') => {
    try { setError(''); native?.[action](); read(); }
    catch { setError('识别操作未完成，请重试。'); }
  };
  const applyPartial = (id: string) => {
    const current = read();
    if (current?.id === id && current.status === 'incomplete') onApply(current);
  };
  return { scan, error, control, applyPartial, available: Boolean(native) };
}

export function CovenantScanner({ appliedId, scanner }: { appliedId?: string; scanner: ReturnType<typeof useCovenantScanner> }) {
  const { scan, error, control, applyPartial, available } = scanner;
  const running = scan?.status === 'scanning' || scan?.status === 'permission';
  return <section className="m-card m-scan-card">
    <div className="m-scan-toolbar"><span>{running ? `识别中 · ${scan?.seenCovenants.length || 0}/26` : appliedId ? '本局盟约' : '打开游戏盟约总览'}</span><button className={appliedId ? 'm-secondary' : 'm-primary'} disabled={!available || running} onClick={() => control('start')}><ScanLine size={16} /> {running ? '正在识别' : appliedId ? '重新识别' : '识别盟约'}</button>
    {running && <button className="m-secondary" onClick={() => control('stop')}><Square size={16} /> 停止</button>}</div>
    {error && <p className="m-warning" role="alert">{error}</p>}
    {scan && scan.status !== 'idle' && scan.id !== appliedId && <div role="status" aria-live="polite">
      <p className="m-highlight">{scan.message}</p>
      {!scan.complete && scan.missingCovenants.length > 0 && <details><summary>未确认的盟约</summary><p>{scan.missingCovenants.join('、')}</p></details>}
      {scan.status === 'incomplete' && scan.seenCovenants.length > 0 && <><p className="m-warning">未读全的盟约不会自动视为已确认可用。可重新识别，或先按部分条件查看候选。</p>
        <button className="m-secondary m-wide" onClick={() => applyPartial(scan.id)}>按已识别条件查看候选</button></>}
    </div>}
  </section>;
}
