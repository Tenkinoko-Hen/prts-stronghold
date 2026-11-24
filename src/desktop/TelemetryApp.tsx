import { useState } from 'react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import BattleReportsView from './BattleReportsView';
import './desktop.css';

const desktopAPI = window.electronAPI;

export default function TelemetryApp() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(PRODUCT_BRAND.defaultAlwaysOnTop);
  const [pinPending, setPinPending] = useState(false);
  const [pinError, setPinError] = useState('');

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
    </div>
  );
}
