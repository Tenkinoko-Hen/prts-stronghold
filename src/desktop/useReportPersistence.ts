// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  mergeLoadedHistory,
  recordStorageId,
  removeHistoryRecord,
  type ReportRecord,
  type ReportRecords,
  type ReportStoreConfig,
} from './battleReports';

const FALLBACK_STORAGE_KEY = 'prts.savedReports.v1';
const MAX_FALLBACK_RECORDS = 12;

export interface ReportStorageController {
  config: ReportStoreConfig | null;
  nativeSupported: boolean;
  busy: boolean;
  notice: string;
  error: string;
  chooseDir(): Promise<void>;
  resetDir(): Promise<void>;
  openDir(): Promise<void>;
  deleteRecord(entry: ReportRecord): Promise<void>;
}

function isPersistable(entry: ReportRecord | undefined): entry is ReportRecord {
  if (!entry || entry.key.startsWith('demo:')) return false;
  return entry.report.rounds.length > 0 || (entry.report.telemetry?.operators.length ?? 0) > 0;
}

function fingerprintRecord(entry: ReportRecord): string {
  const rounds = entry.report.rounds;
  const lastRound = rounds[rounds.length - 1];
  const bossKeys = rounds.reduce((acc, r) => acc + Object.keys(r.bossDamage).length + r.bossOfficial.length + r.bossUplinkRows.length, 0);
  const manualNames = entry.manualNames ? JSON.stringify(entry.manualNames) : '';
  return [
    recordStorageId(entry),
    entry.label,
    entry.report.current ?? 0,
    rounds.length,
    lastRound?.phase ?? '',
    lastRound?.leaksStatus ?? '',
    lastRound?.assistsStatus ?? '',
    lastRound?.selfLeaks ?? '',
    bossKeys,
    Object.keys(entry.report.eliminated).length,
    entry.report.telemetry?.operators.length ?? 0,
    entry.report.telemetry?.operators.reduce((sum, op) => sum + op.totalDamage, 0) ?? 0,
    manualNames,
    entry.manualSelfSeat ?? '',
  ].join('|');
}

function loadFallbackRecords(): ReportRecord[] {
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ReportRecord => Boolean(
      item && typeof item === 'object' && typeof item.seenAt === 'number' && item.report && Array.isArray(item.report.rounds),
    ));
  } catch {
    return [];
  }
}

function saveFallbackRecords(records: ReportRecords) {
  try {
    const all: ReportRecord[] = [];
    const seen = new Set<string>();
    for (const item of [records.live, ...records.history]) {
      if (!isPersistable(item)) continue;
      const id = recordStorageId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      all.push({ ...item, key: `saved:${id}`, storageId: id });
      if (all.length >= MAX_FALLBACK_RECORDS) break;
    }
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota errors in fallback mode.
  }
}

