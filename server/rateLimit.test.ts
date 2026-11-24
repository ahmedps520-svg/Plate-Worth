import { describe, expect, it, vi } from 'vitest'
import { clientIp, ForgeBaseRateLimiter, hashKey, MemoryRateLimiter, parseCount } from './rateLimit'

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

describe('ForgeBaseRateLimiter', () => {
  const opts = { url: 'https://api.forgebase.test/p/ref', serviceKey: 'service', max: 3, windowSeconds: 600, scope: 'ip' }

  it('counts in the database through the RPC and blocks above max', async () => {
    const fetchImpl = vi.fn(async (..._args: Parameters<typeof fetch>) => Response.json(4))
    const limiter = new ForgeBaseRateLimiter(opts, new MemoryRateLimiter(3, 600), {
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => (1_000_200 + 250) * 1000, // 250 s into the 600 s window starting at 1_000_200
    })
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // skip the occasional cleanup call

    expect(await limiter.check('abc')).toEqual({ allowed: false, remaining: 0, retryAfter: 350 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.forgebase.test/p/ref/rest/v1/rpc/plateworth_rate_hit')
    expect(new Headers(init?.headers).get('apikey')).toBe('service')
    expect(JSON.parse(String(init?.body))).toEqual({ key: 'ip:abc', window_start: 1_000_200 })
  })

  it('allows while under the limit', async () => {
    const limiter = new ForgeBaseRateLimiter(opts, new MemoryRateLimiter(3, 600), {
      fetch: (async () => Response.json([{ count: 1 }])) as unknown as typeof fetch,
    })
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(await limiter.check('abc')).toEqual({ allowed: true, remaining: 2, retryAfter: 0 })
  })

  it('falls back to the in-memory limiter when the database fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const limiter = new ForgeBaseRateLimiter({ ...opts, max: 1 }, new MemoryRateLimiter(1, 600), {
      fetch: (async () => new Response('down', { status: 503 })) as unknown as typeof fetch,
    })
    expect((await limiter.check('k')).allowed).toBe(true)
    expect((await limiter.check('k')).allowed).toBe(false)
  })

  it('reads counts in every reply shape', () => {
    expect(parseCount(3)).toBe(3)
    expect(parseCount([3])).toBe(3)
    expect(parseCount({ count: 3 })).toBe(3)
    expect(parseCount([{ count: '3' }])).toBe(3)
    expect(() => parseCount({})).toThrow()
  })
})

describe('helpers', () => {
  it('prefers the Cloudflare client IP over spoofable forwarded headers', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '1.1.1.1, 198.51.100.9' }))).toBe(
      '198.51.100.9',
    )
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
