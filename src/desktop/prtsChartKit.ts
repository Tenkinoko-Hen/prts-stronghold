/**
 * Restrained PRTS x Endfield ("// 简报") industrial BI chart palette & SVG geometry helpers.
 * Avoids neon gradients; favors matte steel blue, tactical ochre, alert crimson, clean axes,
 * nice ticks, and overshoot-free monotone cubic splines.
 */

export const PRTS_FONT_NUM = '"Bahnschrift", "DIN Alternate", "Source Han Sans CN", sans-serif';
export const PRTS_FONT_SANS = '"Source Han Sans CN", "Bahnschrift", sans-serif';

export const PRTS_CHART = {
  // Primary restrained Endfield "// 简报" palette
  blue: '#3698CC',
  blueFill: '#2B83B4',
  blueSoft: 'rgba(54, 152, 204, 0.24)',
  ochre: '#D8BF4B',
  ochreBright: '#EBD65C',
  ochreSoft: 'rgba(216, 191, 75, 0.26)',
  ochreMuted: '#7F7338',
  crimson: '#D64840',
  crimsonSoft: 'rgba(214, 72, 64, 0.20)',
  sage: '#3FA67A',
  slate: '#5F6E82',
  slateLight: '#8E9CAF',
  gridLine: '#232A35',
  gridSubtle: '#1A2029',
  axisLine: '#384352',
  plotBg: '#0E1218',
  labelMuted: '#8894A6',
  labelStrong: '#E6ECF4',
  // Harmonious restrained 6-step categorical palette (for donut & multi-operator splits)
  series: ['#D8BF4B', '#3698CC', '#2A678C', '#7C8FA6', '#4E5B6B', '#9A8C4F'] as const,
} as const;

export interface ChartPoint {
  x: number;
  y: number;
}

/**
 * Generates a human-friendly ascending axis scale [0, step, 2*step, ..., top].
 */
export function niceTicks(maxValue: number, segments = 4): { top: number; ticks: number[] } {
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
  const roughStep = safeMax / Math.max(1, segments);
  const mag = 10 ** Math.floor(Math.log10(roughStep));
  const norm = roughStep / mag;
  const allowHalf = mag >= 10;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : (allowHalf && norm <= 2.5) ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  const top = Math.max(step, Math.ceil(safeMax / step) * step);
  const count = Math.round(top / step);
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    ticks.push(Math.round(i * step * 1e6) / 1e6);
  }
  return { top, ticks };
}

/**
 * Compact axis label formatter (e.g. 0, 20k, 40k or 2万, 4万).
 */
export function formatAxisNumber(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `${Number((n / 10_000).toFixed(1))}万`;
  if (abs >= 1_000) return `${Number((n / 1_000).toFixed(1))}k`;
  return String(Math.round(n));
}

/**
 * Fritsch-Carlson monotone cubic spline SVG path (`M ... C ...`).
 * Guarantees smooth BI curves without vertical overshoot below baseline or above local extrema.
 */
export function buildSmoothSplinePath(points: readonly ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dxi = Math.max(0.001, points[i + 1].x - points[i].x);
    const dyi = points[i + 1].y - points[i].y;
    dx.push(dxi);
    dy.push(dyi);
    slopes.push(dyi / dxi);
  }

  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const m0 = slopes[i - 1];
    const m1 = slopes[i];
    if (m0 * m1 <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / m0 + w2 / m1);
    }
  }

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = dx[i];
    const cp1x = p0.x + h / 3;
    const cp1y = p0.y + (tangents[i] * h) / 3;
    const cp2x = p1.x - h / 3;
    const cp2y = p1.y - (tangents[i + 1] * h) / 3;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}
