/**
 * Client for POST /api/estimate. Reads the NDJSON progress stream and
 * re-validates the final result with the shared zod schema.
 */
import {
  ERROR_CODES,
  estimateResultSchema,
  type ErrorBody,
  type ErrorCode,
  type EstimateMeta,
  type EstimateRequestInput,
  type EstimateResult,
  type ProgressStage,
  type StreamEvent,
} from '../../shared/schema'

export type ClientErrorCode = ErrorCode | 'offline' | 'network' | 'aborted'

/**
 * Where estimates come from. Production builds (GitHub Pages) call the
 * ForgeBase edge function directly; `npm run dev` uses the local /api/estimate
 * served by the Vite dev server. See .env.production.
 */
const ESTIMATE_URL: string = import.meta.env.VITE_ESTIMATE_URL || '/api/estimate'
/** ForgeBase's browser-safe anon key (like Supabase's); not a secret. */
const ANON_KEY: string | undefined = import.meta.env.VITE_FORGEBASE_ANON_KEY || undefined

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/x-ndjson' }
  if (ANON_KEY) {
    headers.apikey = ANON_KEY
    headers.authorization = `Bearer ${ANON_KEY}`
  }
  return headers
}

export class ApiError extends Error {
  readonly code: ClientErrorCode
  readonly status?: number
  readonly retryAfter?: number
  readonly details?: string

  constructor(code: ClientErrorCode, message: string, opts: { status?: number; retryAfter?: number; details?: string } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = opts.status
    this.retryAfter = opts.retryAfter
    this.details = opts.details
  }
}

export interface EstimateResponse {
  result: EstimateResult
  meta: EstimateMeta
}

export interface ProgressUpdate {
  stage: ProgressStage
  detail?: string
}

/** Splits a byte stream into lines and parses each line as JSON. */
export function createNdjsonDecoder(onEvent: (event: unknown) => void): {
  push: (chunk: Uint8Array) => void
  end: () => void
} {
  const decoder = new TextDecoder()
  let buffer = ''
  const flushLines = (final: boolean) => {
    const lines = buffer.split('\n')
    buffer = final ? '' : (lines.pop() ?? '')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        onEvent(JSON.parse(trimmed))
      } catch {
        // ignore malformed lines (e.g. a proxy injecting noise)
      }
    }
  }
  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true })
      flushLines(false)
    },
    end() {
      buffer += decoder.decode()
      flushLines(true)
    },
  }
}

function asErrorCode(value: unknown): ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value as string) ? (value as ErrorCode) : 'internal'
}

function statusToCode(status: number): ErrorCode {
  if (status === 429) return 'rate_limited'
  if (status === 403) return 'forbidden_origin'
  if (status === 413) return 'payload_too_large'
  if (status === 400 || status === 422) return 'bad_request'
  if (status === 504) return 'timeout'
  if (status === 503) return 'upstream_busy'
  return 'upstream_error'
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  const headerRetry = Number.parseInt(res.headers.get('retry-after') ?? '', 10)
  try {
    const body = (await res.json()) as Partial<ErrorBody>
    if (body.error) {
      return new ApiError(asErrorCode(body.error.code), body.error.message ?? 'Request failed', {
        status: res.status,
        retryAfter: body.error.retryAfter ?? (Number.isFinite(headerRetry) ? headerRetry : undefined),
        details: body.error.details,
      })
    }
  } catch {
    // not JSON (e.g. a platform error page)
  }
  return new ApiError(statusToCode(res.status), `Request failed (${res.status})`, {
    status: res.status,
    retryAfter: Number.isFinite(headerRetry) ? headerRetry : undefined,
  })
}

export async function requestEstimate(
  body: EstimateRequestInput,
  opts: { signal?: AbortSignal; onProgress?: (update: ProgressUpdate) => void } = {},
): Promise<EstimateResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('offline', 'No internet connection')
  }

  let res: Response
  try {
    res = await fetch(ESTIMATE_URL, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') throw new ApiError('aborted', 'Cancelled')
    throw new ApiError('network', 'Could not reach the server')
  }

  if (!res.ok) throw await errorFromResponse(res)
  if (!res.body) throw new ApiError('upstream_error', 'Empty response')

  let outcome: EstimateResponse | undefined
  let failure: ApiError | undefined

  const decoder = createNdjsonDecoder((raw) => {
    const event = raw as StreamEvent
    switch (event?.type) {
      case 'progress':
        opts.onProgress?.({ stage: event.stage, detail: event.detail })
        break
      case 'result': {
        const parsed = estimateResultSchema.safeParse(event.result)
        if (parsed.success) outcome = { result: parsed.data, meta: event.meta }
        else failure = new ApiError('invalid_output', 'The server returned an invalid result')
        break
      }
      case 'error':
        failure = new ApiError(asErrorCode(event.code), event.message, { retryAfter: event.retryAfter })
        break
      default:
        break // pings and unknown events
    }
  })

  const reader = res.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      decoder.push(value)
    }
    decoder.end()
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') throw new ApiError('aborted', 'Cancelled')
    throw new ApiError('network', 'The connection was interrupted')
  }

  if (failure) throw failure
  if (!outcome) throw new ApiError('network', 'The connection closed before the estimate finished')
  return outcome
}