export function useReportPersistence({
  records,
  setRecords,
  disabled = false,
}: {
  records: ReportRecords;
  setRecords: Dispatch<SetStateAction<ReportRecords>>;
  disabled?: boolean;
}): ReportStorageController {
  const storeApi = typeof window !== 'undefined' ? window.electronAPI?.reportStore : undefined;
  const [config, setConfig] = useState<ReportStoreConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const savedFingerprintsRef = useRef<Map<string, string>>(new Map());
  const latestRecordsRef = useRef(records);
  latestRecordsRef.current = records;

  // 1. 启动自动加载已落盘战报（桌面优先本地目录，旧壳或浏览器回退 localStorage）
  useEffect(() => {
    if (disabled) return;
    let mounted = true;
    if (storeApi) {
      void storeApi.load()
        .then(res => {
          if (!mounted) return;
          setConfig(res.config);
          for (const item of res.records) {
            savedFingerprintsRef.current.set(recordStorageId(item), fingerprintRecord(item));
          }
          if (res.records.length > 0) {
            setRecords(prev => mergeLoadedHistory(prev, res.records));
          }
        })
        .catch(() => {});
    } else {
      const localSaved = loadFallbackRecords();
      if (localSaved.length > 0) {
        setRecords(prev => mergeLoadedHistory(prev, localSaved));
      }
    }
    return () => { mounted = false; };
  }, [disabled, setRecords, storeApi]);

  const persistSingle = useCallback(async (entry: ReportRecord) => {
    if (!storeApi || !isPersistable(entry)) return;
    const id = recordStorageId(entry);
    const fp = fingerprintRecord(entry);
    if (savedFingerprintsRef.current.get(id) === fp) return;
    savedFingerprintsRef.current.set(id, fp);
    try {
      const res = await storeApi.save({ ...entry, storageId: id });
      if (res.ok && res.config) {
        setConfig(res.config);
      } else if (!res.ok) {
        savedFingerprintsRef.current.delete(id);
      }
    } catch {
      savedFingerprintsRef.current.delete(id);
    }
  }, [storeApi]);

  // 2. 历史归档 / 手动改名 / 席位确认立刻落盘
  useEffect(() => {
    if (disabled) return;
    if (!storeApi) {
      saveFallbackRecords(records);
      return;
    }
    for (const item of records.history) {
      if (isPersistable(item)) {
        void persistSingle(item);
      }
    }
  }, [disabled, persistSingle, records, storeApi]);

  // 3. 实时对局节流落盘（1.2s）+ 退出前兜底刷盘
  useEffect(() => {
    if (disabled || !isPersistable(records.live)) return;
    if (!storeApi) {
      const timer = window.setTimeout(() => saveFallbackRecords(latestRecordsRef.current), 1200);
      return () => window.clearTimeout(timer);
    }
    const target = records.live;
    const timer = window.setTimeout(() => {
      void persistSingle(target);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [disabled, persistSingle, records.live, storeApi]);

  useEffect(() => {
    if (disabled) return;
    const onUnload = () => {
      const cur = latestRecordsRef.current;
      if (!storeApi) {
        saveFallbackRecords(cur);
        return;
      }
      if (isPersistable(cur.live)) {
        void storeApi.save({ ...cur.live, storageId: recordStorageId(cur.live) });
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [disabled, storeApi]);

  const chooseDir = useCallback(async () => {
    if (!storeApi || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await storeApi.chooseDir({ migrate: true });
      if (res.config) setConfig(res.config);
      if (res.error) {
        setError(res.error);
      } else if (!res.canceled) {
        savedFingerprintsRef.current.clear();
        for (const item of res.records) {
          savedFingerprintsRef.current.set(recordStorageId(item), fingerprintRecord(item));
        }
        setRecords(prev => ({ live: prev.live, history: res.records }));
        setNotice(res.migratedCount > 0
          ? `已切换保存路径，并自动迁移 ${res.migratedCount} 局本地战报。`
          : '已切换本地战报保存路径。');
      }
    } catch {
      setError('切换保存路径失败，请确认目标文件夹可写入。');
    } finally {
      setBusy(false);
    }
  }, [busy, setRecords, storeApi]);

  const resetDir = useCallback(async () => {
    if (!storeApi || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await storeApi.resetDir();
      setConfig(res.config);
      savedFingerprintsRef.current.clear();
      for (const item of res.records) {
        savedFingerprintsRef.current.set(recordStorageId(item), fingerprintRecord(item));
      }
      setRecords(prev => ({ live: prev.live, history: res.records }));
      setNotice('已恢复为默认「我的文档」战报路径。');
    } catch {
      setError('恢复默认路径失败。');
    } finally {
      setBusy(false);
    }
  }, [busy, setRecords, storeApi]);

  const openDir = useCallback(async () => {
    if (!storeApi) return;
    setError('');
    const ok = await storeApi.openDir().catch(() => false);
    if (!ok) setError('无法打开战报目录，请检查文件夹是否存在。');
  }, [storeApi]);

  const deleteRecord = useCallback(async (entry: ReportRecord) => {
    const id = recordStorageId(entry);
    setError('');
    setNotice('');
    if (storeApi) {
      const res = await storeApi.remove(id).catch(() => ({ ok: false, config: undefined }));
      if (res.config) setConfig(res.config);
    }
    savedFingerprintsRef.current.delete(id);
    setRecords(prev => {
      const next = removeHistoryRecord(prev, entry.key);
      if (!storeApi) saveFallbackRecords(next);
      return next;
    });
  }, [setRecords, storeApi]);

  return {
    config,
    nativeSupported: Boolean(storeApi),
    busy,
    notice,
    error,
    chooseDir,
    resetDir,
    openDir,
    deleteRecord,
  };
}
