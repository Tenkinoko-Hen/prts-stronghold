import { Package } from 'lucide-react';
import atlasMeta from './equipPortraits.json';

const nameToIndex = new Map<string, number>(
  (atlasMeta.names as string[]).map((n, idx) => [n, idx]),
);
const trapToIndex = atlasMeta.byTrapId as Record<string, number>;
const cols = atlasMeta.columns;
const rows = atlasMeta.rows;

export function resolveEquipIconIndex(trapId?: string, name?: string): number | undefined {
  if (trapId && Object.prototype.hasOwnProperty.call(trapToIndex, trapId)) {
    return trapToIndex[trapId];
  }
  if (name) {
    const clean = name.replace(/★$/, '').trim();
    const direct = nameToIndex.get(clean);
    if (direct !== undefined) return direct;
  }
  return undefined;
}

export function EquipIcon({
  trapId,
  name,
  size = 24,
  className = '',
}: {
  trapId?: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  const index = resolveEquipIconIndex(trapId, name);
  if (index === undefined) {
    return (
      <span
        className={`d-equip-icon ${size <= 22 ? 'is-sm' : ''} ${className}`.trim()}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Package size={Math.max(11, Math.round(size * 0.58))} />
      </span>
    );
  }
  const col = index % cols;
  const row = Math.floor(index / cols);
  const posX = cols > 1 ? (col * 100) / (cols - 1) : 0;
  const posY = rows > 1 ? (row * 100) / (rows - 1) : 0;
  return (
    <span
      className={`d-equip-sprite ${className}`.trim()}
      aria-hidden="true"
      title={name}
      style={{
        width: size,
        height: size,
        flexBasis: size,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}
