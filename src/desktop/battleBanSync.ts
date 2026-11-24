import { useEffect, useRef, useState } from 'react';
import { readBattleReport } from './battleReportData';
import type { NpcapInstallState, ReportFeed, ReportStatus } from './battleReports';

export interface BattleBanSyncState {
  available: boolean;
  status: ReportStatus | 'web';
  matchKey: string;
  bannedCovenants: string[];
  hasDownlink: boolean;
  npcapInstalled?: boolean;
  npcapInstall?: NpcapInstallState;
}

export function useBattleBanSync(onSync: (payload: { matchKey: string; bannedCovenants: string[] }) => void) {
  const api = window.electronAPI?.battleReports;
  const [state, setState] = useState<BattleBanSyncState>({
    available: Boolean(api),
    status: api ? 'starting' : 'web',
    matchKey: '',
    bannedCovenants: [],
    hasDownlink: false,
  });
  const onSyncRef = useRef(onSync);
  const appliedRef = useRef('');
  onSyncRef.current = onSync;

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    let changed = false;
    const accept = (feed: ReportFeed) => {
      if (!mounted) return;
      let matchKey = '';
      let bannedCovenants: string[] = [];
      let hasDownlink = false;
      if (feed.report) {
        try {
          const parsed = readBattleReport(feed.report);
          matchKey = `${feed.reportRun}:${parsed.match ?? 'live'}`;
          bannedCovenants = parsed.bannedCovenants;
          hasDownlink = parsed.current !== null || Boolean(parsed.mode) || bannedCovenants.length > 0;
        } catch {
          // Ignore unreadable snapshots; report page handles incompatible status.
        }
      }
      setState({
        available: true,
        status: feed.status,
        matchKey,
        bannedCovenants,
        hasDownlink,
        npcapInstalled: feed.npcapInstalled,
        npcapInstall: feed.npcapInstall,
      });
      if (matchKey && bannedCovenants.length > 0) {
        const signature = `${matchKey}:${bannedCovenants.join(',')}`;
        if (signature !== appliedRef.current) {
          appliedRef.current = signature;
          onSyncRef.current({ matchKey, bannedCovenants });
        }
      }
    };
    const remove = api.onState(feed => { changed = true; accept(feed); });
    void api.getState().then(feed => { if (mounted && !changed) accept(feed); }).catch(() => {
      if (mounted && !changed) setState(prev => ({ ...prev, status: 'failed' }));
    });
    return () => { mounted = false; remove(); };
  }, [api]);

  const resync = () => {
    if (state.matchKey && state.bannedCovenants.length > 0) {
      onSyncRef.current({ matchKey: state.matchKey, bannedCovenants: state.bannedCovenants });
    }
  };
  const reset = () => { appliedRef.current = ''; };

  return { sync: state, resync, reset };
}
