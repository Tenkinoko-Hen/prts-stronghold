// 青逝痕 Tenkinoko 制作
import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES } from '../data/strongholdData';

export const COVENANT_NAMES = [...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES];
export interface CovenantScan {
  id: string;
  status: 'idle' | 'permission' | 'scanning' | 'ready' | 'incomplete' | 'cancelled' | 'error';
  message: string;
  complete: boolean;
  bannedCovenants: string[];
  seenCovenants: string[];
  missingCovenants: string[];
}
declare global {
  interface Window { PRTSScan?: { start(): void; stop(): void; reset(): void; getState(): string } }
}

export function parseCovenantScan(raw: string): CovenantScan | null {
  try {
    const value = JSON.parse(raw);
    const known = new Set<string>(COVENANT_NAMES);
    if (!value || typeof value.id !== 'string' || typeof value.message !== 'string' ||
      !['idle', 'permission', 'scanning', 'ready', 'incomplete', 'cancelled', 'error'].includes(value.status)) return null;
    for (const key of ['bannedCovenants', 'seenCovenants']) {
      if (!Array.isArray(value[key]) || value[key].some((name: unknown) => typeof name !== 'string' || !known.has(name))) return null;
    }
    const seen = [...new Set<string>(value.seenCovenants)];
    const banned = [...new Set<string>(value.bannedCovenants)];
    if (banned.some(name => !seen.includes(name))) return null;
    const complete = seen.length === known.size;
    if (value.status === 'ready' && !complete) return null;
    return { id: value.id, status: value.status, message: value.message, complete, seenCovenants: seen,
      bannedCovenants: banned, missingCovenants: COVENANT_NAMES.filter(name => !seen.includes(name)) };
  } catch { return null; }
}
