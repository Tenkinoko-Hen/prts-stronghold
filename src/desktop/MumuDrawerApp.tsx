// 青逝痕 Tenkinoko 制作
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  ChevronRight,
  Compass,
  Crosshair,
  FileDown,
  Layers,
  LayoutDashboard,
  Maximize2,
  PanelTopClose,
  Pin,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { DerivedText } from '../components/DerivedText';
import { loadoutSummary } from '../components/guidePresentation';
import { OperatorAvatar } from '../components/OperatorAvatar';
import {
  ALL_CORE_COVENANT_NAMES,
  ALL_SUB_COVENANT_NAMES,
  META_COMPS,
} from '../data/strongholdData';
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import { isCorrection, mentionedOperators } from '../mobile/guideContent';
import {
  getRecommendedPaceForRound,
  rankCompsByBanState,
  type BanPickState,
} from '../utils/tacticalLogic';
import type { BattleBanSyncState } from './battleBanSync';
import {
  defaultBossRound,
  REPORT_ROUNDS,
  type PreviewRoundFilter,
} from './battleReportData';
import { BattleReportDeckPool, buildDeckMatchKey, readPersistedWishlist, WISHLIST_STORAGE_PREFIX } from './BattleReportDeckPool';
import { isCombatRound, summarizeBattleReport, type ReportSummary } from './battleReportExport';
import { BattleReportExportDialog } from './BattleReportExportDialog';
import { BossDamage } from './BattleReportPanels';
import { RoundMatrix } from './BattleReportRounds';
import { EnemyAvatar, SpawnPreview } from './BattleReportSpawns';
import { BattleReportTelemetry, CompactOperatorBadge } from './BattleReportTelemetry';
import { SeatTelemetryStrip } from './SeatTelemetryStrip';
import {
  reportWithPlayerNames,
  type BattleReportsBridge,
  type ClientSource,
  type HudOverlayState,
  type MumuWindowBounds,
  type NpcapInstallState,
  type ReportRecords,
  type ReportSeat,
  type ReportStatus,
} from './battleReports';
import { isSoloMode, type DeckPoolOperator } from './combatTelemetry';
import { computeOperatorOdds } from './deckPoolMath';
import { NpcapSetupBanner } from './NpcapSetupBanner';
import './desktop.css';
import './battleReports.css';
import './mumuDrawer.css';

type DrawerTab = 'overview' | 'guide' | 'deck' | 'report';
type ReportSubTab = 'rounds' | 'boss' | 'telemetry' | 'preview';

const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

function fmtPct(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.001) return '<0.1%';
  return `${pctFmt.format(prob * 100)}%`;
}

