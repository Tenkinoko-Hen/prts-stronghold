// 青逝痕 Tenkinoko 制作
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
    <div className="d-ref-scroll">
      <div className="d-ref-inner">
        {/* 1. Compact Industrial Nameplate + 变形同构体 Acquisition */}
        <div className="d-ind-bar d-panel">
          <div className="d-inline" style={{ flexWrap: 'wrap', gap: 12 }}>
            <h1 className="text-[15px] font-extrabold tracking-tight text-[#f3f4f6]">
              转职合成配方 <small className="font-mono-tabular text-[#9ca3af] font-normal ml-1">18 FORMULAS</small>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <TransferEquipmentSvg itemKey="变形同构体" tier="VI" size={28} />
                <span className="text-[#ffe600] font-bold">变形同构体</span>
              </div>
              <span className="px-2 py-0.5 bg-[#0f2622] border border-[#34d39955] text-[#6ee7b7]">
                ① 6本商店直购
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#24200c] border border-[#ffe60055] text-[#ffe600]">
                <OperatorAvatar name="缪尔赛思" size="sm" showName={false} showTier={false} className="[&_.w-12]:size-6" />
                <span>② 抓缪尔赛思免费送</span>
              </div>
            </div>
          </div>

          <div className="d-ind-search w-full sm:w-56">
            <Search size={13} aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜装备名 / 盟约…"
              aria-label="搜索转职合成公式"
              className="d-ind-input"
            />
          </div>
        </div>

        {/* 2. Filter Bar */}
        <div className="d-ind-bar d-panel">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="flex items-center gap-1 font-bold text-[#9ca3af] mr-1">
              <Filter size={13} className="text-[#ffe600]" />分类
            </span>
            {[
              { id: 'all', label: '全部 (18)' },
              { id: 'core', label: '核心盟约 (10)' },
              { id: 'sub', label: '附加盟约 (8)' },
              { id: 'new', label: '新增 NEW (5)' },
              { id: 'comp', label: '当前阵容适用' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`transfer-filter-${tab.id}`}
                aria-pressed={categoryFilter === tab.id}
                onClick={() => setCategoryFilter(tab.id as 'all' | 'core' | 'sub' | 'new' | 'comp')}
                className="d-ind-tab"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-mono-tabular text-[#9ca3af]">
            显示 {filteredRecipes.length} / {TRANSFER_ITEM_RECIPES.length}
          </span>
        </div>

        {/* 3. Formula Grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,256px),1fr))] gap-2.5">
          {filteredRecipes.map((recipe) => {
            const isCompRec = isRecipeRecommendedForComp(recipe);
            const isCore = recipe.category === '核心盟约转职';

            return (
              <div
                key={recipe.id}
                data-testid={`transfer-card-${recipe.id}`}
                className={`d-ind-card d-transfer-card min-w-0${isCompRec ? ' is-accent' : ''}`}
              >
                <div className="d-transfer-card-head">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] leading-3 font-mono-tabular font-bold tracking-wider uppercase text-[#9ca3af]">
                      {isCore ? '核心盟约' : '附加盟约'}
                    </span>
                    {recipe.isNew && (
                      <span className="px-1 py-0.5 text-[9px] leading-none font-extrabold font-mono-tabular bg-[#ff3b30] text-white">
                        NEW
                      </span>
                    )}
                  </div>
                  {isCompRec && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#ffe600] text-[#0b0c0e] text-[10px] leading-none font-extrabold shrink-0">
                      <Flame size={10} />
                      <span>当前阵容适用</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-[minmax(max-content,1fr)_auto_minmax(0,1.4fr)_auto_minmax(0,1fr)] items-start gap-x-1 text-center text-xs leading-4 font-semibold">
                  <div className="min-w-0 flex flex-col items-center gap-1">
                    <TransferEquipmentSvg itemKey="变形同构体" tier="VI" size={RECIPE_ICON_SIZE} />
                    <span className="max-w-full text-[#d1d5db]">变形同构体</span>
                  </div>

                  <div className="h-11 flex items-center font-mono-tabular text-base font-bold text-[#6b7280] select-none">+</div>

                  <div className="min-w-0 flex flex-col items-center gap-1">
                    <TransferEquipmentSvg itemKey={recipe.baseEquipmentName} tier={recipe.equipmentTier} size={RECIPE_ICON_SIZE} />
                    <span className="max-w-full text-balance text-[#ffe600]">{recipe.baseEquipmentName}</span>
                  </div>

                  <div className="h-11 flex items-center font-mono-tabular text-base font-bold text-[#6b7280] select-none">=</div>

                  <div className="min-w-0 flex flex-col items-center gap-1">
                    <div
                      style={{ width: RECIPE_ICON_SIZE, height: RECIPE_ICON_SIZE }}
                      className="bg-[#102226] border border-[#00e5ff80] flex items-center justify-center text-[#00e5ff]"
                    >
                      <CovenantEmblemSvg name={recipe.targetCovenant} size={24} />
                    </div>
                    <span className="max-w-full text-[#00e5ff]">{recipe.targetCovenant}</span>
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
