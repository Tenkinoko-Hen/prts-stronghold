import { resolveOperatorAvatars } from '../data/prtsAvatars';
import portraits from './enemyPortraits.json';
import atlasUrl from './enemyPortraits.webp';
import type { ReportSummary } from './battleReportExport';

export interface ExportPortraitStrip {
  dataUrl: string;
  ids: string[];
  opDataUrl?: string;
  opNames?: string[];
}

const slotMap = new Map(portraits.ids.map((id, index) => [id, index]));
const atlasRows = Math.ceil(portraits.ids.length / portraits.columns);
const TILE = 44;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载头像资源: ${src}`));
    img.src = src;
  });
}

async function buildEnemyStrip(report: ReportSummary): Promise<{ dataUrl: string; ids: string[] }> {
  const used: string[] = [];
  const seen = new Set<string>();
  for (const round of report.rounds) {
    for (const group of round.enemies) {
      for (const enemy of group.kinds) {
        if (enemy.id && !seen.has(enemy.id) && slotMap.has(enemy.id)) {
          seen.add(enemy.id);
          used.push(enemy.id);
        }
      }
    }
  }
  if (!used.length) return { dataUrl: '', ids: [] };
  const atlas = await loadImage(atlasUrl);
  const cellW = atlas.naturalWidth / portraits.columns;
  const cellH = atlas.naturalHeight / atlasRows;
  const canvas = document.createElement('canvas');
  canvas.width = used.length * TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: '', ids: [] };
  used.forEach((id, i) => {
    const slot = slotMap.get(id)!;
    const sx = (slot % portraits.columns) * cellW;
    const sy = Math.floor(slot / portraits.columns) * cellH;
    ctx.drawImage(atlas, sx, sy, cellW, cellH, i * TILE, 0, TILE, TILE);
  });
  return { dataUrl: canvas.toDataURL('image/png'), ids: used };
}

async function buildOperatorStrip(report: ReportSummary): Promise<{ opDataUrl: string; opNames: string[] }> {
  const nameToUrl = new Map<string, string>();
  const register = (rawName: string) => {
    if (!rawName || nameToUrl.has(rawName)) return;
    const url = resolveOperatorAvatars(rawName)[0]?.avatarUrl;
    if (url) nameToUrl.set(rawName, url);
  };
  for (const player of report.players) {
    for (const unit of player.deployed ?? []) register(unit.name);
  }
  for (const boss of report.bosses) {
    for (const op of boss.operators ?? []) register(op.name);
  }
  for (const op of report.telemetryOperators ?? []) register(op.name);

  const entries = [...nameToUrl.entries()];
  if (!entries.length) return { opDataUrl: '', opNames: [] };

  const settled = await Promise.allSettled(
    entries.map(async ([name, url]) => ({ name, img: await loadImage(url) })),
  );
  const loaded = settled.flatMap(res => (res.status === 'fulfilled' ? [res.value] : []));
  if (!loaded.length) return { opDataUrl: '', opNames: [] };

  const canvas = document.createElement('canvas');
  canvas.width = loaded.length * TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { opDataUrl: '', opNames: [] };
  loaded.forEach(({ img }, i) => {
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, i * TILE, 0, TILE, TILE);
  });
  return { opDataUrl: canvas.toDataURL('image/png'), opNames: loaded.map(item => item.name) };
}

export async function buildReportPortraitStrip(report: ReportSummary): Promise<ExportPortraitStrip | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return undefined;
  const [enemyRes, opRes] = await Promise.allSettled([
    buildEnemyStrip(report),
    buildOperatorStrip(report),
  ]);
  const enemy = enemyRes.status === 'fulfilled' ? enemyRes.value : { dataUrl: '', ids: [] };
  const op = opRes.status === 'fulfilled' ? opRes.value : { opDataUrl: '', opNames: [] };
  if (!enemy.ids.length && !op.opNames.length) return undefined;
  return {
    dataUrl: enemy.dataUrl,
    ids: enemy.ids,
    ...(op.opNames.length ? { opDataUrl: op.opDataUrl, opNames: op.opNames } : {}),
  };
}
