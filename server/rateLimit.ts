/**
 * Rate limiting.
 *
 * - MemoryRateLimiter: sliding window in the function's memory. Effective
 *   against bursts; resets when the worker restarts. Used locally and as a
 *   fallback.
 * - ForgeBaseRateLimiter: fixed windows counted in the ForgeBase project's
 *   own database (table `rate_limits`, RPC `plateworth_rate_hit`), so limits
 *   survive restarts. Used automatically inside ForgeBase edge functions,
 *   which receive FORGEBASE_URL and FORGEBASE_SERVICE_ROLE_KEY. Falls back to
 *   the memory limiter if the database can't be reached.
 *
 * Keys are SHA-256 hashes of the client IP, so raw IPs are never stored.
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Seconds until the client may retry (0 when allowed). */
  retryAfter: number
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(max: number, windowSeconds: number, now: () => number = Date.now) {
    this.max = max
    this.windowMs = windowSeconds * 1000
    this.now = now
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = this.now()
    const windowStart = now - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart)

    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      const retryAfter = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000))
      return { allowed: false, remaining: 0, retryAfter }
    }

    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 5_000) this.prune(windowStart)
    return { allowed: true, remaining: this.max - recent.length, retryAfter: 0 }
  }

  private prune(windowStart: number): void {
    for (const [key, times] of this.hits) {
      if (times[times.length - 1] <= windowStart) this.hits.delete(key)
    }
  }
}

/** Reads the counter from an RPC reply: 3, [3], {count: 3} or [{count: 3}]. */
export function parseCount(body: unknown): number {
  const first = Array.isArray(body) ? body[0] : body
  const value = typeof first === 'object' && first !== null ? (first as { count?: unknown }).count : first
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error('Unexpected rate-limit reply')
  return n
}

export class ForgeBaseRateLimiter implements RateLimiter {
  private readonly opts: { url: string; serviceKey: string; max: number; windowSeconds: number; scope: string }
  private readonly fallback: RateLimiter
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number

  constructor(
    opts: { url: string; serviceKey: string; max: number; windowSeconds: number; scope: string },
    fallback: RateLimiter,
    deps: { fetch?: typeof fetch; now?: () => number } = {},
  ) {
    this.opts = opts
    this.fallback = fallback
    this.fetchImpl = deps.fetch ?? fetch
    this.now = deps.now ?? Date.now
  }

  private rpc(name: string, args: Record<string, unknown>): Promise<Response> {
    const { url, serviceKey } = this.opts
    return this.fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(3_000),
    })
  }

  async check(key: string): Promise<RateLimitResult> {
    const { max, windowSeconds, scope } = this.opts
    const nowSec = Math.floor(this.now() / 1000)
    const windowStart = nowSec - (nowSec % windowSeconds)
    try {
      const res = await this.rpc('plateworth_rate_hit', { key: `${scope}:${key}`, window_start: windowStart })
      if (!res.ok) throw new Error(`ForgeBase responded ${res.status}`)
      const count = parseCount(await res.json())
      // Occasionally drop windows older than two days so the table stays tiny.
      if (Math.random() < 0.02) void this.rpc('plateworth_rate_cleanup', { before: nowSec - 2 * 86_400 }).catch(() => {})
      if (count > max) {
        return { allowed: false, remaining: 0, retryAfter: Math.max(1, windowStart + windowSeconds - nowSec) }
      }
      return { allowed: true, remaining: max - count, retryAfter: 0 }
    } catch (error) {
      console.warn('[rate-limit] database unavailable, using in-memory limiter:', (error as Error).message)
      return this.fallback.check(key)
    }
  }
}

/**
 * Best-effort client IP from proxy headers. cf-connecting-ip (set by
 * Cloudflare, which fronts ForgeBase) is preferred: the first X-Forwarded-For
 * entry can be supplied by the client.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`plateworth:${value}`))
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}
