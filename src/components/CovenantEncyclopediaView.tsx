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
import { Search, Eye, Users, Star, Sparkles, RotateCcw } from 'lucide-react';

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
  前中期叠层: 'bg-[#10261f] text-[#6ee7b7] border-[#34d39955]',
  '辅助/过渡': 'bg-[#0c242b] text-[#7cf3ff] border-[#00e5ff55]',
  后期叠层: 'bg-[#21192b] text-[#d8b4fe] border-[#c084fc55]',
  本家输出终端: 'bg-[#26210c] text-[#ffe600] border-[#ffe60066]',
};

export const CovenantEncyclopediaView: React.FC<CovenantEncyclopediaViewProps> = ({
  selectedCompId,
  favoriteCovenantIds,
  onToggleFavoriteCovenant,
  onlyCurrentCompPriority,
  onChangeOnlyCurrentCompPriority,
  onOpenImage,
}) => {
  const [covenantScope, setCovenantScope] = useState<'core' | 'sub' | 'all'>('core');
  const [selectedCovId, setSelectedCovId] = useState<string>(COVENANT_GUIDES[0].id);
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('全部');
  const [stackerQuery, setStackerQuery] = useState<string>('');
  const [benchOnly, setBenchOnly] = useState<boolean>(false);

  const activeComp = META_COMPS.find((c) => c.id === selectedCompId) || META_COMPS[0];

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
    filteredCovenants.find((c) => c.id === selectedCovId) || filteredCovenants[0];

  const categories = ['全部', '前中期叠层', '辅助/过渡', '后期叠层', '本家输出终端'];
  const visibleOperators = activeCov
    ? activeCov.operators.filter((op) => categoryFilter === '全部' || op.category === categoryFilter)
    : [];

  const filteredUniversal = filterUniversalStackers(stackerQuery, benchOnly);

  return (
    <div className="d-ref-scroll">
      <div className="d-ref-inner">
        {/* 1. Scope, Filters & Original Infographics */}
        <div className="d-ind-bar d-panel">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <div className="d-tabs">
              <button
                type="button"
                data-testid="cov-scope-core"
                aria-pressed={covenantScope === 'core'}
                onClick={() => { setCovenantScope('core'); setSelectedCovId(COVENANT_GUIDES[0].id); }}
              >
                核心盟约 (10)
              </button>
              <button
                type="button"
                data-testid="cov-scope-sub"
                aria-pressed={covenantScope === 'sub'}
                onClick={() => { setCovenantScope('sub'); setSelectedCovId(SUB_COVENANT_GUIDES[0].id); }}
              >
                附加盟约 (14)
              </button>
              <button
                type="button"
                data-testid="cov-scope-all"
                aria-pressed={covenantScope === 'all'}
                onClick={() => setCovenantScope('all')}
              >
                全部 (24)
              </button>
            </div>

            <button
              type="button"
              data-testid="filter-comp-priority"
              aria-pressed={onlyCurrentCompPriority}
              onClick={() => onChangeOnlyCurrentCompPriority(!onlyCurrentCompPriority)}
              className="d-ind-tab"
            >
              <Sparkles size={13} />仅看当前阵容推荐
            </button>

            <button
              type="button"
              data-testid="filter-favorites-only"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites((f) => !f)}
              className="d-ind-tab"
            >
              <Star size={13} className={onlyFavorites ? 'fill-current' : ''} />
              收藏 ({favoriteCovenantIds.length})
            </button>

            {(onlyCurrentCompPriority || onlyFavorites) && (
              <button
                type="button"
                onClick={() => { onChangeOnlyCurrentCompPriority(false); setOnlyFavorites(false); }}
                className="d-button d-small"
              >
                <RotateCcw size={12} />重置
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="d-button d-small" onClick={() => onOpenImage('/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png', '九大盟约：叠层/过渡/输出终端全景长图')}>
              <Eye size={13} />九大盟约原图
            </button>
            <button type="button" className="d-button d-small" onClick={() => onOpenImage('/assets/aistudio/e778a8ca1370b949f540e862a04df703_f94c3d19.png', '卡西米尔盟约：叠层/过渡/输出终端一图流')}>
              <Eye size={13} />卡西米尔原图
            </button>
            <button type="button" className="d-button d-small" onClick={() => onOpenImage('/assets/aistudio/image_7fa89991.png', '附加盟约全图鉴 I')}>
              <Eye size={13} />附加 I
            </button>
            <button type="button" className="d-button d-small" onClick={() => onOpenImage('/assets/aistudio/image_babfd902.png', '附加盟约全图鉴 II')}>
              <Eye size={13} />附加 II
            </button>
          </div>
        </div>

        {/* 2. Covenant Matrix */}
        {filteredCovenants.length === 0 ? (
          <div className="d-panel p-5 text-center space-y-2">
            <div className="text-sm font-bold text-[#f3f4f6]">当前筛选条件下暂无匹配的盟约</div>
            <button
              type="button"
              onClick={() => { onChangeOnlyCurrentCompPriority(false); setOnlyFavorites(false); }}
              className="d-button d-primary d-small"
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
                  onClick={() => { setSelectedCovId(cov.id); setCategoryFilter('全部'); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedCovId(cov.id);
                      setCategoryFilter('全部');
                    }
                  }}
                  className={`d-ind-card min-w-0 p-2.5 text-left cursor-pointer select-none flex flex-col justify-between${active ? ' is-selected' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`size-7 flex items-center justify-center shrink-0 border ${
                          active
                            ? 'bg-[#0b0c0e] text-[#ffe600] border-[#0b0c0e]'
                            : 'bg-[#0c2226] text-[#00e5ff] border-[#00e5ff55]'
                        }`}
                      >
                        <CovenantEmblemSvg name={cov.name.split(' ')[0].replace('盟约', '')} size={18} />
                      </span>
                      <span className="text-sm leading-[1.35] font-extrabold">{cov.name.split(' ')[0]}</span>
                    </div>

                    <button
                      type="button"
                      data-testid={`fav-cov-${cov.id}`}
                      aria-label={`收藏${cov.name}`}
                      onClick={(e) => { e.stopPropagation(); onToggleFavoriteCovenant(cov.id); }}
                      className={`size-6 shrink-0 inline-flex items-center justify-center ${
                        active ? 'text-[#0b0c0e]' : 'text-[#ffe600]'
                      }`}
                    >
                      <Star className={`size-3.5 ${isFav ? 'fill-current' : 'opacity-45'}`} />
                    </button>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] leading-4 font-semibold">
                    <span className={`px-1.5 py-0.5 ${active ? 'bg-[#0b0c0e22] text-[#0b0c0e]' : 'bg-[#0b0c0e] text-[#9ca3af]'}`}>
                      {cov.difficulty}
                    </span>
                    {isPriority && (
                      <span className={`px-1.5 py-0.5 ${active ? 'bg-[#0b0c0e] text-[#ffe600]' : 'bg-[#26210c] text-[#ffe600] border border-[#ffe60055]'}`}>
                        阵容推荐
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. Active Covenant Details */}
        {activeCov && (
          <div className="d-panel p-3.5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2 border-b border-[#ffffff1a] pb-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-8 bg-[#0c2226] border border-[#00e5ff66] text-[#00e5ff] flex items-center justify-center shrink-0">
                    <CovenantEmblemSvg name={activeCov.name.split(' ')[0].replace('盟约', '')} size={20} />
                  </span>
                  <h2 className="text-base leading-5 font-extrabold text-[#f3f4f6]">{activeCov.name}</h2>
                  <button
                    type="button"
                    onClick={() => onToggleFavoriteCovenant(activeCov.id)}
                    aria-pressed={favoriteCovenantIds.includes(activeCov.id)}
                    className="d-ind-tab"
                  >
                    <Star size={12} className={favoriteCovenantIds.includes(activeCov.id) ? 'fill-current' : ''} />
                    {favoriteCovenantIds.includes(activeCov.id) ? '已收藏' : '收藏盟约'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs leading-4">
                  <span className="px-2 py-0.5 bg-[#26210c] border border-[#ffe60066] font-bold text-[#ffe600]">
                    叠层核心：{activeCov.stackCore}
                  </span>
                  {activeCov.synergySubPacts.map((sub) => (
                    <span key={sub} className="px-1.5 py-0.5 bg-[#1b1e24] border border-[#ffffff1a] font-semibold text-[#e5e7eb]">
                      +{sub}
                    </span>
                  ))}
                </div>
              </div>

              <div className="d-tabs self-start">
                {categories.map((cat) => (
                  <button key={cat} type="button" aria-pressed={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {visibleOperators.map((op) => {
                const badges = extractConciseEffectBadges(op.effect);
                const catStyle = CATEGORY_COLORS[op.category] || 'bg-[#1b1e24] text-[#d1d5db] border-[#ffffff1f]';

                return (
                  <div key={op.name} className="d-ind-card min-w-0 p-2.5 flex items-center gap-2.5">
                    <OperatorAvatar name={op.name} tier={op.tier} size="sm" showName={false} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm leading-5 font-bold text-[#f3f4f6]">{op.name}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] leading-4 font-semibold border whitespace-nowrap shrink-0 ${catStyle}`}>
                          {op.category}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-[11px] leading-4 font-semibold">
                        <span className="px-1.5 py-0.5 bg-[#0b0c0e] border border-[#ffffff14] text-[#d1d5db]">{badges.triggerBadge}</span>
                        <span className="px-1.5 py-0.5 bg-[#26210c] border border-[#ffe60055] text-[#ffe600]">{badges.valueBadge}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-[#ffffff14] text-xs leading-4">
              <span className="px-2 py-0.5 bg-[#ffe600] text-[#0b0c0e] font-extrabold">实战口诀</span>
              {activeCov.proTips.map((tip) => (
                <span key={tip} className="font-medium text-[#e5e7eb] bg-[#0b0c0e] px-2 py-1 border border-[#ffffff14]">
                  {tip}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 4. 13 Universal Stackers */}
        <div className="d-panel p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ffffff1a] pb-2.5">
            <h2 className="text-[14px] leading-5 font-extrabold text-[#f3f4f6] flex items-center gap-1.5">
              <Users size={15} className="text-[#00e5ff]" />
              <span>13 位全阵营通用叠层干员</span>
            </h2>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <div className="relative">
                <Search size={13} className="text-[#9ca3af] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stackerQuery}
                  onChange={(e) => setStackerQuery(e.target.value)}
                  placeholder="搜干员 / 身前 / 整备区…"
                  aria-label="搜索通用叠层干员"
                  className="d-ind-input pl-7 pr-2"
                />
              </div>

              <button type="button" aria-pressed={benchOnly} onClick={() => setBenchOnly((b) => !b)} className="d-ind-tab">
                仅看整备区挂件
              </button>

              <button
                type="button"
                onClick={() => onOpenImage('/assets/aistudio/e88e3dcc6c1b11c17535b2bd941f2bd4_caa476ba.png', '卫戍协议盟约通用叠层干员一图流')}
                className="d-button d-small"
              >
                <Eye size={13} />通用叠层原图
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filteredUniversal.map((st) => (
              <div key={st.id} className="d-ind-card min-w-0 p-2.5 flex items-center gap-2.5">
                <OperatorAvatar name={st.name} tier={st.tier} size="sm" showName={false} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm leading-5 font-bold text-[#f3f4f6]">{st.name}</span>
                    <span className="px-1.5 py-0.5 bg-[#ffe600] text-[#0b0c0e] text-[10px] leading-4 font-extrabold whitespace-nowrap shrink-0">
                      {st.tag}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] leading-4 font-semibold">
                    <span className="px-1.5 py-0.5 bg-[#0c242b] text-[#7cf3ff] border border-[#00e5ff44]">位置：{st.targetZone}</span>
                    <span className="px-1.5 py-0.5 bg-[#0b0c0e] text-[#d1d5db] border border-[#ffffff14]">{st.timing}</span>
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
