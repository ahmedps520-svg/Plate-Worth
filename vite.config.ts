import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devApi } from './server/vite-dev-api.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load every variable from .env / .env.local (not only VITE_*). These are
  // handed to the dev API middleware only; nothing here is exposed to the
  // client bundle because only VITE_* variables are ever inlined by Vite.
  const serverEnv = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const useHttps = serverEnv.DEV_HTTPS !== 'false'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Self-signed HTTPS so the camera works when you open the dev server
      // from a phone on the same Wi-Fi (getUserMedia needs a secure context).
      ...(useHttps ? [basicSsl({ name: 'plateworth-dev' })] : []),
      devApi(serverEnv),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: '/',
          name: 'PlateWorth',
          short_name: 'PlateWorth',
          description:
            'Scan a Saudi license plate to get rough AI-estimated values for the vehicle and the plate in SAR.',
          lang: 'en',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#0a0f0d',
          background_color: '#0a0f0d',
          categories: ['utilities', 'productivity'],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Scan a plate',
              short_name: 'Scan',
              url: '/#/scan',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Scan history',
              short_name: 'History',
              url: '/#/history',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          // Offline app shell: precache the built JS/CSS/HTML, icons and the
          // Arabic + Latin font files. /api is never cached (scans need a
          // connection); history lives in IndexedDB so it works offline.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      host: true,
    },
    preview: {
      host: true,
    },
    build: {
      target: 'es2022',
      sourcemap: true,
    },
  }
})
