/**
 * Calls Claude (Messages API, streaming) with the photo(s) and the server-side
 * web search tool, and turns the reply into a validated EstimateResult.
 *
 * - Streams so we can report real progress ("searching the market…").
 * - Resumes `pause_turn` (the server-side tool loop hit its iteration cap).
 * - If the final answer isn't valid JSON for our schema, asks once more,
 *   appending to the conversation (never rewriting it).
 * - Only keeps source links that actually appeared in this request's search
 *   results, so the UI never shows a hallucinated URL.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ClaudeConfig } from './config'
import { SYSTEM_PROMPT, buildRetryMessage, buildUserContent } from './prompt'
import {
  parseEstimateReply,
  type ErrorCode,
  type EstimateRequest,
  type EstimateResult,
  type ProgressStage,
  type Source,
} from '../../../shared/schema'

type BetaContentBlock = Anthropic.Beta.BetaContentBlock
type BetaMessageParam = Anthropic.Beta.BetaMessageParam

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const MAX_CONTINUATIONS = 4
const MAX_SOURCES = 8

export class EstimateError extends Error {
  readonly code: ErrorCode
  readonly retryAfter?: number
  /** Anthropic's own error message, shown under the friendly one (e.g. low credit). */
  readonly details?: string

  constructor(code: ErrorCode, message: string, opts: { retryAfter?: number; details?: string } = {}) {
    super(message)
    this.name = 'EstimateError'
    this.code = code
    this.retryAfter = opts.retryAfter
    this.details = opts.details
  }
}

export interface EstimateOutcome {
  result: EstimateResult
  /** Model that actually produced the answer (differs if a fallback ran). */
  model: string
  searches: number
}

export interface RunOptions {
  signal?: AbortSignal
  onProgress?: (stage: ProgressStage, detail?: string) => void
}

/** The slice of the SDK client this module uses (lets tests pass a fake). */
export type ClaudeClient = Pick<Anthropic, 'beta'>

export function buildWebSearchTool(config: ClaudeConfig): Anthropic.Beta.BetaToolUnion {
  const common = {
    name: 'web_search' as const,
    max_uses: config.webSearch.maxUses,
    user_location: {
      type: 'approximate' as const,
      country: 'SA',
      region: 'Riyadh',
      city: 'Riyadh',
      timezone: 'Asia/Riyadh',
    },
    ...(config.webSearch.allowedDomains ? { allowed_domains: config.webSearch.allowedDomains } : {}),
  }
  return config.webSearch.version === 'web_search_20260209'
    ? { ...common, type: 'web_search_20260209' }
    : { ...common, type: 'web_search_20250305' }
}

/** Comparable form of a URL for matching model-cited links to search results. */
export function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const path = url.pathname.replace(/\/+$/, '')
    return `${host}${path}${url.search}`
  } catch {
    return undefined
  }
}

/** Text of the final answer: text blocks after the last web search activity. */
export function finalAnswerText(content: BetaContentBlock[]): string {
  let lastToolIndex = -1
  content.forEach((block, i) => {
    if (block.type === 'server_tool_use' || block.type === 'web_search_tool_result') lastToolIndex = i
  })
  const after = content.slice(lastToolIndex + 1).filter((b) => b.type === 'text')
  const blocks = after.length ? after : content.filter((b) => b.type === 'text')
  return blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')
}

class SourceTracker {
  private readonly results = new Map<string, Source>()
  private readonly cited = new Map<string, Source>()
  searches = 0

  collect(content: BetaContentBlock[]): void {
    for (const block of content) {
      if (block.type === 'server_tool_use' && block.name === 'web_search') {
        this.searches += 1
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const result of block.content) {
          const key = normalizeUrl(result.url)
          if (key && !this.results.has(key)) this.results.set(key, { title: result.title, url: result.url })
        }
      } else if (block.type === 'text' && block.citations) {
        for (const citation of block.citations) {
          if (citation.type !== 'web_search_result_location') continue
          const key = normalizeUrl(citation.url)
          if (key && !this.cited.has(key)) {
            this.cited.set(key, { title: citation.title || new URL(citation.url).hostname, url: citation.url })
          }
        }
      }
    }
  }

  /** Model-listed sources that we can verify, else citations, else top results. */
  verify(listed: Source[]): Source[] {
    const verified = listed.filter((s) => {
      const key = normalizeUrl(s.url)
      return key !== undefined && (this.results.has(key) || this.cited.has(key))
    })
    const pool = verified.length ? verified : this.cited.size ? [...this.cited.values()] : [...this.results.values()].slice(0, 5)
    const seen = new Set<string>()
    return pool
      .filter((s) => {
        const key = normalizeUrl(s.url) ?? s.url
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, MAX_SOURCES)
  }
}

