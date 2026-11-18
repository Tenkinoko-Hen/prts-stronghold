import React, { useState } from 'react';
import {
  META_COMPS,
  TRANSFER_ITEM_RECIPES,
  TransferItemRecipe,
} from '../data/strongholdData';
import {
  CovenantEmblemSvg,
  TransferEquipmentSvg,
} from './StrongholdSvgIcons';
import { OperatorAvatar } from './OperatorAvatar';
import { Search, Filter, Flame } from 'lucide-react';

interface TransferItemsViewProps {
  selectedCompId: string;
  onSelectCompId: (id: string) => void;
}

export const TransferItemsView: React.FC<TransferItemsViewProps> = ({
  selectedCompId,
  onSelectCompId,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'core' | 'sub' | 'new' | 'comp'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeComp =
    META_COMPS.find((c) => c.id === selectedCompId) || META_COMPS[0];

  const isRecipeRecommendedForComp = (recipe: TransferItemRecipe): boolean => {
    return (
      activeComp.covenants.some((c) => c.includes(recipe.targetCovenant)) ||
      activeComp.equipmentTips.some(
        (t) =>
          t.includes(recipe.baseEquipmentName) ||
          t.includes(recipe.targetCovenant)
      )
    );
  };

  const filteredRecipes = TRANSFER_ITEM_RECIPES.filter((r) => {
    if (categoryFilter === 'core' && r.category !== '核心盟约转职') return false;
    if (categoryFilter === 'sub' && r.category !== '附加盟约转职') return false;
    if (categoryFilter === 'new' && !r.isNew) return false;
    if (categoryFilter === 'comp' && !isRecipeRecommendedForComp(r))
      return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      r.baseEquipmentName.toLowerCase().includes(q) ||
      r.targetCovenant.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0B0E14] text-slate-100 pt-20 pb-24 px-4 sm:px-6">
      <div className="max-w-[1520px] mx-auto space-y-4">
        {/* 1. Compact Header + 变形同构体 Acquisition Bar in a single row to maximize screen space */}
        <div className="p-4 rounded-2xl bg-[#161B22] border border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl sm:text-2xl font-black text-slate-50 tracking-tight">
              新卫戍协议转职合成表（18种公式一览）
            </h1>

            {/* Compact 变形同构体 Acquisition Badges */}
            <div className="flex flex-wrap items-center gap-2.5 bg-[#0E131A] px-3.5 py-2 rounded-xl border border-slate-700/80">
              <div className="flex items-center gap-2">
                <TransferEquipmentSvg
                  itemKey="变形同构体"
                  tier="VI"
                  size={44}
                />
                <span className="text-sm sm:text-base font-black text-amber-200">
                  变形同构体：
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-xs sm:text-sm font-black">
                ① 6本商店直接购买
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/70 border border-amber-500/50">
                <OperatorAvatar
                  name="缪尔赛思"
                  tier="VI"
                  size="sm"
                  showName={false}
                />
                <span className="text-xs sm:text-sm font-black text-amber-300">
                  ② 抓缪尔赛思免费送
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-sm sm:text-base shrink-0">
            <span className="text-slate-300 font-bold whitespace-nowrap">
              关联阵容高亮：
            </span>
            <select
              aria-label="切换转职关联阵容"
              value={selectedCompId}
              onChange={(e) => onSelectCompId(e.target.value)}
              className="bg-slate-900 text-amber-300 font-black border border-slate-700 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400"
            >
              {META_COMPS.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. Filter & Search Bar */}
        <div className="px-4 py-3 rounded-xl bg-[#0F1522] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm font-black text-slate-200 mr-1">
              <Filter className="w-4 h-4 text-amber-400" />
              <span>分类：</span>
            </div>

            {[
              { id: 'all', label: '全部转职 (18)' },
              { id: 'core', label: '核心盟约转职 (10)' },
              { id: 'sub', label: '附加盟约转职 (8)' },
              { id: 'new', label: '★ 新增 NEW 转职 (5)' },
              {
                id: 'comp',
                label: '当前阵容推荐',
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`transfer-filter-${tab.id}`}
                onClick={() =>
                  setCategoryFilter(
                    tab.id as 'all' | 'core' | 'sub' | 'new' | 'comp'
                  )
                }
                className={`px-3.5 py-1.5 rounded-xl text-sm font-black border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === tab.id
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                    : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-slate-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜装备名 / 盟约..."
              aria-label="搜索转职合成公式"
              className="pl-10 pr-4 py-1.5 text-sm font-bold bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 w-full sm:w-60"
            />
          </div>
        </div>

        {/* 3. High-Density 3-Column / 4-Column Pure Formula Grid (No Clutter Below) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredRecipes.map((recipe) => {
            const isCompRec = isRecipeRecommendedForComp(recipe);

            return (
              <div
                key={recipe.id}
                data-testid={`transfer-card-${recipe.id}`}
                className={`relative p-2.5 rounded-2xl border-2 transition-all ${
                  isCompRec
                    ? 'bg-[#141E30] border-amber-400 shadow-md'
                    : 'bg-[#111722] border-slate-800 hover:border-slate-700'
                }`}
              >
                {isCompRec && (
                  <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow">
                    <Flame className="w-3 h-3" />
                    <span>当前阵容适用</span>
                  </span>
                )}

                {/* Pure Visual Equation Row: [变形同构体] + [Base Equipment] = [Target Covenant Emblem] */}
                <div className="flex items-center justify-between gap-1.5 bg-[#181E26] px-2.5 py-2.5 rounded-xl border border-slate-700/80">
                  {/* Left: 变形同构体 */}
                  <div className="flex flex-col items-center shrink-0">
                    <TransferEquipmentSvg
                      itemKey="变形同构体"
                      tier="VI"
                      size={66}
                    />
                    <span className="mt-1 text-xs sm:text-sm font-black text-slate-200 whitespace-nowrap">
                      变形同构体
                    </span>
                  </div>

                  {/* Plus Sign */}
                  <div className="text-xl sm:text-2xl font-black text-slate-200 select-none">
                    +
                  </div>

                  {/* Middle: Base Equipment SVG Card */}
                  <div className="flex flex-col items-center shrink-0">
                    <TransferEquipmentSvg
                      itemKey={recipe.baseEquipmentName}
                      tier={recipe.equipmentTier}
                      size={66}
                    />
                    <span className="mt-1 text-xs sm:text-sm font-black text-amber-300 whitespace-nowrap">
                      {recipe.baseEquipmentName}
                    </span>
                  </div>

                  {/* Equals Sign */}
                  <div className="text-xl sm:text-2xl font-black text-slate-200 select-none">
                    =
                  </div>

                  {/* Right: Resulting Covenant Emblem Box */}
                  <div className="relative flex flex-col items-center shrink-0">
                    <div
                      style={{ width: 66, height: 66 }}
                      className="relative rounded-xl overflow-hidden bg-gradient-to-br from-[#64787E] via-[#34454B] to-[#1A2428] border-2 border-teal-400/70 shadow-[0_0_15px_rgba(45,212,191,0.28)] flex items-center justify-center text-white"
                    >
                      <div className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                        <CovenantEmblemSvg
                          name={recipe.targetCovenant}
                          size={36}
                        />
                      </div>

                      {recipe.isNew && (
                        <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 text-[10px] font-black tracking-tight bg-rose-600 text-white rounded shadow">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className="mt-1 text-xs sm:text-sm font-black text-teal-300 whitespace-nowrap">
                      {recipe.targetCovenant}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
