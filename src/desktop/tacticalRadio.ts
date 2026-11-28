// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleBanSyncState } from './battleBanSync';
import type { BattleReport } from './battleReportData';

export type RadioPresetId = 'clip1' | 'clip2' | 'clip3' | 'clip4';
export type RadioSlotId = 'bp' | 'prep' | 'boss' | 'combat';
export type RadioLivePhase = 'idle' | RadioSlotId;

export interface RadioPresetMeta {
  id: RadioPresetId;
  shortLabel: string;
  title: string;
  tag: string;
  assetPath: string;
}

export interface RadioSlotMeta {
  id: RadioSlotId;
  code: string;
  title: string;
  triggerDesc: string;
  accent: 'yellow' | 'cyan' | 'red' | 'slate';
  defaultEnabled: boolean;
  defaultPreset: RadioPresetId;
}

export interface RadioSlotConfig {
  enabled: boolean;
  source: 'preset' | 'custom';
  presetId: RadioPresetId;
  customName?: string;
  customSize?: number;
}

export interface TacticalRadioConfig {
  enabled: boolean;
  volume: number; // 0..1
  crossfadeMs: number;
  slots: Record<RadioSlotId, RadioSlotConfig>;
}

export const RADIO_STORAGE_KEY = 'prts:tactical-radio:v1';
export const RADIO_MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // 40 MiB safety limit

export const RADIO_PRESETS: readonly RadioPresetMeta[] = [
  { id: 'clip1', shortLabel: 'Clip 1', title: 'BP 交锋 I', tag: 'S赛 BP 燃曲 · 2:00', assetPath: 'assets/bgm/clip1.mp3' },
  { id: 'clip2', shortLabel: 'Clip 2', title: 'BP 交锋 II', tag: '强节奏节拍 · 2:00', assetPath: 'assets/bgm/clip2.mp3' },
  { id: 'clip3', shortLabel: 'Clip 3', title: '战术压境', tag: '电子推进 · 2:00', assetPath: 'assets/bgm/clip3.mp3' },
  { id: 'clip4', shortLabel: 'Clip 4', title: '决胜时刻', tag: '史诗管弦 · 2:00', assetPath: 'assets/bgm/clip4.mp3' },
] as const;

export const RADIO_SLOTS: readonly RadioSlotMeta[] = [
  {
    id: 'bp',
    code: 'SLOT 01',
    title: '开局选人 / BP 禁选',
    triggerDesc: 'OCR 识别禁选页或收到开局 300 载入帧时自动触发',
    accent: 'yellow',
    defaultEnabled: true,
    defaultPreset: 'clip1',
  },
  {
    id: 'prep',
    code: 'SLOT 02',
    title: '备战 / 特殊休整选购',
    triggerDesc: '进入每回合商店备战（prep）或特殊休整（special_prep）时触发',
    accent: 'cyan',
    defaultEnabled: true,
    defaultPreset: 'clip3',
  },
  {
    id: 'boss',
    code: 'SLOT 03',
    title: 'R14 / R15 首领攻坚战',
    triggerDesc: '进入首领战阶段（boss）自动淡入，击破或结束后淡出',
    accent: 'red',
    defaultEnabled: true,
    defaultPreset: 'clip4',
  },
  {
    id: 'combat',
    code: 'SLOT 04',
    title: '本路 / 协防防守战',
    triggerDesc: '进入本路防守（self）或协防（assist）时触发；默认关闭以保留游戏原声',
    accent: 'slate',
    defaultEnabled: false,
    defaultPreset: 'clip2',
  },
] as const;

const PRESET_SET = new Set<string>(RADIO_PRESETS.map(p => p.id));

export function isPresetId(value: unknown): value is RadioPresetId {
  return typeof value === 'string' && PRESET_SET.has(value);
}

export function getPresetMeta(id: RadioPresetId): RadioPresetMeta {
  return RADIO_PRESETS.find(p => p.id === id) ?? RADIO_PRESETS[0];
}

export function getSlotMeta(id: RadioSlotId): RadioSlotMeta {
  return RADIO_SLOTS.find(s => s.id === id) ?? RADIO_SLOTS[0];
}

export function defaultSlotConfig(slotId: RadioSlotId): RadioSlotConfig {
  const meta = getSlotMeta(slotId);
  return {
    enabled: meta.defaultEnabled,
    source: 'preset',
    presetId: meta.defaultPreset,
  };
}

