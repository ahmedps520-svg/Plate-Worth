/// <reference types="vite/client" />

/** App version from package.json, injected by vite.config.ts. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Full URL of the estimate endpoint (ForgeBase edge function). Defaults to /api/estimate. */
  readonly VITE_ESTIMATE_URL?: string
  /** ForgeBase anon key sent as apikey/Bearer. Browser-safe by design. */
  readonly VITE_FORGEBASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
