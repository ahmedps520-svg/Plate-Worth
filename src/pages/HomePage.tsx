import { Camera, ImageUp, WifiOff } from 'lucide-react'
import { useRef } from 'react'
import { PlateDisplay } from '../components/PlateDisplay'
import { ScanListItem } from '../components/ScanListItem'
import { Button } from '../components/ui'
import type { MessageKey } from '../lib/i18n'
import { navigate } from '../lib/router'
import { useScan } from '../lib/scan'
import { useSettings } from '../lib/settings'
import { useOnline } from '../lib/useOnline'
import { useScans } from '../lib/useScans'

const STEPS: MessageKey[] = ['home.step1', 'home.step2', 'home.step3']

export function HomePage() {
  const { t } = useSettings()
  const online = useOnline()
  const scans = useScans()
  const { startFromFile } = useScan()
  const fileRef = useRef<HTMLInputElement>(null)
  const recent = scans?.slice(0, 3) ?? []

  return (
    <div className="pb-6">
      <header className="flex items-center gap-3 pt-safe">
        <div className="flex min-h-16 items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-9 rounded-xl" />
          <span className="text-xl font-bold tracking-tight">{t('app.name')}</span>
        </div>
      </header>

      <section className="mt-4 animate-slide-up">
        <h1 className="text-[2rem] font-bold leading-tight tracking-tight">{t('home.title')}</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">{t('home.subtitle')}</p>
      </section>

      <div className="relative my-8 flex justify-center animate-pop" aria-hidden>
        <div className="absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-full bg-brand-500/25 blur-3xl" />
        <PlateDisplay size="md" arabic="ا ب ح" latin="J B A" digits="7777" className="relative -rotate-2" label="" />
      </div>

      {!online && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warn/10 p-4 text-sm ring-1 ring-warn/30" role="status">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-warn" />
          <p>{t('home.offline')}</p>
        </div>
      )}

      <div className="space-y-3">
        <Button
          size="lg"
          block
          disabled={!online}
          icon={<Camera className="size-6" />}
          className="min-h-16 text-xl"
          onClick={() => navigate({ name: 'scan' })}
        >
          {t('home.scan')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          block
          disabled={!online}
          icon={<ImageUp className="size-5" />}
          onClick={() => fileRef.current?.click()}
        >
          {t('home.upload')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            startFromFile(file)
            navigate({ name: 'scan' })
          }}
        />
      </div>

      {recent.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t('home.recent')}</h2>
            <Button size="sm" variant="ghost" onClick={() => navigate({ name: 'history' }, { replace: true })}>
              {t('home.seeAll')}
            </Button>
          </div>
          <ul className="space-y-3">
            {recent.map((record) => (
              <ScanListItem key={record.id} record={record} />
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-10 rounded-3xl bg-surface p-5 ring-1 ring-line animate-slide-up">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">{t('home.howTitle')}</h2>
          <ol className="space-y-4">
            {STEPS.map((key, i) => (
              <li key={key} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-600 dark:text-brand-300">
                  {i + 1}
                </span>
                <span className="text-base">{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
