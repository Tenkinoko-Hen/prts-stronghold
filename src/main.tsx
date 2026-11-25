// 青逝痕 Tenkinoko 制作
import {createRoot} from 'react-dom/client';
import './index.css';

declare const __PRODUCT_MODE__: 'full' | 'telemetry';

const searchParams = new URLSearchParams(window.location.search);
const mobile =
  searchParams.get('mobile') === '1' ||
  /Android|iPhone/i.test(navigator.userAgent);
const root = createRoot(document.getElementById('root')!);

if (searchParams.get('hud') === '1') {
  void import('./desktop/HudStripApp').then(({default: HudStripApp}) => root.render(<HudStripApp />));
} else if (import.meta.env.DEV && (searchParams.has('battle-demo') || searchParams.has('lite-demo'))) {
  void import('./desktop/demo/BattleReportDemo').then(({default: Demo}) => root.render(<Demo />));
} else if (__PRODUCT_MODE__ === 'telemetry') {
  if (import.meta.env.MODE === 'android' || mobile) {
    void import('./mobile/TelemetryMobileApp').then(({default: TelemetryMobileApp}) =>
      root.render(<TelemetryMobileApp />),
    );
  } else {
    void import('./desktop/TelemetryApp').then(({default: TelemetryApp}) =>
      root.render(<TelemetryApp />),
    );
  }
} else if (import.meta.env.MODE === 'android' || mobile) {
  void import('./mobile/MobileApp').then(({default: MobileApp}) => root.render(<MobileApp />));
} else {
  void import('./App').then(({default: App}) => root.render(<App />));
}
