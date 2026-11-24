import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import type { StreamEvent } from '../shared/schema'
import { EstimateError } from './claude'
import { handleEstimate, type EstimateFn } from './handler'
import { MemoryRateLimiter } from './rateLimit'

function jpegBase64(bytes = 256): string {
  const buf = Buffer.alloc(bytes)
  buf.set([0xff, 0xd8, 0xff, 0xe0])
  return buf.toString('base64')
}

const scanBody = { type: 'scan', image: { mediaType: 'image/jpeg', data: jpegBase64() } }
const env = { ANTHROPIC_API_KEY: 'test-key' }

const okResult = {
  plate: { arabic: 'ا ب ح', latin: 'J B A', digits: '1234', confidence: 'high' as const },
  vehicle: null,
  vehiclePriceSAR: null,
  plateValueSAR: null,
  sources: [],
  notes: '',
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://plateworth.test/api/estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function events(res: Response): Promise<StreamEvent[]> {
  const text = await res.text()
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as StreamEvent)
}

const deps = (estimate?: EstimateFn) => ({
  estimate: estimate ?? (async () => ({ result: okResult, model: 'claude-sonnet-5-5', searches: 0 })),
  limiter: new MemoryRateLimiter(100, 60),
  dailyLimiter: new MemoryRateLimiter(1000, 86_400),
})

describe('handleEstimate: request validation', () => {
  it('rejects non-POST methods with 405', async () => {
    const res = await handleEstimate(new Request('https://plateworth.test/api/estimate'), env, deps())
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toContain('POST')
  })

  it('answers OPTIONS preflight with 204', async () => {
    const res = await handleEstimate(new Request('https://plateworth.test/api/estimate', { method: 'OPTIONS' }), env, deps())
    expect(res.status).toBe(204)
  })

  it('requires JSON', async () => {
    const res = await handleEstimate(post('hello', { 'content-type': 'text/plain' }), env, deps())
    expect(res.status).toBe(415)
  })

  it('rejects malformed JSON', async () => {
    const res = await handleEstimate(post('{"type":'), env, deps())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('bad_request')
  })

  it('rejects bodies that do not match the schema, with details', async () => {
    const res = await handleEstimate(post({ type: 'scan', image: { mediaType: 'image/jpeg' } }), env, deps())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('bad_request')
    expect(body.error.details).toMatch(/image/)
  })

  it('rejects images whose bytes do not match the declared type', async () => {
    const res = await handleEstimate(post({ ...scanBody, image: { mediaType: 'image/png', data: jpegBase64() } }), env, deps())
    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toMatch(/image\/png/)
  })

  it('rejects oversized images with 413', async () => {
    const big = { type: 'scan', image: { mediaType: 'image/jpeg', data: jpegBase64(100 * 1024) } }
    const res = await handleEstimate(post(big), { ...env, MAX_IMAGE_BYTES: String(64 * 1024) }, deps())
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe('payload_too_large')
  })

  it('reports a missing API key as a server configuration error', async () => {
    const res = await handleEstimate(post(scanBody), {}, { limiter: new MemoryRateLimiter(5, 60), dailyLimiter: new MemoryRateLimiter(5, 60) })
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('server_misconfigured')
  })

  it('enforces ALLOWED_ORIGINS when configured', async () => {
    const restricted = { ...env, ALLOWED_ORIGINS: 'https://plateworth.app' }
    const blocked = await handleEstimate(post(scanBody, { origin: 'https://evil.example' }), restricted, deps())
    expect(blocked.status).toBe(403)
    const allowed = await handleEstimate(post(scanBody, { origin: 'https://plateworth.app' }), restricted, deps())
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://plateworth.app')
  })
})

