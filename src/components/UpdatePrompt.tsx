import { RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useSettings } from '../lib/settings'
import { useToast } from './Toast'
import { Button } from './ui'

/** Registers the service worker and offers a reload when a new version is ready. */
export function UpdatePrompt() {
  const { t } = useSettings()
  const toast = useToast()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates hourly while the app stays open.
      if (registration) setInterval(() => void registration.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    if (offlineReady) {
      toast(t('pwa.offlineReady'))
      setOfflineReady(false)
    }
  }, [offlineReady, setOfflineReady, t, toast])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-line animate-slide-up"
    >
      <RefreshCw className="ms-1 size-5 shrink-0 text-brand-500" />
      <p className="flex-1 text-sm font-medium">{t('pwa.update')}</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('pwa.dismiss')}
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        {t('pwa.reload')}
      </Button>
    </div>
  )
}
