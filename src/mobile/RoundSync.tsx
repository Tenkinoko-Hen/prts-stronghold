// 青逝痕 Tenkinoko 制作
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ScanLine, X } from 'lucide-react';

interface RoundScan {
  id: string; status: 'idle' | 'permission' | 'capturing' | 'calibrating' | 'scanning' | 'paused' | 'stopped' | 'error';
  message: string; round: number; sequence: number;
}
interface Region { left: number; top: number; right: number; bottom: number }
declare global {
  interface Window { PRTSRound?: {
    start(): void; stop(): void; pause(): void; resume(): void;
    getState(): string; getPreview(): string; setRegion(left: number, top: number, right: number, bottom: number): void;
  } }
}

export interface RoundSyncProgress { id: string; handled: string; synchronized: boolean; pending: number | null }
export function RoundSync({ round, progress, onRound }: { round: number; progress: RefObject<RoundSyncProgress>; onRound(round: number): void }) {
  const [scan, setScan] = useState<RoundScan | null>(null);
  const [menu, setMenu] = useState(false);
  const [preview, setPreview] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [pending, updatePending] = useState<number | null>(progress.current.pending);
  const setPending = (value: number | null) => { progress.current.pending = value; updatePending(value); };
  const native = window.PRTSRound;
  useEffect(() => {
    if (!native) return;
    const poll = () => {
      try {
        const state: RoundScan = JSON.parse(native.getState());
        if (!state || typeof state.id !== 'string' || typeof state.sequence !== 'number') return;
        setScan(state);
        if (state.status === 'calibrating') setPreview(native.getPreview());
        else setPreview('');
      } catch { setScan({ id: '', status: 'error', round: 0, sequence: 0, message: '回合识别暂不可用，请重新开启。' }); }
    };
    poll(); const timer = window.setInterval(poll, 700);
    return () => window.clearInterval(timer);
  }, [native]);
  useEffect(() => {
    if (!scan) return;
    if (progress.current.id !== scan.id) { progress.current = { id: scan.id, handled: '', synchronized: false, pending: null }; setPending(null); }
    if (scan.status === 'paused' || scan.status === 'stopped' || scan.status === 'idle') { setPending(null); return; }
    if (!scan || scan.status !== 'scanning' || scan.round < 1 || scan.round > 15) return;
    const token = `${scan.id}:${scan.sequence}`;
    if (progress.current.handled === token) return;
    progress.current.handled = token;
    if (!progress.current.synchronized || scan.round === round || scan.round === round + 1) {
      onRound(scan.round); setPending(null);
    } else setPending(scan.round);
    progress.current.synchronized = true;
  }, [scan, round, onRound]);
  const enabled = scan && ['scanning', 'paused', 'permission', 'capturing', 'calibrating'].includes(scan.status);
  const close = () => { native?.stop(); setPreview(''); setRegion(null); };
  return <>
    <button className="m-auto-round" data-pending={pending !== null} aria-label="回合自动同步设置" title="回合自动同步设置" onClick={() => setMenu(true)}><ScanLine size={14} /><span>{pending ? `识别 R${pending}` : scan?.status === 'paused' ? '同步已暂停' : scan?.status === 'scanning' ? '自动回合' : '回合同步'}</span></button>
    {menu && !preview && <div className="m-modal-backdrop" onClick={() => setMenu(false)}><section className="m-confirm" role="dialog" aria-modal="true" aria-label="回合自动同步" onClick={e => e.stopPropagation()}>
      <button className="m-icon-button m-close" aria-label="关闭同步设置" onClick={() => setMenu(false)}><X size={18} /></button><h2>回合自动同步</h2>
      <p>在游戏对局中开启，框选只含回合数字的小区域。收起助手时每两秒检查一次，连续三次一致才更新；展开攻略时暂停采集，避免读到助手文字。</p>
      <p className="m-muted">{scan?.message || '需要重新允许系统屏幕共享，随时可停止。'}</p>
      {pending && <button className="m-primary m-wide" onClick={() => { onRound(pending); setPending(null); setMenu(false); }}>确认同步到 R{pending}</button>}
      {enabled ? <div className="m-two-buttons"><button className="m-secondary" onClick={close}>停止共享</button>{scan.status === 'paused' && <button className="m-primary" onClick={() => { native?.resume(); setMenu(false); }}>继续自动跟进</button>}</div>
        : <button className="m-primary m-wide" disabled={!native} onClick={() => { setRegion(null); native?.start(); setMenu(false); }}>开启并框选回合</button>}
      {!native && <small>自动截屏仅在 Android 安装版可用。</small>}
    </section></div>}
    {preview && <div className="m-modal-backdrop m-calibration"><section className="m-confirm" role="dialog" aria-modal="true" aria-label="框选游戏回合数字"><header><strong>框住游戏回合数字，避开计时和金币</strong><button className="m-icon-button" aria-label="取消回合识别" onClick={close}><X size={18} /></button></header>
      <div className="m-capture-preview" onPointerDown={e => {
        const box = e.currentTarget.getBoundingClientRect(); origin.current = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
        e.currentTarget.setPointerCapture(e.pointerId); setRegion(null);
      }} onPointerMove={e => {
        if (!origin.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const box = e.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)); const y = Math.max(0, Math.min(1, (e.clientY - box.top) / box.height));
        setRegion({ left: Math.min(x, origin.current.x), top: Math.min(y, origin.current.y), right: Math.max(x, origin.current.x), bottom: Math.max(y, origin.current.y) });
      }} onPointerUp={() => { origin.current = null; }}>
        <img src={`data:image/jpeg;base64,${preview}`} alt="游戏截图，拖动框选回合数字" draggable={false} />
        {region && <span style={{ left: `${region.left * 100}%`, top: `${region.top * 100}%`, width: `${(region.right - region.left) * 100}%`, height: `${(region.bottom - region.top) * 100}%` }} />}
      </div><div className="m-two-buttons"><button className="m-secondary" onClick={close}>取消</button><button className="m-primary" disabled={!region || region.right - region.left < .008 || region.bottom - region.top < .008} onClick={() => {
        if (region) { native?.setRegion(region.left, region.top, region.right, region.bottom); setPreview(''); setMenu(false); }
      }}>用此区域同步</button></div>
    </section></div>}
  </>;
}
