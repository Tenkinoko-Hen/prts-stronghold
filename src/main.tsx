import {createRoot} from 'react-dom/client';
import './index.css';

declare const __PRODUCT_MODE__: 'full' | 'telemetry';

const mobile =
  new URLSearchParams(window.location.search).get('mobile') === '1' ||
  /Android|iPhone/i.test(navigator.userAgent);
const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('battle-demo')) {
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
