import { useEffect, useState } from 'react';
import { Cpu, Smartphone } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import type { HudOverlayState, LanSyncState } from './battleReports';
import BattleReportsView from './BattleReportsView';
import { LanSyncDialog } from './LanSyncDialog';
import './desktop.css';

const desktopAPI = window.electronAPI;

export default function TelemetryApp() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(PRODUCT_BRAND.defaultAlwaysOnTop);
  const [pinPending, setPinPending] = useState(false);
  const [pinError, setPinError] = useState('');
  const [hudState, setHudState] = useState<HudOverlayState | null>(null);
  const [lanState, setLanState] = useState<LanSyncState | null>(null);
  const [lanOpen, setLanOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const offHud = desktopAPI?.hud?.onState(next => { if (mounted) setHudState(next); });
    const offLan = desktopAPI?.lanSync?.onState(next => { if (mounted) setLanState(next); });
    void desktopAPI?.hud?.getState().then(next => { if (mounted) setHudState(next); }).catch(() => {});
    void desktopAPI?.lanSync?.getState().then(next => { if (mounted) setLanState(next); }).catch(() => {});
    return () => {
      mounted = false;
      offHud?.();
      offLan?.();
    };
  }, []);

  const toggleAlwaysOnTop = async () => {
    if (!desktopAPI || pinPending) return;
    setPinPending(true);
    setPinError('');
    try {
      setAlwaysOnTop(await desktopAPI.setAlwaysOnTop(!alwaysOnTop));
    } catch {
      setPinError('置顶失败，请重试');
    } finally {
      setPinPending(false);
    }
  };

  return (
    <div className="desktop-app relative w-screen h-screen overflow-hidden bg-[#0B0E14] text-[#F1F5F9] select-none">
      <header className="d-global-header">
        <span className="d-wordmark font-display">
          <img src={`${import.meta.env.BASE_URL}${PRODUCT_BRAND.faviconFile}`} width="28" height="28" alt="" />
          <span>{PRODUCT_BRAND.name}<small> · {PRODUCT_BRAND.codename}</small></span>
        </span>
        <div className="flex items-center gap-2.5 shrink-0">
          {desktopAPI?.hud && (
            <button
              type="button"
              onClick={() => void desktopAPI.hud?.setOpen(!hudState?.open)}
              aria-pressed={Boolean(hudState?.open)}
              title="切换置顶鼠标穿透微缩遥测条（Ctrl+Shift+F10 锁定穿透）"
              className="d-button d-small"
            >
              <Cpu size={13} />
              <span>{hudState?.open ? '关闭微缩条' : '微缩遥测条'}</span>
            </button>
          )}
          {desktopAPI?.lanSync && (
            <button
              type="button"
              onClick={() => setLanOpen(true)}
              aria-pressed={Boolean(lanState?.enabled)}
              title="PC ↔ 安卓局域网战报同步"
              className="d-button d-small"
            >
              <Smartphone size={13} />
              <span>{lanState?.enabled ? `手机同步(${lanState.peerCount})` : '手机同步'}</span>
            </button>
          )}
          {desktopAPI && (
            <button
              type="button"
              onClick={toggleAlwaysOnTop}
              disabled={pinPending}
              aria-pressed={alwaysOnTop}
              title={pinError || '切换系统窗口置顶'}
              className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-600 text-amber-300 disabled:opacity-50"
            >
              {pinError || (alwaysOnTop ? '已置顶' : '窗口置顶')}
            </button>
          )}
        </div>
      </header>
      {desktopAPI?.battleReports ? (
        <BattleReportsView api={desktopAPI.battleReports} visible />
      ) : (
        <main className="desktop-page d-muted">
          请在 Windows 桌面端运行{PRODUCT_BRAND.name}以启用本机实时采集，或在开发模式下打开 <code>?battle-demo</code> 预演。
        </main>
      )}
      {desktopAPI?.lanSync && lanState && (
        <LanSyncDialog open={lanOpen} state={lanState} api={desktopAPI.lanSync} onClose={() => setLanOpen(false)} />
      )}
    </div>
  );
}
