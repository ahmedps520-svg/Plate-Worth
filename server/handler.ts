/**
 * The estimate endpoint — a web-standard (Request → Response) handler shared
 * by the ForgeBase edge function (forgebase/estimate.ts) and the Vite dev
 * server (/api/estimate).
 *
 * Validation and rate limiting happen up front and fail with a JSON error
 * body and a matching HTTP status. Once accepted, the response is an NDJSON
 * stream of StreamEvents: progress updates, then exactly one `result` or
 * `error` event. Images are processed in memory only and never logged.
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { readConfig, type Env, type ServerConfig } from './config.js'
import { EstimateError, runEstimate, toEstimateError, type EstimateOutcome, type RunOptions } from './claude.js'
import { checkImage } from './image.js'
import { ForgeBaseRateLimiter, MemoryRateLimiter, clientIp, hashKey, type RateLimiter } from './rateLimit.js'
import {
  estimateRequestSchema,
  type ErrorBody,
  type ErrorCode,
  type EstimateRequest,
  type StreamEvent,
} from '../shared/schema.js'

/** Keeps mobile networks/proxies from dropping a quiet connection. */
const HEARTBEAT_MS = 15_000

export type EstimateFn = (config: ServerConfig, request: EstimateRequest, opts: RunOptions) => Promise<EstimateOutcome>

export interface HandlerDeps {
  estimate?: EstimateFn
  /** Per-IP limiter (default: ForgeBase database, else in-memory). */
  limiter?: RateLimiter
  /** Global per-day limiter (default: ForgeBase database, else in-memory). */
  dailyLimiter?: RateLimiter
  /** Client IP determined by the platform (ForgeBase passes ctx.client_ip). */
  clientIp?: string
  /** Platform abort signal (function timeout / client gone). */
  signal?: AbortSignal
  now?: () => number
}

const DAY_SECONDS = 86_400

let clientCache: { key: string; client: Anthropic } | undefined
const limiterCache = new Map<string, RateLimiter>()

function getClient(apiKey: string, timeoutMs: number): Anthropic {
  const key = `${apiKey}:${timeoutMs}`
  if (clientCache?.key !== key) {
    clientCache = { key, client: new Anthropic({ apiKey, maxRetries: 2, timeout: timeoutMs }) }
  }
  return clientCache.client
}

function getLimiter(config: ServerConfig, scope: 'ip' | 'day', max: number, windowSeconds: number): RateLimiter {
  const key = JSON.stringify([scope, max, windowSeconds, config.forgebase?.url])
  let limiter = limiterCache.get(key)
  if (!limiter) {
    const memory = new MemoryRateLimiter(max, windowSeconds)
    limiter = config.forgebase
      ? new ForgeBaseRateLimiter({ ...config.forgebase, max, windowSeconds, scope }, memory)
      : memory
    limiterCache.set(key, limiter)
  }
  return limiter
}

const defaultEstimate: EstimateFn = (config, request, opts) =>
  runEstimate(getClient(config.apiKey ?? '', config.deadlineMs), config, request, opts)

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  })
}

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  extra: { headers?: Record<string, string>; details?: string; retryAfter?: number } = {},
): Response {
  const body: ErrorBody = { error: { code, message } }
  if (extra.details) body.error.details = extra.details
  if (extra.retryAfter !== undefined) body.error.retryAfter = extra.retryAfter
  return json(status, body, extra.headers)
}

/** Reads the body as text, giving up (null) once it exceeds `limit` bytes. */
async function readBodyLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

function corsHeaders(config: ServerConfig, origin: string | null): Record<string, string> {
  if (!origin || !config.allowedOrigins?.includes(origin)) return {}
  return { 'access-control-allow-origin': origin, vary: 'Origin' }
}