function normalizeOpName(raw: string): string {
  const resolved = resolveOperatorAvatars(raw);
  if (resolved[0]?.cleanName) return resolved[0].cleanName;
  return raw.replace(/["“”'‘’「」『』]/g, '').trim();
}

export interface MumuDrawerAppProps {
  records: ReportRecords;
  reportStatus: ReportStatus;
  failureReason?: string;
  restarting?: boolean;
  clientSource: ClientSource;
  mumuWindow?: MumuWindowBounds | null;
  placement?: 'outside-right' | 'inside-right' | 'screen-right' | null;
  npcapInstalled?: boolean;
  npcapInstall?: NpcapInstallState;
  reportsApi?: BattleReportsBridge;
  banState: BanPickState;
  onChangeBanState: React.Dispatch<React.SetStateAction<BanPickState>>;
  banSync: BattleBanSyncState;
  onResyncBans(): void;
  onScanWindow?(): void;
  onClearBans(): Promise<void>;
  selectedCompId: string;
  onSelectCompId(id: string): void;
  currentRound: number;
  autoFollowRound: boolean;
  onToggleAutoFollow(): void;
  onChangeRound(round: number): void;
  hudState: HudOverlayState | null;
  alwaysOnTop?: boolean;
  pinPending?: boolean;
  onToggleAlwaysOnTop?(): void;
  onSnapMumu?(): void;
  onExpandWide?(): void;
  onCollapseToHud?(): void;
  onShowDiagnostics?(): void;
}

export default function MumuDrawerApp({
  records,
  reportStatus,
  failureReason,
  restarting,
  clientSource,
  placement,
  npcapInstalled,
  npcapInstall,
  reportsApi,
  banState,
  onChangeBanState,
  banSync,
  onResyncBans,
  onScanWindow,
  onClearBans,
  selectedCompId,
  onSelectCompId,
  currentRound,
  autoFollowRound,
  onToggleAutoFollow,
  onChangeRound,
  hudState,
  alwaysOnTop = false,
  pinPending = false,
  onToggleAlwaysOnTop,
  onSnapMumu,
  onExpandWide,
  onCollapseToHud,
  onShowDiagnostics,
}: MumuDrawerAppProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('rounds');
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [perspective, setPerspective] = useState<{ key: string; seat: ReportSeat } | null>(null);
  const [bossFilter, setBossFilter] = useState<{ key: string; round: number } | null>(null);
  const [previewFilter, setPreviewFilter] = useState<{ key: string; round: PreviewRoundFilter } | null>(null);
  const [exported, setExported] = useState<ReportSummary | null>(null);
  const [phaseOverride, setPhaseOverride] = useState<number | null>(null);
  const [wishTick, setWishTick] = useState(0);
  const prevLiveKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const prevKey = prevLiveKeyRef.current;
    const nextKey = records.live?.key;
    if (prevKey && !nextKey) {
      setOpenedKey(current => (current === null || current === prevKey ? prevKey : current));
    } else if (!prevKey && nextKey) {
      setOpenedKey(null);
    } else if (prevKey && nextKey && prevKey !== nextKey) {
      setOpenedKey(null);
    }
    prevLiveKeyRef.current = nextKey;
  }, [records.live?.key]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (!ev.key || ev.key.startsWith(WISHLIST_STORAGE_PREFIX)) {
        setWishTick(t => t + 1);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') {
      setWishTick(t => t + 1);
    }
  }, [activeTab]);

  useEffect(() => {
    setPhaseOverride(null);
  }, [selectedCompId, currentRound]);

  const opened = openedKey === records.live?.key ? records.live : records.history.find(item => item.key === openedKey);
  const entry = opened ?? records.live ?? records.history[0];
  const report = entry ? reportWithPlayerNames(entry) : undefined;
  const entryKey = entry?.key ?? '';
  const replay = Boolean(entry && entry.key !== records.live?.key);
  const liveView = reportStatus === 'listening' && Boolean(records.live && entry?.key === records.live.key);
  const solo = isSoloMode(report?.mode);
  const selfSeat = report?.self ?? (solo ? 1 : null);
  const seat = perspective?.key === entryKey ? perspective.seat : report?.self ?? null;
  const liveRound = report?.current || report?.rounds.at(-1)?.number || null;
  const liveShopLevel = (seat !== null ? report?.lineups[seat]?.shopLevel : undefined)
    ?? (selfSeat !== null ? report?.lineups[selfSeat]?.shopLevel : undefined)
    ?? Object.values(report?.lineups ?? {}).find(l => l.shopLevel)?.shopLevel
    ?? 1;

  const evaluations = useMemo(() => rankCompsByBanState(META_COMPS, banState), [banState]);
  const activeEval = evaluations.find(ev => ev.comp.id === selectedCompId) || evaluations[0];
  const activeComp = activeEval.comp;
  const pace = useMemo(() => getRecommendedPaceForRound(activeComp, currentRound), [activeComp, currentRound]);
  const automaticPhaseIdx = Math.max(0, activeComp.phases.findIndex(p => p.phaseName === pace.activePhaseName));
  const phaseIndex = phaseOverride ?? automaticPhaseIdx;
  const activePhase = activeComp.phases[phaseIndex] || activeComp.phases[0];
  const paceActionText = pace.currentAction || activeComp.strategistTip;
  const focusedOps = phaseOverride === null ? mentionedOperators(paceActionText) : [];

  const suggestedOperatorNames = useMemo(
    () => [
      ...new Set(
        activeComp.phases.flatMap(p => [
          ...p.fieldOperators.map(o => o.name),
          ...p.benchOperators.map(o => o.name),
        ]),
      ),
    ],
    [activeComp],
  );

  const matchKey = buildDeckMatchKey(report ?? null);
  const { trackedOps, trackedSource } = useMemo<{
    trackedOps: DeckPoolOperator[];
    trackedSource: 'wishlist' | 'comp' | 'hot';
  }>(() => {
    const pool = report?.deckPool;
    if (!pool || pool.operators.length === 0) {
      return { trackedOps: [], trackedSource: 'hot' };
    }
    const saved = readPersistedWishlist(matchKey, wishTick >= 0);
    if (saved.chars.length > 0) {
      const charSet = new Set(saved.chars);
      const matched = pool.operators.filter(o => charSet.has(o.charId));
      if (matched.length > 0) {
        return { trackedOps: matched.slice(0, 6), trackedSource: 'wishlist' };
      }
    }
    if (suggestedOperatorNames.length > 0) {
      const matched: DeckPoolOperator[] = [];
      const seen = new Set<string>();
      for (const raw of suggestedOperatorNames) {
        const clean = normalizeOpName(raw);
        if (!clean) continue;
        const found = pool.operators.find(o => !seen.has(o.charId) && (o.name === raw || normalizeOpName(o.name) === clean));
        if (found) {
          seen.add(found.charId);
          matched.push(found);
        }
      }
      if (matched.length > 0) {
        return { trackedOps: matched.slice(0, 6), trackedSource: 'comp' };
      }
    }
    const hot = [...pool.operators]
      .sort((a, b) => {
        const aShop = selfSeat !== null && a.inShopSeats.includes(selfSeat) ? 1 : 0;
        const bShop = selfSeat !== null && b.inShopSeats.includes(selfSeat) ? 1 : 0;
        if (aShop !== bShop) return bShop - aShop;
        const aOpen = a.tier <= liveShopLevel ? 1 : 0;
        const bOpen = b.tier <= liveShopLevel ? 1 : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;
        return b.tier - a.tier || b.takenTotal - a.takenTotal;
      })
      .slice(0, 5);
    return { trackedOps: hot, trackedSource: 'hot' };
  }, [liveShopLevel, matchKey, report?.deckPool, selfSeat, suggestedOperatorNames, wishTick]);

  const waveWarning = useMemo(() => {
    type WaveItem = { id: string; name: string; count: number | null; boss?: true };
    if (!report || report.preview.length === 0) return null;
    const planRows = report.preview.filter(p => p.kind === 'plan');
    const sourceRows = planRows.length > 0 ? planRows : report.preview;
    const byRound = new Map<number, Map<string, WaveItem>>();
    for (const sp of sourceRows) {
      const bucket = byRound.get(sp.round) ?? new Map<string, WaveItem>();
      const k = `${sp.boss ? '1' : '0'}:${sp.id}:${sp.name}`;
      const prev = bucket.get(k);
      if (!prev) bucket.set(k, { id: sp.id, name: sp.name, count: sp.count, boss: sp.boss });
      else if (sp.count !== null) prev.count = (prev.count ?? 0) + sp.count;
      byRound.set(sp.round, bucket);
    }
    const allWaveRounds = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, m]) => ({
        round: r,
        items: [...m.values()].sort(
          (a, b) => Number(Boolean(b.boss)) - Number(Boolean(a.boss)) || (b.count ?? 0) - (a.count ?? 0),
        ),
      }));
    const refRound = liveRound ?? currentRound;
    const curRoundObj = report.rounds.find(r => r.number === refRound);
    const settled = curRoundObj?.phase === 'settle' || curRoundObj?.phase === 'end';
    const targetRound = settled && refRound < 15 && byRound.has(refRound + 1)
      ? refRound + 1
      : byRound.has(refRound)
        ? refRound
        : (allWaveRounds.find(w => w.round >= refRound)?.round ?? allWaveRounds[0]?.round ?? refRound);
    const upcoming = allWaveRounds.filter(w => w.round >= targetRound).slice(0, 2);
    const waves = upcoming.length > 0 ? upcoming : allWaveRounds.slice(-2);
    return {
      waves,
      totalWaves: allWaveRounds.length,
    };
  }, [currentRound, liveRound, report]);

  const canExport = Boolean(report && (report.rounds.some(isCombatRound) || (report.telemetry?.operators.length ?? 0) > 0));
  const bossNumber = bossFilter?.key === entryKey ? bossFilter.round : defaultBossRound(report);
  const previewRound = previewFilter?.key === entryKey ? previewFilter.round : replay ? 'all' : 'follow';

  const topRoundLabel = report
    ? `R${liveRound ?? currentRound} · ${liveShopLevel}本`
    : 'MuMu 待进局';

  const footerTone = npcapInstalled === false || restarting || reportStatus === 'failed' || reportStatus === 'permission'
    ? 'warn'
    : clientSource === 'mumu' && reportStatus === 'listening'
      ? 'live'
      : 'idle';
  const footerText = npcapInstalled === false
    ? '待装 Npcap（仅采基础结算）'
    : restarting
      ? (failureReason || '采集自动重连中…')
      : reportStatus === 'failed'
        ? '采集中断（不影响游戏）'
        : clientSource === 'mumu'
          ? (reportStatus === 'listening' ? 'MuMu 监听中' : reportStatus === 'permission' ? '需管理员权限' : 'MuMu 待进局')
          : reportStatus === 'listening'
            ? '协议监听中'
            : '待进局';

  const toggleBanCovenant = (name: string) => {
    onChangeBanState(prev => ({
      ...prev,
      bannedCovenants: prev.bannedCovenants.includes(name)
        ? prev.bannedCovenants.filter(item => item !== name)
        : [...prev.bannedCovenants, name],
    }));
  };

  const toggleHudClickThrough = async () => {
    const hudApi = window.electronAPI?.hud;
    if (!hudApi) return;
    if (!hudState?.open) {
      await hudApi.setOpen(true);
      await hudApi.setLocked(true);
    } else {
      await hudApi.setLocked(!hudState.locked);
    }
  };

  return (
    <div className="mumu-drawer desktop-app" data-placement={placement || 'screen-right'}>
      {/* 1. 38px Top Bar */}
      <header className="mumu-topbar">
        <div className="mumu-topbar-left">
          <span className="mumu-brand-chip">{PRODUCT_BRAND.shortName}</span>
          <span
            className="mumu-source-pill"
            data-mumu={clientSource === 'mumu'}
            data-live={liveView}
            title={placement === 'inside-right' ? '右侧空间不足，已叠放至 MuMu 内侧最右' : '已吸附 MuMu 窗口'}
          >
            <span className="mumu-dot" aria-hidden="true" />
            <span>{topRoundLabel}</span>
          </span>
        </div>

        <div className="mumu-top-actions">
          {onToggleAlwaysOnTop && (
            <button
              type="button"
              className={`mumu-top-btn${alwaysOnTop ? ' is-pinned' : ''}`}
              aria-pressed={alwaysOnTop}
              disabled={pinPending}
              onClick={onToggleAlwaysOnTop}
              title={alwaysOnTop ? '取消窗口置顶（切换其他软件时不再遮挡）' : '置顶窗口（MuMu 全屏叠放时建议开启）'}
            >
              <Pin size={11} />
              <span>{alwaysOnTop ? '已置顶' : '置顶'}</span>
            </button>
          )}
          {onSnapMumu && (
            <button
              type="button"
              className="mumu-top-btn"
              onClick={onSnapMumu}
              title="重新吸附定位到 MuMu 窗口右侧"
            >
              <Crosshair size={11} />
              <span>吸附</span>
            </button>
          )}
          {onExpandWide && (
            <button
              type="button"
              className="mumu-top-btn is-yellow"
              onClick={onExpandWide}
              title="切回标准 3 域战术终端"
            >
              <Maximize2 size={11} />
              <span>全屏</span>
            </button>
          )}
          {onCollapseToHud && (
            <button
              type="button"
              className="mumu-top-btn"
              onClick={onCollapseToHud}
              title="收起到 MuMu 顶部微缩悬浮条"
            >
              <PanelTopClose size={11} />
              <span>收起</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. 32px 4 Tactical Tabs */}
      <nav className="mumu-tabs" role="tablist" aria-label="MuMu 战术抽屉标签">
        {([
          ['overview', '总览', LayoutDashboard],
          ['guide', '跟打', Compass],
          ['deck', '牌库', Layers],
          ['report', '战报', Activity],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {placement === 'inside-right' && (
        <div className="mumu-inside-alert" role="status">
          <span>
            <AlertTriangle size={11} />
            当前内侧叠放于 MuMu 右侧（空间不足）
          </span>
          {onCollapseToHud && (
            <button type="button" onClick={onCollapseToHud}>
              挡商店时收起至HUD ▸
            </button>
          )}
        </div>
      )}

      {/* 3. Scrollable Content Area */}
      <main className="mumu-body">
        {activeTab === 'overview' && (
          <>
            {/* 本回合节奏黄条 */}
            <button
              type="button"
              className="mumu-pace-banner"
              onClick={() => setActiveTab('guide')}
              title="点击前往「跟打」查看完整阵容与站位"
            >
              <div className="mumu-pace-top">
                <span className="mumu-pace-badge">
                  R{currentRound} · 推荐 {pace.recommendedTier} 本
                </span>
                <span className="mumu-pace-comp">{activeComp.title}</span>
              </div>
              <p className="mumu-pace-text">
                <DerivedText text={paceActionText} />
              </p>
            </button>

            {/* 四席态势 2×2（统一无「稳」双轨 兜/漏 + 实时已激活盟约 + 累计/单轮切换） */}
            {!report ? (
              <section className="mumu-card" aria-label="四席态势">
                <header className="mumu-card-head">
                  <span className="mumu-card-title">
                    <b className="mumu-slash">//</b>四席态势
                  </span>
                </header>
                <p className="mumu-muted">
                  等待 MuMu 进入卫戍对局，进局后自动同步四席双轨兜漏、血量、本数与实时已激活盟约。
                </p>
              </section>
            ) : (
              <SeatTelemetryStrip
                report={report}
                focusSeat={seat}
                onSelectSeat={s => {
                  if (solo) return;
                  setPerspective(prev => (prev?.key === entryKey && prev.seat === s ? null : { key: entryKey, seat: s }));
                }}
                onResetPerspective={() => setPerspective(null)}
                layout="grid-2x2"
                compact
                title={solo ? '单兵态势' : '四席态势'}
              />
            )}

            {/* 心仪牌池实时追踪 */}
            <section className="mumu-card" aria-label="心仪牌池实时追踪">
              <header className="mumu-card-head">
                <span className="mumu-card-title">
                  <b className="mumu-slash">//</b>
                  {trackedSource === 'wishlist'
                    ? `心仪牌池 · ${liveShopLevel}本`
                    : trackedSource === 'comp'
                      ? `阵容核心追踪 · ${liveShopLevel}本`
                      : `牌池实时追踪 · ${liveShopLevel}本`}
                </span>
                <button
                  type="button"
                  className="mumu-link-btn"
                  onClick={() => setActiveTab('deck')}
                >
                  牌库选卡 <ChevronRight size={11} />
                </button>
              </header>

              {!report?.deckPool || trackedOps.length === 0 ? (
                <p className="mumu-muted">
                  进入对局收到开局场景后，自动追踪心仪或当前阵容核心干员余量与单刷率。
                </p>
              ) : (
                <div className="mumu-wish-list">
                  {trackedOps.map(op => {
                    const odds = computeOperatorOdds(report.deckPool!, op, liveShopLevel);
                    const inShop = selfSeat !== null && op.inShopSeats.includes(selfSeat);
                    const isEmpty = odds.status === 'empty' || op.remaining === 0;
                    const isLocked = odds.status === 'locked';
                    return (
                      <div
                        key={op.charId}
                        className="mumu-wish-row"
                        data-shop={inShop}
                        data-empty={isEmpty}
                      >
                        <CompactOperatorBadge name={op.name} size={22} />
                        <span className="mumu-wish-ident">
                          <strong>{op.name}</strong>
                          {inShop && <span className="mumu-shop-tag">在售</span>}
                        </span>
                        <span className="mumu-wish-rem">
                          剩 {op.remaining}/{op.totalCopies}
                        </span>
                        {isEmpty ? (
                          <span className="mumu-wish-odds is-empty">池空</span>
                        ) : isLocked ? (
                          <span className="mumu-wish-odds is-locked">
                            {odds.tripleDiscoverProb !== null ? `三连 ${fmtPct(odds.tripleDiscoverProb)}` : `${op.tier}本解锁`}
                          </span>
                        ) : (
                          <span className="mumu-wish-odds">{fmtPct(odds.perRollProb)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Npcap 紧凑横幅（未安装时显示）+ 本波出怪预警卡 */}
            {npcapInstalled === false && reportsApi && (
              <NpcapSetupBanner
                api={reportsApi}
                npcapInstalled={npcapInstalled}
                installState={npcapInstall}
                compact
              />
            )}

            <section className="mumu-card" aria-label="未来两波出怪预警">
              <header className="mumu-card-head">
                <span className="mumu-card-title">
                  <b className="mumu-slash">//</b>
                  {waveWarning && waveWarning.waves.length >= 2
                    ? `未来两波出怪 (R${waveWarning.waves[0].round} + R${waveWarning.waves[1].round})`
                    : waveWarning && waveWarning.waves.length === 1
                      ? `R${waveWarning.waves[0].round} 本波出怪预警`
                      : '未来两波出怪预警'}
                </span>
                {waveWarning && waveWarning.totalWaves > 0 && (
                  <button
                    type="button"
                    className="mumu-link-btn"
                    onClick={() => {
                      setActiveTab('report');
                      setReportSubTab('preview');
                    }}
                  >
                    完整({waveWarning.totalWaves}) <ChevronRight size={11} />
                  </button>
                )}
              </header>

              {!waveWarning || waveWarning.waves.length === 0 ? (
                <p className="mumu-muted">开战或收到预告包后在此提示未来两波敌人实机图标与压力。</p>
              ) : (
                <div className="mumu-dual-waves">
                  {waveWarning.waves.map((w, idx) => {
                    const isBoss = w.round >= 14 || w.items.some(i => i.boss);
                    return (
                      <div
                        key={w.round}
                        className="mumu-wave-line"
                        data-boss={isBoss}
                        data-primary={idx === 0}
                      >
                        <span className="mumu-wave-badge">
                          {idx === 0 ? `下波R${String(w.round).padStart(2, '0')}` : `预R${String(w.round).padStart(2, '0')}`}
                        </span>
                        <div className="mumu-spawn-chips">
                          {w.items.slice(0, 6).map(sp => (
                            <span
                              key={`${w.round}:${sp.id}:${sp.name}`}
                              className="mumu-spawn-chip"
                              data-boss={Boolean(sp.boss)}
                            >
                              <EnemyAvatar id={sp.id} size={15} />
                              <span>{sp.name}</span>
                              {sp.count !== null && <b>×{sp.count}</b>}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'guide' && (
          <>
            {/* 禁选同步状态 */}
            <section className="mumu-card" aria-label="禁选同步">
              <header className="mumu-card-head">
                <span className="mumu-card-title">
                  <Radio size={12} color="#00e5ff" />
                  禁选同步
                </span>
                <span className="mumu-muted">
                  {banSync.syncSource === 'packet'
                    ? 'TCP 300帧已同步'
                    : banSync.syncSource === 'ocr'
                      ? 'OCR 已识别'
                      : banSync.status === 'listening'
                        ? '监听对局中'
                        : '待同步'}
                </span>
              </header>

              <div className="mumu-ban-actions">
                {onScanWindow && (
                  <button
                    type="button"
                    className="mumu-btn is-primary"
                    disabled={!banSync.ocrAvailable || banSync.ocrStatus === 'scanning'}
                    onClick={() => void onScanWindow()}
                    title="截取 MuMu 游戏窗口识别开局受限盟约"
                  >
                    <ScanLine size={12} />
                    {banSync.ocrStatus === 'scanning' ? '识别中…' : '识别 MuMu 禁选'}
                  </button>
                )}
                {banSync.bannedCovenants.length > 0 && (
                  <button type="button" className="mumu-btn" onClick={onResyncBans}>
                    同步自动结果
                  </button>
                )}
                {(banState.bannedCovenants.length > 0 || banState.bannedOperators.length > 0) && (
                  <button type="button" className="mumu-btn" onClick={() => void onClearBans()}>
                    <RotateCcw size={11} />清空
                  </button>
                )}
              </div>

              {banState.bannedCovenants.length > 0 ? (
                <div className="mumu-ban-chips" aria-label="已禁盟约">
                  {banState.bannedCovenants.map(name => (
                    <button
                      key={name}
                      type="button"
                      className="mumu-ban-chip"
                      onClick={() => toggleBanCovenant(name)}
                      title="点击取消禁用"
                    >
                      <Ban size={10} />
                      <span>{name}</span>
                      <span>×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mumu-muted">
                  {banSync.ocrMessage || '开局 300 帧将自动读取禁选，也可点上方识别或手动勾选。'}
                </p>
              )}

              <details className="mumu-ban-fold">
                <summary>手动切换受限盟约 ({banState.bannedCovenants.length}/26)</summary>
                <div className="mumu-ban-toggle-grid">
                  {[...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES].map(name => {
                    const active = banState.bannedCovenants.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleBanCovenant(name)}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </details>
            </section>

            {/* 阵容下拉选择 + 回合快捷轨 */}
            <section className="mumu-card" aria-label="阵容与回合跟打">
              <header className="mumu-card-head">
                <span className="mumu-card-title">
                  <b className="mumu-slash">//</b>跟打阵容
                </span>
                <span className="mumu-muted">{activeEval.statusLabel}</span>
              </header>

              <select
                aria-label="选择跟打阵容"
                className="mumu-select"
                value={activeComp.id}
                onChange={e => onSelectCompId(e.target.value)}
              >
                {evaluations.map(ev => (
                  <option key={ev.comp.id} value={ev.comp.id}>
                    {ev.comp.title} · {ev.score}分
                  </option>
                ))}
              </select>

              {activeEval.blockedReasons.length > 0 && (
                <p className="mumu-muted" style={{ color: activeEval.status === 'blocked' ? '#fca5a5' : '#fbbf24' }}>
                  <ShieldAlert size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  {activeEval.blockedReasons[0]}
                </p>
              )}

              <div className="mumu-card-head" style={{ marginTop: 2 }}>
                <span className="mumu-pace-badge">R{currentRound} · 推荐 {pace.recommendedTier} 本</span>
                <button
                  type="button"
                  className={`mumu-foot-btn${autoFollowRound ? ' is-active' : ''}`}
                  onClick={onToggleAutoFollow}
                  title={banSync.liveRound ? `实局当前 R${banSync.liveRound}` : '开启后将自动跟随战报回合'}
                >
                  {autoFollowRound ? (banSync.liveRound ? `自动跟随 R${banSync.liveRound}` : '自动跟随中') : '手动固定回合'}
                </button>
              </div>

              <div className="mumu-round-grid" role="group" aria-label="快捷选择回合">
                {REPORT_ROUNDS.map(r => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={currentRound === r}
                    onClick={() => onChangeRound(r)}
                  >
                    R{r}
                  </button>
                ))}
              </div>

              <div className="mumu-pace-banner" style={{ cursor: 'default' }}>
                <p className="mumu-pace-text">
                  <DerivedText text={paceActionText} />
                </p>
              </div>
            </section>

            {/* 当前阶段场上/备战干员头像 & 装备/转职提示 */}
            <section className="mumu-card" aria-label="阶段阵型与配装">
              <header className="mumu-card-head">
                <span className="mumu-card-title">
                  <b className="mumu-slash">//</b>{activePhase.phaseName}
                </span>
                <span className="mumu-muted">{activePhase.shopTier}</span>
              </header>

              {activeComp.phases.length > 1 && (
                <div className="mumu-phase-pills">
                  {activeComp.phases.map((p, idx) => (
                    <button
                      key={p.phaseName}
                      type="button"
                      aria-pressed={phaseIndex === idx}
                      onClick={() => setPhaseOverride(idx === automaticPhaseIdx ? null : idx)}
                    >
                      {p.rounds}
                    </button>
                  ))}
                </div>
              )}

              <div className="mumu-field-ops">
                {activePhase.fieldOperators.map((op, idx) => (
                  <div
                    key={`${op.name}-${idx}`}
                    className={`mumu-op-box${focusedOps.some(n => op.name.includes(n)) ? ' is-focused' : ''}`}
                    title={op.note || op.role}
                  >
                    <OperatorAvatar name={op.name} tier={op.tier} size="sm" />
                    {op.note && <span className="mumu-op-note">{op.note}</span>}
                  </div>
                ))}
              </div>

              {activePhase.benchOperators.length > 0 && (
                <div className="mumu-bench-row">
                  <span className="mumu-muted" style={{ flex: 'none' }}>整备：</span>
                  {activePhase.benchOperators.map((op, idx) => (
                    <OperatorAvatar key={`${op.name}-${idx}`} name={op.name} tier={op.tier} size="sm" showTier={false} />
                  ))}
                </div>
              )}

              <div style={{ paddingTop: 4, borderTop: '1px dashed var(--mumu-line-soft)' }}>
                <p className="mumu-muted" style={{ color: '#ffe600', fontWeight: 650, marginBottom: 4 }}>
                  <Sparkles size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  {loadoutSummary(activeComp)}
                </p>
                <ul className="mumu-tips-list">
                  {activeComp.equipmentTips.filter(t => !isCorrection(t)).slice(0, 3).map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}

        {activeTab === 'deck' && (
          <BattleReportDeckPool
            key={entryKey}
            report={report}
            suggestedOperatorNames={suggestedOperatorNames}
            suggestedEquipNames={activeComp.equipmentTips}
            compTitle={activeComp.title}
          />
        )}

        {activeTab === 'report' && (
          <>
            <div className="mumu-report-bar">
              <div className="mumu-seg" role="tablist" aria-label="战报子视图">
                {([
                  ['rounds', '回合'],
                  ['boss', 'Boss'],
                  ['telemetry', '伤害'],
                  ['preview', '出怪'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={reportSubTab === id}
                    aria-pressed={reportSubTab === id}
                    onClick={() => setReportSubTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mumu-top-actions">
                <button
                  type="button"
                  className="mumu-btn"
                  disabled={!canExport}
                  onClick={() => {
                    if (entry && report && canExport) {
                      setExported(summarizeBattleReport(entry, report, liveView, new Date()));
                    }
                  }}
                  title={canExport ? '导出战报文档' : '尚无实战回合可导出'}
                >
                  <FileDown size={11} />
                  <span>导出战报</span>
                </button>
                <button
                  type="button"
                  className="mumu-btn"
                  onClick={() => {
                    if (onShowDiagnostics) onShowDiagnostics();
                    else void reportsApi?.showDiagnostics();
                  }}
                  title="打开战报采集诊断 (Ctrl+Shift+F9)"
                >
                  <Stethoscope size={11} />
                  <span>诊断</span>
                </button>
              </div>
            </div>

            {records.history.length > 0 && (
              <select
                aria-label="选择战报对局"
                className="mumu-select"
                value={entry && entry.key !== records.live?.key ? entry.key : ''}
                onChange={e => setOpenedKey(e.target.value || null)}
              >
                <option value="">{records.live?.label ?? '实时战报'}（当前）</option>
                {records.history.map(item => (
                  <option key={item.key} value={item.key}>
                    {item.label} · {dateTime.format(item.seenAt)}{item.report.difficulty ? ` · ${item.report.difficulty}` : ''}
                  </option>
                ))}
              </select>
            )}

            <div className="d-report-shell">
              {reportSubTab === 'rounds' && (
                <RoundMatrix
                  key={entryKey}
                  report={report}
                  seat={seat}
                  live={liveView}
                  onPreview={() => setReportSubTab('preview')}
                />
              )}
              {reportSubTab === 'boss' && (
                <BossDamage
                  report={report}
                  seat={seat}
                  number={bossNumber}
                  onRound={round => {
                    if (round >= 1 && round <= 15) setBossFilter({ key: entryKey, round });
                  }}
                  reference={null}
                  onPreview={() => setReportSubTab('preview')}
                />
              )}
              {reportSubTab === 'telemetry' && (
                <BattleReportTelemetry key={entryKey} report={report} />
              )}
              {reportSubTab === 'preview' && (
                <SpawnPreview
                  key={entryKey}
                  report={report}
                  live={liveView}
                  filter={previewRound}
                  onSelect={round => setPreviewFilter({ key: entryKey, round })}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* 4. 28px Bottom Bar */}
      <footer className="mumu-footer">
        <span className="mumu-foot-status" data-tone={footerTone}>
          <span className="mumu-dot" aria-hidden="true" />
          <span>{footerText}</span>
        </span>
        <div className="mumu-foot-actions">
          {reportStatus === 'failed' && reportsApi?.restart && (
            <button
              type="button"
              className="mumu-foot-btn is-active"
              onClick={() => void reportsApi.restart?.()}
              title={failureReason || '一键重启本地战报采集进程'}
            >
              重启采集
            </button>
          )}
          {window.electronAPI?.hud && (
            <button
              type="button"
              className={`mumu-foot-btn${hudState?.open && hudState?.locked ? ' is-active' : ''}`}
              onClick={() => void toggleHudClickThrough()}
              title="切换悬浮条与鼠标点击穿透（Ctrl+Shift+F10 解锁）"
            >
              悬浮穿透
            </button>
          )}
          {onExpandWide && (
            <button
              type="button"
              className="mumu-foot-btn"
              onClick={onExpandWide}
            >
              标准视图
            </button>
          )}
        </div>
      </footer>

      {exported && <BattleReportExportDialog report={exported} onClose={() => setExported(null)} />}
    </div>
  );
}
