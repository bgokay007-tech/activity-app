import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { store } from './store/index.js';
import './index.css';
import './i18n.js';
import App from './App.jsx';

// vite.config.js sets registerType: 'autoUpdate', but that alone only makes the
// generated service worker skipWaiting/clientsClaim server-side — nothing was actually
// calling navigator.serviceWorker.register() or reacting to a new version being found,
// so already-open tabs kept running old JS indefinitely (only a fresh/incognito tab,
// with no service worker yet, ever saw the latest deploy). This registers it for real
// and force-reloads once as soon as a new version is detected.
const updateSW = registerSW({
  onNeedRefresh() { updateSW(true); },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>
);