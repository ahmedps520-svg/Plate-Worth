/**
 * Serves POST /api/estimate from the Vite dev server (and `vite preview`) using
 * the exact same web-standard handler that runs on Vercel, so `npm run dev`
 * gives you the full app — camera, API and all — over HTTPS on your LAN
 * without installing the Vercel CLI.
 *
 * This file only runs inside Vite (Node). It never ships to the browser.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { TLSSocket } from 'node:tls'
import { createServer, type Plugin, type ViteDevServer } from 'vite'

type Env = Record<string, string | undefined>
type HandlerModule = {
  handleEstimate: (request: Request, env: Env) => Promise<Response>
}

const HANDLER_PATH = '/server/handler.ts'
const ROUTE = '/api/estimate'

export function devApi(env: Env): Plugin {
  return {
    name: 'plateworth-dev-api',
    configureServer(server) {
      const load = () => server.ssrLoadModule(HANDLER_PATH) as Promise<HandlerModule>
      server.middlewares.use(ROUTE, (req, res) => {
        void serve(load, env, req, res)
      })
    },
    configurePreviewServer(server) {
      // `vite preview` has no module loader, so spin up a tiny middleware-mode
      // Vite instance on first use purely to load the TypeScript handler.
      let loader: Promise<ViteDevServer> | undefined
      const load = async () => {
        loader ??= createServer({
          configFile: false,
          root: server.config.root,
          logLevel: 'error',
          appType: 'custom',
          server: { middlewareMode: true, hmr: false, ws: false },
        })
        const vite = await loader
        return (await vite.ssrLoadModule(HANDLER_PATH)) as HandlerModule
      }
      server.middlewares.use(ROUTE, (req, res) => {
        void serve(load, env, req, res)
      })
    },
  }
}

async function serve(
  load: () => Promise<HandlerModule>,
  env: Env,
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
): Promise<void> {
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  try {
    const { handleEstimate } = await load()
    const response = await handleEstimate(toWebRequest(req, controller.signal), env)
    await sendWebResponse(res, response)
  } catch (error) {
    if (controller.signal.aborted) return
    console.error('[plateworth dev api]', error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: { code: 'internal', message: 'Dev server error' } }))
    } else {
      res.end()
    }
  }
}

function toWebRequest(req: IncomingMessage & { originalUrl?: string }, signal: AbortSignal): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    // Skip HTTP/2 pseudo-headers (":authority", ":method", ...): Vite serves
    // HTTPS over HTTP/2 and these are not valid Fetch header names.
    if (value === undefined || key.startsWith(':')) continue
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else headers.set(key, value)
  }
  const authority = req.headers[':authority']
  const host = req.headers.host ?? (typeof authority === 'string' ? authority : 'localhost')
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress)
  }
  const protocol = (req.socket as TLSSocket).encrypted ? 'https' : 'http'
  const url = new URL(req.originalUrl ?? req.url ?? ROUTE, `${protocol}://${host}`)
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'

  return new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>) : undefined,
    signal,
    // Required by Node's fetch implementation when the body is a stream.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  } finally {
    res.end()
  }
}
