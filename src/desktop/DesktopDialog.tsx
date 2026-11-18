import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function DesktopDialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="desktop-dialog" aria-label={title} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <header><h2>{title}</h2><button type="button" className="d-icon" aria-label="关闭详情" onClick={onClose}><X size={18} /></button></header>
    <div className="d-dialog-content">{children}</div>
  </dialog>;
}
