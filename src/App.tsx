// 青逝痕 Tenkinoko 制作
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AppWindow, BookOpen, Calculator, Grid, Images, Pin, Repeat2, Smartphone } from 'lucide-react';
import {
  META_COMPS,
  OperatorPlacement,
  TACTICAL_MAPS,
  TacticalMapData,
  UPLOADED_GALLERY_ITEMS,
} from './data/strongholdData';
import { Tactical2DMapView } from './components/Tactical2DMapView';
import { MetaCompsView } from './components/MetaCompsView';
import { CovenantEncyclopediaView } from './components/CovenantEncyclopediaView';
import { StackingCalculatorView } from './components/StackingCalculatorView';
import { TransferItemsView } from './components/TransferItemsView';
import { ImageLightboxModal } from './components/ImageLightboxModal';
import { useBattleBanSync } from './desktop/battleBanSync';
import type { HudOverlayState, LanSyncState } from './desktop/battleReports';
import { LanSyncDialog } from './desktop/LanSyncDialog';
import { BanPickState, getRecommendedPaceForRound } from './utils/tacticalLogic';
import './desktop/desktop.css';

type PrimaryDomain = 'guide' | 'reports' | 'reference';
type ReferenceTab = 'tactical' | 'transfers' | 'covenants' | 'calculator';

const FAV_STORAGE_KEY = 'stronghold_fav_covenants_v1';
const desktopAPI = window.electronAPI;
const BattleReportsView = lazy(() => import('./desktop/BattleReportsView'));

const REFERENCE_TABS: { id: ReferenceTab; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'tactical', label: '2D 战术站位', Icon: Grid },
  { id: 'transfers', label: '转职合成表', Icon: Repeat2 },
  { id: 'covenants', label: '全盟约图鉴', Icon: BookOpen },
  { id: 'calculator', label: '叠层模拟器', Icon: Calculator },
];

