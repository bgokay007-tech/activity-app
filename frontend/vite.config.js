import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Her build benzersiz — Edge/PWA eski index.html+JS tutunca skor bölümleri "yok" görünüyordu.
const BUILD_ID = `web-${Date.now().toString(36)}`

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      // index.html precache + NavigationRoute Edge'de eski HTML'i ömür boyu tutuyordu —
      // navigateFallback kapalı; HTML her zaman ağdan gelsin.
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg,webp,jpg,jpeg,gif,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'AcTiViTy',
        short_name: 'AcTiViTy',
        description: 'Find rivals, join tournaments, connect with athletes',
        theme_color: '#111827',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