describe('handleEstimate: rate limiting', () => {
  it('returns 429 with Retry-After once the per-IP limit is reached', async () => {
    const shared = { ...deps(), limiter: new MemoryRateLimiter(1, 60) }
    const first = await handleEstimate(post(scanBody), env, shared)
    expect(first.status).toBe(200)
    await first.text()

    const second = await handleEstimate(post(scanBody), env, shared)
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await second.json()).error.code).toBe('rate_limited')

    const otherIp = await handleEstimate(post(scanBody, { 'x-forwarded-for': '198.51.100.1' }), env, shared)
    expect(otherIp.status).toBe(200)
  })

  it('uses the platform-provided client IP when given (ForgeBase ctx.client_ip)', async () => {
    const shared = { ...deps(), limiter: new MemoryRateLimiter(1, 60) }
    const a = await handleEstimate(post(scanBody, { 'x-forwarded-for': '1.1.1.1' }), env, { ...shared, clientIp: '198.51.100.5' })
    expect(a.status).toBe(200)
    await a.text()
    // Same real client, different spoofed header: still limited.
    const b = await handleEstimate(post(scanBody, { 'x-forwarded-for': '2.2.2.2' }), env, { ...shared, clientIp: '198.51.100.5' })
    expect(b.status).toBe(429)
  })

  it('enforces the global daily cap with quota_exceeded', async () => {
    const shared = { ...deps(), dailyLimiter: new MemoryRateLimiter(1, 86_400) }
    const first = await handleEstimate(post(scanBody), env, shared)
    expect(first.status).toBe(200)
    await first.text()
    const second = await handleEstimate(post(scanBody, { 'x-forwarded-for': '198.51.100.77' }), env, shared)
    expect(second.status).toBe(429)
    expect((await second.json()).error.code).toBe('quota_exceeded')
  })

  it('skips the daily cap when DAILY_SCAN_LIMIT is 0', async () => {
    const shared = { ...deps(), dailyLimiter: new MemoryRateLimiter(1, 86_400) }
    for (let i = 0; i < 3; i++) {
      const res = await handleEstimate(post(scanBody), { ...env, DAILY_SCAN_LIMIT: '0' }, shared)
      expect(res.status).toBe(200)
      await res.text()
    }
  })
})

describe('handleEstimate: streaming', () => {
  it('streams progress events then the result as NDJSON', async () => {
    const estimate = vi.fn<EstimateFn>(async (_config, request, opts) => {
      expect(request.type).toBe('scan')
      expect(request.locale).toBe('en')
      opts.onProgress?.('reading')
      opts.onProgress?.('searching', 'كامري 2020 حراج')
      return { result: okResult, model: 'claude-sonnet-5-5', searches: 1 }
    })
    const res = await handleEstimate(post(scanBody), env, deps(estimate))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')

    const list = await events(res)
    expect(list[0]).toEqual({ type: 'progress', stage: 'reading' })
    expect(list[1]).toEqual({ type: 'progress', stage: 'searching', detail: 'كامري 2020 حراج' })
    const last = list.at(-1)
    expect(last?.type).toBe('result')
    if (last?.type === 'result') {
      expect(last.result.plate.digits).toBe('1234')
      expect(last.meta.searches).toBe(1)
    }
    expect(estimate).toHaveBeenCalledOnce()
  })

  it('turns failures into a final error event', async () => {
    const res = await handleEstimate(
      post(scanBody),
      env,
      deps(async () => {
        throw new EstimateError('invalid_output', 'bad format')
      }),
    )
    const list = await events(res)
    expect(list.at(-1)).toEqual({ type: 'error', code: 'invalid_output', message: 'bad format' })
  })

  it('accepts re-estimate requests without an image', async () => {
    const estimate = vi.fn<EstimateFn>(async () => ({ result: okResult, model: 'm', searches: 2 }))
    const res = await handleEstimate(
      post({
        type: 'reestimate',
        locale: 'ar',
        plate: okResult.plate,
        vehicle: { make: 'Toyota', model: 'Camry', yearRange: '2020' },
      }),
      env,
      deps(estimate),
    )
    expect(res.status).toBe(200)
    await res.text()
    const request = estimate.mock.calls[0][1]
    expect(request.type === 'reestimate' && request.vehicle.color).toBe('')
    expect(request.locale).toBe('ar')
  })
})
