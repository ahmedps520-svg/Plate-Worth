import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, checkApiKey, requestEstimate } from './api'
import type { ClaudeClient } from './claude/estimate'

const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/'
const scan = { type: 'scan' as const, image: { mediaType: 'image/jpeg' as const, data: jpeg } }

const reply = {
  plate: { arabic: 'ا ب ح', latin: 'J B A', digits: '1234', confidence: 'high' },
  vehicle: null,
  vehiclePriceSAR: null,
  plateValueSAR: null,
  sources: [],
  notes: '',
}

/** Fake client that answers once with the given content and records params. */
function fakeClient(content: unknown[], stop_reason = 'end_turn') {
  const params: Array<Record<string, unknown>> = []
  const client = {
    beta: {
      messages: {
        stream(p: Record<string, unknown>) {
          params.push(p)
          return {
            on() {
              return this
            },
            finalMessage: async () => ({ model: 'claude-sonnet-5-5', content, stop_reason }),
          }
        },
      },
    },
  } as unknown as ClaudeClient
  return { client, params }
}

describe('requestEstimate', () => {
  it('requires an API key before doing anything', async () => {
    const createClient = vi.fn()
    await expect(requestEstimate(scan, { apiKey: '  ', createClient })).rejects.toMatchObject({ code: 'missing_api_key' })
    await expect(requestEstimate(scan, { apiKey: null, createClient })).rejects.toBeInstanceOf(ApiError)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects invalid requests locally', async () => {
    await expect(
      requestEstimate({ ...scan, image: { mediaType: 'image/jpeg', data: 'data:image/jpeg;base64,xx' } }, { apiKey: 'sk-ant-x' }),
    ).rejects.toMatchObject({ code: 'bad_request' })
  })

  it('calls Claude with the user key and returns a validated result with meta', async () => {
    const { client, params } = fakeClient([{ type: 'text', text: JSON.stringify(reply), citations: null }])
    const createClient = vi.fn(() => client)
    const progress: string[] = []
    const res = await requestEstimate(scan, {
      apiKey: ' sk-ant-test ',
      createClient,
      onProgress: ({ stage }) => progress.push(stage),
    })
    expect(createClient).toHaveBeenCalledWith('sk-ant-test', expect.any(Number))
    expect(res.result.plate.digits).toBe('1234')
    expect(res.meta).toMatchObject({ model: 'claude-sonnet-5-5', searches: 0 })
    expect(progress[0]).toBe('reading')
    expect(params[0].model).toBe('claude-sonnet-5-5')
  })

  it('turns SDK errors into friendly codes', async () => {
    const client = {
      beta: {
        messages: {
          stream() {
            throw new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers())
          },
        },
      },
    } as unknown as ClaudeClient
    await expect(requestEstimate(scan, { apiKey: 'sk-ant-bad', createClient: () => client })).rejects.toMatchObject({
      code: 'invalid_api_key',
    })
  })

  it('reports a user cancel as aborted', async () => {
    const controller = new AbortController()
    const client = {
      beta: {
        messages: {
          stream() {
            controller.abort()
            throw new Anthropic.APIUserAbortError()
          },
        },
      },
    } as unknown as ClaudeClient
    await expect(
      requestEstimate(scan, { apiKey: 'sk-ant-x', signal: controller.signal, createClient: () => client }),
    ).rejects.toMatchObject({ code: 'aborted' })
  })
})

describe('checkApiKey', () => {
  it('reports valid, invalid and failing keys', async () => {
    const ok = { models: { retrieve: async () => ({}) } } as unknown as Pick<Anthropic, 'models'>
    expect((await checkApiKey('k', ok)).status).toBe('valid')

    const bad = {
      models: {
        retrieve: async () => {
          throw new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers())
        },
      },
    } as unknown as Pick<Anthropic, 'models'>
    expect((await checkApiKey('k', bad)).status).toBe('invalid')

    const down = {
      models: {
        retrieve: async () => {
          throw new Anthropic.InternalServerError(500, undefined, 'oops', new Headers())
        },
      },
    } as unknown as Pick<Anthropic, 'models'>
    expect((await checkApiKey('k', down)).status).toBe('error')
  })
})
