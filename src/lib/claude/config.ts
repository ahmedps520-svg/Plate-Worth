/**
 * Settings for the Claude request. The app runs entirely in the browser with
 * the user's own API key, so these are fixed defaults (overridable in code
 * or tests via `claudeConfig({...})`).
 */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type WebSearchToolVersion = 'web_search_20250305' | 'web_search_20260209'

export interface ClaudeConfig {
  model: string
  effort: Effort
  maxTokens: number
  refusalFallback: boolean
  webSearch: {
    version: WebSearchToolVersion
    maxUses: number
    allowedDomains: string[] | undefined
  }
  /** Overall time budget for one estimate. */
  deadlineMs: number
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

export function claudeConfig(overrides: Partial<Omit<ClaudeConfig, 'refusalFallback'>> & { refusalFallback?: boolean } = {}): ClaudeConfig {
  const model = overrides.model ?? DEFAULT_MODEL
  return {
    model,
    effort: overrides.effort ?? 'medium',
    maxTokens: overrides.maxTokens ?? 32_000,
    refusalFallback: overrides.refusalFallback ?? FALLBACK_CAPABLE_MODELS.has(model),
    webSearch: overrides.webSearch ?? { version: 'web_search_20250305', maxUses: 5, allowedDomains: undefined },
    deadlineMs: overrides.deadlineMs ?? 180_000,
  }
}
