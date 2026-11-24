import { AlertTriangle, Camera, Clock, KeyRound, ScanSearch, WifiOff, type LucideIcon } from 'lucide-react'
import type { MessageKey, Translate } from './i18n'
import type { ScanErrorInfo } from './scan'
import type { CameraErrorKind } from './useCamera'

export interface ErrorCopy {
  title: string
  body: string
  icon: LucideIcon
  /** Extra text from Anthropic (e.g. "Your credit balance is too low…"). */
  details?: string
}

const API_COPY: Partial<Record<ScanErrorInfo['code'], { title: MessageKey; body: MessageKey; icon: LucideIcon }>> = {
  missing_api_key: { title: 'error.missing_api_key.title', body: 'error.missing_api_key.body', icon: KeyRound },
  invalid_api_key: { title: 'error.invalid_api_key.title', body: 'error.invalid_api_key.body', icon: KeyRound },
  offline: { title: 'error.offline.title', body: 'error.offline.body', icon: WifiOff },
  network: { title: 'error.network.title', body: 'error.network.body', icon: WifiOff },
  rate_limited: { title: 'error.rate_limited.title', body: 'error.rate_limited.body', icon: Clock },
  upstream_busy: { title: 'error.upstream_busy.title', body: 'error.upstream_busy.body', icon: Clock },
  upstream_error: { title: 'error.upstream_error.title', body: 'error.upstream_error.body', icon: AlertTriangle },
  timeout: { title: 'error.timeout.title', body: 'error.timeout.body', icon: Clock },
  refused: { title: 'error.refused.title', body: 'error.refused.body', icon: ScanSearch },
  invalid_output: { title: 'error.invalid_output.title', body: 'error.invalid_output.body', icon: AlertTriangle },
  bad_request: { title: 'error.bad_request.title', body: 'error.bad_request.body', icon: AlertTriangle },
  unsupported_image: { title: 'error.unsupported_image.title', body: 'error.unsupported_image.body', icon: AlertTriangle },
}

/** Errors the user fixes in Settings (shows an "Open Settings" button). */
export function isKeyError(code: ScanErrorInfo['code']): boolean {
  return code === 'missing_api_key' || code === 'invalid_api_key'
}

function formatWait(seconds: number, t: Translate): string {
  return seconds >= 90 ? t('common.minutes', { n: Math.ceil(seconds / 60) }) : t('common.seconds', { n: seconds })
}

export function apiErrorCopy(error: ScanErrorInfo, t: Translate): ErrorCopy {
  const copy = API_COPY[error.code]
  if (!copy) return { title: t('error.generic.title'), body: t('error.generic.body'), icon: AlertTriangle }
  return {
    title: t(copy.title),
    body: t(copy.body, { time: formatWait(error.retryAfter ?? 60, t) }),
    icon: copy.icon,
    details: error.code === 'upstream_error' || error.code === 'invalid_api_key' ? error.details : undefined,
  }
}

export function cameraErrorCopy(kind: CameraErrorKind, t: Translate): ErrorCopy {
  return { title: t(`camera.${kind}.title`), body: t(`camera.${kind}.body`), icon: Camera }
}
