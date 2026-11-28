// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useRef, useState } from 'react';
import { mapBannedBondsToCovenants } from './covenantBonds';
import type { CovenantOcrState, NpcapInstallState, ReportFeed, ReportStatus } from './battleReports';
import type { BanPickState } from '../utils/tacticalLogic';

export interface LightBattleSyncMeta {
  match: number | null;
  current: number | null;
  latestRound: number | null;
  latestRoundSettled?: boolean;
  mode: string;
  bannedCovenants: string[];
  hasMatchActivity: boolean;
}

export interface GuideRoundFollowState {
  currentRound: number;
  autoFollowRound: boolean;
}

export function maxRoundForMode(mode: string): number {
  if (mode === 'mode_training_2') return 4;
  if (mode === 'mode_single_funny') return 9;
  return 15;
}

export function applyManualGuideRound(
  nextRound: number,
  liveRound: number | null,
): GuideRoundFollowState {
  const clamped = Math.max(1, Math.min(15, Math.trunc(nextRound || 1)));
  return {
    currentRound: clamped,
    autoFollowRound: liveRound === null ? true : clamped === liveRound,
  };
}

export function reconcileLiveGuideRound(
  prev: GuideRoundFollowState,
  prevLiveRound: number | null,
  nextLiveRound: number | null,
): GuideRoundFollowState {
  if (nextLiveRound === null) return prev;
  const clampedLive = Math.max(1, Math.min(15, Math.trunc(nextLiveRound)));
  if (prev.autoFollowRound) {
    return { currentRound: clampedLive, autoFollowRound: true };
  }
  // 用户之前提前预览了后续回合（例如 R3 时点看 R4），当实局回合追上或超过预览回合时自动恢复跟随
  if (
    prevLiveRound !== null
    && clampedLive !== prevLiveRound
    && prev.currentRound > prevLiveRound
    && clampedLive >= prev.currentRound
  ) {
    return { currentRound: clampedLive, autoFollowRound: true };
  }
  return prev;
}

