/**
 * Vercel Function: POST /api/estimate
 *
 * Thin wrapper around the shared web-standard handler. The Anthropic API key
 * is read from process.env on the server only and never reaches the client.
 * Max duration and memory are set in vercel.json.
 */
import { handleEstimate } from '../server/handler.js'

export const config = {
  supportsResponseStreaming: true,
}

export function POST(request: Request): Promise<Response> {
  return handleEstimate(request, process.env)
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleEstimate(request, process.env)
}

export function GET(request: Request): Promise<Response> {
  return handleEstimate(request, process.env)
}
