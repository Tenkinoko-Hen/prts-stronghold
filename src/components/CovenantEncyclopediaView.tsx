import React, { useState } from 'react';
import {
  COVENANT_GUIDES,
  CovenantGuide,
  META_COMPS,
  SUB_COVENANT_GUIDES,
} from '../data/strongholdData';
import {
  extractConciseEffectBadges,
  filterCovenantGuides,
  filterUniversalStackers,
  isCovenantRecommendedForComp,
} from '../utils/tacticalLogic';
import { OperatorAvatar } from './OperatorAvatar';
import { CovenantEmblemSvg } from './StrongholdSvgIcons';
import {
  Search,
  Eye,
  Users,
  Star,
  Filter,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface CovenantEncyclopediaViewProps {
  selectedCompId: string;
  onSelectCompId: (id: string) => void;
  favoriteCovenantIds: string[];
  onToggleFavoriteCovenant: (covId: string) => void;
  onlyCurrentCompPriority: boolean;
  onChangeOnlyCurrentCompPriority: (val: boolean) => void;
  onOpenImage: (url: string, title: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  前中期叠层: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  '辅助/过渡': 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  后期叠层: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  本家输出终端: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};

export const CovenantEncyclopediaView: React.FC<
  CovenantEncyclopediaViewProps
> = ({
  selectedCompId,
  onSelectCompId,
  favoriteCovenantIds,
  onToggleFavoriteCovenant,
  onlyCurrentCompPriority,
  onChangeOnlyCurrentCompPriority,
  onOpenImage,
}) => {
  const [covenantScope, setCovenantScope] = useState<'core' | 'sub' | 'all'>(
    'core'
  );
  const [selectedCovId, setSelectedCovId] = useState<string>(
    COVENANT_GUIDES[0].id
  );
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('全部');
  const [stackerQuery, setStackerQuery] = useState<string>('');
  const [benchOnly, setBenchOnly] = useState<boolean>(false);

  const activeComp =
    META_COMPS.find((c) => c.id === selectedCompId) || META_COMPS[0];

  const sourceCovenants =
    covenantScope === 'core'
      ? COVENANT_GUIDES
      : covenantScope === 'sub'
      ? SUB_COVENANT_GUIDES
      : [...COVENANT_GUIDES, ...SUB_COVENANT_GUIDES];

  const filteredCovenants = filterCovenantGuides(sourceCovenants, {
    onlyCurrentCompPriority,
    activeComp,
    onlyFavorites,
    favoriteIds: favoriteCovenantIds,
  });

  const activeCov: CovenantGuide | undefined =
    filteredCovenants.find((c) => c.id === selectedCovId) ||
    filteredCovenants[0];

  const categories = [
    '全部',
    '前中期叠层',
    '辅助/过渡',
    '后期叠层',
    '本家输出终端',
  ];
  const visibleOperators = activeCov
    ? activeCov.operators.filter(
        (op) => categoryFilter === '全部' || op.category === categoryFilter
      )
    : [];

  const filteredUniversal = filterUniversalStackers(stackerQuery, benchOnly);

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0B0E14] text-slate-100 pt-16 pb-6 px-3 sm:px-4">
      <div className="max-w-[1420px] mx-auto space-y-3">
        {/* 1. Header & Original Infographic Quick View */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <h1 className="text-lg leading-6 font-extrabold text-slate-50">
            全盟约干员图鉴 & 叠层公式
          </h1>

          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() =>
                onOpenImage(
                  '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
                  '九大盟约：叠层/过渡/输出终端全景长图'
                )
              }
              className="px-2.5 py-1.5 text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <Eye size={14} />
              <span>九大盟约原图</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenImage(
                  '/assets/aistudio/e778a8ca1370b949f540e862a04df703_f94c3d19.png',
                  '卡西米尔盟约：叠层/过渡/输出终端一图流'
                )
              }
              className="px-2.5 py-1.5 text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <Eye size={14} />
              <span>卡西米尔原图</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenImage(
                  '/assets/aistudio/image_7fa89991.png',
                  '附加盟约全图鉴 I'
                )
              }
              className="px-2.5 py-1.5 text-teal-300 bg-slate-900 border border-teal-500/40 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <Eye size={14} />
              <span>附加盟约原图 I</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenImage(
                  '/assets/aistudio/image_babfd902.png',
                  '附加盟约全图鉴 II'
                )
              }
              className="px-2.5 py-1.5 text-teal-300 bg-slate-900 border border-teal-500/40 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <Eye size={14} />
              <span>附加盟约原图 II</span>
            </button>
          </div>
        </div>

        {/* 2. Priority Comp Filter, Scope Switcher & Favorites Filter Bar */}
        <div className="px-3 py-2 rounded-lg bg-[#0F1522] border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold">
            {/* Scope Switcher */}
            <div className="flex flex-wrap items-center p-0.5 bg-slate-950 border border-slate-800 rounded-md">
              <button
                type="button"
                data-testid="cov-scope-core"
                onClick={() => {
                  setCovenantScope('core');
                  setSelectedCovId(COVENANT_GUIDES[0].id);
                }}
                className={`px-2 py-1.5 rounded transition-colors whitespace-nowrap ${
                  covenantScope === 'core'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-slate-50'
                }`}
              >
                十大核心盟约 (10)
              </button>
              <button
                type="button"
                data-testid="cov-scope-sub"
                onClick={() => {
                  setCovenantScope('sub');
                  setSelectedCovId(SUB_COVENANT_GUIDES[0].id);
                }}
                className={`px-2 py-1.5 rounded transition-colors whitespace-nowrap ${
                  covenantScope === 'sub'
                    ? 'bg-teal-400 text-slate-950'
                    : 'text-slate-300 hover:text-slate-50'
                }`}
              >
                十四附加盟约 (14)
              </button>
              <button
                type="button"
                data-testid="cov-scope-all"
                onClick={() => setCovenantScope('all')}
                className={`px-2 py-1.5 rounded transition-colors whitespace-nowrap ${
                  covenantScope === 'all'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-slate-50'
                }`}
              >
                全部盟约 (24)
              </button>
            </div>

            {/* Filter 1: Only Show Current Selected Comp's Recommended Priority Covenants */}
            <button
              type="button"
              data-testid="filter-comp-priority"
              onClick={() =>
                onChangeOnlyCurrentCompPriority(!onlyCurrentCompPriority)
              }
              className={`px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                onlyCurrentCompPriority
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:border-amber-400/60'
              }`}
            >
              <Sparkles size={14} />
              <span>仅看当前阵容推荐盟约</span>
            </button>

            {/* Filter 2: Only Show Favorited Covenants */}
            <button
              type="button"
              data-testid="filter-favorites-only"
              onClick={() => setOnlyFavorites((f) => !f)}
              className={`px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                onlyFavorites
                  ? 'bg-amber-500/25 text-amber-300 border-amber-400 shadow-md'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:border-amber-400/60'
              }`}
            >
              <Star
                className={`size-3.5 ${
                  onlyFavorites
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-amber-400'
                }`}
              />
              <span>收藏盟约 ({favoriteCovenantIds.length})</span>
            </button>

            {(onlyCurrentCompPriority || onlyFavorites) && (
              <button
                type="button"
                onClick={() => {
                  onChangeOnlyCurrentCompPriority(false);
                  setOnlyFavorites(false);
                }}
                className="px-2.5 py-1.5 rounded-md text-slate-300 hover:text-slate-50 bg-slate-900 border border-slate-800 flex items-center gap-1.5 whitespace-nowrap"
              >
                <RotateCcw size={14} />
                <span>重置</span>
              </button>
            )}
          </div>

          {/* Linked Comp Selector Dropdown */}
          <div className="flex min-w-0 max-w-full items-center gap-1.5">
            <span className="text-slate-300 font-bold whitespace-nowrap">
              关联阵容：
            </span>
            <select
              aria-label="切换当前关联阵容一图流"
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

        {/* 3. Covenant Cards Grid */}
        {filteredCovenants.length === 0 ? (
          <div className="p-4 rounded-lg bg-[#0F1522] border border-slate-800 text-center space-y-2">
            <div className="text-sm font-bold text-slate-100">
              当前筛选条件下暂无匹配的盟约
            </div>
            <button
              type="button"
              onClick={() => {
                onChangeOnlyCurrentCompPriority(false);
                setOnlyFavorites(false);
              }}
              className="px-2.5 py-1.5 text-xs font-semibold bg-amber-400 text-slate-950 rounded-md"
            >
              重置筛选条件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {filteredCovenants.map((cov) => {
              const active = activeCov && cov.id === activeCov.id;
              const isFav = favoriteCovenantIds.includes(cov.id);
              const isPriority = isCovenantRecommendedForComp(cov, activeComp);

              return (
                <div
                  key={cov.id}
                  onClick={() => {
                    setSelectedCovId(cov.id);
                    setCategoryFilter('全部');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedCovId(cov.id);
                      setCategoryFilter('全部');
                    }
                  }}
                  className={`min-w-0 p-2.5 rounded-lg border text-left transition-colors cursor-pointer select-none flex flex-col justify-between ${
                    active
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-[#0F1522] text-slate-100 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`size-7 rounded-full flex items-center justify-center shrink-0 border ${
                          active
                            ? 'bg-slate-950 text-[#00FFCC] border-slate-800'
                            : 'bg-[#00FFCC]/15 text-[#00FFCC] border-[#00FFCC]/40'
                        }`}
                      >
                        <CovenantEmblemSvg
                          name={cov.name.split(' ')[0].replace('盟约', '')}
                          size={18}
                        />
                      </span>
                      <span className="text-sm leading-[1.35] font-extrabold">
                        {cov.name.split(' ')[0]}
                      </span>
                    </div>

                    {/* Favorite Star Button */}
                    <button
                      type="button"
                      data-testid={`fav-cov-${cov.id}`}
                      aria-label={`收藏${cov.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteCovenant(cov.id);
                      }}
                      className={`size-7 shrink-0 inline-flex items-center justify-center rounded-md transition-colors ${
                        active
                          ? 'hover:bg-amber-500/40 text-slate-950'
                          : 'hover:bg-slate-800 text-amber-400'
                      }`}
                    >
                      <Star
                        className={`size-4 ${
                          isFav
                            ? active
                              ? 'fill-slate-950 text-slate-950'
                              : 'fill-amber-400 text-amber-400'
                            : 'opacity-50'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] leading-4 font-semibold">
                    <span
                      className={`px-1.5 py-0.5 rounded whitespace-nowrap ${
                        active
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-slate-900 text-slate-200'
                      }`}
                    >
                      {cov.difficulty}
                    </span>
                    {isPriority && (
                      <span
                        className={`px-1.5 py-0.5 rounded whitespace-nowrap ${
                          active
                            ? 'bg-slate-950 text-amber-300'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        ★ 阵容推荐
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Active Covenant Visual Card */}
        {activeCov && (
          <div className="p-3 rounded-lg bg-[#0F1522] border border-slate-800 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-8 rounded-full bg-[#00FFCC]/15 border border-[#00FFCC]/50 text-[#00FFCC] flex items-center justify-center shrink-0">
                    <CovenantEmblemSvg
                      name={activeCov.name.split(' ')[0].replace('盟约', '')}
                      size={20}
                    />
                  </span>
                  <h2 className="text-base leading-5 font-extrabold text-slate-50">
                    {activeCov.name}
                  </h2>

                  <button
                    type="button"
                    onClick={() => onToggleFavoriteCovenant(activeCov.id)}
                    className={`px-2 py-1.5 rounded-md text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                      favoriteCovenantIds.includes(activeCov.id)
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    <Star
                      className={`size-3.5 ${
                        favoriteCovenantIds.includes(activeCov.id)
                          ? 'fill-slate-950'
                          : 'text-amber-400'
                      }`}
                    />
                    <span>
                      {favoriteCovenantIds.includes(activeCov.id)
                        ? '已收藏'
                        : '收藏盟约'}
                    </span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs leading-4">
                  <span className="px-2 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 font-bold text-amber-300">
                    叠层核心：{activeCov.stackCore}
                  </span>
                  {activeCov.synergySubPacts.map((sub) => (
                    <span
                      key={sub}
                      className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-semibold text-slate-100"
                    >
                      +{sub}
                    </span>
                  ))}
                </div>
              </div>

              {/* Role Filter Tabs */}
              <div className="flex flex-wrap items-center gap-0.5 p-0.5 bg-slate-900 border border-slate-800 rounded-md self-start">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {visibleOperators.map((op) => {
                const badges = extractConciseEffectBadges(op.effect);
                const catStyle =
                  CATEGORY_COLORS[op.category] ||
                  'bg-slate-800 text-slate-200 border-slate-700';

                return (
                  <div
                    key={op.name}
                    className="min-w-0 p-2.5 rounded-lg bg-slate-900/95 border border-slate-800 hover:border-slate-700 transition-colors flex items-center gap-2.5"
                  >
                    <OperatorAvatar
                      name={op.name}
                      tier={op.tier}
                      size="sm"
                      showName={false}
                    />

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm leading-5 font-bold text-slate-50">
                          {op.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[11px] leading-4 font-semibold rounded border whitespace-nowrap shrink-0 ${catStyle}`}
                        >
                          {op.category}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 text-[11px] leading-4 font-semibold">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-100">
                          {badges.triggerBadge}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-400/50 text-amber-300">
                          {badges.valueBadge}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Concise Pro Tip Strip */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80 text-xs leading-4">
              <span className="px-2 py-1 rounded bg-amber-400 text-slate-950 font-bold">
                实战口诀
              </span>
              {activeCov.proTips.map((tip) => (
                <span
                  key={tip}
                  className="font-medium text-slate-100 bg-slate-900 px-2 py-1 rounded border border-slate-800"
                >
                  {tip}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 5. 13 Universal Stackers Section */}
        <div className="p-3 rounded-lg bg-[#0F1522] border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <h2 className="text-[15px] leading-5 font-extrabold text-slate-50 flex items-center gap-1.5">
              <Users size={16} className="text-sky-400" />
              <span>13位全阵营通用叠层神卡</span>
            </h2>

            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <div className="relative">
                <Search size={14} className="text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stackerQuery}
                  onChange={(e) => setStackerQuery(e.target.value)}
                  placeholder="搜干员名 / 身前 / 整备区..."
                  aria-label="搜索通用叠层干员"
                  className="pl-7 pr-2 py-1.5 font-medium bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="button"
                onClick={() => setBenchOnly((b) => !b)}
                className={`px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
                  benchOnly
                    ? 'bg-sky-400 text-slate-950 border-sky-300'
                    : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-slate-600'
                }`}
              >
                仅看整备区挂件
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenImage(
                    '/assets/aistudio/e88e3dcc6c1b11c17535b2bd941f2bd4_caa476ba.png',
                    '卫戍协议盟约通用叠层干员一图流'
                  )
                }
                className="px-2.5 py-1.5 text-amber-300 bg-slate-900 border border-amber-500/40 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
              >
                <Eye size={14} />
                <span>通用叠层原图</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredUniversal.map((st) => (
              <div
                key={st.id}
                className="min-w-0 p-2.5 rounded-lg bg-slate-900/95 border border-slate-800 flex items-center gap-2.5"
              >
                <OperatorAvatar
                  name={st.name}
                  tier={st.tier}
                  size="sm"
                  showName={false}
                />

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm leading-5 font-bold text-slate-50">
                      {st.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[11px] leading-4 font-semibold whitespace-nowrap shrink-0">
                      {st.tag}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-[11px] leading-4 font-semibold">
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">
                      位置：{st.targetZone}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                      {st.timing}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