export function defaultRadioConfig(): TacticalRadioConfig {
  return {
    enabled: false,
    volume: 0.65,
    crossfadeMs: 800,
    slots: {
      bp: defaultSlotConfig('bp'),
      prep: defaultSlotConfig('prep'),
      boss: defaultSlotConfig('boss'),
      combat: defaultSlotConfig('combat'),
    },
  };
}

export function restoreRadioConfig(raw: string | null): TacticalRadioConfig {
  const base = defaultRadioConfig();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : base.enabled;
    const volume = typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
      ? Math.max(0, Math.min(1, parsed.volume))
      : base.volume;
    const crossfadeMs = typeof parsed.crossfadeMs === 'number' && Number.isFinite(parsed.crossfadeMs)
      ? Math.max(0, Math.min(3000, Math.round(parsed.crossfadeMs)))
      : base.crossfadeMs;
    const rawSlots = parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : {};
    const slots = { ...base.slots };
    for (const meta of RADIO_SLOTS) {
      const entry = rawSlots[meta.id];
      if (!entry || typeof entry !== 'object') continue;
      const presetId = isPresetId(entry.presetId) ? entry.presetId : meta.defaultPreset;
      const customName = typeof entry.customName === 'string' && entry.customName.trim()
        ? entry.customName.trim().slice(0, 120)
        : undefined;
      const customSize = typeof entry.customSize === 'number' && Number.isSafeInteger(entry.customSize) && entry.customSize > 0
        ? entry.customSize
        : undefined;
      const source: 'preset' | 'custom' = entry.source === 'custom' && customName ? 'custom' : 'preset';
      slots[meta.id] = {
        enabled: typeof entry.enabled === 'boolean' ? entry.enabled : meta.defaultEnabled,
        source,
        presetId,
        ...(customName ? { customName } : {}),
        ...(customSize ? { customSize } : {}),
      };
    }
    return { enabled, volume, crossfadeMs, slots };
  } catch {
    return base;
  }
}

export function isSlotCustomized(slotId: RadioSlotId, cfg: RadioSlotConfig): boolean {
  const def = defaultSlotConfig(slotId);
  return cfg.source === 'custom'
    || cfg.presetId !== def.presetId
    || cfg.enabled !== def.enabled
    || Boolean(cfg.customName);
}

export function resolveRadioPhase(input: {
  report: BattleReport | null;
  banSync: Pick<BattleBanSyncState, 'ocrStatus' | 'syncSource' | 'ocrSeenCount' | 'liveRound'>;
}): RadioLivePhase {
  const { report, banSync } = input;
  if (report) {
    const activeNumber = report.current ?? report.rounds.at(-1)?.number ?? null;
    const activeRound = activeNumber !== null
      ? report.rounds.find(r => r.number === activeNumber)
      : report.rounds.at(-1);
    const phase = activeRound?.phase ?? '';

    if (phase === 'end') return 'idle';
    if (
      phase === 'boss'
      && activeRound
      && !activeRound.bossEnded
      && !report.defeatedBossRounds.includes(activeRound.number)
    ) {
      return 'boss';
    }
    if (phase === 'self' || phase === 'assist') {
      return 'combat';
    }
    if (phase === 'prep' || phase === 'special_prep') {
      return 'prep';
    }
    if (phase === 'loading') {
      return 'bp';
    }
    if (
      report.current === null
      && report.rounds.length === 0
      && (report.bannedCovenants.length > 0 || Boolean(report.mode))
    ) {
      return 'bp';
    }
  }

  if (
    banSync.liveRound === null
    && (banSync.ocrStatus === 'scanning' || (banSync.syncSource === 'ocr' && banSync.ocrSeenCount > 0))
  ) {
    return 'bp';
  }
  return 'idle';
}

export function phaseDisplayLabel(phase: RadioLivePhase): string {
  switch (phase) {
    case 'bp': return '开局选人 / BP 禁选';
    case 'prep': return '备战 / 特殊休整';
    case 'boss': return 'R14 / R15 首领攻坚';
    case 'combat': return '本路 / 协防战斗';
    default: return '待开局 / 空闲';
  }
}

// ===== IndexedDB Custom Audio Blob Store =====
const IDB_NAME = 'prts_tactical_radio_db';
const IDB_STORE = 'tracks';

function openRadioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function putCustomTrackBlob(slotId: RadioSlotId, blob: Blob): Promise<void> {
  const db = await openRadioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, slotId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
  });
  db.close();
}

