import { Bot, Database, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { MessageKey } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { Segmented } from './Segmented'
import { Button } from './ui'

const POINTS: Array<{ icon: LucideIcon; key: MessageKey }> = [
  { icon: Bot, key: 'firstRun.ai' },
  { icon: TrendingUp, key: 'firstRun.estimates' },
  { icon: ShieldCheck, key: 'firstRun.owners' },
  { icon: Database, key: 'firstRun.local' },
]

/** One-time notice: images go to an AI service; results are not appraisals. */
export function FirstRunNotice() {
  const { t, locale, update, acknowledgeFirstRun } = useSettings()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="first-run-title"
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[min(92vw,28rem)] rounded-3xl bg-surface p-0 text-ink shadow-2xl ring-1 ring-line backdrop:bg-black/60 backdrop:backdrop-blur-sm animate-pop"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6">
        <div className="mb-5">
          <Segmented
            label={t('settings.language')}
            value={locale}
            onChange={(value) => update({ locale: value })}
            options={[
              { value: 'en', label: 'English', lang: 'en' },
              { value: 'ar', label: 'العربية', lang: 'ar' },
            ]}
          />
        </div>
        <h2 id="first-run-title" className="text-2xl font-bold">
          {t('firstRun.title')}
        </h2>
        <ul className="mt-5 space-y-4">
          {POINTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-500">
                <Icon className="size-5" />
              </span>
              <p className="text-base leading-relaxed">{t(key)}</p>
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          block
          className="mt-7"
          onClick={() => {
            dialogRef.current?.close()
            acknowledgeFirstRun()
          }}
        >
          {t('firstRun.accept')}
        </Button>
      </div>
    </dialog>
  )
}
