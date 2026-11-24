// 青逝痕 Tenkinoko 制作
import React from 'react';

/**
 * 1:1 Vector SVG Re-creations of Arknights Stronghold Protocol (卫戍协议·规程):
 * 1. All 10 Core Covenants (核心盟约) & 16 Sub-Covenants (附加盟约) Emblems
 *    matching the in-game Ban/Pick screen & Transfer Item synthesis chart.
 * 2. All 18 Transfer / Job-Change Equipment Icons (变形同构体 + 18件合成底材装备)
 *    matching the 3 "新卫戍协议转职一览" infographics 1:1.
 */

export interface CovenantEmblemProps {
  name: string;
  size?: number;
  className?: string;
}

/**
 * Renders the 1:1 vector emblem for any Core Covenant or Sub-Covenant.
 * Uses currentColor so it can be styled either as dark silhouette inside glowing cyan
 * or bright white/cyan inside dark cards.
 */
export const CovenantEmblemSvg: React.FC<CovenantEmblemProps> = ({
  name,
  size = 36,
  className = '',
}) => {
  const clean = name.replace(/盟约|\(.*?\)|（.*?）/g, '').trim();

  const renderPath = () => {
    switch (clean) {
      // ==================== 10 CORE COVENANTS (In-Game 1:1 Art) ====================
      case '炎':
        return (
          <g fill="currentColor">
            {/* Yan Fierce Dragon / Qilin Beast Mask & Flaming Horns */}
            <path d="M32 9 L35 15 L39 10 L38 18 L46 13 L43 23 L51 21 L44 29 L52 33 L44 38 L50 45 L40 43 L36 53 L32 46 L28 53 L24 43 L14 45 L20 38 L12 33 L20 29 L13 21 L21 23 L18 13 L26 18 L25 10 L29 15 Z" />
            <polygon points="27,24 23,30 29,32" fill="#071a18" />
            <polygon points="37,24 41,30 35,32" fill="#071a18" />
            <polygon points="25,38 32,44 39,38 32,41" fill="#071a18" />
            <rect x="31" y="26" width="2" height="7" fill="#071a18" />
          </g>
        );
      case '萨尔贡':
        return (
          <g fill="currentColor">
            {/* Sargon Crescent Falcon & Desert Nomad Scimitar Silhouette */}
            <circle cx="28" cy="14" r="3" />
            <circle cx="36" cy="17" r="2.2" />
            <path d="M14 22 C22 19 36 21 45 30 C50 36 50 46 47 52 C44 43 38 37 31 35 L20 52 L26 31 C20 28 16 25 14 22 Z" />
            <path d="M38 38 C42 41 45 46 45 51 C41 47 37 44 33 42 Z" />
          </g>
        );
      case '阿戈尔':
        return (
          <g fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
            {/* Aegir Abyssal Outer Triangle, Trident Spire & Crossbeams */}
            <polygon points="32,8 10,48 54,48" fill="none" strokeWidth="4" />
            <line x1="32" y1="6" x2="32" y2="54" strokeWidth="4" />
            <line x1="8" y1="38" x2="56" y2="38" strokeWidth="3.5" />
            <polygon points="20,28 32,22 44,28 32,33" fill="currentColor" stroke="none" />
          </g>
        );
      case '叙拉古':
        return (
          <g fill="currentColor">
            {/* Siracusa Wolf Pack Head & Twin Crest Horns */}
            <path d="M32 9 L37 19 L46 12 L43 24 L52 20 L45 31 L53 36 L42 43 L32 52 L22 43 L11 36 L19 31 L12 20 L21 24 L18 12 L27 19 Z" />
            <polygon points="24,28 29,32 25,36" fill="#071a18" />
            <polygon points="40,28 35,32 39,36" fill="#071a18" />
            <polygon points="29,42 32,46 35,42" fill="#071a18" />
            <path d="M15 45 Q24 53 32 54 Q40 53 49 45" fill="none" stroke="currentColor" strokeWidth="3" />
          </g>
        );
      case '卡西米尔':
        return (
          <g fill="currentColor">
            {/* Kazimierz Pegasus Wings & Knight Jousting Lance Cross */}
            <polygon points="12,52 48,12 52,16 16,52" />
            <polygon points="40,9 55,9 55,24" />
            <polygon points="14,20 34,27 29,33 12,26" />
            <polygon points="11,29 30,35 26,41 9,35" />
            <polygon points="35,33 53,39 50,45 32,39" />
            <polygon points="31,42 49,48 46,54 28,48" />
          </g>
        );
      case '维多利亚':
        return (
          <g fill="currentColor">
            {/* Victoria Imperial Royal Cross / Eight-Pointed Sunburst Star */}
            <polygon points="32,8 38,24 26,24" />
            <polygon points="32,56 38,40 26,40" />
            <polygon points="8,32 24,38 24,26" />
            <polygon points="56,32 40,38 40,26" />
            <polygon points="14,14 28,23 23,28" />
            <polygon points="50,14 36,23 41,28" />
            <polygon points="14,50 28,41 23,36" />
            <polygon points="50,50 36,41 41,36" />
            <rect x="27.5" y="27.5" width="9" height="9" transform="rotate(45 32 32)" />
          </g>
        );
      case '谢拉格':
        return (
          <g fill="currentColor">
            {/* Kjerag Sacred Mountain Snow Eagle Wings in Sun Ring */}
            <path
              d="M32 9 A23 23 0 1 0 55 32 A23 23 0 0 0 32 9 Z M32 14 A18 18 0 1 1 14 32 A18 18 0 0 1 32 14 Z"
            />
            <path d="M19 37 C23 23 35 17 48 19 C39 24 33 29 30 36 Z" />
            <path d="M22 42 C27 30 38 25 49 27 C41 31 35 36 32 42 Z" />
            <path d="M26 47 C31 38 41 34 48 36 C42 39 37 43 34 48 Z" />
          </g>
        );
      case '乌萨斯':
        return (
          <g fill="currentColor">
            {/* Ursus Imperial Double-Headed Winged Eagle Shield */}
            <path d="M32 15 L26 11 L22 15 L26 21 L10 16 L14 28 L19 31 L14 36 L22 39 L25 49 L32 54 L39 49 L42 39 L50 36 L45 31 L50 28 L54 16 L38 21 L42 15 L38 11 Z" />
            <polygon points="28,26 36,26 32,42" fill="#071a18" />
          </g>
        );
      case '伊比利亚':
        return (
          <g fill="currentColor">
            {/* Iberia Golden Lighthouse Flare, Eye & Fortress Spire */}
            <polygon points="32,8 37,27 32,46 27,27" />
            <polygon points="9,20 29,28 55,20 35,33 51,46 32,35 13,46 29,33" />
            <rect x="22" y="47" width="3.5" height="5" />
            <rect x="27.5" y="46" width="3.5" height="6" />
            <rect x="33" y="46" width="3.5" height="6" />
            <rect x="38.5" y="47" width="3.5" height="5" />
          </g>
        );
      case '莱塔尼亚':
        return (
          <g fill="currentColor">
            {/* Leithanien Twin Spire Horns, Voice of the Past & Resonant Strings */}
            <circle cx="24" cy="22" r="5.5" fill="none" stroke="currentColor" strokeWidth="3.2" />
            <circle cx="40" cy="22" r="5.5" fill="none" stroke="currentColor" strokeWidth="3.2" />
            <path d="M28 26 L36 26 L35 46 L32 53 L29 46 Z" />
            <path d="M11 27 Q19 29 26 33 M9 35 Q18 35 26 38 M13 43 Q21 41 27 42" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M53 27 Q45 29 38 33 M55 35 Q46 35 38 38 M51 43 Q43 41 37 42" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </g>
        );

      // ==================== 16 SUB-COVENANTS (In-Game 1:1 Art) ====================
      case '精准':
        return (
          <g fill="currentColor">
            {/* Precision Crossbow Arrowhead, Long Bow & Triple Scope Wings */}
            <polygon points="32,8 39,20 25,20" />
            <rect x="29.5" y="16" width="5" height="38" />
            <polygon points="32,8 48,27 42,30 32,18 22,30 16,27" />
            <polygon points="11,37 28,29 28,36 15,44" />
            <polygon points="53,37 36,29 36,36 49,44" />
            <polygon points="20,49 32,40 44,49 39,53 32,47 25,53" />
          </g>
        );
      case '远见':
        return (
          <g fill="currentColor">
            {/* Foresight All-Seeing Eye with Center Crosshairs & Vertical Beacon Rays */}
            <path d="M10 32 Q32 14 54 32 Q32 50 10 32 Z" fill="none" stroke="currentColor" strokeWidth="4" />
            <circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="32" cy="32" r="3.5" />
            <polygon points="32,7 35,18 29,18" />
            <polygon points="32,57 35,46 29,46" />
            <line x1="22" y1="32" x2="16" y2="32" stroke="currentColor" strokeWidth="3" />
            <line x1="42" y1="32" x2="48" y2="32" stroke="currentColor" strokeWidth="3" />
          </g>
        );
      case '投资人':
        return (
          <g fill="currentColor">
            {/* Investor Four Interlocking Rhombus Diamonds (Triquetra Stack) */}
            <polygon points="32,10 43,22 32,34 21,22" />
            <polygon points="20,25 31,37 20,49 9,37" />
            <polygon points="44,25 55,37 44,49 33,37" />
            <polygon points="32,32 38,39 32,46 26,39" fill="#071a18" />
            <circle cx="32" cy="22" r="2.8" fill="#071a18" />
            <circle cx="20" cy="37" r="2.8" fill="#071a18" />
            <circle cx="44" cy="37" r="2.8" fill="#071a18" />
          </g>
        );
      case '突袭':
        return (
          <g fill="currentColor">
            {/* Assault Twin Divergent Spearhead Blades & Trench Line */}
            <polygon points="32,8 37,42 27,42" />
            <polygon points="12,47 25,20 28,43 19,47" />
            <polygon points="52,47 39,20 36,43 45,47" />
            <rect x="14" y="47" width="36" height="5" />
          </g>
        );
      case '不屈':
        return (
          <g fill="currentColor">
            {/* Unyielding Angular Z-Rune & Reinforced Armor Slash */}
            <polygon points="14,14 42,14 26,30 14,30" />
            <polygon points="50,50 22,50 38,34 50,34" />
            <polygon points="43,11 53,21 21,53 11,43" />
          </g>
        );
      case '调和':
        return (
          <g fill="currentColor">
            {/* Harmony Three Resonant Tuning Nodes */}
            <circle cx="20" cy="18" r="4.5" />
            <circle cx="20" cy="44" r="5.5" />
            <rect x="18" y="18" width="4" height="26" />
            <circle cx="32" cy="13" r="5" />
            <circle cx="32" cy="49" r="6.5" />
            <rect x="30" y="13" width="4" height="36" />
            <circle cx="44" cy="18" r="4.5" />
            <circle cx="44" cy="44" r="5.5" />
            <rect x="42" y="18" width="4" height="26" />
          </g>
        );
      case '协防干员':
        return (
          <g fill="currentColor">
            {/* Defense Support Tactical Exo-Shield & Visor Aperture */}
            <path d="M15 12 H49 L51 36 L32 53 L13 36 Z" />
            <rect x="20" y="19" width="24" height="7" fill="#071a18" />
            <rect x="25" y="30" width="14" height="12" fill="#071a18" />
          </g>
        );
      case '独行':
        return (
          <g fill="currentColor">
            {/* Soloist Isolated Crowned Bastion Tower */}
            <polygon points="23,13 28,19 32,11 36,19 41,13 41,23 23,23" />
            <rect x="22" y="25" width="20" height="17" />
            <polygon points="13,42 51,42 43,53 21,53" />
          </g>
        );
      case '绝技':
        return (
          <g fill="currentColor">
            {/* Ultimate Skill Diamond Surge & Dynamic Sparks */}
            <polygon points="32,8 47,23 32,38 17,23" />
            <polygon points="11,35 24,26 28,39 15,48" />
            <polygon points="53,35 40,26 36,39 49,48" />
            <polygon points="32,41 41,50 32,57 23,50" />
          </g>
        );
      case '聚合':
        return (
          <g fill="currentColor">
            {/* Convergence 6-Axis Concentric Converging Spikes */}
            <rect x="29.5" y="9" width="5" height="46" />
            <polygon points="13,18 29,28 25,33 9,23" />
            <polygon points="51,18 35,28 39,33 55,23" />
            <polygon points="11,36 28,31 28,37 13,42" />
            <polygon points="53,36 36,31 36,37 51,42" />
            <polygon points="32,23 41,32 32,41 23,32" />
            <circle cx="32" cy="32" r="3.5" fill="#071a18" />
          </g>
        );
      case '奥术':
        return (
          <g fill="currentColor">
            {/* Arcane Concentric Nested Mystic Diamond Runes */}
            <polygon
              points="32,7 55,32 32,57 9,32"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <polygon
              points="32,16 46,32 32,48 18,32"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <polygon points="32,24 39,32 32,40 25,32" />
          </g>
        );
      case '迅捷':
        return (
          <g fill="currentColor">
            {/* Swift Dual-Blade Wind Slash & Lightning Flash */}
            <polygon points="37,8 14,33 30,33 24,56 50,29 35,29" />
            <polygon points="11,21 24,11 20,21" />
            <polygon points="43,43 54,34 46,47" />
          </g>
        );
      case '灵巧':
        return (
          <g fill="currentColor">
            {/* Dexterous 8-Teeth Precision Chrono-Gear */}
            <path d="M29 9 H35 L36.5 15 L41.5 17 L46.5 13.5 L50.5 17.5 L47 22.5 L49 27.5 L55 29 V35 L49 36.5 L47 41.5 L50.5 46.5 L46.5 50.5 L41.5 47 L36.5 49 L35 55 H29 L27.5 49 L22.5 47 L17.5 50.5 L13.5 46.5 L17 41.5 L15 36.5 L9 35 V29 L15 27.5 L17 22.5 L13.5 17.5 L17.5 13.5 L22.5 17 L27.5 15 Z" />
            <circle cx="32" cy="32" r="9" fill="#071a18" />
            <rect x="29" y="29" width="6" height="6" transform="rotate(45 32 32)" fill="currentColor" />
          </g>
        );
      case '坚守':
        return (
          <g fill="currentColor">
            {/* Bastion Tower Greatshield & Twin Bastion Battlement Slits */}
            <path d="M16 13 L32 9 L48 13 L52 27 L44 49 L32 56 L20 49 L12 27 Z" />
            <rect x="23" y="21" width="5" height="21" fill="#071a18" />
            <rect x="36" y="21" width="5" height="21" fill="#071a18" />
            <rect x="23" y="17" width="18" height="5" fill="#071a18" />
          </g>
        );
      case '助力':
        return (
          <g fill="currentColor">
            {/* Assist Hexagonal Keystone & Support Truss */}
            <polygon
              points="32,9 52,20 52,44 32,55 12,44 12,20"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
            />
            <polygon points="32,18 44,38 20,38" />
            <circle cx="32" cy="32" r="4.2" fill="#071a18" />
          </g>
        );
      case '奇迹':
      default:
        return (
          <g fill="currentColor">
            {/* Miracle Sacred Octagram Star & Concentric Halo */}
            <circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" strokeWidth="3.5" />
            <polygon points="32,9 37,27 55,32 37,37 32,55 27,37 9,32 27,27" />
            <circle cx="32" cy="32" r="4.5" fill="#071a18" />
          </g>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      {renderPath()}
    </svg>
  );
};

/**
 * In-Game Style Circular Covenant Ban/Pick Badge (1:1 recreation of Image 3:
 * glowing teal ring + dark silhouette icon when active; dark grayed-out circle
 * with top-right "broken roster / banned" indicator when banned, plus label & description below).
 */
export interface CovenantBanBadgeProps {
  name: string;
  subtitle?: string;
  isBanned: boolean;
  onClick: () => void;
  testId?: string;
  size?: 'md' | 'sm';
}

export const CovenantBanBadge: React.FC<CovenantBanBadgeProps> = ({
  name,
  isBanned,
  onClick,
  testId,
  size = 'md',
}) => {
  const circleDim =
    size === 'md'
      ? 'w-16 h-16 sm:w-[74px] sm:h-[74px]'
      : 'w-15 h-15 sm:w-16 sm:h-16';
  const svgSize = size === 'md' ? 42 : 36;

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group relative flex flex-col items-center text-center focus:outline-none select-none py-2 px-1 rounded-xl hover:bg-slate-800/40 transition-all cursor-pointer"
    >
      {/* Circular Medallion Container */}
      <div className="relative flex items-center justify-center">
        {/* Outer Neon Glow Halo when Active */}
        {!isBanned && (
          <div
            className="absolute -inset-1.5 rounded-full opacity-75 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(32,247,197,0.48) 0%, rgba(16,185,129,0.18) 58%, rgba(0,0,0,0) 76%)',
            }}
          />
        )}

        {/* Main Medallion Circle */}
        <div
          className={`relative ${circleDim} rounded-full flex items-center justify-center transition-all duration-150 ${
            isBanned
              ? 'bg-[#252A30] border-[2.5px] border-[#525860] text-[#8E959E] shadow-inner opacity-80'
              : 'bg-gradient-to-b from-[#34F5C5] to-[#12B88D] border-[2.5px] border-[#A7F3D0] text-[#052923] shadow-[0_0_18px_rgba(36,240,190,0.45)] group-hover:scale-105'
          }`}
        >
          {/* Inner Subtle Ring */}
          <div
            className={`absolute inset-1 rounded-full pointer-events-none border ${
              isBanned ? 'border-white/10' : 'border-[#052923]/25'
            }`}
          />

          {/* 1:1 SVG Emblem */}
          <CovenantEmblemSvg name={name} size={svgSize} />

          {/* Diagonal Red/Dark Strike Overlay when Banned */}
          {isBanned && (
            <div className="absolute inset-0 rounded-full bg-black/25 flex items-center justify-center pointer-events-none">
              <div className="w-full h-[3px] bg-rose-500/85 rotate-[-35deg] shadow" />
            </div>
          )}
        </div>

        {/* Top-Right In-Game "Roster Incomplete / Banned" Indicator Icon (Image 2 1:1) */}
        {isBanned && (
          <span
            title="部分盟约所含干员阵容不完整 / 本局已禁用"
            className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-md bg-[#252A30] border border-slate-600/90 shadow-md flex items-center justify-center pointer-events-none"
          >
            {/* Arknights in-game twin operator silhouettes indicator */}
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="4" r="1.8" fill="#D1D5DB" />
              <path d="M2.5 13 C2.5 9.5 7.5 9.5 7.5 13 Z" fill="#D1D5DB" />
              <circle cx="11.5" cy="4" r="1.8" fill="#EF4444" />
              <path d="M9 13 C9 9.5 14 9.5 14 13 Z" fill="#EF4444" />
            </svg>
          </span>
        )}
      </div>

      {/* Large Clear Covenant Name Below */}
      <span
        className={`mt-2 text-base sm:text-lg font-black tracking-tight transition-colors whitespace-nowrap ${
          isBanned
            ? 'text-rose-400 line-through decoration-2'
            : 'text-slate-50 group-hover:text-teal-300'
        }`}
      >
        {name}
      </span>
    </button>
  );
};

