// 青逝痕 Tenkinoko 制作
import { mergeBossRound, REPORT_SEATS, type BattleReport, type BattleRound } from './battleReportData';

export type ReportStatus = 'starting' | 'waiting' | 'connecting' | 'listening' | 'permission' | 'paused' | 'unavailable' | 'incompatible' | 'failed';
export type ClientSource = 'none' | 'pc' | 'mumu' | 'ldplayer';
export type WindowLayoutMode = 'wide' | 'rail' | 'mumu-drawer';

export function isEmulatorClientSource(source?: ClientSource): boolean {
  return source === 'mumu' || source === 'ldplayer';
}

export function emulatorShortLabel(source?: ClientSource): string {
  return source === 'ldplayer' ? '雷电' : 'MuMu';
}
export interface MumuWindowBounds {
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface NpcapInstallState {
  status: 'idle' | 'downloading' | 'installing' | 'installed' | 'error';
  message?: string;
  canFallbackCompat180?: boolean;
}
export interface ReportFeed {
  status: ReportStatus;
  report: unknown;
  reportRun: number;
  clientSource?: ClientSource;
  mumuWindow?: MumuWindowBounds | null;
  npcapInstalled?: boolean;
  npcapInstall?: NpcapInstallState;
  failureReason?: string;
  autoRestartCount?: number;
  restarting?: boolean;
}
export interface BattleReportsBridge {
  getState(): Promise<ReportFeed>;
  showDiagnostics(): Promise<void>;
  setEnabled(enabled: boolean): Promise<ReportFeed>;
  restart?(): Promise<ReportFeed>;
  installNpcap?(options?: { preferCompat180?: boolean }): Promise<ReportFeed>;
  recheckNpcap?(): Promise<ReportFeed>;
  openNpcapPage?(): Promise<boolean>;
  onState(callback: (state: ReportFeed) => void): () => void;
}

export interface ReportStoreConfig {
  dir: string;
  defaultDir: string;
  isCustom: boolean;
  count: number;
  maxCount: number;
}

export interface ReportStoreLoadResult {
  config: ReportStoreConfig;
  records: ReportRecord[];
}

export interface ReportStoreChooseResult extends ReportStoreLoadResult {
  canceled: boolean;
  migratedCount: number;
  error?: string;
}

export interface ReportStoreBridge {
  load(): Promise<ReportStoreLoadResult>;
  save(record: ReportRecord): Promise<{ ok: boolean; storageId?: string; config?: ReportStoreConfig; error?: string }>;
  remove(keyOrId: string): Promise<{ ok: boolean; config?: ReportStoreConfig }>;
  chooseDir(options?: { migrate?: boolean }): Promise<ReportStoreChooseResult>;
  resetDir(): Promise<ReportStoreLoadResult>;
  openDir(): Promise<boolean>;
}

export interface CovenantOcrState {
  id: string;
  status: 'idle' | 'scanning' | 'ready' | 'incomplete' | 'error';
  source: 'none' | 'auto' | 'manual' | 'clipboard';
  message: string;
  progress?: number;
  stageLabel?: string;
  complete: boolean;
  bannedCovenants: string[];
  seenCovenants: string[];
  missingCovenants: string[];
  shortcutAvailable?: boolean;
}
export interface CovenantOcrBridge {
  getState(): Promise<CovenantOcrState>;
  scanWindow(): Promise<CovenantOcrState>;
  scanClipboard(): Promise<CovenantOcrState>;
  setAutoPoll(enabled: boolean): Promise<CovenantOcrState>;
  reset(): Promise<CovenantOcrState>;
  onState(callback: (state: CovenantOcrState) => void): () => void;
}

export type HudScale = 'sm' | 'md' | 'lg';

export interface HudOverlayState {
  open: boolean;
  locked: boolean;
  scale?: HudScale;
  shortcut: string;
  shortcutAvailable?: boolean;
  status: ReportStatus;
  clientSource?: ClientSource;
  drawerCollapsed?: boolean;
  report: unknown;
  guide: {
    round: number;
    compTitle: string;
    paceTip: string;
    suggestedOperators?: string[];
  };
}
export interface HudOverlayBridge {
  getState(): Promise<HudOverlayState>;
  setOpen(flag: boolean): Promise<HudOverlayState>;
  setLocked(locked: boolean): Promise<HudOverlayState>;
  setScale?(scale: HudScale): Promise<HudOverlayState>;
  expandDrawer?(): Promise<HudOverlayState>;
  syncGuide(guide: { round?: number; compTitle?: string; paceTip?: string; suggestedOperators?: string[] }): Promise<HudOverlayState>;
  onState(callback: (state: HudOverlayState) => void): () => void;
}

export interface LanSyncState {
  enabled: boolean;
  port: number;
  pin: string;
  addresses: string[];
  peerCount: number;
  lastSyncAt: number | null;
  error: string;
}
export interface LanSyncBridge {
  getState(): Promise<LanSyncState>;
  setEnabled(enabled: boolean): Promise<LanSyncState>;
  refreshPin(): Promise<LanSyncState>;
  syncGuide(guide: {
    bannedCovenants?: string[];
    currentRound?: number;
    selectedCompId?: string;
    compTitle?: string;
    paceTip?: string;
  }): Promise<LanSyncState>;
  onState(callback: (state: LanSyncState) => void): () => void;
}

export interface WindowLayoutState {
  mode: WindowLayoutMode;
  alwaysOnTop: boolean;
  clientSource?: ClientSource;
  mumuWindow?: MumuWindowBounds | null;
  placement?: 'outside-right' | 'inside-right' | 'screen-right' | null;
  autoMumuEnabled?: boolean;
  drawerCollapsed?: boolean;
}
export interface WindowLayoutBridge {
  getMode(): Promise<WindowLayoutState>;
  setMode(mode: WindowLayoutMode): Promise<WindowLayoutState>;
  snapToMumu?(): Promise<WindowLayoutState>;
  collapseToHud?(): Promise<WindowLayoutState>;
  setAutoMumu?(enabled: boolean): Promise<WindowLayoutState>;
  onState?(callback: (state: WindowLayoutState) => void): () => void;
}

export interface HotUpdatePatchInfo {
  version: string;
  product: string;
  minNativeVersion: string;
  maxNativeVersion?: string;
  url: string;
  sha256: string;
  size: number;
  signature: string;
  notes?: string;
}

export interface HotUpdateNativeInfo {
  version: string;
  downloadUrl: string;
  sha256?: string;
  size?: number;
  notes?: string;
}

export interface HotUpdateState {
  nativeVersion: string;
  uiVersion: string;
  activeKind: 'builtin' | 'stable' | 'pending';
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready-to-restart' | 'error';
  downloadProgress: number;
  error: string | null;
  lastCheckedAt: string | null;
  lastRollbackReason: string | null;
  availableUi: HotUpdatePatchInfo | null;
  stagedUiVersion: string | null;
  nativeUpdate: HotUpdateNativeInfo | null;
  activeData: Record<string, unknown> | null;
  announcement: string | null;
}

export interface HotUpdateBridge {
  getState(): Promise<HotUpdateState>;
  check(): Promise<HotUpdateState>;
  downloadUi(): Promise<HotUpdateState>;
  applyRestart(): Promise<void>;
  confirmHealthy(): Promise<HotUpdateState>;
  rollback(): Promise<HotUpdateState>;
  openNativeDownload(): Promise<boolean>;
  onState(callback: (state: HotUpdateState) => void): () => void;
}

export interface CDriveResidueItem {
  id: string;
  label: string;
  description: string;
  path: string;
  category: 'cache' | 'profile' | 'reports' | 'pointer';
  bytes: number;
  isActive: boolean;
  canCleanNow: boolean;
}

export interface StorageOverview {
  productKey: 'stronghold' | 'telemetry';
  dataRoot: string | null;
  effectiveRoot: string;
  profileDir: string;
  runtimeCacheDir: string | null;
  reportDir: string;
  portableDir: string;
  source: 'env' | 'portable-ini' | 'pointer-ini' | 'auto-exedir' | 'legacy-appdata';
  isOnSystemDrive: boolean;
  freeBytesOnDataDrive: number | null;
  freeBytesOnCDrive: number | null;
  sizes: {
    runtimeCacheBytes: number;
    profileBytes: number;
    hotUpdateBytes: number;
    browserCacheBytes: number;
    reportsBytes: number;
    totalBytes: number;
  };
  cDriveResidues: CDriveResidueItem[];
  cDriveTotalBytes: number;
  cDriveCleanableBytes: number;
}

export interface StorageChooseRootResult {
  canceled: boolean;
  targetDir?: string;
  ok?: boolean;
  normalizedPath?: string;
  freeBytes?: number | null;
  error?: string;
  warning?: string;
}

export interface StorageBridge {
  getOverview(): Promise<StorageOverview | null>;
  chooseRoot(): Promise<StorageChooseRootResult>;
  migrateRoot(options: { targetDir: string; includeReports?: boolean }): Promise<{ ok: boolean; newDataRoot?: string; restarting?: boolean; error?: string }>;
  openDir(targetPath?: string): Promise<boolean>;
  clearCache(): Promise<{ ok: boolean; freedBytes: number; overview?: StorageOverview }>;
  cleanCDriveResidues(options?: { ids?: string[]; uninstallAll?: boolean; includeReports?: boolean }): Promise<{
    ok: boolean;
    freedBytes?: number;
    cleanedCount?: number;
    scheduledCount?: number;
    failed?: string[];
    exiting?: boolean;
    error?: string;
    overview?: StorageOverview;
  }>;
}

declare global {
  interface Window {
    electronAPI?: {
      setAlwaysOnTop(flag: boolean): Promise<boolean>;
      hotUpdate?: HotUpdateBridge;
      windowLayout?: WindowLayoutBridge;
      battleReports?: BattleReportsBridge;
      reportStore?: ReportStoreBridge;
      storage?: StorageBridge;
      covenantOcr?: CovenantOcrBridge;
      hud?: HudOverlayBridge;
      lanSync?: LanSyncBridge;
    };
  }
}

export type ManualNames = Partial<Record<(typeof REPORT_SEATS)[number], string>>;
export type ReportSeat = (typeof REPORT_SEATS)[number];
export interface ReportRecord {
  key: string;
  storageId?: string;
  report: BattleReport;
  label: string;
  seenAt: number;
  manualNames?: ManualNames;
  manualSelfSeat?: ReportSeat;
}
export interface ReportRecords { live?: ReportRecord; history: ReportRecord[] }
export const MAX_REPORT_HISTORY = 60;
export const MAX_MANUAL_NAME_LENGTH = 80;

export function recordStorageId(entry: ReportRecord): string {
  if (entry.storageId) return entry.storageId;
  if (entry.key.startsWith('saved:')) return entry.key.slice('saved:'.length);
  const matchPart = entry.report.match === null ? 'local' : String(entry.report.match).replace(/[^A-Za-z0-9._-]+/g, '-');
  return `report-${Math.trunc(entry.seenAt)}-${matchPart || 'local'}`;
}

export function mergeLoadedHistory(current: ReportRecords, loaded: ReportRecord[]): ReportRecords {
  if (!loaded.length) return current;
  const seenIds = new Set<string>();
  if (current.live) seenIds.add(recordStorageId(current.live));
  const merged: ReportRecord[] = [];
  for (const item of [...current.history, ...loaded]) {
    const id = recordStorageId(item);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    merged.push(item.storageId ? item : { ...item, storageId: id });
  }
  merged.sort((a, b) => b.seenAt - a.seenAt);
  return { live: current.live, history: merged.slice(0, MAX_REPORT_HISTORY) };
}

export function removeHistoryRecord(records: ReportRecords, key: string): ReportRecords {
  const targetId = key.startsWith('saved:') ? key.slice('saved:'.length) : key;
  const history = records.history.filter(item => item.key !== key && recordStorageId(item) !== targetId);
  return history.length === records.history.length ? records : { live: records.live, history };
}

export const canEditPlayerNames = (entry: ReportRecord) => entry.report.match !== null;
export const canConfirmSelfSeat = (entry: ReportRecord) => canEditPlayerNames(entry) && entry.report.self === null;

export function setReportPlayerNames(records: ReportRecords, key: string, values: ManualNames): ReportRecords {
  const update = (entry: ReportRecord): ReportRecord => {
    if (entry.key !== key || !canEditPlayerNames(entry)) return entry;
    const names: ManualNames = {};
    for (const seat of REPORT_SEATS) {
      const value = entry.report.names[seat] ? entry.manualNames?.[seat] : values[seat];
      const name = value?.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_MANUAL_NAME_LENGTH);
      if (name) names[seat] = name;
    }
    return { ...entry, manualNames: names };
  };
  return { live: records.live && update(records.live), history: records.history.map(update) };
}

