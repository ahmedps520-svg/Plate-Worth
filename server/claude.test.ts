import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import type { EstimateRequest } from '../shared/schema'
import { EstimateError, runEstimate, toEstimateError, type ClaudeClient } from './claude'
import { readConfig } from './config'

type Block = Record<string, unknown>
interface FakeMessage {
  content: Block[]
  stop_reason: string
  model?: string
}

/** Minimal stand-in for client.beta.messages.stream(): replays canned messages. */
function fakeClient(replies: FakeMessage[]) {
  const calls: Array<Record<string, unknown>> = []
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          calls.push(structuredClone(params))
          const reply = replies[calls.length - 1]
          if (!reply) throw new Error('unexpected extra request')
          const handlers: Record<string, Array<(arg: unknown) => void>> = {}
          return {
            on(event: string, cb: (arg: unknown) => void) {
              ;(handlers[event] ??= []).push(cb)
              return this
            },
            async finalMessage() {
              for (const block of reply.content) {
                handlers.streamEvent?.forEach((cb) => cb({ type: 'content_block_start', content_block: block }))
                handlers.contentBlock?.forEach((cb) => cb(block))
              }
              return { model: 'claude-sonnet-5-5', ...reply }
            },
          }
        },
      },
    },
  } as unknown as ClaudeClient
  return { client, calls }
}

const result = {
  plate: { arabic: 'ا ب ح', latin: 'J B A', digits: '7777', confidence: 'high' },
  vehicle: { make: 'Toyota', model: 'Camry', yearRange: '2020–2022', color: 'White', confidence: 'medium' },
  vehiclePriceSAR: { low: 80000, typical: 88000, high: 96000, basis: 'Syarah listings' },
  plateValueSAR: { low: 30000, typical: 45000, high: 70000, reasoning: 'Four repeated digits' },
  sources: [
    { title: 'Syarah', url: 'https://syarah.com/camry-2021' },
    { title: 'Made up', url: 'https://not-in-results.example/page' },
  ],
  notes: 'Rough estimate.',
}

const searchBlocks: Block[] = [
  { type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'كامري 2021 للبيع' } },
  {
    type: 'web_search_tool_result',
    tool_use_id: 'srv_1',
    content: [
      { type: 'web_search_result', url: 'https://www.syarah.com/camry-2021/', title: 'Syarah', encrypted_content: 'x', page_age: null },
      { type: 'web_search_result', url: 'https://haraj.com.sa/7777', title: 'Plate 7777', encrypted_content: 'y', page_age: null },
    ],
  },
]

const text = (value: string): Block => ({ type: 'text', text: value, citations: null })
const scanRequest = {
  type: 'scan',
  image: { mediaType: 'image/jpeg', data: 'abc' },
  locale: 'en',
} as EstimateRequest
const config = readConfig({ ANTHROPIC_API_KEY: 'k' })

