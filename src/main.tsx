// 青逝痕 Tenkinoko 制作
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AppErrorBoundary} from './components/AppErrorBoundary';
import './index.css';

declare const __PRODUCT_MODE__: 'full' | 'telemetry';

const searchParams = new URLSearchParams(window.location.search);
const isHud = searchParams.get('hud') === '1';
const mobile =
  searchParams.get('mobile') === '1' ||
  /Android|iPhone/i.test(navigator.userAgent);
const root = createRoot(document.getElementById('root')!);

function mountWithGuard(element: React.ReactNode, compact = false) {
  root.render(<AppErrorBoundary compact={compact}>{element}</AppErrorBoundary>);
}

function mountLoadFailure(err: unknown) {
  const msg = err instanceof Error ? err.message : '前端模块加载失败';
  root.render(
    <div style={{ padding: 20, background: '#090c11', color: '#f1f5f9', minHeight: '100dvh', fontFamily: 'system-ui, sans-serif' }}>
      <strong style={{ color: '#ffe600' }}>组件加载异常（游戏运行不受影响）</strong>
      <p style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 12px' }}>{msg}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ padding: '6px 12px', background: '#ffe600', color: '#0b0d11', border: 0, fontWeight: 700, cursor: 'pointer' }}
      >
        重新加载界面
      </button>
    </div>,
  );
}

if (isHud) {
  void import('./desktop/HudStripApp')
    .then(({default: HudStripApp}) => mountWithGuard(<HudStripApp />, true))
    .catch(mountLoadFailure);
} else if (import.meta.env.DEV && (searchParams.has('battle-demo') || searchParams.has('lite-demo'))) {
  void import('./desktop/demo/BattleReportDemo')
    .then(({default: Demo}) => mountWithGuard(<Demo />))
    .catch(mountLoadFailure);
} else if (__PRODUCT_MODE__ === 'telemetry') {
  if (import.meta.env.MODE === 'android' || mobile) {
    void import('./mobile/TelemetryMobileApp')
      .then(({default: TelemetryMobileApp}) => mountWithGuard(<TelemetryMobileApp />))
      .catch(mountLoadFailure);
  } else {
    void import('./desktop/TelemetryApp')
      .then(({default: TelemetryApp}) => mountWithGuard(<TelemetryApp />))
      .catch(mountLoadFailure);
  }
} else if (import.meta.env.MODE === 'android' || mobile) {
  void import('./mobile/MobileApp')
    .then(({default: MobileApp}) => mountWithGuard(<MobileApp />))
    .catch(mountLoadFailure);
} else {
  void import('./App')
    .then(({default: App}) => mountWithGuard(<App />))
    .catch(mountLoadFailure);
}
