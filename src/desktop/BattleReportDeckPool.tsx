import { useMemo, useState } from 'react';
import { AlertTriangle, Layers, Lock, Package, RefreshCw, Search, Sparkles, Star, Store, TrendingUp, Users } from 'lucide-react';
import { REPORT_SEATS, type BattleReport } from './battleReportData';
import { seatDisplayText } from './BattleReportPanels';
import { CompactOperatorBadge } from './BattleReportTelemetry';
import { computeEquipOdds, computeOperatorOdds, computeWishlistSummary } from './deckPoolMath';

const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const;
const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const rollsFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

function fmtPct(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.001) return '<0.1%';
  return `${pctFmt.format(prob * 100)}%`;
}

function ProbGauge({ prob, label, sub }: { prob: number; label: string; sub: string }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, prob)) * circ;
  const color = prob >= 0.45 ? '#34d399' : prob >= 0.2 ? '#ffe600' : prob > 0 ? '#00e5ff' : '#475569';
  return (
    <div className="d-pool-gauge">
      <svg viewBox="0 0 76 76" className="d-pool-gauge-svg" role="img" aria-label={`${label} ${fmtPct(prob)}`}>
        <circle cx="38" cy="38" r={r} fill="none" stroke="#18202c" strokeWidth="8" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="butt"
          transform="rotate(-90 38 38)"
        />
        <text x="38" y="37" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="700" fontFamily="Consolas, monospace">
          {fmtPct(prob)}
        </text>
        <text x="38" y="49" textAnchor="middle" fill="#94a3b8" fontSize="8">
          {sub}
        </text>
      </svg>
      <span className="d-pool-gauge-label">{label}</span>
    </div>
  );
}

