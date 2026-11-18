import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import MobileApp from './mobile/MobileApp';
import './index.css';

const mobile = new URLSearchParams(window.location.search).get('mobile') === '1' || /Android|iPhone/i.test(navigator.userAgent);
createRoot(document.getElementById('root')!).render(mobile ? <MobileApp /> : <App />);
