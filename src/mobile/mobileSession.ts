// 青逝痕 Tenkinoko 制作
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES, BAN_SENSITIVE_OPERATORS, META_COMPS } from '../data/strongholdData';
import type { BanPickState } from '../utils/tacticalLogic';
import { parseCovenantScan, type CovenantScan } from './covenantScan';

export type MobileStep = 'ban' | 'plans' | 'guide' | 'report' | 'library';
export type OperatorOwnership = 'owned' | 'elite';

export interface MobileSession {
  step: MobileStep;
  bans: BanPickState;
  compId: string | null;
  rounds: Record<string, number>;
  /** 每套阵容已抓干员打卡（owned=已到手，elite=已精锐）；开新局自动清空 */
  ownedOperators?: Record<string, Record<string, OperatorOwnership>>;
  scanId?: string;
  scanComplete?: boolean;
  confirmedCovenants?: string[];
  captureRound?: number;
}

export const MOBILE_SESSION_KEY = 'prts_mobile_match_v1';
export const MOBILE_FAVORITES_KEY = 'prts_mobile_favorites_v1';

export const emptySession = (): MobileSession => ({
  step: 'ban',
  bans: { bannedCovenants: [], bannedOperators: [] },
  compId: null,
  rounds: {},
  ownedOperators: {},
});

const compIds = new Set(META_COMPS.map(comp => comp.id));
const covenantNames = new Set<string>([...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES]);
const operatorNames = new Set<string>(BAN_SENSITIVE_OPERATORS.map(op => op.name));

export function restoreFavorites(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && compIds.has(id)))];
  } catch {
    return [];
  }
}

export function toggleFavoriteId(favorites: string[], compId: string): string[] {
  if (!compIds.has(compId)) return favorites;
  return favorites.includes(compId) ? favorites.filter(id => id !== compId) : [compId, ...favorites];
}

export function nextOwnershipState(current: OperatorOwnership | undefined): OperatorOwnership | undefined {
  if (!current) return 'owned';
  if (current === 'owned') return 'elite';
  return undefined;
}

export function restoreSession(raw: string | null): MobileSession {
  const fallback = emptySession();
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return fallback;
    const filterNames = (items: unknown, names: Set<string>): string[] => Array.isArray(items)
      ? [...new Set(items.filter((name): name is string => typeof name === 'string' && names.has(name)))] : [];
    const rounds: Record<string, number> = {};
    for (const [id, round] of Object.entries(value.rounds || {})) {
      if (compIds.has(id) && typeof round === 'number' && Number.isFinite(round)) rounds[id] = Math.max(1, Math.min(15, Math.trunc(round)));
    }
    const ownedOperators: Record<string, Record<string, OperatorOwnership>> = {};
    if (value.ownedOperators && typeof value.ownedOperators === 'object') {
      for (const [cid, entries] of Object.entries(value.ownedOperators as Record<string, unknown>)) {
        if (!compIds.has(cid) || !entries || typeof entries !== 'object') continue;
        const clean: Record<string, OperatorOwnership> = {};
        for (const [opName, st] of Object.entries(entries as Record<string, unknown>)) {
          if (typeof opName === 'string' && opName.trim() && (st === 'owned' || st === 'elite')) {
            clean[opName.trim()] = st;
          }
        }
        if (Object.keys(clean).length > 0) ownedOperators[cid] = clean;
      }
    }
    const compId = compIds.has(value.compId) ? value.compId : null;
    const step = ['ban', 'plans', 'guide', 'report', 'library'].includes(value.step) ? value.step : 'ban';
    return {
      step: step === 'guide' && !compId ? 'plans' : step,
      compId,
      rounds,
      ownedOperators,
      ...(typeof value.scanId === 'string'
        ? {
            scanId: value.scanId,
            scanComplete: value.scanComplete === true,
            confirmedCovenants: value.scanComplete === true ? [...covenantNames] : filterNames(value.confirmedCovenants, covenantNames),
          }
        : {}),
      bans: {
        bannedCovenants: filterNames(value.bans?.bannedCovenants, covenantNames),
        bannedOperators: filterNames(value.bans?.bannedOperators, operatorNames),
      },
    };
  } catch {
    return fallback;
  }
}

export type MobileAction =
  | { type: 'applyScan'; scan: CovenantScan }
  | { type: 'applyLanSync'; bannedCovenants: string[]; round: number; selectedCompId?: string }
  | { type: 'applyCaptureSync'; matchSerial: number; bansConfirmed: boolean; bannedCovenants: string[]; round: number }
  | { type: 'ban'; group: keyof BanPickState; name: string }
  | { type: 'step'; step: MobileStep }
  | { type: 'choose'; id: string }
  | { type: 'round'; round: number }
  | { type: 'toggleOwned'; compId: string; name: string }
  | { type: 'clearOwned'; compId: string }
  | { type: 'clearBans' }
  | { type: 'newMatch' };