export function BattleReportDeckPool({
  report,
  suggestedOperatorNames = [],
  suggestedEquipNames = [],
  compTitle = '',
}: {
  report?: BattleReport;
  suggestedOperatorNames?: string[];
  suggestedEquipNames?: string[];
  compTitle?: string;
}) {
  const pool = report?.deckPool ?? null;
  const selfSeat = report?.self ?? (pool?.isSingle ? 1 : null);
  const liveShopLevel = (selfSeat !== null ? report?.lineups[selfSeat]?.shopLevel : null)
    ?? Object.values(report?.lineups ?? {}).find(l => l.shopLevel)?.shopLevel
    ?? 1;

  const [manualLevel, setManualLevel] = useState<number | null>(null);
  const [wishChars, setWishChars] = useState<string[]>([]);
  const [wishTraps, setWishTraps] = useState<string[]>([]);
  const [browseTab, setBrowseTab] = useState<'operators' | 'equips'>('operators');
  const [tierFilter, setTierFilter] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');

  const shopLevel = manualLevel ?? liveShopLevel;
  const wishCharSet = useMemo(() => new Set(wishChars), [wishChars]);
  const wishTrapSet = useMemo(() => new Set(wishTraps), [wishTraps]);

  const summary = useMemo(
    () => (pool ? computeWishlistSummary(pool, shopLevel, wishCharSet, wishTrapSet) : null),
    [pool, shopLevel, wishCharSet, wishTrapSet],
  );

  if (!report || !pool || !summary) {
    return (
      <section className="d-tele-empty">
        <Layers size={20} />
        <div>
          <h3>等待本局牌库数据同步</h3>
          <p>
            进入卫戍协议对局并收到开局场景帧后，本页会自动同步本局全部未受限干员与装备牌池、实时扣除存活玩家的普通/进阶占卡数，并按你的当前本数与心仪目标动态计算刷新出货概率。
          </p>
        </div>
      </section>
    );
  }

  const toggleWishChar = (charId: string) =>
    setWishChars(prev => (prev.includes(charId) ? prev.filter(id => id !== charId) : [...prev, charId]));
  const toggleWishTrap = (trapId: string) =>
    setWishTraps(prev => (prev.includes(trapId) ? prev.filter(id => id !== trapId) : [...prev, trapId]));

  const importSuggestedTargets = () => {
    const matchedChars = pool.operators
      .filter(op => suggestedOperatorNames.some(n => op.name === n || n.includes(op.name)))
      .map(op => op.charId);
    const matchedTraps = pool.equips
      .filter(eq => suggestedEquipNames.some(n => eq.name === n || n.includes(eq.name)))
      .map(eq => eq.trapId);
    if (matchedChars.length) setWishChars(prev => [...new Set([...prev, ...matchedChars])]);
    if (matchedTraps.length) setWishTraps(prev => [...new Set([...prev, ...matchedTraps])]);
  };

  const canImportSuggested = Boolean(
    suggestedOperatorNames.some(n => pool.operators.some(op => op.name === n || n.includes(op.name)))
    || suggestedEquipNames.some(n => pool.equips.some(eq => eq.name === n || n.includes(eq.name))),
  );

  const kw = query.trim().toLowerCase();
  const filteredOperators = pool.operators.filter(op =>
    (tierFilter === 'all' || op.tier === tierFilter)
    && (!kw || op.name.toLowerCase().includes(kw) || op.covenants.some(c => c.toLowerCase().includes(kw))),
  );
  const filteredEquips = pool.equips.filter(eq =>
    (tierFilter === 'all' || eq.tier === tierFilter)
    && (!kw || eq.name.toLowerCase().includes(kw)),
  );

  const maxTierCopies = Math.max(1, ...pool.tierSummary.map(t => t.totalCopies));
  const selfShopGoods = (selfSeat !== null ? report.lineups[selfSeat]?.shopGoods : undefined) ?? [];

  const compareDiff = summary.nextLevelAnyWishPerRoll !== null
    ? summary.nextLevelAnyWishPerRoll - summary.anyWishOperatorPerRoll
    : null;
  const compareMax = Math.max(0.05, summary.anyWishOperatorPerRoll, summary.nextLevelAnyWishPerRoll ?? 0);

  return (
    <div className="d-pool-shell">
      {/* 1. Top Control Strip: Live Shop Level + Sandbox Switcher + Import Comp */}
      <header className="d-pool-toolbar">
        <div className="d-pool-level-bar">
          <span className="d-pool-mode-pill">
            <Layers size={13} />
            {pool.isSingle ? '单人牌池' : '四人共享牌池'}
          </span>
          <div className="d-pool-tiers" role="group" aria-label="选择商店本数进行概率推演">
            {[1, 2, 3, 4, 5, 6].map(lv => (
              <button
                key={lv}
                type="button"
                aria-pressed={shopLevel === lv}
                data-live={liveShopLevel === lv}
                onClick={() => setManualLevel(lv === liveShopLevel ? null : lv)}
                title={liveShopLevel === lv ? `实局当前 ${lv} 本` : `模拟推演升至 ${lv} 本后的概率`}
              >
                {lv}本{liveShopLevel === lv ? '·实' : ''}
              </button>
            ))}
          </div>
          {manualLevel !== null && (
            <button type="button" className="d-button d-small" onClick={() => setManualLevel(null)}>
              <RefreshCw size={11} />同步实局({liveShopLevel}本)
            </button>
          )}
        </div>

        <div className="d-pool-actions">
          <span className="d-pool-slot-meta">
            单刷 <b>{summary.charSlots}</b> 干员 + <b>{summary.itemSlots}</b> 装备 · 可刷池 <b>{summary.availablePoolCopies}</b> 张
          </span>
          {canImportSuggested && (
            <button
              type="button"
              className="d-button d-small d-primary"
              onClick={importSuggestedTargets}
              title={compTitle ? `一键将「${compTitle}」核心干员与装备加入心仪追踪` : '导入当前跟打阵容核心'}
            >
              <Sparkles size={12} />导入当前阵容核心
            </button>
          )}
          {(wishChars.length > 0 || wishTraps.length > 0) && (
            <button
              type="button"
              className="d-button d-small"
              onClick={() => { setWishChars([]); setWishTraps([]); }}
            >
              清空心仪 ({wishChars.length + wishTraps.length})
            </button>
          )}
        </div>
      </header>

      {/* 2. Dual Visual Dashboard: Wishlist Probability Gauge + Current vs Next Level + Tier Compression Chart */}
      <div className="d-pool-dashboard">
        <section className="d-chart-card d-pool-prob-panel" aria-label="心仪抽取概率仪表盘">
          <header className="d-chart-head">
            <span><TrendingUp size={13} />心仪抽取概率 · {shopLevel}本 ({summary.charSlots}格)</span>
            <small>按剩余牌池无放回抽样实时估算</small>
          </header>

          {wishChars.length === 0 && wishTraps.length === 0 ? (
            <div className="d-pool-empty-wish">
              <Star size={16} />
              <span>点击下方牌池中的任意干员或装备收藏为<strong>「心仪目标」</strong>，实时计算单刷概率、期望花费资金与升本收益对比。</span>
            </div>
          ) : (
            <div className="d-pool-prob-body">
              <ProbGauge prob={summary.anyWishOperatorPerRoll} label="任一心仪干员" sub="单次刷新" />
              <div className="d-pool-prob-metrics">
                <div>
                  <small>5 次刷新出货率</small>
                  <b className="is-cyan">{fmtPct(summary.anyWishOperatorFiveRolls)}</b>
                </div>
                <div>
                  <small>期望刷出花费</small>
                  <b className="is-gold">
                    {summary.anyWishOperatorExpectedRolls !== null
                      ? `${rollsFmt.format(summary.anyWishOperatorExpectedRolls)} 资金`
                      : '池不可出'}
                  </b>
                </div>
                <div>
                  <small>心仪池内余量</small>
                  <b>{summary.wishlistOperatorRemaining} 张</b>
                </div>
                {wishTraps.length > 0 && (
                  <div>
                    <small>心仪装备单刷</small>
                    <b className="is-green">{fmtPct(summary.anyWishEquipPerRoll)}</b>
                  </div>
                )}
              </div>

              {summary.nextLevelShopLevel !== null && summary.nextLevelAnyWishPerRoll !== null && (
                <div className="d-pool-compare" aria-label="当前本与升一本概率对比">
                  <div className="d-pool-compare-head">
                    <span>当前 {shopLevel} 本 vs 升 {summary.nextLevelShopLevel} 本</span>
                    <b data-positive={(compareDiff ?? 0) > 0.005} data-negative={(compareDiff ?? 0) < -0.005}>
                      {compareDiff !== null
                        ? compareDiff > 0.005
                          ? `+${pctFmt.format(compareDiff * 100)}% · 建议升本`
                          : compareDiff < -0.005
                            ? `${pctFmt.format(compareDiff * 100)}% · 建议当前本搜`
                            : '基本持平'
                        : '—'}
                    </b>
                  </div>
                  <div className="d-pool-compare-bars">
                    <div className="d-pool-cmp-row">
                      <small>{shopLevel}本</small>
                      <span className="d-bar-track"><i className="is-out" style={{ width: `${Math.max(4, (summary.anyWishOperatorPerRoll / compareMax) * 100)}%` }} /></span>
                      <b>{fmtPct(summary.anyWishOperatorPerRoll)}</b>
                    </div>
                    <div className="d-pool-cmp-row">
                      <small>{summary.nextLevelShopLevel}本</small>
                      <span className="d-bar-track"><i className="is-in" style={{ width: `${Math.max(4, (summary.nextLevelAnyWishPerRoll / compareMax) * 100)}%` }} /></span>
                      <b>{fmtPct(summary.nextLevelAnyWishPerRoll)}</b>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Tier Pool Distribution & Compression Stacked Bar Chart */}
        <section className="d-chart-card d-pool-tier-chart" aria-label="各阶牌池余量与消耗分布">
          <header className="d-chart-head">
            <span><Users size={13} />各阶干员池余量分布</span>
            <div className="d-round-trend-legend">
              <span><i className="is-rem" />池中剩余</span>
              <span><i className="is-taken" />已抽走</span>
            </div>
          </header>
          <div className="d-tier-bars-grid">
            {pool.tierSummary.map(ts => {
              const unlocked = ts.tier <= shopLevel;
              const remH = ts.totalCopies > 0 ? Math.max(4, Math.round((ts.remainingCopies / maxTierCopies) * 64)) : 0;
              const takenH = ts.takenCopies > 0 ? Math.max(4, Math.round((ts.takenCopies / maxTierCopies) * 64)) : 0;
              return (
                <button
                  key={ts.tier}
                  type="button"
                  className="d-tier-col"
                  data-locked={!unlocked}
                  data-active={tierFilter === ts.tier}
                  onClick={() => setTierFilter(prev => (prev === ts.tier ? 'all' : ts.tier))}
                  title={`${TIER_ROMAN[ts.tier]} 阶（${ts.tier}本）· ${ts.operatorKinds} 名干员 · 剩余 ${ts.remainingCopies}/${ts.totalCopies} 张（已抽 ${ts.takenCopies}）· ${ts.equipKinds} 种装备`}
                >
                  <small className="d-tier-col-num">{ts.remainingCopies}</small>
                  <span className="d-tier-stack">
                    {takenH > 0 && <i className="is-taken" style={{ height: `${takenH}px` }} />}
                    {remH > 0 && <i className="is-rem" style={{ height: `${remH}px` }} />}
                  </span>
                  <span className="d-tier-col-label">
                    {!unlocked && <Lock size={9} />}
                    {TIER_ROMAN[ts.tier]}本
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Current Self Shop Shelf Preview (when available) */}
      {selfShopGoods.length > 0 && (
        <section className="d-pool-shelf" aria-label="当前商店货架在售">
          <span className="d-pool-shelf-label"><Store size={13} />当前货架</span>
          <div className="d-pool-shelf-items">
            {selfShopGoods.map(g => {
              const isWished = (g.charId && wishCharSet.has(g.charId)) || (g.trapId && wishTrapSet.has(g.trapId));
              return (
                <span key={`${g.slot}-${g.name}`} className={`d-shelf-chip${isWished ? ' is-wished' : ''}`}>
                  {g.kind === 'operator' ? <CompactOperatorBadge name={g.name} size={18} /> : <Package size={13} />}
                  <b>{g.name}</b>
                  <small>{g.price}金{g.frozen ? ' · 冻' : ''}</small>
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Wishlisted Operators & Equips Detailed Tracker */}
      {(summary.operatorOdds.length > 0 || summary.equipOdds.length > 0) && (
        <section className="d-pool-wishlist" aria-label="心仪目标实时概率追踪">
          <header className="d-tele-subhead">
            <span><Star size={13} />心仪目标实时追踪（{summary.operatorOdds.length} 干员 · {summary.equipOdds.length} 装备）</span>
            <small>自动扣除存活队友已持张数（金卡按 3 张计，阵亡队友自动回池）</small>
          </header>

          <div className="d-wish-cards">
            {summary.operatorOdds.map(item => {
              const op = item.operator;
              const selfCount = selfSeat !== null ? (op.takenBy[selfSeat] ?? 0) : 0;
              const peerEntries = REPORT_SEATS
                .filter(s => s !== selfSeat && (op.takenBy[s] ?? 0) > 0)
                .map(s => ({ seat: s, count: op.takenBy[s]! }));
              const peerTotal = peerEntries.reduce((s, p) => s + p.count, 0);
              const cap = Math.max(1, op.totalCopies);
              const selfW = (Math.min(cap, selfCount) / cap) * 100;
              const peerW = (Math.min(cap - Math.min(cap, selfCount), peerTotal) / cap) * 100;
              const remW = (op.remaining / cap) * 100;
              const inMyShop = selfSeat !== null && op.inShopSeats.includes(selfSeat);

              return (
                <article key={op.charId} className="d-wish-card" data-status={item.status}>
                  <div className="d-wish-top">
                    <CompactOperatorBadge name={op.name} size={28} />
                    <div className="d-wish-ident">
                      <strong>
                        {op.name}
                        <span className={`d-tier-tag t-${op.tier}`}>{TIER_ROMAN[op.tier]}</span>
                        {inMyShop && <span className="d-shelf-hit">货架在售</span>}
                      </strong>
                      <small>
                        剩 <b>{op.remaining}</b>/{op.totalCopies}
                        {selfCount > 0 ? ` · 我拿${selfCount}` : ''}
                        {peerTotal > 0
                          ? ` · 队友${peerTotal}（${peerEntries.map(p => `${seatDisplayText(p.seat, report).slice(0, 4)}×${p.count}`).join(' ')}）`
                          : ''}
                      </small>
                    </div>
                    <div className="d-wish-odds">
                      {item.unlocked ? (
                        <>
                          <b className={item.status === 'empty' ? 'is-loss' : 'is-gold'}>{fmtPct(item.perRollProb)}</b>
                          <small>
                            {item.expectedRolls !== null ? `均 ${rollsFmt.format(item.expectedRolls)} 刷` : '池已抽空'}
                          </small>
                        </>
                      ) : (
                        <>
                          <b className="is-locked"><Lock size={11} />{op.tier}本解锁</b>
                          <small>
                            {item.nextTierRollProb !== null ? `升${op.tier}本 ${fmtPct(item.nextTierRollProb)}` : ''}
                          </small>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className="d-wish-star is-active"
                      aria-label={`取消收藏 ${op.name}`}
                      onClick={() => toggleWishChar(op.charId)}
                    >
                      <Star size={14} fill="currentColor" />
                    </button>
                  </div>

                  {/* 3-Segment Shared Pool Copy Bar: Self (Gold) | Peers (Pink) | Remaining (Cyan) */}
                  <div className="d-copy-bar" title={`我持有 ${selfCount} · 队友持有 ${peerTotal} · 池中剩余 ${op.remaining}/${op.totalCopies}`}>
                    {selfW > 0 && <i className="is-self" style={{ width: `${selfW}%` }} />}
                    {peerW > 0 && <i className="is-peer" style={{ width: `${peerW}%` }} />}
                    {remW > 0 && <i className="is-rem" style={{ width: `${remW}%` }} />}
                  </div>

                  <div className="d-wish-foot">
                    {(item.status === 'empty' || op.remaining <= 0) && (
                      <span className="d-pool-warn"><AlertTriangle size={11} />共享池已空（全队已拿满）</span>
                    )}
                    {item.status === 'scarce' && op.remaining > 0 && (
                      <span className="d-pool-caution"><AlertTriangle size={11} />牌池告急，注意防队友抢完</span>
                    )}
                    {item.unlocked && op.remaining > 0 && (
                      <span>5刷 {fmtPct(item.fiveRollProb)} · 10刷 {fmtPct(item.tenRollProb)}</span>
                    )}
                    {item.tripleDiscoverProb !== null && (
                      <span className="d-discover-hint">三连升阶三选一：{fmtPct(item.tripleDiscoverProb)}</span>
                    )}
                  </div>
                </article>
              );
            })}

            {summary.equipOdds.map(item => {
              const eq = item.equip;
              const inMyShop = selfSeat !== null && eq.inShopSeats.includes(selfSeat);
              return (
                <article key={eq.trapId} className="d-wish-card is-equip" data-status={item.unlocked ? 'healthy' : 'locked'}>
                  <div className="d-wish-top">
                    <span className="d-equip-icon"><Package size={16} /></span>
                    <div className="d-wish-ident">
                      <strong>
                        {eq.name}
                        <span className={`d-tier-tag t-${eq.tier}`}>{TIER_ROMAN[eq.tier]}</span>
                        {inMyShop && <span className="d-shelf-hit">货架在售</span>}
                      </strong>
                      <small>
                        全队已持 {eq.takenTotal} 件 · {item.unlocked ? `当前 ${summary.availableEquipKinds} 种装备池` : `需升至 ${eq.tier} 本`}
                      </small>
                    </div>
                    <div className="d-wish-odds">
                      {item.unlocked ? (
                        <>
                          <b className="is-green">{fmtPct(item.perRollProb)}</b>
                          <small>{item.expectedRolls !== null ? `均 ${rollsFmt.format(item.expectedRolls)} 刷` : '—'}</small>
                        </>
                      ) : (
                        <b className="is-locked"><Lock size={11} />{eq.tier}本解锁</b>
                      )}
                    </div>
                    <button
                      type="button"
                      className="d-wish-star is-active"
                      aria-label={`取消收藏 ${eq.name}`}
                      onClick={() => toggleWishTrap(eq.trapId)}
                    >
                      <Star size={14} fill="currentColor" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Full Match Deck Pool Browser (Operators / Equips) */}
      <section className="d-pool-browser" aria-label="当局可用牌池浏览器">
        <div className="d-pool-browser-head">
          <div className="d-tele-seg-btns" role="group" aria-label="牌池类型">
            <button type="button" aria-pressed={browseTab === 'operators'} onClick={() => setBrowseTab('operators')}>
              干员牌池 ({pool.operators.length})
            </button>
            <button type="button" aria-pressed={browseTab === 'equips'} onClick={() => setBrowseTab('equips')}>
              装备牌池 ({pool.equips.length})
            </button>
          </div>

          <div className="d-pool-tier-pills" role="group" aria-label="按等阶筛选">
            <button type="button" aria-pressed={tierFilter === 'all'} onClick={() => setTierFilter('all')}>全部</button>
            {[1, 2, 3, 4, 5, 6].map(t => (
              <button key={t} type="button" aria-pressed={tierFilter === t} onClick={() => setTierFilter(t)}>
                {TIER_ROMAN[t]}
              </button>
            ))}
          </div>

          <label className="d-pool-search">
            <Search size={13} />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={browseTab === 'operators' ? '搜干员 / 盟约…' : '搜装备名称…'}
            />
          </label>
        </div>

        {browseTab === 'operators' ? (
          <div className="d-pool-grid">
            {filteredOperators.map(op => {
              const wished = wishCharSet.has(op.charId);
              const odds = computeOperatorOdds(pool, op, shopLevel);
              const remPct = op.totalCopies > 0 ? (op.remaining / op.totalCopies) * 100 : 0;
              return (
                <button
                  key={op.charId}
                  type="button"
                  className="d-pool-card"
                  data-wished={wished}
                  data-status={odds.status}
                  onClick={() => toggleWishChar(op.charId)}
                  title={`${op.name}（${TIER_ROMAN[op.tier]}阶）· 剩余 ${op.remaining}/${op.totalCopies} 张 · 单刷 ${fmtPct(odds.perRollProb)} · 点击收藏为心仪目标`}
                >
                  <CompactOperatorBadge name={op.name} size={26} />
                  <div className="d-pool-card-info">
                    <div className="d-pool-card-top">
                      <strong>{op.name}</strong>
                      <span className={`d-tier-tag t-${op.tier}`}>{TIER_ROMAN[op.tier]}</span>
                    </div>
                    <div className="d-pool-card-bar">
                      <span className="d-micro-track"><i className={odds.status === 'scarce' || odds.status === 'empty' ? 'is-leak' : 'is-help'} style={{ width: `${remPct}%` }} /></span>
                      <small>{op.remaining}/{op.totalCopies}</small>
                    </div>
                    <div className="d-pool-card-foot">
                      <span>{odds.unlocked ? `单刷 ${fmtPct(odds.perRollProb)}` : `${op.tier}本解锁`}</span>
                      {op.takenTotal > 0 && <small>已拿 {op.takenTotal}</small>}
                    </div>
                  </div>
                  <Star size={13} className="d-card-star" fill={wished ? 'currentColor' : 'none'} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="d-pool-grid">
            {filteredEquips.map(eq => {
              const wished = wishTrapSet.has(eq.trapId);
              const odds = computeEquipOdds(pool, eq, shopLevel);
              return (
                <button
                  key={eq.trapId}
                  type="button"
                  className="d-pool-card"
                  data-wished={wished}
                  data-status={odds.unlocked ? 'healthy' : 'locked'}
                  onClick={() => toggleWishTrap(eq.trapId)}
                  title={`${eq.name}（${TIER_ROMAN[eq.tier]}阶装备）· 全队已持 ${eq.takenTotal} 件 · 单刷 ${fmtPct(odds.perRollProb)} · 点击收藏为心仪装备`}
                >
                  <span className="d-equip-icon is-sm"><Package size={14} /></span>
                  <div className="d-pool-card-info">
                    <div className="d-pool-card-top">
                      <strong>{eq.name}</strong>
                      <span className={`d-tier-tag t-${eq.tier}`}>{TIER_ROMAN[eq.tier]}</span>
                    </div>
                    <div className="d-pool-card-foot">
                      <span>{odds.unlocked ? `单刷 ${fmtPct(odds.perRollProb)}` : `${eq.tier}本解锁`}</span>
                      {eq.takenTotal > 0 && <small>已持 {eq.takenTotal}</small>}
                    </div>
                  </div>
                  <Star size={13} className="d-card-star" fill={wished ? 'currentColor' : 'none'} />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