export async function handleEstimate(request: Request, env: Env, deps: HandlerDeps = {}): Promise<Response> {
  const config = readConfig(env)
  const now = deps.now ?? Date.now
  const origin = request.headers.get('origin')
  const cors = corsHeaders(config, origin)

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        allow: 'POST, OPTIONS',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    })
  }
  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST for this endpoint.', {
      headers: { allow: 'POST, OPTIONS' },
    })
  }
  if (config.allowedOrigins && (!origin || !config.allowedOrigins.includes(origin))) {
    return errorResponse(403, 'forbidden_origin', 'This origin is not allowed to use the API.')
  }
  if (!config.apiKey && !deps.estimate) {
    console.error('[estimate] ANTHROPIC_API_KEY is not set')
    return errorResponse(500, 'server_misconfigured', 'The server is missing its AI service key.', { headers: cors })
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return errorResponse(415, 'unsupported_media_type', 'Send the request as application/json.', { headers: cors })
  }

  // Two base64 images (photo + optional plate crop) plus a little JSON.
  const maxBodyBytes = Math.ceil((config.maxImageBytes * 4) / 3) * 2 + 64 * 1024
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > maxBodyBytes) {
    return errorResponse(413, 'payload_too_large', 'The upload is too large.', { headers: cors })
  }
  const raw = await readBodyLimited(request, maxBodyBytes)
  if (raw === null) return errorResponse(413, 'payload_too_large', 'The upload is too large.', { headers: cors })

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return errorResponse(400, 'bad_request', 'The request body is not valid JSON.', { headers: cors })
  }

  const parsed = estimateRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return errorResponse(400, 'bad_request', 'The request is missing fields or has invalid values.', {
      headers: cors,
      details: z.prettifyError(parsed.error).slice(0, 2000),
    })
  }
  const body = parsed.data

  if (body.type === 'scan') {
    const checks = [checkImage(body.image, config.maxImageBytes, 'photo')]
    if (body.plateCrop) checks.push(checkImage(body.plateCrop, config.maxImageBytes, 'plate crop'))
    for (const check of checks) {
      if (!check.ok) return errorResponse(check.status, check.code, check.message, { headers: cors })
    }
  }

  const ip = deps.clientIp || clientIp(request.headers)
  const limiter = deps.limiter ?? getLimiter(config, 'ip', config.rateLimit.max, config.rateLimit.windowSeconds)
  const limit = await limiter.check(await hashKey(ip))
  if (!limit.allowed) {
    return errorResponse(429, 'rate_limited', 'Too many scans. Please wait a moment and try again.', {
      headers: { ...cors, 'retry-after': String(limit.retryAfter) },
      retryAfter: limit.retryAfter,
    })
  }

  if (config.dailyLimit > 0) {
    const daily = deps.dailyLimiter ?? getLimiter(config, 'day', config.dailyLimit, DAY_SECONDS)
    const quota = await daily.check('all')
    if (!quota.allowed) {
      return errorResponse(429, 'quota_exceeded', 'This app has reached its scan limit for today.', {
        headers: { ...cors, 'retry-after': String(quota.retryAfter) },
        retryAfter: quota.retryAfter,
      })
    }
  }

  return streamEstimate(request, config, body, deps.estimate ?? defaultEstimate, now, deps.signal, {
    ...cors,
    'x-ratelimit-remaining': String(limit.remaining),
  })
}

function streamEstimate(
  request: Request,
  config: ServerConfig,
  body: EstimateRequest,
  estimate: EstimateFn,
  now: () => number,
  platformSignal: AbortSignal | undefined,
  headers: Record<string, string>,
): Response {
  const encoder = new TextEncoder()
  const startedAt = now()
  const cancelled = new AbortController()
  const deadline = AbortSignal.timeout(config.deadlineMs)
  const signal = AbortSignal.any(
    [request.signal, deadline, cancelled.signal, platformSignal].filter((s): s is AbortSignal => Boolean(s)),
  )

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (event: StreamEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          open = false
        }
      }
      const heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS)
      const log = (outcome: string, extra: Record<string, unknown> = {}) =>
        console.info(
          JSON.stringify({
            evt: 'estimate',
            type: body.type,
            outcome,
            ms: now() - startedAt,
            hasCrop: body.type === 'scan' && Boolean(body.plateCrop),
            ...extra,
          }),
        )

      try {
        const outcome = await estimate(config, body, {
          signal,
          onProgress: (stage, detail) => send(detail ? { type: 'progress', stage, detail } : { type: 'progress', stage }),
        })
        send({
          type: 'result',
          result: outcome.result,
          meta: { model: outcome.model, searches: outcome.searches, durationMs: now() - startedAt },
        })
        log('ok', { model: outcome.model, searches: outcome.searches })
      } catch (error) {
        const e: EstimateError = toEstimateError(error, deadline.aborted)
        send({ type: 'error', code: e.code, message: e.message, ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}) })
        log('error', { code: e.code })
      } finally {
        clearInterval(heartbeat)
        open = false
        try {
          controller.close()
        } catch {
          // already closed by a cancelled reader
        }
      }
    },
    cancel() {
      cancelled.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-content-type-options': 'nosniff',
      'x-accel-buffering': 'no',
      ...headers,
    },
  })
}
