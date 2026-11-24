// 青逝痕 Tenkinoko 制作
import React, { useState } from 'react';
import { resolveOperatorAvatars } from '../data/prtsAvatars';

export interface OperatorAvatarProps {
  name: string;
  tier?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  badgeText?: string;
  highlightColor?: 'amber' | 'emerald' | 'sky' | 'rose' | 'purple';
  showName?: boolean;
  showTier?: boolean;
  className?: string;
}

const TIER_BADGE_STYLES: Record<string, string> = {
  I: 'bg-slate-700 text-slate-100 border-slate-500',
  II: 'bg-emerald-600 text-white border-emerald-400',
  III: 'bg-sky-600 text-white border-sky-400',
  IV: 'bg-purple-600 text-white border-purple-400',
  V: 'bg-amber-500 text-slate-950 border-amber-300',
  VI: 'bg-gradient-to-r from-amber-500 to-red-500 text-white border-amber-200',
};

const TIER_FRAME_STYLES: Record<string, string> = {
  I: 'border-slate-600',
  II: 'border-emerald-500/80',
  III: 'border-sky-500/80',
  IV: 'border-purple-500/85',
  V: 'border-amber-400',
  VI: 'border-amber-400 ring-1 ring-red-500/60',
};

const SIZE_MAP = {
  sm: { box: 'w-12 h-12', text: 'text-sm', tier: 'text-[11px] px-1.5 py-0' },
  md: { box: 'w-15 h-15', text: 'text-base', tier: 'text-xs px-1.5 py-0.5' },
  lg: { box: 'w-18 h-18', text: 'text-base', tier: 'text-xs px-2 py-0.5' },
  xl: { box: 'w-22 h-22', text: 'text-lg', tier: 'text-sm px-2 py-0.5' },
};

export const OperatorAvatar: React.FC<OperatorAvatarProps> = ({
  name,
  tier,
  size = 'md',
  showName = true,
  showTier = true,
  className = '',
}) => {
  const resolvedList = resolveOperatorAvatars(name);
  const primary = resolvedList[0] || {
    name,
    cleanName: name,
    avatarUrl: null,
  };
  const secondary = resolvedList[1] || null;

  const [primaryErr, setPrimaryErr] = useState(false);
  const [secondaryErr, setSecondaryErr] = useState(false);

  const sizeCfg = SIZE_MAP[size];
  const effectiveTier = primary.canonicalTier || tier;
  const secondaryTier = secondary?.canonicalTier || effectiveTier;
  const frameStyle =
    (effectiveTier && TIER_FRAME_STYLES[effectiveTier]) || 'border-slate-700';
  const secondaryFrameStyle =
    (secondaryTier && TIER_FRAME_STYLES[secondaryTier]) || frameStyle;
  const tierBadgeStyle =
    (effectiveTier && TIER_BADGE_STYLES[effectiveTier]) ||
    'bg-slate-800 text-amber-400 border-slate-600';

  return (
    <div className={`inline-flex flex-col items-center group ${className}`}>
      <div className="relative flex items-center">
        {/* Primary Avatar */}
        <div
          className={`relative ${sizeCfg.box} rounded-xl overflow-hidden bg-slate-900 border-2 ${frameStyle} shadow-md shrink-0 flex items-center justify-center`}
        >
          {primary.avatarUrl && !primaryErr ? (
            <img
              src={primary.avatarUrl}
              alt={primary.cleanName}
              referrerPolicy="no-referrer"
              onError={() => setPrimaryErr(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center p-1 text-center">
              <span className="text-sm font-black text-amber-300 leading-tight">
                {primary.cleanName.slice(0, 3)}
              </span>
            </div>
          )}

          {/* Bottom Gradient Scrim inside Avatar */}
          <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        </div>

        {/* Optional Dual/Combo Operator Second Avatar */}
        {secondary && (
          <div
            className={`relative ${sizeCfg.box} -ml-3 rounded-xl overflow-hidden bg-slate-900 border-2 ${secondaryFrameStyle} shadow-md shrink-0 flex items-center justify-center`}
          >
            {secondary.avatarUrl && !secondaryErr ? (
              <img
                src={secondary.avatarUrl}
                alt={secondary.cleanName}
                referrerPolicy="no-referrer"
                onError={() => setSecondaryErr(true)}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center p-1 text-center">
                <span className="text-sm font-black text-amber-300 leading-tight">
                  {secondary.cleanName.slice(0, 2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Roman Numeral Tier Badge (Top-Left, matches Arknights Stronghold UI) */}
        {showTier && effectiveTier && (
          <span
            className={`absolute -top-1.5 -left-1.5 z-10 font-mono-tabular font-black rounded border shadow ${sizeCfg.tier} ${tierBadgeStyle}`}
          >
            {effectiveTier}
          </span>
        )}
      </div>

      {showName && (
        <span
          className={`mt-2 font-black text-slate-100 text-center leading-tight max-w-[116px] truncate ${sizeCfg.text}`}
          title={name}
        >
          {secondary
            ? `${primary.cleanName}/${secondary.cleanName}`
            : primary.cleanName}
        </span>
      )}
    </div>
  );
};
