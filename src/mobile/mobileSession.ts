import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES, BAN_SENSITIVE_OPERATORS, META_COMPS } from '../data/strongholdData';
import type { BanPickState } from '../utils/tacticalLogic';
import { parseCovenantScan, type CovenantScan } from './covenantScan';

export type MobileStep = 'ban' | 'plans' | 'guide' | 'library';
export interface MobileSession {
  step: MobileStep;
  bans: BanPickState;
  compId: string | null;
  rounds: Record<string, number>;
  scanId?: string;
  scanComplete?: boolean;
  confirmedCovenants?: string[];
}
export const MOBILE_SESSION_KEY = 'prts_mobile_match_v1';
export const emptySession = (): MobileSession => ({ step: 'ban', bans: { bannedCovenants: [], bannedOperators: [] }, compId: null, rounds: {} });
const compIds = new Set(META_COMPS.map(comp => comp.id));
const covenantNames = new Set<string>([...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES]);
const operatorNames = new Set<string>(BAN_SENSITIVE_OPERATORS.map(op => op.name));

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
    const compId = compIds.has(value.compId) ? value.compId : null;
    const step = ['ban', 'plans', 'guide', 'library'].includes(value.step) ? value.step : 'ban';
    return { step: step === 'guide' && !compId ? 'plans' : step, compId, rounds,
      ...(typeof value.scanId === 'string' ? { scanId: value.scanId, scanComplete: value.scanComplete === true,
        confirmedCovenants: value.scanComplete === true ? [...covenantNames] : filterNames(value.confirmedCovenants, covenantNames) } : {}), bans: {
      bannedCovenants: filterNames(value.bans?.bannedCovenants, covenantNames),
      bannedOperators: filterNames(value.bans?.bannedOperators, operatorNames),
    } };
  } catch { return fallback; }
}

export type MobileAction =
  | { type: 'applyScan'; scan: CovenantScan }
  | { type: 'applyLanSync'; bannedCovenants: string[]; round: number; selectedCompId?: string }
  | { type: 'ban'; group: keyof BanPickState; name: string }
  | { type: 'step'; step: MobileStep }
  | { type: 'choose'; id: string }
  | { type: 'round'; round: number }
  | { type: 'clearBans' }
  | { type: 'newMatch' };

export function mobileReducer(state: MobileSession, action: MobileAction): MobileSession {
  switch (action.type) {
    case 'applyScan': {
      const scan = parseCovenantScan(JSON.stringify(action.scan));
      if (!scan?.id || scan.id === state.scanId || !['ready', 'incomplete'].includes(scan.status) || !scan.seenCovenants.length) return state;
      const next = scan.status === 'ready' ? emptySession() : state;
      return { ...next, step: 'ban', scanId: scan.id, scanComplete: scan.complete, confirmedCovenants: [...covenantNames].filter(name => scan.seenCovenants.includes(name)),
        bans: { ...next.bans, bannedCovenants: scan.bannedCovenants } };
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
    case 'ban': {
      const list = state.bans[action.group];
      const known = action.group === 'bannedCovenants' ? covenantNames : operatorNames;
      if (!known.has(action.name)) return state;
      const confirmed = action.group === 'bannedCovenants' && state.scanId
        ? [...new Set([...(state.confirmedCovenants || []), action.name])] : state.confirmedCovenants;
      return { ...state, ...(confirmed ? { confirmedCovenants: confirmed, scanComplete: confirmed.length === covenantNames.size } : {}),
        bans: { ...state.bans, [action.group]: list.includes(action.name) ? list.filter(name => name !== action.name) : [...list, action.name] } };
    }
    case 'step': return { ...state, step: action.step === 'guide' && !state.compId ? 'plans' : action.step };
    case 'choose': return compIds.has(action.id) ? { ...state, step: 'guide', compId: action.id } : state;
    case 'round': return state.compId && Number.isFinite(action.round) ? { ...state, rounds: { ...state.rounds, [state.compId]: Math.max(1, Math.min(15, Math.trunc(action.round))) } } : state;
    case 'clearBans': return { ...state, scanId: undefined, scanComplete: undefined, confirmedCovenants: undefined, bans: emptySession().bans };
    case 'newMatch': return emptySession();
  }
}