export async function runEstimate(
  client: ClaudeClient,
  config: ClaudeConfig,
  request: EstimateRequest,
  opts: RunOptions = {},
): Promise<EstimateOutcome> {
  const { onProgress, signal } = opts
  const tools = [buildWebSearchTool(config)]
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  ]
  const messages: BetaMessageParam[] = [{ role: 'user', content: buildUserContent(request) }]
  const sources = new SourceTracker()

  let continuations = 0
  let retried = false
  let searching = false
  let finalizing = false

  onProgress?.(request.type === 'scan' ? 'reading' : 'searching')

  for (;;) {
    const stream = client.beta.messages.stream(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        system,
        tools,
        messages,
        output_config: { effort: config.effort },
        ...(config.refusalFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      },
      { signal },
    )

    stream.on('streamEvent', (event) => {
      if (event.type !== 'content_block_start') return
      const block = event.content_block
      if (block.type === 'server_tool_use' && block.name === 'web_search' && !searching) {
        searching = true
        onProgress?.('searching')
      } else if (block.type === 'text' && searching && !finalizing) {
        finalizing = true
        onProgress?.('finalizing')
      }
    })
    stream.on('contentBlock', (block) => {
      if (block.type === 'server_tool_use' && block.name === 'web_search') {
        const query = block.input?.query
        if (typeof query === 'string' && query.trim()) onProgress?.('searching', query.trim().slice(0, 120))
      }
    })

    const message = await stream.finalMessage()
    sources.collect(message.content)

    if (message.stop_reason === 'refusal') {
      throw new EstimateError('refused', 'The AI declined to analyze this image. Try a different photo.')
    }

    if (message.stop_reason === 'pause_turn') {
      // The server-side tool loop paused; send the turn back so it resumes.
      if (++continuations > MAX_CONTINUATIONS) {
        throw new EstimateError('upstream_error', 'The AI did not finish its research in time.')
      }
      messages.push({ role: 'assistant', content: message.content })
      continue
    }

    if (message.stop_reason === 'max_tokens') {
      throw new EstimateError('invalid_output', 'The AI reply was cut off. Please try again.')
    }

    const parsed = parseEstimateReply(finalAnswerText(message.content))
    if (parsed.success) {
      return {
        result: { ...parsed.data, sources: sources.verify(parsed.data.sources) },
        model: message.model,
        searches: sources.searches,
      }
    }

    if (retried) {
      throw new EstimateError('invalid_output', 'The AI returned an answer in an unexpected format.')
    }
    retried = true
    console.warn('[estimate] invalid model JSON, retrying once:', parsed.error.slice(0, 500))
    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: buildRetryMessage(parsed.error) })
    if (!finalizing) {
      finalizing = true
      onProgress?.('finalizing')
    }
  }
}

function retryAfterSeconds(error: InstanceType<typeof Anthropic.APIError>): number | undefined {
  const raw = error.headers?.get('retry-after')
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Anthropic's human-readable message from an SDK error ("Your credit balance is too low…"). */
export function anthropicMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown }; message?: unknown } | undefined
  const message = body?.error?.message ?? body?.message
  return typeof message === 'string' && message.trim() ? message.trim() : error.message
}

/** Maps any thrown value to a user-presentable EstimateError. */
export function toEstimateError(error: unknown, timedOut = false): EstimateError {
  if (error instanceof EstimateError) return error
  if (timedOut) {
    return new EstimateError('timeout', 'The estimate took too long. Please try again.')
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return new EstimateError('aborted', 'The request was cancelled.')
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new EstimateError('timeout', 'Anthropic took too long to respond. Please try again.')
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new EstimateError('invalid_api_key', 'Anthropic rejected the API key.', { details: anthropicMessage(error) })
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new EstimateError('rate_limited', 'Anthropic rate limit reached for this key.', {
      retryAfter: retryAfterSeconds(error) ?? 60,
      details: anthropicMessage(error),
    })
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new EstimateError('upstream_busy', 'Anthropic is temporarily unavailable. Please try again.', { retryAfter: 20 })
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new EstimateError('network', 'Could not reach Anthropic. Check your connection.')
  }
  if (error instanceof Anthropic.APIError) {
    // 400/404 etc.: e.g. low credit balance or a model the key can't use.
    return new EstimateError('upstream_error', 'Anthropic returned an error.', { details: anthropicMessage(error) })
  }
  console.error('[estimate] unexpected error:', error)
  return new EstimateError('internal', 'Something went wrong. Please try again.')
}