async function getCustomTrackBlob(slotId: RadioSlotId): Promise<Blob | null> {
  const db = await openRadioDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(slotId);
    req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  });
  db.close();
  return blob;
}

async function deleteCustomTrackBlob(slotId: RadioSlotId): Promise<void> {
  const db = await openRadioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(slotId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
  });
  db.close();
}

async function clearAllCustomTrackBlobs(): Promise<void> {
  const db = await openRadioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
  });
  db.close();
}

function buildPresetUrl(assetPath: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

export interface TacticalRadioController {
  config: TacticalRadioConfig;
  livePhase: RadioLivePhase;
  previewSlot: RadioSlotId | null;
  activeSlot: RadioSlotId | null;
  activeTrackLabel: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  error: string;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  setCrossfadeMs(ms: number): void;
  setSlotEnabled(slotId: RadioSlotId, enabled: boolean): void;
  selectPreset(slotId: RadioSlotId, presetId: RadioPresetId): void;
  uploadCustomTrack(slotId: RadioSlotId, file: File): Promise<boolean>;
  restoreSlotDefault(slotId: RadioSlotId): Promise<void>;
  restoreAllDefaults(): Promise<void>;
  togglePreview(slotId: RadioSlotId): void;
  stopPreview(): void;
}

export function useTacticalRadio({
  report,
  banSync,
}: {
  report: BattleReport | null;
  banSync: BattleBanSyncState;
}): TacticalRadioController {
  const [config, setConfig] = useState<TacticalRadioConfig>(() => {
    try {
      return restoreRadioConfig(window.localStorage.getItem(RADIO_STORAGE_KEY));
    } catch {
      return defaultRadioConfig();
    }
  });
  const [previewSlot, setPreviewSlot] = useState<RadioSlotId | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [customRev, setCustomRev] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore storage quota errors
    }
  }, [config]);

  const livePhase = useMemo(
    () => resolveRadioPhase({ report, banSync }),
    [report, banSync.liveRound, banSync.ocrSeenCount, banSync.ocrStatus, banSync.syncSource],
  );

  const activeSlot: RadioSlotId | null = useMemo(() => {
    if (previewSlot) return previewSlot;
    if (!config.enabled || livePhase === 'idle') return null;
    return config.slots[livePhase]?.enabled ? livePhase : null;
  }, [config.enabled, config.slots, livePhase, previewSlot]);

  const activeTrackKey = useMemo(() => {
    if (!activeSlot) return '';
    const slot = config.slots[activeSlot];
    if (slot.source === 'custom' && slot.customName) {
      return `custom:${activeSlot}:${slot.customName}:${customRev}`;
    }
    return `preset:${slot.presetId}`;
  }, [activeSlot, config.slots, customRev]);

  const activeTrackLabel = useMemo(() => {
    if (!activeSlot) return '';
    const slot = config.slots[activeSlot];
    if (slot.source === 'custom' && slot.customName) {
      return slot.customName;
    }
    const meta = getPresetMeta(slot.presetId);
    return `${meta.shortLabel} · ${meta.title}`;
  }, [activeSlot, config.slots]);

  // Cache blob URLs for presets & custom tracks so prts://app/ fetch works reliably without stream privilege
  const presetBlobUrlsRef = useRef<Map<RadioPresetId, string>>(new Map());
  const customBlobUrlsRef = useRef<Map<RadioSlotId, string>>(new Map());
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckRef = useRef<'A' | 'B'>('A');
  const currentKeyRef = useRef<string>('');
  const fadeRafRef = useRef<number | null>(null);
  const volumeRef = useRef(config.volume);
  const crossfadeRef = useRef(config.crossfadeMs);
  volumeRef.current = config.volume;
  crossfadeRef.current = config.crossfadeMs;

  const ensureDecks = useCallback(() => {
    if (!deckARef.current) {
      const a = new Audio();
      a.loop = true;
      a.preload = 'auto';
      deckARef.current = a;
    }
    if (!deckBRef.current) {
      const b = new Audio();
      b.loop = true;
      b.preload = 'auto';
      deckBRef.current = b;
    }
    return { a: deckARef.current, b: deckBRef.current };
  }, []);

  const cancelFade = useCallback(() => {
    if (fadeRafRef.current !== null) {
      window.cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
  }, []);

  const resolveTrackBlobUrl = useCallback(async (slotId: RadioSlotId, slotCfg: RadioSlotConfig): Promise<string | null> => {
    if (slotCfg.source === 'custom') {
      const cached = customBlobUrlsRef.current.get(slotId);
      if (cached) return cached;
      try {
        const blob = await getCustomTrackBlob(slotId);
        if (blob) {
          const url = URL.createObjectURL(blob);
          customBlobUrlsRef.current.set(slotId, url);
          return url;
        }
      } catch {
        // fall back to preset if custom blob is missing
      }
    }
    const presetId = slotCfg.presetId;
    const cachedPreset = presetBlobUrlsRef.current.get(presetId);
    if (cachedPreset) return cachedPreset;
    const meta = getPresetMeta(presetId);
    const res = await fetch(buildPresetUrl(meta.assetPath));
    if (!res.ok) throw new Error(`音频资源加载失败（HTTP ${res.status}）`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    presetBlobUrlsRef.current.set(presetId, url);
    return url;
  }, []);

  // Sync live volume slider directly to active deck when not mid-crossfade
  useEffect(() => {
    const activeDeck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
    if (activeDeck && !activeDeck.paused && fadeRafRef.current === null) {
      activeDeck.volume = Math.max(0, Math.min(1, config.volume));
    }
  }, [config.volume]);

  // Crossfade playback controller
  useEffect(() => {
    let cancelled = false;
    const { a, b } = ensureDecks();

    const startCrossfade = (incoming: HTMLAudioElement | null, outgoing: HTMLAudioElement | null) => {
      cancelFade();
      const targetVol = Math.max(0, Math.min(1, volumeRef.current));
      const ms = crossfadeRef.current;
      const outStartVol = outgoing && !outgoing.paused ? outgoing.volume : 0;

      if (ms <= 40) {
        if (outgoing) {
          outgoing.pause();
          outgoing.volume = 0;
        }
        if (incoming) {
          incoming.volume = targetVol;
        } else {
          setIsPlaying(false);
        }
        return;
      }

      const startAt = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startAt) / ms);
        if (outgoing && !outgoing.paused) {
          outgoing.volume = Math.max(0, outStartVol * (1 - t));
        }
        if (incoming) {
          incoming.volume = Math.max(0, Math.min(1, targetVol * t));
        }
        if (t < 1) {
          fadeRafRef.current = window.requestAnimationFrame(step);
        } else {
          fadeRafRef.current = null;
          if (outgoing) {
            outgoing.pause();
            outgoing.currentTime = 0;
            outgoing.volume = 0;
          }
          if (!incoming) {
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
          }
        }
      };
      fadeRafRef.current = window.requestAnimationFrame(step);
    };

    if (!activeSlot || !activeTrackKey) {
      if (currentKeyRef.current) {
        currentKeyRef.current = '';
        const outgoing = activeDeckRef.current === 'A' ? a : b;
        startCrossfade(null, outgoing);
      }
      return () => { cancelled = true; };
    }

    if (currentKeyRef.current === activeTrackKey) {
      return () => { cancelled = true; };
    }

    const slotCfg = config.slots[activeSlot];
    setError('');
    void resolveTrackBlobUrl(activeSlot, slotCfg).then(async (url) => {
      if (cancelled || !url) return;
      const outgoing = activeDeckRef.current === 'A' ? a : b;
      const nextDeckName: 'A' | 'B' = activeDeckRef.current === 'A' ? 'B' : 'A';
      const incoming = nextDeckName === 'A' ? a : b;
      incoming.src = url;
      incoming.currentTime = 0;
      incoming.volume = 0;
      try {
        await incoming.play();
      } catch (playErr) {
        if (!cancelled) {
          setError(playErr instanceof Error ? `播放被浏览器拦截或音频解码失败：${playErr.message}` : '音频播放失败，请点击试听确认权限');
          setIsPlaying(false);
        }
        return;
      }
      if (cancelled) {
        incoming.pause();
        return;
      }
      activeDeckRef.current = nextDeckName;
      currentKeyRef.current = activeTrackKey;
      setIsPlaying(true);
      startCrossfade(incoming, outgoing);
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : '加载音频失败');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeSlot, activeTrackKey, cancelFade, config.slots, ensureDecks, resolveTrackBlobUrl]);

  // Poll playback progress while playing
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const deck = activeDeckRef.current === 'A' ? deckARef.current : deckBRef.current;
      if (deck && !deck.paused) {
        setCurrentTime(Number.isFinite(deck.currentTime) ? deck.currentTime : 0);
        setDuration(Number.isFinite(deck.duration) ? deck.duration : 0);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelFade();
      deckARef.current?.pause();
      deckBRef.current?.pause();
      for (const u of presetBlobUrlsRef.current.values()) URL.revokeObjectURL(u);
      for (const u of customBlobUrlsRef.current.values()) URL.revokeObjectURL(u);
      presetBlobUrlsRef.current.clear();
      customBlobUrlsRef.current.clear();
    };
  }, [cancelFade]);

  const setEnabled = useCallback((enabled: boolean) => {
    setError('');
    if (!enabled) setPreviewSlot(null);
    setConfig(prev => ({ ...prev, enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setConfig(prev => ({ ...prev, volume: clamped }));
  }, []);

  const setCrossfadeMs = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(3000, Math.round(ms)));
    setConfig(prev => ({ ...prev, crossfadeMs: clamped }));
  }, []);

  const setSlotEnabled = useCallback((slotId: RadioSlotId, enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      slots: { ...prev.slots, [slotId]: { ...prev.slots[slotId], enabled } },
    }));
  }, []);

  const selectPreset = useCallback((slotId: RadioSlotId, presetId: RadioPresetId) => {
    setError('');
    setConfig(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slotId]: {
          ...prev.slots[slotId],
          source: 'preset',
          presetId,
        },
      },
    }));
  }, []);

  const uploadCustomTrack = useCallback(async (slotId: RadioSlotId, file: File): Promise<boolean> => {
    setError('');
    if (!file) return false;
    if (file.size <= 0 || file.size > RADIO_MAX_UPLOAD_BYTES) {
      setError(`音频文件体积需在 40 MB 以内（当前 ${(file.size / (1024 * 1024)).toFixed(1)} MB）`);
      return false;
    }
    const isAudioMime = file.type.startsWith('audio/');
    const isAudioExt = /\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i.test(file.name);
    if (!isAudioMime && !isAudioExt) {
      setError('仅支持音频文件（MP3 / WAV / OGG / FLAC / M4A）');
      return false;
    }
    try {
      await putCustomTrackBlob(slotId, file);
      const prevUrl = customBlobUrlsRef.current.get(slotId);
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      customBlobUrlsRef.current.set(slotId, URL.createObjectURL(file));
      setConfig(prev => ({
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: {
            ...prev.slots[slotId],
            enabled: true,
            source: 'custom',
            customName: file.name.slice(0, 120),
            customSize: file.size,
          },
        },
      }));
      setCustomRev(r => r + 1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? `保存本地音频失败：${err.message}` : '保存本地音频失败');
      return false;
    }
  }, []);

  const restoreSlotDefault = useCallback(async (slotId: RadioSlotId) => {
    setError('');
    try {
      await deleteCustomTrackBlob(slotId);
    } catch {
      // ignore IndexedDB delete errors
    }
    const prevUrl = customBlobUrlsRef.current.get(slotId);
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
      customBlobUrlsRef.current.delete(slotId);
    }
    setConfig(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slotId]: defaultSlotConfig(slotId),
      },
    }));
    setCustomRev(r => r + 1);
  }, []);

  const restoreAllDefaults = useCallback(async () => {
    setError('');
    setPreviewSlot(null);
    try {
      await clearAllCustomTrackBlobs();
    } catch {
      // ignore IndexedDB clear errors
    }
    for (const u of customBlobUrlsRef.current.values()) URL.revokeObjectURL(u);
    customBlobUrlsRef.current.clear();
    setConfig(prev => ({
      ...defaultRadioConfig(),
      enabled: prev.enabled,
    }));
    setCustomRev(r => r + 1);
  }, []);

  const togglePreview = useCallback((slotId: RadioSlotId) => {
    setError('');
    setPreviewSlot(prev => (prev === slotId ? null : slotId));
  }, []);

  const stopPreview = useCallback(() => {
    setPreviewSlot(null);
  }, []);

  return {
    config,
    livePhase,
    previewSlot,
    activeSlot,
    activeTrackLabel,
    isPlaying,
    currentTime,
    duration,
    error,
    setEnabled,
    setVolume,
    setCrossfadeMs,
    setSlotEnabled,
    selectPreset,
    uploadCustomTrack,
    restoreSlotDefault,
    restoreAllDefaults,
    togglePreview,
    stopPreview,
  };
}