export interface PacketSyncDecision {
  matchKey: string;
  packetBans: string[];
  hasPacketBans: boolean;
  hasDownlink: boolean;
  liveRound: number | null;
  liveRoundConfirmed: boolean;
  shouldPauseAutoPoll: boolean;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export function readLightBattleSyncMeta(rawReport: unknown): LightBattleSyncMeta | null {
  const root = asObject(rawReport);
  const players = asObject(root?.players);
  const rounds = asObject(root?.rounds);
  if (!root || !players || !rounds) return null;

  const capture = asObject(root.capture);
  const config = asObject(root.battle_config);
  const match = typeof capture?.match === 'number' && Number.isFinite(capture.match) && capture.match >= 0
    ? capture.match
    : null;
  const rawRound = capture?.round;
  const current = typeof rawRound === 'number' && Number.isInteger(rawRound) && rawRound >= 1 && rawRound <= 15
    ? rawRound
    : null;
  const mode = typeof config?.mode_id === 'string' ? config.mode_id.slice(0, 200) : '';
  const bannedCovenants = mapBannedBondsToCovenants(config?.banned_bonds);

  let latestRound: number | null = null;
  let latestRoundSettled = false;
  for (let r = 15; r >= 1; r--) {
    const row = asObject(rounds[r]);
    if (row) {
      latestRound = r;
      const phase = typeof row.phase === 'string' ? row.phase : '';
      const hasSelfFinish = (typeof row.self_leaks === 'number' && Number.isSafeInteger(row.self_leaks) && row.self_leaks >= 0)
        || (typeof row.unassigned_self_leaks === 'number' && Number.isSafeInteger(row.unassigned_self_leaks) && row.unassigned_self_leaks >= 0);
      const hasHelpFinish = row.assists_status === 'reported';
      latestRoundSettled = phase !== 'end' && (phase === 'settle' || hasSelfFinish || hasHelpFinish);
      break;
    }
  }

  const hasSpawnPlan = Array.isArray(root.spawn_plan) && root.spawn_plan.some(item => {
    const row = asObject(item);
    return row !== null
      && typeof row.round === 'number' && Number.isInteger(row.round) && row.round >= 1 && row.round <= 15
      && typeof row.enemy_id === 'string' && row.enemy_id.length > 0;
  });
  const lineups = asObject(root.lineups);
  const hasLineups = lineups !== null && [1, 2, 3, 4].some(s => asObject(lineups[s]) !== null);
  const hasDeckPool = asObject(root.deck_pool) !== null;
  const telemetry = asObject(root.telemetry);
  const telemetryRounds = asObject(telemetry?.rounds);
  const hasTelemetry = telemetry !== null && (
    (Array.isArray(telemetry.operators) && telemetry.operators.some(op => Boolean(asObject(op)?.char_id)))
    || (Array.isArray(telemetry.stage_devices) && telemetry.stage_devices.some(d => Boolean(asObject(d)?.unit_id)))
    || asObject(telemetry.enemy_pool) !== null
    || (telemetryRounds !== null && Object.keys(telemetryRounds).length > 0)
  );

  if (
    latestRound === null
    && !hasSpawnPlan
    && !mode
    && bannedCovenants.length === 0
    && !hasTelemetry
    && !hasLineups
    && !hasDeckPool
  ) {
    return null;
  }

  const hasMatchActivity = current !== null
    || latestRound !== null
    || bannedCovenants.length > 0
    || hasLineups
    || hasTelemetry;

  return {
    match,
    current,
    latestRound,
    ...(latestRoundSettled ? { latestRoundSettled: true } : {}),
    mode,
    bannedCovenants,
    hasMatchActivity,
  };
}

export function resolvePacketSyncSnapshot(
  feed: ReportFeed,
  wasAutoPollPaused = false,
  previousMatchKey = '',
): PacketSyncDecision {
  let matchKey = '';
  let packetBans: string[] = [];
  let hasDownlink = false;
  let liveRound: number | null = null;
  let liveRoundConfirmed = false;
  let hasMatchActivity = false;

  if (feed.report) {
    const meta = readLightBattleSyncMeta(feed.report);
    if (meta) {
      matchKey = `${feed.reportRun}:${meta.match ?? 'live'}`;
      packetBans = meta.bannedCovenants;
      hasDownlink = meta.current !== null || Boolean(meta.mode) || packetBans.length > 0;
      hasMatchActivity = meta.hasMatchActivity;
      if (meta.current !== null && meta.current >= 1 && meta.current <= 15) {
        liveRound = meta.current;
        liveRoundConfirmed = true;
      } else if (meta.latestRound !== null && meta.latestRound >= 1 && meta.latestRound <= 15) {
        const modeMax = maxRoundForMode(meta.mode);
        liveRound = meta.latestRoundSettled && meta.latestRound < modeMax
          ? meta.latestRound + 1
          : meta.latestRound;
      }
    }
  }

  const hasPacketBans = Boolean(matchKey && packetBans.length > 0);
  const sameMatchKeptPaused = Boolean(matchKey && wasAutoPollPaused && previousMatchKey === matchKey);
  const shouldPauseAutoPoll = Boolean(
    matchKey && (
      hasPacketBans
      || (liveRound !== null && liveRound >= 1)
      || (hasDownlink && hasMatchActivity)
      || sameMatchKeptPaused
    ),
  );

  return {
    matchKey,
    packetBans,
    hasPacketBans,
    hasDownlink,
    liveRound,
    liveRoundConfirmed,
    shouldPauseAutoPoll,
  };
}

export interface BattleBanSyncState {
  available: boolean;
  ocrAvailable: boolean;
  status: ReportStatus | 'web';
  matchKey: string;
  bannedCovenants: string[];
  syncSource: 'packet' | 'ocr' | null;
  hasDownlink: boolean;
  liveRound: number | null;
  liveRoundConfirmed: boolean;
  ocrStatus: CovenantOcrState['status'];
  ocrMessage: string;
  ocrProgress: number;
  ocrStageLabel: string;
  ocrSeenCount: number;
  ocrComplete: boolean;
  npcapInstalled?: boolean;
  npcapInstall?: NpcapInstallState;
}

export type GuideStage = 'picker' | 'detail';
export type BanSyncSource = 'packet' | 'ocr';

export interface BanSyncPayload {
  matchKey: string;
  bannedCovenants: string[];
  source: BanSyncSource;
  liveRound: number | null;
  manualResync?: boolean;
}

export interface CurrentGuideSyncState {
  matchSyncId: string;
  matchSyncSource: BanSyncSource | null;
  banState: BanPickState;
  currentRound: number;
  stage: GuideStage;
}

export interface BanSyncAction {
  isNewMatch: boolean;
  nextBanState: BanPickState;
  nextMatchSyncId: string;
  nextMatchSyncSource: BanSyncSource | null;
  nextStage: GuideStage;
  resetCompAndRound: boolean;
}

export function normalizeBanSignature(matchKey: string, bannedCovenants: readonly string[]): string {
  return `${matchKey}:${[...new Set(bannedCovenants)].sort().join(',')}`;
}

function sameCovenantSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

export function decideBanSyncAction(
  incoming: BanSyncPayload,
  current: CurrentGuideSyncState,
): BanSyncAction {
  const normalizedIncomingBans = [...new Set(incoming.bannedCovenants)];
  const sameBans = sameCovenantSet(current.banState.bannedCovenants, normalizedIncomingBans);
  const hasPreviousMatch = current.matchSyncId !== '';
  const matchKeyChanged = hasPreviousMatch && incoming.matchKey !== '' && incoming.matchKey !== current.matchSyncId;

  const isOcrToPacketHandoff =
    current.matchSyncSource === 'ocr'
    && incoming.source === 'packet'
    && (sameBans || current.currentRound <= 2);

  const isPacketToOcrOverride =
    current.matchSyncSource === 'packet'
    && incoming.source === 'ocr';

  let isNewMatch = false;
  if (!incoming.manualResync && matchKeyChanged && !isOcrToPacketHandoff && !isPacketToOcrOverride) {
    if (incoming.source === 'packet') {
      if (incoming.liveRound !== null && incoming.liveRound >= 2) {
        isNewMatch = false;
      } else if (incoming.liveRound === 1) {
        isNewMatch = current.currentRound >= 2 || !sameBans;
      } else {
        isNewMatch = !sameBans;
      }
    } else {
      isNewMatch = !sameBans && current.currentRound >= 2;
    }
  }

  if (isNewMatch) {
    return {
      isNewMatch: true,
      nextBanState: { bannedCovenants: normalizedIncomingBans, bannedOperators: [] },
      nextMatchSyncId: incoming.matchKey,
      nextMatchSyncSource: incoming.source,
      nextStage: 'picker',
      resetCompAndRound: true,
    };
  }

  return {
    isNewMatch: false,
    nextBanState: {
      bannedCovenants: normalizedIncomingBans,
      bannedOperators: current.banState.bannedOperators,
    },
    nextMatchSyncId: incoming.matchKey || current.matchSyncId,
    nextMatchSyncSource: incoming.matchKey ? incoming.source : current.matchSyncSource,
    nextStage: current.stage,
    resetCompAndRound: false,
  };
}

export function useBattleBanSync(
  onSync: (payload: BanSyncPayload) => void,
  options?: { externalFeed?: ReportFeed | null },
) {
  const api = window.electronAPI?.battleReports;
  const ocrApi = window.electronAPI?.covenantOcr;
  const hasExternalFeed = options !== undefined && 'externalFeed' in options;
  const externalFeed = options?.externalFeed;
  const [state, setState] = useState<BattleBanSyncState>({
    available: Boolean(api),
    ocrAvailable: Boolean(ocrApi),
    status: api ? 'starting' : 'web',
    matchKey: '',
    bannedCovenants: [],
    syncSource: null,
    hasDownlink: false,
    liveRound: null,
    liveRoundConfirmed: false,
    ocrStatus: 'idle',
    ocrMessage: '',
    ocrProgress: 0,
    ocrStageLabel: '',
    ocrSeenCount: 0,
    ocrComplete: false,
  });
  const onSyncRef = useRef(onSync);
  const appliedPacketRef = useRef('');
  const appliedOcrRef = useRef('');
  const packetActiveRef = useRef(false);
  const autoPollPausedRef = useRef(false);
  const lastPacketMatchKeyRef = useRef('');
  onSyncRef.current = onSync;

  const acceptPacket = useCallback((feed: ReportFeed) => {
    const decision = resolvePacketSyncSnapshot(feed, autoPollPausedRef.current, lastPacketMatchKeyRef.current);
    const {
      matchKey,
      packetBans,
      hasPacketBans,
      hasDownlink,
      liveRound,
      liveRoundConfirmed,
      shouldPauseAutoPoll,
    } = decision;
    lastPacketMatchKeyRef.current = matchKey;
    packetActiveRef.current = hasPacketBans;
    if (autoPollPausedRef.current !== shouldPauseAutoPoll) {
      autoPollPausedRef.current = shouldPauseAutoPoll;
      void ocrApi?.setAutoPoll(!shouldPauseAutoPoll);
    }

    setState(prev => ({
      ...prev,
      available: true,
      status: feed.status,
      matchKey: matchKey || (prev.syncSource === 'ocr' ? prev.matchKey : ''),
      bannedCovenants: hasPacketBans ? packetBans : (matchKey ? [] : prev.syncSource === 'ocr' ? prev.bannedCovenants : []),
      syncSource: hasPacketBans ? 'packet' : (matchKey ? null : prev.syncSource),
      hasDownlink,
      liveRound,
      liveRoundConfirmed,
      npcapInstalled: feed.npcapInstalled,
      npcapInstall: feed.npcapInstall,
    }));

    if (hasPacketBans) {
      const signature = normalizeBanSignature(matchKey, packetBans);
      if (signature !== appliedPacketRef.current) {
        appliedPacketRef.current = signature;
        onSyncRef.current({ matchKey, bannedCovenants: packetBans, source: 'packet', liveRound });
      }
    }
  }, [ocrApi]);

  useEffect(() => {
    if (!hasExternalFeed || !externalFeed) return;
    acceptPacket(externalFeed);
  }, [acceptPacket, externalFeed, hasExternalFeed]);

  useEffect(() => {
    let mounted = true;
    let changed = false;

    const acceptOcr = (ocr: CovenantOcrState) => {
      if (!mounted) return;
      const canApplyOcr = (ocr.status === 'ready' || ocr.status === 'incomplete')
        && ocr.seenCovenants.length > 0
        && (!packetActiveRef.current || ocr.source === 'manual' || ocr.source === 'clipboard');

      const seenCount = Array.isArray(ocr.seenCovenants) ? ocr.seenCovenants.length : 0;
      const derivedProgress = typeof ocr.progress === 'number' && Number.isFinite(ocr.progress)
        ? Math.max(0, Math.min(100, Math.round(ocr.progress)))
        : (ocr.complete ? 100 : (seenCount > 0 ? Math.min(96, Math.round((seenCount / 26) * 100)) : 0));

      setState(prev => ({
        ...prev,
        ocrAvailable: true,
        ocrStatus: ocr.status,
        ocrMessage: ocr.message,
        ocrProgress: derivedProgress,
        ocrStageLabel: ocr.stageLabel || (ocr.complete ? '已读全' : (seenCount > 0 ? `已识别 ${seenCount}/26` : '')),
        ocrSeenCount: seenCount,
        ocrComplete: ocr.complete,
        ...(canApplyOcr ? {
          matchKey: ocr.id || `ocr:${ocr.bannedCovenants.join(',')}`,
          bannedCovenants: ocr.bannedCovenants,
          syncSource: 'ocr',
        } : {}),
      }));

      if (canApplyOcr && ocr.id && ocr.id !== appliedOcrRef.current) {
        appliedOcrRef.current = ocr.id;
        onSyncRef.current({
          matchKey: ocr.id,
          bannedCovenants: ocr.bannedCovenants,
          source: 'ocr',
          liveRound: null,
        });
      }
    };

    const unsubs: (() => void)[] = [];
    if (api && !hasExternalFeed) {
      unsubs.push(api.onState(feed => {
        changed = true;
        if (mounted) acceptPacket(feed);
      }));
      void api.getState().then(feed => { if (mounted && !changed) acceptPacket(feed); }).catch(() => {
        if (mounted && !changed) setState(prev => ({ ...prev, status: 'failed' }));
      });
    }
    if (ocrApi) {
      unsubs.push(ocrApi.onState(acceptOcr));
      void ocrApi.getState().then(ocr => { if (mounted && ocr.status !== 'idle') acceptOcr(ocr); }).catch(() => {});
      void ocrApi.setAutoPoll(true).catch(() => {});
    }
    return () => {
      mounted = false;
      for (const fn of unsubs) fn();
    };
  }, [acceptPacket, api, hasExternalFeed, ocrApi]);

  const resync = useCallback(() => {
    if (state.matchKey && (state.bannedCovenants.length > 0 || state.syncSource === 'ocr')) {
      onSyncRef.current({
        matchKey: state.matchKey,
        bannedCovenants: state.bannedCovenants,
        source: state.syncSource ?? 'packet',
        liveRound: state.liveRound,
        manualResync: true,
      });
    }
  }, [state.bannedCovenants, state.liveRound, state.matchKey, state.syncSource]);

  const reset = useCallback(() => {
    appliedPacketRef.current = '';
    appliedOcrRef.current = '';
    packetActiveRef.current = false;
    autoPollPausedRef.current = false;
    lastPacketMatchKeyRef.current = '';
    void ocrApi?.reset().catch(() => {});
    void ocrApi?.setAutoPoll(true).catch(() => {});
    setState(prev => ({
      ...prev,
      matchKey: '',
      bannedCovenants: [],
      syncSource: null,
      ocrStatus: 'idle',
      ocrMessage: '',
      ocrProgress: 0,
      ocrStageLabel: '',
      ocrSeenCount: 0,
      ocrComplete: false,
    }));
  }, [ocrApi]);

  const scanWindow = useCallback(async () => {
    await ocrApi?.scanWindow();
  }, [ocrApi]);

  const scanClipboard = useCallback(async () => {
    await ocrApi?.scanClipboard();
  }, [ocrApi]);

  return { sync: state, resync, reset, scanWindow, scanClipboard };
}
