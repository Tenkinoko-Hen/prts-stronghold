// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ScanSearch, Sparkles, X } from 'lucide-react';
import { PRTS_OPERATOR_TIERS, resolveOperatorAvatars } from '../data/prtsAvatars';
import type { MetaCompGuide } from '../data/strongholdData';
import type { OperatorOwnership } from './mobileSession';

export interface ShopScanStateData {
  id: string;
  status: 'idle' | 'permission' | 'scanning' | 'ready' | 'error';
  message: string;
  scannedAt: number;
  detected: string[];
  matchedTargets: string[];
}

declare global {
  interface Window {
    PRTSShop?: {
      scan(catalogJson: string, targetsJson: string): void;
      getState(): string;
      isProjectionReady?(): boolean;
      reset(): void;
    };
  }
}

const ALL_OPERATOR_CATALOG = Object.keys(PRTS_OPERATOR_TIERS);

export function classifyShopMatches(
  detected: string[],
  comp: MetaCompGuide,
  ownedMap: Record<string, OperatorOwnership>,
  currentRoundNames: string[],
): { name: string; priority: 'urgent' | 'core' | 'bench' | 'done' | 'other'; label: string }[] {
  const fieldSet = new Set<string>();
  const benchSet = new Set<string>();
  const urgentSet = new Set<string>(currentRoundNames);
  for (const p of comp.phases) {
    for (const op of p.fieldOperators) {
      for (const r of resolveOperatorAvatars(op.name)) fieldSet.add(r.cleanName);
    }
    for (const op of p.benchOperators) {
      for (const r of resolveOperatorAvatars(op.name)) benchSet.add(r.cleanName);
    }
  }
  const rank = { urgent: 0, core: 1, bench: 2, done: 3, other: 4 };
  return detected
    .map(name => {
      const state = ownedMap[name];
      if (state === 'elite') return { name, priority: 'done' as const, label: '已精锐' };
      if (urgentSet.has(name)) return { name, priority: 'urgent' as const, label: state === 'owned' ? '本回合·追精锐' : '本回合急抓' };
      if (fieldSet.has(name)) return { name, priority: 'core' as const, label: state === 'owned' ? '阵容·补对子' : '阵容必抓' };
      if (benchSet.has(name)) return { name, priority: 'bench' as const, label: '整备组件' };
      return { name, priority: 'other' as const, label: '非本阵' };
    })
    .sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export function ShopScanner({
  comp,
  ownedMap,
  currentRoundNames,
  onToggleOwned,
  compact = false,
}: {
  comp: MetaCompGuide;
  ownedMap: Record<string, OperatorOwnership>;
  currentRoundNames: string[];
  onToggleOwned(name: string): void;
  compact?: boolean;
}) {
  const native = window.PRTSShop;
  const [scan, setScan] = useState<ShopScanStateData | null>(null);
  const [openResult, setOpenResult] = useState(false);

  const wantedTargets = useMemo(() => {
    const set = new Set<string>();
    for (const name of currentRoundNames) {
      if (ownedMap[name] !== 'elite') set.add(name);
    }
    for (const p of comp.phases) {
      for (const op of [...p.fieldOperators, ...p.benchOperators]) {
        for (const r of resolveOperatorAvatars(op.name)) {
          if (ownedMap[r.cleanName] !== 'elite') set.add(r.cleanName);
        }
      }
    }
    return [...set];
  }, [comp, ownedMap, currentRoundNames]);

  const readState = useCallback(() => {
    if (!native) return null;
    try {
      const parsed = JSON.parse(native.getState()) as ShopScanStateData;
      if (parsed && typeof parsed.status === 'string') {
        setScan(parsed);
        if (parsed.status === 'ready' || parsed.status === 'error') {
          setOpenResult(true);
        }
        return parsed;
      }
    } catch {}
    return null;
  }, [native]);

  const triggerScan = useCallback(() => {
    if (!native) return;
    setOpenResult(true);
    native.scan(JSON.stringify(ALL_OPERATOR_CATALOG), JSON.stringify(wantedTargets));
    readState();
  }, [native, wantedTargets, readState]);

  useEffect(() => {
    if (!native) return;
    const onStripShop = () => triggerScan();
    window.addEventListener('prts-strip-shop-scan', onStripShop);
    return () => window.removeEventListener('prts-strip-shop-scan', onStripShop);
  }, [native, triggerScan]);

  useEffect(() => {
    if (!native) return;
    const busy = scan?.status === 'permission' || scan?.status === 'scanning';
    if (!busy && !openResult) return;
    const timer = window.setInterval(readState, busy ? 250 : 1200);
    return () => window.clearInterval(timer);
  }, [native, scan?.status, openResult, readState]);

  const items = useMemo(
    () => (scan?.detected?.length ? classifyShopMatches(scan.detected, comp, ownedMap, currentRoundNames) : []),
    [scan?.detected, comp, ownedMap, currentRoundNames],
  );

  const scanning = scan?.status === 'permission' || scan?.status === 'scanning';
  const projectionReady = Boolean(native?.isProjectionReady?.());

  return (
    <div className={`m-shop-scanner${compact ? ' is-compact' : ''}`}>
      <button
        type="button"
        className="m-shop-scan-btn"
        disabled={!native || scanning}
        onClick={triggerScan}
        title={native ? (projectionReady ? '已复用本局授权，一键扫描底部商店高亮核心' : '扫描底部商店高亮本阵核心') : '仅在 Android 安装版支持一键扫商店'}
      >
        <ScanSearch size={13} />
        <span>{scanning ? '扫店中…' : '扫商店'}</span>
      </button>

      {openResult && scan && scan.status !== 'idle' && (
        <div className="m-shop-result" role="status" aria-live="polite">
          <div className="m-shop-result-head">
            <span><Sparkles size={12} /> {scan.message}</span>
            <button type="button" className="m-shop-close" aria-label="收起商店识别结果" onClick={() => setOpenResult(false)}>
              <X size={13} />
            </button>
          </div>
          {items.length > 0 && (
            <div className="m-shop-chips">
              {items.map(item => (
                <button
                  key={item.name}
                  type="button"
                  className={`m-shop-chip is-${item.priority}`}
                  onClick={() => onToggleOwned(item.name)}
                  title="点击直接打卡为已到手 / 已精锐"
                >
                  <strong>{item.name}</strong>
                  <small>{item.label}</small>
                  {ownedMap[item.name] && <Check size={11} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
