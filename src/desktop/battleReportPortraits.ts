import portraits from './enemyPortraits.json';
import atlasUrl from './enemyPortraits.webp';
import type { ReportSummary } from './battleReportExport';

export interface ExportPortraitStrip {
  dataUrl: string;
  ids: string[];
}

const slotMap = new Map(portraits.ids.map((id, index) => [id, index]));
const atlasRows = Math.ceil(portraits.ids.length / portraits.columns);
const TILE = 44;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法加载敌人头像图集'));
    img.src = src;
  });
}

export async function buildReportPortraitStrip(report: ReportSummary): Promise<ExportPortraitStrip | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return undefined;
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
  if (!used.length) return undefined;
  const atlas = await loadImage(atlasUrl);
  const cellW = atlas.naturalWidth / portraits.columns;
  const cellH = atlas.naturalHeight / atlasRows;
  const canvas = document.createElement('canvas');
  canvas.width = used.length * TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  used.forEach((id, i) => {
    const slot = slotMap.get(id)!;
    const sx = (slot % portraits.columns) * cellW;
    const sy = Math.floor(slot / portraits.columns) * cellH;
    ctx.drawImage(atlas, sx, sy, cellW, cellH, i * TILE, 0, TILE, TILE);
  });
  return { dataUrl: canvas.toDataURL('image/png'), ids: used };
}
