import { AlertTriangle, Camera, Clock, ScanSearch, WifiOff, type LucideIcon } from 'lucide-react'
import type { MessageKey, Translate } from './i18n'
import type { ScanErrorInfo } from './scan'
import type { CameraErrorKind } from './useCamera'

export interface ErrorCopy {
  title: string
  body: string
  icon: LucideIcon
}

const API_COPY: Record<string, { title: MessageKey; body: MessageKey; icon: LucideIcon }> = {
  offline: { title: 'error.offline.title', body: 'error.offline.body', icon: WifiOff },
  network: { title: 'error.network.title', body: 'error.network.body', icon: WifiOff },
  rate_limited: { title: 'error.rate_limited.title', body: 'error.rate_limited.body', icon: Clock },
  upstream_busy: { title: 'error.upstream_busy.title', body: 'error.upstream_busy.body', icon: Clock },
  quota_exceeded: { title: 'error.quota_exceeded.title', body: 'error.quota_exceeded.body', icon: Clock },
  forbidden_origin: { title: 'error.forbidden_origin.title', body: 'error.forbidden_origin.body', icon: AlertTriangle },
  timeout: { title: 'error.timeout.title', body: 'error.timeout.body', icon: Clock },
  refused: { title: 'error.refused.title', body: 'error.refused.body', icon: ScanSearch },
  invalid_output: { title: 'error.invalid_output.title', body: 'error.invalid_output.body', icon: AlertTriangle },
  payload_too_large: { title: 'error.payload_too_large.title', body: 'error.payload_too_large.body', icon: AlertTriangle },
  bad_request: { title: 'error.bad_request.title', body: 'error.bad_request.body', icon: AlertTriangle },
  unsupported_media_type: { title: 'error.bad_request.title', body: 'error.bad_request.body', icon: AlertTriangle },
  server_misconfigured: {
    title: 'error.server_misconfigured.title',
    body: 'error.server_misconfigured.body',
    icon: AlertTriangle,
  },
  unsupported_image: { title: 'error.unsupported_image.title', body: 'error.unsupported_image.body', icon: AlertTriangle },
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
  }
}

export function cameraErrorCopy(kind: CameraErrorKind, t: Translate): ErrorCopy {
  return { title: t(`camera.${kind}.title`), body: t(`camera.${kind}.body`), icon: Camera }
}
