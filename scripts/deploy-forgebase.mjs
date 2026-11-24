#!/usr/bin/env node
/**
 * Deploys forgebase/dist/index.js as the ForgeBase edge function "estimate"
 * through ForgeBase's MCP API. Run it via:
 *
 *   FORGEBASE_MCP_TOKEN=fbmcp_… npm run deploy:function
 *
 * Create the token in ForgeBase Studio → Settings → AI assistants (level
 * "write"). Optional: FORGEBASE_PROJECT (ref or name, default "PlateWorth"),
 * FORGEBASE_MCP_URL (default https://forgebase.art/mcp).
 */
import { readFile } from 'node:fs/promises'

const MCP_URL = process.env.FORGEBASE_MCP_URL ?? 'https://forgebase.art/mcp'
const TOKEN = process.env.FORGEBASE_MCP_TOKEN
const PROJECT = process.env.FORGEBASE_PROJECT ?? 'PlateWorth'
const NAME = 'estimate'
const TIMEOUT_MS = 120_000 // ForgeBase maximum; the handler's own deadline is 110 s

if (!TOKEN) {
  console.error('Set FORGEBASE_MCP_TOKEN (ForgeBase Studio → Settings → AI assistants → New token).')
  process.exit(1)
}

let sessionId
let nextId = 1

async function rpc(method, params, { notify = false } = {}) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${TOKEN}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: nextId++, method, params }),
  })
  sessionId ??= res.headers.get('mcp-session-id') ?? undefined
  const text = await res.text()
  if (notify) return undefined
  const json = text.startsWith('event:') || text.startsWith('data:')
    ? JSON.parse(text.split('\n').filter((l) => l.startsWith('data:')).at(-1).slice(5))
    : JSON.parse(text)
  if (json.error) throw new Error(`${method}: ${json.error.message}`)
  return json.result
}

async function tool(name, args) {
  const result = await rpc('tools/call', { name, arguments: { project: PROJECT, ...args } })
  const text = result.content?.map((c) => c.text ?? '').join('\n') ?? ''
  if (result.isError) throw new Error(`${name}: ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const code = await readFile(new URL('../forgebase/dist/index.js', import.meta.url), 'utf8')

await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'plateworth-deploy', version: '1.0.0' },
})
await rpc('notifications/initialized', {}, { notify: true })

const { functions } = await tool('list_edge_functions', {})
if (!functions.some((f) => f.name === NAME)) {
  console.log(`Creating function "${NAME}"…`)
  await tool('create_edge_function', { name: NAME, template: 'hello', language: 'js', verify_jwt: true, deploy: false })
}

console.log(`Uploading ${(code.length / 1024).toFixed(0)} KB…`)
await tool('update_edge_function_files', { name: NAME, files: [{ path: 'index.js', content: code }] })
const deployed = await tool('deploy_edge_function', { name: NAME })
const project = await tool('get_project', {})
await tool('call_admin_api', {
  method: 'PATCH',
  path: `/projects/${project.project.ref}/functions/${NAME}`,
  body: { timeout_ms: TIMEOUT_MS, description: 'PlateWorth: reads a Saudi plate photo and estimates values with Claude + web search' },
})

console.log(`Deployed "${NAME}" version ${deployed.version ?? deployed.function?.version}.`)
console.log(`URL: ${project.connection.api_url}/functions/v1/${NAME}`)
