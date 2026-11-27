import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { store } from './store/index.js';
import './index.css';
import './i18n.js';
import App from './App.jsx';

/* global __APP_BUILD_ID__ */
const BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
const BUILD_KEY = 'activity_web_build_id';

// Edge (ve diğerleri): eski service worker + Cache Storage skor bölümlerini eski JS ile
 // bırakıyordu — build id değişince bir kez SW/cache temizle + yenile.
async function purgeStaleClientIfNeeded() {
  if (typeof window === 'undefined') return false;
  try {
    const prev = localStorage.getItem(BUILD_KEY);
    if (prev === BUILD_ID) return false;
    localStorage.setItem(BUILD_KEY, BUILD_ID);
    // İlk ziyaret (prev null): kaydet, yenileme yok
    if (prev == null) return false;
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // Tek seferlik soft reload — yeni HTML/JS ağdan gelsin
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

const purged = await purgeStaleClientIfNeeded();
if (!purged) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { updateSW(true); },
  });
  setInterval(() => { try { updateSW?.(true); } catch { /* ignore */ } }, 45_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try { updateSW?.(true); } catch { /* ignore */ }
    }
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
}
