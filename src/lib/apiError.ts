/**
 * Error + progress types shared by the UI and the (lazy-loaded) Claude client.
 * Kept free of SDK imports so the main bundle stays small; the Anthropic SDK
 * is only downloaded when a scan or key check actually runs.
 */
import type { ErrorCode, ProgressStage } from '../../shared/schema'

export type ClientErrorCode = ErrorCode

export class ApiError extends Error {
  readonly code: ClientErrorCode
  readonly retryAfter?: number
  /** Anthropic's own message (e.g. "Your credit balance is too low…"). */
  readonly details?: string

  constructor(code: ClientErrorCode, message: string, opts: { retryAfter?: number; details?: string } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.retryAfter = opts.retryAfter
    this.details = opts.details
  }
}

export interface ProgressUpdate {
  stage: ProgressStage
  detail?: string
}
