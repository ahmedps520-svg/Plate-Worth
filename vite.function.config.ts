/**
 * Bundles the ForgeBase edge function (forgebase/estimate.ts + the Anthropic
 * SDK + zod) into ONE self-contained ES module, forgebase/dist/index.js,
 * because ForgeBase functions are deployed as plain files without npm.
 *
 *   npm run build:function
 */
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'forgebase/estimate.ts',
    outDir: 'forgebase/dist',
    emptyOutDir: true,
    target: 'node22',
    // ForgeBase limits each function file to 1 MB; minified the bundle is ~0.6 MB.
    minify: true,
    sourcemap: false,
    copyPublicDir: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'index.js',
        inlineDynamicImports: true,
      },
    },
  },
  ssr: {
    // Bundle every dependency; only Node built-ins stay as imports.
    noExternal: true,
    target: 'node',
  },
})