export function mobileReducer(state: MobileSession, action: MobileAction): MobileSession {
  switch (action.type) {
    case 'applyScan': {
      const scan = parseCovenantScan(JSON.stringify(action.scan));
      if (!scan?.id || scan.id === state.scanId || !['ready', 'incomplete'].includes(scan.status) || !scan.seenCovenants.length) return state;
      const next = scan.status === 'ready' ? emptySession() : state;
      return {
        ...next,
        step: 'ban',
        scanId: scan.id,
        scanComplete: scan.complete,
        confirmedCovenants: [...covenantNames].filter(name => scan.seenCovenants.includes(name)),
        bans: { ...next.bans, bannedCovenants: scan.bannedCovenants },
      };
    }
    case 'applyLanSync': {
      const cleanBans = [...new Set(action.bannedCovenants.filter(name => covenantNames.has(name)))];
      const clampedRound = Math.max(1, Math.min(15, Math.trunc(action.round || 1)));
      const nextCompId = state.compId || (action.selectedCompId && compIds.has(action.selectedCompId) ? action.selectedCompId : null);
      const nextRounds = nextCompId ? { ...state.rounds, [nextCompId]: clampedRound } : state.rounds;
      return {
        ...state,
        compId: nextCompId,
        rounds: nextRounds,
        ...(cleanBans.length > 0
          ? {
              scanId: 'lan-sync',
              scanComplete: true,
              confirmedCovenants: [...covenantNames],
              bans: { ...state.bans, bannedCovenants: cleanBans },
            }
          : {}),
      };
    }
    case 'applyCaptureSync': {
      const scanId = `vpn-${Math.max(1, Math.trunc(action.matchSerial || 1))}`;
      const isNewVpnMatch = Boolean(state.scanId && state.scanId.startsWith('vpn-') && state.scanId !== scanId);
      const base = isNewVpnMatch ? emptySession() : state;
      const cleanBans = [...new Set(action.bannedCovenants.filter(name => covenantNames.has(name)))];
      const clampedRound = action.round >= 1 ? Math.max(1, Math.min(15, Math.trunc(action.round))) : 0;
      const nextCaptureRound = clampedRound > 0 ? clampedRound : base.captureRound;
      const nextRounds = base.compId && clampedRound > 0
        ? { ...base.rounds, [base.compId]: clampedRound }
        : base.rounds;
      return {
        ...base,
        rounds: nextRounds,
        ...(nextCaptureRound ? { captureRound: nextCaptureRound } : {}),
        ...(action.bansConfirmed
          ? {
              scanId,
              scanComplete: true,
              confirmedCovenants: [...covenantNames],
              bans: { ...base.bans, bannedCovenants: cleanBans },
            }
          : {}),
      };
    }
    case 'ban': {
      const list = state.bans[action.group];
      const known = action.group === 'bannedCovenants' ? covenantNames : operatorNames;
      if (!known.has(action.name)) return state;
      const confirmed = action.group === 'bannedCovenants' && state.scanId
        ? [...new Set([...(state.confirmedCovenants || []), action.name])] : state.confirmedCovenants;
      return {
        ...state,
        ...(confirmed ? { confirmedCovenants: confirmed, scanComplete: confirmed.length === covenantNames.size } : {}),
        bans: { ...state.bans, [action.group]: list.includes(action.name) ? list.filter(name => name !== action.name) : [...list, action.name] },
      };
    }
    case 'step': return { ...state, step: action.step === 'guide' && !state.compId ? 'plans' : action.step };
    case 'choose': {
      if (!compIds.has(action.id)) return state;
      const liveRound = state.captureRound && state.captureRound >= 1 ? state.captureRound : 0;
      const existingRound = state.rounds[action.id] || 0;
      const nextRounds = liveRound > 0 && existingRound < liveRound
        ? { ...state.rounds, [action.id]: liveRound }
        : state.rounds;
      return { ...state, step: 'guide', compId: action.id, rounds: nextRounds };
    }
    case 'round': return state.compId && Number.isFinite(action.round) ? { ...state, rounds: { ...state.rounds, [state.compId]: Math.max(1, Math.min(15, Math.trunc(action.round))) } } : state;
    case 'toggleOwned': {
      if (!compIds.has(action.compId) || !action.name.trim()) return state;
      const key = action.name.trim();
      const prevAll = state.ownedOperators || {};
      const prevComp = { ...(prevAll[action.compId] || {}) };
      const next = nextOwnershipState(prevComp[key]);
      if (next) prevComp[key] = next;
      else delete prevComp[key];
      return { ...state, ownedOperators: { ...prevAll, [action.compId]: prevComp } };
    }
    case 'clearOwned': {
      const prevAll = { ...(state.ownedOperators || {}) };
      delete prevAll[action.compId];
      return { ...state, ownedOperators: prevAll };
    }
    case 'clearBans': return { ...state, scanId: undefined, scanComplete: undefined, confirmedCovenants: undefined, bans: emptySession().bans };
    case 'newMatch': return emptySession();
  }
}
