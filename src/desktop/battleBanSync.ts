// 青逝痕 Tenkinoko 制作
import { useCallback, useEffect, useRef, useState } from 'react';
import { readBattleReport } from './battleReportData';
import type { CovenantOcrState, NpcapInstallState, ReportFeed, ReportStatus } from './battleReports';

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
  ocrComplete: boolean;
  npcapInstalled?: boolean;
  npcapInstall?: NpcapInstallState;
}

export function useBattleBanSync(
  onSync: (payload: { matchKey: string; bannedCovenants: string[]; source: 'packet' | 'ocr' }) => void,
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
    ocrComplete: false,
  });
  const onSyncRef = useRef(onSync);
  const appliedPacketRef = useRef('');
  const appliedOcrRef = useRef('');
  const packetActiveRef = useRef(false);
  onSyncRef.current = onSync;

  const acceptPacket = useCallback((feed: ReportFeed) => {
    let matchKey = '';
    let packetBans: string[] = [];
    let hasDownlink = false;
    let liveRound: number | null = null;
    let liveRoundConfirmed = false;
    if (feed.report) {
      try {
        const parsed = readBattleReport(feed.report);
        matchKey = `${feed.reportRun}:${parsed.match ?? 'live'}`;
        packetBans = parsed.bannedCovenants;
        hasDownlink = parsed.current !== null || Boolean(parsed.mode) || packetBans.length > 0;
        if (parsed.current !== null && parsed.current >= 1 && parsed.current <= 15) {
          liveRound = parsed.current;
          liveRoundConfirmed = true;
        } else {
          const latest = parsed.rounds.at(-1)?.number ?? null;
          if (latest !== null && latest >= 1 && latest <= 15) liveRound = latest;
        }
      } catch {
        // Ignore unreadable snapshots; report page handles incompatible status.
      }
    }

    const hasPacketBans = Boolean(matchKey && packetBans.length > 0);
    if (packetActiveRef.current !== hasPacketBans) {
      packetActiveRef.current = hasPacketBans;
      void ocrApi?.setAutoPoll(!hasPacketBans);
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
      const signature = `${matchKey}:${packetBans.join(',')}`;
      if (signature !== appliedPacketRef.current) {
        appliedPacketRef.current = signature;
        onSyncRef.current({ matchKey, bannedCovenants: packetBans, source: 'packet' });
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

      setState(prev => ({
        ...prev,
        ocrAvailable: true,
        ocrStatus: ocr.status,
        ocrMessage: ocr.message,
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
      });
    }
  }, [state.bannedCovenants, state.matchKey, state.syncSource]);

  const reset = useCallback(() => {
    appliedPacketRef.current = '';
    appliedOcrRef.current = '';
    packetActiveRef.current = false;
    void ocrApi?.reset().catch(() => {});
    void ocrApi?.setAutoPoll(true).catch(() => {});
    setState(prev => ({
      ...prev,
      matchKey: '',
      bannedCovenants: [],
      syncSource: null,
      ocrStatus: 'idle',
      ocrMessage: '',
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