export function setReportSelfSeat(records: ReportRecords, key: string, value: ReportSeat | null): ReportRecords {
  const update = (entry: ReportRecord): ReportRecord => {
    if (entry.key !== key || !canConfirmSelfSeat(entry)) return entry;
    const next = { ...entry };
    if (value === null) delete next.manualSelfSeat;
    else next.manualSelfSeat = value;
    return next;
  };
  return { live: records.live && update(records.live), history: records.history.map(update) };
}

export function reportWithPlayerNames(entry: ReportRecord): BattleReport {
  const manualSelf = entry.report.self === null && entry.manualSelfSeat !== undefined;
  if (!entry.manualNames && !manualSelf) return entry.report;
  const names = { ...entry.report.names };
  for (const seat of REPORT_SEATS) if (!names[seat]) {
    names[seat] = entry.manualNames?.[seat] ?? '';
  }
  return { ...entry.report, names, self: entry.report.self ?? entry.manualSelfSeat ?? null, selfManual: manualSelf };
}

const hasAssistResult = (row: BattleRound) => (row.assistsStatus !== '' && row.assistsStatus !== 'unknown')
  || row.assistPairs.length > 0 || row.unattributedAssists > 0 || Object.keys(row.assists).length > 0;

function mergeSameMatch(previous: BattleReport, incoming: BattleReport): BattleReport {
  // These are cumulative snapshots. Keep records when omitted, not in addition to a
  // newer settlement (including an explicit zero). Seat attribution can still change.
  const rounds = new Map(incoming.rounds.map(row => [row.number, row]));
  const names = { ...incoming.names };
  let changed = false;
  let self = incoming.self;
  let selfBySettlement = incoming.selfBySettlement;
  // Once the local player's seat is confirmed (not settlement-inferred), prevent spectator or corrupt frames from drifting it.
  if (previous.self !== null && !previous.selfBySettlement && incoming.self !== previous.self) {
    self = previous.self;
    selfBySettlement = false;
    changed = true;
  }
  for (const seat of REPORT_SEATS) if (!names[seat] && previous.names[seat]) {
    names[seat] = previous.names[seat];
    changed = true;
  }
  for (const old of previous.rounds) {
    let row = rounds.get(old.number);
    const oldKinds = self === previous.self ? old.selfLeakEnemies : old.selfLeakEnemies && [];
    if (!row) {
      row = oldKinds === old.selfLeakEnemies ? old : { ...old, selfLeakEnemies: oldKinds };
    } else {
      const missingAssist = !hasAssistResult(row);
      const missingLeaks = !Object.keys(row.leaks).length && !Object.keys(row.leakMinimums).length
        && !['reported', 'observed'].includes(row.leaksStatus);
      if (missingLeaks && (Object.keys(old.leaks).length || Object.keys(old.leakMinimums).length))
        row = { ...row, leaks: old.leaks, leaksStatus: old.leaksStatus, leakMinimums: old.leakMinimums };
      if (missingAssist && !Object.keys(row.uncoveredLeaks).length && !['reported', 'observed'].includes(row.uncoveredStatus)
          && (Object.keys(old.uncoveredLeaks).length || ['reported', 'observed'].includes(old.uncoveredStatus)))
        row = { ...row, uncoveredLeaks: old.uncoveredLeaks, uncoveredStatus: old.uncoveredStatus, uncoveredEnemies: old.uncoveredEnemies };
      if (missingAssist && !Object.keys(row.hpCosts).length && Object.keys(old.hpCosts).length)
        row = { ...row, hpCosts: old.hpCosts, skippedCosts: old.skippedCosts };
      if (missingAssist && missingLeaks && old.allPlayersLeaked) row = { ...row, allPlayersLeaked: true };
      if (row.selfLeaks === null && old.selfLeaks !== null) {
        row = { ...row, selfLeaks: old.selfLeaks, selfLeakEnemies: oldKinds,
          unassignedSelfLeaks: self === null ? old.selfLeaks : null };
      }
      if (missingAssist && hasAssistResult(old)) {
        row = { ...row, assists: old.assists, assistsStatus: old.assistsStatus,
          assistsPartial: old.assistsPartial, assistPairs: old.assistPairs, assistEnemies: old.assistEnemies,
          unattributedAssists: old.unattributedAssists };
      }
      const isBossRow = row.number >= 14 || row.phase === 'boss' || old.phase === 'boss'
        || row.bossEnded || old.bossEnded
        || incoming.bossRounds.includes(row.number) || previous.bossRounds.includes(row.number);
      if (isBossRow) row = mergeBossRound(old, row);
    }
    if (rounds.get(old.number) !== row) {
      rounds.set(old.number, row);
      changed = true;
    }
  }
  const hp = { ...previous.hp, ...incoming.hp };
  const eliminated = { ...previous.eliminated };
  for (const seat of REPORT_SEATS) {
    if (incoming.eliminated[seat] !== undefined) {
      eliminated[seat] = eliminated[seat] !== undefined
        ? Math.min(eliminated[seat], incoming.eliminated[seat])
        : incoming.eliminated[seat];
    } else if (incoming.hp[seat] !== undefined && incoming.hp[seat] > 0) {
      delete eliminated[seat];
    }
  }
  if (Object.keys(eliminated).length !== Object.keys(incoming.eliminated).length
    || REPORT_SEATS.some(s => eliminated[s] !== incoming.eliminated[s] || hp[s] !== incoming.hp[s])) {
    changed = true;
  }
  const bossRoundSet = new Set([...previous.bossRounds, ...incoming.bossRounds]);
  const bossRounds = bossRoundSet.size > incoming.bossRounds.length
    ? [...bossRoundSet].sort((a, b) => a - b)
    : incoming.bossRounds;
  if (bossRounds !== incoming.bossRounds) changed = true;
  let bannedCovenants = incoming.bannedCovenants;
  if (!bannedCovenants.length && previous.bannedCovenants.length) {
    bannedCovenants = previous.bannedCovenants;
    changed = true;
  }
  const defeatedSet = new Set([...previous.defeatedBossRounds, ...incoming.defeatedBossRounds]);
  const defeatedBossRounds = defeatedSet.size > incoming.defeatedBossRounds.length
    ? [...defeatedSet].sort((a, b) => a - b)
    : incoming.defeatedBossRounds;
  if (defeatedBossRounds !== incoming.defeatedBossRounds) changed = true;
  let lineups = incoming.lineups;
  if (!Object.keys(lineups).length && Object.keys(previous.lineups).length) {
    lineups = previous.lineups;
    changed = true;
  }
  let deckPool = incoming.deckPool;
  if (!deckPool && previous.deckPool) {
    deckPool = previous.deckPool;
    changed = true;
  }
  let telemetry = incoming.telemetry;
  if (!telemetry && previous.telemetry) {
    telemetry = previous.telemetry;
    changed = true;
  }
  return changed ? { ...incoming, self, selfBySettlement, names, hp, eliminated, bossRounds, bannedCovenants, defeatedBossRounds, lineups, deckPool, telemetry, rounds: [...rounds.values()].sort((a, b) => a.number - b.number) } : incoming;
}

export function updateLiveReport(records: ReportRecords, report: BattleReport | null, run: number, now: number): ReportRecords {
  const { live, history } = records;
  if (!report) {
    if (!live) return records;
    return { history: [live, ...history.filter(entry => entry.key !== live.key)].slice(0, MAX_REPORT_HISTORY) };
  }
  const key = `${run}:${report.match ?? 'unknown'}`;
  const sameLive = live?.key === key ? live : undefined;
  const previous = sameLive ?? history.find(entry => entry.key === key);
  const next = previous && report.match !== null ? mergeSameMatch(previous.report, report) : report;
  if (sameLive) return { live: { ...sameLive, manualSelfSeat: next.self === null ? sameLive.manualSelfSeat : undefined, report: next }, history };
  const rest = history.filter(entry => entry.key !== key && entry.key !== live?.key);
  return {
    live: { manualNames: previous?.manualNames, manualSelfSeat: next.self === null ? previous?.manualSelfSeat : undefined,
      key, report: next, label: report.match === null ? '本地实况' : `本地对局 ${report.match}`,
      seenAt: previous?.seenAt ?? now },
    history: (live ? [live, ...rest] : rest).slice(0, MAX_REPORT_HISTORY),
  };
}
