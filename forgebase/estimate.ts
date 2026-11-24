/**
 * ForgeBase edge function "estimate":
 *   POST https://api.forgebase.art/p/<project-ref>/functions/v1/estimate
 *
 * ForgeBase runs `export default async function handler(req, ctx)` on Node.
 * ctx.env holds the project's Env & secrets (ANTHROPIC_API_KEY, …) plus
 * FORGEBASE_URL / FORGEBASE_SERVICE_ROLE_KEY, which the rate limiter uses to
 * count requests in the project database. CORS is enforced by the ForgeBase
 * gateway from the project's API settings, so the handler adds none.
 *
 * `npm run build:function` bundles this file and its dependencies into
 * forgebase/dist/index.js, the single file that gets deployed.
 */
import { handleEstimate } from '../server/handler.js'

export interface ForgeBaseContext {
  env?: Record<string, string | undefined>
  /** Client IP as seen by ForgeBase's gateway (behind Cloudflare). */
  client_ip?: string
  /** Aborted when the function times out or the caller disconnects. */
  signal?: AbortSignal
}

export default async function handler(req: Request, ctx: ForgeBaseContext = {}): Promise<Response> {
  return handleEstimate(req, ctx.env ?? {}, { clientIp: ctx.client_ip, signal: ctx.signal })
}
