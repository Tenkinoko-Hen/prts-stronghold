import React, { lazy, Suspense, useEffect, useState } from 'react';
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
import { DesktopScanStatus } from './components/DesktopCovenantScan';
import { useDesktopCovenantScan } from './desktop/covenantOcr';
import { BanPickState } from './utils/tacticalLogic';
import './desktop/desktop.css';

type ActiveView = 'tactical' | 'comps' | 'transfers' | 'covenants' | 'calculator' | 'reports';

const FAV_STORAGE_KEY = 'stronghold_fav_covenants_v1';
const desktopAPI = window.electronAPI;
const BattleReportsView = lazy(() => import('./desktop/BattleReportsView'));
export default function App() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [pinError, setPinError] = useState('');
  const toggleAlwaysOnTop = async () => {
    if (!desktopAPI || pinPending) return;
    setPinPending(true);
    setPinError('');
    try { setAlwaysOnTop(await desktopAPI.setAlwaysOnTop(!alwaysOnTop)); }
    catch { setPinError('置顶失败，请重试'); }
    finally { setPinPending(false); }
  };
  const [activeView, setActiveView] = useState<ActiveView>('comps');
  const [selectedMapId, setSelectedMapId] = useState<string>(TACTICAL_MAPS[0].id);
  const [stageMode, setStageMode] = useState<'道中' | 'Boss战'>('Boss战');

  // Shared game companion state across views
  const [selectedCompId, setSelectedCompId] = useState<string>(META_COMPS[0].id);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [banState, setBanState] = useState<BanPickState>({ bannedCovenants: [], bannedOperators: [] });
  const [matchScanId, setMatchScanId] = useState('');
  const { scan, reset: resetScan, cancel: cancelScan } = useDesktopCovenantScan(value => {
    setBanState({ bannedCovenants: value.bannedCovenants, bannedOperators: [] });
    setSelectedCompId(META_COMPS[0].id);
    setCurrentRound(1);
    setMatchScanId(value.id);
    setLightboxImage(null);
    setActiveView('comps');
  });
  const clearBans = async () => {
    await resetScan();
    setBanState({ bannedCovenants: [], bannedOperators: [] });
    setSelectedCompId(META_COMPS[0].id);
  };

  // Covenant filter & favorite state
  const [onlyCurrentCompPriority, setOnlyCurrentCompPriority] =
    useState<boolean>(false);
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

  // Selected operator slot on the 2D tactical board
  const activeMap: TacticalMapData =
    TACTICAL_MAPS.find((m) => m.id === selectedMapId) || TACTICAL_MAPS[0];
  const currentLayout =
    stageMode === '道中' ? activeMap.midStage : activeMap.bossStage;

  const [selectedPlacement, setSelectedPlacement] =
    useState<OperatorPlacement | null>(currentLayout.placements[0] || null);

  // Sync default selected placement when map or stage mode changes
  useEffect(() => {
    const layout =
      stageMode === '道中' ? activeMap.midStage : activeMap.bossStage;
    setSelectedPlacement(layout.placements[0] || null);
  }, [selectedMapId, stageMode, activeMap]);

  // Lightbox Modal State
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
  } | null>(null);

  return (
    <div className="desktop-app relative w-screen h-screen overflow-hidden bg-[#0B0E14] text-[#F1F5F9] select-none">
      {/* 1. Top Navigation Bar (Strict 3-Zone Top Bar Contract) */}
      <header className="d-global-header">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#comps"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('comps');
          }}
          className="d-wordmark font-display"
        >
          卫戍协议战术终端 · PRTS
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav
          aria-label="主导航"
          className="d-global-nav"
        >
          <a
            href="#comps"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('comps');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'comps'
                ? 'text-amber-400 border-amber-400 font-black'
                : 'border-transparent hover:text-slate-50'
            }`}
          >
            阵容一图流
          </a>
          <a
            href="#transfers"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('transfers');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'transfers'
                ? 'text-amber-400 border-amber-400 font-black'
                : 'border-transparent hover:text-slate-50'
            }`}
          >
            转职合成表
          </a>
          <a
            href="#tactical"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('tactical');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'tactical'
                ? 'text-amber-400 border-amber-400 font-black'
                : 'border-transparent hover:text-slate-50'
            }`}
          >
            2D 战术站位
          </a>
          <a
            href="#covenants"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('covenants');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'covenants'
                ? 'text-amber-400 border-amber-400 font-black'
                : 'border-transparent hover:text-slate-50'
            }`}
          >
            十大盟约图鉴
          </a>
          <a
            href="#calculator"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('calculator');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'calculator'
                ? 'text-amber-400 border-amber-400 font-black'
                : 'border-transparent hover:text-slate-50'
            }`}
          >
            叠层计算器
          </a>
          {desktopAPI?.battleReports && <a href="#reports" aria-current={activeView === 'reports' ? 'page' : undefined}
            onClick={e => { e.preventDefault(); setActiveView('reports'); }}
            className="py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 border-transparent hover:text-slate-50">战报</a>}
        </nav>

        {/* Original image library */}
        <div className="flex items-center gap-2.5 shrink-0">
          {desktopAPI && <button type="button" onClick={toggleAlwaysOnTop} disabled={pinPending}
            aria-pressed={alwaysOnTop} title={pinError || '切换系统窗口置顶'}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-600 text-amber-300 disabled:opacity-50">
            {pinError || (alwaysOnTop ? '已置顶' : '窗口置顶')}
          </button>}
          <button
            type="button"
            onClick={() =>
              setLightboxImage({
                url: activeMap.imageUrl,
                title: `${activeMap.name}（原图一图流）`,
              })
            }
            className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-black text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            原图资料库 ({UPLOADED_GALLERY_ITEMS.length})
          </button>
        </div>
      </header>

      {/* 2. Active Views */}
      {activeView === 'tactical' && (
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

      {activeView === 'comps' && (
        <MetaCompsView
          key={matchScanId}
          banState={banState}
          onChangeBanState={setBanState}
          desktopScan={scan}
          onCancelScan={cancelScan}
          onClearBans={clearBans}
          selectedCompId={selectedCompId}
          onSelectCompId={setSelectedCompId}
          currentRound={currentRound}
          onChangeRound={setCurrentRound}
          onOpenImage={(url, title) => setLightboxImage({ url, title })}
          onJumpTo2DMap={() => setActiveView('tactical')}
          onJumpToPriorityCovenants={() => {
            setOnlyCurrentCompPriority(true);
            setActiveView('covenants');
          }}
          onJumpToTransfers={() => setActiveView('transfers')}
        />
      )}

      {activeView === 'transfers' && (
        <TransferItemsView
          selectedCompId={selectedCompId}
          onSelectCompId={setSelectedCompId}
        />
      )}

      {activeView === 'covenants' && (
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

      {activeView === 'calculator' && <StackingCalculatorView onOpenImage={(url, title) => setLightboxImage({ url, title })} />}
      {desktopAPI?.battleReports && <div hidden={activeView !== 'reports'}>
        <Suspense fallback={activeView === 'reports' && <main className="desktop-page d-muted">正在打开战报…</main>}>
          <BattleReportsView api={desktopAPI.battleReports} visible={activeView === 'reports'} />
        </Suspense>
      </div>}
      <DesktopScanStatus scan={scan} onCancel={cancelScan} floating />

      {/* 3. High-Resolution Original Image Lightbox Modal */}
      {lightboxImage && (
        <ImageLightboxModal
          initialUrl={lightboxImage.url}
          initialTitle={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}

    </div>
  );
}