/**
 * 1:1 Vector SVG Re-creation of "变形同构体" (Shapeshifter Isomorph Orb)
 * and all 18 Transfer Synthesis Equipment Items from the 3 uploaded infographics.
 */
export interface TransferEquipmentSvgProps {
  itemKey: string;
  tier?: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  size?: number;
}

const ITEM_TIER_BADGE_COLORS: Record<string, string> = {
  I: 'bg-[#2C343B] text-slate-100 border-slate-500',
  II: 'bg-[#2E3840] text-slate-100 border-slate-400',
  III: 'bg-[#0D6E5B] text-[#6EE7B7] border-[#34D399]',
  IV: 'bg-[#0E5A7A] text-[#7DD3FC] border-[#38BDF8]',
  V: 'bg-[#92400E] text-[#FDE68A] border-[#F59E0B]',
  VI: 'bg-[#9A3412] text-[#FDBA74] border-[#FB923C]',
};

export const TransferEquipmentSvg: React.FC<TransferEquipmentSvgProps> = ({
  itemKey,
  tier,
  size = 76,
}) => {
  const renderEquipmentGraphic = () => {
    switch (itemKey) {
      case '变形同构体':
        return (
          <g>
            {/* Dark metallic recess */}
            <rect x="8" y="8" width="64" height="64" rx="6" fill="#0B1317" />
            {/* Glowing cyan vertical energy pillars rising from white/silver orb */}
            <circle cx="40" cy="49" r="16" fill="#D5E3E6" />
            <path d="M24 49 A16 16 0 0 0 56 49 Q48 56 40 52 Q32 48 24 49 Z" fill="#6B8E94" />
            {/* Cyan crystal pillars */}
            <rect x="27" y="23" width="3.5" height="24" rx="1" fill="#4FF7E8" />
            <rect x="32" y="16" width="4" height="29" rx="1" fill="#2CE5D3" />
            <rect x="38" y="26" width="3.5" height="20" rx="1" fill="#67FFF2" />
            <rect x="43" y="19" width="4" height="27" rx="1" fill="#2CE5D3" />
            <rect x="49" y="29" width="3" height="20" rx="1" fill="#14B8A6" />
            {/* Floating cyan particles */}
            <rect x="35" y="11" width="3" height="3" fill="#72FFF4" />
            <rect x="45" y="13" width="2.5" height="2.5" fill="#72FFF4" />
            <rect x="25" y="17" width="2.5" height="2.5" fill="#72FFF4" />
          </g>
        );

      case '乌萨斯呼吸器':
        return (
          <g>
            {/* Tactical black-grey respirator mask with red valve */}
            <path d="M18 36 L34 26 L54 28 L60 40 L50 52 L36 46 L22 46 Z" fill="#374151" stroke="#111827" strokeWidth="2.5" />
            <polygon points="36,28 50,30 52,42 38,42" fill="#6B7280" />
            <line x1="41" y1="33" x2="49" y2="34" stroke="#1F2937" strokeWidth="2" />
            <line x1="41" y1="37" x2="49" y2="38" stroke="#1F2937" strokeWidth="2" />
            <circle cx="23" cy="43" r="4" fill="#EF4444" stroke="#7F1D1D" strokeWidth="1.5" />
            <path d="M46 44 L56 48 L52 55 L42 50 Z" fill="#1F2937" />
          </g>
        );

      case '伊比利亚骨刺刀':
        return (
          <g>
            {/* Serrated white bone-blade dagger with red tassel */}
            <path d="M26 16 C32 22 39 32 42 44 L33 46 C28 36 25 26 26 16 Z" fill="#E5E7EB" stroke="#374151" strokeWidth="2" />
            <polygon points="28,22 35,25 29,28" fill="#9CA3AF" />
            <polygon points="30,30 37,33 31,36" fill="#9CA3AF" />
            <rect x="32" y="44" width="14" height="4" rx="1.5" transform="rotate(-18 39 46)" fill="#991B1B" />
            <rect x="38" y="46" width="5" height="12" rx="1.5" transform="rotate(-18 40 52)" fill="#1F2937" />
            <circle cx="35" cy="54" r="2.5" fill="#F59E0B" />
          </g>
        );

      case '莱塔尼亚小鼓':
        return (
          <g>
            {/* Crossed wooden drumsticks + black & gold snare drum */}
            <line x1="25" y1="16" x2="50" y2="31" stroke="#D6B88A" strokeWidth="3" strokeLinecap="round" />
            <line x1="30" y1="14" x2="46" y2="32" stroke="#C4A472" strokeWidth="3" strokeLinecap="round" />
            <rect x="20" y="34" width="40" height="20" rx="2" fill="#18181B" stroke="#D4AF37" strokeWidth="2.5" />
            <rect x="20" y="34" width="40" height="4" fill="#EAB308" />
            <rect x="20" y="50" width="40" height="4" fill="#EAB308" />
            <line x1="28" y1="38" x2="28" y2="50" stroke="#D4AF37" strokeWidth="2" />
            <line x1="40" y1="38" x2="40" y2="50" stroke="#D4AF37" strokeWidth="2" />
            <line x1="52" y1="38" x2="52" y2="50" stroke="#D4AF37" strokeWidth="2" />
          </g>
        );

      case '炎国短刀':
        return (
          <g>
            {/* Bronze-gold notched tanto blade with dark hilt */}
            <polygon points="22,18 42,34 36,41 18,24" fill="#D6B075" stroke="#451A03" strokeWidth="2" />
            <polygon points="22,18 32,26 27,30 18,24" fill="#FDE68A" />
            <rect x="36" y="35" width="9" height="4" transform="rotate(42 40 37)" fill="#78350F" />
            <rect x="40" y="39" width="14" height="6" rx="2" transform="rotate(42 47 42)" fill="#27272A" stroke="#D97706" strokeWidth="1.5" />
          </g>
        );

      case '萨尔贡浓茶':
        return (
          <g>
            {/* Angled amber tea bottle with silver chain */}
            <g transform="rotate(18 40 40)">
              <rect x="35" y="15" width="8" height="6" rx="1" fill="#374151" />
              <rect x="29" y="21" width="20" height="34" rx="3" fill="#D97706" stroke="#F8FAFC" strokeWidth="2" />
              <rect x="31" y="29" width="16" height="14" fill="#1E293B" />
              <circle cx="39" cy="36" r="3.5" fill="#F8FAFC" />
            </g>
            <path d="M44 19 Q56 22 53 33 Q50 40 45 36" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="2 2" />
          </g>
        );

      case '维式重锤':
        return (
          <g>
            {/* Tactical black-and-steel warhammer with yellow lanyard */}
            <g transform="rotate(20 40 40)">
              <rect x="37" y="24" width="6" height="32" rx="2" fill="#18181B" stroke="#52525B" strokeWidth="1.5" />
              <rect x="26" y="16" width="26" height="10" rx="2" fill="#4B5563" stroke="#18181B" strokeWidth="2" />
              <rect x="23" y="15" width="5" height="12" rx="1" fill="#9CA3AF" />
              <polygon points="39,28 42,32 37,32" fill="#F59E0B" />
            </g>
            <path d="M27 52 Q21 55 24 48" fill="none" stroke="#FACC15" strokeWidth="2" />
          </g>
        );

      case '谢拉格不融冰':
        return (
          <g>
            {/* Jagged crystalline blue-white glacier shards */}
            <polygon points="16,52 22,32 30,38 28,52" fill="#60A5FA" stroke="#1E3A8A" strokeWidth="1.5" />
            <polygon points="26,52 34,20 44,32 42,52" fill="#93C5FD" stroke="#1E3A8A" strokeWidth="1.5" />
            <polygon points="38,52 48,26 56,36 54,52" fill="#DBEAFE" stroke="#1E3A8A" strokeWidth="1.5" />
            <polygon points="22,52 30,36 38,42 36,52" fill="#EFF6FF" />
          </g>
        );

      case '阿戈尔重刃':
        return (
          <g>
            {/* Abyssal anchor-hooked heavy weapon */}
            <g transform="rotate(15 40 40)">
              <rect x="36" y="18" width="8" height="26" rx="2" fill="#1E293B" stroke="#94A3B8" strokeWidth="1.5" />
              <path d="M24 36 Q40 56 56 36 L50 48 Q40 58 30 48 Z" fill="#E2E8F0" stroke="#0F172A" strokeWidth="2" />
              <circle cx="40" cy="24" r="3" fill="#F59E0B" />
            </g>
          </g>
        );

      case '叙拉古正装':
        return (
          <g>
            {/* Folded black mafia suit with red sunglasses */}
            <polygon points="18,34 40,22 62,34 54,54 26,54" fill="#27272A" stroke="#09090B" strokeWidth="2.5" />
            <polygon points="33,24 40,38 47,24" fill="#18181B" />
            {/* Red-tinted sunglasses */}
            <rect x="27" y="29" width="10" height="5" rx="2" fill="#EF4444" stroke="#18181B" strokeWidth="1.5" />
            <rect x="41" y="29" width="10" height="5" rx="2" fill="#EF4444" stroke="#18181B" strokeWidth="1.5" />
            {/* White pocket kerchief */}
            <polygon points="48,38 54,35 53,41" fill="#F8FAFC" />
          </g>
        );

      case '卡西米尔竞技旗':
        return (
          <g>
            {/* Knight tournament vertical banner flag */}
            <line x1="20" y1="20" x2="58" y2="20" stroke="#D97706" strokeWidth="3" strokeLinecap="round" />
            <line x1="25" y1="15" x2="25" y2="56" stroke="#78350F" strokeWidth="3" strokeLinecap="round" />
            <polygon points="27,21 53,21 56,52 41,49 29,54" fill="#F8FAFC" stroke="#1E293B" strokeWidth="2" />
            <polygon points="27,21 34,21 35,51 29,54" fill="#EF4444" />
            <polygon points="34,21 41,21 42,49 35,51" fill="#38BDF8" />
            <polygon points="42,30 50,34 44,42" fill="#0F172A" />
          </g>
        );

      case '聚合急救箱':
        return (
          <g>
            {/* Open white metal medical box with 3 vials */}
            <polygon points="20,34 48,28 56,42 28,48" fill="#CBD5E1" stroke="#334155" strokeWidth="2" />
            <polygon points="24,20 50,16 48,28 20,34" fill="#F1F5F9" stroke="#475569" strokeWidth="2" />
            <rect x="27" y="27" width="5" height="9" rx="1" fill="#F8FAFC" stroke="#64748B" />
            <rect x="35" y="26" width="5" height="9" rx="1" fill="#F8FAFC" stroke="#64748B" />
            <rect x="43" y="25" width="5" height="9" rx="1" fill="#F8FAFC" stroke="#64748B" />
            <polygon points="20,40 48,34 48,48 20,54" fill="#94A3B8" stroke="#1E293B" strokeWidth="2" />
            <circle cx="35" cy="43" r="3.5" fill="#F8FAFC" />
          </g>
        );

      case '灵巧涡轮手套':
        return (
          <g>
            {/* Armored gauntlet with glowing cyan turbine fan */}
            <path d="M22 28 L42 20 L56 32 L48 52 L26 48 Z" fill="#475569" stroke="#0F172A" strokeWidth="2.5" />
            <circle cx="35" cy="36" r="11" fill="#1E293B" stroke="#94A3B8" strokeWidth="2" />
            <circle cx="35" cy="36" r="8" fill="#38BDF8" />
            <line x1="35" y1="27" x2="35" y2="45" stroke="#0F172A" strokeWidth="2" />
            <line x1="26" y1="36" x2="44" y2="36" stroke="#0F172A" strokeWidth="2" />
            <line x1="29" y1="30" x2="41" y2="42" stroke="#0F172A" strokeWidth="2" />
            <line x1="41" y1="30" x2="29" y2="42" stroke="#0F172A" strokeWidth="2" />
          </g>
        );

      case '精准狙击镜':
        return (
          <g>
            {/* Tactical black rifle scope with red laser glint */}
            <g transform="rotate(-18 40 40)">
              <rect x="18" y="33" width="42" height="12" rx="3" fill="#27272A" stroke="#52525B" strokeWidth="2" />
              <rect x="32" y="29" width="12" height="20" rx="2" fill="#18181B" stroke="#71717A" strokeWidth="1.5" />
              <ellipse cx="58" cy="39" rx="3.5" ry="6" fill="#EF4444" />
            </g>
          </g>
        );

      case '迅捷作战粮':
        return (
          <g>
            {/* Silver ration pouch with yellow label + biscuit bar */}
            <rect x="30" y="18" width="24" height="30" rx="2" fill="#E2E8F0" stroke="#475569" strokeWidth="2" />
            <rect x="35" y="27" width="16" height="11" fill="#FACC15" stroke="#1E293B" strokeWidth="1.5" />
            <polygon points="18,44 34,40 40,48 24,52" fill="#FDE68A" stroke="#92400E" strokeWidth="2" />
          </g>
        );

      case '坚守盾牌':
        return (
          <g>
            {/* Angled dark-steel riot shield with triangular viewport */}
            <polygon points="32,16 48,20 44,52 30,54 24,44" fill="#3F3F46" stroke="#18181B" strokeWidth="2.5" />
            <polygon points="34,27 42,28 38,34" fill="#E4E4E7" />
            <polygon points="33,38 41,39 37,45" fill="#E4E4E7" />
            <rect x="43" y="42" width="3.5" height="6" rx="1" fill="#EF4444" />
          </g>
        );

      case '突袭手雷':
        return (
          <g>
            {/* Tactical black grenade with yellow hazard triangle */}
            <rect x="31" y="22" width="14" height="30" rx="3" fill="#18181B" stroke="#52525B" strokeWidth="2" />
            <path d="M29 18 H47 L49 26 H43 V22 H33 Z" fill="#71717A" />
            <polygon points="40,22 48,34 32,34" fill="#FACC15" stroke="#18181B" strokeWidth="1.5" />
            <circle cx="38" cy="39" r="2.2" fill="#52525B" />
            <circle cx="38" cy="46" r="2.2" fill="#52525B" />
          </g>
        );

      case '不屈弹射器':
        return (
          <g>
            {/* Hover launch pad with dual yellow thruster jets */}
            <polygon points="18,34 44,26 58,34 38,42" fill="#E2E8F0" stroke="#1E293B" strokeWidth="2" />
            <polygon points="20,34 38,42 56,34 52,42 26,42" fill="#334155" />
            <polygon points="29,42 33,42 32,54 28,54" fill="#FACC15" />
            <polygon points="45,40 49,40 48,52 44,52" fill="#FACC15" />
          </g>
        );

      case '奥术法阵':
      default:
        return (
          <g>
            {/* Glowing cyan holographic arcane ritual circle on pedestal */}
            <ellipse cx="40" cy="30" rx="16" ry="8" fill="none" stroke="#38BDF8" strokeWidth="2.5" />
            <polygon points="28,30 40,23 52,30 40,37" fill="none" stroke="#7DD3FC" strokeWidth="2" />
            <path d="M24 46 L32 38 H48 L56 46 Z" fill="#1E293B" stroke="#64748B" strokeWidth="2" />
            <circle cx="33" cy="42" r="2.5" fill="#38BDF8" />
            <circle cx="47" cy="42" r="2.5" fill="#38BDF8" />
          </g>
        );
    }
  };

  const badgeStyle =
    (tier && ITEM_TIER_BADGE_COLORS[tier]) ||
    'bg-slate-800 text-slate-200 border-slate-600';
  const compact = size <= 44;

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative overflow-hidden bg-gradient-to-br from-[#5A6D73] via-[#2C3A3F] to-[#182226] border border-slate-600/80 shadow-md shrink-0 flex items-center justify-center select-none ${compact ? 'rounded-md' : 'rounded-xl'}`}
    >
      {/* Inner dark frame matching Arknights item card */}
      <div className={`bg-[#141B1E] border border-white/10 flex items-center justify-center overflow-hidden ${compact ? 'size-[90%] rounded' : 'size-[78%] rounded-lg'}`}>
        <svg
          viewBox="0 0 80 80"
          className="w-full h-full"
          aria-hidden="true"
        >
          {renderEquipmentGraphic()}
        </svg>
      </div>

      {/* Top-Right Roman Numeral Tier Badge (Exact match to infographics) */}
      {tier && (
        <span
          className={`absolute z-10 text-[10px] font-mono-tabular font-extrabold border shadow ${badgeStyle} ${
            compact
              ? 'top-px right-px px-0.5 leading-[11px] rounded-sm'
              : 'top-1 right-1 px-1.5 py-0.2 rounded'
          }`}
        >
          {tier}
        </span>
      )}
    </div>
  );
};
