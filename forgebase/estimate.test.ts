import { describe, expect, it } from 'vitest'
import handler from './estimate'

describe('ForgeBase entry', () => {
  it('reads configuration from ctx.env and answers like the shared handler', async () => {
    const req = new Request('http://api.forgebase.test/estimate', { method: 'GET' })
    const res = await handler(req, { env: {} })
    expect(res.status).toBe(405)
  })

  it('reports a missing ANTHROPIC_API_KEY secret clearly', async () => {
    const req = new Request('http://api.forgebase.test/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const res = await handler(req, { env: {}, client_ip: '198.51.100.1' })
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('server_misconfigured')
  })
})
