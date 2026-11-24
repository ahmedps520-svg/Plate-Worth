/**
 * Per-IP rate limiting.
 *
 * - MemoryRateLimiter: sliding window kept in the function instance's memory.
 *   On Vercel (Fluid compute) instances are reused across requests, so this is
 *   effective against bursts, but limits are per instance.
 * - UpstashRateLimiter: fixed window in Upstash Redis over its REST API, shared
 *   by all instances. Used automatically when UPSTASH_REDIS_REST_URL/TOKEN are
 *   set. Falls back to the memory limiter if Redis is unreachable.
 *
 * Keys are SHA-256 hashes of the client IP so raw IPs are never stored.
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

export class UpstashRateLimiter implements RateLimiter {
  private readonly url: string
  private readonly token: string
  private readonly max: number
  private readonly windowSeconds: number
  private readonly fallback: RateLimiter
  private readonly fetchImpl: typeof fetch

  constructor(
    opts: { url: string; token: string; max: number; windowSeconds: number },
    fallback: RateLimiter,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.url = opts.url
    this.token = opts.token
    this.max = opts.max
    this.windowSeconds = opts.windowSeconds
    this.fallback = fallback
    this.fetchImpl = fetchImpl
  }

  async check(key: string): Promise<RateLimitResult> {
    const redisKey = `plateworth:rl:${key}`
    try {
      const res = await this.fetchImpl(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, String(this.windowSeconds), 'NX'],
          ['TTL', redisKey],
        ]),
        signal: AbortSignal.timeout(2_000),
      })
      if (!res.ok) throw new Error(`Upstash responded ${res.status}`)
      const [incr, , ttl] = (await res.json()) as Array<{ result?: number; error?: string }>
      const count = Number(incr?.result)
      if (!Number.isFinite(count)) throw new Error(incr?.error ?? 'Unexpected Upstash response')
      const ttlSeconds = Number(ttl?.result)
      if (count > this.max) {
        return { allowed: false, remaining: 0, retryAfter: ttlSeconds > 0 ? ttlSeconds : this.windowSeconds }
      }
      return { allowed: true, remaining: this.max - count, retryAfter: 0 }
    } catch (error) {
      console.warn('[rate-limit] Upstash unavailable, using in-memory limiter:', (error as Error).message)
      return this.fallback.check(key)
    }
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`plateworth:${value}`))
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}
