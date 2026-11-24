import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devApi } from './server/vite-dev-api.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * Production builds get a Content-Security-Policy <meta> tag, because GitHub
 * Pages can't send custom response headers. connect-src allows the app's own
 * origin plus the estimate API (ForgeBase).
 */
function contentSecurityPolicy(apiUrl: string | undefined): Plugin {
  const apiOrigin = apiUrl && /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : ''
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`.trim(),
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'plateworth-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load every variable from .env / .env.local (not only VITE_*). These are
  // handed to the dev API middleware only; nothing here is exposed to the
  // client bundle because only VITE_* variables are ever inlined by Vite.
  const serverEnv = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const useHttps = serverEnv.DEV_HTTPS !== 'false'
  // GitHub Pages serves this repo under /Plate-Worth/ (set in .env.production).
  const base = (serverEnv.BASE_PATH || '/').replace(/\/?$/, '/')

  return {
    base,
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
      contentSecurityPolicy(serverEnv.VITE_ESTIMATE_URL),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: base,
          name: 'PlateWorth',
          short_name: 'PlateWorth',
          description:
            'Scan a Saudi license plate to get rough AI-estimated values for the vehicle and the plate in SAR.',
          lang: 'en',
          dir: 'ltr',
          start_url: base,
          scope: base,
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
              url: `${base}#/scan`,
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Scan history',
              short_name: 'History',
              url: `${base}#/history`,
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          // Offline app shell: precache the built JS/CSS/HTML, icons and the
          // Arabic + Latin font files. The estimate API is never cached (scans
          // need a connection); history lives in IndexedDB so it works offline.
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
