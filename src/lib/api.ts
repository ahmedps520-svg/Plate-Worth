/**
 * Runs an estimate straight from the browser with the user's own Anthropic
 * API key (saved only on this device). There is no PlateWorth server: the
 * key and photos go only to api.anthropic.com.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import {
  estimateRequestSchema,
  type EstimateMeta,
  type EstimateRequestInput,
  type EstimateResult,
} from '../../shared/schema'
import { ApiError, type ProgressUpdate } from './apiError'
import { claudeConfig, DEFAULT_MODEL, type ClaudeConfig } from './claude/config'
import { anthropicMessage, runEstimate, toEstimateError, type ClaudeClient } from './claude/estimate'

export { ApiError, type ClientErrorCode, type ProgressUpdate } from './apiError'

export interface EstimateResponse {
  result: EstimateResult
  meta: EstimateMeta
}

/** Anthropic client for direct browser use with the user's own key. */
export function createClaudeClient(apiKey: string, timeoutMs = claudeConfig().deadlineMs): ClaudeClient & Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: timeoutMs })
}

export interface RequestOptions {
  apiKey: string | null | undefined
  signal?: AbortSignal
  onProgress?: (update: ProgressUpdate) => void
  /** For tests: inject a fake client / config. */
  createClient?: (apiKey: string, timeoutMs: number) => ClaudeClient
  config?: ClaudeConfig
}

export async function requestEstimate(body: EstimateRequestInput, opts: RequestOptions): Promise<EstimateResponse> {
  const apiKey = opts.apiKey?.trim()
  if (!apiKey) throw new ApiError('missing_api_key', 'Add your Anthropic API key in Settings.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('offline', 'No internet connection')
  }

  const parsed = estimateRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('bad_request', 'The photo or details are not valid.', { details: z.prettifyError(parsed.error) })
  }

  const config = opts.config ?? claudeConfig()
  const deadline = AbortSignal.timeout(config.deadlineMs)
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline
  const startedAt = Date.now()

  try {
    const client = (opts.createClient ?? createClaudeClient)(apiKey, config.deadlineMs)
    const outcome = await runEstimate(client, config, parsed.data, {
      signal,
      onProgress: (stage, detail) => opts.onProgress?.({ stage, detail }),
    })
    return {
      result: outcome.result,
      meta: { model: outcome.model, searches: outcome.searches, durationMs: Date.now() - startedAt },
    }
  } catch (error) {
    if (opts.signal?.aborted) throw new ApiError('aborted', 'Cancelled')
    const e = toEstimateError(error, deadline.aborted)
    throw new ApiError(e.code, e.message, { retryAfter: e.retryAfter, details: e.details })
  }
}

export type KeyCheck = 'valid' | 'invalid' | 'offline' | 'error'

/** Verifies a key with a free Models API call (no tokens are used). */
export async function checkApiKey(apiKey: string, client: Pick<Anthropic, 'models'> = createClaudeClient(apiKey, 15_000)): Promise<{ status: KeyCheck; details?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' }
  try {
    await client.models.retrieve(DEFAULT_MODEL)
    return { status: 'valid' }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return { status: 'invalid', details: anthropicMessage(error) }
    }
    if (error instanceof Anthropic.APIConnectionError) return { status: 'offline' }
    return { status: 'error', details: error instanceof Error ? error.message : undefined }
  }
}