export default function App() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [pinError, setPinError] = useState('');
  const toggleAlwaysOnTop = async () => {
    if (!desktopAPI || pinPending) return;
    setPinPending(true);
    setPinError('');
    try { setAlwaysOnTop(await desktopAPI.setAlwaysOnTop(!alwaysOnTop)); }
    catch { setPinError('置顶失败'); }
    finally { setPinPending(false); }
  };

  const [activeDomain, setActiveDomain] = useState<PrimaryDomain>('guide');
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>('tactical');
  const [selectedMapId, setSelectedMapId] = useState<string>(TACTICAL_MAPS[0].id);
  const [stageMode, setStageMode] = useState<'道中' | 'Boss战'>('Boss战');

  // Shared game companion state across views
  const [selectedCompId, setSelectedCompId] = useState<string>(META_COMPS[0].id);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [autoFollowRound, setAutoFollowRound] = useState<boolean>(true);
  const [banState, setBanState] = useState<BanPickState>({ bannedCovenants: [], bannedOperators: [] });
  const [matchSyncId, setMatchSyncId] = useState('');

  const { sync: banSync, resync: resyncBans, reset: resetBanSync, scanWindow, scanClipboard } = useBattleBanSync(value => {
    setBanState(previous => {
      const unchanged = previous.bannedCovenants.length === value.bannedCovenants.length
        && value.bannedCovenants.every(name => previous.bannedCovenants.includes(name));
      if (unchanged && previous.bannedOperators.length === 0 && matchSyncId) {
        return previous;
      }
      setSelectedCompId(META_COMPS[0].id);
      setCurrentRound(1);
      setAutoFollowRound(true);
      setMatchSyncId(value.matchKey);
      return { bannedCovenants: value.bannedCovenants, bannedOperators: [] };
    });
  });

  useEffect(() => {
    if (autoFollowRound && banSync.liveRound !== null) {
      setCurrentRound(banSync.liveRound);
    }
  }, [autoFollowRound, banSync.liveRound]);

  const handleManualRound = (nextRound: number) => {
    setCurrentRound(nextRound);
    if (banSync.liveRound !== null && nextRound !== banSync.liveRound) {
      setAutoFollowRound(false);
    }
  };

  const toggleAutoFollow = () => {
    setAutoFollowRound(prev => {
      const next = !prev;
      if (next && banSync.liveRound !== null) setCurrentRound(banSync.liveRound);
      return next;
    });
  };

  const clearBans = async () => {
    resetBanSync();
    setBanState({ bannedCovenants: [], bannedOperators: [] });
    setSelectedCompId(META_COMPS[0].id);
    setAutoFollowRound(true);
  };

  const openReference = (tab: ReferenceTab) => {
    setReferenceTab(tab);
    setActiveDomain('reference');
  };

  // Covenant filter & favorite state
  const [onlyCurrentCompPriority, setOnlyCurrentCompPriority] = useState<boolean>(false);
  const [favoriteCovenantIds, setFavoriteCovenantIds] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem(FAV_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return ['ursus', 'kazimierz', 'yan'];
  });

  const handleToggleFavoriteCovenant = (covId: string) => {
    setFavoriteCovenantIds((prev) => {
      const next = prev.includes(covId)
        ? prev.filter((id) => id !== covId)
        : [...prev, covId];
      try {
        window.localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const activeComp = META_COMPS.find((c) => c.id === selectedCompId) || META_COMPS[0];
  const activeMap: TacticalMapData =
    TACTICAL_MAPS.find((m) => m.id === selectedMapId) || TACTICAL_MAPS[0];
  const currentLayout =
    stageMode === '道中' ? activeMap.midStage : activeMap.bossStage;

  const [selectedPlacement, setSelectedPlacement] =
    useState<OperatorPlacement | null>(currentLayout.placements[0] || null);

  useEffect(() => {
    const layout = stageMode === '道中' ? activeMap.midStage : activeMap.bossStage;
    setSelectedPlacement(layout.placements[0] || null);
  }, [selectedMapId, stageMode, activeMap]);

  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [hudState, setHudState] = useState<HudOverlayState | null>(null);
  const [lanState, setLanState] = useState<LanSyncState | null>(null);
  const [lanDialogOpen, setLanDialogOpen] = useState(false);

  useEffect(() => {
    const hud = desktopAPI?.hud;
    const lan = desktopAPI?.lanSync;
    let mounted = true;
    const offHud = hud?.onState(next => { if (mounted) setHudState(next); });
    const offLan = lan?.onState(next => { if (mounted) setLanState(next); });
    void hud?.getState().then(next => { if (mounted) setHudState(next); }).catch(() => {});
    void lan?.getState().then(next => { if (mounted) setLanState(next); }).catch(() => {});
    return () => {
      mounted = false;
      offHud?.();
      offLan?.();
    };
  }, []);

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

  useEffect(() => {
    const pace = getRecommendedPaceForRound(activeComp, currentRound);
    const fullAction = pace.currentAction || activeComp.strategistTip;
    const paceTip = `推荐 ${pace.recommendedTier} 本 · ${fullAction}`;
    void desktopAPI?.hud?.syncGuide({
      round: currentRound,
      compTitle: activeComp.title,
      paceTip,
      suggestedOperators: suggestedOperatorNames,
    }).catch(() => {});
    void desktopAPI?.lanSync?.syncGuide({
      bannedCovenants: banState.bannedCovenants,
      currentRound,
      selectedCompId,
      compTitle: activeComp.title,
      paceTip,
    }).catch(() => {});
  }, [activeComp, banState.bannedCovenants, currentRound, selectedCompId, suggestedOperatorNames]);

  const telemetryTone = banSync.npcapInstalled === false ? 'warn'
    : banSync.status === 'listening' ? 'live'
      : ['permission', 'unavailable', 'incompatible', 'failed'].includes(banSync.status) ? 'error'
        : 'idle';
  const telemetryLabel = banSync.npcapInstalled === false ? '未装 Npcap'
    : banSync.status === 'listening'
      ? (banSync.liveRound !== null ? `记录中 · R${String(banSync.liveRound).padStart(2, '0')}` : '记录中 · 待开局')
      : banSync.status === 'connecting' ? '待进局'
        : banSync.status === 'waiting' ? '待游戏启动'
          : banSync.status === 'permission' ? '需管理员'
            : banSync.status === 'paused' ? '已暂停' : '等待开局';

  return (
    <div className="desktop-app relative w-screen h-screen overflow-hidden select-none">
      {/* 1. Unified PRTS × Endfield 3-Domain Top Header */}
      <header className="d-global-header">
        <a
          href="#guide"
          onClick={(e) => {
            e.preventDefault();
            setActiveDomain('guide');
          }}
          className="d-wordmark font-display"
        >
          <span className="d-brand-chip">PRTS</span>
          <span>卫戍协议战术终端</span>
        </a>

        <nav aria-label="主导航" className="d-global-nav">
          <a
            href="#guide"
            aria-current={activeDomain === 'guide' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setActiveDomain('guide');
            }}
          >
            <span className="d-nav-code">01</span>战术跟打
          </a>
          {desktopAPI?.battleReports && (
            <a
              href="#reports"
              aria-current={activeDomain === 'reports' ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                setActiveDomain('reports');
              }}
            >
              <span className="d-nav-code">02</span>实时战报
            </a>
          )}
          <a
            href="#reference"
            aria-current={activeDomain === 'reference' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setActiveDomain('reference');
            }}
          >
            <span className="d-nav-code">{desktopAPI?.battleReports ? '03' : '02'}</span>战术资料
          </a>
        </nav>

        <div className="d-header-tools">
          {desktopAPI?.battleReports && (
            <button
              type="button"
              className="d-live-pill"
              data-tone={telemetryTone}
              onClick={() => setActiveDomain('reports')}
              title="点击前往实时战报与采集状态"
            >
              <span className="d-dot" aria-hidden="true" />
              <span>{telemetryLabel}</span>
            </button>
          )}
          {desktopAPI?.hud && (
            <button
              type="button"
              onClick={() => void desktopAPI.hud?.setOpen(!hudState?.open)}
              aria-pressed={Boolean(hudState?.open)}
              title="打开/关闭桌面置顶小窗（Ctrl+Shift+F10 锁定鼠标穿透）"
              className={`d-button d-small d-pin-btn${hudState?.open ? ' is-pinned' : ''}`}
            >
              <AppWindow size={13} />
              <span>{hudState?.open ? (hudState.locked ? '悬浮穿透' : '悬浮窗') : '悬浮窗'}</span>
            </button>
          )}
          {desktopAPI?.lanSync && (
            <button
              type="button"
              onClick={() => setLanDialogOpen(true)}
              aria-pressed={Boolean(lanState?.enabled)}
              title="PC ↔ 免 Root 安卓局域网无线副屏与战报同步"
              className={`d-button d-small d-pin-btn${lanState?.enabled ? ' is-pinned' : ''}`}
            >
              <Smartphone size={13} />
              <span>{lanState?.enabled ? `副屏(${lanState.peerCount})` : '无线副屏'}</span>
            </button>
          )}
          {desktopAPI && (
            <button
              type="button"
              onClick={toggleAlwaysOnTop}
              disabled={pinPending}
              aria-pressed={alwaysOnTop}
              title={pinError || '切换系统窗口置顶'}
              className={`d-button d-small d-pin-btn${alwaysOnTop ? ' is-pinned' : ''}`}
            >
              <Pin size={13} />
              <span>{pinError || (alwaysOnTop ? '已置顶' : '置顶')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setLightboxImage({
                url: activeMap.imageUrl,
                title: `${activeMap.name}（原图一图流）`,
              })
            }
            className="d-button d-small"
            title={`查看全部 ${UPLOADED_GALLERY_ITEMS.length} 张原图资料`}
          >
            <Images size={13} />
            <span>原图库 ({UPLOADED_GALLERY_ITEMS.length})</span>
          </button>
        </div>
      </header>

      {/* 2. Domain 01: Tactical Guide (Picker + Round-by-Round) */}
      <MetaCompsView
        key={matchSyncId}
        visible={activeDomain === 'guide'}
        banState={banState}
        onChangeBanState={setBanState}
        banSync={banSync}
        onResyncBans={resyncBans}
        onScanWindow={scanWindow}
        onScanClipboard={scanClipboard}
        onClearBans={clearBans}
        selectedCompId={selectedCompId}
        onSelectCompId={setSelectedCompId}
        currentRound={currentRound}
        liveRound={banSync.liveRound}
        autoFollowRound={autoFollowRound}
        onToggleAutoFollow={toggleAutoFollow}
        onChangeRound={handleManualRound}
        onOpenImage={(url, title) => setLightboxImage({ url, title })}
        onJumpTo2DMap={() => openReference('tactical')}
        onJumpToPriorityCovenants={() => {
          setOnlyCurrentCompPriority(true);
          openReference('covenants');
        }}
        onJumpToTransfers={() => openReference('transfers')}
      />

      {/* 3. Domain 02: Live Battle Reports */}
      {desktopAPI?.battleReports && (
        <div hidden={activeDomain !== 'reports'}>
          <Suspense fallback={activeDomain === 'reports' && <main className="desktop-page d-muted">正在打开战报…</main>}>
            <BattleReportsView
              api={desktopAPI.battleReports}
              visible={activeDomain === 'reports'}
              compTitle={activeComp.title}
              suggestedOperatorNames={suggestedOperatorNames}
              suggestedEquipNames={activeComp.equipmentTips}
            />
          </Suspense>
        </div>
      )}

      {/* 4. Domain 03: Tactical Reference Hub (2D Map / Transfers / Covenants / Calculator) */}
      {activeDomain === 'reference' && (
        <div className="d-ref-shell">
          <div className="d-ref-subnav" role="tablist" aria-label="战术资料分类">
            <div className="d-ref-tabs">
              {REFERENCE_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={referenceTab === id}
                  onClick={() => setReferenceTab(id)}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="d-ref-context">
              <span className="d-muted">当前关联阵容</span>
              <select
                aria-label="切换全局关联阵容"
                value={selectedCompId}
                onChange={(e) => setSelectedCompId(e.target.value)}
                className="d-ind-select"
              >
                {META_COMPS.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="d-ref-body">
            {referenceTab === 'tactical' && (
              <Tactical2DMapView
                selectedMapId={selectedMapId}
                onSelectMapId={setSelectedMapId}
                stageMode={stageMode}
                onChangeStageMode={setStageMode}
                selectedPlacement={selectedPlacement}
                onSelectPlacement={setSelectedPlacement}
                onOpenImage={(url, title) => setLightboxImage({ url, title })}
              />
            )}
            {referenceTab === 'transfers' && (
              <TransferItemsView
                selectedCompId={selectedCompId}
                onSelectCompId={setSelectedCompId}
              />
            )}
            {referenceTab === 'covenants' && (
              <CovenantEncyclopediaView
                selectedCompId={selectedCompId}
                onSelectCompId={setSelectedCompId}
                favoriteCovenantIds={favoriteCovenantIds}
                onToggleFavoriteCovenant={handleToggleFavoriteCovenant}
                onlyCurrentCompPriority={onlyCurrentCompPriority}
                onChangeOnlyCurrentCompPriority={setOnlyCurrentCompPriority}
                onOpenImage={(url, title) => setLightboxImage({ url, title })}
              />
            )}
            {referenceTab === 'calculator' && (
              <StackingCalculatorView
                onOpenImage={(url, title) => setLightboxImage({ url, title })}
              />
            )}
          </div>
        </div>
      )}

      {/* 5. High-Resolution Original Image Lightbox Modal */}
      {lightboxImage && (
        <ImageLightboxModal
          initialUrl={lightboxImage.url}
          initialTitle={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}
      {desktopAPI?.lanSync && lanState && (
        <LanSyncDialog
          open={lanDialogOpen}
          state={lanState}
          api={desktopAPI.lanSync}
          onClose={() => setLanDialogOpen(false)}
        />
      )}
    </div>
  );
}
