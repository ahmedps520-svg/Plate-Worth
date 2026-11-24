import { describe, expect, it, vi } from 'vitest'
import { clientIp, hashKey, MemoryRateLimiter, UpstashRateLimiter } from './rateLimit'

describe('MemoryRateLimiter', () => {
  it('allows up to max requests per sliding window', async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(2, 60, () => now)

    expect((await limiter.check('a')).allowed).toBe(true)
    expect(await limiter.check('a')).toMatchObject({ allowed: true, remaining: 0 })
    const blocked = await limiter.check('a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBe(60)

    now = 30_000
    expect((await limiter.check('a')).retryAfter).toBe(30)
    expect((await limiter.check('b')).allowed).toBe(true)

    now = 60_001
    expect((await limiter.check('a')).allowed).toBe(true)
  })
})

describe('UpstashRateLimiter', () => {
  it('uses the INCR count from Redis', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([{ result: 4 }, { result: 0 }, { result: 42 }]),
    ) as unknown as typeof fetch
    const limiter = new UpstashRateLimiter(
      { url: 'https://redis.example', token: 't', max: 3, windowSeconds: 60 },
      new MemoryRateLimiter(3, 60),
      fetchImpl,
    )
    expect(await limiter.check('k')).toEqual({ allowed: false, remaining: 0, retryAfter: 42 })
  })

  it('falls back to the in-memory limiter when Redis fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch
    const limiter = new UpstashRateLimiter(
      { url: 'https://redis.example', token: 't', max: 1, windowSeconds: 60 },
      new MemoryRateLimiter(1, 60),
      fetchImpl,
    )
    expect((await limiter.check('k')).allowed).toBe(true)
    expect((await limiter.check('k')).allowed).toBe(false)
  })
})

describe('helpers', () => {
  it('reads the first forwarded IP', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientIp(new Headers())).toBe('unknown')
  })

  it('hashes keys so raw IPs are never stored', async () => {
    const key = await hashKey('203.0.113.7')
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(key).toBe(await hashKey('203.0.113.7'))
    expect(key).not.toContain('203')
  })
})
