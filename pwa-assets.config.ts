/**
 * Generates every PWA icon from public/favicon.svg:
 *   npm run icons
 * Output (written to public/): favicon.ico, pwa-64x64.png, pwa-192x192.png,
 * pwa-512x512.png, maskable-icon-512x512.png, apple-touch-icon-180x180.png.
 *
 * favicon.svg is full-bleed with the artwork inside the maskable safe zone,
 * so no padding is needed for any of the variants.
 */
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0 },
    apple: { ...minimal2023Preset.apple, padding: 0 },
  },
  images: ['public/favicon.svg'],
})