describe('runEstimate', () => {
  it('returns a validated result, keeps only sources seen in search results, and reports progress', async () => {
    const { client, calls } = fakeClient([{ content: [...searchBlocks, text(JSON.stringify(result))], stop_reason: 'end_turn' }])
    const progress: string[] = []
    const outcome = await runEstimate(client, config, scanRequest, {
      onProgress: (stage, detail) => progress.push(detail ? `${stage}:${detail}` : stage),
    })

    expect(outcome.result.plate.digits).toBe('7777')
    expect(outcome.result.sources).toEqual([{ title: 'Syarah', url: 'https://syarah.com/camry-2021' }])
    expect(outcome.searches).toBe(1)
    expect(progress).toEqual(['reading', 'searching', 'searching:كامري 2021 للبيع', 'finalizing'])

    const params = calls[0]
    expect(params.model).toBe('claude-sonnet-5-5')
    expect(params.output_config).toEqual({ effort: 'medium' })
    expect(params.fallbacks).toBe('default')
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(params.tools).toEqual([
      expect.objectContaining({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
        user_location: expect.objectContaining({ type: 'approximate', country: 'SA' }),
      }),
    ])
  })

  it('omits fallbacks when disabled and honors the web search version setting', async () => {
    const { client, calls } = fakeClient([{ content: [text(JSON.stringify(result))], stop_reason: 'end_turn' }])
    const custom = readConfig({
      ANTHROPIC_API_KEY: 'k',
      CLAUDE_REFUSAL_FALLBACK: 'off',
      WEB_SEARCH_TOOL_VERSION: 'web_search_20260209',
      WEB_SEARCH_ALLOWED_DOMAINS: 'haraj.com.sa, syarah.com',
    })
    await runEstimate(client, custom, scanRequest)
    expect(calls[0].fallbacks).toBeUndefined()
    expect(calls[0].betas).toBeUndefined()
    expect(calls[0].tools).toEqual([
      expect.objectContaining({ type: 'web_search_20260209', allowed_domains: ['haraj.com.sa', 'syarah.com'] }),
    ])
  })

  it('falls back to search results when the model lists no verifiable sources', async () => {
    const reply = { ...result, sources: [] }
    const { client } = fakeClient([{ content: [...searchBlocks, text(JSON.stringify(reply))], stop_reason: 'end_turn' }])
    const outcome = await runEstimate(client, config, scanRequest)
    expect(outcome.result.sources.map((s) => s.url)).toEqual(['https://www.syarah.com/camry-2021/', 'https://haraj.com.sa/7777'])
  })

  it('resumes after pause_turn by sending the assistant turn back', async () => {
    const { client, calls } = fakeClient([
      { content: searchBlocks, stop_reason: 'pause_turn' },
      { content: [text(JSON.stringify(result))], stop_reason: 'end_turn' },
    ])
    const outcome = await runEstimate(client, config, scanRequest)
    expect(outcome.result.vehicle?.model).toBe('Camry')
    expect(calls).toHaveLength(2)
    const messages = calls[1].messages as Array<{ role: string }>
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('retries once with the validation problems when the JSON is invalid', async () => {
    const { client, calls } = fakeClient([
      { content: [text('Sure! The plate reads 7777.')], stop_reason: 'end_turn' },
      { content: [text(`\`\`\`json\n${JSON.stringify(result)}\n\`\`\``)], stop_reason: 'end_turn' },
    ])
    const outcome = await runEstimate(client, config, scanRequest)
    expect(outcome.result.plate.digits).toBe('7777')
    const messages = calls[1].messages as Array<{ role: string; content: unknown }>
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(String(messages[2].content)).toMatch(/ONLY the corrected JSON/)
  })

  it('gives up after the second invalid answer', async () => {
    const { client } = fakeClient([
      { content: [text('not json')], stop_reason: 'end_turn' },
      { content: [text('{"plate": "still wrong"}')], stop_reason: 'end_turn' },
    ])
    await expect(runEstimate(client, config, scanRequest)).rejects.toMatchObject({ code: 'invalid_output' })
  })

  it('surfaces refusals', async () => {
    const { client } = fakeClient([{ content: [], stop_reason: 'refusal' }])
    await expect(runEstimate(client, config, scanRequest)).rejects.toMatchObject({ code: 'refused' })
  })
})

describe('toEstimateError', () => {
  it('maps SDK errors to user-facing codes', () => {
    const rate = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers({ 'retry-after': '12' }))
    expect(toEstimateError(rate)).toMatchObject({ code: 'upstream_busy', retryAfter: 12 })

    const auth = new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers())
    expect(toEstimateError(auth).code).toBe('server_misconfigured')

    expect(toEstimateError(new Anthropic.APIUserAbortError(), true).code).toBe('timeout')
    expect(toEstimateError(new Error('boom')).code).toBe('internal')

    const own = new EstimateError('refused', 'no')
    expect(toEstimateError(own)).toBe(own)
  })
})
