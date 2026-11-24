/**
 * Server configuration, read from environment variables. Nothing here is ever
 * sent to the client. See .env.example for documentation of each variable.
 */
export type Env = Record<string, string | undefined>

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type WebSearchToolVersion = 'web_search_20250305' | 'web_search_20260209'

export interface ServerConfig {
  apiKey: string | undefined
  model: string
  effort: Effort
  maxTokens: number
  refusalFallback: boolean
  webSearch: {
    version: WebSearchToolVersion
    maxUses: number
    allowedDomains: string[] | undefined
  }
  rateLimit: { max: number; windowSeconds: number }
  /** Max scans per UTC day across all users (0 = unlimited). Protects the API bill. */
  dailyLimit: number
  /** Overall time budget for one estimate; must stay under the host's function timeout. */
  deadlineMs: number
  maxImageBytes: number
  allowedOrigins: string[] | undefined
  /** ForgeBase project REST API + service key (injected by ForgeBase into edge functions). */
  forgebase: { url: string; serviceKey: string } | undefined
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

/** Models that accept the server-side `fallbacks: "default"` parameter (beta). */
const FALLBACK_CAPABLE_MODELS = new Set([
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
  'claude-fable-5-2',
])

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function list(value: string | undefined): string[] | undefined {
  const items = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? items : undefined
}

export function readConfig(env: Env): ServerConfig {
  const model = env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL
  const effort = (env.CLAUDE_EFFORT?.trim().toLowerCase() ?? '') as Effort
  const fallbackSetting = env.CLAUDE_REFUSAL_FALLBACK?.trim().toLowerCase() || 'auto'
  const version = env.WEB_SEARCH_TOOL_VERSION?.trim()

  const forgebaseUrl = (env.FORGEBASE_URL ?? env.SUPABASE_URL)?.trim()
  const forgebaseKey = (env.FORGEBASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim()

  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    model,
    effort: EFFORTS.includes(effort) ? effort : 'medium',
    maxTokens: int(env.CLAUDE_MAX_TOKENS, 32_000, 4_000, 128_000),
    refusalFallback:
      fallbackSetting === 'on' || (fallbackSetting === 'auto' && FALLBACK_CAPABLE_MODELS.has(model)),
    webSearch: {
      version: version === 'web_search_20260209' ? 'web_search_20260209' : 'web_search_20250305',
      maxUses: int(env.WEB_SEARCH_MAX_USES, 5, 1, 10),
      allowedDomains: list(env.WEB_SEARCH_ALLOWED_DOMAINS),
    },
    rateLimit: {
      max: int(env.RATE_LIMIT_MAX, 10, 1, 10_000),
      windowSeconds: int(env.RATE_LIMIT_WINDOW_SECONDS, 600, 1, 86_400),
    },
    dailyLimit: int(env.DAILY_SCAN_LIMIT, 100, 0, 1_000_000),
    // ForgeBase edge functions are capped at 120 s, so leave headroom by default.
    deadlineMs: int(env.ESTIMATE_DEADLINE_MS, 110_000, 10_000, 290_000),
    maxImageBytes: int(env.MAX_IMAGE_BYTES, 4 * 1024 * 1024, 64 * 1024, 5 * 1024 * 1024),
    allowedOrigins: list(env.ALLOWED_ORIGINS)?.map((o) => o.replace(/\/+$/, '')),
    forgebase:
      forgebaseUrl && forgebaseKey ? { url: forgebaseUrl.replace(/\/+$/, ''), serviceKey: forgebaseKey } : undefined,
  }
}
