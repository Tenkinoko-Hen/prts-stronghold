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

const RECIPE_ICON_SIZE = 44;

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
    <div className="w-full h-full overflow-y-auto bg-[#0B0E14] text-slate-100 pt-16 pb-6 px-3 sm:px-4">
      <div className="max-w-[1520px] mx-auto space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-lg leading-6 font-extrabold text-slate-50">
              新卫戍协议转职合成表（18种公式一览）
            </h1>

            {/* Compact 变形同构体 Acquisition Badges */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <TransferEquipmentSvg
                  itemKey="变形同构体"
                  tier="VI"
                  size={32}
                />
                <span className="text-amber-200">
                  变形同构体：
                </span>
              </div>
              <span className="px-1.5 py-1 rounded bg-emerald-950/90 border border-emerald-500/50 text-emerald-300">
                ① 6本商店直接购买
              </span>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-950/70 border border-amber-500/50">
                <OperatorAvatar
                  name="缪尔赛思"
                  tier="VI"
                  size="sm"
                  showName={false}
                  className="[&_.w-12]:size-8"
                />
                <span className="text-amber-300">
                  ② 抓缪尔赛思免费送
                </span>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 max-w-full items-center gap-1.5 text-xs">
            <span className="text-slate-300 font-bold whitespace-nowrap">
              关联阵容高亮：
            </span>
            <select
              aria-label="切换转职关联阵容"
              value={selectedCompId}
              onChange={(e) => onSelectCompId(e.target.value)}
              className="min-w-0 bg-slate-900 text-amber-300 font-semibold border border-slate-700 rounded-md px-2 py-1.5 focus:outline-none focus:border-amber-400"
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
        <div className="px-3 py-2 rounded-lg bg-[#0F1522] border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 font-bold text-slate-200">
              <Filter size={14} className="text-amber-400" />
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
                className={`px-2.5 py-1.5 rounded-md font-semibold border transition-colors whitespace-nowrap ${
                  categoryFilter === tab.id
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                    : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-slate-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-48">
            <Search size={14} className="text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜装备名 / 盟约..."
              aria-label="搜索转职合成公式"
              className="w-full pl-7 pr-2 py-1.5 font-medium bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,236px),1fr))] gap-x-2 gap-y-3">
          {filteredRecipes.map((recipe) => {
            const isCompRec = isRecipeRecommendedForComp(recipe);

            return (
              <div
                key={recipe.id}
                data-testid={`transfer-card-${recipe.id}`}
                className={`relative min-w-0 px-2 py-2.5 rounded-lg border transition-colors ${
                  isCompRec
                    ? 'bg-[#141E30] border-amber-400'
                    : 'bg-[#111722] border-slate-800 hover:border-slate-700'
                }`}
              >
                {isCompRec && (
                  <span className="absolute top-0 right-2 -translate-y-1/2 px-1.5 rounded bg-amber-400 text-slate-950 text-[10px] leading-3.5 font-bold flex items-center gap-0.5">
                    <Flame size={11} />
                    <span>当前阵容适用</span>
                  </span>
                )}

                {/* Pure Visual Equation Row: [变形同构体] + [Base Equipment] = [Target Covenant Emblem] */}
                <div className="grid grid-cols-[minmax(max-content,1fr)_auto_minmax(0,1.4fr)_auto_minmax(0,1fr)] items-start gap-x-1 text-center text-xs leading-4 font-semibold">
                  {/* Left: 变形同构体 */}
                  <div className="min-w-0 flex flex-col items-center gap-1">
                    <TransferEquipmentSvg
                      itemKey="变形同构体"
                      tier="VI"
                      size={RECIPE_ICON_SIZE}
                    />
                    <span className="max-w-full text-slate-200">
                      变形同构体
                    </span>
                  </div>

                  {/* Plus Sign */}
                  <div className="h-11 flex items-center text-base font-bold text-slate-300 select-none">
                    +
                  </div>

                  {/* Middle: Base Equipment SVG Card */}
                  <div className="min-w-0 flex flex-col items-center gap-1">
                    <TransferEquipmentSvg
                      itemKey={recipe.baseEquipmentName}
                      tier={recipe.equipmentTier}
                      size={RECIPE_ICON_SIZE}
                    />
                    <span className="max-w-full text-balance text-amber-300">
                      {recipe.baseEquipmentName}
                    </span>
                  </div>

                  {/* Equals Sign */}
                  <div className="h-11 flex items-center text-base font-bold text-slate-300 select-none">
                    =
                  </div>

                  {/* Right: Resulting Covenant Emblem Box */}
                  <div className="min-w-0 flex flex-col items-center gap-1">
                    <div
                      style={{ width: RECIPE_ICON_SIZE, height: RECIPE_ICON_SIZE }}
                      className="relative rounded-lg overflow-hidden bg-gradient-to-br from-[#64787E] via-[#34454B] to-[#1A2428] border border-teal-400/70 flex items-center justify-center text-white"
                    >
                      <div className="size-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                        <CovenantEmblemSvg
                          name={recipe.targetCovenant}
                          size={24}
                        />
                      </div>

                      {recipe.isNew && (
                        <span className="absolute top-0 left-0 px-1 text-[10px] leading-3 font-bold bg-rose-600 text-white rounded-br">
                          NEW
                        </span>
                      )}
                    </div>
                    <span className="max-w-full text-teal-300">
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
