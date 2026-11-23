import { useEffect, useRef, useState } from 'react';
import { CovenantScan, parseCovenantScan } from '../mobile/covenantScan';
import type { BattleReportsBridge } from '../../modules/battle-report/src/desktop/battleReports';

export interface DesktopCovenantScan extends CovenantScan {
  sourceId: string;
  sourceName: string;
  shortcutAvailable: boolean;
  elapsedMs?: number;
}
export interface CaptureSource { id: string; name: string; thumbnail: string }
interface DesktopOcrBridge {
  listSources(): Promise<CaptureSource[]>;
  getState(): Promise<DesktopCovenantScan>;
  selectSource(id: string): Promise<DesktopCovenantScan>;
  start(mode: 'window' | 'clipboard'): Promise<DesktopCovenantScan>;
  cancel(): Promise<DesktopCovenantScan>;
  reset(): Promise<DesktopCovenantScan>;
  onState(callback: (state: DesktopCovenantScan) => void): () => void;
  onOpen(callback: () => void): () => void;
}
declare global {
  interface Window {
    electronAPI?: { setAlwaysOnTop(flag: boolean): Promise<boolean>; covenantOcr?: DesktopOcrBridge; battleReports?: BattleReportsBridge };
  }
}
export const desktopOcr = window.electronAPI?.covenantOcr;

export function useDesktopCovenantScan(onReady: (scan: DesktopCovenantScan) => void, onOpen: () => void) {
  const [scan, setScan] = useState<DesktopCovenantScan | null>(null);
  const appliedId = useRef('');
  const suppress = useRef(false);
  const callbacks = useRef({ onReady, onOpen });
  callbacks.current = { onReady, onOpen };
  const accept = (raw: DesktopCovenantScan) => {
    if (suppress.current) return;
    const parsed = parseCovenantScan(JSON.stringify(raw));
    if (!parsed) return;
    const value = { ...raw, ...parsed };
    setScan(value);
    if (value.status === 'ready' && value.complete && value.id !== appliedId.current) {
      appliedId.current = value.id;
      callbacks.current.onReady(value);
    }
  };
  useEffect(() => {
    if (!desktopOcr) return;
    let mounted = true;
    let received = false;
    const offState = desktopOcr.onState(value => { received = true; accept(value); });
    const offOpen = desktopOcr.onOpen(() => callbacks.current.onOpen());
    void desktopOcr.getState().then(value => { if (mounted && !received) accept(value); }).catch(() => {});
    return () => { mounted = false; offState(); offOpen(); };
  }, []);
  const stop = async (reset: boolean) => {
    if (!desktopOcr) return;
    suppress.current = true;
    try {
      const value = await (reset ? desktopOcr.reset() : desktopOcr.cancel());
      suppress.current = false;
      accept(value);
    } finally { suppress.current = false; }
  };
  return { scan, reset: () => stop(true), cancel: () => stop(false) };
}
