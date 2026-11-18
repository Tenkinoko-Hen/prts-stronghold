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
    <div className="w-full h-full overflow-y-auto bg-[#0B0E14] text-slate-100 pt-22 pb-28 px-4 sm:px-8">
      <div className="max-w-[1420px] mx-auto space-y-6">
        {/* 1. Header & Original Infographic Quick View */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-50 tracking-tight">
            全盟约干员图鉴 & 叠层公式
          </h1>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                onOpenImage(
                  '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
                  '九大盟约：叠层/过渡/输出终端全景长图'
                )
              }
              className="px-4 py-2 text-sm font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
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
              className="px-4 py-2 text-sm font-black text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
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
              className="px-4 py-2 text-sm font-black text-teal-300 bg-slate-900 border border-teal-500/40 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
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
              className="px-4 py-2 text-sm font-black text-teal-300 bg-slate-900 border border-teal-500/40 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              <span>附加盟约原图 II</span>
            </button>
          </div>
        </div>

        {/* 2. Priority Comp Filter, Scope Switcher & Favorites Filter Bar */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0F1522] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Scope Switcher */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                data-testid="cov-scope-core"
                onClick={() => {
                  setCovenantScope('core');
                  setSelectedCovId(COVENANT_GUIDES[0].id);
                }}
                className={`px-4 py-2 text-sm font-black rounded-lg transition-colors whitespace-nowrap ${
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
                className={`px-4 py-2 text-sm font-black rounded-lg transition-colors whitespace-nowrap ${
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
                className={`px-4 py-2 text-sm font-black rounded-lg transition-colors whitespace-nowrap ${
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
              className={`px-4 py-2 rounded-xl text-sm font-black border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                onlyCurrentCompPriority
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:border-amber-400/60'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>仅看当前阵容推荐盟约</span>
            </button>

            {/* Filter 2: Only Show Favorited Covenants */}
            <button
              type="button"
              data-testid="filter-favorites-only"
              onClick={() => setOnlyFavorites((f) => !f)}
              className={`px-4 py-2 rounded-xl text-sm font-black border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                onlyFavorites
                  ? 'bg-amber-500/25 text-amber-300 border-amber-400 shadow-md'
                  : 'bg-slate-900 text-slate-100 border-slate-700 hover:border-amber-400/60'
              }`}
            >
              <Star
                className={`w-4 h-4 ${
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
                className="px-3.5 py-2 rounded-xl text-sm font-bold text-slate-300 hover:text-slate-50 bg-slate-900 border border-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                <span>重置</span>
              </button>
            )}
          </div>

          {/* Linked Comp Selector Dropdown */}
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-slate-300 font-bold whitespace-nowrap">
              关联阵容：
            </span>
            <select
              aria-label="切换当前关联阵容一图流"
              value={selectedCompId}
              onChange={(e) => onSelectCompId(e.target.value)}
              className="bg-slate-900 text-amber-300 font-black border border-slate-700 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-amber-400"
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
          <div className="p-8 rounded-2xl bg-[#0F1522] border border-slate-800 text-center space-y-4">
            <div className="text-xl font-black text-slate-100">
              当前筛选条件下暂无匹配的盟约
            </div>
            <button
              type="button"
              onClick={() => {
                onChangeOnlyCurrentCompPriority(false);
                setOnlyFavorites(false);
              }}
              className="px-5 py-2.5 text-sm font-black bg-amber-400 text-slate-950 rounded-xl"
            >
              重置筛选条件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                  className={`relative p-4 rounded-2xl border-2 text-left transition-all cursor-pointer select-none flex flex-col justify-between ${
                    active
                      ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-lg'
                      : 'bg-[#0F1522] text-slate-100 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                          active
                            ? 'bg-slate-950 text-[#00FFCC] border-slate-800'
                            : 'bg-[#00FFCC]/15 text-[#00FFCC] border-[#00FFCC]/40'
                        }`}
                      >
                        <CovenantEmblemSvg
                          name={cov.name.split(' ')[0].replace('盟约', '')}
                          size={22}
                        />
                      </span>
                      <span className="text-lg font-black whitespace-nowrap truncate">
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
                      className={`p-1.5 rounded-lg transition-colors ${
                        active
                          ? 'hover:bg-amber-500/40 text-slate-950'
                          : 'hover:bg-slate-800 text-amber-400'
                      }`}
                    >
                      <Star
                        className={`w-5 h-5 ${
                          isFav
                            ? active
                              ? 'fill-slate-950 text-slate-950'
                              : 'fill-amber-400 text-amber-400'
                            : 'opacity-50'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-lg font-black whitespace-nowrap ${
                        active
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-slate-900 text-slate-200'
                      }`}
                    >
                      {cov.difficulty}
                    </span>
                    {isPriority && (
                      <span
                        className={`text-xs px-2.5 py-1 rounded-lg font-black whitespace-nowrap ${
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
          <div className="p-6 rounded-2xl bg-[#0F1522] border border-slate-800 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-[#00FFCC]/15 border border-[#00FFCC]/50 text-[#00FFCC] flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(0,255,204,0.3)]">
                    <CovenantEmblemSvg
                      name={activeCov.name.split(' ')[0].replace('盟约', '')}
                      size={28}
                    />
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-50">
                    {activeCov.name}
                  </h2>

                  <button
                    type="button"
                    onClick={() => onToggleFavoriteCovenant(activeCov.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-black border flex items-center gap-2 transition-colors ${
                      favoriteCovenantIds.includes(activeCov.id)
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${
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

                {/* Big Scannable Formula Pill Row */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <span className="px-4 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-sm sm:text-base font-black text-amber-300">
                    叠层核心：{activeCov.stackCore}
                  </span>
                  {activeCov.synergySubPacts.map((sub) => (
                    <span
                      key={sub}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-black text-slate-100"
                    >
                      +{sub}
                    </span>
                  ))}
                </div>
              </div>

              {/* Role Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-900 border border-slate-800 rounded-xl self-start">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3.5 py-2 text-sm font-black rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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

            {/* Visual Operator Avatar Cards Grid (Large Avatars & Large Badges) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleOperators.map((op) => {
                const badges = extractConciseEffectBadges(op.effect);
                const catStyle =
                  CATEGORY_COLORS[op.category] ||
                  'bg-slate-800 text-slate-200 border-slate-700';

                return (
                  <div
                    key={op.name}
                    className="p-4 rounded-2xl bg-slate-900/95 border border-slate-800 hover:border-slate-700 transition-all flex items-center gap-4"
                  >
                    <OperatorAvatar
                      name={op.name}
                      tier={op.tier}
                      size="lg"
                      showName={false}
                    />

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-black text-slate-50 truncate">
                          {op.name}
                        </span>
                        <span
                          className={`px-2.5 py-1 text-xs font-black rounded-lg border whitespace-nowrap shrink-0 ${catStyle}`}
                        >
                          {op.category}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-100 text-sm font-black">
                          {badges.triggerBadge}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/50 text-amber-300 text-sm font-black">
                          {badges.valueBadge}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Concise Pro Tip Strip */}
            <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-800/80">
              <span className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-sm font-black">
                实战口诀
              </span>
              {activeCov.proTips.map((tip) => (
                <span
                  key={tip}
                  className="text-sm sm:text-base font-bold text-slate-100 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800"
                >
                  {tip}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 5. 13 Universal Stackers Section */}
        <div className="p-6 rounded-2xl bg-[#0F1522] border border-slate-800 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <h2 className="text-xl sm:text-2xl font-black text-slate-50 flex items-center gap-2.5">
              <Users className="w-6 h-6 text-sky-400" />
              <span>13位全阵营通用叠层神卡</span>
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stackerQuery}
                  onChange={(e) => setStackerQuery(e.target.value)}
                  placeholder="搜干员名 / 身前 / 整备区..."
                  aria-label="搜索通用叠层干员"
                  className="pl-10 pr-4 py-2 text-sm font-bold bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="button"
                onClick={() => setBenchOnly((b) => !b)}
                className={`px-4 py-2 text-sm font-black rounded-xl border transition-colors whitespace-nowrap shrink-0 ${
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
                className="px-4 py-2 text-sm font-black text-amber-300 bg-slate-900 border border-amber-500/40 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>通用叠层原图</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUniversal.map((st) => (
              <div
                key={st.id}
                className="p-4 rounded-2xl bg-slate-900/95 border border-slate-800 flex items-center gap-4"
              >
                <OperatorAvatar
                  name={st.name}
                  tier={st.tier}
                  size="lg"
                  showName={false}
                />

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-black text-slate-50 truncate">
                      {st.name}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-xs font-black whitespace-nowrap shrink-0">
                      {st.tag}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 text-sm font-black">
                      位置：{st.targetZone}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-sm font-bold">
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
